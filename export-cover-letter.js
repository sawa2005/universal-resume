import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable not found. Please add it to your .env file.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function main() {
    const args = process.argv.slice(2);
    const promptArg = args.find(arg => arg.startsWith('--prompt='));
    const langArg = args.find(arg => arg.startsWith('--lang='));
    const themeArg = args.find(arg => arg.startsWith('--theme='));
    const outputArg = args.find(arg => arg.startsWith('--output='));

    if (!promptArg) {
        console.error('Error: --prompt flag is required. Usage: npm run export:cover-letter -- --prompt="Job description..."');
        process.exit(1);
    }

    const promptText = promptArg.split('=')[1];
    const lang = langArg ? langArg.split('=')[1] : 'en';
    const theme = themeArg ? themeArg.split('=')[1] : 'default';

    // Read Data
    const dataPath = path.join(process.cwd(), 'docs', 'data.json');
    if (!fs.existsSync(dataPath)) {
        console.error('Error: docs/data.json not found.');
        process.exit(1);
    }
    const resumeData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const langData = resumeData[lang];

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
        Language: ${lang === 'sv' ? 'Swedish' : 'English'}. 
        
        Resume Data:
        ${cvContext}
        
        Job Description / User Request:
        ${promptText}
        
        Instructions:
        - Write a professional and engaging cover letter tailored to the job description/request.
        - Use HTML format for the body content (use <p> for paragraphs, <br> for line breaks).
        - Do NOT include the header (Name, Address) or closing signature block (Sincerely, Name) as these will be added by the template.
        - Focus on the body paragraphs.
        - Keep it concise (under 1 page).
        - Do NOT wrap the output in markdown code blocks (e.g. \`\`\`html). 
    `;

    let cleanContent;
    try {
        const result = await model.generateContent(fullPrompt);
        const generatedContent = result.response.text();
        cleanContent = generatedContent.replace(/```html/g, '').replace(/```/g, '');
    } catch (error) {
        console.error('Error generating content with Gemini:', error);
        process.exit(1);
    }

    // Prepare HTML
    const templatePath = path.join(process.cwd(), 'docs', 'cover_letter_template.html');
    if (!fs.existsSync(templatePath)) {
        console.error('Error: docs/cover_letter_template.html not found.');
        process.exit(1);
    }
    let templateHtml = fs.readFileSync(templatePath, 'utf8');

    // Replicate Header from Resume (Tailwind styles)
    const headerHtml = `
        <header class="flex items-center mb-8 md:mb-11">
            <div class="initials-container mr-5 w-12 h-12 flex items-center justify-center text-xl leading-none text-gray-700 bg-gray-250 font-mono font-light shadow-inner rounded-lg print:bg-transparent print:border print:border-gray-300">
                <div class="text-center">${langData.initials}</div>
            </div>
            <h1 class="text-2xl font-semibold text-gray-750 pb-px">${langData.name}</h1>
        </header>
        <div class="mb-8 space-y-1">
            ${langData.contact.map(c => `<div class="text-gray-600 text-sm">${c.text}</div>`).join('')}
        </div>
        <hr class="mb-8 border-gray-200" />
    `;

    const finalHtml = templateHtml.replace(
        '<!-- Content will be injected here by the script -->',
        `${headerHtml}<div class="text-gray-700 leading-relaxed space-y-4">${cleanContent}</div>`
    );

    const tempHtmlPath = path.join(process.cwd(), 'docs', 'temp_cover_letter.html');
    fs.writeFileSync(tempHtmlPath, finalHtml);

    // Generate PDF
    console.log('Generating PDF...');
    
    let outputPath;
    if (outputArg) {
        outputPath = outputArg.split('=')[1];
    } else {
        const date = new Date().toISOString().split('T')[0];
        outputPath = path.join(process.cwd(), 'exports', `cover-letter-${date}-${lang}.pdf`);
    }
    
    const exportsDir = path.join(process.cwd(), 'exports');
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
    page.on('request', request => {
        const url = request.url();
         if (url.match(/\.(woff2?|ttf|otf)$/)) {
            const filename = path.basename(url);
            let fontPath = path.join(process.cwd(), 'docs', 'fonts', filename);
            if (!fs.existsSync(fontPath)) {
                const originalFontPath = path.join(process.cwd(), 'docs', 'fonts', 'original', filename);
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

    await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle0' });
    
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
                if (config['--color-page-background']) {
                     document.body.style.backgroundColor = config['--color-page-background'];
                }
            }, themeConfig);
        }
    }

    await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    });

    await browser.close();
    fs.unlinkSync(tempHtmlPath);
    
    console.log(`Cover letter generated successfully: ${outputPath}`);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
