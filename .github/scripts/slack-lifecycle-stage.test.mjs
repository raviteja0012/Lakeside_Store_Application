// Which GitHub events become a line in the store's Slack channel, and which stay quiet.
//
// The expensive failure here is not a crash. It is telling somebody their request is live
// when it was closed unmerged, or filling the channel with noise from every unrelated branch
// until people stop reading it. Both are silent in code review.

import { stageFor } from "./slack-lifecycle-stage.mjs";

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`);
};
const OURS = "claude/slack-1786568400.750549";
const TS = "1786568400.750549";

// The whole point: only work that came from a Slack request is reported.
t("an ordinary branch is ignored",
  stageFor({ name: "pull_request", branch: "claude/some-other-work", action: "opened" }) === null);
t("main is ignored",
  stageFor({ name: "workflow_run", branch: "main", ciResult: "success" }) === null);
t("a missing branch is ignored", stageFor({ name: "pull_request", action: "opened" }) === null);
t("an unknown event is ignored", stageFor({ name: "issues", branch: OURS }) === null);
t("an empty event does not crash", stageFor(undefined) === null);
t("an empty object does not crash", stageFor({}) === null);

// Opening the pull request.
const opened = stageFor({ name: "pull_request", branch: OURS, action: "opened", prUrl: "http://pr/1", prTitle: "Add the rep phone column" });
t("an opened pull request reports built", opened?.stage === "built", opened?.stage);
t("it names the right request", opened?.threadTs === TS);
t("it carries the link", opened?.link === "http://pr/1");
t("it says something a shop owner can read", /Written up as/.test(opened?.note || ""), opened?.note);

// The distinction that matters most on this whole screen.
const merged = stageFor({ name: "pull_request", branch: OURS, action: "closed", merged: true, prUrl: "http://pr/1" });
t("a merged pull request reports merged", merged?.stage === "merged");
const closed = stageFor({ name: "pull_request", branch: OURS, action: "closed", merged: false, prUrl: "http://pr/1" });
t("a CLOSED but unmerged pull request never reports merged", closed?.stage === "stopped", closed?.stage);
t("and it says plainly that nothing changed", /nothing changed/.test(closed?.note || ""), closed?.note);

// Checks.
t("passing checks report checks_passed",
  stageFor({ name: "workflow_run", branch: OURS, ciResult: "success" })?.stage === "checks_passed");
t("failing checks report checks_failed",
  stageFor({ name: "workflow_run", branch: OURS, ciResult: "failure" })?.stage === "checks_failed");
t("a passing run tells the person a human still has to merge",
  /needs a person/.test(stageFor({ name: "workflow_run", branch: OURS, ciResult: "success" })?.note || ""));
// A cancelled run is usually somebody pushing again. Reporting it would be noise.
t("a cancelled run says nothing",
  stageFor({ name: "workflow_run", branch: OURS, ciResult: "cancelled" }) === null);
t("a skipped run says nothing",
  stageFor({ name: "workflow_run", branch: OURS, ciResult: "skipped" }) === null);

// The hand-run way in, used by the deploy watch to report "live".
const live = stageFor({ name: "workflow_dispatch", threadTs: TS, stage: "live", note: "It is on the store's site now." });
t("a dispatch reports exactly what it was told", live?.stage === "live" && live?.threadTs === TS);
t("a dispatch with no stage says nothing",
  stageFor({ name: "workflow_dispatch", threadTs: TS }) === null);
t("a dispatch with no thread says nothing",
  stageFor({ name: "workflow_dispatch", stage: "live" }) === null);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
