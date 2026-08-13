// Finds the next request to build, in a Slack channel.
//
// This is the intake loop the Jira autopilot used to be, moved to where the work is actually
// asked for. Somebody types what they want in the requests channel; this picks the oldest one
// nobody has started yet and hands it to a build.
//
// STATE IS A REACTION, not a database and not a marker buried in text. The bot adds :eyes:
// when it picks a message up and :white_check_mark: when it finishes. That means the state of
// every request is visible to a human scrolling the channel, it survives this script being
// rewritten, and it costs no storage. A message carrying either reaction is already spoken
// for and is skipped, which is what stops the loop working the same request forever.
//
// WHAT IS NOT WORK: anything the bot itself said, anything from another app, and thread
// replies. Replies are skipped on purpose for now: a thread under a finished request is
// usually people talking about it, and treating every comment as a new build is how an
// intake loop turns a conversation into ten pull requests.
//
// Silent and empty-handed when SLACK_BOT_TOKEN or SLACK_REQUEST_CHANNEL is unset, so the
// workflow is safe to merge before either exists.

const TOKEN = (process.env.SLACK_BOT_TOKEN || "").trim();
const CHANNEL = (process.env.SLACK_REQUEST_CHANNEL || "").trim();
const ONE_TS = (process.env.ONE_MESSAGE_TS || "").trim();
const HOW_MANY = 25;

/** Reactions that mean somebody, or something, already has this one. */
export const PICKED_UP = "eyes";
export const DONE = "white_check_mark";

/**
 * The oldest message that is a request nobody has started, or null.
 *
 * Pure, so the rule that decides what the automation will go and build can be tested without
 * a Slack workspace. This is the decision worth testing: getting it wrong either means
 * ignoring somebody's request forever, or building the same one on a loop.
 */
export function pickWork(messages, opts = {}) {
  const { onlyTs = "" } = opts;
  // conversations.history returns newest first. Oldest-first means the person who asked
  // first is served first, which is the behaviour anybody would expect of a queue.
  const oldestFirst = [...(messages || [])].reverse();
  for (const m of oldestFirst) {
    if (!m || typeof m.text !== "string" || !m.text.trim()) continue;
    // Anything posted by an app, including this automation's own replies. Without this the
    // bot reads its own "working on it" message as a new request.
    if (m.bot_id || m.subtype) continue;
    // A reply inside a thread. thread_ts equals ts on the parent message itself.
    if (m.thread_ts && m.thread_ts !== m.ts) continue;
    const reactions = (m.reactions || []).map((r) => r.name);
    if (reactions.includes(PICKED_UP) || reactions.includes(DONE)) continue;
    if (onlyTs && m.ts !== onlyTs) continue;
    return m;
  }
  return null;
}

async function slack(method, params) {
  const url = `https://slack.com/api/${method}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${TOKEN}`, "user-agent": "robinsons-store-autopilot" }
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method} failed: ${data.error}`);
  return data;
}

function out(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const fs = require("node:fs");
  // Multi-line values need the heredoc form or the runner truncates at the first newline,
  // and a request typed in Slack is very often more than one line.
  const token = `EOF_${Math.abs(name.length * 7919)}`;
  fs.appendFileSync(file, `${name}<<${token}\n${value}\n${token}\n`);
}

async function main() {
  if (!TOKEN || !CHANNEL) {
    console.log("Slack autopilot is not configured yet. See docs/SLACK_AUTOPILOT.md.");
    out("found", "false");
    return;
  }
  const history = await slack("conversations.history", { channel: CHANNEL, limit: String(HOW_MANY) });
  const work = pickWork(history.messages, { onlyTs: ONE_TS });
  if (!work) {
    console.log("Nothing waiting.");
    out("found", "false");
    return;
  }
  // Claimed before the build starts, not after. A run that dies halfway still leaves the
  // request marked as taken, which is the safe direction: a human sees :eyes: with no reply
  // and knows to look, whereas an unclaimed request would be picked up again on the next
  // sweep and built twice.
  await slack("reactions.add", { channel: CHANNEL, timestamp: work.ts, name: PICKED_UP });
  console.log(`Picked up the message at ${work.ts}.`);
  out("found", "true");
  out("ts", work.ts);
  out("request", work.text);
}

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

if (process.argv[1] && process.argv[1].endsWith("slack-find-work.mjs")) {
  await main();
}
