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
- Departments: Grocery, Bakery, Clothing, Hardware, Gifts, Produce, Meat, Chip Stand, with Garden Center under Hardware.
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
- `/overdue`: invoices overdue or due soon, by dueBand(). Money-gated.
- `/vendors` and `/vendors/[id]`: the vendor ledger and one vendor's orders, invoices, notes.
- `/inventory`: counts and count lines.
- `/reorder`: formula-based reorder suggestions from the order ledger, counts, and reorder notes, with an optional Claude summary (/api/reorder).
- `/price-signs`: printable Garden Center price signs from item retail prices. Customer-facing, not money-gated.
- `/knowledge`: the tribal-knowledge notes, tagged and attributed.
- `/ask`: ask-your-store (/api/ask), answers from the store's own data with sources.
- `/maintenance`: property assets and recurring tasks with due dates.
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
- Author: use useEffectiveActor() for created_by and activity_log.actor_id (the signed-in member in enforced auth, the "Acting as" dropdown in demo). Hide the dropdown with {!REQUIRE_AUTH && ...}.
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
- docs/STATUS.md, the live status: what is built, what is left, the before-production checklist. The current source of truth.
- CONTRIBUTING.md, the coding and writing standards, branch and commit rules, and how to run build, lint, and tests.
- docs/ARCHITECTURE.md, the architecture, the data flow, and the Mermaid diagrams.
- RUNBOOK.md, the go-live steps and the "Turn on login" production cutover.
- references/data-model.md, the entity list and database conventions.
- references/design-tokens.md, the exact color values, status mapping, and form rules.
- docs/DATA_SOURCES.md and docs/DATA_INVENTORY.md, the Google Drive source files, each file's metadata and sample data, and how each maps to the app.
- robinsons_store_build_spec.md, the original plan kept for history. docs/SOURCES.md, the Drive links.
