# Data Inventory: Owner's Google Drive "StoreApplication" Folder

Source: Google Drive, owner raviteja.potluru@gmail.com, root folder StoreApplication (id 1liGWxXw_dgQygF9NhNGiuBFObdrhmBz8). Crawled via the Drive MCP server on 2026-05-30. Sizes are bytes as reported by Drive. Samples are short excerpts of real content; full files were not copied. Binary files (PDF, JPEG, PNG, MP4) were inventoried by metadata and name; their purpose is inferred from name and folder.

This inventory maps the store's real paperwork to the app's Postgres tables (see supabase/schema.sql: vendor, item, receiving_event, receiving_line, invoice, payment, retail_price, inventory_count, inventory_count_line, purchase_order, knowledge_note, licence, maintenance_asset, maintenance_task, insurance_policy, employee).

## Folder tree (overview)

```
StoreApplication/
  Futures.docx, Vendorlist&InvoiceFilling.docx, Utilities.docx
  LakeSide&DryGoods/            2026 bookings L_S & Dry goods.xlsx
  InvoiceFiles&PaymentConfirmations/   2 .docx (Gmail subject-line search strings)
  Hardware/
    GardenCenter/
      OSC Seeds/ 2024/
      Plants/ Signs/{2025,2026}, 2026, 2024/Signs, 2025
      Soil/ 2024, 2025, 2026/Pricing, Signs/2025, Sobeys
    PriceSigns/                 ~16 price-sign .docx
    InventorySheets/            10 category .xlsx
    Referencess/ AtikokanCastle (shelf photos), Shalving (shelf photo)
    Vendors/
      Orgill/ Bookings, CreditRequest, FutureOrders, Imp, Invoices, OldStockInventory, Planogram (+ many sub-vendor folders)
      BigRockSports/ 2024
      HutchingsMarine/ 2025 order, 2026, Invoices, Credit, PaymentConfirmation
      Lawson/ PO Details.docx, 2026
      Lumberjack Pellets/        1 invoice pdf
      Link Products-Hardware/ Batteries, Sign Boards
      HH_HD_CT_DT/               InventorySheet.xlsx
```

---

## Root: StoreApplication (id 1liGWxXw_dgQygF9NhNGiuBFObdrhmBz8)

- Futures.docx (docx, 0 bytes, id 1F3OVFwuwDbe0XOOv0YJ4-ausPoeFEcmn) - empty placeholder, no content. Maps to: nothing yet (future ideas note).
- Vendorlist&InvoiceFilling.docx (docx, 17612, id 16QZYdX8wMA7E0iRWrHcFiBk396T7kv-B) - master list of every vendor grouped by category (Grocery, Bakery, Hardware, Meat, Produce, Checkout, Other, Beer, Ad) with the filing method per vendor. Maps to: vendor (and how each invoice arrives). Sample:
  - "Orgill - Email & Physical"
  - "Kawartha Milk - Email & Physical"
  - "DGS Distribution (Ice Cream) - Email & Physical"
  - "ORKIN CANADA CORPORATION - Email"; "Moor Propane - Email"
- Utilities.docx (docx, 14657, id 1Wg0FLOspL1X6Y2jdkKzrh8BYQ0qcg7u0) - list of utility accounts. Maps to: vendor/knowledge_note (recurring bills). Sample: "Hydro One / Bell / Vnet".

## LakeSide&DryGoods (id 1LVmAtSZ_5N58SuYOkNxmb0mUvLOgazSn)

- 2026  bookings L_S & Dry goods.xlsx (xlsx, 52170, id 1EGhRM4aW9m2nc7r2cVzzgA4xgcDunE9m) - the central order/invoice/payment ledger for 2026, with sub-tables for Dry Goods, Lake Side / Faith in the Forest, and Grocery vendors. Columns: Vendor, Rep Name, contact no, E-mail, Products, Order status, OrderConfirmation filing method, Amount, Ship date, Delivery status, Final invoice filing method, Invoiced Amount, Terms, DueDate, PaymentStatus, PaymentDate, PaymentConfirmation filing. This is the single richest source and maps to vendor + purchase_order + invoice + payment together. Sample rows:
  - "ABBOT, Pat Christe, 705-340-0033, patchristie17@icloud.com, Mugs/Everyday Gifts, Approved, ordered $3,089.04, invoiced $2,898.65, Net 30, due May 31"
  - "Attraction, Rob Reid, Hoodies/Tees/Throws, ordered $6,104.92, invoiced $6,186.03, Net 60, due June 28"
  - "ArtBurn, Pillow case painting kits, $644.00 / invoiced $781.55, CC-Rep will call & deliver after payment, PAID May 12th"
  - Dry Goods total ordered $158,412.20 / invoiced $122,219.15; Lake Side grand total $63,363.79 / $38,444.24.
  - Free-text "Comments" carry tribal knowledge (e.g. "Gift Craft Ltd - Bankrupt & sold, order similar from Ganz/Cls, discontinue"; many "Where is the invoice" reminders). Maps to: knowledge_note.

