-- Dummy data for the DEV database only. Never run this against production.
--
-- Run after schema.sql and seed.sql, in the dev Supabase project. It is NOT in
-- run-order.txt, so the migration workflow will never apply it anywhere by itself.
--
-- WHAT THIS IS FOR. A dev environment is only worth having if the data in it can catch the
-- bugs that reach production, and a tidy happy path catches nothing. So every row below is
-- one of the shapes that has actually broken this codebase, or one that a reasonable change
-- would break next. If you add a case here, add the one that scared you, not the one that
-- reads nicely.
--
-- Idempotent: every insert is guarded, so running it twice changes nothing.

do $$
declare
  v_store uuid;
  v_dept_dry uuid;
  v_dept_hardware uuid;
  v_dept_property uuid;
  v_dept_finance uuid;
  v_vendor_included uuid;
  v_vendor_notax uuid;
  v_vendor_unstated uuid;
  v_vendor_minimum uuid;
  v_vendor_nominimum uuid;
  v_vendor_blank uuid;
  v_actor uuid;
  v_inv uuid;
begin
  select id into v_store from public.store order by created_at limit 1;
  if v_store is null then
    raise notice 'No store row found. Run schema.sql and seed.sql first.';
    return;
  end if;

  select id into v_actor from public.app_user order by created_at limit 1;

  select id into v_dept_dry from public.department
    where store_id = v_store and name ilike '%dry%' limit 1;
  select id into v_dept_hardware from public.department
    where store_id = v_store and name ilike '%hardware%' limit 1;
  select id into v_dept_property from public.department
    where store_id = v_store and name ilike '%property%' limit 1;
  select id into v_dept_finance from public.department
    where store_id = v_store and (name ilike '%payroll%' or name ilike '%tax%') limit 1;

  -- Vendors -----------------------------------------------------------------------------
  -- The four tax shapes, because tax_mode is the field that decides what the store owes and
  -- the one a careless change silently inverts. A vendor per mode means the invoice list on
  -- the dev site shows all four side by side, where a wrong total is visible at a glance.

  insert into public.vendor (store_id, department_id, name, status, default_terms, notes,
                             minimum_order_amount, no_minimum_order)
  select v_store, v_dept_dry, 'DEV Tax-Included Giftware', 'active', 'Net 30',
         'Prices include HST. Total owed must equal the invoice amount, never amount plus tax.',
         1500.00, false
  where not exists (select 1 from public.vendor where store_id = v_store and name = 'DEV Tax-Included Giftware')
  returning id into v_vendor_included;
  if v_vendor_included is null then
    select id into v_vendor_included from public.vendor where store_id = v_store and name = 'DEV Tax-Included Giftware';
  end if;

  insert into public.vendor (store_id, department_id, name, status, default_terms, notes, no_minimum_order)
  select v_store, v_dept_dry, 'DEV No-Tax Farm Supply', 'active', 'Net 15',
         'Exempt vendor. HST is recorded as zero, not blank, and nothing is added on top.', true
  where not exists (select 1 from public.vendor where store_id = v_store and name = 'DEV No-Tax Farm Supply')
  returning id into v_vendor_notax;
  if v_vendor_notax is null then
    select id into v_vendor_notax from public.vendor where store_id = v_store and name = 'DEV No-Tax Farm Supply';
  end if;

  insert into public.vendor (store_id, department_id, name, status, notes, no_minimum_order)
  select v_store, v_dept_hardware, 'DEV Refer-To-Invoice Hardware', 'active',
         'Tax is on the paper invoice. HST is blank, which is a different thing from zero.', true
  where not exists (select 1 from public.vendor where store_id = v_store and name = 'DEV Refer-To-Invoice Hardware')
  returning id into v_vendor_unstated;
  if v_vendor_unstated is null then
    select id into v_vendor_unstated from public.vendor where store_id = v_store and name = 'DEV Refer-To-Invoice Hardware';
  end if;

  -- The ordering profile, in its three real states: an amount, an explicit no-minimum, and
  -- never-asked. The third is the one that matters, because 130 live vendors are in it and a
  -- change that treats blank as "no minimum" would quietly tell the buyer the wrong thing.
  insert into public.vendor (store_id, department_id, name, status,
                             minimum_order_amount, no_minimum_order,
                             summer_order_timeline, order_location, order_location_other,
                             reorder_status, reorder_comments)
  select v_store, v_dept_dry, 'DEV Minimum-Order Apparel', 'active',
         2500.00, false,
         'Order at the January Gift Show',
         array['Gift Show', 'Email', 'Other'], 'Rep visits the store in April',
         'reordered', 'Reordered on July 15. Added 24 units of the lake-name mugs, they sold out in three weeks.'
  where not exists (select 1 from public.vendor where store_id = v_store and name = 'DEV Minimum-Order Apparel')
  returning id into v_vendor_minimum;
  if v_vendor_minimum is null then
    select id into v_vendor_minimum from public.vendor where store_id = v_store and name = 'DEV Minimum-Order Apparel';
  end if;

  insert into public.vendor (store_id, department_id, name, status,
                             no_minimum_order, summer_order_timeline, order_location, reorder_status)
  select v_store, v_dept_dry, 'DEV No-Minimum Sundries', 'active',
         true, 'Before mid-January', array['Phone', 'Vendor Website/Portal'], 'no_reorder'
  where not exists (select 1 from public.vendor where store_id = v_store and name = 'DEV No-Minimum Sundries')
  returning id into v_vendor_nominimum;

  -- Never asked: both minimum fields null/false, every ordering field blank. This is what
  -- most of the real directory looks like and it must stay valid forever.
  insert into public.vendor (store_id, department_id, name, status)
  select v_store, v_dept_property, 'DEV Never-Asked Maintenance', 'active'
  where not exists (select 1 from public.vendor where store_id = v_store and name = 'DEV Never-Asked Maintenance')
  returning id into v_vendor_blank;

  -- A vendor in each of the statuses that are not "active", because the reorder screen and
  -- the directory filter on them and a change to that filter should be visible here.
  insert into public.vendor (store_id, department_id, name, status, no_minimum_order)
  select v_store, v_dept_dry, 'DEV Discontinued Line', 'discontinue', true
  where not exists (select 1 from public.vendor where store_id = v_store and name = 'DEV Discontinued Line');

  insert into public.vendor (store_id, department_id, name, status, no_minimum_order)
  select v_store, v_dept_finance, 'DEV Receiver General', 'active', true
  where not exists (select 1 from public.vendor where store_id = v_store and name = 'DEV Receiver General');

  -- Invoices ----------------------------------------------------------------------------
  -- The arithmetic that has to keep working. A tax-included invoice of 1500.00 holding
  -- 172.57 of HST owes 1500.00, not 1672.57. That single row is the one this whole
  -- environment exists to protect: it is the shape that would have caught the bug where
  -- switching the tax mode kept the 13-percent-on-top figure.
  insert into public.invoice (store_id, vendor_id, invoice_number, invoice_date, amount,
                              hst_amount, freight_charges, tax_mode, delivery_status,
                              delivered_date, delivery_comments, invoice_filing,
                              terms, due_date, status)
  select v_store, v_vendor_included, 'DEV-INC-001', current_date - 20, 1500.00,
         172.57, 0, 'included', 'delivered',
         current_date - 18, 'N/A', 'physical',
         'Net 30', current_date + 10, 'unpaid'
  where not exists (select 1 from public.invoice where store_id = v_store and invoice_number = 'DEV-INC-001');

  -- The same subtotal the other way round: 1500.00 plus 195.00 owes 1695.00.
  insert into public.invoice (store_id, vendor_id, invoice_number, invoice_date, amount,
                              hst_amount, freight_charges, tax_mode, delivery_status,
                              delivered_date, delivery_comments, invoice_filing,
                              terms, due_date, status)
  select v_store, v_vendor_minimum, 'DEV-SEP-001', current_date - 15, 1500.00,
         195.00, 0, 'separate', 'delivered',
         current_date - 12, 'N/A', 'digital',
         'Net 30', current_date + 15, 'unpaid'
  where not exists (select 1 from public.invoice where store_id = v_store and invoice_number = 'DEV-SEP-001');

  -- Zero tax is a recorded fact; blank tax is an unanswered question. The HST report treats
  -- them differently and a change that conflates them shows up here.
  insert into public.invoice (store_id, vendor_id, invoice_number, invoice_date, amount,
                              hst_amount, tax_mode, delivery_status, delivered_date,
                              delivery_comments, terms, due_date, status)
  select v_store, v_vendor_notax, 'DEV-NONE-001', current_date - 10, 420.00,
         0, 'none', 'delivered', current_date - 9,
         'N/A', 'Net 15', current_date + 5, 'unpaid'
  where not exists (select 1 from public.invoice where store_id = v_store and invoice_number = 'DEV-NONE-001');

  insert into public.invoice (store_id, vendor_id, invoice_number, invoice_date, amount,
                              hst_amount, tax_mode, po_number, delivery_status,
                              delivered_date, delivery_comments, terms, due_date, status)
  select v_store, v_vendor_unstated, 'DEV-REF-001', current_date - 8, 880.25,
         null, 'invoice', 'PO-4471', 'partially_delivered', current_date - 6,
         'Two of the six ladders arrived damaged. Credit requested from the rep.',
         'Net 30', current_date + 22, 'unpaid'
  where not exists (select 1 from public.invoice where store_id = v_store and invoice_number = 'DEV-REF-001');

  -- Freight is part of what is owed and has been forgotten by a change before.
  insert into public.invoice (store_id, vendor_id, invoice_number, invoice_date, amount,
                              hst_amount, freight_charges, tax_mode, delivery_status,
                              delivered_date, delivery_comments, terms, due_date, status)
  select v_store, v_vendor_minimum, 'DEV-FRT-001', current_date - 40, 1000.00,
         130.00, 85.00, 'separate', 'delivered', current_date - 37,
         'N/A', 'Net 30', current_date - 10, 'unpaid'
  where not exists (select 1 from public.invoice where store_id = v_store and invoice_number = 'DEV-FRT-001');

  -- An invoice with no due date at all. The overdue list has to keep showing it rather than
  -- filtering it away, which is a real bug that was fixed once already.
  insert into public.invoice (store_id, vendor_id, invoice_number, invoice_date, amount,
                              hst_amount, tax_mode, delivery_status, delivered_date,
                              delivery_comments, status)
  select v_store, v_vendor_included, 'DEV-NODUE-001', current_date - 60, 240.00,
         31.20, 'separate', 'delivered', current_date - 58, 'N/A', 'unpaid'
  where not exists (select 1 from public.invoice where store_id = v_store and invoice_number = 'DEV-NODUE-001');

  -- Purchase orders ---------------------------------------------------------------------
  -- One open, one received, one cancelled. The late-delivery lists, the arriving-this-week
  -- list and the open-orders tile all share one rule about which of these is still expected,
  -- and they have drifted apart before.
  insert into public.purchase_order (store_id, vendor_id, department_id, season_year,
                                     order_amount, ship_date, status, order_filing, notes)
  select v_store, v_vendor_minimum, v_dept_dry, extract(year from current_date)::int,
         3200.00, current_date + 30, 'approved', 'digital',
         'Spring apparel. Above the 2500 minimum.'
  where not exists (select 1 from public.purchase_order
                    where store_id = v_store and notes = 'Spring apparel. Above the 2500 minimum.');

  insert into public.purchase_order (store_id, vendor_id, department_id, season_year,
                                     order_amount, ship_date, status, order_filing, notes)
  select v_store, v_vendor_minimum, v_dept_dry, extract(year from current_date)::int - 1,
         1800.00, current_date - 200, 'received', 'both',
         'Last season, closed. Should never appear as late.'
  where not exists (select 1 from public.purchase_order
                    where store_id = v_store and notes = 'Last season, closed. Should never appear as late.');

  insert into public.purchase_order (store_id, vendor_id, department_id, season_year,
                                     order_amount, ship_date, status, notes)
  select v_store, v_vendor_included, v_dept_dry, extract(year from current_date)::int,
         900.00, current_date - 5, 'cancelled',
         'Cancelled after the rep folded. Must not count as owed or as late.'
  where not exists (select 1 from public.purchase_order
                    where store_id = v_store and notes like 'Cancelled after the rep folded%');

  -- An order whose ship date has passed and is still open: this is what "late" means.
  insert into public.purchase_order (store_id, vendor_id, department_id, season_year,
                                     order_amount, ship_date, status, order_filing, notes)
  select v_store, v_vendor_unstated, v_dept_hardware, extract(year from current_date)::int,
         640.00, current_date - 14, 'in_progress', 'physical',
         'Two weeks past its ship date and still open. This one is late.'
  where not exists (select 1 from public.purchase_order
                    where store_id = v_store and notes like 'Two weeks past its ship date%');

  raise notice 'Dev seed applied. Vendors, invoices and orders cover the shapes that have broken before.';
end $$;

-- Payments are deliberately NOT inserted directly ---------------------------------------
-- Every payment in this system goes through record_payment, which writes the payment, its
-- allocations, the invoice statuses and the audit row in one transaction. Inserting payment
-- rows here by hand would create exactly the drift the health check exists to detect, and
-- the dev site would then disagree with itself on day one.
--
-- So: record payments on the dev site through the screens, the same way the store does. That
-- also exercises the path that matters. The invoices above are left unpaid on purpose, so
-- there is something to pay.
