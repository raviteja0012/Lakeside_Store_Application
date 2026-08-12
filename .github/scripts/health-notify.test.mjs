// The rule that decides whether the store gets pinged, checked without a network.
//
// This is the automation's own logic, and it is the kind that fails quietly: too eager and
// people mute the channel, too shy and a real outage goes unmentioned. Both failures look
// like nothing happening.

import { decide, previousRunFailed } from "./health-notify.mjs";

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`);
};

// The four states. Only the two transitions speak.
t("first failure is announced", decide({ healthy: false, previousFailed: false }) === "down");
t("still failing says nothing", decide({ healthy: false, previousFailed: true }) === "none");
t("recovery is announced", decide({ healthy: true, previousFailed: true }) === "recovered");
t("still healthy says nothing", decide({ healthy: true, previousFailed: false }) === "none");

// An outage that lasts a day must produce ONE message, not twelve. This is the property the
// Jira ticket gave for free by being a row that stayed open.
let posts = 0;
let previousFailed = false;
for (const healthy of [true, true, false, false, false, false, false, true, true]) {
  if (decide({ healthy, previousFailed }) !== "none") posts++;
  previousFailed = !healthy;
}
t("a five-run outage posts exactly twice, down and back up", posts === 2, `${posts} posts`);

// An unreadable run history must not swallow an outage. Erring toward a duplicate alert is
// the safe direction; erring toward silence is not.
const failing = { ok: false, status: 500, json: async () => ({}) };
t("a refused API call reports no previous failure, so the outage is announced",
  (await previousRunFailed(async () => failing)) === false);
const throwing = () => { throw new Error("no network"); };
t("a thrown request does not crash the run", (await previousRunFailed(throwing)) === false);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