## InvoiceFiles&PaymentConfirmations (id 1-QLmM1Gke0n78PtNu9azg-Oq_Dqq1Lz1)

- DigitalPaymentConfirmation&SubjectLinetoSearch.docx (docx, 13192, id 1220-WMGa4GLl48A6Xh77fgopz3N5BTaG) - Gmail subject-line search strings used to find payment-confirmation emails. Maps to: payment (how a payment confirmation is located). Sample: "1) Your receipt from DGS Distribution is ready -------- Ice Cream".
- Invoice's&SubjectLinetoSearch.docx (docx, 13196, id 1rKKGEEw4WXa4-FJNq4rkq5lAARV45hym) - Gmail subject-line search strings used to find invoice emails. Maps to: invoice (locating an emailed invoice). Sample: "1) BAT Invoice ---- Imperial Tobacco ... Remittance Advice 0056138871 CA20".

---

# Hardware (id 1Ko6q5z4O63DlPQ6AoJyqwvLGW2VaAiln)

## Hardware / PriceSigns (id 1Df9BcpW_h1tJX8LnVa4P9bYtLUrv7vZY)

About 16 single-product price-sign .docx files (one product family each; each holds the shelf price/sign text). Maps to: retail_price (and the printed price sign). Sampled:
- Charcoal.docx (docx, 13632, id 1u5p95TTeEfCysvAL4gKC-4zMvAR_JYFm). Sample: "ROYAL OAK CHARCOAL 16.6 LB $15.99 / KINGSFORD CHARCOAL 8.3 LB $13.99 / KINGSFORD 16 LB $22.99".
- Wood.docx (docx, 13506, id 1ab-Q4jbbu26VP10vT09sT-s7nr9btd6D). Sample: "8LB KINDLING WOOD $9.99 / 20 LB MIXED FIREWOOD $14.99" (links to Sobeys Wholesale SKU 169270).
- SUMMERGUARD LAWN FOOD.docx (docx, 355178, id 1zuvV8xXUCaAOQPR2q5nfrmfRNM8hQ4lg). Sample: "SUMMERGUARD LAWN FOOD $26.99/EA".
- Grass Seed.docx (docx, 709467, id 148e8o0nmc0fQ-8I1Ck6C4EBGperFdHH6) - larger file, includes product image plus price text.

Remaining price-sign files (listed by name; format is the same product-name + price layout, several embed a product photo which inflates size):
- White Resin Folding Chair.docx (103389, id 1GvZ41HyUEx3MZyyqt1Sc-anlXmbj7yIM)
- VIVERE HAMMOCK.docx (454266, id 1c9x_jkQfjnoCDwXw0S01nIkQfy51uxGc)
- Trash Can 32 Gal.docx (351937, id 114f-qn72RXLdxUWF1nmxISMyWuPWiODs)
- UMBRELLA.docx (124656, id 1U5XnX38s8iw7GaCQgVNDaJ9tsMBpEKVP)
- Table.docx (151131, id 1x-lIZLWW8uUYIe-zI7vp2iRcS5h2YF-R)
- SHACKN'FEED.docx (678260, id 1NqgOys8t9aEM7o74wDQVYurlBTuGkqVb)
(PriceSigns paginates further with additional same-format product .docx files of the same character.)

## Hardware / InventorySheets (id 1LLtxpVrKGHFxKjJkkPkQr6crEQZFWFAu)

