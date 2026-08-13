// Tells Slack when the live site's health changes, and only then.
//
// This replaces the Jira health ticket. A board row carried its own state: an open ticket
// meant "still broken", and closing it WAS the recovery message. Slack has no such state, so
// a naive port would post "the site is down" every two hours for as long as it was down, and
// an alert that repeats itself is one people learn to scroll past. The loop that opens
// tickets has to close them; the loop that posts alerts has to shut up.
//
// The state comes from this workflow's own run history instead: one call to the Actions API,
// no model, nothing new to store. Down is announced on the first run that fails, recovery on
// the first run that passes after a failure, and a run that agrees with the one before it
// says nothing at all.
//
// DELIBERATE DIFFERENCE FROM THE JIRA VERSION. That one added a "still failing" comment when
// the list of failing checks CHANGED while the ticket was open, so a second fault arriving
// during an outage was not swallowed. This does not: the run history gives a pass or a fail
// and not the summary that went with it. While the site is down the run stays red and the
// failing checks are in its log, so the signal is not lost, only quieter. If a second fault
// during an outage turns out to matter, the fix is to store the last summary somewhere this
// script can read, not to post on every run.
//
// Silent when SLACK_WEBHOOK_URL is unset, exactly as the Jira steps were silent without their
// secrets, so this is safe to merge before the webhook exists.

const WEBHOOK = (process.env.SLACK_WEBHOOK_URL || "").trim();
const HEALTHY = (process.env.HEALTHY || "").trim() === "true";
// Set only by running the workflow by hand with "Post a test message" ticked. Scheduled and
// post-deploy runs leave it empty.
const TEST = (process.env.TEST || "").trim() === "true";
const SUMMARY = (process.env.SUMMARY || "unspecified").trim();
const RUN_URL = (process.env.RUN_URL || "").trim();
const SITE = (process.env.SITE || "").trim();
const REPO = (process.env.GITHUB_REPOSITORY || "").trim();
const TOKEN = (process.env.GITHUB_TOKEN || "").trim();
const API = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
const WORKFLOW_FILE = "post-deploy-watch.yml";

/**
 * What to say, given this run's result and whether the previous one failed.
 *
 * Pure, so the rule that decides whether the store's owner gets pinged can be tested without
 * a network, a token, or a Slack workspace.
 */
export function decide({ healthy, previousFailed }) {
  if (healthy) return previousFailed ? "recovered" : "none";
  return previousFailed ? "none" : "down";
}

/**
 * Did the previous completed run of this workflow fail?
 *
 * The run calling this is still in progress, so status=completed already excludes it. An
 * unreadable history returns false, which errs toward announcing: a duplicate "the site is
 * down" is a smaller failure than silence about a real outage.
 */
export async function previousRunFailed(fetchImpl = fetch) {
  if (!REPO || !TOKEN) return false;
  try {
    const url = `${API}/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?status=completed&per_page=1`;
    const res = await fetchImpl(url, {
      headers: {
        authorization: `Bearer ${TOKEN}`,
        accept: "application/vnd.github+json",
        "user-agent": "robinsons-store-watchdog"
      }
    });
    if (!res.ok) return false;
    const data = await res.json();
    const previous = (data.workflow_runs || [])[0];
    return previous ? previous.conclusion === "failure" : false;
  } catch {
    return false;
  }
}

function message(verdict) {
  const where = SITE ? ` (${SITE})` : "";
  if (verdict === "down") {
    return [
      `The store's live site is failing its health check${where}.`,
      "",
      SUMMARY,
      "",
      "Nobody has to do anything in the app for this. It is usually a database script that",
      "has not been run yet, and the line above names the file when that is the cause.",
      RUN_URL ? `Run: ${RUN_URL}` : ""
    ].filter(Boolean).join("\n");
  }
  return [
    `The store's live site is healthy again${where}.`,
    RUN_URL ? `Run: ${RUN_URL}` : ""
  ].filter(Boolean).join("\n");
}

async function post(text, label) {
  if (!WEBHOOK) {
    console.log(`Would have posted "${label}" to Slack, but SLACK_WEBHOOK_URL is not set.`);
    console.log("Add it in Settings, Secrets and variables, Actions, to turn this on.");
    return;
  }
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "robinsons-store-watchdog" },
    body: JSON.stringify({ text })
  });
  if (!res.ok) {
    // Never fail the run over the notification. When the site is down the run is already
    // red for the right reason, and a red run caused by Slack would point at the wrong
    // thing entirely. A warning is visible without being misleading.
    console.log(`::warning::Slack rejected the message (${res.status}). The webhook may be wrong or revoked.`);
    return;
  }
  console.log(`Posted "${label}" to Slack.`);
}

async function main() {
  // The test button. A watchdog that has never spoken is indistinguishable from one that
  // cannot: the site being healthy is exactly when this code path never runs, so without a
  // way to force it, the first proof the webhook works would be an outage that goes
  // unreported. This sends one real message through the real webhook on demand.
  //
  // It is also how to re-check the wiring after rotating the webhook, without waiting for
  // something to break.
  if (TEST) {
    await post(
      [
        "Test message from the store's health watchdog. Nothing is wrong.",
        "",
        "Somebody ran this by hand to check that alerts can reach this channel.",
        "If you can read this, they can.",
        RUN_URL ? `Run: ${RUN_URL}` : ""
      ].filter(Boolean).join("\n"),
      "test"
    );
    return;
  }
  const verdict = decide({ healthy: HEALTHY, previousFailed: await previousRunFailed() });
  if (verdict === "none") {
    console.log(HEALTHY ? "Healthy, and it was healthy last time. Nothing to say." : "Still failing. Already said so.");
    return;
  }
  await post(message(verdict), verdict);
}

// Only run when invoked directly, so the test can import the rules without posting anything.
if (process.argv[1] && process.argv[1].endsWith("health-notify.mjs")) {
  await main();
}
