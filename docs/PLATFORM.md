# Platform surface: every service, what it does, and what we deliberately have not adopted

The full inventory of what this app runs on, written so that a person or an AI session
picking this repo up knows the whole surface without guessing: which services are in use,
which plan each one is on, which platform features are adopted, and which are available and
deliberately declined with the reason.

Companion files: docs/ARCHITECTURE.md (the stack and data flow), docs/ENVIRONMENTS.md (dev
and production and how a change crosses), docs/DOMAIN_EMAIL.md (the domain and mailboxes),
docs/REQUIREMENTS.md (what has actually been asked for).

**The rule this file exists to serve.** A capability is adopted when a requirement in the
ledger needs it, not because it is free or new. The budget was set in
robinsons_store_build_spec.md section 8: typical $50 to $100 a month against a $200 ceiling.
Cost has never been the binding constraint on this project. Complexity is, because a
non-technical owner has to rely on this while running a store remotely, and every added
service is one more key, one more failure mode, one more answer to "where does the store's
data live", and one more thing that breaks in August when it matters most.

## Two open risks, both found 2026-08-12

These outrank every feature question below.

### 1. Vercel Hobby does not license this app

The account is on **Hobby**. Vercel's fair use guidelines
(https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage) say:

> Hobby teams are restricted to non-commercial personal use only. All commercial usage of
> the platform requires either a Pro or Enterprise plan.
>
> Commercial usage is defined as any Deployment that is used for the purpose of financial
> gain of anyone involved in any part of the production of the project, including a paid
> employee or consultant writing the code.

Two independent triggers apply, either one sufficient on its own: the store is a business
and this app runs its operations, and anyone paid to write the code counts by itself.

The exposure is not a fine, it is availability. If this is enforced, the app the store
receives stock on stops, and nothing in the design routes around it. **Vercel Pro is $20 per
seat per month.** Also lifts: edge requests 1M to 10M, WAF custom rules 3 to 40, WAF IP
blocks 3 to 100, runtime logs 1 hour to 1 day, plus spend management and deployment password
protection.

### 2. Supabase Free takes no backups

Confirmed at https://supabase.com/docs/guides/platform/backups:

| Plan | Backups |
|---|---|
| Free | **None.** Supabase's own advice is to run `db dump` yourself and keep off-site copies |
| Pro | Last 7 days of daily backups |
| Team | Last 14 days |
| Enterprise | Up to 30 days |

Point-in-time recovery is a paid add-on on top (about $100 a month for 7 days), and enabling
it replaces daily backups rather than adding to them. PITR is overkill at this volume; daily
backups are not.

**Confirm which plan the production project is on.** If it is Free, the store's vendors,
invoices, payments, HR records and uploaded invoice images have no automatic backup, against
a six-year Canadian record-keeping requirement. Supabase Pro is $25 a month.

The app's own Export screen (one workbook, a tab per table) is a real mitigation and worth
running on a schedule regardless, but it is a manual export, not a restore path: it does not
carry the storage bucket, and nobody will remember to run it every week in season.

## In use today

| Service | Does what | Plan | Notes |
|---|---|---|---|
| **Vercel** | Hosts the app, deploys on push, runs the daily cron | **Hobby, see risk 1** | Project `robinsons-store`. Preview deploys per PR are how the practice site works |
| **Supabase** | Postgres, Auth, Storage (`documents` bucket) | **Confirm, see risk 2** | ca-central Toronto. RLS per store per role. A second project is planned for dev per ENVIRONMENTS.md |
| **Anthropic API** | Capture extraction, Ask-the-store, reorder summary, feedback triage | Pay as you go | US-hosted. Default model claude-sonnet-5. $5 to $40 a month by volume |
| **Resend** | The daily due-date email | Free tier is adequate | Optional. Off unless the keys are set |
| **Vianet** | Domain robinsonsgeneralstore.ca, 5 of 10 mailboxes, store internet | About $10/mo | Domain expires 2026-10-16, auto-renew on. No self-serve DNS editor, changes are a phone call |
| **GitHub** | Code, and five Actions workflows | Free | `ci`, `jira-autopilot`, `migrate`, `post-deploy-watch`, `promote` |
| **Jira** | The board the autopilot builds from | Free tier | See docs/JIRA_AUTOPILOT.md and docs/LOOP_ENGINEERING.md |
| **AgentMail** | Inbound programmatic inbox | Marketplace, free tier | Installed 2026-08-12, **not yet wired in**. Chosen mechanism for email invoice intake, see DOMAIN_EMAIL.md section 4 |

