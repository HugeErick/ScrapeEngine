# ScrapeEngine (Web Scraper)

## Description

ScrapeEngine is a lightweight web scraper built using Playwright and Node.js. It extracts content from specified URLs, focusing several html tags, and saves the scraped data into individual JSON files. Each document includes an order number, URL, title, and extracted content for easy reference.

This tool is ideal for quickly gathering and organizing textual content from multiple web pages at the same time.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [License](#license)
- [Contact](#contact)

## Prerequisites

Before running the scraper, ensure you have the following installed:

1. **Node.js**: Version 16 or higher. Download it from [here](https://nodejs.org/).
2. **Playwright**: Installed automatically via `npm` or ur favorite package manager.

## Installation

1. Clone the repository:
   ```bash
   git https://github.com/HugeErick/ScrapeEngine.git
   cd ScraperDaper
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install Playwright browsers:
   ```bash
   npx playwright install
   ```
## Usage

1. Update the `urls` array in `index.mjs` with the URLs you want to scrape.
2. Run the scraper:
   ```bash
   node index.mjs
   ```
3. The scraped data will be saved as individual JSON files in the root directory, named `document_1.json`, `document_2.json`, etc.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

Erick Gonzalez Parada - <erick.parada101@gmail.com>

Project Link: [https://github.com/HugeErick/ScrapeEngine](https://github.com/HugeErick/ScrapeEngine)