10 category inventory spreadsheets. Each is a stock count by SKU/description. Maps to: item + inventory_count + inventory_count_line.
- HHProducts.xlsx (xlsx, 15986, id 1PU9GXAam8pA_Lqsz1MUrPVVd2TrqVmZb) - SNO/SKU/DESCRIPTION/STOCK plus a FAST/REQUIRED move flag and reorder lists. Sample: "678003755540, JACK ASTORS BUFFALO MILD SAUCE, stock 1, FAST"; "5870-407, TRAEGER Prime Rib Rub 9oz, stock 6, REQUIRED".
- ValsparPaints.xlsx (xlsx, 35439, id 1fSKtrdrOb3-zflM9y-kn-6Wwtsr3-CBh) - full paint matrix: UseCase, ProductLine, Size, Sheen, Base, Sku#, Item#, StockOnShelf, OverStock, OS Location. Maps to: item + inventory_count (with overstock location). Sample: "Interior, MedallionPlus, 916ml, flat, Tint, Sku 3042868, Item 1021003, shelf 6"; "...931ml UltraWhite, shelf 3, OverStock 2, DG".
- WinterInventory.xlsx (14721, id 1uxCcSICTzlCaoQ9ifkPXRHeOI_QBONfP)
- Pumps.xlsx (10696, id 1dPOFzOslgkmcrp3QKRu5aCu4vmndzsEV)
- Ladders.xlsx (9057, id 1uPKxZc2X85fUbD-vzi7qjLv_WIR05NOF)
- HardwarePipes.xlsx (8960, id 1tSUfq0ZamLNNXEO06kd9lE2N1Z-k0KEf)
- Chairs.xlsx (9571, id 1x8aRwS8uz8JN1QP7dPR9dUgJQsG4AMhS)
- BIRDSEEDS.xlsx (11516, id 1f6D4I52uFsD6q6tK9_tGm-0Fow9B4lFF)
- ChimneParts.xlsx (22419, id 1G_qUaFZP2i5bV8UXpXnRklsHWsAeCT_p)
(All same inventory-count shape: SKU/description/quantity.)

## Hardware / Referencess (id 1T92I_KsXet6rPtVFDQCarJU65Hcrvc_7)

Reference shelf/store photos. Maps to: storage document / knowledge_note (visual layout reference).
- AtikokanCastle (folder, id 1H0qslwvGyqY-ryjwt52uyGIdbN1XRMUK) - 6 JPEG photos (IMG_1460, IMG_1462, IMG_1463, IMG_1465, IMG_1536, IMG_1537), ~2.3 MB to 5.5 MB each. Store/shelf reference photos.
- Shalving (folder, id 1jpCZZw8CLsWbi9_k0mU8xibFefkofk9-) - IMG_0215.jpeg (5948788). Shelving reference photo.

## Hardware / GardenCenter (id 1-ZqcPRxgHu9m-B_Dkyj0fuSFnC5PrD-O)

### OSC Seeds (id 11ApO6MuJH8Mil6WMFXi_k0fzgDCQmxj_)
- Gmail - Credit app.pdf (pdf, 123503, id 1rGrDKFbfFDUjHalH5bStRvlq6e16z1h5) - vendor credit application (emailed). Maps to: vendor (account/credit setup).
- 2024 (folder, id 1CJHZMljpcGgxodPDdkFtluEXDO8Zp1PB):
  - OSCCINV_smanion.pdf (217437, id 1Z4dsLp58x62t9B_JCvcurXE8CxwgP4JD) and OSCCINV_smanion 1.pdf (217437, id 1gv-v2UAl-WnDt55Dhz7_fJsLgBI0bs-O) - OSC seed invoices. Maps to: invoice.
  - PHOTO-2024-10-09-12-37-00.jpg (331330, id 1-6ssAlMUybaOcRCe3cIPwb_iSp8F4eEY), IMG_5065.jpeg (113807, id 10yUAR15pR5U503wcrmqbFT0w2-fvvH5J) - seed rack/order photos.

### Plants (id 18nN8HAT4DYeosHFcUyVNmrYWdGeOTK02)
- Signs (id 1KATb7WE5fT_SDXs7yJjeZeN6zSMS1NGc):
  - 2025 (id 1tfSB_q_On-bdaWiON6w_eWZuoYBlzeto): Flats.docx, Baskets.docx, All Plants.docx, "4 & 6 in Pot.docx" - plant price signs. Sample (All Plants.docx, id 12ATlbGiY1mNc1dRVg6kWS68jmHXg8fzu): "Flats Single $2.49 / Flats Tray $24.99 / 4\" Pot Single $4.49 / 4\" Pot Tray $39.99 / 6\" Pot $9.99 / Baskets $29.99". Maps to: retail_price.
  - 2026 (id 154BOwyttL15MffYijAY5WbTUPUKX1qa1): All Plants.docx (id 1FbHc74ZSaP8wENqMaxi4jdMI6MyT95Ck) - 2026 plant prices.
- 2026 (id 1twXbqakXGknaFqUk-th-_8W2uS-xOJR8): Andura Greenlife Invoice 12052026-01.pdf (106336, id 1liXcHv8g470F_Vd_8vMy1DfiOylPppyw) - plant supplier invoice. Maps to: invoice.
- 2024 (id 1L6r7G176Y7ZRCIgtXvdBvkLtwWALGiwf):
  - Annuals Order Form - Andura Greenlife Inc(1).pdf (168907, id 1e3ZCSNtztkoJ3DxMknXPS5K995BPM0rh) - order form. Maps to: purchase_order.
  - Andura Greenlife Inv#27042024-01 & Pricelist.pdf (150782, id 1WY8oNIycZ7-X1PJJf9_vjbG-tJjBKMAK) - invoice + price list. Maps to: invoice + retail_price.
  - Signs (folder, id 19hCi0dBrMy5qk96Zlcfhm5acIXo2XwwI): 8 plant price-sign .docx (Other, All Plants - New, "12 In Baskets", All Plants, Flats, Baskets, "10 In Basket & Wall Bags", "4 In Pot & Square"). Maps to: retail_price.
