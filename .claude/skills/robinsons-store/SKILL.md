---
name: robinsons-store
description: Build, extend, debug, and operate the entire Robinsons General Store platform, a capture-first store operations app for a Canadian general store. This covers the whole build, not just one area: the receiving and capture loop, inventory and counts, the vendor and order ledger, invoices and payments and due-date alerts, retail pricing and price signs, property maintenance, HR, the Ontario pesticide licence and its expiry, the tribal-knowledge base, the document-extraction and reorder and ask-your-store AI agents, the Postgres schema and its row-level security, Supabase Auth and login, the color and form design system, Canadian tax and privacy rules, the Vercel deploy, and the common runtime errors and how to fix them. Use it whenever the work touches the Robinsons app, Ravikiran's store, the receiving screen, the login or auth, the Supabase schema, or any store feature, even without naming this skill. Apply the locked architecture, the invariants, and the output rules here on every task.
---

# Robinsons General Store, Store Operations Platform

## What this project is
A capture-first operations app for a Canadian brick-and-mortar general store with heavy summer seasonality. The store currently runs on Excel, scribbled invoices, and Gmail subject-line search. The thesis: turn paper and the owner's head knowledge into a structured, attributed, searchable system simple enough for untrained seasonal staff, so the owner can hire a manager and run the store remotely.

Store facts:
- Robinsons General Store, the general store Ravikiran acquired, in Dorset, Ontario, P0A 1E0 per the pesticide licence at 1062 Main Street. Lakeside Dry Goods and L_S and Dry goods are a section inside it, not the store name. Confirm the operating address, an earlier note mentioned Atikokan. Tax is unaffected, both are Ontario at 13 percent HST.
- Owner is Ravi Kiran. Expert in Hardware, only high-level knowledge of the other departments, which is the reason tribal-knowledge capture matters.
- Departments, in the owner's required sequence (src/lib/departments.ts, applied to EVERY department list and dropdown): DryGoods & Lakeside, Hardware, Grocery, Property Maintenance, Bakery, Meat, Produce, Payrolls & Taxes, Others. Clothing and Gifts are sections inside DryGoods & Lakeside; Garden Center sits under Hardware. Chip Stand and Checkouts exist from earlier rounds and sort after the nine; do not delete them without asking.
- Sells regulated pesticides under an Ontario vendor licence with a tracked expiry.
- The 2026 bookings spreadsheet is the schema and the seed data. About 120 vendors with order amount, ship date, delivery status, invoiced amount, terms, due date, payment status.

The full plan with evidence, pricing, and citations is in robinsons_store_build_spec.md. Read it for depth. This skill is the working summary plus the rules and the playbooks to apply on every task.

## Locked architecture (do not re-debate)
- Frontend and API: Next.js App Router on Vercel, TypeScript. Client components fetch with useEffect; route handlers under src/app/api do the AI calls.
- Database, auth, storage: Supabase Postgres in a Canadian region (ca-central, Toronto), bundling Auth and Storage. pgvector is available but not used yet.
- Document AI: Claude Sonnet vision via the Anthropic API (the /api/extract route) for the dollar fields. GPT-4o fallback and AWS Textract are deferred, not built.
- Ask-your-store: /api/ask passes the store's notes, vendors, and invoices to Claude as context. pgvector is the deferred upgrade when the data outgrows one prompt.
- Not the enterprise stack. No Snowflake, Fabric, Redpanda, MuleSoft, API gateway, or MCP governance at this scale. One store, thousands of rows a month. The upgrade path is in the build spec and is earned only if the business grows to many stores.
- Budget ceiling is a couple hundred dollars a month. Realistic run rate 50 to 100.

