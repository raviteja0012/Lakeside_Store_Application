# Go-live runbook

The app code is done and hosted-ready. Three setup steps remain, and they need your accounts and secrets, so only you can do them. Each is quick. Do not paste any secret into chat; they go straight into Supabase and Vercel.

## What each piece is
- Supabase: the database, file storage, and login. Holds vendors, orders, invoices, payments, knowledge notes, and the uploaded invoice photos. Pick a Canadian region (Toronto).
- Vercel: where the app runs, the public web address staff and the owner open. It runs the code from GitHub.
- Anthropic API key: lets the capture screen read an invoice photo into fields.

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
   select 'vendors' t, count(*) from vendor
   union all select 'invoices', count(*) from invoice
   union all select 'knowledge', count(*) from knowledge_note;
   ```
   Expect vendors 35, invoices 29, knowledge 9.

## Step 3, Vercel (about 5 minutes)
1. vercel.com/new, connect GitHub, import `raviteja0012/Lakeside_Store_Application`.
2. Pick the branch `claude/great-johnson-CFSbi` (or `main` after the PR is merged).
3. Environment Variables, add four:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
   - `ANTHROPIC_API_KEY` = your Anthropic key
   - `ANTHROPIC_MODEL` = current Sonnet id
4. Deploy. After import, every push to the branch redeploys automatically.

## Step 4, tell me
Send me "done" plus the Vercel URL (not the keys). I will check the feed, dashboard, vendors, overdue, knowledge, and price signs, then we test one real invoice through capture.

## Before real staff use
- Replace the dev row-level security in `supabase/schema.sql` with Supabase Auth and per-role policies (staff, lead, manager, owner).
- Move document storage to signed URLs if invoices hold anything sensitive.
