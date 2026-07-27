-- Payments v2: consolidated payment recording.
-- Run this once in the Supabase SQL editor on an existing database. Fresh installs get the
-- same model from schema.sql. Idempotent: safe to run again.
--
-- What changes and why:
--   1. The method list the owner locked: Cash, Cheque, CC_Visa, CC_Mastercard, CC_AMEX,
--      CC_Debit, E-Transfer, EFT, Other. Legacy 'cc' rows stay valid so history is untouched;
--      the UI just stops offering it.
--   2. payment.vendor_id, reference, notes. A payment belongs to a vendor; the invoice link
--      moves to payment_allocation so one cheque can settle several invoices, including
--      invoices in different departments, and still reconcile as one payment.
--   3. payment_allocation: how a payment splits across invoices. Partial payments are just
--      an allocation smaller than the invoice balance.
--   4. Invoice status becomes derived: unpaid -> partially_paid -> paid, with postdated
--      meaning covered only by future-dated payments (a post-dated cheque). Overdue stays
--      computed from due_date in the UI, never stored.
--   5. record_payment / void_payment RPCs so every screen writes through one atomic path
--      (payment + allocations + statuses + audit in a single transaction).
--
-- If enforced auth is on (NEXT_PUBLIC_REQUIRE_AUTH=true), rerun supabase/auth_setup.sql
-- after this file: it now scopes payment through vendor_id and covers payment_allocation.

-- 1. New payment columns ---------------------------------------------------------------

alter table public.payment add column if not exists vendor_id uuid references public.vendor(id);
alter table public.payment add column if not exists reference text;  -- cheque number, e-transfer ref, card confirmation
alter table public.payment add column if not exists notes text;      -- required by the UI when method = other

-- 2. Method list -----------------------------------------------------------------------

alter table public.payment drop constraint if exists payment_method_check;
alter table public.payment add constraint payment_method_check check (method in (
  'cash','cheque','cc_visa','cc_mastercard','cc_amex','cc_debit','etransfer','eft','other',
  'cc'  -- legacy rows recorded before the card split; kept valid, not offered in the UI
));

-- 3. Invoice can be partially paid -----------------------------------------------------

alter table public.invoice drop constraint if exists invoice_status_check;
alter table public.invoice add constraint invoice_status_check check (status in (
  'unpaid','partially_paid','paid','postdated'
));

-- 4. Allocations -----------------------------------------------------------------------

create table if not exists public.payment_allocation (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payment(id) on delete cascade,
  invoice_id uuid not null references public.invoice(id),
  amount numeric not null,
  created_at timestamptz default now()
);
create index if not exists payment_allocation_payment_idx on public.payment_allocation(payment_id);
create index if not exists payment_allocation_invoice_idx on public.payment_allocation(invoice_id);

-- Backfill vendor_id from the invoice each legacy payment pointed at.
update public.payment p
set vendor_id = i.vendor_id
from public.invoice i
where p.invoice_id = i.id and p.vendor_id is null;

-- Backfill one allocation per legacy payment (idempotent).
insert into public.payment_allocation (payment_id, invoice_id, amount)
select p.id, p.invoice_id, coalesce(p.amount, 0)
from public.payment p
where p.invoice_id is not null
  and not exists (select 1 from public.payment_allocation a where a.payment_id = p.id);

-- 5. Status engine ----------------------------------------------------------------------

-- Derive one invoice's status from its allocations. paid_date in the future means the money
-- has not left yet (post-dated cheque): the invoice shows postdated until the date arrives.
-- A null paid_date counts as settled (legacy imports carry no date).
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
  -- invoice to paid with the freight still owed.
  select coalesce(amount, 0) + coalesce(freight_charges, 0) + coalesce(hst_amount, 0) into v_total
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

-- Record a payment atomically: the payment row, its allocations, each touched invoice's
-- recomputed status, and the audit entries, in one transaction. Returns the payment id.
-- p_allocations: jsonb array of {"invoice_id": uuid, "amount": number}.
-- A payment with no allocations is a deposit/prepayment and needs p_amount instead.
create or replace function public.record_payment(
  p_vendor_id uuid,
  p_method text,
  p_paid_date date,
  p_reference text default null,
  p_notes text default null,
  p_actor uuid default null,
  p_allocations jsonb default '[]'::jsonb,
  p_amount numeric default null,
  p_confirmation_filing text default null  -- digital or physical, per the workflow sheet
) returns uuid
language plpgsql
as $$
declare
  v_total numeric := 0;
  v_payment_id uuid;
  a record;
