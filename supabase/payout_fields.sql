-- Payout fields from the Jira backlog (SCRUM-9 acceptance criteria), 2026-07-27.
-- Run once in the Supabase SQL editor. Idempotent: safe to run again.
--
-- Adds the last field-level gaps between the board and the app:
--   invoice.service_category  Property Maintenance service category (Electrical, Plumbing,
--                             HVAC, Refrigeration, Lawn, Septic, Roofing, Snow Removal, or
--                             free text when Others is picked)
--   invoice.po_number         the purchase order number on Hardware invoices
--   credit_note.credit_type   how the credit comes back: bank refund or vendor account credit

alter table public.invoice add column if not exists service_category text;
alter table public.invoice add column if not exists po_number text;

do $$
begin
  if to_regclass('public.credit_note') is null then
    raise notice 'credit_note not found; run supabase/credit_notes.sql first, then rerun this file';
    return;
  end if;
  alter table public.credit_note add column if not exists credit_type text;
  alter table public.credit_note drop constraint if exists credit_note_credit_type_check;
  alter table public.credit_note add constraint credit_note_credit_type_check
    check (credit_type is null or credit_type in ('bank_account','vendor_account'));
end $$;