- 2025 (id 1P_MHU7BzbGGBT4D0N2X57HG_qBntezzN): Andura Greenlife Invoice 01052025-01.pdf (79686, id 1TIwHJ5-BCxT-aGxlsZlHrxPWhKnOWPCa) - invoice.

### Soil (id 1Ua92MwC7XclLgfqVDg6fYhZl6D0V1wKu)
- 2024 (id 1U4DZb8eFPXlNaBMOPjD6jGGo6x-qaJkv): 2024_Order.pdf (258052, id 1M_AU9wI_ybSKCSYmiOoO_yaQ4P9hYeXt) purchase_order; 2024_LeftoverInventory.jpg (1093105, id 184QzlEfxP8L7l6AP_WGDPdRXsMowlbJB) inventory_count photo.
- 2025 (id 17ZlVw-FRSZgjBpZvyFX40C5EVtfstvZU): Order_169712.pdf (258312, id 18mnM-p5B6doeT6A6F_7C4zQ_JXEAmNX_) purchase_order; "2025-05-02 Pefferlaw Farms Invoice #169724 - Cust ID 7269704Rob.pdf" (64585, id 1e7hBMe5O0ivUd81Zi3UeD92_T-UcNbtc) invoice; 2024_LeftoverInventory.jpg (1093105, id 1p5yH8GJzB92dEuNWHtx7Cz8icM1NfczJ) inventory photo.
- 2026 (id 1Wkqp4o4KjcXMuVdfrF0wGY5GuKCZxW-Z): 2026_Inventory.pdf (1180428, id 1_51bX_6XmKtOBCjTXUY8s8cKWOle_416) inventory_count; "2026-05-11 Pefferlaw Farms Invoice #170705 - Cust ID 7269704Rob.pdf" (64147, id 1y7p5mJQ0p-uvYo7Pq4i4wZXS65jx4WLc) invoice; Pricing (folder, id 1t3DfQZ3CPJbZrm2ZCkQjrYXtRsl1C0Go): Pricing.docx (id 1uSHdI6iXGTx-rJrDhIC00jyEGWoHew9J) retail_price. Sample: "MULTI MIX GARDEN SOIL $6.99 / BLACK EARTH TOPSOIL $4.99 / COW MANURE COMPOST $4.99 / POTTING SOIL $3.99 (3 for $9.99)".
- Signs (id 1IHPTnyTZQ6gN_VVuXrnkh0BKnv-NcisB) > 2025 (id 1MqV8iHHoPvNLOzIsofZNhImm2CNWuHhh): 6 soil/mulch price-sign .docx with embedded photos (Comp Multi Mix 25 Litres_2025, Red Mulch 42.5 LT_2025, Comp Black Earth Topsoil 25L_2025, Com Farm Compost 12.5kg_2025, Cedar Mulch 42.5 LT_2025, Black Mulch 42.5 LT_2025). Maps to: retail_price.
- Sobeys (id 1jEaLv8TqJfkbOF918GE-OTZm6R-S4mmw) - 5 supplier notices/price lists (PDF). Maps to: vendor + retail_price (cost reference). Names: "Ontario Sobeys Wholesale Communication ... Gmail.pdf" (1053661), "ONT Information Notice - All - Pefferlaw Farms 2024 Pricing.pdf" (798253), "... Ontario Soil Program 2024.pdf" (151468), "... Pefferlaw Farms 2024 Early Pricing.pdf" (818033), "... AGB Green World Price List 2024.pdf" (136910).

---

# Hardware / Vendors (id 1NZjO-kEy_WkVcCdkx8MqToSW2hf3tE6f)

Seven vendor folders. Each holds that vendor's orders, invoices, payment/credit confirmations, and product catalogs.

## Orgill (id 1uadEQ_vzfr_a4oTZSpOnh-RyTbYqOa1X)
Top-level files:
- Ontario Pesticide Licence.pdf (pdf, 1501392, id 1LkUmYJBp2DQb-l76RCCg0lK7KV_vjwVW) - the store's Ontario vendor pesticide licence. Maps to: licence (Ontario pesticide licence + expiry, a tracked compliance item).
- SBD Return Authorization Process 10_11_2023.pdf (187286, id 1YWPMTWUNZz0nQmZVrnD1IXq2R3kGE-v2) - returns process doc. Maps to: knowledge_note.
- 33dcc204-...MP4 (video/mp4, 7395681, id 1KJlxkwypUgfYc9iaPbWG2oAvEQeDLMwV) - large video (not downloaded). Likely a walkthrough/reference clip.

