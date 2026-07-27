-- Robinsons General Store, seed data. Run after schema.sql.
-- Fixed UUIDs so foreign keys resolve in one pass.
--
-- Vendors, orders, invoices, and payments are REAL data from the 2026 bookings sheet
-- (StoreApplication/LakeSide&DryGoods/2026 bookings L_S & Dry goods.xlsx), curated to a
-- representative set across the Gifts, Clothing, and Grocery sections plus a few Hardware
-- directory entries. invoice.amount is the invoiced amount as recorded on the sheet
-- (tax as billed); hst_amount is 0 for these historical rows. order_amount is the order
-- "Amount" column. Garden Center retail prices are from the PriceSigns folder.

insert into store (id, name, legal_entity, address) values
  ('11111111-1111-1111-1111-111111111111', 'Robinsons General Store', '1000476363 Ontario Inc.', '1062 Main Street, Dorset, ON, P0A 1E0 (confirm address)');

-- The owner's department-level categories for payout attribution:
--   DryGoods & Lakeside, Hardware, Grocery, Produce, Bakery, Meat, Chip Stand,
--   Checkouts, Property Maintenance, Payrolls & Taxes, Others.
-- Clothing and Gifts are sections inside DryGoods & Lakeside (children keep their own
-- vendors and history); Garden Center stays a section inside Hardware.
insert into department (id, store_id, name, parent_department_id, accent_color) values
  ('22222222-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', 'DryGoods & Lakeside', null, '#B7791F'),
  ('22222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Hardware', null, '#2F5FA8'),
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Gifts', '22222222-0000-0000-0000-000000000010', '#B7791F'),
  ('22222222-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Grocery', null, '#1E8E5A'),
  ('22222222-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Bakery', null, '#C0362C'),
  ('22222222-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Clothing', '22222222-0000-0000-0000-000000000010', '#6B7480'),
  ('22222222-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Produce', null, '#1E8E5A'),
  ('22222222-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'Meat', null, '#C0362C'),
  ('22222222-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'Chip Stand', null, '#B7791F'),
  ('22222222-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'Garden Center', '22222222-0000-0000-0000-000000000001', '#1E8E5A'),
  ('22222222-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', 'Checkouts', null, '#2F5FA8'),
  ('22222222-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', 'Property Maintenance', null, '#6B7480'),
  ('22222222-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111', 'Others', null, '#6B7480'),
  ('22222222-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111111', 'Payrolls & Taxes', null, '#4A5568');

-- Demo accounts, one per role, so enforced auth can be tested end to end. The email is what
-- auth_setup.sql links to a Supabase Auth account: create each account with the same email,
-- then auth_setup links auth_id automatically. owner and manager see money; staff does not.
insert into app_user (id, store_id, full_name, role, email) values
  ('33333333-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ravi Kiran', 'owner', 'owner@robinsons.demo'),
  ('33333333-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Demo Manager', 'manager', 'manager@robinsons.demo'),
  ('33333333-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Demo Staff', 'staff', 'staff@robinsons.demo');

insert into licence (store_id, name, authority, holder, expiry_date) values
  ('11111111-1111-1111-1111-111111111111', 'Ontario Pesticide Vendor Licence', 'Ontario Ministry of the Environment', 'Ravi Kiran', null);

-- Ontario 13% HST is the only rate the app applies; the rest are reference data (build spec section 13).
insert into tax_rules (region, rate, label, note) values
  ('Ontario', 0.13, '13% HST', 'Working default. The app applies this rate.'),
  ('New Brunswick', 0.15, '15% HST', 'Reference only.'),
  ('Newfoundland and Labrador', 0.15, '15% HST', 'Reference only.'),
  ('Prince Edward Island', 0.15, '15% HST', 'Reference only.'),
  ('Nova Scotia', 0.14, '14% HST', 'Decreased effective April 1, 2025. Reference only.'),
  ('British Columbia', 0.12, '5% GST + 7% PST', 'Combined effective. Reference only.'),
  ('Saskatchewan', 0.11, '5% GST + 6% PST', 'Combined effective. Reference only.'),
  ('Manitoba', 0.12, '5% GST + 7% RST', 'Reference only.'),
  ('Quebec', 0.14975, '5% GST + 9.975% QST', 'QST on the pre-tax base. Reference only.'),
  ('Alberta', 0.05, '5% GST', 'Reference only.');

-- Garden Center price-sign items. Retail prices are real values from the PriceSigns folder.
insert into item (id, department_id, vendor_id, name, uom, retail_price, is_regulated) values
  ('55555555-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000009', null, 'Propane tank exchange', 'each', 36.99, false),
  ('55555555-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000009', null, 'Propane tank (new)', 'each', 79.99, false),
  ('55555555-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000009', null, 'Safe-T-Salt 10kg', 'bag', 4.99, false),
  ('55555555-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000009', null, 'Shovel', 'each', 24.99, false),
  ('55555555-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000009', null, 'Grass seed', 'each', 24.99, false),
  ('55555555-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000009', null, 'Vivere hammock', 'each', 249.99, false),
  ('55555555-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000009', null, 'Patio umbrella', 'each', 99.99, false);

-- Vendors (fixed UUIDs). Gifts 01-19, Clothing 20-28, Grocery 29-32, Hardware 33-35.
insert into vendor (id, department_id, name, rep_name, phone, email, products_we_carry, default_terms, status, notes) values
  ('44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'ABBOT', 'Pat Christe', '705-340-0033', 'patchristie17@icloud.com', 'Mugs, Everyday Gifts', 'Net 30', 'active', 'Extra and unordered items, plus 1 missing product charged on the invoice. Reconcile order against invoice.'),
  ('44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'ArtBurn', 'Elanor', '1-888-848-8440', null, 'Pillow case painting kits', 'Credit card, rep calls and delivers after payment', 'active', null),
  ('44444444-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002', 'Attraction', 'Rob Reid', '905-351-7749', null, 'Hoodies, Tees, Throws (customised names)', 'Net 60', 'active', null),
  ('44444444-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000002', 'Bella Flor', 'Rudy', '705-717-2579', null, 'T-Towels', 'Net 30', 'active', null),
  ('44444444-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000002', 'Ganz', 'Tonya', '705-205-0607', null, 'Gifts, Stuffies', 'Net 60, Net 90', 'active', null),
  ('44444444-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000002', 'Genesis', 'Vern', '705-321-8800', null, 'Hoodies customised', 'Half July 15 and half Aug 15', 'active', 'Found some damaged hoodies. Where is the invoice.'),
  ('44444444-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000002', 'Dub wear', 'Leslie Dub', '905-362-1334', null, 'Men and Women clothing', 'Net 30, Net 60, Net 90', 'active', 'First delivery, 1/3 payment split 30/60/90 days. Back order. Get more info on payment terms.'),
  ('44444444-0000-0000-0000-000000000008', '22222222-0000-0000-0000-000000000002', 'Laurentian Chief', 'Robert', '1-800-363-7749', null, 'Moccasins', 'Net 30', 'active', 'Reorder moccasins, call Robert at 1-800-363-7749. Need to order more.'),
  ('44444444-0000-0000-0000-000000000009', '22222222-0000-0000-0000-000000000002', 'Oscardo', 'Janice', '905-391-8979', null, 'All Gifts', '60 days, post-dated cheque after shipping', 'active', 'Post-dated cheque after shipping. Is the cheque issued? NO. Where is the invoice.'),
  ('44444444-0000-0000-0000-000000000010', '22222222-0000-0000-0000-000000000002', 'McIntosh', 'John', '1-888-977-1370', null, 'Mugs, Gifts', 'Net 30', 'active', 'Missing 4 mugs but they were charged on the invoice.'),
  ('44444444-0000-0000-0000-000000000011', '22222222-0000-0000-0000-000000000002', 'Muskoka Puzzles', 'Sue', null, null, 'Single muskoka puzzle', 'Upon delivery, cash or cheque', 'active', 'Not paid. Where is the invoice and terms.'),
  ('44444444-0000-0000-0000-000000000012', '22222222-0000-0000-0000-000000000002', 'Panam', 'Gina', '705-306-0640', null, 'Bear gifts', 'Net 30', 'active', 'Got 1 extra item and 1 damaged item.'),
  ('44444444-0000-0000-0000-000000000013', '22222222-0000-0000-0000-000000000002', 'Sun Bum', 'Brooke', '705-220-1803', null, 'Sun screen', 'Net 30', 'active', null),
  ('44444444-0000-0000-0000-000000000014', '22222222-0000-0000-0000-000000000002', 'Indigenous Collection', 'Monika', '613-290-5730', null, 'Art cards and gifts', 'Net 30', 'active', 'Where is the invoice.'),
  ('44444444-0000-0000-0000-000000000015', '22222222-0000-0000-0000-000000000002', 'Alan Dhingra', 'Alan', '519-703-1855', null, 'Magnets, frames, note cards (local maps)', 'Net 30', 'active', 'No magnets in the 2026 order, review for 2027.'),
  ('44444444-0000-0000-0000-000000000016', '22222222-0000-0000-0000-000000000002', 'Kalyn Imports', 'David', '905-601-5904', null, 'Bookmarks, quills, puzzles', 'Net 60', 'active', '1 broken mug. Where is the invoice and due date.'),
  ('44444444-0000-0000-0000-000000000017', '22222222-0000-0000-0000-000000000002', 'Gift Craft Ltd', 'Rudy', '705-717-2579', null, 'Mugs, Gifts, Ladies clothing, toys', null, 'bankrupt', 'Bankrupt and sold. Order similar from Ganz or CLS, discontinue.'),
  ('44444444-0000-0000-0000-000000000018', '22222222-0000-0000-0000-000000000002', 'Jafsons', null, null, null, 'Home decor', null, 'skip', 'Inventory left, skipped for 2026, consider for 2027.'),
  ('44444444-0000-0000-0000-000000000019', '22222222-0000-0000-0000-000000000002', 'Unicorn Enterprises', 'Andy', '905-564-2370', null, '3D Puzzles', 'Rep calls and delivers after payment', 'active', null),
  ('44444444-0000-0000-0000-000000000020', '22222222-0000-0000-0000-000000000005', 'Papa Fashions', 'John', '519-757-7755', null, 'Ladies fashion', 'Net 90, Net 60', 'active', 'Ordered a lot, review carefully for the 2027 spring order.'),
  ('44444444-0000-0000-0000-000000000021', '22222222-0000-0000-0000-000000000005', 'White Wave (Oneill)', 'Tasha', '905-483-9093', null, 'Men and Women fashion', '60 days', 'active', null),
  ('44444444-0000-0000-0000-000000000022', '22222222-0000-0000-0000-000000000005', 'Nasri', 'Janice', '905-391-8979', null, 'Men, Women and Kids fashion', '30 days', 'active', null),
  ('44444444-0000-0000-0000-000000000023', '22222222-0000-0000-0000-000000000005', 'Point Zero', 'Jeff', '514-781-3222', null, 'Shorts and shirts', '30 days', 'active', null),
  ('44444444-0000-0000-0000-000000000024', '22222222-0000-0000-0000-000000000005', 'Billabong (Boardriders)', 'Chris', '705-644-2524', null, 'Men and Women fashion', '30 days', 'active', null),
  ('44444444-0000-0000-0000-000000000025', '22222222-0000-0000-0000-000000000005', 'Hatley (Little Blue House)', 'Laura', '705-641-2182', null, 'Mens, Ladies and Kids (PJs, socks)', '90 days', 'active', 'Rep visits regularly and does the orders.'),
  ('44444444-0000-0000-0000-000000000026', '22222222-0000-0000-0000-000000000005', 'Ace Annison Ltd', null, '905-944-8203', null, 'Night lights', 'Credit card after shipping', 'active', null),
  ('44444444-0000-0000-0000-000000000027', '22222222-0000-0000-0000-000000000005', 'Team Ltd', 'Liam', '416-830-7216', null, 'Mens, Womens and Kids swimwear', '30 days', 'active', null),
  ('44444444-0000-0000-0000-000000000028', '22222222-0000-0000-0000-000000000005', 'Minden Soaps', 'Bonnie', '705-854-0715', null, 'Soaps', '30 days, post-dated cheque', 'active', 'No order confirmation copy, refer to OneDrive or email.'),
  ('44444444-0000-0000-0000-000000000029', '22222222-0000-0000-0000-000000000003', 'Village Gourmet', 'Rudy', null, null, 'Gourmet grocery', 'Net 30', 'active', null),
  ('44444444-0000-0000-0000-000000000030', '22222222-0000-0000-0000-000000000003', 'Kountry Korner', 'Mike Dean', null, 'mikedeane@sympatico.ca', 'Jams and preserves', 'Net 30', 'active', 'Pays by e-transfer.'),
  ('44444444-0000-0000-0000-000000000031', '22222222-0000-0000-0000-000000000003', 'Wildy Delicious', 'Luke', null, null, 'Hot sauce and specialty foods', 'Net 30', 'active', 'Hot sauce, 6 cases, order required.'),
  ('44444444-0000-0000-0000-000000000032', '22222222-0000-0000-0000-000000000003', 'Canadian Organic Herb and Spice', null, null, null, 'Herbs and spices', null, 'active', 'Only order if needed, not moving well.'),
  ('44444444-0000-0000-0000-000000000033', '22222222-0000-0000-0000-000000000001', 'Orgill', null, null, null, 'Hardware, fasteners, seasonal', 'Net 30', 'active', 'Richest vendor folder: invoices, statements, SKUs, returns, planogram, SmartStart.'),
  ('44444444-0000-0000-0000-000000000034', '22222222-0000-0000-0000-000000000001', 'Big Rock Sports', null, null, null, 'Fishing and outdoor', 'Net 30', 'active', null),
  ('44444444-0000-0000-0000-000000000035', '22222222-0000-0000-0000-000000000001', 'Hutchings Marine', null, null, null, 'Marine supplies', 'Net 30', 'active', 'Post-dated cheque arrangement.');

-- Purchase orders. order_amount is the "Amount" (order) column from the bookings sheet.
insert into purchase_order (id, vendor_id, department_id, season_year, order_amount, ship_date, status, notes) values
  ('66666666-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 2026, 3089.04, '2026-05-01', 'received', 'Delivered May 5th. Extra and unordered items, 1 missing product charged.'),
  ('66666666-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 2026, 644.00, '2026-05-10', 'received', 'Delivered May 15th.'),
  ('66666666-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002', 2026, 6104.92, '2026-05-04', 'received', 'Delivered May 1st.'),
  ('66666666-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000002', 2026, 2398.00, '2026-05-25', 'ordered', 'Not yet delivered.'),
  ('66666666-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000002', 2026, 7665.25, '2026-05-01', 'received', 'Received April 1st and May 1st orders.'),
  ('66666666-0000-0000-0000-000000000006', '44444444-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000002', 2026, 14199.58, '2026-04-25', 'received', 'Received April 23rd. Some damaged hoodies.'),
  ('66666666-0000-0000-0000-000000000007', '44444444-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000002', 2026, 10802.00, '2026-04-10', 'received', 'Received April 1st order. Back order.'),
  ('66666666-0000-0000-0000-000000000008', '44444444-0000-0000-0000-000000000008', '22222222-0000-0000-0000-000000000002', 2026, 10827.00, '2026-05-10', 'received', 'Delivered May 13th. Need to order more.'),
  ('66666666-0000-0000-0000-000000000009', '44444444-0000-0000-0000-000000000009', '22222222-0000-0000-0000-000000000002', 2026, 3364.00, '2026-04-01', 'received', 'Delivered April 9th.'),
  ('66666666-0000-0000-0000-000000000010', '44444444-0000-0000-0000-000000000010', '22222222-0000-0000-0000-000000000002', 2026, 803.66, '2026-05-15', 'received', 'Delivered May 20th.'),
  ('66666666-0000-0000-0000-000000000011', '44444444-0000-0000-0000-000000000011', '22222222-0000-0000-0000-000000000002', 2026, 672.00, '2026-05-05', 'received', 'Delivered May 2nd.'),
  ('66666666-0000-0000-0000-000000000012', '44444444-0000-0000-0000-000000000012', '22222222-0000-0000-0000-000000000002', 2026, 1534.00, '2026-05-05', 'received', 'Delivered May 9th. 1 extra and 1 damaged item.'),
  ('66666666-0000-0000-0000-000000000013', '44444444-0000-0000-0000-000000000013', '22222222-0000-0000-0000-000000000002', 2026, 9911.00, '2026-05-01', 'received', 'Delivered May 13th.'),
  ('66666666-0000-0000-0000-000000000014', '44444444-0000-0000-0000-000000000014', '22222222-0000-0000-0000-000000000002', 2026, 2000.00, '2026-06-01', 'received', 'Delivered May 1st.'),
  ('66666666-0000-0000-0000-000000000015', '44444444-0000-0000-0000-000000000015', '22222222-0000-0000-0000-000000000002', 2026, 418.00, '2026-04-22', 'received', 'Delivered April 26th.'),
  ('66666666-0000-0000-0000-000000000016', '44444444-0000-0000-0000-000000000016', '22222222-0000-0000-0000-000000000002', 2026, 4934.10, '2026-04-01', 'received', 'Delivered May 15th. 1 broken mug.'),
  ('66666666-0000-0000-0000-000000000019', '44444444-0000-0000-0000-000000000019', '22222222-0000-0000-0000-000000000002', 2026, 339.00, '2026-05-08', 'received', 'Delivered May 15th.'),
  ('66666666-0000-0000-0000-000000000020', '44444444-0000-0000-0000-000000000020', '22222222-0000-0000-0000-000000000005', 2026, 16593.00, '2026-04-01', 'received', 'Delivered April 1st order.'),
  ('66666666-0000-0000-0000-000000000021', '44444444-0000-0000-0000-000000000021', '22222222-0000-0000-0000-000000000005', 2026, 5326.70, '2026-04-10', 'received', 'Delivered April 29th.'),
  ('66666666-0000-0000-0000-000000000022', '44444444-0000-0000-0000-000000000022', '22222222-0000-0000-0000-000000000005', 2026, 4666.04, '2026-04-01', 'received', 'Delivered May 9th.'),
  ('66666666-0000-0000-0000-000000000023', '44444444-0000-0000-0000-000000000023', '22222222-0000-0000-0000-000000000005', 2026, 3442.50, '2026-05-05', 'received', 'Delivered April 30th.'),
  ('66666666-0000-0000-0000-000000000024', '44444444-0000-0000-0000-000000000024', '22222222-0000-0000-0000-000000000005', 2026, 5164.70, '2026-04-20', 'received', 'Delivered May 8th and 13th.'),
  ('66666666-0000-0000-0000-000000000025', '44444444-0000-0000-0000-000000000025', '22222222-0000-0000-0000-000000000005', 2026, 5055.00, '2026-04-24', 'received', 'Delivered April 27th.'),
  ('66666666-0000-0000-0000-000000000026', '44444444-0000-0000-0000-000000000026', '22222222-0000-0000-0000-000000000005', 2026, 378.20, '2026-05-07', 'received', 'Delivered May 13th.'),
  ('66666666-0000-0000-0000-000000000027', '44444444-0000-0000-0000-000000000027', '22222222-0000-0000-0000-000000000005', 2026, 3121.26, '2026-04-30', 'received', 'Delivered May 4th.'),
  ('66666666-0000-0000-0000-000000000028', '44444444-0000-0000-0000-000000000028', '22222222-0000-0000-0000-000000000005', 2026, 920.00, '2026-05-05', 'received', 'Delivered April 21st.'),
  ('66666666-0000-0000-0000-000000000029', '44444444-0000-0000-0000-000000000029', '22222222-0000-0000-0000-000000000003', 2026, 3900.00, '2026-04-25', 'received', 'Received May 1st.'),
  ('66666666-0000-0000-0000-000000000030', '44444444-0000-0000-0000-000000000030', '22222222-0000-0000-0000-000000000003', 2026, 2676.00, '2026-05-10', 'received', 'Received May 20th.'),
  ('66666666-0000-0000-0000-000000000031', '44444444-0000-0000-0000-000000000031', '22222222-0000-0000-0000-000000000003', 2026, 1822.20, '2026-05-01', 'received', 'Received May 4th.'),
  ('66666666-0000-0000-0000-000000000032', '44444444-0000-0000-0000-000000000032', '22222222-0000-0000-0000-000000000003', 2026, 620.05, '2026-05-01', 'received', 'Delivered. Only order if needed.');

-- Invoices. amount is the invoiced amount as recorded on the sheet; hst_amount 0 (tax as billed).
insert into invoice (id, vendor_id, invoice_number, amount, hst_amount, terms, due_date, status) values
  ('77777777-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 'ABBOT-2026', 2898.65, 0, 'Net 30', '2026-05-31', 'unpaid'),
  ('77777777-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'ARTBURN-2026', 781.55, 0, 'Paid by credit card before delivery', '2026-05-12', 'paid'),
  ('77777777-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000003', 'ATTRACTION-2026', 6186.03, 0, 'Net 60', '2026-06-28', 'unpaid'),
  ('77777777-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000005', 'GANZ-2026', 6624.10, 0, 'Net 60, Net 90', '2026-05-31', 'unpaid'),
  ('77777777-0000-0000-0000-000000000006', '44444444-0000-0000-0000-000000000006', 'GENESIS-2026', 14199.58, 0, 'Half July 15, half Aug 15', '2026-07-15', 'unpaid'),
  ('77777777-0000-0000-0000-000000000007', '44444444-0000-0000-0000-000000000007', 'DUBWEAR-2026', 7541.63, 0, 'Net 30, Net 60, Net 90', null, 'unpaid'),
  ('77777777-0000-0000-0000-000000000008', '44444444-0000-0000-0000-000000000008', 'LAURENTIAN-2026', 10623.46, 0, 'Net 30', '2026-06-10', 'unpaid'),
  ('77777777-0000-0000-0000-000000000009', '44444444-0000-0000-0000-000000000009', 'OSCARDO-2026', 3688.34, 0, '60 days, post-dated cheque', '2026-06-05', 'postdated'),
  ('77777777-0000-0000-0000-000000000010', '44444444-0000-0000-0000-000000000010', 'MCINTOSH-2026', 884.03, 0, 'Net 30', '2026-06-14', 'unpaid'),
  ('77777777-0000-0000-0000-000000000011', '44444444-0000-0000-0000-000000000011', 'MUSKOKAPZ-2026', 759.36, 0, 'Upon delivery, cash or cheque', null, 'unpaid'),
  ('77777777-0000-0000-0000-000000000012', '44444444-0000-0000-0000-000000000012', 'PANAM-2026', 1751.05, 0, 'Net 30', '2026-06-05', 'unpaid'),
  ('77777777-0000-0000-0000-000000000013', '44444444-0000-0000-0000-000000000013', 'SUNBUM-2026', 4837.19, 0, 'Net 30', '2026-06-07', 'unpaid'),
  ('77777777-0000-0000-0000-000000000014', '44444444-0000-0000-0000-000000000014', 'INDIGENOUS-2026', 1669.05, 0, 'Net 30', '2026-05-24', 'unpaid'),
  ('77777777-0000-0000-0000-000000000015', '44444444-0000-0000-0000-000000000015', 'ALANDH-2026', 357.62, 0, 'Net 30', '2026-05-23', 'unpaid'),
  ('77777777-0000-0000-0000-000000000016', '44444444-0000-0000-0000-000000000016', 'KALYN-2026', 5410.65, 0, 'Net 60', null, 'unpaid'),
  ('77777777-0000-0000-0000-000000000019', '44444444-0000-0000-0000-000000000019', 'UNICORN-2026', 394.40, 0, 'Rep calls after payment', null, 'paid'),
  ('77777777-0000-0000-0000-000000000020', '44444444-0000-0000-0000-000000000020', 'PAPA-2026', 13367.89, 0, 'Net 90, Net 60', null, 'unpaid'),
  ('77777777-0000-0000-0000-000000000021', '44444444-0000-0000-0000-000000000021', 'WHITEWAVE-2026', 3343.46, 0, '60 days', '2026-06-30', 'unpaid'),
  ('77777777-0000-0000-0000-000000000022', '44444444-0000-0000-0000-000000000022', 'NASRI-2026', 4653.96, 0, '30 days', '2026-06-03', 'unpaid'),
  ('77777777-0000-0000-0000-000000000023', '44444444-0000-0000-0000-000000000023', 'POINTZERO-2026', 2177.52, 0, '30 days', '2026-05-24', 'unpaid'),
  ('77777777-0000-0000-0000-000000000024', '44444444-0000-0000-0000-000000000024', 'BILLABONG-2026', 4450.90, 0, '30 days', '2026-06-06', 'unpaid'),
  ('77777777-0000-0000-0000-000000000025', '44444444-0000-0000-0000-000000000025', 'HATLEY-2026', 4245.83, 0, 'Net 30, 90 days', null, 'unpaid'),
  ('77777777-0000-0000-0000-000000000026', '44444444-0000-0000-0000-000000000026', 'ACEANNISON-2026', 423.40, 0, 'Credit card after shipping', null, 'paid'),
  ('77777777-0000-0000-0000-000000000027', '44444444-0000-0000-0000-000000000027', 'TEAM-2026', 3083.20, 0, '30 days', '2026-05-31', 'unpaid'),
  ('77777777-0000-0000-0000-000000000028', '44444444-0000-0000-0000-000000000028', 'MINDEN-2026', 865.00, 0, '30 days, post-dated cheque', null, 'postdated'),
  ('77777777-0000-0000-0000-000000000029', '44444444-0000-0000-0000-000000000029', 'VILLAGEG-2026', 3428.96, 0, 'Net 30', '2026-05-29', 'unpaid'),
  ('77777777-0000-0000-0000-000000000030', '44444444-0000-0000-0000-000000000030', 'KOUNTRY-2026', 2626.00, 0, 'Net 30', '2026-06-20', 'unpaid'),
  ('77777777-0000-0000-0000-000000000031', '44444444-0000-0000-0000-000000000031', 'WILDY-2026', 1839.46, 0, 'Net 30', '2026-05-31', 'unpaid'),
  ('77777777-0000-0000-0000-000000000032', '44444444-0000-0000-0000-000000000032', 'CDNORGANIC-2026', 620.05, 0, null, null, 'paid');

-- Payments for the paid invoices (amount = invoice total).
insert into payment (invoice_id, amount, method, paid_date, created_by) values
  ('77777777-0000-0000-0000-000000000002', 781.55, 'cc', '2026-05-12', '33333333-0000-0000-0000-000000000002'),
  ('77777777-0000-0000-0000-000000000019', 394.40, 'cheque', '2026-05-15', '33333333-0000-0000-0000-000000000002'),
  ('77777777-0000-0000-0000-000000000026', 423.40, 'cc', '2026-05-13', '33333333-0000-0000-0000-000000000002'),
  ('77777777-0000-0000-0000-000000000032', 620.05, 'etransfer', '2026-05-02', '33333333-0000-0000-0000-000000000002');

-- Tribal knowledge captured from the bookings sheet comments and the vendor/utility lists.
insert into knowledge_note (department_id, topic, body, tags, created_by) values
  ('22222222-0000-0000-0000-000000000002', 'Discontinued and skipped vendors', 'Gift Craft Ltd is bankrupt and sold, order similar from Ganz or CLS. Laser Gifts and KNDZ did not sell well, skip. Jafsons has inventory left, skip for 2026 and review 2027.', '{vendors,reorder}', '33333333-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000002', 'Reorder moccasins', 'Laurentian Chief, call Robert at 1-800-363-7749. We need to order more this season.', '{reorder,contacts}', '33333333-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000002', 'Oscardo payment rule', 'Oscardo is a 60-day post-dated cheque after shipping. Confirm the cheque is actually issued.', '{payments}', '33333333-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000005', 'Swimwear order mix', 'SGS Sports and Body Glove: about 80 percent Skye, 50 percent Body Glove from 2025, and 45 percent Body Glove from 2024 leftovers.', '{ordering}', '33333333-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000005', 'Skip for 2026', 'Volcom, Westliee (686), Todays Designer, and Ontario Hats have enough inventory, skip 2026 and review 2027. Order hats from Coal, Billabong, and World Famous.', '{reorder}', '33333333-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000003', 'Specialty food cadence', 'Fracktals: order in May, July, August, and November. Mighty Pines: repeat the 2024 order. Brukes Honey and Algoma Highlands: order as needed.', '{ordering}', '33333333-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000003', 'Checkout vendors', 'RBH Tobacco and Imperial Tobacco order by email. Ice cream from Nestle and DGS Distribution. Coffee from Muskoka Roastery. Maple syrup from Emes Family.', '{checkout}', '33333333-0000-0000-0000-000000000001'),
  (null, 'Utility and service accounts', 'Hydro One for power, Vnet for internet, Bell for phone. Propane from Moor Propane. Pest control by Orkin Canada. Generator service by Generator Solution. POS data by Howell Data Systems.', '{utilities,maintenance,accounts}', '33333333-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000001', 'Pesticide vendor licence', 'The store sells regulated pesticides under an Ontario Vendor Licence. Keep it current and be ready to show it at point of sale. Northland supplies the bug sprays.', '{compliance}', '33333333-0000-0000-0000-000000000001');

-- Property and Maintenance assets. The building, refrigeration, and grounds we keep up, plus
-- the operating service accounts from Utilities.docx and Vendorlist&InvoiceFilling.docx
-- (DATA_SOURCES.md): Hydro One, Bell, Vnet, Moor Propane, Orkin, Generator Solution, Howell.
insert into maintenance_asset (id, store_id, department_id, name, category, location, notes) values
  ('88888888-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', null, 'Store building', 'building', '1062 Main Street, Dorset', 'Winter and summer prep, roof, eavestroughs.'),
  ('88888888-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000003', 'Grocery refrigeration and coolers', 'refrigeration', 'Grocery and Meat', 'Walk-in cooler and display fridges. Check seals and temperatures.'),
  ('88888888-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', null, 'Parking lot and grounds', 'grounds', 'Exterior', 'Snow removal in winter, line painting and brush in summer.'),
  ('88888888-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000009', 'Propane tank exchange cage', 'safety', 'Garden Center', 'Gas tank exchange program. Keep cage stocked and locked.'),
  ('88888888-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', null, 'Standby generator', 'equipment', 'Rear of building', 'Serviced by Generator Solution.'),
  ('88888888-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', null, 'Hydro One account', 'building', 'Utility', 'Electricity supply. Account from Utilities.docx.'),
  ('88888888-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', null, 'Bell phone account', 'building', 'Utility', 'Store phone line.'),
  ('88888888-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', null, 'Vnet internet account', 'building', 'Utility', 'Internet service.'),
  ('88888888-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', null, 'Moor Propane account', 'building', 'Utility', 'Propane supply for heating and the exchange program.'),
  ('88888888-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', null, 'Orkin Canada pest control', 'safety', 'Whole store', 'Scheduled pest control service.'),
  ('88888888-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', null, 'Howell Data Systems POS', 'equipment', 'Checkout', 'Point of sale hardware and data service.');

-- Maintenance tasks. Real seasonal jobs from the store notes. Due dates are spread around the
-- current 2026 season so the open / due soon / overdue / done grouping is visible in the screen.
insert into maintenance_task (id, store_id, asset_id, title, detail, due_date, recurrence, status, assigned_to, completed_at, created_by) values
  ('99999999-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '88888888-0000-0000-0000-000000000002', 'Refrigeration check', 'Check walk-in cooler seals, coils, and temperatures before peak summer.', '2026-06-03', 'monthly', 'open', '33333333-0000-0000-0000-000000000002', null, '33333333-0000-0000-0000-000000000001'),
  ('99999999-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '88888888-0000-0000-0000-000000000001', 'Summer building prep', 'Open patio area, service screens and doors, check eavestroughs.', '2026-06-15', 'seasonal', 'open', null, null, '33333333-0000-0000-0000-000000000001'),
  ('99999999-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '88888888-0000-0000-0000-000000000004', 'Restock gas tank exchange cage', 'Confirm exchange propane stock for the long weekend.', '2026-05-31', 'monthly', 'open', '33333333-0000-0000-0000-000000000002', null, '33333333-0000-0000-0000-000000000001'),
  ('99999999-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '88888888-0000-0000-0000-000000000001', 'Roof check', 'Inspect roof and flashing after winter, before the busy season.', '2026-05-20', 'annual', 'open', null, null, '33333333-0000-0000-0000-000000000001'),
  ('99999999-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '88888888-0000-0000-0000-000000000005', 'Generator service', 'Annual service by Generator Solution.', '2026-09-01', 'annual', 'open', null, null, '33333333-0000-0000-0000-000000000001'),
  ('99999999-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', '88888888-0000-0000-0000-000000000003', 'First-snow removal arrangement', 'Confirm the snow removal contractor for the coming winter.', '2026-11-01', 'seasonal', 'open', null, null, '33333333-0000-0000-0000-000000000001'),
  ('99999999-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', '88888888-0000-0000-0000-000000000001', 'Winter building prep', 'Shut down patio, service heat, check insulation and weather seals.', '2025-11-01', 'seasonal', 'done', '33333333-0000-0000-0000-000000000002', '2025-11-04T15:00:00Z', '33333333-0000-0000-0000-000000000001'),
  ('99999999-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', '88888888-0000-0000-0000-000000000010', 'Quarterly pest control visit', 'Orkin Canada scheduled service.', '2026-06-30', 'seasonal', 'in_progress', '33333333-0000-0000-0000-000000000002', null, '33333333-0000-0000-0000-000000000001');

-- Insurance policies. ILLUSTRATIVE values only, not the store's real policies. Replace with
-- the actual policies before relying on these for renewals.
insert into insurance_policy (id, store_id, name, provider, policy_number, coverage, premium, renewal_date, notes) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Commercial property and liability', 'Illustrative Insurer', 'ILLUSTRATIVE-0001', 'Building, contents, general liability', 4800, '2026-06-20', 'ILLUSTRATIVE sample, not the real policy. Confirm with the broker.'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Garage and fuel handling endorsement', 'Illustrative Insurer', 'ILLUSTRATIVE-0002', 'Propane exchange and fuel handling', 1200, '2026-12-01', 'ILLUSTRATIVE sample, not the real policy.');

-- HR. ILLUSTRATIVE employees, pay rates, and shifts only, not real staff records. They hold
-- PIPEDA personal data; see the privacy header in schema.sql. Shifts sit in the week of the
-- current 2026 season so the schedule and the hours-and-pay summary show data. Replace with
-- real records (with consent) before use.
insert into employee (id, store_id, department_id, full_name, role, phone, email, hire_date, status, notes) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001', 'Sample Lead', 'Department lead', '705-555-0101', 'lead@example.com', '2024-05-01', 'active', 'ILLUSTRATIVE record.'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000003', 'Sample Cashier', 'Seasonal floor staff', '705-555-0102', 'cashier@example.com', '2026-04-15', 'active', 'ILLUSTRATIVE record.'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000008', 'Sample Cook', 'Chip stand', '705-555-0103', null, '2025-06-01', 'active', 'ILLUSTRATIVE record.');

insert into pay_rate (id, employee_id, rate, unit, effective_date) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 22.50, 'hour', '2024-05-01'),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 24.00, 'hour', '2026-01-01'),
  ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 17.20, 'hour', '2026-04-15'),
  ('cccccccc-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000003', 18.00, 'hour', '2025-06-01');

insert into shift (id, employee_id, work_date, start_time, end_time, notes, created_by) values
  ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '2026-05-25', '09:00', '17:00', null, '33333333-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', '2026-05-27', '09:00', '17:00', null, '33333333-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', '2026-05-30', '09:00', '15:00', 'Long weekend', '33333333-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000002', '2026-05-26', '11:00', '19:00', null, '33333333-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000002', '2026-05-29', '11:00', '19:00', null, '33333333-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-000000000002', '2026-05-30', '10:00', '18:00', null, '33333333-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000007', 'bbbbbbbb-0000-0000-0000-000000000003', '2026-05-30', '12:00', '20:00', 'Chip stand', '33333333-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000008', 'bbbbbbbb-0000-0000-0000-000000000003', '2026-05-31', '12:00', '20:00', 'Chip stand', '33333333-0000-0000-0000-000000000001');

-- ===========================================================================================
-- Multi-store. Backfill every store-scoped row above to Robinsons (store 1), then seed a small
-- SECOND store so the store picker and the store-scoped reads have something to switch to.
-- ===========================================================================================

-- Backfill store 1 on all rows seeded above. receiving_event and inventory_count have no seed
-- rows yet, so those updates are no-ops; they keep the backfill complete for future rows.
update department set store_id = '11111111-1111-1111-1111-111111111111' where store_id is null;
update vendor set store_id = '11111111-1111-1111-1111-111111111111' where store_id is null;
update item set store_id = '11111111-1111-1111-1111-111111111111' where store_id is null;
update purchase_order set store_id = '11111111-1111-1111-1111-111111111111' where store_id is null;
update invoice set store_id = '11111111-1111-1111-1111-111111111111' where store_id is null;
update receiving_event set store_id = '11111111-1111-1111-1111-111111111111' where store_id is null;
update inventory_count set store_id = '11111111-1111-1111-1111-111111111111' where store_id is null;
update knowledge_note set store_id = '11111111-1111-1111-1111-111111111111' where store_id is null;

-- Second store. ILLUSTRATIVE, to show the multi-store switch. Not a real Robinsons location.
insert into store (id, name, legal_entity, address) values
  ('11111111-2222-2222-2222-222222222222', 'Lakeside Outpost (sample)', null, 'Sample second location, Ontario (illustrative)');

insert into app_user (id, store_id, full_name, role, email) values
  ('33333333-2222-2222-2222-222222222222', '11111111-2222-2222-2222-222222222222', 'Outpost Lead', 'lead', 'lead@robinsons.demo');

-- Its own departments so the store is self-consistent in the scoped dropdowns.
insert into department (id, store_id, name, parent_department_id, accent_color) values
  ('22222222-2000-0000-0000-000000000001', '11111111-2222-2222-2222-222222222222', 'Hardware', null, '#2F5FA8'),
  ('22222222-2000-0000-0000-000000000002', '11111111-2222-2222-2222-222222222222', 'Grocery', null, '#1E8E5A'),
  ('22222222-2000-0000-0000-000000000003', '11111111-2222-2222-2222-222222222222', 'Gifts', null, '#B7791F');

-- Two or three of its own vendors with one order and one invoice each (illustrative figures).
insert into vendor (id, store_id, department_id, name, rep_name, phone, products_we_carry, default_terms, status, notes) values
  ('44444444-2000-0000-0000-000000000001', '11111111-2222-2222-2222-222222222222', '22222222-2000-0000-0000-000000000001', 'Northwood Hardware Supply', 'Dana', '705-555-0201', 'Fasteners and tools', 'Net 30', 'active', 'Illustrative second-store vendor.'),
  ('44444444-2000-0000-0000-000000000002', '11111111-2222-2222-2222-222222222222', '22222222-2000-0000-0000-000000000002', 'Lakeshore Provisions', 'Same', '705-555-0202', 'Dry grocery', 'Net 30', 'active', 'Illustrative second-store vendor. Flagged to reorder.'),
  ('44444444-2000-0000-0000-000000000003', '11111111-2222-2222-2222-222222222222', '22222222-2000-0000-0000-000000000003', 'Cottage Gifts Co', 'Riley', '705-555-0203', 'Local gifts', 'Net 60', 'active', 'Illustrative second-store vendor.');

insert into purchase_order (id, store_id, vendor_id, department_id, season_year, order_amount, ship_date, status, notes) values
  ('66666666-2000-0000-0000-000000000001', '11111111-2222-2222-2222-222222222222', '44444444-2000-0000-0000-000000000001', '22222222-2000-0000-0000-000000000001', 2026, 2100.00, '2026-05-05', 'received', 'Illustrative.'),
  ('66666666-2000-0000-0000-000000000003', '11111111-2222-2222-2222-222222222222', '44444444-2000-0000-0000-000000000003', '22222222-2000-0000-0000-000000000003', 2026, 1450.00, '2026-05-12', 'ordered', 'Illustrative.');

insert into invoice (id, store_id, vendor_id, invoice_number, amount, hst_amount, terms, due_date, status) values
  ('77777777-2000-0000-0000-000000000001', '11111111-2222-2222-2222-222222222222', '44444444-2000-0000-0000-000000000001', 'NWH-2026', 2040.00, 0, 'Net 30', '2026-06-04', 'unpaid'),
  ('77777777-2000-0000-0000-000000000003', '11111111-2222-2222-2222-222222222222', '44444444-2000-0000-0000-000000000003', 'CGC-2026', 1450.00, 0, 'Net 60', '2026-07-11', 'unpaid');

insert into knowledge_note (store_id, department_id, topic, body, tags, created_by) values
  ('11111111-2222-2222-2222-222222222222', '22222222-2000-0000-0000-000000000002', 'Reorder dry grocery', 'Lakeshore Provisions, reorder staples monthly through the summer.', '{reorder}', '33333333-2222-2222-2222-222222222222');
