# Requirements ledger

The living requirements record for the Robinson's General Store platform. Every ask from the
owner (Ravi Kiran) and the developer (Raviteja, who builds this with AI assistance) lands
here with its source, its state, and where it lives in the code, so context survives any
chat, machine, or person. Update this file in
the same pull request as the work; if it is not recorded here, it is not agreed.

Companion files: docs/STATUS.md (build state), docs/VERIFICATION.md (sign-off record),
docs/OWNER_NOTES.md (raw owner feedback, verbatim plus translation), docs/SUPABASE_SETUP.md
(every SQL script and the run order), docs/ARCHITECTURE.md (stack and data model),
docs/DOMAIN_EMAIL.md (the store's domain and mailboxes: inventory and integration runbook).

## The store and the people

Robinson's General Store, Dorset, Ontario (lakeside; hardware, grocery, dry goods, gifts,
clothing, bakery, meat, produce, chip stand, garden centre). The owner is non-technical and
phone-first; feedback historically arrived as WhatsApp texts in Telugu-English, screenshots,
voice notes, and annotated Excel workbooks. Roles: owner, manager, lead, staff. Staff and
leads never see dollar figures (leads do: see canSeeMoney; staff never). One store today,
multi-store built in.

What the world knows about the store (researched 2026-07-27; sources: Discover Muskoka,
1000 Towns of Canada, Tripadvisor, Yelp, BayToday, dorsetcanada.com):
- A century-old landmark: family-run from 1921 until the recent sale to the current owner;
  about 14,000 square feet by the bridge on Main Street; voted "Canada's Best Country
  Store"; a must-see stop for Muskoka and Haliburton visitors.
- Known for: one-of-everything (gifts, souvenirs, housewares, clothing), moccasins as the
  signature item, the Food Town grocery side, the hardware side, and The Red Onion ladies'
  boutique upstairs.
- What recent reviews criticize under the ownership transition: thinning stock, slow
  replenishment, rising prices. PRODUCT IMPLICATION: the reorder engine, inventory counts,
  late-delivery tracking, and vendor ledger are not conveniences; they attack the exact
  thing the public is currently judging the store on. The Suggestions space and knowledge
  base preserve what a century of family operation used to hold in memory.
- Identity used in the app: the storefront sign (dark boards, gold western lettering)
  drives the login plaque and sidebar mark; "Serving Dorset, Ontario since 1921" is the
  verified tagline. The winter dusk photo of the building becomes the login backdrop when
  public/storefront.jpg is added to the repo (the code already supports it).

## Standing invariants (never regress these)

1. Every read and write is store-scoped; new tables get store_id, RLS, and a line in
   auth_setup.sql section 3a.
2. Money visibility fails closed: null/unknown role sees no dollars (canSeeMoney).
3. Editing is role-gated (canEdit); destructive actions are soft voids (voidRow /
   void_payment) filtered with .is("voided_at", null); user-facing label is Void.
4. Payments flow ONLY through the engine RPCs: record_payment, void_payment, edit_payment,
   reconcile_postdated. Post-dated = cheque with a future paid date, never a method.
5. activity_log rows only with a known actor (currentActorId); guarded inserts.
6. A human confirms anything that moves dollars (discrepancy and low-confidence gates).
7. The app builds with blank env (no crash, clear connection cards).
8. Calm neutral canvas; color carries status meaning only. AI answers are plain text.

## Functional areas and their state

SHIPPED (see VERIFICATION.md for sign-off):
- Capture: photo/PDF invoice extraction (Claude vision), discrepancy + low-confidence
  acknowledgements, manual entry path, feed posting.
- Vendors: department-first directory (pick a department, then its vendors; counts,
  department-scoped search, All vendors, add-vendor inherits the department) + detail;
  orders, invoices (property-work and finance variants), credits; per-row edit and void.
