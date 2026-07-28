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
  const lines = htmlContent.split("<br>").map((line) => line.trim()).filter(Boolean);
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

function saveDraft(htmlContent, companyName, lang) {
  const date = new Date().toISOString().split("T")[0];
  const companySlug = companyName
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .substring(0, 30);
  const draftPath = path.join(process.cwd(), "exports", `draft-cover-letter-${date}-${lang}-${companySlug}.html`);
  fs.writeFileSync(draftPath, htmlContent, "utf8");
  console.log(`Draft saved to: ${draftPath}`);
}

async function openInBrowser(htmlContent) {
  return new Promise((resolve, reject) => {
    const tempHtmlPath = path.join(process.cwd(), "docs", "temp_cover_letter.html");
    fs.writeFileSync(tempHtmlPath, htmlContent, "utf8");

    let serverClosed = false;

    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/save") {
        let body = "";
        for await (const chunk of req) body += chunk;
        try {
          const data = JSON.parse(body);
          fs.writeFileSync(tempHtmlPath, data.html, "utf8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          console.log("Edited content saved to disk.");

          if (!serverClosed) {
            serverClosed = true;
            // Destroy all connections immediately to prevent hanging process
            server.close(() => {});
            server.destroy();
            resolve();
          }
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      } else if (req.url === "/" || req.url === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(htmlContent);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const url = `http://127.0.0.1:${port}`;
      console.log(`\nOpening cover letter in browser... Click Save when done.`);

      const crossPlatformOpen =
        process.platform === "win32" ? `start ""` : process.platform === "darwin" ? "open" : "xdg-open";
      execAsync(`${crossPlatformOpen} "${url}"`).catch(() => {});
    });

    server.on("error", (err) => {
      if (!serverClosed) {
        serverClosed = true;
        reject(err);
      }
    });

    setTimeout(() => {
      if (!serverClosed) {
        serverClosed = true;
        console.log("\nTimeout waiting for save. Using original content.");
        server.close(() => {});
        server.destroy();
        resolve();
      }
    }, 300000);
  });
}

function buildEditableHtml(templatePath, headerHtml, content) {
  let templateHtml = fs.readFileSync(templatePath, "utf8");

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
        msg.textContent = "Saved! Press Enter in terminal.";

        btn.onclick = async () => {
          const contentDiv = document.querySelector("[contenteditable]");
          if (!contentDiv) return;
          try {
            const res = await fetch("/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ html: contentDiv.outerHTML })
            });
            const result = await res.json();
            if (result.ok) {
              msg.style.opacity = "1";
              setTimeout(() => (msg.style.opacity = "0"), 2500);
            } else {
              alert("Save failed: " + result.error);
            }
          } catch (e) {
            alert("Save failed: " + e.message);
          }
        };

        document.body.prepend(btn, msg);
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

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("Error: GEMINI_API_KEY environment variable not found. Please add it to your .env file.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: { responseMimeType: "application/json" },
});

