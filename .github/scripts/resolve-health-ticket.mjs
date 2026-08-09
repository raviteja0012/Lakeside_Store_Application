// Closes the health ticket when the site is well again.
//
// The other half of raise-health-ticket.mjs, and the half that was missing. A watchdog that
// opens tickets and never closes them leaves the board saying the site is broken long after
// it was fixed, and the next real incident then lands as a comment on a stale ticket named
// after the last one. SCRUM-12 sat open for exactly that reason: the site recovered and
// nothing was watching for the recovery.
//
// The rule a monitoring loop has to follow is that it closes what it opens. Raising is the
// easy half; this is the half that keeps the board honest.
//
// Costs nothing to run: two HTTP calls when a ticket is open, one when none is, and no
// model call ever. It is safe on the two-hourly schedule.

import { pathToFileURL } from "node:url";
import { pickTransition } from "./jira-transition.mjs";

const BASE = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const EMAIL = process.env.JIRA_USER_EMAIL || "";
const TOKEN = process.env.JIRA_API_TOKEN || "";
const RUN_URL = process.env.RUN_URL || "";
const SUMMARY = (process.env.SUMMARY || "").trim();
const PROJECT = "SCRUM";
const MARKER = "[health]";

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
    console.log("Jira is not configured, so there is nothing to close.");
    return;
  }

  const auth = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
  const headers = { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" };

  let open;
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
    if (!r.ok) {
      console.log(`Could not look for an open health ticket (${r.status}). Leaving the board alone.`);
      return;
    }
    open = ((await r.json()).issues || [])[0];
  } catch (e) {
    console.log(`Could not reach Jira: ${e.message}`);
    return;
  }

  if (!open) {
    // The normal case by a wide margin: the site is well and nothing was ever raised.
    console.log("The site is well and no health ticket is open. Nothing to do.");
    return;
  }

  // Say what recovered before closing it. A ticket that goes from "failing" straight to Done
  // with no explanation is the kind of history that makes the next person distrust the board.
  const note = [
    "The live site is passing its health check again, so this is resolved.",
    "",
    SUMMARY || "All checks passed.",
    "",
    "Closed by the post-deploy watchdog, which raised it. Nothing here needs a person.",
    "",
    `Run: ${RUN_URL}`
  ].join("\n");

  try {
    await fetch(`${BASE}/rest/api/3/issue/${open.key}/comment`, {
      method: "POST",
      headers,
      body: JSON.stringify({ body: adf(note) })
    });
  } catch (e) {
    console.log(`Could not comment on ${open.key}: ${e.message}`);
  }

  // Move it to Done. If the board will not allow that from where the ticket is, say so and
  // stop: a ticket left open with a "this is fixed" comment on it is a small untidiness, and
  // forcing a transition that the board's workflow forbids is a larger one.
  try {
    const t = await fetch(`${BASE}/rest/api/3/issue/${open.key}/transitions`, { headers });
    if (!t.ok) {
      console.log(`Commented on ${open.key} but could not read its transitions (${t.status}).`);
      return;
    }
    const move = pickTransition((await t.json()).transitions, "Done");
    if (!move) {
      console.log(`Commented on ${open.key}, but it cannot move to Done from its current status.`);
      return;
    }
    const done = await fetch(`${BASE}/rest/api/3/issue/${open.key}/transitions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ transition: { id: move.id } })
    });
    console.log(done.ok ? `${open.key} closed: the site recovered.` : `Could not close ${open.key}: ${await done.text()}`);
  } catch (e) {
    console.log(`Could not close ${open.key}: ${e.message}`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
