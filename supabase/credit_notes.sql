-- Credit notes: vendor credits that reduce what is owed on an invoice.
-- Run once in the Supabase SQL editor. Idempotent: safe to run again.
--
-- A credit note records that a vendor gave the store credit (damaged goods, returns,
-- overcharges, short shipments). It references the original invoice, records the credit
-- amount and reason, and the adjusted invoice amount is derived (invoice total minus credits).
-- The store's workflow: receive goods, find a problem, communicate with the rep, the rep
-- confirms a credit or return, the manager records it here.

create table if not exists public.credit_note (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.store(id),
  vendor_id uuid not null references public.vendor(id),
  invoice_id uuid references public.invoice(id),
  invoice_number text,            -- the invoice number this credit applies to (can differ from invoice.invoice_number for cross-references)
  credit_amount numeric not null,
  reason text not null,           -- why the credit was issued
  comments text,                  -- any additional notes
  status text not null default 'pending' check (status in ('pending','applied','disputed')),
  created_by uuid references public.app_user(id),
  created_at timestamptz default now(),
  voided_at timestamptz,
  voided_by uuid references public.app_user(id)
);

create index if not exists credit_note_vendor_idx on public.credit_note(vendor_id);
create index if not exists credit_note_invoice_idx on public.credit_note(invoice_id);

-- Row-level security: match the dev open policy pattern. If enforced auth is on
-- (NEXT_PUBLIC_REQUIRE_AUTH=true), rerun supabase/auth_setup.sql after this file: it now
-- includes credit_note in the store-scoped member policies.
alter table public.credit_note enable row level security;
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice' and policyname = 'dev_all') then
    drop policy if exists dev_all on public.credit_note;
    create policy dev_all on public.credit_note for all using (true) with check (true);
  end if;
end $$;
