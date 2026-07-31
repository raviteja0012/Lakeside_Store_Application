// Finds the one ticket the autopilot should work this run.
//
// "Work" means a ticket in the connected projects that is not Done and has either never
// been picked up or has been commented on since the app last touched it. Oldest first, so
// nothing waits forever behind a busy ticket.
//
// Writes three outputs: found, issue_key, ticket (the text handed to the build step).

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

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

// Search runs through /search/jql. The older GET /search was removed by Atlassian and now
// answers 410 Gone, which looked exactly like "no work" until the log was read.
async function searchJira(jql, fields, maxResults) {
  const r = await fetch(`${BASE}/rest/api/3/search/jql`, {
    method: "POST",
    headers: { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ jql, fields, maxResults })
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 400);
    // A bad status here means the setup is wrong (credentials, permissions, or the API
    // moved again). Fail loudly: a run that quietly does nothing is indistinguishable from
    // a healthy run with an empty board, which is how the 410 went unnoticed.
    const err = new Error(`Jira search returned ${r.status}. ${detail}`);
    err.fatal = true;
    throw err;
  }
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

// Open tickets, PLUS recently closed ones that have been commented on since.
//
// The first version asked only for tickets that were not Done, which quietly broke the
// thing the docs promised: replying to a closed ticket is how you ask for a follow-up, and
// the owner did exactly that five times on a closed story while thirty-one green runs swept
// past it. A closed ticket someone is still talking on is open work, whatever its status
// says. The comment marker below is what stops this from re-working every old ticket: a
// closed ticket is only picked up when the last word on it is not the autopilot's.
const RECENT_DAYS = 30;
const jql = ONE
  ? `key = ${ONE}`
  : `project in (${PROJECTS.join(",")}) AND (statusCategory != Done OR updated >= -${RECENT_DAYS}d) ORDER BY updated ASC`;

// Comments come from their own endpoint rather than the search response: whether search
// returns them depends on the API version, and a silently missing comment list would make
// every already-worked ticket look new and get built twice.
async function commentsFor(key) {
  const r = await fetch(`${BASE}/rest/api/3/issue/${key}/comment?maxResults=50&orderBy=created`, {
    headers: { Authorization: auth, Accept: "application/json" }
  });
  if (!r.ok) {
    const err = new Error(`Reading comments on ${key} returned ${r.status}.`);
    err.fatal = true;
    throw err;
  }
  const j = await r.json();
  return j.comments || [];
}

const FIELDS = ["summary", "description", "status", "updated", "issuetype", "statuscategorychangedate"];

const isDone = (i) => i.fields?.status?.statusCategory?.key === "done";

// Somebody spoke on a closed ticket AFTER it was closed, so it is work again.
//
// The grace window covers the ordinary way a ticket gets closed: a note explaining what was
// done, then the transition a moment later. Without it, whether a finished ticket reopens
// itself depends on which of those two clicks landed first, and on this board the gap has
// been as small as nine seconds. A genuine follow-up arrives hours or days later, so a
// minute costs nothing.
export const CLOSE_GRACE_MS = 60000;
export function reopenedByComment(closedAtISO, lastCommentISO) {
  const closedAt = Date.parse(closedAtISO || "");
  const lastAt = Date.parse(lastCommentISO || "");
  if (!Number.isFinite(closedAt) || !Number.isFinite(lastAt)) return false;
  return lastAt > closedAt + CLOSE_GRACE_MS;
}

// Only sweep the board when run directly. Imported (by the test beside this file) the
// module exposes its rules and does nothing.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (!isMain) {
  // eslint-disable-next-line no-undef
  process.exitCode = 0;
}

if (isMain) {
let issues = [];
let picked = null;
let pickedComments = [];
try {
  const data = await searchJira(jql, FIELDS, 25);
  issues = data.issues || [];

  for (const i of issues) {
    const comments = await commentsFor(i.key);
    const last = comments[comments.length - 1];
    const lastIsOurs = last && flatten(last.body).includes(MARKER);
    // Already worked and nobody has replied since: leave it for the person.
    if (lastIsOurs && !ONE) continue;

    // A closed ticket counts as work ONLY when somebody has spoken on it since it was
    // closed. Without this the sweep would re-open every ticket finished in the last month,
    // because the closing note is itself the newest comment on all of them.
    if (isDone(i) && !ONE) {
      if (!reopenedByComment(i.fields?.statuscategorychangedate, last?.created)) continue;
      console.log(`${i.key} is closed but was commented on after closing; treating it as work.`);
    }

    // Nothing to go on.
    const hasBrief = !!i.fields?.description || comments.length > 0;
    if (!hasBrief && !ONE) continue;
    picked = i;
    pickedComments = comments;
    break;
  }
} catch (e) {
  console.log(`Could not read the board: ${e.message}`);
  out("found", "false");
  // Configuration problems stop the run so somebody sees red; a network blip does not.
  process.exit(e.fatal ? 1 : 0);
}

if (!picked) {
  console.log(`Nothing new on the board. Checked ${issues.length} open ${issues.length === 1 ? "ticket" : "tickets"}.`);
  out("found", "false");
  process.exit(0);
}

const f = picked.fields;
const comments = pickedComments
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
}
