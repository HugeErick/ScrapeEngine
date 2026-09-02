import { chromium } from "playwright";
import fs from "fs";
import readline from "readline";
import dotenv from "dotenv";
import path from "path";

import { computeWordFrequency, extractTextFromContent } from "./lib/wordFrequency.mjs";
import { parseHtmlFile } from "./lib/htmlToDocument.mjs";

dotenv.config();

const SCRAPED_DIR = "scrappedJsons";
const HTML_UPLOAD_DIR = "HTMLsToScrape";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => resolve(answer.trim()));
  });
}

async function askYesNo(query) {
  const answer = (await askQuestion(query)).toLowerCase();
  return answer === "y" || answer === "yes";
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function summarizeText(text, model = "openai/gpt-oss-20b") {
  if (!GROQ_API_KEY) {
    throw new Error("Groq key err, not set in env?");
  }

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: "Summarize the key points in 5-6 concise sentences. No tables, no headers, no bullet lists plain prose only."
          },
          {
            role: "user",
            content: `Please summarize the following scrapped content:\n\n${text}`
          }
        ],
        temperature: 0.3,
        max_completion_tokens: 1024,
        reasoning_effort: "low"
      })
    });

    console.log(`Agent status: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice?.message?.content) {
      return null;
    }
    return choice.message.content;

  } catch (error) {
    console.error("Error:", error);
    return null;
  }
}

function getUrlsFromUser() {
  return new Promise((resolve) => {
    console.log("Enter URLs (one per line, press Enter twice when done):");
    const urls = [];

    const processInput = (input) => {
      const trimmed = input.trim();

      if (trimmed === "") {
        if (urls.length > 0) {
          rl.off("line", processInput);
          resolve(urls);
        } else {
          console.log("Please enter at least one URL:");
        }
      } else {
        const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
        urls.push(url);
        console.log(`\nAdded: ${url}`);
        console.log("Enter next URL (or press Enter to finish):");
      }
    };

    rl.on("line", processInput);
  });
}

function getNextOrderNumber() {
  if (!fs.existsSync(SCRAPED_DIR)) return 1;
  const files = fs.readdirSync(SCRAPED_DIR);
  let max = 0;
  for (const f of files) {
    const match = f.match(/^document_(\d+)/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

async function processSummarization(files) {
  if (files.length === 0) {
    console.log("\nNo files to summarize.");
    return;
  }

  console.log(`\nFound ${files.length} file(s) to potentially summarize.`);

  for (const fileName of files) {
    const filePath = path.join(SCRAPED_DIR, fileName);
    try {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const documentData = JSON.parse(fileContent);

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

      let shouldSummarize = true;
      if (files.length > 1) {
        shouldSummarize = await askYesNo(`Summarize this file? (y/n): `);
      }

      if (shouldSummarize) {
        console.log("Generating summary...");
        const summary = await summarizeText(documentString);

        if (summary) {
          console.log("\n=== SUMMARY ===");
          console.log(summary);
          console.log("==============\n");

          documentData.summary = summary;
          documentData.summarizedAt = new Date().toISOString();
          fs.writeFileSync(filePath, JSON.stringify(documentData, null, 2));
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

async function processFrequency(files) {
  if (files.length === 0) {
    console.log("\nNo files to analyze.");
    return;
  }

  console.log(`\nFound ${files.length} file(s) to potentially analyze for word frequency.`);

  for (const fileName of files) {
    const filePath = path.join(SCRAPED_DIR, fileName);
    try {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const documentData = JSON.parse(fileContent);

      let shouldAnalyze = true;
      if (files.length > 1) {
        shouldAnalyze = await askYesNo(`Compute word frequency for ${fileName}? (y/n): `);
      }

      if (!shouldAnalyze) {
        console.log("Skipped.");
        continue;
      }

      const text = extractTextFromContent(documentData.content);
      const wordFrequency = computeWordFrequency(text);

      // appended regardless of whether a summary already exists on this file.
      documentData.wordFrequency = wordFrequency;
      documentData.wordFrequencyComputedAt = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(documentData, null, 2));

      console.log(`\n=== TOP WORDS: ${fileName} ===`);
      wordFrequency.slice(0, 10).forEach(({ word, count }) => {
        console.log(`  ${word.padEnd(20)} ${count}`);
      });
      console.log("===============================\n");
    } catch (error) {
      console.error(`Error analyzing ${fileName}:`, error.message);
    }
  }
}

async function handleScrapeUrls() {
  const urls = await getUrlsFromUser();
  console.log(`\nStarting to scrape ${urls.length} URL(s)...\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  });
  const page = await context.newPage();

  ensureDir(SCRAPED_DIR);

  const newDocFiles = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const orderNumber = getNextOrderNumber();

    try {
      console.log(`Scraping URL: ${url} (Order: ${orderNumber})`);

      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      console.log("Status:", response.status());

      if (response && ![200, 304].includes(response.status())) {
        await page.screenshot({ path: `debug_${orderNumber}.png`, fullPage: true });
        fs.writeFileSync(`debug_${orderNumber}.html`, await page.content());
      }

      await page.waitForTimeout(3000);

      let title = await page.title();
      if (!title || title.trim() === "") {
        try {
          title = await page.$eval("h1", el => el.textContent.trim());
        } catch {
          title = "No Title Found";
        }
      }

      const content = await page.$$eval("h1, h2, h3, h4, h5, h6, p, span", elements =>
        elements.map(el => ({
          tag: el.tagName.toLowerCase(),
          text: el.textContent.trim()
        })).filter(item => item.text.length > 0)
      );

      const documentData = {
        orderNumber,
        url,
        title: title || "No Title Found",
        content,
        scrapedAt: new Date().toISOString(),
        totalElements: content.length
      };

      const fileName = `document_${orderNumber}.json`;
      fs.writeFileSync(path.join(SCRAPED_DIR, fileName), JSON.stringify(documentData, null, 2));
      newDocFiles.push(fileName);

      console.log(`Saved document data to ${fileName} (${content.length} elements found)`);

    } catch (error) {
      console.error(`Error scraping URL: ${url}`, error.message);

      const errorData = {
        orderNumber,
        url,
        title: "Error",
        content: [],
        error: error.message,
        scrapedAt: new Date().toISOString()
      };
      fs.writeFileSync(path.join(SCRAPED_DIR, `document_${orderNumber}_error.json`), JSON.stringify(errorData, null, 2));
    }
  }

  await browser.close();
  console.log(`\nScraping completed! Processed ${urls.length} URL(s).`);

  if (newDocFiles.length === 0) return;

  if (await askYesNo("\nSummarize scraped content? (y/n): ")) {
    await processSummarization(newDocFiles);
  } else {
    console.log("\nSkipping summarization");
  }

  if (await askYesNo("\nCompute significant word frequency for scraped content? (y/n): ")) {
    await processFrequency(newDocFiles);
  } else {
    console.log("\nSkipping word frequency");
  }
}

