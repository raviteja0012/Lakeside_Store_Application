// Says back, in the thread under the request, what happened to it.
//
// The half that makes the loop usable rather than eerie. Somebody asks for something in a
// channel; without this, the next thing they see is either a pull request they were not
// watching for, or nothing at all. A reply under their own message is where they will look.
//
// It also swaps :eyes: for :white_check_mark: on a finished request, so the channel reads at
// a glance: no reaction means waiting, eyes means being worked, tick means done.
//
// Never fails the run. The build either happened or it did not, and a Slack outage must not
// turn a finished piece of work into a red run that somebody re-runs.

const TOKEN = (process.env.SLACK_BOT_TOKEN || "").trim();
const CHANNEL = (process.env.SLACK_REQUEST_CHANNEL || "").trim();
const TS = (process.env.MESSAGE_TS || "").trim();
const TEXT = (process.env.TEXT || "").trim();
// "done" swaps the eyes for a tick. Anything else leaves the eyes, which is right for a
// request that stopped early and needs a person.
const OUTCOME = (process.env.OUTCOME || "").trim();

async function slack(method, params) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json; charset=utf-8",
      "user-agent": "robinsons-store-autopilot"
    },
    body: JSON.stringify(params)
  });
  const data = await res.json();
  if (!data.ok) console.log(`::warning::Slack ${method} said: ${data.error}`);
  return data;
}

async function main() {
  if (!TOKEN || !CHANNEL || !TS) {
    console.log("Nothing to reply to, or Slack is not configured. Saying nothing.");
    return;
  }
  if (TEXT) await slack("chat.postMessage", { channel: CHANNEL, thread_ts: TS, text: TEXT });
  if (OUTCOME === "done") {
    await slack("reactions.remove", { channel: CHANNEL, timestamp: TS, name: "eyes" });
    await slack("reactions.add", { channel: CHANNEL, timestamp: TS, name: "white_check_mark" });
  }
}

await main();
