-- Vendor ordering fields, 2026-08-06 (SCRUM-9, the owner's comments of 31 July and 5 August).
-- Run once in the Supabase SQL editor. Idempotent: safe to run again.
--
-- Four things the buyer needs in front of them when placing a seasonal order, which today
-- live in somebody's head or in the margin of last year's sheet:
--
--   minimum_order_amount / no_minimum_order   what this vendor will not go below
--   summer_order_timeline                     when to place the summer order, in the
--                                             buyer's own words ("Before mid-January")
--   order_location                            where orders get placed: gift show, email,
--                                             rep visit, and so on. More than one applies
--   reorder_status / reorder_comments         did we have to reorder this year, which is
--                                             the clearest signal a line is selling
--
-- Every one is optional. Existing vendors stay valid and blank until somebody edits them,
-- which matters: there are 130 vendors already on file and nobody is going to backfill
-- them in one sitting.

-- Minimum order -----------------------------------------------------------------------
-- The amount and the "no minimum" flag are mutually exclusive, and the check enforces it
-- rather than trusting the form: a vendor row that claims both is not a state anyone can
-- act on.
alter table public.vendor add column if not exists minimum_order_amount numeric;
alter table public.vendor add column if not exists no_minimum_order boolean not null default false;
alter table public.vendor drop constraint if exists vendor_minimum_order_check;
alter table public.vendor add constraint vendor_minimum_order_check check (
  not (no_minimum_order and minimum_order_amount is not null)
  and (minimum_order_amount is null or minimum_order_amount > 0)
);

-- When to order -----------------------------------------------------------------------
-- Free text on purpose. The owner listed six real examples and no two share a shape
-- ("September", "Before mid-January", "Order at the January Gift Show"). A dropdown would
-- lose the one that matters.
alter table public.vendor add column if not exists summer_order_timeline text;

-- Where orders are placed --------------------------------------------------------------
-- An array because more than one is normal: a rep visits AND you confirm by email. Values
-- are checked in the app rather than by a constraint, because "Other" carries free text,
-- which lives in its own column so the array stays a clean list of known options.
alter table public.vendor add column if not exists order_location text[];
alter table public.vendor add column if not exists order_location_other text;

-- Did we reorder this year -------------------------------------------------------------
alter table public.vendor add column if not exists reorder_status text;
alter table public.vendor drop constraint if exists vendor_reorder_status_check;
alter table public.vendor add constraint vendor_reorder_status_check
  check (reorder_status is null or reorder_status in ('reordered', 'no_reorder'));

alter table public.vendor add column if not exists reorder_comments text;
