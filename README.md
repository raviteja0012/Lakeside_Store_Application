# Lakeside Dry Goods, Store Operations Platform

Phase 0 to 1 starter. A capture-first receiving app: drop a vendor invoice, a vision model extracts it, staff confirm one screen, and it posts to the department feed with author and time.

Stack: Next.js (App Router) plus Supabase (Postgres, Auth, Storage) plus Claude Sonnet vision.

## What is in this starter
- supabase/schema.sql, the v1 data model with audit and a licence table
- supabase/seed.sql, the departments and a few real vendors from the bookings sheet
- The capture loop at /capture (upload, extract, confirm, save) and the home feed
- /api/extract, the serverless vision call (handles images and PDF scans)
- The color system from the design spec wired into globals.css

## Setup
1. Create a Supabase project in a Canadian region (ca-central, Toronto).
2. In the Supabase SQL editor, run supabase/schema.sql, then supabase/seed.sql.
3. In Storage, create a public bucket named documents.
4. Copy .env.example to .env.local and fill in the Supabase URL and anon key, your Anthropic API key, and the model id.
5. Install and run:
   npm install
   npm run dev
6. Open http://localhost:3000. Click + Capture, drop a vendor invoice image or PDF, click Extract, fix any flagged field, then Save to feed.

## Deploy
Push to GitHub, import into Vercel, set the same environment variables, deploy.

## Before production
- The dev row-level security policies allow anonymous access so the demo runs without login. Replace them with Supabase Auth and per-role policies (staff, lead, manager, owner) before real use. See the comments in schema.sql.
- Move document storage to signed URLs if invoices contain anything sensitive.
- The confidence value is captured per line. Add a review threshold so low-confidence dollar fields require a human before they post.

## Next
Phase 2 adds pricing and inventory. Phase 3 adds orders, payments, and due-date alerts. See lakeside_build_spec_v2.md for the full sequence.
