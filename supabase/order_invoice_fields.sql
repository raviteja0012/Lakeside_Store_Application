-- Order and invoice fields, 2026-07-28 (SCRUM-9, the owner's comments of 2026-07-27).
-- Run once in the Supabase SQL editor. Idempotent: safe to run again.
--
-- What it adds:
--   invoice.tax_mode          how the invoice states its tax (separate / included / none / invoice)
--   invoice.delivered_date    the day the goods actually arrived
--   invoice.delivery_comments short-shipped or damaged, in the receiver's words
--   invoice.delivery_status   widened to allow 'partially_delivered'
--   purchase_order.order_filing   where the order confirmation is filed
--   purchase_order.status     widened to allow 'in_progress' and 'approved'
--
-- It also re-creates recompute_invoice_status so the database agrees with invoiceTotal()
-- in src/lib/payments.ts about what a tax-included invoice owes. Without that, a
-- tax-included invoice could never reach 'paid': the engine would add the HST that is
-- already inside the amount, the payment would always fall short, and the invoice would
-- keep showing up in overdue and in the daily email forever.

-- 1. Invoice: tax mode ---------------------------------------------------------------
alter table public.invoice add column if not exists tax_mode text;
alter table public.invoice drop constraint if exists invoice_tax_mode_check;
alter table public.invoice add constraint invoice_tax_mode_check
  check (tax_mode is null or tax_mode in ('separate', 'included', 'none', 'invoice'));

-- Existing rows carried their mode inside the HST figure: blank meant "refer to the actual
-- invoice", zero meant a no-tax vendor, and anything else was tax entered separately. Write
-- that reading into the column once so every invoice opens with the right mode selected.
update public.invoice
   set tax_mode = case
                    when hst_amount is null then 'invoice'
                    when hst_amount = 0 then 'none'
                    else 'separate'
                  end
 where tax_mode is null;

-- 2. Invoice: delivery ---------------------------------------------------------------
alter table public.invoice add column if not exists delivered_date date;
alter table public.invoice add column if not exists delivery_comments text;
alter table public.invoice drop constraint if exists invoice_delivery_status_check;
alter table public.invoice add constraint invoice_delivery_status_check
  check (delivery_status is null or delivery_status in ('delivered', 'partially_delivered', 'not_delivered'));

-- 3. Purchase order: filing and the owner's two states --------------------------------
alter table public.purchase_order add column if not exists order_filing text;
alter table public.purchase_order drop constraint if exists purchase_order_order_filing_check;
alter table public.purchase_order add constraint purchase_order_order_filing_check
  check (order_filing is null or order_filing in ('digital', 'physical', 'both'));

-- The older lifecycle values stay valid: orders loaded from the bookings ledger carry them.
alter table public.purchase_order drop constraint if exists purchase_order_status_check;
alter table public.purchase_order add constraint purchase_order_status_check
  check (status in ('in_progress', 'approved', 'draft', 'ordered', 'confirmed', 'shipped', 'received', 'cancelled'));

-- 4. One definition of what an invoice owes -------------------------------------------
-- Mirrors invoiceTotal() in src/lib/payments.ts. Tax that is already inside the amount is
-- recorded (the HST report needs it) but never added on top.
create or replace function public.invoice_owed_total(
  p_amount numeric, p_freight numeric, p_hst numeric, p_tax_mode text
) returns numeric
language sql
immutable
as $$
  select coalesce(p_amount, 0) + coalesce(p_freight, 0)
       + case when p_tax_mode = 'included' then 0 else coalesce(p_hst, 0) end;
$$;

create or replace function public.recompute_invoice_status(p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_total numeric;
  v_settled numeric;
  v_scheduled numeric;
  v_status text;
begin
  -- Total owed = goods + freight + HST, matching invoiceTotal() in src/lib/payments.ts.
  -- Freight was omitted here at first, which let a partial payment of goods+HST flip an
  -- invoice to paid with the freight still owed. Tax already inside the amount is not
  -- added again.
  select public.invoice_owed_total(amount, freight_charges, hst_amount, tax_mode) into v_total
  from public.invoice where id = p_invoice_id;
  if not found then
    return;
  end if;

  select
    coalesce(sum(a.amount) filter (where p.paid_date is null or p.paid_date <= (now() at time zone 'America/Toronto')::date), 0),
    coalesce(sum(a.amount) filter (where p.paid_date > (now() at time zone 'America/Toronto')::date), 0)
  into v_settled, v_scheduled
  from public.payment_allocation a
  join public.payment p on p.id = a.payment_id
  where a.invoice_id = p_invoice_id and p.voided_at is null;

  if v_total <= 0 then
    v_status := case when v_settled + v_scheduled > 0 then 'paid' else 'unpaid' end;
  elsif v_settled >= v_total then
    v_status := 'paid';
  elsif v_settled + v_scheduled >= v_total then
    v_status := 'postdated';
  elsif v_settled + v_scheduled > 0 then
    v_status := 'partially_paid';
  else
    v_status := 'unpaid';
  end if;

  update public.invoice set status = v_status
  where id = p_invoice_id and status is distinct from v_status;
end;
$$;

-- 5. Re-derive every invoice once ------------------------------------------------------
-- The backfill above only wrote the mode that matches each invoice's existing HST figure,
-- so no total actually changes here. Running it anyway proves the new function agrees with
-- the statuses already on file, and repairs any row whose status drifted.
do $$
declare r record;
begin
  for r in select id from public.invoice where voided_at is null loop
    perform public.recompute_invoice_status(r.id);
  end loop;
end $$;