async function main() {
  const args = process.argv.slice(2);
  const promptArg = args.find((arg) => arg.startsWith("--prompt="));
  const urlArg = args.find((arg) => arg.startsWith("--url="));
  const langArg = args.find((arg) => arg.startsWith("--lang="));
  const themeArg = args.find((arg) => arg.startsWith("--theme="));
  const outputArg = args.find((arg) => arg.startsWith("--output="));

  if (!promptArg && !urlArg) {
    console.error(
      'Error: Either --prompt or --url flag is required. Usage: npm run export:cover-letter -- --prompt="Job description..." --url="https://..."',
    );
    process.exit(1);
  }

  let promptText = "";

  if (urlArg) {
    const url = urlArg.split("=")[1];
    console.log(`Fetching job description from ${url}...`);
    try {
      const scrapeBrowser = await puppeteer.launch();
      const page = await scrapeBrowser.newPage();
      // Set User-Agent to mimic a real browser
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      );
      await page.goto(url, { waitUntil: "networkidle2" });
      const text = await page.evaluate(() => document.body.innerText);
      await scrapeBrowser.close();
      promptText += `\n\nJob Description from URL (${url}):\n${text}\n\n`;
    } catch (err) {
      console.error("Warning: Failed to fetch URL content:", err.message);
      if (!promptArg) {
        console.error("Exiting because URL fetch failed and no prompt was provided.");
        process.exit(1);
      }
    }
  }

  if (promptArg) {
    const pText = promptArg.split("=")[1];
    promptText = pText + promptText;
  }

  const lang = langArg ? langArg.split("=")[1] : "en";
  const theme = themeArg ? themeArg.split("=")[1] : "default";

  // Read Data
  const dataPath = path.join(process.cwd(), "docs", "data.json");
  if (!fs.existsSync(dataPath)) {
    console.error("Error: docs/data.json not found.");
    process.exit(1);
  }
  const resumeData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const langData = resumeData[lang];

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

  if (!langData) {
    console.error(`Error: Language '${lang}' not found in data.json.`);
    process.exit(1);
  }

  // Generate Content
  console.log(`Generating cover letter for ${langData.name} (${lang})...
`);
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
        - Do NOT include the header (Name, Address) or closing signature block (Sincerely, Name) as these will be added by the template.
        - Focus on the body paragraphs.
        
        When writing the cover letter, you can use this as a reference for writing style (do NOT copy content, only style):
        ${referenceLetter}

        IMPORTANT: Your response MUST be a JSON object with the following structure:
        {
          "companyName": "Name of the company",
          "htmlContent": "HTML content of the cover letter"
        }
    `;

  let cleanContent;
  let companyName = "Company";
  try {
    const result = await model.generateContent(fullPrompt);
    const response = JSON.parse(result.response.text());
    cleanContent = response.htmlContent;
    companyName = response.companyName;
  } catch (error) {
    console.error("Error generating content with Gemini:", error);
    process.exit(1);
  }

  // Review step - ask user what to do with the generated content
  let finalContent = cleanContent;
  const skipReview = args.includes("--skip-review");
  
  if (!skipReview) {
    displayCoverLetterPreview(cleanContent, companyName);
    
    console.log("1. Generate PDF now");
    console.log("2. Save draft to file");
    console.log("3. Open in browser for editing\n");
    
    const choice = await createPrompt();
    
    if (choice === "2") {
      const templatePath = path.join(process.cwd(), "docs", "cover_letter_template.html");
      let templateHtml = fs.readFileSync(templatePath, "utf8");
      const headerHtml = `
        <header class="flex items-center mb-8 md:mb-11">
            <div class="initials-container mr-5 w-12 h-12 flex items-center justify-center text-xl leading-none text-gray-700 bg-gray-250 font-mono font-light shadow-inner rounded-lg print:bg-transparent print:border print:border-gray-300">
                <div class="text-center">${langData.initials}</div>
            </div>
            <h1 class="text-2xl font-semibold text-gray-750 pb-px">${langData.name}</h1>
        </header>
        <div class="mb-8 space-y-1">
            ${langData.contact.map((c) => `<div class="text-gray-600 text-sm">${c.text}</div>`).join("")}
        </div>
        <hr class="mb-8 border-gray-200" />
      `;
      const fullHtml = buildEditableHtml(templatePath, headerHtml, cleanContent);
      saveDraft(fullHtml, companyName, lang);
      process.exit(0);
    } else if (choice === "3") {
      const templatePath = path.join(process.cwd(), "docs", "cover_letter_template.html");
      let templateHtml = fs.readFileSync(templatePath, "utf8");
      const headerHtml = `
        <header class="flex items-center mb-8 md:mb-11">
            <div class="initials-container mr-5 w-12 h-12 flex items-center justify-center text-xl leading-none text-gray-700 bg-gray-250 font-mono font-light shadow-inner rounded-lg print:bg-transparent print:border print:border-gray-300">
                <div class="text-center">${langData.initials}</div>
            </div>
            <h1 class="text-2xl font-semibold text-gray-750 pb-px">${langData.name}</h1>
        </header>
        <div class="mb-8 space-y-1">
            ${langData.contact.map((c) => `<div class="text-gray-600 text-sm">${c.text}</div>`).join("")}
        </div>
        <hr class="mb-8 border-gray-200" />
      `;
      const editableHtml = buildEditableHtml(templatePath, headerHtml, cleanContent);

      try {
        await openInBrowser(editableHtml);
        const editedHtml = fs.readFileSync(path.join(process.cwd(), "docs", "temp_cover_letter.html"), "utf8");
        const contentMatch = editedHtml.match(/contenteditable="true">([\s\S]*?)<\/div>/);
        if (contentMatch) {
          finalContent = contentMatch[1];
          console.log("Edited content captured. Generating PDF...");
        } else {
          console.log("No edits detected, using original generated content.");
        }

        // Force close stdin to prevent process from hanging after browser editing
        if (process.stdin.isTTY) {
          process.stdin.pause();
        }
      } catch (err) {
        console.error("Error opening browser:", err.message);
        finalContent = cleanContent;
      }
    }
  }

  // Prepare HTML
  const templatePath = path.join(process.cwd(), "docs", "cover_letter_template.html");
  if (!fs.existsSync(templatePath)) {
    console.error("Error: docs/cover_letter_template.html not found.");
    process.exit(1);
  }
  let templateHtml = fs.readFileSync(templatePath, "utf8");

  // Replicate Header from Resume (Tailwind styles)
  const headerHtml = `
        <header class="flex items-center mb-8 md:mb-11">
            <div class="initials-container mr-5 w-12 h-12 flex items-center justify-center text-xl leading-none text-gray-700 bg-gray-250 font-mono font-light shadow-inner rounded-lg print:bg-transparent print:border print:border-gray-300">
                <div class="text-center">${langData.initials}</div>
            </div>
            <h1 class="text-2xl font-semibold text-gray-750 pb-px">${langData.name}</h1>
        </header>
        <div class="mb-8 space-y-1">
            ${langData.contact.map((c) => `<div class="text-gray-600 text-sm">${c.text}</div>`).join("")}
        </div>
        <hr class="mb-8 border-gray-200" />
    `;

  const finalHtml = templateHtml.replace(
    "<!-- Content will be injected here by the script -->",
    `${headerHtml}<div class="text-gray-700 leading-relaxed space-y-4">${finalContent}</div>`,
  );

  const tempHtmlPath = path.join(process.cwd(), "docs", "temp_cover_letter.html");
  fs.writeFileSync(tempHtmlPath, finalHtml);

  // Generate PDF
  console.log("Generating PDF...");

  let outputPath;
  if (outputArg) {
    outputPath = outputArg.split("=")[1];
  } else {
    const date = new Date().toISOString().split("T")[0];
    // Create a readable slug from the company name
    const companySlug = companyName
      .replace(/[^a-zA-Z0-9 ]/g, "") // Remove non-alphanumeric chars except spaces
      .trim()
      .replace(/\s+/g, "_") // Replace spaces with underscores
      .substring(0, 30); // Truncate to 30 chars
    outputPath = path.join(process.cwd(), "exports", `cover-letter-${date}-${lang}-${companySlug}.pdf`);
  }

  const exportsDir = path.join(process.cwd(), "exports");
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir);
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
  if (resumeData.config && resumeData.config.themes) {
    const themeConfig = resumeData.config.themes[theme] || resumeData.config.themes.default;
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
  }

  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
  });

  await browser.close();
  fs.unlinkSync(tempHtmlPath);

  console.log(`Cover letter generated successfully: ${outputPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
