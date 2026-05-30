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
   - `ANTHROPIC_API_KEY` = your Anthropic key
   - `ANTHROPIC_MODEL` = current Sonnet id
   - `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO`, `CRON_SECRET` (only if you did Step 3)
4. Deploy. After import, every push to the branch redeploys automatically.
5. The daily alert cron is in `vercel.json` (runs `/api/alerts` once a day). Vercel registers it on deploy. To test it now, open `/api/alerts` with the `x-cron-secret` header set to your `CRON_SECRET`.

## Step 5, tell me
Send me "done" plus the Vercel URL (not the keys). I will check the feed, dashboard, vendors, overdue, knowledge, price signs, maintenance, compliance, HR, and reports, then we test one real invoice through capture.

## Before real staff use
- Replace the dev row-level security in `supabase/schema.sql` with Supabase Auth and per-role policies (staff, lead, manager, owner).
- Move document storage to signed URLs if invoices hold anything sensitive.
