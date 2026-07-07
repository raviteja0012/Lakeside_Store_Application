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

-- 4. The hard low-confidence gate. The capture screen stores an explicit acknowledgement when
-- a person confirms the amber (low-confidence) lines, and this trigger refuses to post a
-- low-confidence dollar line without it, so the human-in-the-loop rule holds at the database.
alter table public.receiving_event add column if not exists low_confidence_ack boolean default false;

-- 4a. The capture screen's free-text Notes, previously collected but never stored.
alter table public.receiving_event add column if not exists notes text;

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
