# Status and what is left

Single source for the current state of the build: what is done, what remains, and what to do before real staff use. The full vision is in robinsons_store_build_spec.md and setup is in RUNBOOK.md.

## Current state
Deployed to Vercel from main, backed by Supabase Postgres in ca-central (Toronto). The app is store-aware with two seeded stores and the real 2026 bookings data. Locked stack unchanged: Next.js App Router on Vercel, Supabase, Claude Sonnet vision plus the Anthropic API.

## Built
Store Operations
- Capture: drop an invoice image or PDF, Claude vision extracts vendor, date, line items, unit cost, and the retail note; the confirm screen shows subtotal, HST, and total, flags low-confidence fields, and shows an order-vs-invoiced warning a person acknowledges. An Enter manually path handles phone orders with no document. Posts to the feed with author and time.
- Department feed with a Today strip and a first-run how-to card. Owner dashboard with cash KPIs, ordered-vs-invoiced by department, and the most overdue.
- Vendor directory and vendor detail with add and edit for vendors, purchase orders and their status, invoices, and recorded payments.
- Outstanding and overdue view, inventory counts, knowledge base (search and add), ask-your-store (answers from your own data with citations), and the price-sign generator.

Property and Maintenance
- Assets and service accounts, tasks grouped overdue / due soon / open / done with assign and complete, insurance policies with renewal flags. Compliance screen for the Ontario pesticide licence with an expiry status.

HR
- Employees, effective-dated pay rates, and a weekly schedule with an hours-and-pay summary. Treated as PIPEDA personal data.

Reports and reorder
- Spend by department, ordered vs invoiced, outstanding aging, payment-status mix, and a vendor scorecard. Reorder gives formula-based suggestions plus an optional AI summary.

Cross-cutting
- Header store picker and area switcher (Store Operations, Property and Maintenance, HR, Reports). Reads scoped and writes stamped by the active store. Every write records who and when in activity_log. CAD throughout, Ontario 13 percent HST from a tax table. Daily Resend email of overdue and due-soon invoices (off until the Resend key is set).

## Open items (polish, tractable, no architecture change)
1. Compliance: insurance policies are read-only; add an add-and-edit form like the licence one.
2. Alerts email: label each invoice with its store, or send per store, now that data is multi-store.
3. HR schedule: reload employees when the active store switches.
4. Seed: set store_id inline on the original vendor, order, invoice, item, and note inserts, not only the backfill update, so a partial re-run still scopes store one.
5. Second store: seed a few maintenance, HR, and compliance rows so its screens are not empty.
6. Reorder and extract API routes: return 200 with a clear message on a model error instead of 502.
7. Header: cache the store list per session so it is not re-queried on every navigation.
8. Decide whether the Acting-as user list stays store-wide (current) or scopes per store.

## Before production (do not skip)
- Replace the dev row-level security (anonymous full access) with Supabase Auth and per-role, per-store policies. Keep floor staff from costs and margins. See the comment in supabase/schema.sql.
- Move document storage to signed URLs if invoices hold anything sensitive.
- Add a confidence threshold so low-confidence dollar fields require a human before they post.
- Set the Resend key, the alert addresses, and the cron secret in Vercel to turn on due-date emails.
- Confirm the operating address and the pesticide licence expiry date. Verify sales-tax logic against current CRA place-of-supply rules.

## Deferred (later phases, by design)
- Reorder forecasting from real demand needs a season of sales data; today it is formula-based and the human decides.
- The enterprise stack (Mulesoft, API gateway, MCP governance, Snowflake, zero-copy, Redpanda, Atlas, Fabric) is not needed at one-store volume; it is the upgrade path for many stores. See build spec section 8.
- SMS alerts (Twilio), deeper HR payroll, and automated property scheduling.

## Run and deploy
See RUNBOOK.md. Pushing to main auto-deploys to Vercel; each pull request gets a preview.
