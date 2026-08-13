// What the automation will and will not go and build.
//
// This is the rule most worth testing in the whole loop. Too loose and it builds its own
// replies in a circle, or turns one conversation into ten pull requests. Too tight and
// somebody's request sits in the channel forever while the machine reports nothing to do.
// Both failures look like silence from the outside.

import { pickWork, PICKED_UP, DONE, STOPPED, CLAIMED } from "./slack-find-work.mjs";

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`);
};
const BOT = "U0BOT";
const AT = `<@${BOT}>`;
// Most tests are about the queue rules, not about addressing, so they opt out of the mention
// requirement. The mention rules get their own block below.
const msg = (over = {}) => ({ ts: "100.1", text: "add a column for the rep phone", ...over });
const pick = (messages, opts = {}) => pickWork(messages, { requireMention: false, ...opts });

// Slack hands back newest first. People expect a queue to serve whoever asked first.
const three = [msg({ ts: "300.0", text: "third" }), msg({ ts: "200.0", text: "second" }), msg({ ts: "100.0", text: "first" })];
t("takes the oldest waiting request, not the newest", pick(three)?.text === "first", pick(three)?.text);

// The loop-stopper. Without this it picks the same message every sweep, forever.
t("skips a request already picked up",
  pick([msg({ reactions: [{ name: PICKED_UP }] })]) === null);
t("skips a request already finished",
  pick([msg({ reactions: [{ name: DONE }] })]) === null);
t("an unrelated reaction does not count as claimed",
  pick([msg({ reactions: [{ name: "thumbsup" }] })])?.text === "add a column for the rep phone");

// THE RETRY LOOP. This is not hypothetical: the first real run failed, the card set a
// warning on the message, and with only eyes and tick in the skip list the next sweep would
// have rebuilt the same failing request every thirty minutes forever, burning a model run
// each time.
t("skips a request that stopped and needs a person",
  pick([msg({ reactions: [{ name: STOPPED }] })]) === null);
t("every reaction the card can set counts as claimed",
  CLAIMED.every((r) => pick([msg({ reactions: [{ name: r }] })]) === null),
  CLAIMED.join(","));
t("taking the reaction off is how a person retries one",
  pick([msg({ reactions: [] })])?.text === "add a column for the rep phone");

// The circle-breaker. The bot posts its own progress into this channel, and reading that
// back as a request is how an intake loop eats itself.
t("skips anything an app posted", pick([msg({ bot_id: "B123" })]) === null);
t("skips joins, leaves and edits", pick([msg({ subtype: "channel_join" })]) === null);

// A thread under a finished request is people talking, not ten new jobs.
t("skips thread replies", pick([msg({ ts: "101.0", thread_ts: "100.0" })]) === null);
t("but a parent message that HAS a thread is still work",
  pick([msg({ ts: "100.0", thread_ts: "100.0" })])?.ts === "100.0");

// Nothing to build is a normal state, not an error.
t("empty channel is null, not a crash", pick([]) === null);
t("missing messages is null, not a crash", pick(undefined) === null);
t("a message with no text is not work", pick([msg({ text: "" })]) === null);
t("a message of only spaces is not work", pick([msg({ text: "   " })]) === null);

// Running one specific message by hand, for when somebody wants a particular request built.
const two = [msg({ ts: "200.0", text: "second" }), msg({ ts: "100.0", text: "first" })];
t("can be pinned to one message", pick(two, { onlyTs: "200.0" })?.text === "second");
t("pinning to a claimed message still refuses it",
  pick([msg({ ts: "200.0", reactions: [{ name: PICKED_UP }] })], { onlyTs: "200.0" }) === null);

// ADDRESSING. This watches the store's ordinary channel, where people say hello. Getting
// this wrong means the automation opens a pull request for "Hello Robinson Tech Team", which
// is the single worst thing it could do on its first day.
const hello = { ts: "50.0", text: "Hello Robinson Tech Team" };
const addressed = { ts: "60.0", text: `${AT} add a column for the rep phone` };

t("ordinary chatter is NOT a build request",
  pickWork([hello], { requireMention: true, botUserId: BOT }) === null);
t("a message naming the bot IS a build request",
  pickWork([addressed], { requireMention: true, botUserId: BOT })?.ts === "60.0");
t("chatter is skipped even when it is older and would otherwise be first",
  pickWork([addressed, hello], { requireMention: true, botUserId: BOT })?.ts === "60.0");
t("the bot's name is stripped, so the model gets the request alone",
  pickWork([addressed], { requireMention: true, botUserId: BOT })?.text === "add a column for the rep phone",
  pickWork([addressed], { requireMention: true, botUserId: BOT })?.text);
t("a message that is ONLY the bot's name is not a request",
  pickWork([{ ts: "70.0", text: AT }], { requireMention: true, botUserId: BOT }) === null);
t("being named in the middle of a sentence still counts",
  pickWork([{ ts: "80.0", text: `hey ${AT} can you add a column` }], { requireMention: true, botUserId: BOT })?.ts === "80.0");
t("someone ELSE being named does not count",
  pickWork([{ ts: "90.0", text: "<@U0SOMEONE> can you look at this" }], { requireMention: true, botUserId: BOT }) === null);

// FAILS CLOSED. If auth.test does not answer, the bot does not know its own name. Guessing
// "everything counts" would build the whole channel.
t("no bot id and mention required means nothing is work",
  pickWork([addressed, hello], { requireMention: true, botUserId: "" }) === null);

// The opt-out, for a channel that exists only for requests.
t("a requests-only channel can take plain messages",
  pickWork([hello], { requireMention: false })?.ts === "50.0");


console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
