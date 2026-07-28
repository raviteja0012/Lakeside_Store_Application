// Finds the one ticket the autopilot should work this run.
//
// "Work" means a ticket in the connected projects that is not Done and has either never
// been picked up or has been commented on since the app last touched it. Oldest first, so
// nothing waits forever behind a busy ticket.
//
// Writes three outputs: found, issue_key, ticket (the text handed to the build step).

import { appendFileSync } from "node:fs";

const BASE = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const EMAIL = process.env.JIRA_USER_EMAIL || "";
const TOKEN = process.env.JIRA_API_TOKEN || "";
const ONE = (process.env.ONE_ISSUE || "").trim();

// The marker the autopilot leaves behind. A ticket whose newest comment is this marker has
// already been worked and is waiting on a person, so it is skipped until someone replies.
const MARKER = "[autopilot]";
const PROJECTS = ["SCRUM", "RGS"];

const auth = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");

function out(key, value) {
  const f = process.env.GITHUB_OUTPUT;
  if (!f) return;
  const v = String(value);
  if (v.includes("\n")) {
    const d = `EOF_${Math.abs(hash(v))}`;
    appendFileSync(f, `${key}<<${d}\n${v}\n${d}\n`);
  } else {
    appendFileSync(f, `${key}=${v}\n`);
  }
}
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

async function jira(path) {
  const r = await fetch(`${BASE}/rest/api/3${path}`, {
    headers: { Authorization: auth, Accept: "application/json" }
  });
  if (!r.ok) throw new Error(`Jira ${path} returned ${r.status}`);
  return r.json();
}

// Atlassian document format to plain text, keeping only what a builder needs.
function flatten(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(flatten).join("");
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  const inner = flatten(node.content);
  return ["paragraph", "heading", "listItem", "codeBlock"].includes(node.type) ? inner + "\n" : inner;
}

const jql = ONE
  ? `key = ${ONE}`
  : `project in (${PROJECTS.join(",")}) AND statusCategory != Done ORDER BY updated ASC`;

let data;
try {
  data = await jira(`/search?jql=${encodeURIComponent(jql)}&maxResults=25&fields=summary,description,status,updated,comment,issuetype`);
} catch (e) {
  console.log(`Could not read the board: ${e.message}`);
  out("found", "false");
  process.exit(0);
}

const issues = data.issues || [];
let picked = null;

for (const i of issues) {
  const comments = i.fields?.comment?.comments || [];
  const last = comments[comments.length - 1];
  const lastIsOurs = last && flatten(last.body).includes(MARKER);
  // Already worked and nobody has replied since: leave it for the person.
  if (lastIsOurs && !ONE) continue;
  // Nothing to go on.
  const hasBrief = !!i.fields?.description || comments.length > 0;
  if (!hasBrief && !ONE) continue;
  picked = i;
  break;
}

if (!picked) {
  console.log("Nothing new on the board.");
  out("found", "false");
  process.exit(0);
}

const f = picked.fields;
const comments = (f.comment?.comments || [])
  .map((c) => `--- comment by ${c.author?.displayName || "someone"} on ${c.created}:\n${flatten(c.body).trim()}`)
  .join("\n\n");

const ticket = [
  `KEY: ${picked.key}`,
  `TYPE: ${f.issuetype?.name || "Task"}`,
  `STATUS: ${f.status?.name || ""}`,
  `SUMMARY: ${f.summary || ""}`,
  "",
  "DESCRIPTION:",
  flatten(f.description).trim() || "(none)",
  "",
  "COMMENTS (newest last):",
  comments || "(none)"
].join("\n");

console.log(`Working ${picked.key}: ${f.summary}`);
out("found", "true");
out("issue_key", picked.key);
out("ticket", ticket);
