# Source files (Google Drive)

The store's real data lives in the owner's Google Drive in the StoreApplication folder. These links are private to that Google account.

- StoreApplication, root: https://drive.google.com/drive/folders/1liGWxXw_dgQygF9NhNGiuBFObdrhmBz8
- Bookings, the 2026 vendor and order ledger, the schema and seed source: https://drive.google.com/drive/folders/19aGReT42XHVaQhGAf1p9CFOwodshyQcJ
- Orgill, the richest hardware vendor folder: invoices, statements, SKUs, planogram, returns, future orders, and the Ontario pesticide vendor licence: https://drive.google.com/drive/folders/1uadEQ_vzfr_a4oTZSpOnh-RyTbYqOa1X

The full inventory of the folder is in robinsons_store_build_spec.md section 2: the 2026 bookings spreadsheet (about 120 vendors with the full order and payment columns), per-vendor hardware folders, the InvoiceFiles and PaymentConfirmations subject-line reference docs, the GardenCenter price-sign docx library, and shelving and price-tag reference photos.

## Reading these files
- The claude.ai Google Drive connector reads Google Docs directly. It does not return the contents of binary files (xlsx, pdf, docx), which show as "only Google Docs are supported." Folder names, structure, and links are visible through it. The binary contents are not.
- Claude Code on your machine has no Google Drive connector. It cannot open these links.

## For Claude Code, download the key files into the repo
Put the real source files in a local folder so Claude Code can parse them. Keep it out of git, the contents are sensitive.
1. Create source_data/ in the repo root. It is already in .gitignore.
2. Download from the Drive folder into it:
   - the 2026 bookings spreadsheet (xlsx), for schema validation and vendor seeding,
   - two or three real Orgill or ABBOT invoices (pdf or image), to test the capture loop,
   - the Ontario pesticide vendor licence (pdf), to fill the licence row,
   - a few GardenCenter price-sign files (docx), for the later price-sign generator.
3. Point Claude Code at source_data/ when seeding vendors or testing extraction.
