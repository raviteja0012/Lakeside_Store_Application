// Puts the run's outcome back on the ticket in plain words, so the owner sees what
// happened without opening GitHub. Reads autopilot-comment.txt if the build step wrote
// one; otherwise says the run did not finish and links to it.

import { readFileSync, existsSync } from "node:fs";

const BASE = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const EMAIL = process.env.JIRA_USER_EMAIL || "";
const TOKEN = process.env.JIRA_API_TOKEN || "";
const KEY = (process.env.ISSUE_KEY || "").trim();
const RUN_URL = process.env.RUN_URL || "";

if (!KEY) {
  console.log("No ticket to comment on.");
  process.exit(0);
}

const body = existsSync("autopilot-comment.txt")
  ? readFileSync("autopilot-comment.txt", "utf8").trim()
  : "The automatic build did not finish this time. Nothing was changed. The run log has the detail.";

// [autopilot] marks the comment as ours so the next sweep knows this ticket is waiting on
// a person rather than picking it up again.
const text = `[autopilot] ${body}\n\nRun: ${RUN_URL}`;

const doc = {
  body: {
    type: "doc",
    version: 1,
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : []
    }))
  }
};

const r = await fetch(`${BASE}/rest/api/3/issue/${KEY}/comment`, {
  method: "POST",
  headers: {
    Authorization: "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64"),
    "Content-Type": "application/json",
    Accept: "application/json"
  },
  body: JSON.stringify(doc)
});

if (!r.ok) {
  console.log(`Could not comment on ${KEY}: ${r.status} ${await r.text()}`);
  process.exit(0);
}
console.log(`Commented on ${KEY}.`);
