// The app, explained in plain words, for the Ask-the-store assistant. This ships with the
// code, so it is always true for the deployed version; update it in the same PR as any
// screen change it describes. No dollar figures live here, so it is safe for every role.

export const APP_GUIDE = `
WHAT THIS APP IS: the operations system for Robinson's General Store. It tracks vendors,
orders, invoices, payments, credits, inventory counts, price signs, maintenance, HR,
compliance, and the store's own knowledge, and it is the single place money owed to
vendors is recorded and settled.

SCREENS AND WHAT THEY ARE FOR:
- Today: the day at a glance. Six tiles (captures, tasks, outstanding, overdue, late
  deliveries, to reorder); every tile opens the screen where that number is acted on.
- Capture: photograph or upload a vendor invoice or delivery slip; the AI reads the lines;
  a person confirms anything uncertain and any order-vs-invoiced difference, then saves.
  There is a manual entry path for phone orders.
- Feed: recent deliveries and activity, newest first.
- Due and overdue: every unpaid, partially paid, or post-dated invoice by due date.
  Editors can record a payment right on the row. Vendor names open the vendor page.
- Vendor payouts (Payments): the one place to record any money going out to a vendor.
  Pick a category chip, pick the vendor, tick the open invoices the payout covers (one
  cheque can settle several invoices), or mark it a deposit when no invoice exists yet.
  For an installment toward everything owed, type the amount and use "Spread it oldest
  first". Post-dated cheques are payments with a future date; they flip to paid on their
  own when the date arrives. Recent payments can be Edited (date, method, reference,
  notes, filing) or Voided; the amount is fixed, so void and re-record a wrong amount.
- Vendors: opens on the department list, each card showing how many vendors it holds. Pick
  a department to see just its vendors, with a search box across names, products, and reps;
  All vendors shows everyone at once, and Add vendor inside a department files the new
  vendor there automatically. A vendor page holds contact info, orders, invoices, payments,
  credits, and a Statement view (charges and payments in date order with a running balance,
  printable, for checking a vendor's mailed statement line by line).
- Reports: spend by department, ordered vs invoiced, outstanding aging, payment status
  mix, HST by department for a financial year, a vendor scorecard, a Department drill-down
  (invoiced, paid, owed per department, opening into vendors), deliveries arriving in the
  next 7 days, and late deliveries.
- Reorder: who likely needs an order this season, from the ledger and reorder notes,
  with an optional AI summary. A person always makes the final call.
- Inventory: dated counts per department; counts load from category sheets on Import.
- Price signs: printable signs; the margin calculator is for managers and the owner.
- Knowledge: the store's tribal knowledge, tagged and searchable.
- Suggestions: the owner's inbox to the developer. A note, an optional screenshot (the
  app reads it into text automatically), an optional voice recording, statuses, and a
  "Copy developer digest" button.
- Import data (Admin): drop the bookings workbook (original or updated layout), the
  weekly schedule, or category inventory sheets. Re-uploading applies only what changed;
  every recognized upload is archived under Previous uploads with download links.
  "Export everything" builds one Excel workbook of every table with relationships.
- Maintenance: property assets and recurring tasks with a daily checklist.
- Compliance: licences and insurance and their expiry dates.
- Employees and Schedule: staff, pay rates (money roles only), weekly shifts.

HOW COMMON THINGS ARE DONE:
- Fix a wrong payment date: open the vendor, Payments section, Edit on the payment row,
  change the date, Save. Invoice statuses recompute on their own.
- Partially pay an invoice: record a payment for less than what is owed; the invoice
  shows partially paid with the remainder, and flips to paid when a later payment covers
  the rest. Nobody sets statuses by hand.
- Mark an invoice that arrived already paid: Add invoice, set Payment status to "Paid
  already", and the payment records with it in one step.
- Record an invoice whose price already includes the tax: on Add invoice set Tax to "Tax
  included in the invoice amount". The HST still gets recorded for the tax report, but it
  is not added on top, so what the app says is owed is what the vendor billed.
- Note a short shipment: set Delivery status to "Partially delivered", put the arrival day
  in Delivered date, and describe what was missing or damaged in Delivery comments. A
  credit note on the vendor page is what actually reduces the money owed.
- See what a vendor still owes or is owed: the vendor page header (Outstanding, deposits
  on account, ordered-but-not-invoiced), or the Statement view for the full running
  balance.
- Give feedback or report a problem: the Suggestions screen; or tell Ask "log this
  issue: ..." and it lands in Suggestions when signed in.

WHO SEES WHAT: staff see no dollar figures anywhere; leads, managers, and the owner see
money. Editing needs manager or owner. Deleting anything only hides it (soft void); the
history stays for taxes.
`;
