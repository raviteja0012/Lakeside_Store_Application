-- Robinsons General Store, v1 schema
-- Run this first in the Supabase SQL editor, then seed.sql.
-- Money is stored as numeric in dollars for the demo. Move to integer cents before production.

create extension if not exists pgcrypto;

create table store (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_entity text,
  address text,
  created_at timestamptz default now()
);

create table department (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  name text not null,
  parent_department_id uuid references department(id),
  accent_color text,
  target_margin numeric,            -- default retail margin percent for the margin calculator
  created_at timestamptz default now()
);

create table app_user (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  full_name text not null,
  role text not null check (role in ('staff','lead','manager','owner')),
  email text unique,                -- the Supabase Auth account email; auth_setup.sql links auth_id by this
  created_at timestamptz default now()
);

create table vendor (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store: scope vendors to one store
  department_id uuid references department(id),
  name text not null,
  rep_name text,
  phone text,
  email text,
  products_we_carry text,
  default_terms text,
  status text default 'active' check (status in ('active','skip','discontinue','bankrupt')),
  notes text,
  created_at timestamptz default now()
);

create table item (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store
  department_id uuid references department(id),
  vendor_id uuid references vendor(id),
  sku text,
  name text not null,
  uom text,
  retail_price numeric,
  cost_price numeric,
  is_regulated boolean default false,
  created_at timestamptz default now()
);

