# Requirements ledger

The living requirements record for the Robinson's General Store platform. Every ask from the
owner (Ravi Kiran) and the developer (Raviteja, who builds this with AI assistance) lands
here with its source, its state, and where it lives in the code, so context survives any
chat, machine, or person. Update this file in
the same pull request as the work; if it is not recorded here, it is not agreed.

Companion files: docs/STATUS.md (build state), docs/VERIFICATION.md (sign-off record),
docs/OWNER_NOTES.md (raw owner feedback, verbatim plus translation), docs/SUPABASE_SETUP.md
(every SQL script and the run order), docs/ARCHITECTURE.md (stack and data model).

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
- Vendors: directory + detail; orders, invoices (property-work and finance variants),
  credits; per-row edit and void.
- Payments v2 engine: allocations across invoices, partial payments, deposits, post-dated
  cheques with auto-reconcile, derived invoice statuses, one atomic RPC per action,
  payment EDIT (date/method/reference/notes/filing) with status re-derive.
- Payout categories incl. Property Maintenance and Payrolls & Taxes (payroll remittances,
  incorporation taxes) as departments.
- Due and overdue with quick pay; Reports (aging incl. partial/freight/settlements, HST by
  department); Today KPIs; Charts; Feed.
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

QUEUED (agreed, not built):
- QuickBooks export of invoices/payments; POS sales import (margin, shrinkage, demand-based
  reorder). Owner confirmed the store runs a POS and QuickBooks.
- Three-way match (PO vs receiving vs invoice) before payment.
- Food-safety compliance module (temp logs, sanitation, certifications) per Ontario
  HPPA / O. Reg. 493/17.
- Email invoice intake ("get and organise the invoice from Email", configurable senders).
- Price-check activity list and notification (grocery).

OPEN (waiting on the owner):
- The three 2026-07-10 voice notes ("most important"): only fragments decode ("deposit on
  the device", domain email costs). Owner to type them or re-record in Suggestions.
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
