// Picking the transition that lands a ticket on the status we want.
//
// Load-bearing in two places now: the promotion gate moves an Approved ticket to Done, and
// the watchdog closes its own health ticket when the site recovers. Both fail silently if
// this picks wrong, and "silently" is the word that matters: a ticket that quietly stays
// open is exactly the failure this code exists to prevent.
//
// Jira does not let you set a status. You ask what transitions are available from where the
// ticket is now, and take the one whose DESTINATION is the status you want. The transition's
// own name is often something else entirely ("Close Issue" landing on "Done"), which is the
// trap these cases are here to pin.
//
// Run: node .github/scripts/jira-transition.test.mjs

import { pickTransition } from "./jira-transition.mjs";

// The real shape Jira returns.
const t = (id, name, to) => ({ id, name, to: { name: to } });

const cases = [
  {
    name: "the transition is named after something else entirely",
    transitions: [t("11", "Close Issue", "Done"), t("21", "Start", "In Progress")],
    want: "Done",
    expect: "11",
    why: "matching on the transition name would have missed this, which is the common shape"
  },
  {
    name: "several transitions, one lands where we want",
    transitions: [t("11", "Back to To Do", "To Do"), t("21", "Ship it", "Done"), t("31", "Review", "In Review")],
    want: "Done",
    expect: "21",
    why: "the destination is the only thing that decides it"
  },
  {
    name: "the board spells it differently",
    transitions: [t("11", "Move", "QA")],
    want: "qa",
    expect: "11",
    why: "a board that writes QA and a request that writes qa are the same board"
  },
  {
    name: "surrounding whitespace",
    transitions: [t("11", "Move", " Approved ")],
    want: "Approved",
    expect: "11",
    why: "a status name with a stray space is still that status"
  },
  {
    name: "no `to` field, transition named for the destination",
    transitions: [{ id: "11", name: "Done" }],
    want: "Done",
    expect: "11",
    why: "some boards do not expose `to`, and falling back to the name recovers those"
  },
  {
    name: "the status does not exist on this board yet",
    transitions: [t("11", "Start", "In Progress")],
    want: "Approved",
    expect: null,
    why: "returns nothing so the caller can say so and stop, rather than moving it somewhere wrong"
  },
  {
    name: "no transitions available at all",
    transitions: [],
    want: "Done",
    expect: null,
    why: "a ticket with nowhere to go is not an error, it is a ticket with nowhere to go"
  },
  {
    name: "the transitions list is missing",
    transitions: undefined,
    want: "Done",
    expect: null,
    why: "a failed fetch must not become a wrong move"
  },
  {
    name: "no destination asked for",
    transitions: [t("11", "Close", "Done")],
    want: "",
    expect: null,
    why: "an empty target must never match the first thing in the list"
  },
  {
    name: "destination match wins over a name collision",
    transitions: [t("11", "Done", "Rejected"), t("21", "Finish", "Done")],
    want: "Done",
    expect: "21",
    why: "a transition NAMED Done that lands on Rejected is the worst case: where it goes is what counts"
  }
];

let failed = 0;
for (const c of cases) {
  const got = pickTransition(c.transitions, c.want);
  const id = got ? got.id : null;
  const ok = id === c.expect;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}: got ${id}, want ${c.expect} (${c.why})`);
}

if (failed) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} checks passed.`);
