// lib/htmlToDocument.mjs
//
// For pages that are hard to scrape headlessly, the user saves the raw
// HTML by hand and drops it in HTMLsToScrape/. This parses that file into
// the same documentData shape produced by the Playwright scraper, so it
// flows through the same summarize/word-frequency pipeline.

import fs from "fs";
import * as cheerio from "cheerio";

/**
 * @param {string} filePath - path to the .html/.htm file
 * @param {number} orderNumber
 * @returns {object} documentData
 */
export function parseHtmlFile(filePath, orderNumber) {
  const html = fs.readFileSync(filePath, "utf-8");
  const $ = cheerio.load(html);

  let title = $("title").first().text().trim();
  if (!title) {
    title = $("h1").first().text().trim();
  }

  const content = [];
  $("h1, h2, h3, h4, h5, h6, p, span").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().trim();
    if (text.length > 0) {
      content.push({ tag, text });
    }
  });

  return {
    orderNumber,
    url: null,
    sourceFile: filePath,
    title: title || "No Title Found",
    content,
    scrapedAt: new Date().toISOString(),
    totalElements: content.length
  };
}
