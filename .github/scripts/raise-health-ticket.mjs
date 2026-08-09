// Puts a failing health check on the board as a bug, so the autopilot picks it up on its
// next sweep and the loop closes on itself.
//
// Deliberately does not open a second ticket for a problem that is already open, and since
// 2026-08-09 does not repeat itself on the ticket it already opened. A watchdog that files
// the same bug every two hours is a watchdog everyone turns off; one that posts the same
// comment forty times is one nobody can read.

import { pathToFileURL } from "node:url";

const BASE = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const EMAIL = process.env.JIRA_USER_EMAIL || "";
const TOKEN = process.env.JIRA_API_TOKEN || "";
const SUMMARY = (process.env.SUMMARY || "unspecified").trim();
const RUN_URL = process.env.RUN_URL || "";
const PROJECT = "SCRUM";
const MARKER = "[health]";

// Jira comment bodies are ADF, so the words live in nested content nodes.
export function commentText(comment) {
  const out = [];
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (typeof node.text === "string") out.push(node.text);
    for (const child of node.content || []) walk(child);
  })(comment?.body);
  return out.join("\n");
}

// True when the ticket has already been told this exact thing.
//
// The watchdog runs every two hours and after every deploy, and a failure that needs a
// person can sit for days. SCRUM-12 collected 45 comments in three days, alternating "Still
// failing" with an autopilot run that could not fix it, because the fix was a database
// script no machine is allowed to run.
//
// Repeating a message nobody has acted on does not make it likelier to be acted on. It makes
// the ticket unreadable, and because every comment re-queues the ticket for the autopilot, it
// spends a model call each time to say the same thing.
//
// So: say it once, and again only when what is failing CHANGES. The run still fails either
// way, so the signal is never lost, only the repetition. Comparing the summary is enough,
// because the summary IS the list of failing check names: if it changes, something new is
// wrong and that is worth saying.
export function alreadySaid(comments, summary) {
  const wanted = (summary || "").trim();
  if (!wanted) return false;
  return (comments || []).some((c) => commentText(c).includes(wanted));
}

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

async function main() {
  if (!BASE || !EMAIL || !TOKEN) {
    console.log("Jira is not configured, so no ticket was raised.");
    return;
  }

  const auth = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
  const headers = { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" };

  // Already open? Say so on the existing ticket instead of making another, and only when the
  // ticket does not already say it.
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
        // The newest handful, not the whole thread: a ticket failing for days holds dozens,
        // and only the recent ones say what is failing now.
        let recent = [];
        try {
          const cr = await fetch(
            `${BASE}/rest/api/3/issue/${open.key}/comment?orderBy=-created&maxResults=10`,
            { headers }
          );
          if (cr.ok) recent = (await cr.json()).comments || [];
        } catch {
          // Fall through and comment. Saying it twice is a smaller failure than going silent
          // on a change in what is broken.
        }

        if (alreadySaid(recent, SUMMARY)) {
          console.log(`${open.key} already says this, and nothing has changed. Staying quiet.`);
          return;
        }

        await fetch(`${BASE}/rest/api/3/issue/${open.key}/comment`, {
          method: "POST",
          headers,
          body: JSON.stringify({ body: adf(`Still failing.\n\n${SUMMARY}\n\nRun: ${RUN_URL}`) })
        });
        console.log(`${open.key} is already open for this; added a note instead.`);
        return;
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

  const fields = {
    project: { key: PROJECT },
    summary: `${MARKER} Live site health check failing`,
    description: adf(description)
  };

  const r = await fetch(`${BASE}/rest/api/3/issue`, {
    method: "POST",
    headers,
    body: JSON.stringify({ fields: { ...fields, issuetype: { name: "Bug" } } })
  });

  if (!r.ok) {
    // Bug may not be an issue type on this board; fall back to Task rather than losing the alert.
    const detail = await r.text();
    console.log(`Could not raise a Bug (${r.status}): ${detail.slice(0, 300)}`);
    const retry = await fetch(`${BASE}/rest/api/3/issue`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fields: { ...fields, issuetype: { name: "Task" } } })
    });
    console.log(retry.ok ? "Raised as a Task." : `Could not raise a ticket: ${await retry.text()}`);
    return;
  }

  const created = await r.json();
  console.log(`Raised ${created.key}.`);
}

// Only run when invoked directly, so the rules above can be tested without firing the script.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
