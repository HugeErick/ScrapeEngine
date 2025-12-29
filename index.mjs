import { chromium } from 'playwright';
import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to get URLs from user input
function getUrlsFromUser() {
  return new Promise((resolve) => {
    console.log('Enter URLs (one per line, press Enter twice when done):');
    const urls = [];
    
    const processInput = (input) => {
      const trimmed = input.trim();
      
      if (trimmed === '') {
        if (urls.length > 0) {
          rl.close();
          resolve(urls);
        } else {
          console.log('Please enter at least one URL:');
        }
      } else {
        // Add protocol if missing
        const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
        urls.push(url);
        console.log(`Added: ${url}`);
        console.log('Enter next URL (or press Enter to finish):');
      }
    };
    
    rl.on('line', processInput);
  });
}

(async () => {
  try {
    // get URLs from user input
    const urls = await getUrlsFromUser();
    
    console.log(`\nStarting to scrape ${urls.length} URL(s)...\n`);
    
    const browser = await chromium.launch({ headless: true });
    // add agent
    // TODO: check if thats the best userAgent according to official docs
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    })

    const page = await context.newPage();
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const orderNumber = i + 1;
      
      try {
        console.log(`Scraping URL: ${url} (Order: ${orderNumber})`);
        
        // navigate to the page with a fallback to 'domcontentloaded' and a timeout
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Add a small delay to allow dynamic content to load
        await page.waitForTimeout(3000);
        
        // Extract the title (from <title> or <h1>)
        let title = await page.title();
        if (!title || title.trim() === "") {
          try {
            title = await page.$eval('h1', el => el.textContent.trim());
          } catch {
            title = "No Title Found";
          }
        }
        
        // Extract according to html tags
        const content = await page.$$eval('h1, h2, h3, h4, h5, h6, p, span', elements =>
          elements.map(el => ({
            tag: el.tagName.toLowerCase(),
            text: el.textContent.trim()
          })).filter(item => item.text.length > 0)
        );
        
        // Create a JSON object for the document
        const documentData = {
          orderNumber,
          url,
          title: title || "No Title Found",
          content,
          scrapedAt: new Date().toISOString(),
          totalElements: content.length
        };
        
        // Save the document data to a separate JSON file
        const fileName = `document_${orderNumber}.json`;
        fs.writeFileSync(fileName, JSON.stringify(documentData, null, 2));
        
        console.log(`Saved document data to ${fileName} (${content.length} elements found)`);
        
      } catch (error) {
        console.error(`Error scraping URL: ${url}`, error.message);
        
        // Still create a file with error info
        const errorData = {
          orderNumber,
          url,
          title: "Error",
          content: [],
          error: error.message,
          scrapedAt: new Date().toISOString()
        };
        
        const fileName = `document_${orderNumber}_error.json`;
        fs.writeFileSync(fileName, JSON.stringify(errorData, null, 2));
      }
    }
    
    // Close the browser
    await browser.close();
    console.log(`\nScraping completed! Processed ${urls.length} URL(s).`);
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
})();