- Bookings (id 19aGReT42XHVaQhGAf1p9CFOwodshyQcJ):
  - 2025 (id 1Y7Sbe8aV4yzcHvlKdq5HU4nNDIjyFLUU) - 7 Orgill booking-program PDFs (e.g. PGN_923_WinterBooking, PGN_310_Christmas, orgill.ca index export). Maps to: purchase_order (seasonal booking) + knowledge_note.
  - DoorBusters (id 1Iw8PUBJ2NHjqkFq44ssGg82c284vk5ye) - 6 "CAN DB - <Month>.pdf" doorbuster flyers (2.4-3.4 MB) + PreOrders.png (204822). Maps to: purchase_order / retail_price reference.
- CreditRequest (id 1qYAZ5Vi8jBMWjkF8E9Jjnw8zjn4A4q3g):
  - 2025 (id 1meBIewA7ym-dxj5qU8ijtfbzzdvQ0Qbq) - ~10 credit-request PDFs (hash-named, plus CR_2-20-2025.pdf). Maps to: invoice/payment (credit/return against an invoice).
  - 2026 (id 1YsgutooCqjfswmGG4bK8s9VUW1IN5W06) - 5 credit PDFs + Credit Confirmation (id 1tGGo--GbQc99pxkAkk53NvFTfks1b0HO): 7ba4c4.pdf. Maps to: payment (credit confirmation).
  - CreditConfirmation (id 10Dc7vMpDslm6I_1L6T1IXK23vfBs3YLm) - 7 credit-confirmation PDFs. Maps to: payment.
- FutureOrders (id 1iHuZmNj2tkuWE7IFEFvb4TWcVS532F3O): ShelfSheets.jpg (256752, id 1jbgLZ4xsjZOF2cA0tx0WZF70RrOIFKCX) - shelf sheet photo. Maps to: knowledge_note / inventory reference.
- Imp (id 1QVLW1A6G7MUnALJ9aiRHKVD71Pg14LWB) > ADV Pricing (id 1arxHzvcVV2ITuXODGp7-hEn5MQpi-ujk): "Adobe Scan Feb 21, 2026.pdf" (717007, id 1DxvG2sNUyBhGxDoUea0t61uCdlPm39w-) and Robinsons_ADV_Program_Request_2026.pdf (4252, id 1VvtBVVwuUGrRAnl3pE587E7so8HYk5dv) - advertising-program pricing request. Maps to: knowledge_note / retail_price (promo pricing).
- Invoices (id 1lxg8V4oQ9hJBhpdfy2UzxYBJOKw-JO05):
  - 2024 (id 19dauVuKrfUP4XvC9nDCchT5LvO_kHCBr) - many Orgill invoice PDFs (hash-named and dated, e.g. March5.pdf, April.pdf, 53821a_20240625.pdf). Maps to: invoice.
  - 2025 (id 1iRZ5oJs1RAALExa5VY7cUfvbhC6GkVq8) - many invoice PDFs (hash-named, e.g. 6aff61.pdf, 736820.pdf). Maps to: invoice.
  - 2026 (id 1TNitLOfVapUV42-tlJzYbGeLfjSUPhaH) - month subfolders Jan/Feb/March/April/May, each ~2-3 invoice PDFs (hash-named). Maps to: invoice.
