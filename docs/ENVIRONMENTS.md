# Dev and production: two environments, and how a change crosses between them

Asked for on 2026-07-31: build to a dev site first, test it there with dummy data covering
the real scenarios, and promote to production only when Ravi approves the ticket.

Both open questions were left to "best standards", so here they are with the reasoning,
because a convention nobody can justify gets abandoned the first time it is inconvenient.

## The shape

```
  a ticket          develop branch            main branch
  on the board  ->  dev site + dev database  ->  live site + live database
                    Ravi tests here             the store uses this
```

- **`develop`** is the integration line. Every change lands here first. It deploys to the
  dev site, which points at a **separate Supabase project** holding only dummy data.
- **`main`** is production. It changes only by promotion from `develop`, and only after a
  human approves the ticket on the board.

## Decision 1: real QA and Approved statuses on the board

Chosen over reusing In Review and Done, and over approving by comment.

The workflow becomes:

```
To Do -> In Progress -> In Review -> QA -> Approved -> Done
```

- **QA** means it is built and sitting on the dev site. The autopilot moves it here itself
  and comments the dev link.
- **Approved** is Ravi's word that it is right. Moving a ticket here is what promotes the
  change to production.
- **Done** means it is live. The promotion sets it.

Why not overload Done: because Done would then mean "approved to ship" in one place and
"finished" in another, and six months later nobody remembers which. Why not a comment:
because approval belongs on the board where it is visible at a glance, not buried in a
thread. A status costs five minutes of Jira admin once and removes an ambiguity forever.

**You add these two statuses** (Project settings, Workflows). Until they exist the
promotion workflow stays inert and everything behaves as it does today.

## Decision 2: a separate Supabase project for dev

Chosen over a "Test Store" row in the live database, and over a throwaway CI database.

The multi-store support would technically allow a test store inside the real database, and
it is tempting because it is free and instant. It is also wrong here: test data would sit
in the same tables as real vendor records, and a migration that goes bad hits both at once.
The whole reason for a dev environment is that a mistake there costs nothing, and that
stops being true the moment it shares a database with the store's money.

A throwaway CI database was the other option. It is cheaper still, but it gives Ravi
nothing to click on, and "let him try it before it goes live" was the actual request.

So: a second free Supabase project, seeded from `supabase/seed_dev.sql`, which is written
to cover the cases that have actually broken before rather than a tidy happy path.

## What crosses, and what does not

**Code crosses.** `develop` to `main` by pull request, opened automatically when a ticket
reaches Approved.

**Data never crosses.** Dev data is invented and stays in dev; production data is the
store's and stays in production. Nothing copies either way. If dev needs to look like
production, extend `seed_dev.sql`, do not clone the live database: it holds real vendor
terms and real payment history.

**Schema crosses as scripts.** The same files in `supabase/run-order.txt` run against dev
on a push to `develop`, and against production on a push to `main`. A migration is
therefore always exercised on dev first, which is the point: `order_invoice_fields.sql`
rewrote how invoice totals work, and finding that out on dev is much cheaper than finding
it out on the store's ledger.

## The full path of one change

1. A ticket lands on the board, or a comment arrives on an existing one.
2. The autopilot builds it on a branch and opens a pull request into **`develop`**.
3. On merge, `develop` deploys to the dev site and the dev database gets the scripts.
4. The autopilot moves the ticket to **QA** and comments the dev link.
5. Ravi tries it on the dev site, against dummy data, with no risk to anything.
6. He moves the ticket to **Approved**.
7. The promotion workflow opens a `develop` to `main` pull request, and merges it once the
   checks pass. Production deploys and the production scripts run.
8. The ticket moves to **Done**, and the post-deploy watchdog confirms the live site still
   agrees with its database.

Steps 2, 3, 4, 7 and 8 are automatic. Steps 5 and 6 are the human ones, and they are the
whole point of the arrangement.

## What is built, as of 2026-08-09

The design above was written first and the code came after. All of it now exists:

| Piece | Where |
|---|---|
| Scripts apply to dev on a push to `develop`, to production on a push to `main` | `.github/workflows/migrate.yml` |
| The autopilot opens its pull requests into `develop` when that branch exists | `.github/workflows/jira-autopilot.yml` |
| A finished change parks the ticket in QA | `.github/scripts/jira-transition.mjs` |
| Approved on the board opens and merges a `develop` to `main` pull request | `.github/workflows/promote.yml`, `.github/scripts/jira-approved.mjs` |
| Dev dummy data, built from the shapes that have actually broken this code | `supabase/seed_dev.sql` |

Every piece is inert until its secret, branch or status exists, and that is deliberate: the
autopilot targets `main` exactly as before until a `develop` branch appears, the promotion
workflow finds nothing until the Approved status exists, and the dev migration is skipped
until `SUPABASE_DB_URL_DEV` is set. There is no flag day and nothing half-configured breaks.

One rule enforced by CI rather than by remembering it: `supabase/run-order.txt` may never
name a seed file, so `seed_dev.sql` cannot reach any database through the pipeline. Dev data
is put there by hand, once.

## Setting it up

Each piece is inert until its secret or setting exists, so this can be done in any order
and nothing breaks half-configured.

| What | Where | Why |
|---|---|---|
| Create a second Supabase project, name it something like `robinsons-store-dev` | supabase.com | The dev database |
| Run `schema.sql`, then `seed.sql`, then `seed_dev.sql` in it | Supabase SQL editor | Builds and fills the dev database |
| Add repository secret `SUPABASE_DB_URL_DEV` | GitHub, Settings, Secrets and variables, **Actions** | Lets the scripts run against dev. The session pooler URI on port 5432, from Supabase. Not the direct connection (IPv6-only, unreachable from a runner) and not the 6543 transaction pooler. See docs/SUPABASE_SETUP.md |
| Create a second Vercel project from the same repo, set its production branch to `develop` | vercel.com | The dev site |
| Point that project's env vars at the DEV Supabase | Vercel, dev project, Environments | So the dev site never reads the real database. Check this twice |
| Add repository variable `DEV_URL` with the dev site address | GitHub, Settings, Variables | So the ticket comment can link to it |
| Add the QA and Approved statuses to the board workflow | Jira project settings | The promotion gate |

## What could still go wrong, honestly

- **The dev site pointed at the live database.** This is the one real hazard in the whole
  arrangement, and it is a copy-paste mistake, not a subtle one. Check the dev project's
  `NEXT_PUBLIC_SUPABASE_URL` against the live one before trusting anything.
- **Dev and production schemas drifting.** They cannot drift through the pipeline, because
  both run the same ordered list, but they can drift if somebody runs something by hand in
  one and not the other. The health check on each environment is what catches it.
- **A change that works on dummy data and fails on real data.** Dev holds hundreds of rows;
  production holds the real ledger. Volume-sensitive bugs will still reach production
  first, and that is a known limit of this design rather than something it solves.
