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
  created_at timestamptz default now()
);

create table app_user (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  full_name text not null,
  role text not null check (role in ('staff','lead','manager','owner')),
  created_at timestamptz default now()
);

create table vendor (
  id uuid primary key default gen_random_uuid(),
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
  department_id uuid references department(id),
  vendor_id uuid references vendor(id),
  vendor_name text,                 -- raw extracted vendor name before matching
  received_date date,
  source_file_path text,            -- the original invoice or photo in storage
  status text default 'confirmed' check (status in ('pending_document','parsed','validation_error','awaiting_arrival','partial_received','fully_received','disputed','confirmed','closed','cancelled')),
  discrepancy_ack boolean default false,  -- set true when a human acknowledged an order-vs-invoiced difference
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

create table invoice (
  id uuid primary key default gen_random_uuid(),
  receiving_event_id uuid references receiving_event(id),
  vendor_id uuid references vendor(id),
  invoice_number text,
  amount numeric,
  hst_amount numeric,
  terms text,
  due_date date,
  status text default 'unpaid' check (status in ('unpaid','paid','postdated')),
  source_file_path text,
  created_at timestamptz default now()
);

create table payment (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoice(id),
  amount numeric,
  method text check (method in ('cheque','cc','etransfer','cash')),
  paid_date date,
  confirmation_file_path text,
  created_by uuid references app_user(id),
  created_at timestamptz default now()
);

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
  counted_qty numeric
);

create table purchase_order (
  id uuid primary key default gen_random_uuid(),
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
