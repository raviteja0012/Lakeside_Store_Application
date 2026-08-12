# Data sources, the StoreApplication Google Drive

Catalog of the owner's Google Drive folder that feeds this app, what each part maps to, and how we store it. Read this before seeding or building data features. Drive root folder: `StoreApplication` (id `1liGWxXw_dgQygF9NhNGiuBFObdrhmBz8`).

## Tree

```
StoreApplication/
  LakeSide&DryGoods/
    2026  bookings L_S & Dry goods.xlsx     the vendor + order ledger, 3 tabs
  Hardware/
    Vendors/                                one folder per hardware vendor
      Orgill/  BigRockSports/  HutchingsMarine/  Lawson/
      Lumberjack Pellets/  Link Products-Hardware/  HH_HD_CT_DT/
    PriceSigns/                             ~27 .docx price signs (Garden Center)
    GardenCenter/  OSC Seeds/  Plants/  Soil/
    InventorySheets/                        shelf count sheets
    Referencess/                            shelf and price-tag photos
  InvoiceFiles&PaymentConfirmations/
    Invoice's&SubjectLinetoSearch.docx      Gmail subject lines used to find invoices
    DigitalPaymentConfirmation&SubjectLinetoSearch.docx
  Vendorlist&InvoiceFilling.docx            vendor to filing-method map, by department
  Utilities.docx                            Hydro One, Bell, Vnet
  Futures.docx                              empty
```

## The ledger (primary seed source)

`2026 bookings L_S & Dry goods.xlsx` (id `1EGhRM4aW9m2nc7r2cVzzgA4xgcDunE9m`) has three sections, each a department:

- Dry goods / Gifts: about 60 vendors, ordered total $158,412.20, invoiced $122,219.15.
- Faith in the Forest (Clothing): about 35 vendors, ordered $63,363.79, invoiced $38,444.24.
- Grocery: about 18 vendors.

Columns: Vendor, Rep, contact, Email, Products, Order status, Comments, Amount (ordered), Ship date, Delivery status, Delivery comments, Invoiced Amount, Terms, Due date, Payment status, Payment date.

How it maps to the schema:
- A row becomes a `vendor` (rep_name, phone, email, products_we_carry, default_terms, status, notes).
- The Amount column becomes a `purchase_order.order_amount`.
- The Invoiced Amount, Terms, Due date, Payment status become an `invoice` (amount, terms, due_date, status).
- A paid row gets a `payment`.
- Free-text Comments become `knowledge_note` rows (the tribal knowledge).

`supabase/seed.sql` already loads a curated, verified set of these real vendors across Gifts, Clothing, and Grocery. invoice.amount is the invoiced figure as recorded on the sheet; hst_amount is 0 for these historical rows.

## Price signs

`Hardware/PriceSigns/` holds about 27 `.docx` signs: Propane tank, Ice Melting Safe-T-Salt, Shovels, Grass Seed, FireWood, FireLogs, Charcoal, Vivere Hammock, Umbrella, Table, Bamboo Table, Trash Can 32 Gal, Garbage Can Black, Summerguard Lawn Food, several patio chairs, storage boxes, and Wood. The Garden Center `item` rows in the seed carry the real retail prices (Propane exchange 36.99, new 79.99, Safe-T-Salt 10kg 4.99, Shovel 24.99, Grass Seed 24.99, Vivere hammock 249.99, Umbrella 99.99). The `/price-signs` screen prints from these.

## Invoices and payment confirmations

`InvoiceFiles&PaymentConfirmations/` documents how the store finds invoices today: Gmail subject-line search. In the app, captured invoices and payment confirmations are stored as files in Supabase Storage (bucket `documents`) and linked from `receiving_event.source_file_path`, `invoice.source_file_path`, and `payment.confirmation_file_path`. That replaces subject-line search with the department feed and the vendor ledger.

## Utilities and service accounts

`Utilities.docx` lists Hydro One, Bell, Vnet. `Vendorlist&InvoiceFilling.docx` adds the rest of the operating accounts: Moor Propane, Orkin Canada (pest control), Generator Solution, Howell Data Systems (POS), plus the Grocery, Bakery, Meat, Produce, Checkout, and Beer vendors. These are captured as `knowledge_note` rows (topic "Utility and service accounts" and the per-department vendor notes). The `maintenance_asset`, `maintenance_task`, and `insurance_policy` tables and the `/maintenance` and `/compliance` screens are shipped; track service accounts, recurring tasks, and insurance renewals there.

## How to use the documents for testing

To test the capture loop with a real invoice, use any vendor booking or invoice PDF from the Drive (for example an Orgill or Windsor Salt booking sheet) as the upload on `/capture`. The vision model reads it; staff confirm; it posts to the feed. This needs the Supabase env values and an Anthropic API key set. The Drive files are not committed to the repo; they stay in Drive and are uploaded at capture time.

## Getting at these files from a tool

Merged in from docs/SOURCES.md on 2026-08-12, which duplicated the folder catalog above.

Direct links, private to the owner's Google account:

- StoreApplication, root: https://drive.google.com/drive/folders/1liGWxXw_dgQygF9NhNGiuBFObdrhmBz8
- Bookings, the 2026 vendor and order ledger, the schema and seed source: https://drive.google.com/drive/folders/19aGReT42XHVaQhGAf1p9CFOwodshyQcJ
- Orgill, the richest hardware vendor folder: invoices, statements, SKUs, planogram, returns, future orders, and the Ontario pesticide vendor licence: https://drive.google.com/drive/folders/1uadEQ_vzfr_a4oTZSpOnh-RyTbYqOa1X

**What can actually read them.** The claude.ai Google Drive connector opens Google Docs
directly, but returns nothing for binary files (xlsx, pdf, docx), which come back as "only
Google Docs are supported". Folder names, structure and links are visible through it; the
binary contents are not. A build container has no Drive connector at all and cannot open
these links.

**So to work with the real files, download them into the repo.** Keep them out of git; the
contents are sensitive.

1. Create `source_data/` in the repo root. It is already in `.gitignore`.
2. Download into it:
   - the 2026 bookings spreadsheet (xlsx), for schema validation and vendor seeding,
   - two or three real Orgill or ABBOT invoices (pdf or image), to test the capture loop,
   - the Ontario pesticide vendor licence (pdf), to fill the licence row,
   - a few GardenCenter price-sign files (docx), for the price-sign generator.
3. Point the tool at `source_data/` when seeding vendors or testing extraction.
