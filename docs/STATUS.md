# Status and what is left

Single source for the current state of the build: what is done, what is verified, and what remains. The full vision is in robinsons_store_build_spec.md, setup is in RUNBOOK.md, and the per-feature sign-off record is in docs/VERIFICATION.md. Update this file and VERIFICATION.md in the same pull request as the work itself; if it is not recorded there, it is not done.

Last updated: 2026-06-12, on branch claude/great-johnson-CFSbi (PR #8, finalized and awaiting the owner's merge).

Owner decisions (2026-06-12, revised 2026-07-07):
- 2026-06-12: finalize and ship what exists; build no new features for now.
- 2026-07-07: the owner asked for a full production-readiness pass, superseding the ship-as-is call. Both previously deferred code-gates (signed document URLs, the hard low-confidence gate) are now built, and the whole app was audited against its invariants (see docs/VERIFICATION.md).
- Confirmed the store runs a POS and QuickBooks. This makes two roadmap items feasible and moves them to the top of the expansion list: a one-click QuickBooks export of invoices and payments, and a sales import from the POS that unlocks real margin, shrinkage, and demand-based reorder.

Product review against industry standards (2026-06-12): the app is strong on the buy side (vendors, orders, invoices, payments, counts) and absent on the sell side. Gaps found, in priority order: (1) sales/POS data and a QuickBooks export, now confirmed feasible; (2) three-way match (purchase order, receiving, invoice) before paying, an accounts-payable fraud and overpay control that uses data already in the app; (3) a food-safety compliance module (fridge and freezer temperature logs, sanitation logs, food-handler certifications with expiry, pest-control records) required under Ontario HPPA and O. Reg. 493/17, a natural fit for the existing Compliance screen and capture model; (4) perpetual inventory and CRM, lower priority. None are built; all are recorded here so the review is not repeated.

## Current state
Deployed to Vercel from main, backed by Supabase Postgres in ca-central (Toronto). Store-aware with two seeded stores and the real 2026 bookings data (125 vendors, validated against the sheet's printed totals). Locked stack unchanged: Next.js App Router on Vercel, Supabase, Claude Sonnet vision via the Anthropic API.

PR #8 carries the full redesign and the editing layer. It is build-, lint-, and typecheck-green and waiting on two owner actions: run `supabase/edit_delete.sql` in the Supabase SQL editor, then merge.

## Built

App experience (PR #8)
- One app, two faces. Managers and owners get a grouped sidebar (Today, Money, Store, People, Property, Admin), a slim topbar with View as, the notification bell, and Capture, and a Today home with the KPI row and what needs attention. Staff and leads get a four-item experience whose home is Today: greeting, big action tiles, then the live feed. On phones the sidebar becomes a bottom tab bar with Capture in thumb reach and a More sheet. The shell lives in src/components/AppShell.tsx; the navigation model in src/lib/nav.ts.
- One design system in globals.css: standard page headers, shared tables, focus rings, press states, action tiles, safe-area handling, print rules. Capture is phone-first: one large photo card, stacking actions, sideways-scrolling line items.

Store Operations
- Capture: drop an invoice image or PDF, Claude vision extracts vendor, date, line items, unit cost, and the retail note; the confirm screen shows subtotal, HST, and total, flags low-confidence fields, and shows an order-vs-invoiced warning a person acknowledges. An Enter manually path handles phone orders. Posts to the feed with author and time.
- Department feed, Today dashboard (KPI row, departments, most overdue), charts page.
- Vendor directory and vendor detail with add, edit, and delete for vendors, purchase orders, invoices, and payments.
- Outstanding and overdue view, inventory counts, knowledge base, ask-your-store with citations, price-sign generator.
- Payments (payments v2): a global Payments page records any vendor payment without entering a department. Vendor search with department filter chips, tick one or several open invoices (one cheque can settle invoices across departments; each allocation keeps its department), deposits/prepayments with no invoice, the owner's method list (Cash, Cheque, CC_Visa, CC_Mastercard, CC_AMEX, CC_Debit, E-Transfer, EFT, Other with a required note), a reference field per method (cheque number, e-transfer ref), partial payments (invoice shows partially paid with the remainder), and post-dated cheques (future paid date; flips to paid on its own when the date arrives; a Scheduled list shows what is about to leave the account). All recording goes through the record_payment RPC (payment + allocations + statuses + audit, one transaction); deleting a payment goes through void_payment, which puts the invoices back to owing. Vendor detail and Due-and-overdue use the same path, and Add invoice can record "arrived already paid" with its payment in one step. Requires `supabase/payments_v2.sql` on existing databases.
- Payouts round 2 (owner's Departments & WorkFlow sheet): the page is named Vendor payouts and states that customer till sales are out of scope. Department-level categories are the owner's list (DryGoods & Lakeside, Hardware, Grocery, Produce, Bakery, Meat, Chip Stand, Checkouts, Property Maintenance, Others); Clothing, Gifts, and Garden Center are sections that roll up into their category, and the category chips filter vendors accordingly. A vendor can be added right inside the payout flow (name + category, one screen). Invoices carry invoice date, freight (total owed = amount + freight + HST), and delivery status (Delivered / Not delivered); Property Maintenance invoices instead carry estimate #, type of work (Repair / Upgrade), and a short description. Payments carry confirmation filing (Digital / Physical). Reports gained HST by department for a financial year, with sections rolled up and a year picker. Rerun `supabase/payments_v2.sql` to get the categories and new fields.

Editing layer (PR #8)
- Edit and delete on every data-entry screen, owners and managers only, via src/lib/edit.ts. Deletes are soft (voided_at, audit-logged) for ledger and master data, hard for shifts. Every list and total filters voided rows. Requires `supabase/edit_delete.sql` before deploy.

Property and Maintenance, HR, Compliance
- Assets and recurring tasks with assign and complete; insurance policies with renewal flags; the Ontario pesticide licence with expiry status. Employees, effective-dated pay rates, weekly schedule with hours-and-pay summary, treated as PIPEDA personal data.

Reports and reorder
- Spend by department, ordered vs invoiced, outstanding aging, payment-status mix, vendor scorecard. Reorder gives formula-based suggestions plus an optional AI summary.

Admin (owners and managers)
- Import data: upload either the 2026 bookings .xlsx or the weekly schedule .xlsx; the API detects which and loads it idempotently (vendors by name; employees by name and shifts deduped by employee, date, start, end). Team: create and remove staff logins in-app (needs `SUPABASE_SERVICE_ROLE_KEY`).
- Notification bell: due and overdue invoices, expiring licence and insurance, overdue maintenance.

Cross-cutting
- Reads scoped and writes stamped by the active store. Every write records who and when in activity_log. CAD throughout, Ontario 13 percent HST from a tax table. Daily Resend email of due invoices (off until the key is set). Auth ships behind `NEXT_PUBLIC_REQUIRE_AUTH` with per-store per-role policies in auth_setup.sql; demo mode stays open with the Acting-as picker. Money fields hidden from staff in both modes.

## Gates before the product is real (in order)
1. Owner: run `supabase/edit_delete.sql`, then merge PR #8.
2. Owner: turn on login (RUNBOOK.md "Turn on login", about five minutes).
3. Owner: set the Resend key, alert addresses, and cron secret so due-date emails send.
4. Owner: delete or redact the Lawson "PO Details.docx" in Drive; it holds a full credit card number in plain text. Never import it.

Both build gates shipped 2026-07-07 on the owner's make-it-production-ready instruction:
- Signed document URLs: thumbnails resolve through src/lib/docs.ts (signed, expiring URLs with a
  public fallback for the open demo bucket); auth_setup.sql makes the bucket private at cutover.
- Hard low-confidence gate: capture blocks the save until every amber line is fixed (editing
  clears the flag) or explicitly confirmed; the acknowledgement is stored on receiving_event
  (low_confidence_ack) and a database trigger refuses a low-confidence dollar line without it.

## Expansion plan (agreed 2026-06-11, extended 2026-07-07 from the owner's notes)
The owner's raw notes, their refined readings, and the coverage check live in docs/OWNER_NOTES.md.
- Wave 1, kill the Gmail archaeology: email intake agent (forward invoices to a store address; extraction drafts the records for human confirm; owner-editable sender allowlist per the 2026-07-07 note), payment-matching agent, and a daily morning brief for the owner.
- Wave 2, inventory intelligence: the category inventory spreadsheet importer SHIPPED 2026-07-08 (the Import screen auto-detects SKU/description/stock workbooks, upserts items by SKU, posts a dated count, and keeps FAST/SLOW/DEAD flags and overstock locations as line notes; verified against the real shapes of all the Drive sheets, including the paint matrix and the cross-retailer sheet). Still queued: per-SKU dual-season reorder points, monthly statement reconciliation, seed the price-sign library from the real sign docs.
- Full data export SHIPPED 2026-07-08: one Excel workbook from the Import screen with a tab per table, every id intact so relationships hold, a README tab mapping the links, voided rows included as the archival record. Owner and manager only under enforced auth.
- Value round SHIPPED 2026-07-08 (owner asked for one last round of what makes sense):
  1. Daily task check-offs: recurring tasks tick "Done today" and roll their due date one cadence forward (src/lib/tasks.ts); the staff Today home shows a Today's tasks checklist with big Done buttons; the owner dashboard gains a "Tasks today" done-vs-remaining KPI. Covers the owner's price-check and restocking notes and two blueprint items. No new tables; completions are attributed in activity_log.
  2. Margin calculator on Price signs (money roles only): cost in, department margin rule applied, suggested .99 retail out; each department's target margin saves to department.target_margin (edit_delete.sql section 6).
  3. Low-stock alert in the bell: items at or below 3 on their latest count, linking to Reorder. Not money, all roles.
  4. Record payment on the Outstanding screen (owner and manager): one tap marks an invoice paid with date and method, writes the payment row, and logs who did it.
- Wave 3, people and property: timesheets plus a payroll-ready export (not in-app payroll; CPP, EI, and T4 remittance stay with the bookkeeper or a payroll service), maintenance recurrence autopilot with photo-confirmed completion, schedule drafting.
- From the owner's 2026-07-07 notes and blueprint (order proposed in docs/OWNER_NOTES.md): department task checklist with per-day completion and a done-vs-remaining widget on the owner dashboard; smart margin calculator with per-department margin rules; tenant tracker (rent, payments, paid-this-month); multi-department vendors (the DT case).
- Also queued: the Excel-style editable grid for the ledger; QuickBooks export and POS sales import (confirmed feasible 2026-06-12, the store runs both).

## Open items (polish, tractable)
1. Compliance: insurance policies could use the same add-and-edit form as the licence.
2. Alerts email: label each invoice with its store, or send per store.
3. HR schedule: reload employees when the active store switches; week navigation during a slow load can leave the header and list on different weeks.
4. Seed: set store_id inline on the original inserts, not only the backfill, so a partial re-run still scopes store one.
5. Second store: seed a few maintenance, HR, and compliance rows so its screens are not empty.
6. Reorder and extract API routes: return 200 with a clear message on a model error instead of 502.
7. Decide whether the Acting-as user list stays store-wide or scopes per store.
8. Storage policy scopes to the bucket, not the store: a signed-in member of store two could read store one's documents. Fine while both stores are the same owner; scope object paths by store before onboarding an outside store.
9. View as previews navigation and home, not money hiding; verifying what staff see still needs signing in as (or acting as) a staff member.
10. Import: if a bookings import fails partway, the vendors already inserted are skipped on re-run and their missing children are not backfilled. Re-import after deleting the partial vendors, or add child-level idempotency.
11. Vendor detail loads by id without checking the vendor belongs to the active store (harmless single-store; the DB policies enforce it once auth is on).

## Production audit, 2026-07-07 (see docs/VERIFICATION.md)
A seven-dimension audit (store scoping, money gating, actor and audit integrity, edit and delete, RLS coverage, API hardening, build safety) with adversarial verification ran before the merge. Every confirmed defect was fixed the same day:
- Money leaks closed: the notification bell, /api/ask, and the reorder AI summary no longer expose dollar amounts to the staff role.
- Voided (deleted) rows no longer count anywhere: charts dashboard KPIs, the daily alert email, weekly estimated pay, reorder inputs, and capture's vendor and order matching all filter voided_at now.
- API routes hardened for the auth cutover: /api/ask, /api/reorder, /api/extract, and /api/import require a signed-in member once login is on (imports require owner or manager, reorder summaries a money role); queries run as the caller so the per-store RLS applies; /api/alerts uses the service role (the cron has no session), requires CRON_SECRET once auth is on, and excludes voided invoices.
- Privilege escalation closed: a manager can no longer create or remove an owner from the Team page.
- Capture now saves the Notes field (new receiving_event.notes column, in schema.sql and edit_delete.sql).
- Feed deletes are attributed to the signed-in member (or the Acting-as pick), not null.
- The bookings import no longer aborts when a vendor appears on two rows of one sheet.
- auth_setup.sql is now actually idempotent: every policy is dropped before it is recreated, so re-running it for new accounts works as documented.
- The owner command dashboard cancels stale queries on store switch and surfaces query errors instead of rendering zeros.

## Deferred (by design)
- ML reorder forecasting until a clean season of sales data exists; pgvector for ask-your-store at scale; SMS alerts; integer-cents money (before production hardening); the enterprise stack (see build spec section 8).

## Run and deploy
See RUNBOOK.md. Pushing to main auto-deploys to Vercel; each pull request gets a preview. The verification record and re-verification rules are in docs/VERIFICATION.md.