## Repo layout
```
robinsons-store/
  README.md
  supabase/schema.sql        full data model, plus the dev row-level security and the documents storage policy
  supabase/seed.sql          departments, a curated set of real vendors, demo accounts (one per role)
  supabase/seed_bookings.sql the full real ledger (125 vendors), generated and validated against the sheet totals
  supabase/auth_setup.sql    the production cutover: auth_id, email auto-link, per-store per-role policies, storage lockdown
  scripts/generate-seed-bookings.mjs  regenerate seed_bookings.sql from the bookings .xlsx; self-checks against printed totals
  src/app/page.tsx           role-driven home: Today dashboard (manager/owner) or staff Today + feed
  src/app/capture/page.tsx   capture, extract, confirm, save (uploads the document to storage)
  src/app/dashboard, reports, overdue, vendors, vendors/[id], inventory, reorder,
    price-signs, knowledge, ask, maintenance, compliance, hr, hr/schedule, login
  src/app/api/extract, ask, reorder, alerts   the route handlers
  src/app/globals.css        the design system: tokens, app shell layout, page scaffolding, controls
  src/components/  AppShell (all chrome: sidebar, topbar, phone tab bar, More sheet), AuthGate,
    NotificationBell, CommandDashboard (manager Today home), KpiRow, StaffFeed
  src/lib/  supabaseClient, types, auth, store, format, status, hr, charts, importBookings,
    importSchedule, nav (grouped sidebar model), view (View-as preview),
    edit (canEdit, soft-delete voidRow, hard deleteRow), notify (bell items)
  vercel.json                the daily /api/alerts cron
  docs/  STATUS, VERIFICATION (per-feature sign-off record), ARCHITECTURE, DATA_SOURCES,
    DATA_INVENTORY, SOURCES
  RUNBOOK.md, CONTRIBUTING.md
  .claude/skills/robinsons-store/  this skill, so it travels with the code
```

## Screen and route map
Every screen is a client component that reads through useActiveStore() and filters by the active store_id. Money is gated where noted.
- `/` feed: the department feed of recent receiving events, with document thumbnails resolved through docUrls() in src/lib/docs.ts (signed URLs, public fallback in demo). Line totals are money-gated.
- `/capture`: the core loop. Upload an invoice photo or PDF, /api/extract returns structured lines with per-line confidence, a confirm screen flags low-confidence (amber) lines and an order-vs-invoiced discrepancy. The save is hard-blocked until every amber line is fixed (a human edit sets confidence to 1) or the person checks "I checked every amber line"; that acknowledgement is stored on receiving_event.low_confidence_ack and a database trigger (receiving_line_confidence_gate) refuses a low-confidence dollar line without it. Then save() uploads the file and writes receiving_event plus receiving_line plus an activity_log row. Has a manual-entry path with no file (phone orders).
- `/dashboard`: KPIs and charts (src/lib/charts, Okabe-Ito palette).
- `/reports`: reporting views. Money-gated figures.
- `/overdue`: invoices overdue or due soon, by dueBand(). Money-gated. Owners and managers can record a full payment inline (methods must be the payment.method check-constraint values: cheque, cc, etransfer, cash); the write is guarded against duplicate payments on retry and logs entity "invoice" like the vendor detail screen.
- `/vendors` and `/vendors/[id]`: the vendor ledger and one vendor's orders, invoices, notes.
- `/inventory`: counts and count lines.
- `/reorder`: formula-based reorder suggestions from the order ledger, counts, and reorder notes, with an optional Claude summary (/api/reorder).
- `/price-signs`: printable Garden Center price signs from item retail prices. Customer-facing, not money-gated, EXCEPT the margin calculator card (cost in, department target_margin applied, .99 retail out), which involves cost and is gated by canSeeMoney.
- `/knowledge`: the tribal-knowledge notes, tagged and attributed.
- `/ask`: ask-your-store (/api/ask), answers from the store's own data with sources.
- `/maintenance`: property assets and recurring tasks with due dates. Recurring tasks (daily through annual) tick "Done today" via the shared completeTask() in src/lib/tasks.ts, which stamps completed_at and rolls due_date one cadence forward (month-end safe); owners and managers can "Finish for good". The staff Today home shows the same tasks as a checklist, and the owner dashboard has a "Tasks today" done-vs-remaining KPI, all using dueToday()/completedToday() from src/lib/tasks.ts.
- `/compliance`: the pesticide licence and its expiry, alongside insurance policies. Premiums money-gated.
- `/hr` and `/hr/schedule`: employees, effective-dated pay rates, the weekly schedule. Pay and estimated pay money-gated.
- `/import`: owner and manager tool (Admin group) that accepts the 2026 bookings .xlsx, the weekly schedule .xlsx, or a category inventory sheet (SKU/description/stock); /api/import detects which and loads it idempotently (vendors by name via src/lib/importBookings.ts; employees by name and shifts deduped via src/lib/importSchedule.ts; items upserted by SKU then name and a dated count posted via src/lib/importInventory.ts, idempotent by file name, movement flags and overstock locations kept as line notes). The same screen has the full export: /api/export streams one Excel workbook with a tab per table, ids intact, a README tab of relationships, voided rows included as the archive.
- `/team`: owner and manager tool (Admin area) to create and remove staff logins in-app. Calls /api/admin/users, which uses the Supabase service role to create the auth account and the linked app_user row in one step. Removes the dashboard from day-to-day staff management.
- `/login`: email and password sign-in. Only reachable and only enforced when REQUIRE_AUTH is on.
- API routes: `/api/extract` (Claude vision), `/api/ask` (context answer), `/api/reorder` (suggestions + summary), `/api/alerts` (daily due-date email, Resend, cron-guarded by x-cron-secret), `/api/import` (auto-detects bookings, schedule, or inventory workbooks), `/api/export` (full workbook export, owner and manager), `/api/admin/users` (service-role user management, owner and manager only, store-scoped). All of them resolve the caller through src/lib/serverMember.ts: enforced mode requires a signed-in member and queries run as the caller so RLS applies.

