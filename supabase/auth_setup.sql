-- Robinsons General Store, production auth and row-level security cutover.
--
-- WHAT THIS IS
-- This file is the deliberate production cutover. It links Supabase Auth to app_user and
-- replaces the dev "anonymous full access" policies with authenticated, per-store, per-role
-- policies. The owner runs it once, after enabling Email auth and creating the owner account.
-- It is intentionally NOT part of schema.sql so the demo keeps its open dev policies until
-- you choose to cut over. schema.sql still ships the dev_all DO-block for the demo.
--
-- ORDER OF OPERATIONS (see RUNBOOK.md "Turn on login"):
--   1. Enable Email auth in Supabase (Authentication, Providers, Email). No public sign-up.
--   2. Create one account per member (Authentication, Users, Add user), each with the SAME email
--      as its app_user row. The demo emails are owner@/manager@/staff@/lead@robinsons.demo.
--   3. Run this whole file in the SQL editor. Section 4 links every account to its app_user row
--      automatically, by email. Re-run it any time you add more accounts (it is idempotent).
--   4. Set NEXT_PUBLIC_REQUIRE_AUTH=true in Vercel and redeploy.
--
-- TEST BEFORE TRUSTING: sign in as one owner and one staff and confirm staff cannot read
-- another store's rows and cannot see costs. RLS is only as good as its test.
--
-- This script is idempotent: re-running it drops and recreates the policies and functions.

-- 1. Link auth.users to app_user. Nullable so existing demo rows stay valid until linked.
alter table public.app_user
  add column if not exists auth_id uuid unique references auth.users(id);

-- 1a. The email used to match a Supabase Auth account to its app_user row. Added defensively so
-- this script also works on a database created before email was part of schema.sql.
alter table public.app_user
  add column if not exists email text;

-- 1b. Demo email backfill. Sets the known demo emails on the seeded members only where the email
-- is still null, so auto-linking (section 4) works even if seed.sql was loaded before emails were
-- added. Harmless on a fresh seed (the emails already match) and safe to keep: it never overwrites.
update public.app_user set email = 'owner@robinsons.demo'   where full_name = 'Ravi Kiran'   and email is null;
update public.app_user set email = 'manager@robinsons.demo' where full_name = 'Demo Manager' and email is null;
update public.app_user set email = 'staff@robinsons.demo'   where full_name = 'Demo Staff'    and email is null;
update public.app_user set email = 'lead@robinsons.demo'    where full_name = 'Outpost Lead'  and email is null;

-- 2. Helper functions in a dedicated, safe schema (not public, so they are not exposed as
-- PostgREST RPC by default). They are SECURITY DEFINER and STABLE with a pinned search_path.
-- SECURITY DEFINER lets them read app_user without being subject to RLS, which both avoids
-- recursive policy evaluation (a policy on app_user that needs to read app_user) and keeps
-- the lookup cheap. They key off auth.uid(), the id of the currently signed-in auth user.
create schema if not exists app_auth;

-- The app_user row for the current auth user, or no row when unauthenticated or unlinked.
create or replace function app_auth.app_member()
returns public.app_user
language sql
stable
security definer
set search_path = public
as $$
  select u.* from public.app_user u where u.auth_id = auth.uid() limit 1;
$$;

-- The current member's store id, or null when unauthenticated or unlinked. A null compared
-- to any store_id is NULL (not true), so every per-store policy denies by default. Safe.
create or replace function app_auth.my_store_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select store_id from public.app_user where auth_id = auth.uid() limit 1;
$$;

-- The current member's role, or null when unauthenticated or unlinked.
create or replace function app_auth.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.app_user where auth_id = auth.uid() limit 1;
$$;

-- Let signed-in users execute the helpers. anon keeps execute too so the helpers simply
-- return null/no-row for an unauthenticated caller rather than erroring.
grant usage on schema app_auth to authenticated, anon;
grant execute on function app_auth.app_member() to authenticated, anon;
grant execute on function app_auth.my_store_id() to authenticated, anon;
grant execute on function app_auth.my_role() to authenticated, anon;

