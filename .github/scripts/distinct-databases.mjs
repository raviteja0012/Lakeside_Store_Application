// Refuses to treat the production database as if it were dev.
//
// docs/ENVIRONMENTS.md names one real hazard in the whole two-environment arrangement:
//
//   "The dev site pointed at the live database. This is the one real hazard in the whole
//    arrangement, and it is a copy-paste mistake, not a subtle one."
//
// It was written as a warning to be careful. Nobody is careful at eleven at night with two
// connection strings on the clipboard, and being careful is not a control. This is the
// control: before a single script runs against "dev", compare which Supabase project each
// connection string actually points at, and stop if they are the same one.
//
// Without it, the failure is silent and total. seed_dev.sql would insert eight DEV vendors
// into the store's real directory, every dev migration would run on the live ledger, and
// nothing would look wrong until somebody noticed invented vendors next to real ones.
//
// It compares only the project reference, never the password, and prints only that.

import { pathToFileURL } from "node:url";

// The Supabase project a connection string belongs to.
//
// Both shapes carry it, in different places:
//   session pooler   postgresql://postgres.abcdefghijklm:pw@aws-1-ca-central-1.pooler...
//   direct           postgresql://postgres:pw@db.abcdefghijklm.supabase.co:5432/postgres
//
// A project ref is 20 lowercase letters. Returning null for anything unrecognised matters:
// an unknown shape must not silently compare equal to another unknown shape, or two
// unparseable strings would look like a match and block a legitimate run.
export function projectRef(conn) {
  const s = String(conn || "");
  if (!s) return null;
  const pooler = s.match(/\/\/postgres\.([a-z0-9]{16,})[:@]/i);
  if (pooler) return pooler[1].toLowerCase();
  const direct = s.match(/@db\.([a-z0-9]{16,})\.supabase\.co/i);
  if (direct) return direct[1].toLowerCase();
  return null;
}

// Same project, whichever connection shape each one is written in. Two nulls are NOT a
// match: unknown is not equal to unknown.
export function sameProject(a, b) {
  const x = projectRef(a);
  const y = projectRef(b);
  if (!x || !y) return false;
  return x === y;
}

function main() {
  const dev = process.env.DEV_CONN || "";
  const prod = process.env.PROD_CONN || "";

  if (!dev) {
    console.log("No dev connection string to check.");
    return 0;
  }
  if (!prod) {
    // Nothing to compare against is not a reason to block: a repository may have dev
    // configured before production, and refusing then would be a guard that invents work.
    console.log("No production connection string to compare against, so nothing to rule out.");
    return 0;
  }

  const devRef = projectRef(dev);
  const prodRef = projectRef(prod);
  console.log(`dev project:        ${devRef || "(unrecognised connection string shape)"}`);
  console.log(`production project: ${prodRef || "(unrecognised connection string shape)"}`);

  if (sameProject(dev, prod)) {
    console.log("");
    console.log("::error::SUPABASE_DB_URL_DEV points at the SAME Supabase project as production.");
    console.log("Nothing has been run. The dev database must be a separate Supabase project,");
    console.log("or dev migrations and seed_dev.sql would be applied to the store's real data.");
    console.log("Fix the SUPABASE_DB_URL_DEV secret, then run this again.");
    return 1;
  }

  if (!devRef || !prodRef) {
    // Say so rather than passing quietly. A shape this cannot read is a shape it cannot
    // vouch for, and the person should know the guard did not actually check anything.
    console.log("");
    console.log("::warning::Could not read a project reference from one of the connection");
    console.log("::warning::strings, so this did not verify they are different databases.");
    return 0;
  }

  console.log("");
  console.log("These are two different Supabase projects. Safe to continue.");
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exit(main());