## Conventions
Data model rules and the entity list are in references/data-model.md. The short version: snake_case, audit on every write through activity_log plus created_by, a confidence value on every extracted line, low-confidence dollar fields never auto-post, money as numeric dollars in the demo and integer cents before production.

App conventions to apply on every screen:
- Multi-store: read through useActiveStore() and filter every query by the active store_id; stamp store_id on every insert. All chrome lives in AppShell: managers and owners get the grouped sidebar (Today, Money, Store, People, Property, Admin) from src/lib/nav.ts plus a topbar with View as, the bell, and Capture; staff get a four-item list; phones get a bottom tab bar and a More sheet. Screens never draw their own nav.
- Page scaffolding: every screen opens with the page-head pattern (page-title, page-sub, page-actions) and uses tbl-wrap/tbl for tables. New screens must follow it.
- Edit and delete: gate with canEdit(role) from src/lib/edit.ts (owner and manager only), confirm every delete, use voidRow for soft deletes (ledger and master data) and deleteRow only for shifts, and filter every read with .is("voided_at", null) on voidable tables. Requires the columns from supabase/edit_delete.sql.
- Author: use useEffectiveActor() for created_by and activity_log.actor_id (the signed-in member in enforced auth, the "Acting as" dropdown in demo). Hide the dropdown with {!REQUIRE_AUTH && ...}. Screens with no dropdown use currentActorId(member) from src/lib/auth.ts; never inline the localStorage/REQUIRE_AUTH switch. Guard audit inserts with if (actor) so an unresolved identity never writes a null-actor log row.
- Money by role: hide cost and margin (unit cost, order and invoice amounts, payments, premiums, pay) from the staff role with canSeeMoney(role) from src/lib/auth. Retail, customer-facing prices are not hidden.
- Money and dates: format money with formatCAD(); compare dates with todayISO(), daysOverdue(), and dueBand() from src/lib/format.
- Documents: upload captured files to the `documents` bucket via supabase.storage; store the path on source_file_path or confirmation_file_path. Read thumbnails through docUrls() from src/lib/docs.ts (signed URLs with a public fallback), never getPublicUrl directly. The bucket and its policy are created by schema.sql (dev, public) and made private and authenticated-only by auth_setup.sql (production).

## Auth and security model
The app runs in two modes, switched by the build-time env var NEXT_PUBLIC_REQUIRE_AUTH (src/lib/auth.ts reads it once as REQUIRE_AUTH).
- Demo mode (unset or false): open access, no login. The "Acting as" dropdown (rgs_actor in localStorage) decides who a write is attributed to and which role the UI gates against. The dev row-level security in schema.sql lets the anon key read and write. This is the current default so the live demo keeps working.
- Enforced mode (true): a Supabase Auth session is required. AuthGate (src/components/AuthGate.tsx) sends anyone without a session to /login. The signed-in member's app_user row, linked by auth_id, decides identity, role, and store via useMember(). The per-store per-role policies in auth_setup.sql enforce it at the database, not just the UI.

How identity resolves:
- useAuthUser(): the Supabase Auth user, subscribed to auth state.
- useMember(): the app_user row whose auth_id matches the signed-in user. Degrades to null (no throw) when env is blank or the column is absent, so the blank-env build is safe.
- useEffectiveActor(users, actorId): returns the actor id to write with and the role to gate on. In enforced mode it is always the signed-in member regardless of any dropdown. In demo mode it is the picked actor.
- useCurrentRole(): the role for screens with no dropdown (dashboard, reports). Defaults to owner in demo mode until a staff actor is picked, so the demo shows full visibility.

