// Asks the live site's /api/health what it thinks of itself, and turns the answer into a
// pass or fail the workflow can act on.
//
// Retries a few times before calling it a failure: a deploy that is still swapping over, or
// a cold start, is not a broken release, and a watchdog that cries wolf gets muted.

import { appendFileSync } from "node:fs";

const SITE = (process.env.SITE || "").replace(/\/+$/, "");
const SECRET = process.env.CRON_SECRET || "";
const ATTEMPTS = 4;
const GAP_MS = 20000;

function out(key, value) {
  const f = process.env.GITHUB_OUTPUT;
  console.log(`${key}: ${value}`);
  if (f) appendFileSync(f, `${key}=${String(value).replace(/\n/g, " ")}\n`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!SITE) {
  out("healthy", "true");
  out("summary", "No site configured, nothing checked.");
  process.exit(0);
}

let last = "";
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  try {
    const headers = { Accept: "application/json" };
    if (SECRET) headers["x-cron-secret"] = SECRET;
    const r = await fetch(`${SITE}/api/health`, { headers });
    const text = await r.text();

    if (!r.ok) {
      last = `The site answered ${r.status} on /api/health.`;
    } else {
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        // A login wall or an HTML error page: not a health verdict either way.
        last = "The health endpoint did not return JSON. It may be behind deployment protection.";
        body = null;
      }
      if (body) {
        if (body.configured === false) {
          out("healthy", "true");
          out("summary", "No database configured on this deployment, so there was nothing to check.");
          process.exit(0);
        }
        if (body.ok) {
          const n = (body.checks || []).length;
          out("healthy", "true");
          out("summary", `All ${n} checks passed.`);
          process.exit(0);
        }
        const failed = (body.checks || []).filter((c) => !c.ok);
        last = failed.map((c) => `${c.name}${c.detail ? `: ${c.detail}` : ""}`).join("; ") || "Reported not ok with no detail.";
        // A real failing check will still be failing in twenty seconds. Retrying costs
        // little and rules out a half-finished deploy.
      }
    }
  } catch (e) {
    last = `Could not reach the site: ${e.message}`;
  }

  if (attempt < ATTEMPTS) {
    console.log(`Attempt ${attempt}: ${last}. Trying again.`);
    await sleep(GAP_MS);
  }
}

out("healthy", "false");
out("summary", last);
