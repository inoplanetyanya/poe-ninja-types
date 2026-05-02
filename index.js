import fs from "fs";

const ECONOMY_URL = "https://poe.ninja/poe1/economy/standard/currency";
const ASSETS_URL = "https://assets.poe.ninja";
const OVERVIEW_PATH_RE = /(\/_astro\/Poe1CurrencyOverviewPage\..+?\.js)"/;
const ENRICHMENT_FILE_RE = /\.\/(poe1ImageEnrichment\..+?\.js)";/;
const TYPES_START_MARKER = '[{name:"General",pages:[{';

async function fetchText(url, stepName) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${stepName}: request failed with status ${response.status}`);
  }

  return response.text();
}

function getFirstCapture(text, regexp, stepName) {
  const match = text.match(regexp);
  if (!match || !match[1]) {
    throw new Error(`${stepName}: expected pattern was not found`);
  }

  return match[1];
}

function extractOverviewPagePath(pageHtml) {
  return getFirstCapture(pageHtml, OVERVIEW_PATH_RE, "extract overview path");
}

function extractEnrichmentFileName(overviewPageCode) {
  return getFirstCapture(overviewPageCode, ENRICHMENT_FILE_RE, "extract enrichment path");
}

function extractTypes(code) {
  const start = code.indexOf(TYPES_START_MARKER);
  if (start === -1) {
    throw new Error("extract types: types array start marker not found");
  }

  let depth = 0;
  let end = start;

  for (; end < code.length; end++) {
    if (code[end] === "[") depth++;
    if (code[end] === "]") {
      depth--;
      if (depth === 0) {
        end++;
        break;
      }
    }
  }

  if (depth !== 0) {
    throw new Error("extract types: unterminated types array");
  }

  const arrayStr = code.slice(start, end);
  const jsonLikeStr = arrayStr.replace(/!0/g, "true").replace(/!1/g, "false");

  function minifyObj(types) {
    return types.map((category) => {
      const { name, pages } = category;

      return {
        name,
        pages: pages.map((page) => {
          const { icon, title, type, url, availableViews } = page;

          return {
            availableViews,
            icon,
            title,
            type,
            url,
          };
        }),
      };
    });
  }

  try {
    const parsed = JSON.parse(jsonLikeStr);
    const result = minifyObj(parsed);

    return result;
  } catch {
    const rawData = new Function(`return ${arrayStr}`)();
    const result = minifyObj(rawData);

    return result;
  }
}

async function getPoeNinjaTypes() {
  const pageHtml = await fetchText(ECONOMY_URL, "fetch economy page");
  const overviewPagePath = extractOverviewPagePath(pageHtml);
  console.log("Poe1CurrencyOverviewPage.**.js: ", overviewPagePath);

  const overviewPageCode = await fetchText(`${ASSETS_URL}${overviewPagePath}`, "fetch overview page bundle");
  const enrichmentFileName = extractEnrichmentFileName(overviewPageCode);
  console.log("poe1ImageEnrichment.**.js: ", `/${enrichmentFileName}`);

  const enrichmentUrl = `${ASSETS_URL}/_astro/${enrichmentFileName}`;
  const enrichmentCode = await fetchText(enrichmentUrl, "fetch enrichment bundle");

  return extractTypes(enrichmentCode);
}

async function main() {
  try {
    const types = await getPoeNinjaTypes();
    const toWrite = JSON.stringify(types);
    fs.writeFileSync("./poe1-types.json", toWrite);
    console.log("completed successfully");
  } catch (error) {
    console.error(error);
  }
}

main();