Turning on real auth (the production cutover, about five minutes, in RUNBOOK.md "Turn on login"): enable Email auth, create one account per role with the SAME email as the seeded member (owner@/manager@/staff@/lead@robinsons.demo), run auth_setup.sql (it links every account to its member automatically by email, replaces the dev policies with per-store per-role ones, and locks the documents bucket to signed-in users), then set NEXT_PUBLIC_REQUIRE_AUTH=true in Vercel and redeploy. Login cannot be the compiled default because the accounts have to exist first and only the owner can create them in their Supabase; the security is fully built and ready, the switch-on is the owner's five-minute step.

Storage security: the app reads document thumbnails through docUrls() in src/lib/docs.ts, which creates signed, expiring URLs and falls back to the public URL only for the open demo bucket. Uploads require a policy on storage.objects or every capture fails with "new row violates row-level security policy". schema.sql opens the bucket for the demo (anon write, public-read); auth_setup.sql makes the bucket PRIVATE and narrows access to authenticated members, so in production no permanent public link to an invoice photo exists. Never reintroduce getPublicUrl as the primary read path.

## Environment variables
- NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: the Supabase project. Without both, SUPABASE_CONFIGURED is false and every screen shows its "Connection" card.
- NEXT_PUBLIC_REQUIRE_AUTH: "true" turns on login and the per-role policies. Unset or "false" is open demo mode. Build-time public var, so changing it needs a redeploy.
- SUPABASE_SERVICE_ROLE_KEY: server-side only, never NEXT_PUBLIC. Powers /api/admin/users (the Team page) to create and delete logins. Without it the Team page shows a note; everything else works.
- ANTHROPIC_API_KEY, ANTHROPIC_MODEL: the capture extraction, ask, and reorder summary. Missing key makes those routes report it instead of answering.
- RESEND_API_KEY, ALERT_EMAIL_FROM, ALERT_EMAIL_TO, CRON_SECRET: optional daily due-date alert email. Without them /api/alerts reports email is off and the rest of the app is unaffected.

## Debugging playbook (the errors this app actually throws)
- "column <table>.store_id does not exist" or "relation <table> does not exist" (for example maintenance_asset): the deployed code is newer than the database. The schema drifted. Fix: re-run schema.sql (drop the tables first with a drop-all DO-block) then seed.sql. For an existing database with data to keep, deliver the targeted ALTER or CREATE instead of a full rebuild.
- "storage: new row violates row-level security policy" on capture: the documents bucket has no upload policy. Fix: run the bucket + policy block (now in schema.sql), or auth_setup.sql in production.
- "new row violates row-level security policy" on a table insert in enforced mode: the member is not linked (app_user.auth_id is null) or store_id does not match my_store_id(). Fix: run auth_setup.sql section 4 to auto-link by email; confirm select full_name, role, store_id, auth_id from app_user.
- /api/ask or /api/extract returns 500 or a "needs ANTHROPIC_API_KEY" message: the key is missing or invalid in Vercel.
- Every screen shows a "Connection" card: NEXT_PUBLIC_SUPABASE_URL or ANON_KEY is unset, so SUPABASE_CONFIGURED is false.
- Stuck on "Checking your session" or bounced to /login in a loop: REQUIRE_AUTH is true but auth is misconfigured, or the signed-in user has no linked app_user row (auth_id null). Link it.
- Staff can see costs or amounts on some screen: that screen reads a money field without canSeeMoney(role) gating. Add the gate. This is a real regression class; check it on every money-bearing screen.
- A write is attributed to the wrong person, or the actor dropdown shows in enforced mode: the screen uses the raw dropdown actorId instead of useEffectiveActor(), or does not hide the dropdown with {!REQUIRE_AUTH && ...}.

