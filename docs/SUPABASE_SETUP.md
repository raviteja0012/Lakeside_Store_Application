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

## These run themselves now

Since 2026-07-31 a merge to main applies these scripts automatically
(`.github/workflows/migrate.yml`), so a merged migration no longer waits on somebody
opening the SQL editor. The order comes from `supabase/run-order.txt`, which is the single
list both this page and the workflow follow.

What is automated is only the APPLYING. A schema change still needs a person: `supabase/**`
never auto-merges, so a human reads the SQL and merges the pull request exactly as before.
The judgement stays human; the typing does not.

To switch it on, add the `SUPABASE_DB_URL` repository secret described in the next section.
Without it the workflow exits quietly and the list below stays a manual job.

`auth_setup.sql` is deliberately NOT automated. It swaps the open demo policies for locked
per-role ones, and running it while enforced login is off would lock everyone out of a
working store. That one stays a deliberate step, described at the end of this page.

## The live site will tell you which script is missing

If a ticket says the health check failed on something like "vendor columns present", the
failure now names the columns the database does not have and the one file that adds them,
for example "Run supabase/vendor_ordering_fields.sql". Find that file in the numbered list
below, run it and anything above it that has not been run, and the check passes on the next
deploy. Nothing is being diagnosed by hand: the deployed app compares itself against the
columns it needs and says which script closes the gap.
## The connection secret: one name, one source

Two separate things, and confusing them cost a day here, so they are stated apart:

**The NAME is `SUPABASE_DB_URL`.** Ours, not copied from anywhere. Exactly that, case
sensitive. For the dev database it is `SUPABASE_DB_URL_DEV`.

**The VALUE comes from Supabase**, never from Vercel. Vercel's Supabase integration does
hold the same connection string under `POSTGRES_URL_NON_POOLING`, but it is marked Sensitive
there, which means Vercel will not show it to you again after it is created. Going there
wastes a trip and puts the wrong name in your head.

Getting the value:

1. Supabase dashboard, your project, **Connect**, then **Direct, Connection string**.
2. Take the **Shared / session pooler** URI, port **5432**. It looks like:

       postgresql://postgres.<project-ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres

3. Replace `<password>` with the database password. If you never set one, Project Settings,
   Database, Reset database password. Nothing in the app reads that password, so resetting it
   cannot break the site.

Not the direct connection on `db.<ref>.supabase.co`: it resolves only over IPv6, and GitHub
runners have no IPv6 route, so it fails with a bare "network is unreachable" that reads like
an outage. Not the transaction pooler on 6543: it does not run every DDL statement reliably.
**Session pooler, port 5432. That is the only one that works.**

Where it goes:

    https://github.com/raviteja0012/Lakeside_Store_Application/settings/secrets/actions

It must be a **Repository secret on the Actions tab**. That page also has Codespaces and
Dependabot tabs and an Environment secrets section, and a secret in any of those is invisible
to the workflow. The symptom is not an error: the migration step reports `skipped` and the run
goes green, which looks exactly like nothing needing to be done.

The gate step prints the value's LENGTH, never the value. A length of 0 means the workflow
cannot see it under that name, whatever the settings page appears to show.

## Existing database: bring it current (2026-07 round)

Run in this order; skip nothing (each is safe to re-run):

1. `payments_v2.sql` — payments engine (allocations, statuses, record/void/EDIT payment,
   post-dated reconcile, PDC backfill), the method list, the confirmation-filing values
   including "both", and the payout categories including the new Payrolls & Taxes.
2. `credit_notes.sql` — the credit_note table (vendor credits for damage/returns).
3. `feedback.sql` — the Suggestions table (owner notes, screenshots, voice recordings).
4. `payout_fields.sql` — the SCRUM-9 field gaps: invoice.service_category and
   invoice.po_number, credit_note.credit_type.
5. `order_invoice_fields.sql` — the order and invoice fields the owner asked for on
   2026-07-27: invoice.tax_mode (how the invoice states its tax), invoice.delivered_date,
   invoice.delivery_comments, "partially delivered" as a delivery status,
   purchase_order.order_filing, and "in progress" / "approved" as order statuses. It also
   re-creates the status engine so a tax-included invoice is not charged its tax twice, and
   backfills tax_mode on every existing invoice from the HST figure already on file.
6. `filing_locations.sql` — where each confirmation is filed and, when it is digital, the
   link or path: invoice.invoice_filing, invoice.digital_file_location,
   purchase_order.digital_file_location, payment.digital_file_location. Asked for on
   2026-07-31 so "digital" stops meaning a file nobody can find again.
7. `vendor_ordering_fields.sql` — the vendor's ordering profile, asked for on 2026-07-31 and
   2026-08-05: vendor.minimum_order_amount with vendor.no_minimum_order (mutually exclusive,
   enforced by a check constraint rather than trusted to the form),
   vendor.summer_order_timeline, vendor.order_location plus order_location_other, and
   vendor.reorder_status with vendor.reorder_comments. Every column is optional, so the 130
   vendors already on file stay valid and blank until somebody edits them.
   **The vendor forms will not save until this has run**, because they write these columns.
8. `edit_delete.sql` — soft-delete columns and the inventory line notes (older databases
   only; harmless if already applied).
9. `auth_setup.sql` — ONLY if enforced login is on. Always re-run it LAST after any script
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