- One department sequence everywhere (src/lib/departments.ts): DryGoods & Lakeside,
  Hardware, Grocery, Property Maintenance, Bakery, Meat, Produce, Payrolls & Taxes, Others.
  Departments outside the list still appear, sorted after it.
- Invoice tax modes: entered separately, included in the invoice amount (recorded for the
  HST report, never added to what is owed), no tax, or refer to the actual invoice. The
  mode is stored, and the app and the database engine share one definition of the total.
- Delivery detail on invoices: delivered / partially delivered / not delivered, the day it
  arrived, and delivery comments for short shipments and damage.
- Purchase orders in the owner's field order: order status (in progress, approved), amount,
  where the confirmation is filed, ship date, comments. The season year follows the ship
  date rather than being typed.
- Payments v2 engine: allocations across invoices, partial payments, deposits, post-dated
  cheques with auto-reconcile, derived invoice statuses, one atomic RPC per action,
  payment EDIT (date/method/reference/notes/filing) with status re-derive.
- Payout categories incl. Property Maintenance and Payrolls & Taxes (payroll remittances,
  incorporation taxes) as departments.
- Due and overdue with quick pay; Reports (aging incl. partial/freight/settlements, HST by
  department, deliveries arriving in the next 7 days, late deliveries); Today KPIs; Charts;
  Feed.
- Inventory counts + importer; Price signs; Knowledge; Ask-the-store (grounded, role-aware);
  Reorder screen with grounded AI summary.
- Imports: bookings ledger v1 (fixed layout) and v2 (header-driven, payments, credits,
  AskingInventory), weekly schedule, category inventory sheets; idempotent.
- Export: one workbook, one tab per table, README of relationships.
- Suggestions: in-app owner feedback space (note + screenshot + voice recording), screenshot
  auto-read into text by the store's AI, status flow, developer digest copy.
- Auth: demo mode (open) and enforced mode (Supabase Auth + per-store per-role RLS);
  server routes resolve the caller (serverMember).
- Tasks/daily checklist; Maintenance; Compliance; HR + schedule; notification bell (live
  count: refreshes on navigation/focus/open/timer).
- Brand: storefront-sign plaque (CSS only) on login and sidebar; evergreen canvas motif;
  print stays clean.
- Vendor ordering profile (SCRUM-9, 2026-07-31 and 2026-08-05): minimum order amount or a
  "No minimum order" tick, mutually exclusive and enforced in the database as well as the
  form, shown on the vendor page, the Add order form and the Reorder list; summer order
  timeline in free text; location of the order as a multi-select with a free-text Other;
  reorder status with comments that are mandatory when Reordered and are never deleted by a
  status change alone. Migration: supabase/vendor_ordering_fields.sql.
- Field-level validation: every required field reports its own problem underneath itself,
  not in a card at the top of the page (SCRUM-9, 2026-07-31).
- The health check names its own fix (SCRUM-12, 2026-08-07): when /api/health finds a column
  the release needs and the live database does not have, it names the missing columns, the one
  script in supabase/ that adds them, and that the script is safe to run again. The script is
  recorded per column, so a table waiting on two scripts names the one it is actually waiting
  on. A database that does not answer at all gets no such sentence, because that is not a
  migration anybody forgot. The watchdog puts the sentence in the ticket it raises, so a
  missing migration becomes a job somebody can finish instead of a check name they cannot act
  on. The code was never wrong in that failure; the ticket just never said what to do.

QUEUED (agreed, not built):
- Department photo tiles and knowledge-note photo attachments, sourced from the owner's
  walkthrough (one photo per department from his phone; website photos ruled out).
- From the 2026_Payments workbook (2026-07-27): recurring obligations (loans and utilities
  with payment frequency and autopay method, the Loans&Payments and Utility tabs);
  estimate AMOUNT on property invoices (Estimated$ next to the existing estimate number);
  renewals/training expiries (JHSC certification) into Compliance; an importer for the
  2026_Payments workbook itself once its layout settles (the owner calls it work in
  progress).