### Vercel features adopted

- **Cron Jobs.** One entry in `vercel.json`, the daily 13:00 UTC call to `/api/alerts`.
- **Preview deployments.** Every PR gets one; this is the practice site in ENVIRONMENTS.md.
- **Custom domain.** `app.robinsonsgeneralstore.ca`, live and verified 2026-08-11.
- **DDoS mitigation.** On by default on all plans, nothing to configure.

## Worth adopting, each tied to a real requirement

Ordered by value. None of these is adopted yet.

| Capability | The requirement it serves | Why now |
|---|---|---|
| **Supabase Pro** | Six-year record keeping; the whole ledger | Risk 2. Nothing else on this list matters if the database is lost |
| **Vercel Pro** | Availability of a system the store depends on | Risk 1 |
| **AgentMail wired to intake** | "Email invoice intake", QUEUED in REQUIREMENTS.md | Fills the exact hole DOMAIN_EMAIL.md section 4 left open. Preferred over an IMAP poll because a scoped key cannot read info@ or drygoods@ if it leaks |
| **Vercel WAF rate limit on `/login`** | Auth is enforced and the app is now on a public domain | It was not reachable by name last week; it is now. Hobby allows 3 custom rules, which is enough for one |
| **GitHub secret scanning with push protection** | "Keep secrets out of the repo and out of chat" (skill) | Turns a convention into a control. Free on public repos, and this is exactly the class of mistake that is unrecoverable once pushed |
| **Supabase Advisors** | Invariant 6: a new table needs RLS in schema.sql AND auth_setup.sql | The skill calls this "the most common way a new feature regresses auth". Advisors detects missing RLS automatically instead of relying on review |
| **Deployment protection on the dev project** | ENVIRONMENTS.md: dev holds invented data but is publicly reachable | Low value while dev data is fake, real the moment anyone seeds it from production. Password protection is Pro |

## Available, deliberately not adopted

Recorded with reasons so the question does not get reopened every time somebody sees the
sidebar.

| Capability | Why not |
|---|---|
| **Vercel AI Gateway** | Inserts a hop in front of the route that reads dollar amounts off invoices. The skill records a hard-won rule there: sending a `temperature` parameter 400s every AI route, caught in review once already. A layer that can rewrite request params is that bug class waiting to happen, for $5 to $40 a month of spend that is not hurting anyone |
| **Vercel Blob / Storage** | Would split invoice images across two providers and contradict what the owner has been told about Canadian data residency. Supabase Storage already holds them, in Toronto, behind signed URLs |
| **Vercel Workflows** | Cron plus a route handles this volume. Revisit if email intake grows past a few dozen messages a day |
| **Vercel Sandboxes** | No untrusted code to run |
| **Vercel Agent** | The AI work already runs through `src/app/api/*` against the Anthropic API. A second agent layer duplicates it |
| **Vercel Flags** | The dev site plus the QA-to-Approved gate already answers "try it before it ships" |
| **Vercel Image Optimization** | Thumbnails come from Supabase signed URLs, which expire; optimizing them is fiddly for little gain on department laptops |
| **Vercel Connect: Miro, Notion** | Those are the builder's tooling, not the store's app. A general store has no Miro requirement |
| **Supabase Edge Functions** | The API routes on Vercel cover it; splitting server code across two runtimes doubles where to look when something breaks |
| **Supabase Realtime** | The notification bell polls on navigation, focus, open and timer. Polling is enough for one store and has fewer states to get wrong |
| **pgvector** | Deferred by design until the store's data outgrows one prompt. Ask-the-store passes context directly today and that works at tens of vendors |
| **Supabase PITR** | About $100 a month, and it replaces daily backups rather than adding to them. Daily backups on Pro are the right tier for this volume |
| **The enterprise stack** | Snowflake, Fabric, Redpanda, MuleSoft, API gateways. Locked out in the build spec section 8. One store, thousands of rows a month |

## How to decide the next one

1. Name the requirement in docs/REQUIREMENTS.md that needs it. If there is not one, stop.
2. Say where the store's data goes and whether that changes what the owner has been told in
   docs/owner-notes/store-app-infrastructure.html.
3. Say what breaks if the service is down or the free tier changes, and whether the store can
   still receive stock that day.
4. Add it here with the reason, adopted or declined.

A free tier on a path the store depends on is not free. It is an unpriced dependency that
can be withdrawn during the season, which is the one time of year it cannot be.
