import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

async function main() {
  const args = process.argv.slice(2);
  const langArg = args.find(arg => arg.startsWith('--lang='));
  const tagsArg = args.find(arg => arg.startsWith('--tags=')); // Comma separated
  const themeArg = args.find(arg => arg.startsWith('--theme='));
  const outputArg = args.find(arg => arg.startsWith('--output='));

  const lang = langArg ? langArg.split('=')[1] : 'en';
  const tags = tagsArg ? tagsArg.split('=')[1].split(',') : [];
  const theme = themeArg ? themeArg.split('=')[1] : 'default';

  // Determine output path
  let outputPath;
  if (outputArg) {
    outputPath = outputArg.split('=')[1];
  } else {
    // Generate automatic filename
    const date = new Date().toISOString().split('T')[0];
    const tagsStr = tags.length ? `-${tags.join('_')}` : '-All';
    const themeStr = theme !== 'default' ? `-${theme}` : '';
    const filename = `resume-${date}-${lang}${tagsStr}${themeStr}.pdf`;
    
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
      // Proceeding might fail if the file is locked, but we can try.
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
      const dataPath = path.join(process.cwd(), 'docs', 'data.json');
      const data = fs.readFileSync(dataPath, 'utf8');
      request.respond({
        content: 'application/json',
        body: data
      });
    } else if (url.match(/\.(woff2?|ttf|otf)$/)) {
        // Extract filename from URL (handles both relative and absolute-like paths)
        const filename = path.basename(url);
        // Assuming fonts are in docs/fonts/
        // Some fonts might be in subfolders like docs/fonts/original/
        // But the CSS seems to point to /fonts/filename directly.
        // Let's check if it exists in docs/fonts/ first.
        let fontPath = path.join(process.cwd(), 'docs', 'fonts', filename);
        
        if (!fs.existsSync(fontPath)) {
            // Check original folder if needed, though CSS didn't seem to use it for the main ones.
            // But let's be safe or just fail gracefully.
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

  // Apply Language
  if (lang === 'sv') {
    await page.click('#btn-sv');
  } else {
    await page.click('#btn-en');
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