- Sheets sync phase 2 (service-account pull from the live sheets) and phase 3 (FromApp
  push tabs): docs/SYNC_PLAN.md. Blocked on sharing the live sheets with
  raviteja.potluru@gmail.com.
- QuickBooks export of invoices/payments; POS sales import (margin, shrinkage, demand-based
  reorder). Owner confirmed the store runs a POS and QuickBooks.
- Three-way match (PO vs receiving vs invoice) before payment.
- Food-safety compliance module (temp logs, sanitation, certifications) per Ontario
  HPPA / O. Reg. 493/17.
- Email invoice intake ("get and organise the invoice from Email", configurable senders).
  Now concrete: vendors send to invoices@robinsonsgeneralstore.ca, the mailbox forwards
  into the Capture pipeline, a sender allowlist gates it; design in docs/DOMAIN_EMAIL.md
  section 4. Blocked on the owner creating the invoices@ mailbox.
- Price-check activity list and notification (grocery).

OPEN (waiting on the owner):
- Run supabase/vendor_ordering_fields.sql in the Supabase SQL editor (step 7 in
  docs/SUPABASE_SETUP.md). It adds the seven vendor ordering columns; until it runs, the
  vendor ordering fields cannot save and the live site fails its own health check after
  every deploy (SCRUM-12, failing since 2026-08-06).
- Add SUPABASE_DB_URL as a repository secret so merged scripts apply themselves. The
  workflow that was built for this on 2026-07-31 has never applied anything, because
  without the secret it exits quietly, which is why the script above is still a manual job.
  Instructions are at the top of docs/SUPABASE_SETUP.md.
- Let the automation open its own pull requests: Settings, Actions, General, Workflow
  permissions, "Allow GitHub Actions to create and approve pull requests". Today GitHub
  refuses createPullRequest from the autopilot's token, so a finished ticket ends as a
  pushed branch that somebody has to open by hand, and SCRUM-12 sat unopened for a day
  because of it. Merging stays human either way: the tier is decided by
  .github/scripts/classify-change.mjs reading the diff, and this setting does not touch it.
- Of the three 2026-07-10 voice notes ("most important"), the domain-email one is now
  resolved: it was about the store's own domain email plan (docs/DOMAIN_EMAIL.md). Still
  un-decoded: the 12:18 note ("deposit on the device"). Owner to type it or re-record in
  Suggestions.
- Domain panel actions (details and order in docs/DOMAIN_EMAIL.md): repoint or delete the
  stories@ alias (it forwards store mail to the previous owners' personal hotmail);
  archive then retire joanne@; create invoices@ (unblocks email intake); ask Vianet hosting
  to add the CNAME for app.robinsonsgeneralstore.ca so the app lives on the store's own
  domain. (An earlier version of this line said three mailboxes were full and bouncing.
  That was wrong: the quota is 1000MB, not 250MB, and the fullest box is at 26 percent.
  Nothing is bouncing and nothing needs clearing.)
- Departments&WorkFlow.xlsx (OneDrive), sheet Lakeside&DryGoodsPaymentRecordF: upload it so
  the payment-record fields can be checked column by column (everything visible so far
  already exists).
- Delete the Lawson "PO Details.docx" from the shared Drive: it holds a full credit card
  number in plain text. Standing reminder until done.
- Rotate the owner's demo password; add Resend/CRON env for the daily email if wanted.

## How owner feedback becomes work

1. It lands raw in docs/OWNER_NOTES.md (verbatim, with translation when Telugu).
2. Each ask gets a line here (SHIPPED/QUEUED/OPEN) when triaged.
3. The build round updates STATUS.md + VERIFICATION.md in the same PR.
4. The app's Suggestions page is the preferred channel now: notes, screenshots (auto-read
   into text), and voice recordings stay attached, and "Copy developer digest" produces the
   exact block to paste into a build chat.
