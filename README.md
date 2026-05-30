# Robinsons General Store, Store Operations Platform

Capture-first receiving app for Robinsons General Store, a Canadian general store in Dorset, Ontario. Staff drop a vendor invoice, a vision model extracts it, they confirm one screen, and it posts to the department feed with author and time. The owner sees everything remotely.

Stack: Next.js App Router on Vercel, Supabase Postgres (database, auth, storage, pgvector) in a Canadian region, Claude Sonnet vision for reading invoices.

## Documentation
- docs/STATUS.md, the current status: what is built, what is left, and what to do before real staff use. Start here.
- RUNBOOK.md, the go-live steps and every environment variable.
- docs/ARCHITECTURE.md, the architecture, the data flow, and how we work in Claude Code.
- docs/DATA_SOURCES.md, the Google Drive store files and how each maps to the app.
- robinsons_store_build_spec.md, the full plan with evidence, schema, AI layer, Canada rules, phases, and caveats.
- .claude/skills/robinsons-store, the project skill that Claude Code loads automatically, with data-model and design-tokens references.

## Quick start in Claude Code
1. Open this folder in Claude Code. The skill loads automatically.
2. Have ready: Supabase URL and anon key, Anthropic API key, the current Sonnet model id.
3. Paste this as your first message, or follow the manual steps below:

```
Read .claude/skills/robinsons-store, robinsons_store_build_spec.md, and docs/ARCHITECTURE.md. Then get the repo running (install, create .env.local from .env.example, start the dev server), walk me through the Supabase setup (create the project in a Canadian region, run supabase/schema.sql then supabase/seed.sql, create a public Storage bucket named documents), and once it runs we test the capture loop with a real invoice from source_data. Follow the skill's output rules and do not change the locked architecture.
```

## Manual setup
1. Supabase: create a project in ca-central (Toronto). In the SQL editor run supabase/schema.sql, then supabase/seed.sql. In Storage create a public bucket named documents.
2. Copy .env.example to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ANTHROPIC_API_KEY, and ANTHROPIC_MODEL (the current Sonnet model id from docs.claude.com).
3. npm install, then npm run dev. Open http://localhost:3000, click + Capture, drop an Orgill or ABBOT invoice, Extract, fix any flagged field, Save to feed.
4. Deploy: import the repo at vercel.com/new, set the same environment variables, deploy. Use Node 20.

## Before production
- The dev row-level security allows anonymous access so the demo runs without login. Replace it with Supabase Auth and per-role policies (staff, lead, manager, owner) before real use. See the comments in supabase/schema.sql.
- Move document storage to signed URLs if invoices contain anything sensitive.
- The confidence value is captured per line. Add a review threshold so low-confidence dollar fields require a human before they post.

## Phases
Phase 1 capture and receiving is in this starter. Next: Phase 2 pricing and inventory, Phase 3 vendor ledger and payments with due-date alerts, Phase 4 manager dashboard. See docs/ARCHITECTURE.md and the build spec.
