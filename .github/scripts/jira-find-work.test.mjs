// Does a closed ticket count as work again?
//
// The cases below are the REAL timestamps from the board on 2026-07-31, including the one
// that caused this rule to exist: the owner left five comments on a closed story and
// thirty-one green sweeps went past them. SCRUM-6 is the tight case, closed nine seconds
// after its closing note, which is why the rule has a grace window rather than a bare
// comparison.
//
// Run: node .github/scripts/jira-find-work.test.mjs

import { reopenedByComment } from "./jira-find-work.mjs";

const cases = [
  { key: "SCRUM-5", closed: "2026-07-28T10:26:51.118-0400", last: "2026-07-26T21:47:23.608-0400", want: false, why: "closing note predates the close" },
  { key: "SCRUM-6", closed: "2026-07-28T14:44:41.947-0400", last: "2026-07-28T14:44:32.518-0400", want: false, why: "note then transition, nine seconds apart" },
  { key: "SCRUM-7", closed: "2026-07-28T10:26:58.545-0400", last: "2026-07-26T21:47:26.418-0400", want: false, why: "nothing said since closing" },
  { key: "SCRUM-8", closed: "2026-07-28T10:27:54.132-0400", last: "2026-07-26T21:47:15.726-0400", want: false, why: "nothing said since closing" },
  { key: "SCRUM-9", closed: "2026-07-28T14:44:22.602-0400", last: "2026-07-31T00:20:46.749-0400", want: true, why: "owner asked for more, three days later" },
  { key: "SCRUM-10", closed: "2026-07-28T10:27:28.863-0400", last: "2026-07-26T21:47:43.388-0400", want: false, why: "nothing said since closing" },
  { key: "SCRUM-11", closed: "2026-07-28T10:28:02.280-0400", last: "2026-07-26T21:46:45.054-0400", want: false, why: "nothing said since closing" },
  // Shapes the board has not thrown yet but will.
  { key: "closed-then-noted", closed: "2026-08-01T10:00:00.000-0400", last: "2026-08-01T10:00:30.000-0400", want: false, why: "note 30s after closing is part of closing" },
  { key: "real-followup", closed: "2026-08-01T10:00:00.000-0400", last: "2026-08-01T10:05:00.000-0400", want: true, why: "five minutes later is a real follow-up" },
  { key: "no-comments", closed: "2026-08-01T10:00:00.000-0400", last: undefined, want: false, why: "nothing to go on" },
  { key: "no-close-date", closed: undefined, last: "2026-08-01T10:05:00.000-0400", want: false, why: "cannot tell, so do not reopen" }
];

let failed = 0;
for (const c of cases) {
  const got = reopenedByComment(c.closed, c.last);
  const ok = got === c.want;
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${c.key.padEnd(18)} -> ${String(got).padEnd(5)} (${c.why})`);
}
console.log(failed ? `\n${failed} FAILED` : "\nall reopen rules correct");
process.exit(failed ? 1 : 0);
