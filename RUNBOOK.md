# Go-live runbook

The app code is done and hosted-ready. A few setup steps remain, and they need your accounts and secrets, so only you can do them. Each is quick. Do not paste any secret into chat; they go straight into Supabase and Vercel.

## What each piece is
- Supabase: the database, file storage, and login. Holds vendors, orders, invoices, payments, knowledge notes, maintenance, HR, and the uploaded invoice photos. Pick a Canadian region (Toronto).
- Vercel: where the app runs, the public web address staff and the owner open. It runs the code from GitHub.
- Anthropic API key: lets the capture screen read an invoice photo into fields and powers Ask and the reorder summary.
- Resend (optional): sends the daily payment due-date alert email.

## Step 1, Anthropic key (about 2 minutes)
1. Go to console.anthropic.com, sign in.
2. API Keys, Create Key, copy it. Keep it for Step 3.
3. Note the current Sonnet model id from docs.claude.com (the `ANTHROPIC_MODEL` value).

## Step 2, Supabase (about 5 minutes)
1. supabase.com, New project. Region: Canada (Central), Toronto.
2. SQL Editor: paste the contents of `supabase/schema.sql`, Run. Then paste `supabase/seed.sql`, Run.
3. Storage: New bucket named exactly `documents`, set Public.
4. Project Settings, API: copy the Project URL and the `anon` public key. Keep for Step 3.
5. Confirm the load with this query:
   ```sql
   select 'stores' t, count(*) from store
   union all select 'vendors', count(*) from vendor
   union all select 'invoices', count(*) from invoice
   union all select 'knowledge', count(*) from knowledge_note
   union all select 'maintenance_tasks', count(*) from maintenance_task
   union all select 'employees', count(*) from employee;
   ```
   Expect stores 2, vendors 38, invoices 31, knowledge 10, maintenance_tasks 8, employees 3.
   (The second store, its 3 vendors, and the maintenance/HR rows are clearly marked illustrative in `seed.sql`.)

## Step 3, Resend for due-date alerts (optional, about 5 minutes)
The daily payment alert emails a summary of invoices overdue or due within 7 days. Skip this and the rest of the app still works; `/api/alerts` just reports that email is off.
1. resend.com, sign up. Add and verify your sending domain (or use a verified test sender).
2. API Keys, Create API Key, copy it for Step 4 (`RESEND_API_KEY`).
3. Decide the from address (a verified sender, `ALERT_EMAIL_FROM`) and who receives alerts (`ALERT_EMAIL_TO`, comma-separate for several).
4. Make up a long random string for `CRON_SECRET`. The daily cron sends it as the `x-cron-secret` header so only the cron can trigger the email.

## Step 4, Vercel (about 5 minutes)
1. vercel.com/new, connect GitHub, import `raviteja0012/Lakeside_Store_Application`.
2. Pick the branch `claude/great-johnson-CFSbi` (or `main` after the PR is merged).
3. Environment Variables, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
   - `NEXT_PUBLIC_REQUIRE_AUTH` = leave unset/false for demo, true only after the auth cutover
   - `ANTHROPIC_API_KEY` = your Anthropic key
   - `ANTHROPIC_MODEL` = current Sonnet id
   - `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO`, `CRON_SECRET` (only if you did Step 3)
4. Deploy. After import, every push to the branch redeploys automatically.
5. The daily alert cron is in `vercel.json` (runs `/api/alerts` once a day). Vercel registers it on deploy. To test it now, open `/api/alerts` with the `x-cron-secret` header set to your `CRON_SECRET`.
   - The schedule `0 13 * * *` is in UTC (Vercel crons always are), so it fires at 9 AM EDT / 8 AM EST.

## Step 5, tell me
Send me "done" plus the Vercel URL (not the keys). I will check the feed, dashboard, vendors, overdue, knowledge, price signs, maintenance, compliance, HR, and reports, then we test one real invoice through capture.

## Go to enforced auth (production)
The app ships in demo mode: open access, no login, the "Acting as" picker decides who a write
is attributed to. That is the default and stays on until you deliberately cut over. The switch
is the env var `NEXT_PUBLIC_REQUIRE_AUTH`. Do these steps in order. Until the last step, the
live app keeps working in demo mode.

1. Enable Email auth. Supabase, Authentication, Providers, turn on Email. Leave sign-ups off
   (there is no public sign-up; you create every account). Authentication, Users, Add user:
   create the owner account with a real email and a password. Repeat for each member later.
2. Run the cutover SQL. SQL Editor, paste the contents of `supabase/auth_setup.sql`, Run. This
   adds `app_user.auth_id`, creates the role and store helper functions, and replaces the dev
   open policies with per-store, per-role policies. It does not touch `schema.sql`.
3. Link the owner account to their app_user row. In the SQL editor find the auth user id with
   `select id, email from auth.users order by created_at desc;` then run the template at the
   bottom of `auth_setup.sql` to set `auth_id` on the owner's app_user row (the seed owner is
   Ravi Kiran). The SQL editor runs as the table owner and bypasses the new policies, so this
   bootstrap works before anyone is linked. Repeat for each member: create the account, copy
   its `auth.users.id`, set `auth_id` on their app_user row. A member with no `auth_id` cannot
   sign in to any data, which is the safe default.
4. Test with real accounts BEFORE trusting it. Sign in as the owner and confirm full access.
   Sign in as a staff member and confirm they cannot see costs, order or invoice amounts,
   payments, or totals, and cannot read another store's rows. Do not skip this; the policies
   are only as good as their test.
5. Flip the switch. Vercel, project, Settings, Environment Variables: set
   `NEXT_PUBLIC_REQUIRE_AUTH` = `true`. Redeploy (it is a build-time public var, so a redeploy
   is required). Now `/login` is required and the per-store, per-role policies are live.

To roll back to demo mode: set `NEXT_PUBLIC_REQUIRE_AUTH` back to unset or `false` and redeploy.
That restores open access in the app. The database policies from `auth_setup.sql` stay in
place, so reads and writes still require a linked session; flip the var only while the open dev
policies are also restored if you need full anonymous access again.

## Before real staff use
- Move document storage to signed URLs if invoices hold anything sensitive.
- Column-level cost hiding is enforced in the UI today, with row-level DB policies from
  `auth_setup.sql`. Full column-level DB privileges (revoking cost columns from the staff role
  in Postgres) are a later hardening step.
