// Can dev and production be told apart?
//
// This guard's whole job is to stop seed_dev.sql and the dev migrations from being applied
// to the store's real ledger because two connection strings got mixed up on a clipboard.
// It has to be right in both directions, and the two directions fail differently:
//
//   a missed match  -> dev data lands in the live database, silently, and looks fine
//   a false match   -> a legitimate dev run is blocked, loudly, and someone reads the log
//
// The first is unrecoverable and invisible; the second is an inconvenience. So where this is
// unsure it must NOT claim a match, and it must say it was unsure rather than pass quietly.
//
// Run: node .github/scripts/distinct-databases.test.mjs

import { projectRef, sameProject } from "./distinct-databases.mjs";

const PROD = "mhcjreqvvhnrtgwtuwvr";
const DEV = "abcdefghijklmnopqrst";

const pooler = (ref, pw = "pw") =>
  `postgresql://postgres.${ref}:${pw}@aws-1-ca-central-1.pooler.supabase.com:5432/postgres`;
const direct = (ref, pw = "pw") =>
  `postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`;

const refCases = [
  { name: "session pooler", conn: pooler(PROD), want: PROD },
  { name: "direct connection", conn: direct(PROD), want: PROD },
  { name: "transaction pooler port", conn: pooler(PROD).replace(":5432", ":6543"), want: PROD },
  { name: "password containing an @", conn: pooler(PROD, "p%40ss"), want: PROD },
  { name: "uppercase in the host", conn: direct(PROD).replace("supabase.co", "SUPABASE.CO"), want: PROD },
  { name: "empty string", conn: "", want: null },
  { name: "undefined", conn: undefined, want: null },
  { name: "not a postgres url at all", conn: "https://example.com", want: null },
  { name: "a local database", conn: "postgresql://postgres:pw@localhost:5432/postgres", want: null }
];

let failed = 0;
console.log("reading the project reference:");
for (const c of refCases) {
  const got = projectRef(c.conn);
  const ok = got === c.want;
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${c.name}: got ${got}, want ${c.want}`);
}

const matchCases = [
  {
    name: "the mistake this exists to catch: production pasted into the dev secret",
    a: pooler(PROD), b: pooler(PROD), want: true,
    why: "identical strings are the ordinary way this goes wrong"
  },
  {
    name: "same project, different connection shape",
    a: pooler(PROD), b: direct(PROD), want: true,
    why: "the sneaky version: it looks different and is the same database"
  },
  {
    name: "same project, different password after a rotation",
    a: pooler(PROD, "old"), b: pooler(PROD, "new"), want: true,
    why: "the password is not what makes it the same database"
  },
  {
    name: "two genuinely different projects",
    a: pooler(DEV), b: pooler(PROD), want: false,
    why: "the normal case: it must not block real work"
  },
  {
    name: "one string unreadable",
    a: "not a connection string", b: pooler(PROD), want: false,
    why: "unknown is not a match; the caller warns instead of blocking"
  },
  {
    name: "both unreadable",
    a: "nonsense", b: "other nonsense", want: false,
    why: "two unknowns must never compare equal, or every junk pair would block a run"
  },
  {
    name: "both empty",
    a: "", b: "", want: false,
    why: "absence is not sameness"
  }
];

console.log("\ndeciding whether two strings are the same database:");
for (const c of matchCases) {
  const got = sameProject(c.a, c.b);
  const ok = got === c.want;
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${c.name}: got ${got}, want ${c.want} (${c.why})`);
}

if (failed) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${refCases.length + matchCases.length} checks passed.`);
