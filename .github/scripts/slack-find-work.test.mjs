// What the automation will and will not go and build.
//
// This is the rule most worth testing in the whole loop. Too loose and it builds its own
// replies in a circle, or turns one conversation into ten pull requests. Too tight and
// somebody's request sits in the channel forever while the machine reports nothing to do.
// Both failures look like silence from the outside.

import { pickWork, PICKED_UP, DONE } from "./slack-find-work.mjs";

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`);
};
const msg = (over = {}) => ({ ts: "100.1", text: "add a column for the rep phone", ...over });

// Slack hands back newest first. People expect a queue to serve whoever asked first.
const three = [msg({ ts: "300.0", text: "third" }), msg({ ts: "200.0", text: "second" }), msg({ ts: "100.0", text: "first" })];
t("takes the oldest waiting request, not the newest", pickWork(three)?.text === "first", pickWork(three)?.text);

// The loop-stopper. Without this it picks the same message every sweep, forever.
t("skips a request already picked up",
  pickWork([msg({ reactions: [{ name: PICKED_UP }] })]) === null);
t("skips a request already finished",
  pickWork([msg({ reactions: [{ name: DONE }] })]) === null);
t("an unrelated reaction does not count as claimed",
  pickWork([msg({ reactions: [{ name: "thumbsup" }] })])?.text === "add a column for the rep phone");

// The circle-breaker. The bot posts its own progress into this channel, and reading that
// back as a request is how an intake loop eats itself.
t("skips anything an app posted", pickWork([msg({ bot_id: "B123" })]) === null);
t("skips joins, leaves and edits", pickWork([msg({ subtype: "channel_join" })]) === null);

// A thread under a finished request is people talking, not ten new jobs.
t("skips thread replies", pickWork([msg({ ts: "101.0", thread_ts: "100.0" })]) === null);
t("but a parent message that HAS a thread is still work",
  pickWork([msg({ ts: "100.0", thread_ts: "100.0" })])?.ts === "100.0");

// Nothing to build is a normal state, not an error.
t("empty channel is null, not a crash", pickWork([]) === null);
t("missing messages is null, not a crash", pickWork(undefined) === null);
t("a message with no text is not work", pickWork([msg({ text: "" })]) === null);
t("a message of only spaces is not work", pickWork([msg({ text: "   " })]) === null);

// Running one specific message by hand, for when somebody wants a particular request built.
const two = [msg({ ts: "200.0", text: "second" }), msg({ ts: "100.0", text: "first" })];
t("can be pinned to one message", pickWork(two, { onlyTs: "200.0" })?.text === "second");
t("pinning to a claimed message still refuses it",
  pickWork([msg({ ts: "200.0", reactions: [{ name: PICKED_UP }] })], { onlyTs: "200.0" }) === null);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
