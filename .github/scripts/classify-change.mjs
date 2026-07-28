// Decides how far a change is allowed to travel on its own.
//
// The model writes the code. THIS decides whether it merges. That split is the whole point:
// a judgement the model makes about its own work is a judgement it can talk itself into, so
// the gate is a script reading the actual diff, and nothing in a Jira ticket or a prompt can
// move it.
//
// A  the change only touches words. Merges itself once the checks are green, and deploys.
// B  the change touches the app. Draft pull request, a person merges. This is the default.
// C  the change touches money, access, the database, or the automation itself.
//    Nothing merges. It is reported and left for a person.
//
// Usage: node classify-change.mjs <base-ref>   (writes tier and reason to GITHUB_OUTPUT)

import { execSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const base = process.argv[2] || "origin/main";

// Money, access, the database, and the automation's own guard rails. The last two matter
// most: a loop that can edit its own limits does not have limits, and a loop that can edit
// its own reviewer has no reviewer.
const BLOCKED = [
  /^supabase\//,
  /^src\/lib\/payments\.ts$/,
  /^src\/lib\/auth\.ts$/,
  /^src\/lib\/edit\.ts$/,
  /^src\/lib\/serverMember\.ts$/,
  /^src\/lib\/supabaseClient\.ts$/,
  /^src\/app\/api\//,
  /^\.github\//,
  /^\.claude\//,
  /^vercel\.json$/,
  /^package\.json$/,
  /^package-lock\.json$/
];

// Words only. No logic lives in any of these.
const WORDS_ONLY = [
  /^docs\//,
  /^[^/]+\.md$/,
  /^src\/lib\/appGuide\.ts$/
];

// A words-only change should be small. A thousand-line "documentation" change is something
// else wearing a hat.
const MAX_AUTO_LINES = 300;

function out(key, value) {
  const f = process.env.GITHUB_OUTPUT;
  console.log(`${key}: ${value}`);
  if (f) appendFileSync(f, `${key}=${String(value).replace(/\n/g, " ")}\n`);
}

let files = [];
let changedLines = 0;
try {
  files = execSync(`git diff --name-only ${base}...HEAD`, { encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean);
  const stat = execSync(`git diff --shortstat ${base}...HEAD`, { encoding: "utf8" });
  const ins = /(\d+) insertion/.exec(stat);
  const del = /(\d+) deletion/.exec(stat);
  changedLines = Number(ins?.[1] || 0) + Number(del?.[1] || 0);
} catch (e) {
  out("tier", "C");
  out("reason", `Could not read the diff, so nothing is merged: ${e.message}`);
  process.exit(0);
}

if (!files.length) {
  out("tier", "none");
  out("reason", "Nothing changed.");
  process.exit(0);
}

const blocked = files.filter((f) => BLOCKED.some((r) => r.test(f)));
if (blocked.length) {
  out("tier", "C");
  out("reason", `Touches files a person must review: ${blocked.slice(0, 5).join(", ")}`);
  process.exit(0);
}

const notWords = files.filter((f) => !WORDS_ONLY.some((r) => r.test(f)));
if (!notWords.length && changedLines <= MAX_AUTO_LINES) {
  out("tier", "A");
  out("reason", `Words only (${files.length} files, ${changedLines} lines).`);
  process.exit(0);
}

out("tier", "B");
out(
  "reason",
  notWords.length
    ? `Touches the app: ${notWords.slice(0, 5).join(", ")}`
    : `Words only but large (${changedLines} lines), so a person looks first.`
);