begin
  select coalesce(sum((x->>'amount')::numeric), 0) into v_total
  from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) x;

  if v_total <= 0 then
    if p_amount is null or p_amount <= 0 then
      raise exception 'a payment needs invoice allocations or an amount';
    end if;
    v_total := p_amount;
  end if;

  insert into public.payment (vendor_id, amount, method, paid_date, reference, notes, confirmation_filing, created_by)
  values (p_vendor_id, v_total, p_method, p_paid_date, nullif(p_reference, ''), nullif(p_notes, ''), nullif(p_confirmation_filing, ''), p_actor)
  returning id into v_payment_id;

  for a in
    select (x->>'invoice_id')::uuid as invoice_id, (x->>'amount')::numeric as amount
    from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) x
  loop
    if a.invoice_id is null or a.amount is null or a.amount <= 0 then
      raise exception 'each allocation needs an invoice and an amount above zero';
    end if;
    insert into public.payment_allocation (payment_id, invoice_id, amount)
    values (v_payment_id, a.invoice_id, a.amount);
    perform public.recompute_invoice_status(a.invoice_id);
    if p_actor is not null then
      insert into public.activity_log (actor_id, action, entity, entity_id)
      values (p_actor, 'payment_recorded', 'invoice', a.invoice_id);
    end if;
  end loop;

  if p_actor is not null then
    insert into public.activity_log (actor_id, action, entity, entity_id)
    values (p_actor, 'payment_recorded', 'payment', v_payment_id);
  end if;

  return v_payment_id;
end;
$$;

-- Void a payment (soft delete) and put every invoice it touched back to its true status.
create or replace function public.void_payment(p_payment_id uuid, p_actor uuid default null)
returns void
language plpgsql
as $$
declare
  r record;
begin
  update public.payment set voided_at = now(), voided_by = p_actor
  where id = p_payment_id and voided_at is null;
  if not found then
    return;
  end if;

  for r in select distinct invoice_id from public.payment_allocation where payment_id = p_payment_id
  loop
    perform public.recompute_invoice_status(r.invoice_id);
  end loop;

  if p_actor is not null then
    insert into public.activity_log (actor_id, action, entity, entity_id)
    values (p_actor, 'voided', 'payment', p_payment_id);
  end if;
end;
$$;

-- Fix a recorded payment's facts (Ravi typed a wrong date and could not correct it): date,
-- method, reference, notes, and filing are editable in one transaction, and every invoice
-- the payment touches gets its status re-derived, because a date change can move money
-- between settled and post-dated. The amount is NOT editable here: allocations hang off
-- it, so a wrong amount means void the payment and record it again.
create or replace function public.edit_payment(
  p_payment_id uuid,
  p_method text,
  p_paid_date date,
  p_reference text default null,
  p_notes text default null,
  p_confirmation_filing text default null,
  p_actor uuid default null
) returns void
language plpgsql
as $$
declare
  r record;
begin
  if p_paid_date is null then
    raise exception 'a paid date is required';
  end if;

  update public.payment
  set method = p_method,
      paid_date = p_paid_date,
      reference = nullif(p_reference, ''),
      notes = nullif(p_notes, ''),
      confirmation_filing = nullif(p_confirmation_filing, '')
  where id = p_payment_id and voided_at is null;
  if not found then
    raise exception 'payment not found or already voided';
  end if;

  for r in select distinct invoice_id from public.payment_allocation where payment_id = p_payment_id
  loop
    perform public.recompute_invoice_status(r.invoice_id);
  end loop;

  if p_actor is not null then
    insert into public.activity_log (actor_id, action, entity, entity_id)
    values (p_actor, 'payment_edited', 'payment', p_payment_id);
  end if;
end;
$$;

-- Flip post-dated invoices whose payment dates have arrived. Cheap; the payments screens
-- call it on load, so nothing needs a cron. Returns how many invoices were rechecked.
create or replace function public.reconcile_postdated()
returns integer
language plpgsql
as $$
declare
  r record;
  n integer := 0;