- OldStockInventory (id 1jLRUtE3fAHV05qvrx1zKU8uPmoW6R7rt) - ~20 category .xlsx stock sheets (SANDING STONES, "SCREW DRIVES", "WOOD,DRYWALL,METAL SCREWS,BOLTS AND ,WASHERS", "wire goods", "sand papers", HOUSEHOLD WIRING DEVICES..., "wood chisels", "NAILS AND SIDING SCREWS", "power tool accessories", "moen and hot water tank", and more). Maps to: item + inventory_count_line (old/remaining stock by SKU).
- Planogram (id 10q_0OvNxZKEMKYV0eS5skoQ9G0XyAAlD) - product catalogs/booking programs by sub-vendor; the planogram/reference library. Maps to: item + knowledge_note (and retail_price for catalog pricing). Contents:
  - 25-10_BookingProgram_EN (1).pdf (6140240, id 1DPVoTiMqBpgSz9nQ_NnGYMi_DkcNk4BW).
  - Chain_Rigging (id 1d9--nERKWq8BGhm8oDKFy_FaIJMnoZ81): "Chain & Rigging Booking Program.pdf" (4579564).
  - Cheminy (id 1o4FntjuPO_uwGVu6-OnyCuitEBalWgKf): Selkirk SuperVent2100 manual + Canadian Buyer's Guide (PDF).
  - ElectronicLock (id 1FuMx9n9G_8Jtnh1cWf_g1tFHg5dUxJX8): 2 Orgill Weiser Electronic Lock catalog PDFs + image001 (2).png.
  - InsectControl (id 14jxT_ITkq5gzMlzYhGA4cpyjmMye-8L9): PTGC_Retail_Catalogue_2025_EN_12_LR_Spread.pdf (4283115).
  - IPEX (id 1spwpRZ8AgCHAtzicsabXdOAVLj19ferS): 5 IPEX pipe/fitting pricing + sell-sheet PDFs (e.g. "IPEX NATIONAL FITTINGS PRICING BSD 23 Dec 2025.pdf", "Spring Booking 2026.pdf"). retail_price/cost reference.
  - Marine_Multinautic (id 19cX3rS8SUkZI2eevR-_WpipdnrTfndAc): Multinautic product guide + teaser PDFs.
  - PaintBrushes_ProSource (id 1iq6mjWsJYWVhC8OlDb9H6vi7fGWcLw0i): "Robinson's Pro Source 4' Paint Brushes SS.pdf".
  - Proud Grill (id 1Syk8sqMlW7Kyo1ff7DGArEuu2ac4MRUL): "Proud Grill Product Overview_2026_ 4 pages.pdf" (12320152).
  - Reliable Fastener (id 1ux6H71_3sqH_DykNGiyDQy_CI660F2hJ): "Orgill Winter Booking 2025-26 (ECN).xlsx" (169633) and "DC Reliable Winter Booking 2025-26 (ECB).xlsx" (133434) - booking order spreadsheets (purchase_order); GRK_Paslode_Tapcon_Ramset (id 153Eeyy6wGPzdkWlq-F2M3I9PSTxcVUfw): "NEW GRK SKUS.xlsx" (13979, item) + RollRack sell-sheet PDFs for Paslode/Ramset/GRK/Tapcon.

## BigRockSports (id 18CkidHi5eB0XKq9gbw049GyXLaTJjyep)
- 2024 (id 1sb1zfxwjVy0Lzc9lxD2Y3bTtBfUsWMbO): T3292003.pdf (182412, id 1iwARqwwqDKBuyoQt_O1L9QjAbNtCVj12), T3291940.pdf (104449, id 1nnlviKk1meze4oEy50zrw_UTw1xxFj18) - Big Rock Sports invoices/order confirmations. Maps to: invoice / purchase_order.

## HutchingsMarine (id 1ODmbrxKsJDdFes29RCRtv39KVpU0ULe5)
- 2025ConsolidatedOrders.xlsx (xlsx, 25629, id 1AJPmzo9xV6wcs0AzCatW25l7lyIJZfST) - consolidated order/inventory workbook: year-over-year order qty (2024/2025/2026), Inventory by date, Item#, Description, DEALER PRICE, UOM, Comments. Maps to: item + retail_price (dealer cost) + purchase_order + inventory_count. Sample: "018-94402, Oil 25W40 Synthetic 946 ml, dealer 10.09, 2026 ord 0"; "P-00197, Spark Plug NGK BPR6EFS (10), dealer 2.91"; "2112-31512, PFD Adult Universal XL Red, dealer 24.30".
- 2025 Hutchings Marine order (id 1ReE7fy0yefBDUne27TNRm611luJIA_bP): "Robinson's General Store hutchings marine 2025 order.pdf" (175961, purchase_order); "HUTCHINGS MARINE ORDER ITEM CODES 2025.xlsx" (15112, id 1g4tT6SEA7EJ4_77sG4QsPqe7xCRQmUbO, item/purchase_order); "Hutchings Marine Products 2025 Life jackets order.pdf" (368065). Sample (item codes xlsx): "PG18, 018-94402, Synthetic Blend Mercruiser Sterndrive Engine Oil - Qt, qty 12"; "PG104, 2112-31512, PFD Adult Universal XL Red, qty 20".
- 2026 (id 1Nj1BEnz_Yxf9JLl-X-1g-HBzf00WDkT5):
  - OrderConfirmation (id 1wy3D2zhDpk76wc5UZW3hl0MgD0-MXb-w): "Robinson's General Store 407221.pdf" (174905). purchase_order.
  - Invoices (id 1rfoHG7cyBpgCzI2IBC_cJ8KkP9U895Ai): Invoice 9313405935.pdf (12164, in Lawson 2026; see below). For Hutchings 2026 invoices the folder is empty of files beyond the confirmation here. (Hutchings invoices live mainly under the next "Invoices" node.)