-- 3. Replace the dev_all policies with authenticated, per-store, per-role policies.
-- Every table keeps RLS enabled. We drop dev_all first so anonymous full access is gone.
-- A table left with RLS on and no policy denies all access by design; we cover every table.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists dev_all on public.%I;', t);
  end loop;
end $$;

-- 3a. Store-scoped tables with a direct store_id column. A signed-in member may select and
-- write rows whose store_id equals their store. USING gates reads and the pre-image of
-- writes; WITH CHECK gates the post-image so a row cannot be moved to another store.
do $$
declare t text;
begin
  foreach t in array array[
    'vendor','item','receiving_event','purchase_order','invoice',
    'inventory_count','knowledge_note','maintenance_asset','maintenance_task',
    'insurance_policy','employee','licence'
  ]
  loop
    execute format($f$
      create policy member_store_rw on public.%I
        for all
        to authenticated
        using (store_id = app_auth.my_store_id())
        with check (store_id = app_auth.my_store_id());
    $f$, t);
  end loop;
end $$;

-- 3b. Child tables with no store_id of their own. Scope through the parent so a member only
-- reaches rows that roll up to their store. Membership is enforced at the parent.

-- receiving_line via its receiving_event.
create policy member_store_rw on public.receiving_line
  for all
  to authenticated
  using (exists (
    select 1 from public.receiving_event e
    where e.id = receiving_line.receiving_event_id and e.store_id = app_auth.my_store_id()))
  with check (exists (
    select 1 from public.receiving_event e
    where e.id = receiving_line.receiving_event_id and e.store_id = app_auth.my_store_id()));

-- payment via its invoice.
create policy member_store_rw on public.payment
  for all
  to authenticated
  using (exists (
    select 1 from public.invoice i
    where i.id = payment.invoice_id and i.store_id = app_auth.my_store_id()))
  with check (exists (
    select 1 from public.invoice i
    where i.id = payment.invoice_id and i.store_id = app_auth.my_store_id()));

-- inventory_count_line via its inventory_count.
create policy member_store_rw on public.inventory_count_line
  for all
  to authenticated
  using (exists (
    select 1 from public.inventory_count c
    where c.id = inventory_count_line.inventory_count_id and c.store_id = app_auth.my_store_id()))
  with check (exists (
    select 1 from public.inventory_count c
    where c.id = inventory_count_line.inventory_count_id and c.store_id = app_auth.my_store_id()));

-- pay_rate via its employee. PIPEDA personal data, kept inside the member's store.
create policy member_store_rw on public.pay_rate
  for all
  to authenticated
  using (exists (
    select 1 from public.employee e
    where e.id = pay_rate.employee_id and e.store_id = app_auth.my_store_id()))
  with check (exists (
    select 1 from public.employee e
    where e.id = pay_rate.employee_id and e.store_id = app_auth.my_store_id()));

-- shift via its employee. PIPEDA personal data, kept inside the member's store.
create policy member_store_rw on public.shift
  for all
  to authenticated
  using (exists (
    select 1 from public.employee e
    where e.id = shift.employee_id and e.store_id = app_auth.my_store_id()))
  with check (exists (
    select 1 from public.employee e
    where e.id = shift.employee_id and e.store_id = app_auth.my_store_id()));

-- retail_price via its item. Not named in the cutover list, but RLS-on with no policy would
-- deny it for everyone, so scope it through item like the other store-scoped children.
create policy member_store_rw on public.retail_price
  for all
  to authenticated
  using (exists (
    select 1 from public.item it
    where it.id = retail_price.item_id and it.store_id = app_auth.my_store_id()))
  with check (exists (
    select 1 from public.item it
    where it.id = retail_price.item_id and it.store_id = app_auth.my_store_id()));

-- 3c. Reference and shared tables.

-- department: readable by any member of the store. Writes scoped to the member's store
-- (the cutover only restricts app_user and store writes to manager/owner; department edits
-- stay open to members of the store, but never cross-store).
create policy member_store_read on public.department
  for select
  to authenticated
  using (store_id = app_auth.my_store_id());
