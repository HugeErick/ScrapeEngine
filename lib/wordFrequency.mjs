// lib/wordFrequency.mjs
//
// Portable replacement for freqHtml.sh. The shell script actually counted
// numeric tokens (grep -oE '\b[0-9]+\b'), but this computes real
// "significant word" frequency: lowercased, punctuation stripped, common
// stopwords and very short tokens dropped.

const STOPWORDS = new Set([
  "a","about","above","after","again","against","all","am","an","and","any","are","aren't","as","at",
  "be","because","been","before","being","below","between","both","but","by",
  "can","cannot","could","couldn't",
  "did","didn't","do","does","doesn't","doing","don't","down","during",
  "each","few","for","from","further",
  "had","hadn't","has","hasn't","have","haven't","having","he","he'd","he'll","he's","her","here",
  "here's","hers","herself","him","himself","his","how","how's",
  "i","i'd","i'll","i'm","i've","if","in","into","is","isn't","it","it's","its","itself",
  "let's",
  "me","more","most","mustn't","my","myself",
  "no","nor","not",
  "of","off","on","once","only","or","other","ought","our","ours","ourselves","out","over","own",
  "same","shan't","she","she'd","she'll","she's","should","shouldn't","so","some","such",
  "than","that","that's","the","their","theirs","them","themselves","then","there","there's",
  "these","they","they'd","they'll","they're","they've","this","those","through","to","too",
  "under","until","up",
  "very",
  "was","wasn't","we","we'd","we'll","we're","we've","were","weren't","what","what's","when","when's",
  "where","where's","which","while","who","who's","whom","why","why's","with","won't","would","wouldn't",
  "you","you'd","you'll","you're","you've","your","yours","yourself","yourselves"
]);

/**
 * Computes significant word frequency from a block of text.
 *
 * @param {string} text
 * @param {number} topN - how many top words to keep (default 25, 0 = all)
 * @param {number} minLength - minimum word length to count (default 3)
 * @returns {{word: string, count: number}[]} sorted descending by count
 */
export function computeWordFrequency(text, topN = 25, minLength = 3) {
  if (!text || typeof text !== "string") return [];

  const rawWords = text.toLowerCase().match(/[a-z']+/g) || [];
  const counts = new Map();

  for (const raw of rawWords) {
    const word = raw.replace(/^'+|'+$/g, ""); // trim stray leading/trailing apostrophes
    if (word.length < minLength) continue;
    if (STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count }));

  return topN > 0 ? sorted.slice(0, topN) : sorted;
}

/**
 * Flattens a documentData.content array ([{tag, text}, ...], the shape
 * used throughout this project) into a single string for analysis.
 */
export function extractTextFromContent(content) {
  if (!Array.isArray(content)) return "";
  return content.map(item => item.text).join(" ");
}
