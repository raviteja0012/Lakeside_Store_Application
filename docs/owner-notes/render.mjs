// Render the owner-facing notes in this folder to A4 PDFs.
//
//   node docs/owner-notes/render.mjs [outputDir]
//
// The .html files here are page fragments, the same shape the artifact host
// publishes: a <title>, a <style>, and the content, with no doctype or <body>.
// The host supplies that wrapper, so this script supplies the same one before
// printing. Without it Chromium lays out in quirks mode and the PDF stops
// matching the page the owner was sent.
//
// Chromium comes from the Playwright browser cache when one is present
// (PLAYWRIGHT_BROWSERS_PATH, set in the cloud build container), and otherwise
// from CHROME_PATH. Nothing is downloaded.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || join(here, "pdf");

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (existsSync(root)) {
    // chromium-<build>/chrome-linux/chrome. Take the highest build present.
    const builds = readdirSync(root)
      .filter((d) => d.startsWith("chromium-"))
      .sort()
      .reverse();
    for (const b of builds) {
      const p = join(root, b, "chrome-linux", "chrome");
      if (existsSync(p)) return p;
    }
  }
  throw new Error("No Chromium found. Set CHROME_PATH to a Chrome or Chromium binary.");
}

const chrome = findChrome();
mkdirSync(outDir, { recursive: true });

// The date is part of the filename so an older copy is never mistaken for the
// current one after the owner has been sent both.
const stamp = new Date().toISOString().slice(0, 10);

const NAMES = {
  "vendor-fields-requirement.html": "Robinsons-Vendor-Details-Requirement",
  "store-app-infrastructure.html": "Robinsons-App-and-Infrastructure"
};

for (const file of readdirSync(here).filter((f) => f.endsWith(".html"))) {
  const wrapped = join(outDir, basename(file, ".html") + ".wrapped.html");
  writeFileSync(
    wrapped,
    `<!doctype html>\n<html lang="en-CA">\n<head>\n<meta charset="utf-8">\n` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n` +
      readFileSync(join(here, file), "utf8") +
      `\n</body>\n</html>\n`
  );

  const pdf = join(outDir, `${NAMES[file] || basename(file, ".html")}-${stamp}.pdf`);
  execFileSync(chrome, [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=8000",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdf}`,
    `file://${wrapped}`
  ], { stdio: ["ignore", "ignore", "inherit"] });

  console.log("wrote", pdf);
}
