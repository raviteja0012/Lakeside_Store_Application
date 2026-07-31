-- Filing locations and comments, 2026-07-31 (SCRUM-9, the owner's comments of 30 and 31 July).
-- Run once in the Supabase SQL editor. Idempotent: safe to run again.
--
-- The store files every confirmation somewhere: a paper binder, a folder on OneDrive, or
-- both. Until now the app recorded WHICH of those, but not WHERE, so "digital" meant a file
-- nobody could find again. These columns hold the address.
--
--   invoice.invoice_filing          where the final invoice is filed
--   invoice.digital_file_location   the link or path, when any of it is digital
--   purchase_order.digital_file_location   same, for the order confirmation
--   payment.digital_file_location          same, for the payment confirmation
--
-- The values stay 'physical' / 'digital' / 'both' to match the filing column the payments
-- engine already uses; only the labels differ in the app.

-- 1. Invoice: how and where the final invoice is filed ---------------------------------
alter table public.invoice add column if not exists invoice_filing text;
alter table public.invoice drop constraint if exists invoice_invoice_filing_check;
alter table public.invoice add constraint invoice_invoice_filing_check
  check (invoice_filing is null or invoice_filing in ('physical', 'digital', 'both'));

alter table public.invoice add column if not exists digital_file_location text;

-- 2. Purchase order: where the order confirmation is filed ------------------------------
alter table public.purchase_order add column if not exists digital_file_location text;

-- 3. Payment: where the payment confirmation is filed -----------------------------------
alter table public.payment add column if not exists digital_file_location text;