## Invariants to preserve on every change
Breaking any of these is a regression even if the build passes.
1. Store scoping: every read filters by the active store_id; every insert stamps it. Child tables scope through their parent.
2. Money by role: every cost, order amount, invoice amount, payment, premium, and pay figure is behind canSeeMoney(role). Retail customer prices are not.
3. Actor integrity: created_by and activity_log.actor_id come from useEffectiveActor(); the actor dropdown is hidden when REQUIRE_AUTH.
4. Audit: every meaningful write inserts an activity_log row with a non-null entity_id.
5. Human in the loop on dollars: extracted lines carry confidence; low-confidence dollar fields never auto-post; an order-vs-invoiced discrepancy needs an explicit acknowledgement before save.
6. New table, two places: a new table added to schema.sql is covered by the dev_all loop automatically, but under enforced auth it has RLS on and NO policy, which denies everyone. You MUST add it to auth_setup.sql (the store-scoped array, or a child-table policy that scopes through its parent) or production breaks silently. This is the most common way a new feature regresses auth.
7. Build-safe: code must build with blank env. Auth and data helpers degrade to null rather than throwing; never require Supabase env or auth.users to exist at build time.
8. Payments only through the engine RPCs in src/lib/payments.ts: record_payment (record), edit_payment (fix date/method/reference/notes/filing; re-derives touched invoice statuses), void_payment (undo; invoices go back to owing), reconcile_postdated (editors only, on load). Never update or delete payment rows directly, never hand-set a derived invoice status without a payment behind it (the vendor page auto-opens Record payment when an edit marks an invoice paid with nothing recorded). Post-dated is a future paid_date on a cheque, never a method value.
9. AI text answers are plain text: prompts forbid markdown, routes strip it with plainText() from src/lib/aiText.ts, default model claude-sonnet-5 with ANTHROPIC_MODEL as the override. DO NOT send a temperature parameter: claude-sonnet-5 rejects non-default sampling and every AI route 400s. This was caught in review once already; do not re-add it.
10. One rule for what an invoice OWES, in two places that must agree to the cent: invoiceTotal() in src/lib/payments.ts and public.invoice_owed_total in SQL. Amount plus freight, plus HST UNLESS tax_mode is "included", where the tax is already inside the amount and adding it again overstates the bill. Any select feeding a money figure must fetch tax_mode, or a tax-included invoice silently reads back as tax-added. invoiceGoods() is the pre-tax figure for comparing against order amounts, never what is owed.
11. Comments are required on invoices, orders, and payments, with "N/A" as the accepted answer. A blank box and a deliberate nothing-to-note must not look alike months later. Filing asks WHERE as well as how: Digital or Physical/Digital requires a digital_file_location.
12. Owner feedback lives in the feedback table (Suggestions page): note + screenshot + voice recording, screenshot auto-read into ai_summary via /api/feedback-triage, statuses new/planned/done/declined, soft-voided like everything else. New rounds of WhatsApp feedback still get recorded verbatim in docs/OWNER_NOTES.md and triaged into docs/REQUIREMENTS.md.

## AI agents (all shipped)
1. Document extraction (/api/extract). Sends the image or PDF to Claude vision with a strict JSON-only contract (vendor, invoice_date, notes, line_items each with description, qty, unit_cost, retail_price_note, confidence), validates it, and shows a confirm screen that flags low-confidence fields and an order-vs-invoiced warning a human acknowledges. Never auto-post low-confidence amounts.
2. Reorder suggestions (/reorder and /api/reorder). Formula-based from the order ledger, the counts, and the reorder knowledge notes, with an optional Claude summary. Dual-season demand and ML are deferred until a clean season of sales data exists. The human decides.
3. Ask-your-store (/ask and /api/ask). Answers from the store's own notes, vendors, and invoices passed as context, naming the source. pgvector is the deferred upgrade at scale. This is the remote-oversight tool for departments the owner is not expert in.

Hosting note: the Anthropic API is US-hosted, fine for non-personal vendor invoices. Prefer Canadian-region services for any personal data.

## Design system
Exact color tokens, the one-meaning-per-hue status mapping, and the form and accessibility rules are in references/design-tokens.md. The short version: a calm neutral canvas, one calm blue primary, color carries meaning and never decorates, labels always visible above fields and never as placeholders, inline validation, big targets, scan do not type, WCAG AA. The one Instagram idea that transfers is letting the captured photos and the data carry the color while the interface stays quiet.

## Canada rules
- Ontario 13 percent HST is the working default. Keep a tax_rules table keyed by province for portability. Show HST as a separate line. Keep records six years.
- Province rates for seeding tax_rules are in the build spec section 13.
- PIPEDA governs the HR and employee data: consent, access, security. Quebec Law 25 only triggers if Quebec-resident personal data is processed, unlikely for an Ontario store, treat as a precaution and a reason to favor Canadian regions.
- Currency CAD, currency input masks.

## How this repo ships itself (read before touching .github or .claude)

Since 2026-07-28 the repo carries its own build, ship and watch loops. The full design and
the reasoning for every limit is docs/LOOP_ENGINEERING.md; the short version you must not
break:

- Work arrives by being asked for, in Slack. The Jira board and its autopilot were retired
  on 2026-08-12: it ran 96 model-backed sweeps a day over a board the owner never wrote to.
  Do not reintroduce a polling intake loop without a request actually arriving through it.