- Invoices (id 10bd9LXK3OOtG50zr4dDc7R4IvIR0RyAs):
  - 2024 (id 1IGbT4CkHWYEpdNrkUK95eaQ2-P7QRCik) - ~10+ "OEINVHM_PORTRAITE 2016HOLLY (n).pdf" invoice PDFs. Maps to: invoice.
  - 2025 (id 1H-189aKhXDnyfPQ-L1wqB2G8JbIrJGBS) - ~10 "OEINVHM_PORTRAITE 2016HOLLY (n).pdf" invoice PDFs. Maps to: invoice.
- Credit (id 12RnArcpKr3vK22dQ6LmSgvNduGdqhrmO): 20240706152755_001.pdf (369637), OEINVHM_PORTRAITE 2016HOLLY.pdf (69456) - credit notes. Maps to: payment/invoice (credit).
- PaymentConfirmation (id 16KC8g-39z_iyD308bieYwQAdzAlyxUqw) > 2025 (id 1gwf8wfyuCdbW0jcm5fp5MSCNP17I2LEa): "Payment Confirmation 7-1-25.pdf" (132326, id 1qp6CG-bcrTbgfGY-oDytRPXKIlMY8QtD). Maps to: payment.

## Lawson (id 1lYPIAxW90L4nGCfeqW3KKHd-Zq__26fb)
- PO Details.docx (docx, 1115956, id 1fp12Zk9aaqSLcE8aTkFOM5s6WJFLVT6o) - Lawson purchase order with the store's legal entity, address, contact, a credit-card on file, and an itemized order table. Maps to: purchase_order (+ vendor + sensitive payment detail). Sample: "Robinson's General Store, 1061 Main Street, Dorset ON P0A 1E0; legal name 1000476363 Ontario Inc; Tub and Sink Treatment $16.46 x18 = $296.28; Kitchen Drain and Septic Treatment $18.22 x18 = $327.96; TOTAL $975.96". Note: this file contains a full credit-card number, expiry, and CVV in plain text (sensitive).
- 2026 (id 1t0MnTO4XkikNTyyCtC58fkkIJ--_H0tS): Invoice 9313405935.pdf (12164, id 1zo2jxQcIVmbrTFIsXIWfYlA9On43MYJM) - Lawson invoice. Maps to: invoice.

## Lumberjack Pellets (id 1lwAUAHPLX2MGMYCfrMmqFDhQirKLxx5g)
- INV-260594 - Robinson's General Store.pdf (pdf, 379350, id 1grRustRvgs3bl9kGDcoq3vl7D8rt5p2a) - wood-pellet supplier invoice. Maps to: invoice.

## Link Products-Hardware (id 1VMnPmAkvuStU5i16_ofiwdKkOjSiSkSR)
- Batteries (id 1ZqEnNOgz1TMWyyhfW2_ogV_1IEbNjxIr): Inventory 2025.xlsx (xlsx, 9784, id 1YPbY20eSRoXI7-nRMJWYfYMiC8jldnPT) - battery stock + reorder. Maps to: item + inventory_count_line. Sample: "AA2 ordered 72 / left 0; AAA2 ordered 48 / left 23; 9V1 ordered 120+ / left 123; 2032 (1pk) left 41".
- Sign Boards (id 1ogh7M7Q9ZsPbaIC9iAw3JAw1m6HtfuSX): Sign Boards-2025.xlsx (xlsx, 9190, id 13Q3RKK3Ixt3lpujw21SJKX9TOfFamfam) - inventory of sign boards (Link Products / Orgill) with 2025/2026 order qty. Maps to: item + inventory_count. Sample: "Don't Block Drive Way, No Soliciting, No Parking, Video Surveillance, Wash Your Hands".

## HH_HD_CT_DT (id 1_BajeJJM2wHIkvvso5UsGnuKUAIEFI3W)
- InventorySheet.xlsx (xlsx, 27308, id 1lI2jl4jHDy2B_ZMl3w6vlPQapCtgkTmS) - cross-retailer reorder sheet keyed by source (Home Hardware, Home Depot, Canadian Tire, Dollar Tree) with SKU, description, on-hand inventory, order qty, and notes. Maps to: item + inventory_count_line (and which big-box source to reorder from). Sample: "HomeHardware 5429-280, 36x72 Duraknit Canada Flag, inv 4, order 0"; "HomeDepot 1000150633, Oldcastle 8 inch Block Natural"; "CanadianTire 060-6411-2, FoggingOil".

---

# Coverage: Drive data category mapped to the app

