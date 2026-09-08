import fs from "fs";
import path from "path";
import http from "http";
import puppeteer from "puppeteer";
import readline from "readline";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

dotenv.config();

function createPrompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("What would you like to do? [1/2/3]: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function askUser(questionText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(questionText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function displayCoverLetterPreview(htmlContent, companyName) {
  const lines = htmlContent
    .split("<br>")
    .map((line) => line.trim())
    .filter(Boolean);
  console.log("\n--- Cover Letter Preview ---");
  if (companyName && companyName !== "Company") {
    console.log(`To: ${companyName}\n`);
  }
  for (const line of lines) {
    const cleanLine = line.replace(/<\/?p>/gi, "").trim();
    if (cleanLine) {
      console.log(cleanLine);
    }
  }
  console.log("---------------------------\n");
}

function saveDraft(htmlContent, companyName, lang, nonDev = false) {
  const date = new Date().toISOString().split("T")[0];
  const companySlug = companyName
    ? companyName
        .replace(/[^a-zA-Z0-9 ]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .substring(0, 30)
    : "";
  const slugPart = companySlug ? `-${companySlug}` : "";
  const nonDevPart = nonDev ? "-nondev" : "";
  const draftPath = path.join(process.cwd(), "exports", `draft-cover-letter-${date}-${lang}${slugPart}${nonDevPart}.html`);
  fs.writeFileSync(draftPath, htmlContent, "utf8");
  console.log(`Draft saved to: ${draftPath}`);
}

function getSampleContent(lang, name, companyName, nonDev = false) {
  const company = companyName || (lang === "sv" ? "[Företagsnamn]" : "[Company Name]");
  if (nonDev) {
    if (lang === "sv") {
      return `<p>Hej!</p>
<p>Med stort intresse ansöker jag härmed till tjänsten hos ${company}. Med mitt starka driv, min serviceinriktade inställning och praktiska problemlösningsförmåga är jag mycket intresserad av att bli en del av ert team.</p>
<p>Genom mina tidigare erfarenheter har jag utvecklat god samarbetsförmåga, ett noggrant arbetssätt och vana vid att arbeta strukturerat och ta eget ansvar. Jag trivs med nya utmaningar och sätter mig snabbt in i nya uppgifter och system.</p>
<p>Tack för att ni tar er tid att läsa min ansökan. Jag ser fram emot möjligheten att berätta mer om mig själv och hur jag kan bidra till er verksamhet.</p>
<p>Med vänliga hälsningar,<br>${name}</p>`;
    }

    return `<p>Dear Hiring Team,</p>
<p>I am writing to express my interest in the position at ${company}. With my service-minded approach, strong work ethic, and practical problem-solving experience, I am excited about the opportunity to contribute to your team.</p>
<p>Through my previous experiences, I have developed strong communication skills, an eye for detail, and the ability to thrive both independently and in collaborative environments. I enjoy taking on new challenges and quickly adapting to new systems and tools.</p>
<p>Thank you for considering my application. I look forward to the possibility of discussing how my skills and experiences align with your needs.</p>
<p>Sincerely,<br>${name}</p>`;
  }

  if (lang === "sv") {
    return `<p>Hej!</p>
<p>Med stort intresse ansöker jag härmed till tjänsten hos ${company}. Med min bakgrund inom webbutveckling och erfarenhet av moderna teknologier är jag mycket intresserad av att bli en del av ert team.</p>
<p>Under mina tidigare projekt och erfarenheter har jag utvecklat goda kunskaper inom både frontend och backend, och jag trivs med att lösa komplexa problem och bygga användarvänliga lösningar.</p>
<p>Som person är jag engagerad, noggrann och trivs bra med att samarbeta i team såväl som att arbeta självständigt. Jag ser fram emot möjligheten att diskutera hur mina erfarenheter och kompetenser kan bidra till er verksamhet.</p>
<p>Med vänliga hälsningar,<br>${name}</p>`;
  }

  return `<p>Dear Hiring Team,</p>
<p>I am writing to express my interest in the position at ${company}. With my background in web development and experience working with modern technologies, I am excited about the opportunity to contribute to your team.</p>
<p>Through my previous projects and internships, I have developed strong skills across both frontend and backend development. I am passionate about creating efficient, user-friendly solutions and thrive in collaborative environments.</p>
<p>Thank you for considering my application. I look forward to the possibility of discussing how my skills and experiences align with your needs.</p>
<p>Sincerely,<br>${name}</p>`;
}

async function openInBrowser(htmlContent, timeoutMs = 0) {
  return new Promise((resolve, reject) => {
    const tempHtmlPath = path.join(process.cwd(), "docs", "temp_cover_letter.html");
    fs.writeFileSync(tempHtmlPath, htmlContent, "utf8");

    let serverClosed = false;
    let savedContent = null;
    let timeoutTimer = null;

    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/save") {
        let body = "";
        for await (const chunk of req) body += chunk;
        try {
          const data = JSON.parse(body);
          savedContent = data.html;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          console.log("Edited content saved to disk.");

          if (!serverClosed) {
            serverClosed = true;
            if (timeoutTimer) clearTimeout(timeoutTimer);
            setTimeout(() => {
              server.close();
              resolve(savedContent);
            }, 500);
          }
        } catch (e) {
          if (!res.headersSent) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        }
      } else if (req.url === "/" || req.url === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(htmlContent);
      } else {
        const cleanUrl = req.url.split("?")[0].replace(/^\/+/, "");
        const filePath = path.join(process.cwd(), "docs", cleanUrl);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes = {
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".woff2": "font/woff2",
            ".woff": "font/woff",
            ".ttf": "font/ttf",
            ".otf": "font/otf",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".jpg": "image/jpeg",
          };
          res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
          fs.createReadStream(filePath).pipe(res);
        } else if (!res.headersSent) {
          res.writeHead(404);
          res.end("Not found");
        }
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const url = `http://127.0.0.1:${port}`;
      console.log(`\nOpening cover letter in browser (${url})... Click Save when done.`);

      const crossPlatformOpen =
        process.platform === "win32" ? `start ""` : process.platform === "darwin" ? "open" : "xdg-open";
      execAsync(`${crossPlatformOpen} "${url}"`).catch(() => {});
    });

    server.on("error", (err) => {
      if (!serverClosed) {
        serverClosed = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        reject(err);
      }
    });

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        if (!serverClosed) {
          serverClosed = true;
          console.log("\nTimeout waiting for save. Using original content.");
          server.close();
          resolve(null);
        }
      }, timeoutMs);
    }
  });
}

