// Post one message to Slack through the incoming webhook. Nothing clever.
//
// The health watchdog had this logic buried inside it, which meant every other workflow that
// needed to say something either stayed silent or grew its own copy. A migration failing
// against the store's live ledger is exactly the kind of thing that must not be silent, and
// it had no way to speak.
//
// The webhook is WRITE ONLY, which is the right credential for this: a workflow that
// announces something should not be able to read the channel it announces into.
//
// Never fails the run. A workflow that did real work and then could not reach Slack has
// still done the work, and turning that into a red run would send somebody to re-run a
// migration that already applied.

const WEBHOOK = (process.env.SLACK_WEBHOOK_URL || "").trim();
const TEXT = (process.env.TEXT || "").trim();

async function main() {
  if (!TEXT) {
    console.log("Nothing to say.");
    return;
  }
  if (!WEBHOOK) {
    console.log("SLACK_WEBHOOK_URL is not set, so this went nowhere. It would have said:");
    console.log(TEXT);
    return;
  }
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "robinsons-store/1.0" },
    body: JSON.stringify({ text: TEXT })
  });
  console.log(res.ok ? "Said it in Slack." : `::warning::Slack refused the message (${res.status}).`);
}

await main();
