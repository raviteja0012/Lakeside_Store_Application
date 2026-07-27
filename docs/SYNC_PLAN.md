# Google Sheets and the app: the sync plan

The owner runs the store on live Google Sheets today ("2026 bookings L/S & Dry goods" with
Dry goods / Lake side / Local Vendors / Grocery Vendors / AskingInventory tabs, and
"2026_Payments" with Bakery / Meet / Utility / Notes / Renewals & Training /
MaintanancePayments / Grocery / Loans&Payments tabs). The goal, agreed 2026-07-27: keep the
sheets and the app in sync, pulling delta changes from the sheets and pushing app-entered
data back, until the store either migrates fully to the app or settles on a permanent
hybrid. This file is the design; each phase lands as its own PR.

## Ownership rules (the part that prevents chaos)

Field-level ownership, not file-level:
- The SHEETS lead on: vendor identity and contact info, products we carry, order-status
  color coding, comments. These are the columns the owner edits daily and formats by hand.
- The APP leads on: everything money-derived. Payments, allocations, invoice statuses,
  credits, and audit history live in the payments engine and are strictly richer than the
  sheet's PAID column. Sheet money cells are treated as INPUT on first load and as
  PROJECTION afterward.
- Conflicts resolve by ownership, not by timestamp: a sheet edit to a contact field wins
  over the app copy; an app payment always wins over a sheet PAID cell. Anything
  ambiguous lands in the app's Suggestions inbox for a human call, never silently.

## Phase 1 (SHIPPED): pull deltas through the importer

The header-driven importer (importBookingsV2) is the pull mechanism:
- New vendors arrive with everything (orders, invoices, payments, credits, notes).
- EXISTING vendors get their info fields refreshed when the sheet changed them
  (rep, phone, email, products we carry, terms). Non-empty sheet values win; a blank
  cell never erases app data; money rows are never re-touched, so re-import cannot
  double-book or double-pay. Credits stay idempotent by deterministic id.
- Today the trigger is manual (download the sheet as .xlsx, drop it on Import). The same
  code path serves Phase 2's automatic pull.

## Phase 2: automatic pull from the live sheets

- Access: the owner shares both live sheets (Viewer) with the developer's Google account
  for ad-hoc reads through the Drive connector, and with a Google service account for the
  app's server. The service-account email goes in env (GOOGLE_SERVICE_ACCOUNT_JSON), never
  in the repo.
- Mechanism: a Vercel cron route (/api/sheet-sync) reads each tab via the Sheets API,
  reuses parseWorkbookV2 verbatim (it already maps by header name), and runs the same
  refresh flow as Import. Row-hash bookkeeping per (sheet, vendor) in a small sync_state
  table makes each run a true delta pass and gives a visible "last synced" stamp.
- Cadence: hourly is plenty; the sheet changes at human speed.

## Phase 3: push from the app back to the sheets

- Never write into the owner's hand-formatted tabs. The app writes to clearly-owned
  surfaces: a "FromApp" tab per spreadsheet (vendor, invoice #, amount, status, paid
  date, method, balance, updated-at), refreshed wholesale each run. The owner sees app
  truth inside the tool he lives in, and his own tabs are never at risk.
- If the hybrid sticks long-term, selected cells (PAID, PaymentDate) can graduate to
  in-place writes under the ownership rules above, with the FromApp tab as the audit
  mirror. That is a deliberate later call, not a default.

## Phase 4: converge

- Either the sheets retire (the app's Import/Export covers arrival and departure of data,
  and the FromApp tabs become the archive), or the hybrid becomes permanent and Phase 2+3
  simply keep running. No forced cutover; the owner decides by usage.

## Blockers and asks (current)

- Share the two live sheets with raviteja.potluru@gmail.com (Viewer) so Phase 2 design can
  be validated against real tabs (the Drive connector sees only that account's files; the
  live sheets are owned by the store's Google account).
- Phase 2 needs a Google Cloud service account (free) and one env var in Vercel.
- Jira: epics/stories for Phases 2-4 to be created on the SCRUM board when the Atlassian
  connector reconnects.
