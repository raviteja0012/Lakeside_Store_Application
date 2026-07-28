// Puts a failing health check on the board as a bug, so the autopilot picks it up on its
// next sweep and the loop closes on itself.
//
// Deliberately does not open a second ticket for a problem that is already open. A watchdog
// that files the same bug every two hours is a watchdog everyone turns off.

const BASE = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const EMAIL = process.env.JIRA_USER_EMAIL || "";
const TOKEN = process.env.JIRA_API_TOKEN || "";
const SUMMARY = (process.env.SUMMARY || "unspecified").trim();
const RUN_URL = process.env.RUN_URL || "";
const PROJECT = "SCRUM";
const MARKER = "[health]";

if (!BASE || !EMAIL || !TOKEN) {
  console.log("Jira is not configured, so no ticket was raised.");
  process.exit(0);
}

const auth = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
const headers = { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" };

function adf(text) {
  return {
    type: "doc",
    version: 1,
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : []
    }))
  };
}

// Already open? Say so on the existing ticket instead of making another.
try {
  const r = await fetch(`${BASE}/rest/api/3/search/jql`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jql: `project = ${PROJECT} AND statusCategory != Done AND summary ~ "${MARKER}" ORDER BY created DESC`,
      fields: ["summary"],
      maxResults: 5
    })
  });
  if (r.ok) {
    const j = await r.json();
    const open = (j.issues || [])[0];
    if (open) {
      await fetch(`${BASE}/rest/api/3/issue/${open.key}/comment`, {
        method: "POST",
        headers,
        body: JSON.stringify({ body: adf(`Still failing.\n\n${SUMMARY}\n\nRun: ${RUN_URL}`) })
      });
      console.log(`${open.key} is already open for this; added a note instead.`);
      process.exit(0);
    }
  }
} catch (e) {
  console.log(`Could not check for an existing ticket: ${e.message}`);
}

const description = [
  "The live site reported a problem in its own health check after a deploy.",
  "",
  "What failed:",
  SUMMARY,
  "",
  "What this means: the deployed app and the deployed database disagree about something",
  "they must agree on, or a column this release needs is missing. The usual causes are a",
  "database script that has not been run yet, or a change that altered what an invoice owes",
  "on one side only.",
  "",
  "First thing to check: whether every script in docs/SUPABASE_SETUP.md has been run.",
  "",
  `Run: ${RUN_URL}`
].join("\n");

const r = await fetch(`${BASE}/rest/api/3/issue`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    fields: {
      project: { key: PROJECT },
      issuetype: { name: "Bug" },
      summary: `${MARKER} Live site health check failing`,
      description: adf(description)
    }
  })
});

if (!r.ok) {
  // Bug may not be an issue type on this board; fall back to Task rather than losing the alert.
  const detail = await r.text();
  console.log(`Could not raise a Bug (${r.status}): ${detail.slice(0, 300)}`);
  const retry = await fetch(`${BASE}/rest/api/3/issue`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      fields: {
        project: { key: PROJECT },
        issuetype: { name: "Task" },
        summary: `${MARKER} Live site health check failing`,
        description: adf(description)
      }
    })
  });
  console.log(retry.ok ? "Raised as a Task." : `Could not raise a ticket: ${await retry.text()}`);
  process.exit(0);
}

const created = await r.json();
console.log(`Raised ${created.key}.`);
