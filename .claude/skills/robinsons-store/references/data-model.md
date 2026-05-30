# Data model and database conventions

## Entities (v1 core)
- store: name, legal_entity, address.
- department: self-referencing parent_department_id for sub-departments like Garden Center. accent_color per department.
- app_user: full_name, role in staff, lead, manager, owner.
- vendor: per department. rep_name, phone, email, products_we_carry, default_terms, status in active, skip, discontinue, bankrupt, notes.
- item: department_id, vendor_id, sku, name, uom, retail_price, cost_price, is_regulated.
- receiving_event: department_id, vendor_id nullable, vendor_name raw extracted text, received_date, source_file_path, status, created_by. The capture record.
- receiving_line: receiving_event_id, item_id nullable, description, qty, unit_cost, retail_price_note, confidence.
- invoice: receiving_event_id, vendor_id, invoice_number, amount, hst_amount, terms, due_date, status in unpaid, paid, postdated, source_file_path.
- payment: invoice_id, amount, method in cheque, cc, etransfer, cash, paid_date, confirmation_file_path, created_by.
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
- Row-level security: the dev policies in schema.sql allow the anon key for the demo. Replace with Supabase Auth and per-role policies before production. Field-level control so floor staff can be limited to quantities while lead, manager, and owner see costs.
- Store original documents privately. Move to signed URLs if invoices contain anything sensitive.