- How far a change travels is decided by a SCRIPT reading the diff
  (.github/scripts/classify-change.mjs), never by the model's own judgement. Words only
  merge themselves; app changes wait for a person; money, access, the database, and the
  automation's own files never merge.
- **`.github/**` and `.claude/**` are tier C.** The automation cannot edit the automation. A
  loop that can change its own limits does not have limits, and one that can change its own
  reviewer has no reviewer. Changing what the autopilot may do takes a human merging it.
- The app checks itself after every deploy at /api/health: that the deployed app and the
  deployed database still agree on what an invoice owes, and that no invoice shows a status
  its own payments do not support. A failure raises a bug on the board, which the intake
  loop then picks up.
- Merged database scripts apply themselves on push to main, in the order given by
  supabase/run-order.txt. Deciding a migration is still human; only the typing is automated.
  auth_setup.sql is excluded on purpose.
- Two read-only reviewers live in .claude/agents: money-reviewer (knows the specific ways
  this codebase has broken: a select missing tax_mode, an inline total bypassing
  invoiceTotal, SQL and TypeScript changed on one side only) and invariant-auditor. Use them
  on any diff that touches money or adds a query.

## Operational reality (how this repo is actually run)
- The build and review work happens in an isolated cloud container with no network route to the owner's Supabase or Vercel. Do not try to connect to the database or the live site. Deliver database changes as SQL the owner runs in the Supabase SQL editor, and deploys happen by pushing to the branch (Vercel auto-deploys main).
- schema.sql is a full rebuild (it drops and recreates), not an incremental migration. For a live database with data worth keeping, hand the owner a targeted, non-destructive snippet (ALTER TABLE, a single policy, a backfill) instead of telling them to re-run schema.sql.
- The owner is non-technical. Lead with the one or two things they must do, in order, in plain language. Put the SQL in a block they can paste. Never ask them to debug.
- Keep secrets out of the repo and out of chat. Env values go straight into Supabase and Vercel.

## Build sequence
Phases 1-6 plus property, HR, compliance, multi-store, the auth cutover, signed-URL document storage, and the hard low-confidence gate are shipped; see docs/STATUS.md. Deferred: pgvector at scale, ML reorder, SMS, integer-cents money.

## Output and communication rules for this project
- Lead with the answer, then context. Short and direct. No hedging or caveats unless asked.
- No em dashes anywhere.
- No AI buzzwords such as significantly, dramatically, meaningful, comprehensive, noticeably.
- Never invent or inflate metrics about the store. Use only real numbers from the bookings sheet or the owner.
- Prefer complete deliverables over step-by-step guides. After delivering a file, keep the explanation minimal.
- Optimize every decision for the store owner's time saved, money saved, and ability to run the store remotely. Skill-building for the builder is a byproduct, never a driver. Boring and working beats novel and fragile.
- Human-in-the-loop on every dollar field. Confidence is captured per line for exactly this reason.

## When to split this skill
Keep this as one skill for now. Split only if a piece grows past what fits cleanly here:
- A dedicated extraction skill if the document-extraction prompts, schemas, and fallback routing grow complex.
- A dashboard or charting skill when the dashboard grows, using the Okabe-Ito palette in references/design-tokens.md.
- A Canada tax skill if multi-province support becomes real.

## References
- CLAUDE.md at the repo root, the entry-point summary that loads in every session.
- docs/REQUIREMENTS.md, the living requirements ledger: every owner ask with its state (shipped, queued, open) and where it lives in code.
- docs/SUPABASE_SETUP.md, every SQL script and the exact order to run them (fresh install and live-database upgrade paths).
- docs/OWNER_NOTES.md, the owner's feedback verbatim round by round, Telugu translated, including the 2026-07 recordings transcripts.
- docs/STATUS.md, the live status: what is built, what is left, the before-production checklist. The current source of truth.
- CONTRIBUTING.md, the coding and writing standards, branch and commit rules, and how to run build, lint, and tests.
- docs/ARCHITECTURE.md, the architecture, the data flow, and the Mermaid diagrams.
- RUNBOOK.md, the go-live steps and the "Turn on login" production cutover.
- references/data-model.md, the entity list and database conventions.
- references/design-tokens.md, the exact color values, status mapping, and form rules.
- docs/DATA_SOURCES.md and docs/DATA_INVENTORY.md, the Google Drive source files, each file's metadata and sample data, and how each maps to the app.
- robinsons_store_build_spec.md, the original plan kept for history. docs/SOURCES.md, the Drive links.
