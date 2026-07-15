# Data model and database conventions

## Entities (v1 core)
- store: name, legal_entity, address.
- department: self-referencing parent_department_id for sub-departments like Garden Center. accent_color per department.
- app_user: full_name, role in staff, lead, manager, owner, email (matches the Supabase Auth account), auth_id (set by auth_setup.sql when login is on).
- vendor: per department. rep_name, phone, email, products_we_carry, default_terms, status in active, skip, discontinue, bankrupt, notes.
- item: department_id, vendor_id, sku, name, uom, retail_price, cost_price, is_regulated.
- receiving_event: department_id, vendor_id nullable, vendor_name raw extracted text, received_date, source_file_path, status, created_by. The capture record.
- receiving_line: receiving_event_id, item_id nullable, description, qty, unit_cost, retail_price_note, confidence.
- invoice: receiving_event_id, vendor_id, invoice_number, amount, hst_amount, terms, due_date, status in unpaid, partially_paid, paid, postdated (derived from allocations by recompute_invoice_status; overdue is computed from due_date, never stored), source_file_path.
- payment: vendor_id, amount, method in cash, cheque, cc_visa, cc_mastercard, cc_amex, cc_debit, etransfer, eft, other (plus legacy cc), paid_date (future = post-dated, settles on its own when the date arrives), reference (cheque number, e-transfer ref), notes (required when method is other), confirmation_file_path, created_by. invoice_id remains only as the legacy single-invoice link.
- payment_allocation: payment_id, invoice_id, amount. How one payment splits across invoices; one cheque can settle invoices in different departments and each allocation keeps its department through its invoice. Partial payment = allocation below the invoice balance. Always write payments through the record_payment RPC and delete through void_payment (atomic: payment + allocations + statuses + audit).
- retail_price: item_id, price, effective_date, source_file_path, created_by. The retail-price history that replaces scribbles on invoices.
- inventory_count and inventory_count_line: department_id, counted_date, source_file_path, then item_id and counted_qty.
- purchase_order: vendor_id, department_id, season_year, order_amount, ship_date, delivery_commit, status, notes.
- knowledge_note: department_id, topic, body, tags, created_by. The tribal knowledge.
- licence: store_id, name, authority, number, holder, expiry_date, source_file_path. Required because the store sells regulated pesticides under a tracked Ontario licence.
- maintenance_asset and maintenance_task: assets (filters, refrigeration, snow removal, painting, roof) and tasks with a due date, recurrence, status, and assigned_to. The /maintenance screen.
- insurance_policy: provider, policy_number, coverage, premium, renewal_date, notes. The /compliance screen alongside licences.
- HR: employee, effective-dated pay_rate, and shift (the weekly schedule and hours). The /hr and /hr/schedule screens.
- tax_rules keyed by province for portability. Ontario 13 percent HST is the working default.
- activity_log: actor_id, action, entity, entity_id. Audit on every write.

## Deferred
- pgvector RAG for ask-your-store at scale, ML-based reorder points, and SMS alerts. The current ask and reorder agents pass store data directly as context; see docs/STATUS.md.

## Conventions
- snake_case everywhere.
- Audit on every write: created_by on records, plus an activity_log row for actions that matter.
- Money: numeric in dollars for the demo, integer cents before production.
- Confidence: every extracted receiving_line carries a confidence value 0 to 1. Below 0.7 is flagged in the UI and must be confirmed by a human. Never auto-post low-confidence dollar amounts.
- Row-level security: the dev policies in schema.sql allow the anon key for the demo, on every public table and on the documents storage bucket. auth_setup.sql replaces them with per-store, per-role policies and an authenticated-only storage policy when login is turned on. Field-level control so floor staff can be limited to quantities while lead, manager, and owner see costs. When you add a table to schema.sql, you must also add it to auth_setup.sql or it denies everyone under enforced auth.
- Store original documents in the documents bucket. Move to signed URLs if invoices contain anything sensitive.