begin
  for r in select id from public.invoice where status = 'postdated' and voided_at is null
  loop
    perform public.recompute_invoice_status(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Backstop for legacy write paths (the Excel import inserts payment rows with invoice_id):
-- give those payments an allocation and a vendor automatically, and recompute the invoice.
create or replace function public.payment_autoallocate()
returns trigger
language plpgsql
as $$
begin
  if new.invoice_id is not null then
    insert into public.payment_allocation (payment_id, invoice_id, amount)
    select new.id, new.invoice_id, coalesce(new.amount, 0)
    where not exists (select 1 from public.payment_allocation a where a.payment_id = new.id);
    if new.vendor_id is null then
      update public.payment
      set vendor_id = (select vendor_id from public.invoice where id = new.invoice_id)
      where id = new.id;
    end if;
    perform public.recompute_invoice_status(new.invoice_id);
  end if;
  return new;
end;
$$;

drop trigger if exists payment_autoallocate on public.payment;
create trigger payment_autoallocate
  after insert on public.payment
  for each row execute function public.payment_autoallocate();

-- 6. Row-level security for the new table ----------------------------------------------

alter table public.payment_allocation enable row level security;

-- Match whichever mode this database is in: if the dev open policy exists on payment,
-- mirror it here so the demo keeps working. Enforced-auth databases get the real policy
-- from auth_setup.sql (rerun it after this file).
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment' and policyname = 'dev_all') then
    drop policy if exists dev_all on public.payment_allocation;
    create policy dev_all on public.payment_allocation for all using (true) with check (true);
  end if;
end $$;

-- 7. Workflow-sheet fields (owner's Departments & WorkFlow spec) -------------------------

-- Invoice: entry date (drives the HST-by-department financial-year report), freight as its
-- own line, and delivery state. Total owed = amount + freight + HST.
alter table public.invoice add column if not exists invoice_date date;
alter table public.invoice add column if not exists freight_charges numeric;
alter table public.invoice add column if not exists delivery_status text;
alter table public.invoice drop constraint if exists invoice_delivery_status_check;
alter table public.invoice add constraint invoice_delivery_status_check check (
  delivery_status is null or delivery_status in ('delivered','not_delivered')
);

-- Property Maintenance payouts: estimate number when the work was preplanned (else null),
-- repair vs upgrade, and a short description of the work. Null for merchandise invoices;
-- the UI shows them only when the vendor's category is Property Maintenance.
alter table public.invoice add column if not exists estimate_number text;
alter table public.invoice add column if not exists work_type text;
alter table public.invoice drop constraint if exists invoice_work_type_check;
alter table public.invoice add constraint invoice_work_type_check check (
  work_type is null or work_type in ('repair','upgrade')
);
alter table public.invoice add column if not exists work_description text;

-- Payment confirmation filing: digital (file attached or emailed) or physical (paper binder).
alter table public.payment add column if not exists confirmation_filing text;
alter table public.payment drop constraint if exists payment_confirmation_filing_check;
alter table public.payment add constraint payment_confirmation_filing_check check (
  confirmation_filing is null or confirmation_filing in ('digital','physical','both')
);

-- 7b. Post-dated invoices from the ledger import get the payment that makes them real.
-- The bookings sheet marks PDC invoices, but the old import wrote only the status; the new
-- engine derives postdated from a future-dated payment, so without one reconcile_postdated()
-- would flip these back to unpaid. Give each such invoice its post-dated cheque, dated on the
-- invoice due date (or tomorrow when no due date is on file). Idempotent: only invoices with
-- no allocations at all. The autoallocate trigger creates the allocation and recomputes.
insert into public.payment (invoice_id, vendor_id, amount, method, paid_date, notes)
select i.id, i.vendor_id,
       coalesce(i.amount, 0) + coalesce(i.freight_charges, 0) + coalesce(i.hst_amount, 0),
       'cheque',
       greatest(coalesce(i.due_date, (now() at time zone 'America/Toronto')::date + 1),
                (now() at time zone 'America/Toronto')::date + 1),
       'Post-dated per the bookings ledger'
from public.invoice i
where i.status = 'postdated'
  and i.voided_at is null
  and not exists (select 1 from public.payment_allocation a where a.invoice_id = i.id);

-- 8. Department-level categories ---------------------------------------------------------
-- The owner's payout category list. New categories are added per store where missing;
-- Clothing and Gifts become children of DryGoods & Lakeside so their vendors and history
-- stay attached while the top level matches the sheet:
--   DryGoods & Lakeside, Hardware, Grocery, Produce, Bakery, Meat, Chip Stand,
--   Checkouts, Property Maintenance, Payrolls & Taxes, Others.
-- Payrolls & Taxes is Ravi's ask (2026-07 voice round): payroll remittances and
-- incorporation taxes need their own payout category, recorded like any vendor payout
-- (vendors under it: e.g. "CRA - Payroll remittance", "CRA - Corporate tax").
do $$
declare
  s record;
  v_dry uuid;
begin
  for s in select id from public.store
  loop
    insert into public.department (store_id, name, parent_department_id, accent_color)
    select s.id, x.name, null, x.color
    from (values
      ('DryGoods & Lakeside', '#B7791F'),
      ('Checkouts', '#2F5FA8'),
      ('Property Maintenance', '#6B7480'),
      ('Payrolls & Taxes', '#4A5568'),
      ('Others', '#6B7480')
    ) as x(name, color)
    where not exists (
      select 1 from public.department d
      where d.store_id = s.id and lower(d.name) = lower(x.name)
    );

    select id into v_dry
    from public.department
    where store_id = s.id and lower(name) = 'drygoods & lakeside'
    limit 1;

    if v_dry is not null then
      update public.department
      set parent_department_id = v_dry
      where store_id = s.id
        and name in ('Clothing', 'Gifts')
        and id <> v_dry
        and (parent_department_id is null or parent_department_id <> v_dry);
    end if;
  end loop;
end $$;

