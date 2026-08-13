// Turns a GitHub event into "which request, what stage, what to say", or into nothing.
//
// Kept out of the workflow YAML on purpose. This is a decision with about a dozen branches
// and real consequences (telling somebody their request shipped when it did not), and YAML
// expressions cannot be tested. Here it is one pure function with a test file.
//
// Saying NOTHING is the common case and the important one. Most events on most branches have
// no Slack request behind them, and a lifecycle reporter that guesses would put noise in the
// channel people are meant to trust.

import { tsFromBranch } from "./slack-status.mjs";

/**
 * What to report for one GitHub event, or null to stay quiet.
 *
 * Every branch of this returns either null or a complete instruction. There is deliberately
 * no "probably fine" middle.
 */
export function stageFor(event) {
  const { name, branch, action, merged, prUrl, prTitle, ciResult, ciUrl } = event || {};

  // A hand-run dispatch says exactly what it wants; it is the deploy watch's way in.
  if (name === "workflow_dispatch") {
    if (!event.threadTs || !event.stage) return null;
    return { threadTs: event.threadTs, stage: event.stage, note: event.note || "", link: event.link || "" };
  }

  // Everything else has to name its request through the branch, or it is not ours.
  const threadTs = tsFromBranch(branch);
  if (!threadTs) return null;

  if (name === "pull_request") {
    if (action === "closed") {
      return merged
        ? {
            threadTs,
            stage: "merged",
            note: "This is merged. It goes out to the store's site next.",
            link: prUrl || ""
          }
        : {
            threadTs,
            stage: "stopped",
            note: "This was closed without being merged, so nothing changed on the store's site.",
            link: prUrl || ""
          };
    }
    // opened, reopened, ready_for_review
    return {
      threadTs,
      stage: "built",
      note: prTitle ? `Written up as: ${prTitle}` : "There is a draft for somebody to look over.",
      link: prUrl || ""
    };
  }

  if (name === "workflow_run") {
    if (ciResult === "success") {
      return {
        threadTs,
        stage: "checks_passed",
        note: "The automatic checks all passed. It needs a person to merge it.",
        link: ciUrl || ""
      };
    }
    if (ciResult === "failure") {
      return {
        threadTs,
        stage: "checks_failed",
        note: "The automatic checks found a problem, so this is not ready yet.",
        link: ciUrl || ""
      };
    }
    // Cancelled, skipped, timed out. Real, but not worth a line in the store's channel: the
    // next push reports properly, and a cancelled run usually means somebody pushed again.
    return null;
  }

  return null;
}

function out(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const token = `EOF_${Math.abs((name || "").length * 7919)}`;
  fs.appendFileSync(file, `${name}<<${token}\n${value ?? ""}\n${token}\n`);
}

import fs from "node:fs";

function main() {
  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_REQUEST_CHANNEL) {
    console.log("Slack is not configured, so there is nobody to tell.");
    out("report", "false");
    return;
  }
  const decision = stageFor({
    name: process.env.EVENT,
    branch: process.env.BRANCH,
    action: process.env.PR_STATE,
    merged: process.env.PR_MERGED === "true",
    prUrl: process.env.PR_URL,
    prTitle: process.env.PR_TITLE,
    ciResult: process.env.CI_RESULT,
    ciUrl: process.env.CI_URL,
    threadTs: process.env.IN_TS,
    stage: process.env.IN_STAGE,
    note: process.env.IN_NOTE,
    link: process.env.IN_LINK
  });
  if (!decision) {
    console.log("Nothing about this event belongs in the store's channel.");
    out("report", "false");
    return;
  }
  console.log(`Reporting "${decision.stage}" for the request at ${decision.threadTs}.`);
  out("report", "true");
  out("thread_ts", decision.threadTs);
  out("stage", decision.stage);
  out("note", decision.note);
  out("link", decision.link);
}

if (process.argv[1] && process.argv[1].endsWith("slack-lifecycle-stage.mjs")) {
  main();
}
