// Which tickets has the owner approved for production?
//
// "Approved" is Ravi's word that a change is right, given after he has tried it on the dev
// site. Moving a ticket there is what promotes the change to production, so this query is
// the promotion gate: no ticket in Approved means nothing ships, however green everything is.
//
// If the Approved status does not exist on the board yet, the JQL fails and this reports
// nothing found rather than failing the run. The whole arrangement is then inert, which is
// the correct state for a gate whose gatepost has not been built.

import { appendFileSync } from "node:fs";

const BASE = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const EMAIL = process.env.JIRA_USER_EMAIL || "";
const TOKEN = process.env.JIRA_API_TOKEN || "";
const PROJECT = "SCRUM";
const STATUS = "Approved";

function out(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  console.log(`${key}=${value}`);
}

if (!BASE || !EMAIL || !TOKEN) {
  console.log("Jira is not configured, so there is nothing to promote.");
  out("found", "false");
  out("keys", "");
  process.exit(0);
}

const auth = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
const headers = { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" };

let issues = [];
try {
  const r = await fetch(`${BASE}/rest/api/3/search/jql`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jql: `project = ${PROJECT} AND status = "${STATUS}" ORDER BY updated ASC`,
      fields: ["summary"],
      maxResults: 50
    })
  });
  if (!r.ok) {
    // Most likely cause by far: the status does not exist yet. Say which, and stay quiet.
    const detail = (await r.text()).slice(0, 300);
    console.log(`Could not ask for ${STATUS} tickets (${r.status}): ${detail}`);
    console.log(`If "${STATUS}" is not a status on this board yet, add it in the board workflow.`);
    out("found", "false");
    out("keys", "");
    process.exit(0);
  }
  issues = (await r.json()).issues || [];
} catch (e) {
  console.log(`Could not reach Jira: ${e.message}`);
  out("found", "false");
  out("keys", "");
  process.exit(0);
}

if (!issues.length) {
  console.log(`Nothing is in ${STATUS}, so nothing is waiting to go live.`);
  out("found", "false");
  out("keys", "");
  process.exit(0);
}

const keys = issues.map((i) => i.key);
console.log(`Approved and waiting to go live: ${keys.join(", ")}`);
for (const i of issues) console.log(`  ${i.key}  ${i.fields?.summary || ""}`);
out("found", "true");
out("keys", keys.join(","));
