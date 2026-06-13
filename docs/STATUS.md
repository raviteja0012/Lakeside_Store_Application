# Status and what is left

Single source for the current state of the build: what is done, what is verified, and what remains. The full vision is in robinsons_store_build_spec.md, setup is in RUNBOOK.md, and the per-feature sign-off record is in docs/VERIFICATION.md. Update this file and VERIFICATION.md in the same pull request as the work itself; if it is not recorded there, it is not done.

Last updated: 2026-06-12, on branch claude/great-johnson-CFSbi (PR #8, finalized and awaiting the owner's merge).

Owner decisions (2026-06-12):
- Direction: finalize and ship what exists; build no new features for now. The two production code-gates (signed document URLs, server-side low-confidence gate) are deferred by the owner's choice to ship as-is. Residual risk noted in the gates table below; recommend closing them before real staff handle invoices.
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
3. Build: signed URLs for the documents bucket so staff cannot open an invoice image and read hidden amounts.
4. Build: server-side gate so low-confidence dollar fields can never post without a person (today it is a UI flag).
5. Owner: set the Resend key, alert addresses, and cron secret so due-date emails send.
6. Owner: delete or redact the Lawson "PO Details.docx" in Drive; it holds a full credit card number in plain text. Never import it.

## Expansion plan (agreed 2026-06-11)
- Wave 1, kill the Gmail archaeology: email intake agent (forward invoices to a store address; extraction drafts the records for human confirm), payment-matching agent, and a daily morning brief for the owner.
- Wave 2, inventory intelligence: import the category inventory spreadsheets from Drive into item and counts, per-SKU dual-season reorder points, monthly statement reconciliation, seed the price-sign library from the real sign docs.
- Wave 3, people and property: timesheets plus a payroll-ready export (not in-app payroll; CPP, EI, and T4 remittance stay with the bookkeeper or a payroll service), maintenance recurrence autopilot with photo-confirmed completion, schedule drafting.
- Also queued: the Excel-style editable grid for the ledger.

## Open items (polish, tractable)
1. Compliance: insurance policies could use the same add-and-edit form as the licence.
2. Alerts email: label each invoice with its store, or send per store.
3. HR schedule: reload employees when the active store switches.
4. Seed: set store_id inline on the original inserts, not only the backfill, so a partial re-run still scopes store one.
5. Second store: seed a few maintenance, HR, and compliance rows so its screens are not empty.
6. Reorder and extract API routes: return 200 with a clear message on a model error instead of 502.
7. Decide whether the Acting-as user list stays store-wide or scopes per store.

## Deferred (by design)
- ML reorder forecasting until a clean season of sales data exists; pgvector for ask-your-store at scale; SMS alerts; integer-cents money (before production hardening); the enterprise stack (see build spec section 8).

## Run and deploy
See RUNBOOK.md. Pushing to main auto-deploys to Vercel; each pull request gets a preview. The verification record and re-verification rules are in docs/VERIFICATION.md.
