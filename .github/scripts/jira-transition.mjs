// Moves a ticket to a named status, and says plainly when it cannot.
//
// Jira does not let you set a status directly: you ask for the list of transitions available
// from where the ticket currently is, and take the one whose destination has the name you
// want. That matters here because the promotion gate depends on two statuses (QA and
// Approved) that only exist once somebody adds them to the board workflow. Until then this
// exits quietly rather than failing a run, so the whole arrangement is inert instead of
// broken while it is half configured.
//
// Usage: ISSUE_KEY=SCRUM-12 TO_STATUS=QA node .github/scripts/jira-transition.mjs

import { pathToFileURL } from "node:url";

const BASE = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const EMAIL = process.env.JIRA_USER_EMAIL || "";
const TOKEN = process.env.JIRA_API_TOKEN || "";
const ISSUE = (process.env.ISSUE_KEY || "").trim();
const TO = (process.env.TO_STATUS || "").trim();

// Which transition takes us where we want to go. Matched on the destination status name and
// case-insensitively, because a board that spells it "QA" and one that spells it "Qa" are
// the same board to everyone except a string comparison.
export function pickTransition(transitions, wanted) {
  const target = (wanted || "").trim().toLowerCase();
  if (!target) return null;
  const list = transitions || [];
  const byDestination = list.find((t) => (t?.to?.name || "").trim().toLowerCase() === target);
  if (byDestination) return byDestination;
  // Some boards name the transition after the destination without exposing `to`.
  return list.find((t) => (t?.name || "").trim().toLowerCase() === target) || null;
}

async function main() {
  if (!BASE || !EMAIL || !TOKEN || !ISSUE || !TO) {
    console.log("Not configured (needs Jira credentials, ISSUE_KEY and TO_STATUS). Doing nothing.");
    return;
  }

  const auth = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
  const headers = { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" };

  const r = await fetch(`${BASE}/rest/api/3/issue/${ISSUE}/transitions`, { headers });
  if (!r.ok) {
    console.log(`Could not read the transitions for ${ISSUE} (${r.status}). Leaving it where it is.`);
    return;
  }

  const { transitions } = await r.json();
  const move = pickTransition(transitions, TO);
  if (!move) {
    const available = (transitions || []).map((t) => t?.to?.name || t?.name).filter(Boolean).join(", ");
    console.log(`${ISSUE} cannot move to "${TO}" from where it is. Available: ${available || "none"}.`);
    console.log("If that status does not exist yet, add it in the board workflow. Nothing is broken meanwhile.");
    return;
  }

  const t = await fetch(`${BASE}/rest/api/3/issue/${ISSUE}/transitions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ transition: { id: move.id } })
  });
  console.log(t.ok ? `${ISSUE} moved to ${TO}.` : `Could not move ${ISSUE} to ${TO}: ${await t.text()}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
