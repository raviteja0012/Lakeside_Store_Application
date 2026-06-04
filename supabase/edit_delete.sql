-- Migration: edit and delete support, plus the daily maintenance cadence.
-- Run this once on an existing database. schema.sql already includes all of it for fresh
-- installs, so you only need this if your database was created before these changes. Additive
-- and idempotent: safe to run more than once, no data is touched or removed.

-- 1. Void (soft delete) columns. "Delete" in the app sets voided_at and voided_by; the row then
-- drops out of every list and total (queries filter voided_at is null). The record is kept for
-- the audit trail and the six-year tax history. Shifts are hard deleted and get no columns here.
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

-- 2. Allow a 'daily' maintenance cadence so the department task filter can show daily duties.
alter table public.maintenance_task drop constraint if exists maintenance_task_recurrence_check;
alter table public.maintenance_task add constraint maintenance_task_recurrence_check
  check (recurrence in ('none','daily','weekly','monthly','seasonal','annual'));

-- 3. A shift's department. Staff float across departments through the week, so the department
-- belongs on the shift, not only on the employee. Lets the schedule import and the department
-- filter group shifts by the department they cover.
alter table public.shift add column if not exists department_id uuid references public.department(id);
