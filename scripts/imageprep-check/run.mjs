import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"]
});
const page = await browser.newPage();

page.on("console", (m) => console.log(`  [console.${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));

await page.goto("http://localhost:8899/test.html");
// Wait for the harness to finish, however long the canvas encoding actually takes.
await page.waitForFunction(() => document.title === "ALLPASS" || document.title === "HASFAIL", null, {
  timeout: 120000
});

const out = await page.textContent("#out");
console.log(out);
console.log("\nTITLE:", await page.title());
await browser.close();
process.exit((await Promise.resolve(out)).includes("FAIL ") ? 1 : 0);
