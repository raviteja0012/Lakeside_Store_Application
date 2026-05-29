-- Robinsons General Store, seed data. Run after schema.sql.
-- Fixed UUIDs so foreign keys resolve in one pass.

insert into store (id, name, legal_entity, address) values
  ('11111111-1111-1111-1111-111111111111', 'Robinsons General Store', '1000476363 Ontario Inc.', '1062 Main Street, Dorset, ON, P0A 1E0 (confirm address)');

insert into department (id, store_id, name, parent_department_id, accent_color) values
  ('22222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Hardware', null, '#2F5FA8'),
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Gifts', null, '#B7791F'),
  ('22222222-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Grocery', null, '#1E8E5A'),
  ('22222222-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Bakery', null, '#C0362C'),
  ('22222222-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Clothing', null, '#6B7480'),
  ('22222222-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Produce', null, '#1E8E5A'),
  ('22222222-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'Meat', null, '#C0362C'),
  ('22222222-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'Chip Stand', null, '#B7791F'),
  ('22222222-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'Garden Center', '22222222-0000-0000-0000-000000000001', '#1E8E5A');

insert into app_user (id, store_id, full_name, role) values
  ('33333333-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ravi Kiran', 'owner'),
  ('33333333-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Demo Staff', 'staff');

-- Vendors with fixed UUIDs so orders, invoices, and payments can reference them.
-- Contact and SOP notes come from the 2026 bookings sheet where available.
insert into vendor (id, department_id, name, rep_name, phone, email, products_we_carry, default_terms, status, notes) values
  ('44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Orgill', null, null, null, 'Hardware, fasteners, seasonal', 'Net 30', 'active', 'Richest vendor folder: invoices, statements, SKUs, returns, planogram, SmartStart.'),
  ('44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 'Big Rock Sports', null, null, null, 'Fishing and outdoor', 'Net 30', 'active', null),
  ('44444444-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000001', 'Hutchings Marine', null, null, null, 'Marine supplies', 'Net 30', 'active', 'Post-dated cheque arrangement.'),
  ('44444444-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000001', 'Lawson', null, null, null, 'Hardware', 'Net 30', 'active', null),
  ('44444444-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000001', 'Lumberjack Pellets', null, null, null, 'Wood pellets', 'Net 60', 'active', null),
  ('44444444-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000001', 'Link Products', null, null, null, 'Hardware', 'Net 30', 'active', null),
  ('44444444-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000002', 'Laurentian Chief', 'Robert', '1-800-363-7749', null, 'Moccasins and leather goods', 'Net 30', 'active', 'Reorder moccasins: call Robert at 1-800-363-7749.'),
  ('44444444-0000-0000-0000-000000000008', '22222222-0000-0000-0000-000000000002', 'ABBOT', null, null, null, 'Gifts', 'Net 30', 'active', 'Watch invoices: extra and unordered items, plus a missing product charged on the invoice. Reconcile order against invoice.');

insert into licence (store_id, name, authority, holder, expiry_date) values
  ('11111111-1111-1111-1111-111111111111', 'Ontario Pesticide Vendor Licence', 'Ontario Ministry of the Environment', 'Ravi Kiran', null);

-- Tax rules. Ontario 13% HST is the only rate the app applies; the rest are reference data (build spec section 13).
-- rate is the combined effective decimal.
insert into tax_rules (region, rate, label, note) values
  ('Ontario', 0.13, '13% HST', 'Working default. The app applies this rate.'),
  ('New Brunswick', 0.15, '15% HST', 'Reference only.'),
  ('Newfoundland and Labrador', 0.15, '15% HST', 'Reference only.'),
  ('Prince Edward Island', 0.15, '15% HST', 'Reference only.'),
  ('Nova Scotia', 0.14, '14% HST', 'Decreased effective April 1, 2025. Reference only.'),
  ('British Columbia', 0.12, '5% GST + 7% PST', 'Combined effective. Reference only.'),
  ('Saskatchewan', 0.11, '5% GST + 6% PST', 'Combined effective. Reference only.'),
  ('Manitoba', 0.12, '5% GST + 7% RST', 'RST expanded to digital services Jan 1, 2026. Reference only.'),
  ('Quebec', 0.14975, '5% GST + 9.975% QST', 'QST on the pre-tax base. Reference only.'),
  ('Alberta', 0.05, '5% GST', 'Reference only.');

-- Garden Center price-sign items. Retail prices are real values from the PriceSigns folder in the build spec.
insert into item (id, department_id, vendor_id, name, uom, retail_price, is_regulated) values
  ('55555555-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000009', null, 'Propane tank exchange', 'each', 36.99, false),
  ('55555555-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000009', null, 'Propane tank (new)', 'each', 79.99, false),
  ('55555555-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000009', null, 'Safe-T-Salt 10kg', 'bag', 4.99, false),
  ('55555555-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000009', null, 'Shovel', 'each', 24.99, false),
  ('55555555-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000009', null, 'Grass seed', 'each', 24.99, false),
  ('55555555-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000009', null, 'Vivere hammock', 'each', 249.99, false),
  ('55555555-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000009', null, 'Patio umbrella', 'each', 99.99, false);

-- Purchase orders. ABBOT order amount 3089.04 is from the bookings sheet.
-- Amounts marked illustrative are placeholders for the UI demo, not real store data.
insert into purchase_order (id, vendor_id, department_id, season_year, order_amount, ship_date, status, notes) values
  ('66666666-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000008', '22222222-0000-0000-0000-000000000002', 2026, 3089.04, '2026-04-20', 'received', 'Bookings sheet: ordered 3089.04, invoiced 2898.65. Extra and unordered items, one missing product charged. Reconcile.'),
  ('66666666-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 2026, 1846.30, '2026-04-15', 'received', 'Illustrative demo amount.');

-- Invoices. ABBOT 2898.65 (pre-tax) is the real invoiced figure from the bookings sheet.
-- amount is the pre-tax subtotal; hst_amount is the 13% tax; the amount owed is amount + hst_amount.
-- All other amounts are illustrative placeholders for the UI demo, not real store financials.
insert into invoice (id, vendor_id, invoice_number, amount, hst_amount, terms, due_date, status) values
  ('77777777-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000008', 'ABBOT-2026-0142', 2898.65, 376.82, 'Net 30', '2026-05-15', 'unpaid'),
  ('77777777-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', 'ORG-558210', 1846.30, 240.02, 'Net 30', '2026-06-18', 'unpaid'),
  ('77777777-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000005', 'LJP-2026-31', 920.00, 119.60, 'Net 60', '2026-06-02', 'unpaid'),
  ('77777777-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000002', 'BRS-77412', 1500.00, 195.00, 'Net 30', '2026-04-30', 'unpaid'),
  ('77777777-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000007', 'LC-2026-0098', 640.00, 83.20, 'Net 30', '2026-05-10', 'paid'),
  ('77777777-0000-0000-0000-000000000006', '44444444-0000-0000-0000-000000000003', 'HM-2026-0203', 1200.00, 156.00, 'post-dated cheque', '2026-07-15', 'postdated');

-- Payment for the paid Laurentian Chief invoice (amount = invoice total = pre-tax + hst).
insert into payment (invoice_id, amount, method, paid_date, created_by) values
  ('77777777-0000-0000-0000-000000000005', 723.20, 'cheque', '2026-05-08', '33333333-0000-0000-0000-000000000002');