create table receiving_event (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store
  department_id uuid references department(id),
  vendor_id uuid references vendor(id),
  vendor_name text,                 -- raw extracted vendor name before matching
  received_date date,
  notes text,                       -- free-text notes typed on the capture confirm screen
  source_file_path text,            -- the original invoice or photo in storage
  status text default 'confirmed' check (status in ('pending_document','parsed','validation_error','awaiting_arrival','partial_received','fully_received','disputed','confirmed','closed','cancelled')),
  discrepancy_ack boolean default false,  -- set true when a human acknowledged an order-vs-invoiced difference
  low_confidence_ack boolean default false, -- set true when a human confirmed the low-confidence (amber) lines
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

create table receiving_line (
  id uuid primary key default gen_random_uuid(),
  receiving_event_id uuid references receiving_event(id) on delete cascade,
  item_id uuid references item(id),
  description text,
  qty numeric,
  unit_cost numeric,
  retail_price_note numeric,        -- the price scribbled on the invoice
  confidence numeric                -- model confidence 0 to 1, low values get flagged
);

-- Database backstop for the human-in-the-loop rule on dollars: a line the model read with low
-- confidence and that carries a unit cost can only post when its receiving event records the
-- capture screen's explicit acknowledgement. The UI enforces this first; the trigger makes the
-- rule hold for any other write path too.
create or replace function public.enforce_line_confidence()
returns trigger
language plpgsql
as $$
begin
  if new.confidence is not null and new.confidence < 0.7 and new.unit_cost is not null then
    if not exists (
      select 1 from public.receiving_event e
      where e.id = new.receiving_event_id and e.low_confidence_ack
    ) then
      raise exception 'low-confidence dollar line needs the capture acknowledgement before it posts';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists receiving_line_confidence_gate on public.receiving_line;
create trigger receiving_line_confidence_gate
  before insert or update on public.receiving_line
  for each row execute function public.enforce_line_confidence();

create table invoice (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store
  receiving_event_id uuid references receiving_event(id),
  vendor_id uuid references vendor(id),
  invoice_number text,
  amount numeric,
  hst_amount numeric,
  terms text,
  due_date date,
  -- Derived by recompute_invoice_status from the payment allocations:
  -- unpaid -> partially_paid -> paid; postdated = covered only by future-dated payments.
  -- Overdue is computed from due_date in the UI, never stored.
  status text default 'unpaid' check (status in ('unpaid','partially_paid','paid','postdated')),
  source_file_path text,
  created_at timestamptz default now()
);

-- A payment belongs to a vendor. Which invoices it settles lives in payment_allocation,
-- so one cheque can cover several invoices (even across departments) and still reconcile
-- as one payment against the bank statement. invoice_id remains for legacy single-invoice
-- rows; the autoallocate trigger turns it into an allocation.
create table payment (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendor(id),
  invoice_id uuid references invoice(id),   -- legacy link, kept for old write paths
  amount numeric,
  -- The owner's locked method list; 'cc' stays valid for rows recorded before the card split.
  method text check (method in ('cash','cheque','cc_visa','cc_mastercard','cc_amex','cc_debit','etransfer','eft','other','cc')),
  paid_date date,                           -- a future date means post-dated: not settled until it arrives
  reference text,                           -- cheque number, e-transfer ref, card confirmation
  notes text,                               -- required by the UI when method = other
  confirmation_file_path text,
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

-- How a payment splits across invoices. A partial payment is an allocation smaller than
-- the invoice balance.
create table payment_allocation (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payment(id) on delete cascade,
  invoice_id uuid not null references invoice(id),
  amount numeric not null,
  created_at timestamptz default now()
);
create index payment_allocation_payment_idx on payment_allocation(payment_id);
create index payment_allocation_invoice_idx on payment_allocation(invoice_id);

-- Payments engine: one atomic path every screen records through. Bodies reference tables
-- created later in this file (activity_log); plpgsql resolves them at call time.

-- Derive one invoice's status from its allocations. paid_date in the future means the money
-- has not left yet (post-dated cheque). A null paid_date counts as settled (legacy imports).
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
  select coalesce(amount, 0) + coalesce(hst_amount, 0) into v_total
  from public.invoice where id = p_invoice_id;
  if not found then
    return;
  end if;

  select
    coalesce(sum(a.amount) filter (where p.paid_date is null or p.paid_date <= current_date), 0),
    coalesce(sum(a.amount) filter (where p.paid_date > current_date), 0)
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

-- Record a payment atomically: payment row, allocations, invoice statuses, audit entries.
-- p_allocations: jsonb array of {"invoice_id": uuid, "amount": number}. A payment with no
-- allocations is a deposit/prepayment and needs p_amount instead. Returns the payment id.
create or replace function public.record_payment(
  p_vendor_id uuid,
  p_method text,
  p_paid_date date,
  p_reference text default null,
  p_notes text default null,
  p_actor uuid default null,
  p_allocations jsonb default '[]'::jsonb,
  p_amount numeric default null
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

  insert into public.payment (vendor_id, amount, method, paid_date, reference, notes, created_by)
  values (p_vendor_id, v_total, p_method, p_paid_date, nullif(p_reference, ''), nullif(p_notes, ''), p_actor)
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

-- Flip post-dated invoices whose payment dates have arrived. The payments screens call it
-- on load, so nothing needs a cron.
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

-- Backstop for legacy write paths (seed data, the Excel import) that insert payment rows
-- with invoice_id: give them an allocation and a vendor automatically, and recompute.
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

create table retail_price (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references item(id),
  price numeric,
  effective_date date,
  source_file_path text,
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

create table inventory_count (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store
  department_id uuid references department(id),
  counted_date date,
  source_file_path text,
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

create table inventory_count_line (
  id uuid primary key default gen_random_uuid(),
  inventory_count_id uuid references inventory_count(id) on delete cascade,
  item_id uuid references item(id),
  counted_qty numeric,
  notes text                        -- movement flags (FAST/SLOW/DEAD) and overstock locations from imported sheets
);

create table purchase_order (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store
  vendor_id uuid references vendor(id),
  department_id uuid references department(id),
  season_year int,
  order_amount numeric,
  ship_date date,
  delivery_commit date,
  status text default 'draft' check (status in ('draft','ordered','confirmed','shipped','received','cancelled')),
  notes text,
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

create table knowledge_note (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),   -- multi-store
  department_id uuid references department(id),
  topic text,
  body text,
  tags text[],
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

-- Evidence-driven: the store sells regulated pesticides under an Ontario licence with a tracked expiry.
create table licence (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  name text not null,
  authority text,
  number text,
  holder text,
  expiry_date date,
  source_file_path text,
  created_at timestamptz default now()
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references app_user(id),
  action text,
  entity text,
  entity_id uuid,
  created_at timestamptz default now()
);

-- Tax rules keyed by province for portability. rate is the combined effective decimal.
-- The app only ever multiplies a subtotal by the Ontario rate; the other rows are reference data.
create table tax_rules (
  id uuid primary key default gen_random_uuid(),
  region text not null unique,
  rate numeric not null,            -- combined effective rate as a decimal, e.g. 0.13 for Ontario
  label text,                       -- e.g. "13% HST"
  note text,
  effective_date date,
  created_at timestamptz default now()
);

-- Property and Maintenance (Phase: later). Assets are the things we maintain (building,
-- refrigeration, equipment, grounds, safety) and the operating service accounts. Tasks are
-- the recurring and one-off jobs against them. The dev RLS DO-block below covers these too;
-- replace it with Supabase Auth plus per-role, per-store policies before production.
create table maintenance_asset (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  department_id uuid references department(id),
  name text not null,
  category text check (category in ('building','refrigeration','equipment','grounds','safety','other')),
  location text,
  notes text,
  created_at timestamptz default now()
);

create table maintenance_task (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  asset_id uuid references maintenance_asset(id),
  title text not null,
  detail text,
  due_date date,
  recurrence text default 'none' check (recurrence in ('none','daily','weekly','monthly','seasonal','annual')),
  status text default 'open' check (status in ('open','in_progress','done')),
  assigned_to uuid references app_user(id),
  completed_at timestamptz,
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

create table insurance_policy (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  name text not null,
  provider text,
  policy_number text,
  coverage text,
  premium numeric,
  renewal_date date,
  notes text,
  created_at timestamptz default now()
);

-- HR (Phase: later).
-- PRIVACY: employee, pay_rate, and shift hold PIPEDA personal data (names, contact details,
-- pay, and hours). PIPEDA requires consent for collection and use, employee access to their
-- own data, and reasonable security safeguards. Keep this data in the Canadian region, limit
-- who can read it, and replace the dev RLS DO-block below with Supabase Auth plus per-role
-- policies before production. Quebec Law 25 only applies if Quebec-resident data enters scope.
create table employee (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  department_id uuid references department(id),
  full_name text not null,
  role text,
  phone text,
  email text,
  hire_date date,
  status text default 'active' check (status in ('active','inactive')),
  notes text,
  created_at timestamptz default now()
);

-- Effective-dated pay rates: insert a new row when pay changes, keep the history.
create table pay_rate (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employee(id),
  rate numeric,
  unit text check (unit in ('hour','salary')),
  effective_date date,
  created_at timestamptz default now()
);

create table shift (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employee(id),
  department_id uuid references department(id),  -- the department this shift covers (staff float across departments)
  work_date date,
  start_time time,
  end_time time,
  notes text,
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

-- Soft delete (void). Transactions and records are kept for the audit trail and the six-year
-- tax history; "delete" in the app sets voided_at and voided_by and the row drops out of every
-- list and total (queries filter voided_at is null). Shifts are the exception: they are hard
-- deleted, so they get no void columns. Additive and idempotent, so this also runs as a migration.
do $$
declare t text;
begin
  foreach t in array array[
    'vendor','purchase_order','invoice','payment','receiving_event','knowledge_note',
    'inventory_count','maintenance_asset','maintenance_task','insurance_policy','licence',
    'employee','pay_rate'
  ]
  loop
    execute format('alter table public.%I add column if not exists voided_at timestamptz;', t);
    execute format('alter table public.%I add column if not exists voided_by uuid references public.app_user(id);', t);
  end loop;
end $$;

-- DEV ONLY row-level security.
-- These policies allow the anon key to read and write so the demo runs without login.
-- Replace every one of these with Supabase Auth plus per-role policies before production.
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists dev_all on public.%I;', t);
    execute format('create policy dev_all on public.%I for all using (true) with check (true);', t);
  end loop;
end $$;

-- DEV ONLY storage access for the captured documents (invoice photos, payment confirmations).
-- Supabase enables row-level security on storage.objects, so without a policy even the anon key
-- cannot upload and every capture fails with "new row violates row-level security policy".
-- This opens the `documents` bucket for the demo exactly like dev_all opens the public tables.
-- auth_setup.sql replaces this with an authenticated-only policy at the production cutover.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "documents_dev_all" on storage.objects;
create policy "documents_dev_all" on storage.objects
  for all
  to public
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');
