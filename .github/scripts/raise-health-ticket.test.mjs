// Does the watchdog already have nothing new to say?
//
// The cases below are the REAL shapes from SCRUM-12, the ticket that made this rule exist.
// It collected 45 comments in three days: the watchdog saying "Still failing / vendor columns
// present" every couple of hours, and the autopilot answering that it could not fix it,
// because the fix was a database script no machine is allowed to run. Every one of those
// comments also re-queued the ticket, so each pair cost a model call to repeat yesterday.
//
// The rule has to do two things at once, and the cases here pin both: stay quiet while the
// same thing is failing, and speak the moment what is failing changes.
//
// Run: node .github/scripts/raise-health-ticket.test.mjs

import { alreadySaid, commentText } from "./raise-health-ticket.mjs";

// A Jira comment, in the ADF shape the API actually returns.
function comment(text) {
  return {
    body: {
      type: "doc",
      version: 1,
      content: text.split("\n").map((line) => ({
        type: "paragraph",
        content: line ? [{ type: "text", text: line }] : []
      }))
    }
  };
}

const VENDOR = "vendor columns present";
const INVOICE = "invoice columns present";

// The two real comment bodies, verbatim in shape.
const watchdogSaid = comment(`Still failing.\n\n${VENDOR}\n\nRun: https://github.com/x/y/actions/runs/1`);
const autopilotSaid = comment("[autopilot] The automatic build did not finish this time. Nothing was changed.");

const cases = [
  {
    name: "the same failure, already reported",
    comments: [autopilotSaid, watchdogSaid],
    summary: VENDOR,
    want: true,
    why: "this is the SCRUM-12 loop: forty more of these said nothing new"
  },
  {
    name: "a different failure on the same open ticket",
    comments: [autopilotSaid, watchdogSaid],
    summary: INVOICE,
    want: false,
    why: "what is broken changed, which is the whole reason to speak"
  },
  {
    name: "two checks failing where one was reported",
    comments: [watchdogSaid],
    summary: `${VENDOR}\n${INVOICE}`,
    want: false,
    why: "it got worse, and a ticket that says less than the truth is worse than a repeat"
  },
  {
    name: "the failure narrowed to a subset already named",
    comments: [comment(`Still failing.\n\n${VENDOR}\n${INVOICE}`)],
    summary: VENDOR,
    want: true,
    why: "still inside what the ticket already says, so nothing new to add"
  },
  {
    name: "nothing said yet",
    comments: [],
    summary: VENDOR,
    want: false,
    why: "a fresh ticket has to be told once"
  },
  {
    name: "comments exist but none from the watchdog",
    comments: [autopilotSaid],
    summary: VENDOR,
    want: false,
    why: "the autopilot talking is not the watchdog having reported"
  },
  {
    name: "an empty summary",
    comments: [watchdogSaid],
    summary: "",
    want: false,
    why: "nothing to compare, so do not suppress: silence must never be the default"
  },
  {
    name: "the comment fetch failed and gave us nothing",
    comments: undefined,
    summary: VENDOR,
    want: false,
    why: "when we cannot tell, say it: a duplicate is cheaper than a missed change"
  }
];

let failed = 0;
for (const c of cases) {
  const got = alreadySaid(c.comments, c.summary);
  const ok = got === c.want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}: got ${got}, want ${c.want} (${c.why})`);
}

// The ADF walker is the part that silently returns "" if Jira changes its shape, and an
// empty string would make every comparison miss and the loop come back. Pin it directly.
const nested = {
  body: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Still failing." }] },
      { type: "paragraph", content: [] },
      { type: "paragraph", content: [{ type: "text", text: VENDOR }] }
    ]
  }
};
const text = commentText(nested);
if (!text.includes(VENDOR)) {
  console.log(`FAIL  commentText missed the nested text: ${JSON.stringify(text)}`);
  failed++;
} else {
  console.log("ok    commentText reads nested ADF paragraphs");
}
if (commentText({}) !== "" || commentText(undefined) !== "") {
  console.log("FAIL  commentText should return empty string for a body it cannot read");
  failed++;
} else {
  console.log("ok    commentText survives a comment with no body");
}

if (failed) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length + 2} checks passed.`);
