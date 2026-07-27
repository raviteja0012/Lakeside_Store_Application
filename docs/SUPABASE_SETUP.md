# Supabase setup: every script and the order to run them

One page for the owner side of the database. All scripts live in supabase/ and every one is
idempotent: running a script twice is safe, so when in doubt, run it again.

## Fresh install (a brand-new Supabase project)

Run in the SQL editor, in this order:

1. `schema.sql` — every table, the payments engine functions, RLS enabled with the open
   demo policies.
2. `seed.sql` — the demo store, departments (including Payrolls & Taxes), demo accounts.
3. (optional) `auth_setup.sql` — ONLY when turning on enforced login
   (NEXT_PUBLIC_REQUIRE_AUTH=true): replaces the open policies with per-store, per-role
   policies and links Supabase Auth accounts to app_user rows by email.

## Existing database: bring it current (2026-07 round)

Run in this order; skip nothing (each is safe to re-run):

1. `payments_v2.sql` — payments engine (allocations, statuses, record/void/EDIT payment,
   post-dated reconcile, PDC backfill), the method list, the confirmation-filing values
   including "both", and the payout categories including the new Payrolls & Taxes.
2. `credit_notes.sql` — the credit_note table (vendor credits for damage/returns).
3. `feedback.sql` — the Suggestions table (owner notes, screenshots, voice recordings).
4. `payout_fields.sql` — the SCRUM-9 field gaps: invoice.service_category and
   invoice.po_number, credit_note.credit_type.
5. `edit_delete.sql` — soft-delete columns and the inventory line notes (older databases
   only; harmless if already applied).
6. `auth_setup.sql` — ONLY if enforced login is on. Always re-run it LAST after any script
   above, because it (re)applies the per-store policies to every table including new ones.

## What each remaining file is

- `auth_setup.sql` — the enforced-auth policy set (per-store, per-role; app_auth helpers).
- `storage.sql` (if present) / bucket setup — the documents bucket used by Capture and by
  Suggestions attachments (paths under feedback/).

## After running scripts

- Vercel env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ANTHROPIC_API_KEY
  (AI features), ANTHROPIC_MODEL (optional; defaults to claude-sonnet-5),
  NEXT_PUBLIC_REQUIRE_AUTH ("true" for enforced login), SUPABASE_SERVICE_ROLE_KEY (imports
  in demo mode), plus Resend/CRON values if the daily email is wanted.
- Redeploy after env changes; NEXT_PUBLIC_ values are baked at build time.
