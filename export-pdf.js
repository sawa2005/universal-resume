import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

async function main() {
  const args = process.argv.slice(2);
  console.log('Arguments received:', args);
  
  // Load data.json to validate languages and get config
  const dataPath = path.join(process.cwd(), 'docs', 'data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('Error: docs/data.json not found.');
    process.exit(1);
  }
  const allData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const availableLanguages = Object.keys(allData).filter(key => key !== 'config');

  const getArgValue = (flag) => {
    const index = args.findIndex(arg => arg === flag);
    if (index !== -1 && args[index + 1] && !args[index + 1].startsWith('--')) {
      return args[index + 1];
    }
    const startsWithArg = args.find(arg => arg.startsWith(`${flag}=`));
    if (startsWithArg) return startsWithArg.split('=')[1];
    return null;
  };

  // 1. Try to get lang from flag --lang
  let lang = getArgValue('--lang');
  
  // 2. If no flag, check if any positional argument matches an available language
  if (!lang) {
    lang = args.find(arg => availableLanguages.includes(arg));
  }
  
  // 3. Default to 'en' or first available
  lang = lang || (availableLanguages.includes('en') ? 'en' : availableLanguages[0]);

  const tagsStr = getArgValue('--tags');
  const tags = tagsStr ? tagsStr.split(',') : [];
  const theme = getArgValue('--theme') || 'default';
  const output = getArgValue('--output');

  // Determine output path
  let outputPath;
  if (output) {
    outputPath = output;
  } else {
    // Generate automatic filename
    const date = new Date().toISOString().split('T')[0];
    const tagsSuffix = tags.length ? `-${tags.join('_')}` : '-All';
    const themeSuffix = theme !== 'default' ? `-${theme}` : '';
    const filename = `resume-${date}-${lang}${tagsSuffix}${themeSuffix}.pdf`;
    
    // Ensure exports directory exists
    const exportsDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir);
    }
    
    outputPath = path.join(exportsDir, filename);
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

  console.log(`Generating PDF with:
    Language: ${lang}
    Tags: ${tags.length ? tags.join(', ') : 'All'}
    Theme: ${theme}
    Output: ${outputPath}
  `);

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Handle local file fetch
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    
    if (url.endsWith('data.json')) {
      // Use the already read allData
      request.respond({
        content: 'application/json',
        body: JSON.stringify(allData)
      });
    } else if (url.match(/\.(woff2?|ttf|otf)$/)) {
        const filename = path.basename(url);
        let fontPath = path.join(process.cwd(), 'docs', 'fonts', filename);
        
        if (!fs.existsSync(fontPath)) {
            const originalFontPath = path.join(process.cwd(), 'docs', 'fonts', 'original', filename);
            if (fs.existsSync(originalFontPath)) {
                fontPath = originalFontPath;
            }
        }

        if (fs.existsSync(fontPath)) {
            const fontData = fs.readFileSync(fontPath);
            request.respond({
                status: 200,
                body: fontData
            });
        } else {
            console.warn(`Font not found: ${filename} (URL: ${url})`);
            request.continue();
        }
    } else {
      request.continue();
    }
  });

  const filePath = path.join(process.cwd(), 'docs', 'index.html');
  await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0' });

  // Wait for fonts to be ready
  await page.evaluateHandle('document.fonts.ready');

  // Wait for the app to be fully initialized (including event listeners)
  await page.waitForFunction(() => window.appReady === true);

  // Apply Language
  if (lang === 'sv') {
    await page.click('#btn-sv');
  } else if (lang === 'en') {
    await page.click('#btn-en');
  } else {
    // If more languages are added, we'd need a more generic way to click buttons
    // For now, these are the two supported buttons.
    console.warn(`Language button for '${lang}' not specifically handled, defaulting to page default.`);
  }

  // Apply Theme
  await page.select('#theme-select', theme);
  
  // Apply Tags
  if (tags.length > 0) {
    await page.evaluate((tagsToSelect) => {
      // First, ensure we start from a known state by resetting to All
      window.setProjectFilter('All'); 
      
      tagsToSelect.forEach(tag => {
        window.setProjectFilter(tag);
      });
      
    }, tags);
  }

  // Wait a bit for any transitions
  await new Promise(r => setTimeout(r, 500));

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '0px',
      right: '0px',
      bottom: '0px',
      left: '0px'
    }
  });

  await browser.close();
  console.log('PDF generated successfully.');
}

main().catch(error => {
  console.error('Error generating PDF:', error);
  process.exit(1);
});