function buildEditableHtml(templatePath, headerHtml, content, themeConfig = null) {
  let templateHtml = fs.readFileSync(templatePath, "utf8");

  if (themeConfig) {
    const vars = Object.entries(themeConfig)
      .map(([k, v]) => `        ${k}: ${v};`)
      .join("\n");
    const bodyBg = themeConfig["--color-page-background"]
      ? `\n        body { background-color: ${themeConfig["--color-page-background"]}; }`
      : "";
    const themeStyle = `\n    <style>\n      :root {\n${vars}\n      }${bodyBg}\n    </style>`;
    templateHtml = templateHtml.replace("</head>", `${themeStyle}\n</head>`);
  }

  const saveScript = `
    <script>
      document.addEventListener("DOMContentLoaded", () => {
        const btn = document.createElement("button");
        Object.assign(btn.style, {
          position: "fixed", top: "16px", right: "16px", zIndex: "9999",
          padding: "10px 20px", background: "#4F46E5", color: "#fff", border: "none",
          borderRadius: "8px", fontSize: "14px", fontWeight: "bold", cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)", transition: "background 0.2s"
        });
        btn.textContent = "Save";
        btn.onmouseover = () => btn.style.background = "#4338CA";
        btn.onmouseout = () => btn.style.background = "#4F46E5";

        const msg = document.createElement("div");
        Object.assign(msg.style, {
          position: "fixed", top: "16px", right: "90px", zIndex: "9999",
          padding: "8px 16px", background: "#10B981", color: "#fff", borderRadius: "8px",
          fontSize: "13px", fontWeight: "bold", opacity: "0", transition: "opacity 0.3s"
        });
        msg.textContent = "Saved! Generating PDF...";

        const counter = document.createElement("div");
        Object.assign(counter.style, {
          position: "fixed", top: "16px", right: "240px", zIndex: "9999",
          padding: "8px 16px", background: "#f3f4f6", color: "#374151", borderRadius: "8px",
          fontSize: "13px", fontWeight: "bold", fontFamily: "monospace"
        });

        const warning = document.createElement("div");
        Object.assign(warning.style, {
          position: "fixed", top: "46px", right: "240px", zIndex: "9999",
          padding: "6px 14px", background: "#FEE2E2", color: "#DC2626", borderRadius: "8px",
          fontSize: "12px", fontWeight: "bold", opacity: "0", transition: "opacity 0.3s"
        });
        warning.textContent = "May exceed one page";

        const THRESHOLD = 1350;

        function updateCount() {
          const contentDiv = document.querySelector("[contenteditable]");
          if (!contentDiv) return;
          const text = contentDiv.innerText || "";
          const len = text.length;
          counter.textContent = len + " / " + THRESHOLD + " chars";

          if (len > THRESHOLD) {
            warning.style.opacity = "1";
            counter.style.background = "#FEE2E2";
            counter.style.color = "#DC2626";
          } else {
            warning.style.opacity = "0";
            counter.style.background = "#f3f4f6";
            counter.style.color = "#374151";
          }
        }

        document.addEventListener("input", updateCount);
        document.addEventListener("paste", () => setTimeout(updateCount, 0));
        setTimeout(updateCount, 100);

        btn.onclick = async () => {
          const contentDiv = document.querySelector("[contenteditable]");
          if (!contentDiv) return;
          btn.disabled = true;
          btn.textContent = "Saving...";
          try {
            const res = await fetch("/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ html: contentDiv.innerHTML })
            });
            const result = await res.json();
            if (result.ok) {
              msg.style.opacity = "1";
            } else {
              btn.disabled = false;
              btn.textContent = "Save";
              alert("Save failed: " + result.error);
            }
          } catch (e) {
            btn.disabled = false;
            btn.textContent = "Save";
            alert("Save failed: " + e.message);
          }
        };

        document.body.prepend(btn, msg, counter, warning);
      });
    <\/script>`;

  const finalHtml = templateHtml.replace(
    "<!-- Content will be injected here by the script -->",
    `${headerHtml}<div class="text-gray-700 leading-relaxed space-y-4" contenteditable="true">${content}</div>${saveScript}`,
  );
  return finalHtml;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGeminiModel() {
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    console.error("Error: GEMINI_API_KEY environment variable not found. Please add it to your .env file.");
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Cover Letter Generator

Usage:
  Default (skips AI, opens browser with sample text for editing):
    npm run export:cover-letter [options]

  AI Generation (generates cover letter with Gemini):
    npm run export:cover-letter:ai -- --prompt="Job description..." [options]
    npm run export:cover-letter -- --ai --prompt="Job description..." [options]

Options:
  --lang=<en|sv>        Language to use (default: en)
  --company=<name>      Target company name
  --theme=<name>        Theme: default, warm, cold, dark (default: default)
  --output=<path>       Custom output file path for the PDF
  --prompt=<text>       Job description or instructions (triggers AI mode)
  --url=<url>           URL to scrape job description from (triggers AI mode)
  --ai                  Explicitly enable AI generation mode
  --no-ai / --skip-ai   Force skip AI generation even if prompt is given
  --no-browser          Skip opening browser (generates PDF directly)
  --skip-review         Skip CLI review prompt in AI mode and generate PDF directly
  --non-dev / --nondev  Non-dev mode: uses data-nondev.json and removes GitHub link from header
`);
    process.exit(0);
  }

  const getArgValue = (flag) => {
    const index = args.findIndex((arg) => arg === flag);
    if (index !== -1 && args[index + 1] && !args[index + 1].startsWith("--")) {
      return args[index + 1];
    }
    const startsWithArg = args.find((arg) => arg.startsWith(`${flag}=`));
    if (startsWithArg) return startsWithArg.slice(flag.length + 1);
    return null;
  };

  const promptValue = getArgValue("--prompt");
  const urlValue = getArgValue("--url");
  const langValue = getArgValue("--lang");
  const themeValue = getArgValue("--theme");
  const outputValue = getArgValue("--output");
  const companyValue = getArgValue("--company");

  const nonDev = args.includes("--non-dev") || args.includes("--nondev");
  const jsonPath = nonDev ? "data-nondev.json" : "data.json";

  const explicitAi = args.includes("--ai");
  const explicitNoAi = args.includes("--no-ai") || args.includes("--skip-ai");
  const hasPromptOrUrl = Boolean(promptValue || urlValue);
  const useAi = !explicitNoAi && (explicitAi || hasPromptOrUrl);

  // Read Data
  const dataPath = path.join(process.cwd(), "docs", jsonPath);
  if (!fs.existsSync(dataPath)) {
    console.error(`Error: docs/${jsonPath} not found.`);
    process.exit(1);
  }
  const resumeData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const availableLanguages = Object.keys(resumeData).filter((key) => key !== "config");

  let lang = langValue;
  if (!lang) {
    lang = args.find((arg) => availableLanguages.includes(arg));
  }
  lang = lang || (availableLanguages.includes("en") ? "en" : availableLanguages[0]);

  const langData = resumeData[lang];
  if (!langData) {
    console.error(`Error: Language '${lang}' not found in ${jsonPath}.`);
    process.exit(1);
  }

  const theme = themeValue || "default";
  const themeConfig = resumeData.config?.themes?.[theme] || resumeData.config?.themes?.default || null;

  const templatePath = path.join(process.cwd(), "docs", "cover_letter_template.html");
  if (!fs.existsSync(templatePath)) {
    console.error("Error: docs/cover_letter_template.html not found.");
    process.exit(1);
  }

  const contactList = nonDev
    ? langData.contact.filter(
        (c) => !c.text.toLowerCase().includes("github") && !(c.url && c.url.toLowerCase().includes("github")),
      )
    : langData.contact;

  const headerHtml = `
        <header class="flex items-center mb-8 md:mb-11">
            <h1 class="text-2xl font-semibold text-gray-750 pb-px">${langData.name}</h1>
        </header>
        <div class="mb-8 space-y-1">
            ${contactList.map((c) => `<div class="text-gray-600 text-sm">${c.text}</div>`).join("")}
        </div>
        <hr class="mb-8 border-gray-200" />
  `;

  // Enter a reference letter (preferably written by you) as a reference for writing style
  const referenceLetter = `
    Hello!

    It is with great excitement that I am now applying for the 2025 summer internship
    program at Opera. When I saw the position and read through the ad, I thought to myself
    that this was something I just had to apply for!

    The position appeals to me primarily because I recently finished an internship at a smaller
    startup and am looking for a place where I can both further develop and demonstrate my
    skills. I am very confident in my abilities within HTML, CSS and JS/TypeScript as well as
    designing good looking and modern web applications. I am also very well versed in React
    as I’ve been interning at a company building a React web application for the past few
    months as a fullstack-developer. I also have experience in C# and .NET through my
    education so all in all I have a broad range of expertise within web development.

    As a person, I am diplomatic and non-confrontational, so I have never had difficulty
    working in groups. I am also half-american and speak both English and Swedish fluently.
    Since I’ve been studying remote for a while now I can work effectively from home and
    enjoy that way of working. With that being said I am also really looking forward to
    integrating within a team and getting some new experiences while also learning and
    developing further as a developer.

    I am sure that my experiences from my education and projects I have done will be able to
    be used in this internship and I sincerely hope that I will get to hear from you soon!

    Sincerely,
    Samuel Ward
  `;

  let cleanContent = "";
  let companyName = companyValue || "";
  let finalContent = "";

  if (useAi) {
    if (!promptValue && !urlValue) {
      console.error(
        'Error: Either --prompt or --url flag is required when using AI generation. Usage: npm run export:cover-letter:ai -- --prompt="Job description..."',
      );
      process.exit(1);
    }

    let promptText = "";

    if (urlValue) {
      console.log(`Fetching job description from ${urlValue}...`);
      try {
        const scrapeBrowser = await puppeteer.launch();
        const page = await scrapeBrowser.newPage();
        // Set User-Agent to mimic a real browser
        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        );
        await page.goto(urlValue, { waitUntil: "networkidle2" });
        const text = await page.evaluate(() => document.body.innerText);
        await scrapeBrowser.close();
        promptText += `\n\nJob Description from URL (${urlValue}):\n${text}\n\n`;
      } catch (err) {
        console.error("Warning: Failed to fetch URL content:", err.message);
        if (!promptValue) {
          console.error("Exiting because URL fetch failed and no prompt was provided.");
          process.exit(1);
        }
      }
    }

    if (promptValue) {
      promptText = promptValue + promptText;
    }

    console.log(`Generating cover letter for ${langData.name} (${lang}) with Gemini AI...\n`);
    const cvContext = JSON.stringify(langData);
    const fullPrompt = `
        You are writing a professional cover letter for ${langData.name}.
        Language: ${lang === "sv" ? "Swedish" : "English"}.

        Resume Data:
        ${cvContext}

        Job Description / User Request:
        ${promptText}

        Instructions:
        - Identify the name of the company this cover letter is for.
        - Write a professional and engaging cover letter tailored to the job description/request.
        - The content should be less than 250 words, fitting on a single A4 page.
        - Use HTML format for the body content (use <p> for paragraphs, <br> for line breaks).
        - Do NOT include the header (Name, Address) as these will be added by the template unless otherwise instructed.
        - Do include the greeting and closing signature block exactly as it is from the reference letter.
        - Avoid the mathematical patterns generally found in AI-generated cover letters.
        - Avoid anything traditionally detected as AI-generated (e.g., mathematical patterns, repetitive language).
        - After writing the body content, filter it a second time to remove any AI-generated patterns.
        - Mix sentence lengths: Combine short sentences and split long, robotic ones.
        - Add personal voice: Include my own stories, unique opinions, or real examples.
        - Use natural flaws: Change rigid paragraphs, use active voice, and avoid repeating the same introductory transition words.

        When writing the cover letter, you can use this as a reference for writing style and examples of the patterns that are 0% AI-generated (do NOT copy content, only style):
        ${referenceLetter}

        IMPORTANT: Your response MUST be a JSON object with the following structure:
        {
          "companyName": "Name of the company",
          "htmlContent": "HTML content of the cover letter"
        }
    `;

    const model = getGeminiModel();
    try {
      const result = await model.generateContent(fullPrompt);
      const response = JSON.parse(result.response.text());
      cleanContent = response.htmlContent;
      if (!companyName) {
        companyName = response.companyName || "";
      }
    } catch (error) {
      console.error("Error generating content with Gemini:", error);
      process.exit(1);
    }

    finalContent = cleanContent;
    const skipReview = args.includes("--skip-review");

    if (!skipReview) {
      displayCoverLetterPreview(cleanContent, companyName);

      console.log("1. Generate PDF now");
      console.log("2. Save draft to file");
      console.log("3. Open in browser for editing\n");

      const choice = await createPrompt();

      if (choice === "2") {
        const fullHtml = buildEditableHtml(templatePath, headerHtml, cleanContent, themeConfig);
        saveDraft(fullHtml, companyName, lang, nonDev);
        process.exit(0);
      } else if (choice === "3") {
        const editableHtml = buildEditableHtml(templatePath, headerHtml, cleanContent, themeConfig);
        try {
          const edited = await openInBrowser(editableHtml, 300000);
          if (edited) {
            finalContent = edited;
            console.log("Edited content captured.");
          } else {
            console.log("No edits detected, using original generated content.");
          }

          if (process.stdin.isTTY) {
            process.stdin.pause();
          }
        } catch (err) {
          console.error("Error opening browser:", err.message);
          finalContent = cleanContent;
        }
      }
    }
  } else {
    // Default mode: skip AI generation, load sample text, immediately open browser
    console.log(`Loading sample cover letter for ${langData.name} (${lang})...`);
    cleanContent = getSampleContent(lang, langData.name, companyValue, nonDev);
    finalContent = cleanContent;

    const noBrowser = args.includes("--no-browser");
    if (!noBrowser) {
      const editableHtml = buildEditableHtml(templatePath, headerHtml, cleanContent, themeConfig);
      try {
        // No timeout for non-AI mode: user can spend as much time editing manually as needed
        const edited = await openInBrowser(editableHtml, 0);
        if (edited) {
          finalContent = edited;
          console.log("Edited content captured.");
        } else {
          console.log("No edits detected, using sample content.");
        }

        if (process.stdin.isTTY) {
          process.stdin.pause();
        }
      } catch (err) {
        console.error("Error opening browser:", err.message);
        finalContent = cleanContent;
      }
    }
  }

  // Prepare final HTML for PDF export
  let templateHtml = fs.readFileSync(templatePath, "utf8");
  if (themeConfig) {
    const vars = Object.entries(themeConfig)
      .map(([k, v]) => `        ${k}: ${v};`)
      .join("\n");
    const bodyBg = themeConfig["--color-page-background"]
      ? `\n        body { background-color: ${themeConfig["--color-page-background"]}; }`
      : "";
    const themeStyle = `\n    <style>\n      :root {\n${vars}\n      }${bodyBg}\n    </style>`;
    templateHtml = templateHtml.replace("</head>", `${themeStyle}\n</head>`);
  }

  const finalHtml = templateHtml.replace(
    "<!-- Content will be injected here by the script -->",
    `${headerHtml}<div class="text-gray-700 leading-relaxed space-y-4">${finalContent}</div>`,
  );

  const tempHtmlPath = path.join(process.cwd(), "docs", "temp_cover_letter.html");
  fs.writeFileSync(tempHtmlPath, finalHtml, "utf8");

  // Determine output path
  let outputPath;
  if (outputValue) {
    outputPath = outputValue;
  } else {
    const date = new Date().toISOString().split("T")[0];
    const companySlug = companyName
      ? companyName
          .replace(/[^a-zA-Z0-9 ]/g, "")
          .trim()
          .replace(/\s+/g, "_")
          .substring(0, 30)
      : "";
    const slugSuffix = companySlug && companySlug.toLowerCase() !== "company" ? `-${companySlug}` : "";
    const nonDevSuffix = nonDev ? "-nondev" : "";
    outputPath = path.join(process.cwd(), "exports", `cover-letter-${date}-${lang}${slugSuffix}${nonDevSuffix}.pdf`);
  }

  const exportsDir = path.join(process.cwd(), "exports");
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  // Delete existing file if it exists (overwrite)
  if (fs.existsSync(outputPath)) {
    try {
      fs.unlinkSync(outputPath);
      console.log(`Overwriting existing file: ${outputPath}`);
    } catch (err) {
      console.error(`Error deleting existing file: ${err.message}`);
    }
  }

  // Generate PDF
  console.log("Generating PDF...");
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.match(/\.(woff2?|ttf|otf)$/)) {
      const filename = path.basename(url);
      let fontPath = path.join(process.cwd(), "docs", "fonts", filename);
      if (!fs.existsSync(fontPath)) {
        const originalFontPath = path.join(process.cwd(), "docs", "fonts", "original", filename);
        if (fs.existsSync(originalFontPath)) {
          fontPath = originalFontPath;
        }
      }
      if (fs.existsSync(fontPath)) {
        request.respond({ status: 200, body: fs.readFileSync(fontPath) });
      } else {
        request.continue();
      }
    } else {
      request.continue();
    }
  });

  await page.goto(`file://${tempHtmlPath}`, { waitUntil: "networkidle0" });

  // Apply Theme
  if (themeConfig) {
    await page.evaluate((config) => {
      const root = document.documentElement;
      for (const [key, value] of Object.entries(config)) {
        root.style.setProperty(key, value);
      }
      // Ensure body bg matches page bg if defined
      if (config["--color-page-background"]) {
        document.body.style.backgroundColor = config["--color-page-background"];
      }
    }, themeConfig);
  }

  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
  });

  await browser.close();
  if (fs.existsSync(tempHtmlPath)) {
    fs.unlinkSync(tempHtmlPath);
  }

  console.log(`Cover letter generated successfully: ${outputPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