async function handleUploadHtml() {
  ensureDir(HTML_UPLOAD_DIR);
  const absPath = path.resolve(HTML_UPLOAD_DIR);

  console.log(`\nCopy your HTML file(s) into:\n  ${absPath}\n`);
  await askQuestion("Press Enter once you've copied the file(s) in...");

  const files = fs.readdirSync(HTML_UPLOAD_DIR).filter(f => /\.html?$/i.test(f));

  if (files.length === 0) {
    console.log("No .html/.htm files found in that folder.");
  } else {
    console.log(`Found ${files.length} file(s):`);
    files.forEach(f => console.log(`  - ${f}`));
  }
}

async function handleProcessHtmlFiles() {
  ensureDir(HTML_UPLOAD_DIR);
  const files = fs.readdirSync(HTML_UPLOAD_DIR).filter(f => /\.html?$/i.test(f));

  if (files.length === 0) {
    console.log(`\nNo HTML files found in ${HTML_UPLOAD_DIR}/. Use option 2 to add some first.`);
    return;
  }

  ensureDir(SCRAPED_DIR);
  const newDocFiles = [];

  for (const fileName of files) {
    const filePath = path.join(HTML_UPLOAD_DIR, fileName);
    const orderNumber = getNextOrderNumber();

    try {
      const documentData = parseHtmlFile(filePath, orderNumber);
      const outName = `document_${orderNumber}.json`;
      fs.writeFileSync(path.join(SCRAPED_DIR, outName), JSON.stringify(documentData, null, 2));
      console.log(`Parsed ${fileName} -> ${outName} (${documentData.totalElements} elements)`);
      newDocFiles.push(outName);
    } catch (error) {
      console.error(`Error parsing ${fileName}:`, error.message);
    }
  }

  if (newDocFiles.length === 0) return;

  if (await askYesNo("\nSummarize this content? (y/n): ")) {
    await processSummarization(newDocFiles);
  }

  if (await askYesNo("\nCompute significant word frequency? (y/n): ")) {
    await processFrequency(newDocFiles);
  }
}

async function mainMenu() {
  while (true) {
    console.log("\n==================================");
    console.log(" ScrapeEngine");
    console.log("==================================");
    console.log("1) Enter URLs to scrape");
    console.log("2) Upload HTML files");
    console.log("3) Process existing HTML files (summarize / word frequency)");
    console.log("4) Exit");

    const choice = await askQuestion("\nChoose an option (1-4): ");

    switch (choice) {
      case "1":
        await handleScrapeUrls();
        break;
      case "2":
        await handleUploadHtml();
        break;
      case "3":
        await handleProcessHtmlFiles();
        break;
      case "4":
        console.log("Bye.");
        rl.close();
        return;
      default:
        console.log("Please choose 1, 2, 3, or 4.");
    }
  }
}

(async () => {
  try {
    await mainMenu();
  } catch (error) {
    console.error("Fatal error:", error.message);
    rl.close();
    process.exit(1);
  }
})();