| Drive data category | Where it lives in Drive | App table / screen today | Gap |
| --- | --- | --- | --- |
| Vendor master + filing method | Vendorlist&InvoiceFilling.docx; rep/contact columns in the bookings xlsx; per-vendor folders | vendor | Schema exists. No importer yet; vendor list and per-vendor "filing method" (email vs physical) are only in the docx/xlsx, not loaded. |
| Purchase orders / seasonal bookings | bookings xlsx (Amount/Order status); Orgill Bookings + Reliable booking xlsx; Hutchings order PDFs/xlsx; Lawson PO Details.docx; Andura Annuals Order Form; Soil Order PDFs | purchase_order | Orders are spread across xlsx, docx, and PDFs; need extraction/upload. PO Details.docx also holds payment-card data that must not be stored in plain text. |
| Invoices | bookings xlsx (Invoiced Amount/Terms/DueDate); Orgill/Hutchings/Lawson/Lumberjack/OSC/Andura/Pefferlaw/BigRock invoice PDFs; the 2 InvoiceFiles subject-line docx | invoice (with due-date alerts) | Most invoices are PDFs (many hash-named) plus emailed ones found via Gmail subject strings; nothing ingested. Terms/due dates currently only in the bookings xlsx free-text. |
| Payments / credits / confirmations | bookings xlsx (PaymentStatus/PaymentDate); Orgill CreditRequest + CreditConfirmation; Hutchings PaymentConfirmation + Credit; DigitalPaymentConfirmation docx | payment | Payment confirmations are PDFs/emails; credit notes are separate. No payment records loaded; many "Where is the invoice/payment" reminders show open follow-ups. |
| Items / SKUs | InventorySheets xlsx; OldStockInventory xlsx; Hutchings item codes + consolidated; Link Batteries/Sign Boards; HH_HD_CT_DT; planogram catalogs | item | Item data is per-category spreadsheets keyed by vendor SKU (Home Hardware, Orgill, Hutchings, big-box). No unified item table populated; SKUs differ per source. |
| Retail price / price signs | PriceSigns .docx; Plants/Soil sign .docx; Soil Pricing.docx; vendor price lists (Sobeys, IPEX, Andura, doorbusters) | retail_price | Prices are one-product-per-docx (often with embedded photo) plus supplier price-list PDFs; not structured. Good source to seed retail_price + printed signs. |
| Inventory counts | InventorySheets, OldStockInventory, Link, HH_HD_CT_DT xlsx; Soil leftover/inventory photos & PDFs; ValsparPaints (stock + overstock + OS location) | inventory_count + inventory_count_line | Counts are date-stamped spreadsheets/photos; overstock and shelf-location data (e.g. "drygoods", "HWB", "DG") exist in the paint sheet but nowhere in the app yet. |
| Knowledge notes (tribal knowledge) | bookings xlsx Comments column; SBD Return Authorization; planogram booking notes; reference photos | knowledge_note | The richest tribal knowledge is the free-text Comments in the bookings xlsx (reorder/skip/discontinue, vendor quirks); not captured. |
| Compliance / licence | Orgill/Ontario Pesticide Licence.pdf | licence (Ontario pesticide licence + expiry) | Licence PDF exists in Drive; expiry not yet tracked in the app. This is the one licence found in the crawl. |
| Maintenance | (none found in this Drive folder) | maintenance_asset, maintenance_task | No property-maintenance documents in StoreApplication; gap - this category has no Drive source here. |
| Insurance | (none found in this Drive folder) | insurance_policy | No insurance documents present; gap. |
| HR / employees / pay | (none found in this Drive folder) | employee, pay_rate, shift | No HR documents present; gap. |
| Utilities / recurring services | Utilities.docx (Hydro One, Bell, Vnet); Orgill SBD/ADV; Moor Propane, Orkin, etc. in Vendorlist | vendor / knowledge_note | Utility accounts listed only in docx; could seed recurring-bill vendors. |
| Storage documents (catalogs, manuals, photos, video) | Planogram catalogs/manuals; Referencess shelf photos; FutureOrders ShelfSheets.jpg; the .MP4 | storage document / knowledge_note | Large binaries (catalogs, manuals, photos, a video) are references; keep as linked storage documents, not parsed. |

## Notes
- The Drive is reachable; no host/allowlist or auth error occurred.
- Sensitive data found in plain text: Lawson PO Details.docx contains a full credit-card number, expiry, and CVV. Handle with care; do not load verbatim into the app.
- Many invoice/credit PDFs are opaque hash-named files (e.g. 6aff61.pdf); the real invoice number/amount is inside the PDF, so any importer must read PDF contents rather than rely on filenames.
- Folder spelling is as-is in Drive (e.g. "Referencess", "Shalving", "Cheminy", "ChimneParts", "Origill").
- The bookings xlsx is the most load-bearing single artifact: it alone links vendor + order + invoice + payment + terms + due date + tribal-knowledge comments for the Lake Side and Dry Goods departments.
