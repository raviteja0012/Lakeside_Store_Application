// The lifecycle card, checked without a Slack workspace.
//
// Three things are worth testing here and they are all failures that would be invisible in
// review: a card that arrives as an empty notification, a card that cannot find itself and so
// posts six messages instead of updating one, and a branch name that does not lead back to
// the thread that asked for it.

import { card, findCard, tsFromBranch, MARKER, STAGES } from "./slack-status.mjs";

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`);
};

// Slack uses `text` for the notification and for screen readers. Blocks without it arrive as
// an empty ping, which is the kind of bug nobody sees in code review.
for (const stage of Object.keys(STAGES)) {
  const c = card({ stage, request: "add a phone column" });
  t(`${stage}: has fallback text`, !!c.text && c.text.length > 5);
  t(`${stage}: has blocks`, Array.isArray(c.blocks) && c.blocks.length > 0);
  t(`${stage}: stays under Slack's 50-block cap`, c.blocks.length <= 50);
  t(`${stage}: carries the marker so it can find itself later`,
    JSON.stringify(c.blocks).includes(MARKER));
}

// An unknown stage must still produce a valid card rather than throwing mid-run.
t("an unknown stage does not crash", !!card({ stage: "nonsense" }).text);

// Finding its own card. Editing a person's message is both wrong and impossible.
const botCard = { bot_id: "B1", text: `Working on it (${MARKER})`, ts: "2.0" };
const human = { user: "U1", text: "thanks!", ts: "3.0" };
t("finds its own card in a thread", findCard([human, botCard])?.ts === "2.0");
t("ignores messages from people", findCard([human]) === null);
t("ignores a bot message that is not the card",
  findCard([{ bot_id: "B1", text: "unrelated", ts: "4.0" }]) === null);
t("finds the card when the marker is only in blocks",
  findCard([{ bot_id: "B1", text: "", blocks: [{ type: "context", elements: [{ text: MARKER }] }], ts: "5.0" }])?.ts === "5.0");
t("an empty thread is null, not a crash", findCard([]) === null);
t("missing messages is null, not a crash", findCard(undefined) === null);

// The join between a branch and the Slack thread that asked for it. Nothing is stored
// between the two workflows, so if this is wrong the lifecycle silently stops reporting.
t("recovers the thread from a branch name",
  tsFromBranch("claude/slack-1786568400.750549") === "1786568400.750549");
t("works without the claude/ prefix", tsFromBranch("slack-1786568400.750549") === "1786568400.750549");
t("an ordinary branch is not mistaken for one of ours", tsFromBranch("main") === null);
t("a similar looking branch is refused", tsFromBranch("claude/slack-notatimestamp") === null);
t("a truncated timestamp is refused", tsFromBranch("claude/slack-1786568400.75") === null);
t("empty is null, not a crash", tsFromBranch("") === null);
t("undefined is null, not a crash", tsFromBranch(undefined) === null);

// Long requests must not blow the card up. Slack truncates messages, and a wall of text in
// a context block is unreadable anyway.
const long = card({ stage: "built", request: "x".repeat(5000), note: "y".repeat(9000) });
t("a very long request is shortened", JSON.stringify(long.blocks).length < 4000,
  `${JSON.stringify(long.blocks).length} chars`);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
