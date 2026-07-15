---
inclusion: fileMatch
fileMatchPattern: "**/*.sql"
---

# Data Model and Database Standards

When working on SQL files (schema, seeds, migrations, auth policies), follow these conventions strictly.

#[[file:.claude/skills/robinsons-store/references/data-model.md]]

## Naming Conventions
- All identifiers: snake_case everywhere
- Tables are singular nouns (vendor, not vendors; item, not items)
- Foreign keys: `<referenced_table>_id` (e.g., department_id, vendor_id)

## Audit Requirements
- Every write records who and when
- Tables with user-created data have `created_by` (references app_user.id)
- Every meaningful action inserts an `activity_log` row with entity, entity_id, action, actor_id
- actor_id must never be null in activity_log

## Money
- Currently: numeric dollars for the demo
- Before production: integer cents
- Format all displayed money with formatCAD() from src/lib/format.ts
- Low-confidence dollar fields never auto-post

## Confidence Scoring
- Every extracted receiving_line carries a confidence value (0 to 1)
- Below 0.7 is flagged in the UI (amber) and must be human-confirmed
- A database trigger (receiving_line_confidence_gate) refuses low-confidence dollar lines without acknowledgement
- The acknowledgement is stored on receiving_event.low_confidence_ack

## Core Entities
- store, department (self-referencing parent_department_id, accent_color)
- app_user (role: staff/lead/manager/owner, auth_id links to Supabase Auth)
- vendor (per department, status: active/skip/discontinue/bankrupt)
- item (department_id, vendor_id, sku, uom, retail_price, cost_price, is_regulated)
- receiving_event, receiving_line (with confidence per line)
- invoice (status: unpaid/paid/postdated), payment (method: cheque/cc/etransfer/cash)
- retail_price (history with effective_date)
- inventory_count, inventory_count_line
- purchase_order (season_year, ship_date, delivery_commit)
- knowledge_note (tribal knowledge with tags)
- licence (Ontario pesticide vendor licence with tracked expiry)
- maintenance_asset, maintenance_task (due_date, recurrence, assigned_to)
- insurance_policy (provider, renewal_date)
- employee, pay_rate (effective-dated), shift (weekly schedule)
- tax_rules (keyed by province, Ontario 13% HST default)
- activity_log (actor_id, action, entity, entity_id)

## Row-Level Security (RLS) Rules

### Two SQL files, always in sync:
1. `supabase/schema.sql` - full rebuild with dev RLS (anon access for demo)
2. `supabase/auth_setup.sql` - production cutover with per-store, per-role policies

### Critical rule: new table = two places
- schema.sql: the dev_all loop auto-enables RLS and adds open policies
- auth_setup.sql: you MUST add a store-scoped policy (or child-table policy scoping through parent)
- If you forget auth_setup.sql, production silently denies everyone on that table

### Policy patterns:
- Store-scoped tables: `USING (store_id = my_store_id())`
- Child tables: scope through parent (e.g., receiving_line via receiving_event.store_id)
- Role gating: use `my_role()` function for role-based restrictions

### auth_setup.sql must be idempotent:
- Every policy is dropped before it is recreated
- Re-running it for new accounts must work as documented

## Edit and Delete Conventions (supabase/edit_delete.sql)
- Adds voided_at, voided_by columns for soft delete
- Soft delete: set voided_at timestamp (for ledger and master data)
- Hard delete: only for shifts
- Every list/total filters with `.is("voided_at", null)` on voidable tables
- Confirm every delete in the UI
- Gate with canEdit(role) from src/lib/edit.ts (owner and manager only)

## Schema Change Delivery
- For fresh databases: deliver as part of schema.sql (it drops and recreates)
- For live databases with data: deliver targeted, non-destructive SQL (ALTER TABLE, single policy, backfill)
- Never tell the owner to re-run schema.sql on a live DB with data worth keeping
- Put SQL in a block they can paste. Never ask the owner to debug

## Tax Rules
- Ontario 13% HST is the working default
- tax_rules table keyed by province for portability
- Show HST as a separate line
- Keep records six years (CRA requirement)

## Storage
- Documents bucket for invoice images and PDFs
- Store path on source_file_path or confirmation_file_path
- Dev: public bucket (schema.sql creates it with upload policy)
- Production: private bucket, authenticated-only (auth_setup.sql)
- Read through signed URLs (src/lib/docs.ts), never getPublicUrl directly

## Seed Data Rules
- seed.sql: departments, curated vendors, demo accounts (one per role)
- seed_bookings.sql: full real ledger (125 vendors), generated and validated against sheet totals
- Set store_id inline on inserts, not only in a backfill
- Mark illustrative seed data as illustrative