create policy member_store_write on public.department
  for all
  to authenticated
  using (store_id = app_auth.my_store_id())
  with check (store_id = app_auth.my_store_id());

-- store: readable by its members. Writes restricted to managers and owners of that store.
create policy member_store_read on public.store
  for select
  to authenticated
  using (id = app_auth.my_store_id());
create policy manager_store_write on public.store
  for all
  to authenticated
  using (id = app_auth.my_store_id() and app_auth.my_role() in ('manager','owner'))
  with check (id = app_auth.my_store_id() and app_auth.my_role() in ('manager','owner'));

-- app_user: every member can read their store's roster. Only managers and owners of the
-- store may insert, update, or delete members, and only within their own store. NOTE: the
-- first owner's app_user.auth_id is set by the auto-link in section 4, which runs as the table
-- owner in the SQL editor and bypasses RLS, so it bootstraps access before anyone is linked.
create policy member_store_read on public.app_user
  for select
  to authenticated
  using (store_id = app_auth.my_store_id());
create policy manager_store_write on public.app_user
  for all
  to authenticated
  using (store_id = app_auth.my_store_id() and app_auth.my_role() in ('manager','owner'))
  with check (store_id = app_auth.my_store_id() and app_auth.my_role() in ('manager','owner'));

-- tax_rules: global reference data (province rates), readable by any signed-in member.
-- Conservative choice: writes restricted to managers and owners. The cutover spec only names
-- app_user and store for the manager/owner write limit, but the tax rate drives every total,
-- so we deny edits to staff and leads rather than over-expose. Adjust if a broader write is
-- wanted. (Noted in the PR.)
create policy member_read on public.tax_rules
  for select
  to authenticated
  using (true);
create policy manager_write on public.tax_rules
  for all
  to authenticated
  using (app_auth.my_role() in ('manager','owner'))
  with check (app_auth.my_role() in ('manager','owner'));

-- activity_log: the audit trail. activity_log has no store_id, only actor_id. A member may
-- read entries whose actor belongs to their store, and may insert only entries attributed to
-- themselves, so the log cannot be forged for another member or store. No update or delete
-- policy is defined, so the audit trail is append-only for members (the service role, used by
-- migrations and server jobs, still bypasses RLS).
create policy member_store_read on public.activity_log
  for select
  to authenticated
  using (exists (
    select 1 from public.app_user a
    where a.id = activity_log.actor_id and a.store_id = app_auth.my_store_id()));
create policy member_insert_self on public.activity_log
  for insert
  to authenticated
  with check (actor_id = (app_auth.app_member()).id);

-- 3d. Storage. Supabase enables row-level security on storage.objects, so uploads need a policy
-- or every capture fails with "new row violates row-level security policy". Drop the dev policy
-- that allowed the anon key to write, and allow only signed-in members to read and write the
-- `documents` bucket (invoice photos, payment confirmations). The bucket stays public-read so the
-- feed thumbnails still load; moving to signed URLs is the documented next hardening step.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "documents_dev_all" on storage.objects;
drop policy if exists "documents_auth_rw" on storage.objects;
create policy "documents_auth_rw" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');

-- 4. Link Supabase Auth accounts to app_user rows BY EMAIL. Run this AFTER you create each
-- account in Authentication, Users with the same email as the app_user row (the demo emails are
-- in section 1b and seed.sql). This runs as the table owner in the SQL editor, which bypasses
-- RLS, so it bootstraps access before anyone is linked. Idempotent: re-run it after adding more
-- accounts. Case-insensitive match. A member with no auth_id cannot sign in to any store's data
-- (every policy denies), which is the safe default.
update public.app_user u
  set auth_id = a.id
  from auth.users a
  where lower(a.email) = lower(u.email)
    and u.auth_id is distinct from a.id;

-- Verify the links took (every member you created an account for should show an auth_id):
--   select full_name, role, store_id, email, auth_id from public.app_user order by full_name;
--
-- Manual fallback, if you ever need to link one row by hand (e.g. an email that does not match):
--   select id, email from auth.users order by created_at desc;   -- find the auth user id
--   update public.app_user set auth_id = '<auth.users.id>' where full_name = 'Ravi Kiran';
