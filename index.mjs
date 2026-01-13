import { chromium } from "playwright";
import fs from "fs";
import readline from "readline";
import dotenv from "dotenv"
dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function summarizeText(text, model = 'llama-3.1-8b-instant') {

  if (!GROQ_API_KEY) {
    throw new Error("Groq key err, not set in env?");
  }

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'Note and summarize important information on the prompt'
          },
          {
            role: 'user',
            content: `Please summarize the following  scrapped text:\n\n${text}`
          }
        ],
        temperature: 0.3, // lower temperature for more focused summaries
        max_tokens: 50    
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// function to get URLs from user input
function getUrlsFromUser() {
  return new Promise((resolve) => {
    console.log("Enter URLs (one per line, press Enter twice when done):");
    const urls = [];

    const processInput = (input) => {
      const trimmed = input.trim();

      if (trimmed === "") {
        if (urls.length > 0) {
          rl.close();
          resolve(urls);
        } else {
          console.log("Please enter at least one URL:");
        }
      } else {
        // add protocol if missing
        const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
        urls.push(url);
        console.log(`Added: ${url}`);
        console.log("Enter next URL (or press Enter to finish):");
      }
    };

    rl.on("line", processInput);
  });
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim().toLocaleLowerCase());
    });
  });
}

function getScrappedFiles() {
  const files = fs.readdirSync(".");
  return files.filter(file => 
    file.startsWith("document_") && 
      file.endsWith(".json") &&
      !file.includes("_error")
  );
}


async function processSumarization(files) {
  if (files.length === 0) {
    console.log("\nNo scrapped files found to summarize");
    return;
  }

  console.log(`\nFound ${files.length} file(s) to potentially summarize.`);

  for (const fileName of files) {
    try {

      const fileContent = fs.readFileSync(fileName, 'utf-8');
      const documentData = JSON.parse(fileContent);

      // extract text from content and format as string
      const textContent = documentData.content
      .map(item => `[${item.tag}] ${item.text}`)
      .join("\n");

      const documentString = `
Title: ${documentData.title}
URL: ${documentData.url}
Scraped: ${documentData.scrapedAt}
Total Elements: ${documentData.totalElements}

Content:
${textContent}
`.trim();

      console.log(`\n--- File: ${fileName} ---`);
      console.log(`Title: ${documentData.title}`);
      console.log(`URL: ${documentData.url}`);

      // if multiple files, ask for each one
      let shouldSummarize = true;
      if (files.length > 1) {
        const answer = await askQuestion(`Summarize this file? (y/n): `);
        shouldSummarize = answer === 'y' || answer === 'yes';
      }

      if (shouldSummarize) {
        console.log("Generating summary...");
        const summary = await summarizeText(documentString);

        if (summary) {
          console.log("\n=== SUMMARY ===");
          console.log(summary);
          console.log("===============\n");

          // optionally save summary back to the file
          documentData.summary = summary;
          documentData.summarizedAt = new Date().toISOString();
          fs.writeFileSync(fileName, JSON.stringify(documentData, null, 2));
          console.log(`Summary saved to ${fileName}`);
        } else {
          console.log("Failed to generate summary.");
        }
      } else {
        console.log("Skipped.");
      }
    } catch (error) {
      console.error(`Error processing ${fileName}:`, error.message);
    }
  }
}

(async () => {
  try {
    // get URLs from user input
    const urls = await getUrlsFromUser();

    console.log(`\nStarting to scrape ${urls.length} URL(s)...\n`);

    const browser = await chromium.launch({ headless: true });
    // add agent
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    })

    const page = await context.newPage();

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const orderNumber = i + 1;

      try {
        console.log(`Scraping URL: ${url} (Order: ${orderNumber})`);

        // navigate to the page with a fallback to "domcontentloaded" and a timeout
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

        // add a small delay to allow dynamic content to load
        await page.waitForTimeout(3000);

        // extract the title (from <title> or <h1>)
        let title = await page.title();
        if (!title || title.trim() === "") {
          try {
            title = await page.$eval("h1", el => el.textContent.trim());
          } catch {
            title = "No Title Found";
          }
        }

        // extract according to html tags
        const content = await page.$$eval("h1, h2, h3, h4, h5, h6, p, span", elements =>
          elements.map(el => ({
            tag: el.tagName.toLowerCase(),
            text: el.textContent.trim()
          })).filter(item => item.text.length > 0)
        );

        // create a JSON object for the document
        const documentData = {
          orderNumber,
          url,
          title: title || "No Title Found",
          content,
          scrapedAt: new Date().toISOString(),
          totalElements: content.length
        };

        // save the document data to a separate JSON file
        const fileName = `document_${orderNumber}.json`;
        fs.writeFileSync(fileName, JSON.stringify(documentData, null, 2));

        console.log(`Saved document data to ${fileName} (${content.length} elements found)`);

      } catch (error) {
        console.error(`Error scraping URL: ${url}`, error.message);

        // still create a file with error info
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

    // close the browser
    await browser.close();
    console.log(`\nScraping completed! Processed ${urls.length} URL(s).`);

    const wantSummary = await askQuestion("\nSummarize scraped content? (y/n)");

    if (wantSummary[0] === "y" || wantSummary === "Y") {
      const scrappedFiles = getScrappedFiles();
      await processSumarization(scrappedFiles);
    } else {
      console.log("\nSkipping summarization");

    }

  } catch (error) {
    console.error("Fatal error:", error.message);
    process.exit(1);
  }
})();
