# Contributing and standards

How to work in this repo so changes stay consistent. The architecture is in docs/ARCHITECTURE.md, the live status and the before-production checklist are in docs/STATUS.md, setup is in RUNBOOK.md, and the locked conventions live in .claude/skills/robinsons-store.

## Run it
1. `npm install`
2. `cp .env.example .env.local` and fill in the Supabase and Anthropic values (see RUNBOOK.md).
3. `npm run dev`, then open http://localhost:3000.
- Build: `npm run build`. Lint: `npm run lint`. The app builds and degrades gracefully with blank env (it shows a connection card), so do not depend on env at build time.

## Locked architecture (do not change without a decision)
Next.js App Router on Vercel, Supabase Postgres in ca-central (Toronto), Claude via the Anthropic API. No Snowflake, Mulesoft, Redpanda, API gateway, or MCP governance at this scale; that is the deferred upgrade path for many stores.

## Coding conventions
- Database identifiers are snake_case. Application code is the existing TypeScript style.
- Every write records who and when: an `activity_log` row, and `created_by` where the table has it. Use the effective actor (`useEffectiveActor`), not a raw dropdown id, so it is correct in enforced-auth mode.
- Every store-scoped screen reads through `useActiveStore()` and filters by the active `store_id`; every insert stamps `store_id`.
- Money is `numeric` dollars in the demo (integer cents is the pre-production migration). Format all displayed money with `formatCAD()` from `src/lib/format.ts`. Compare dates with `todayISO()` / `daysOverdue()` / `dueBand()` (UTC-anchored, no DST drift).
- Hide cost and margin from the `staff` role with `canSeeMoney(role)` on any screen that renders unit cost, order or invoice amounts, payments, premiums, or pay. Retail (customer-facing) prices are not hidden.
- Color carries meaning: use the design tokens in `src/app/globals.css` and the `.chip-*` classes, one meaning per hue, status never by color alone. Labels above fields, WCAG AA.
- Prefer typed Supabase rows over `any` casts in new code.

## Writing rules (code comments, UI copy, commits, docs)
- No em dashes anywhere.
- No AI buzzwords (significantly, dramatically, meaningful, comprehensive, noticeably).
- Never invent or inflate store numbers. Use only real values from the bookings sheet, docs/DATA_SOURCES.md, or the owner. Mark illustrative seed data as illustrative.
- Human in the loop on every dollar field; confidence is captured per line for that reason.

## Branches, commits, pull requests
- Develop on a feature branch, not main. Pushing to main auto-deploys to Vercel; each pull request gets a preview.
- Commit messages are short imperative sentences (no em dash, no buzzwords).
- Open pull requests as drafts. CI (.github/workflows/ci.yml) runs `npm run lint` and `npm run build` on every push and pull request; keep both green (warnings are acceptable, errors are not).
- When a change adds tables or columns, the Supabase database must get the same update. For a fresh demo DB, run supabase/schema.sql then supabase/seed.sql; the cutover to enforced auth runs supabase/auth_setup.sql (see RUNBOOK.md).

## Tests
There is no automated test suite yet. The recommended next standard is Vitest unit tests for the pure helpers (`src/lib/format.ts`, `src/lib/auth.ts` including `canSeeMoney`, `src/lib/hr.ts`) plus the JSON parsing in `api/extract`, wired into CI after lint. Until then, verify by build, lint, and a manual pass of the changed screen.

## Before production
The full checklist is in docs/STATUS.md and README.md. In short: flip to enforced auth and test with one owner and one staff account; move documents to signed URLs; add a confidence threshold for dollar fields; set the Resend and cron secrets; confirm the operating address and the pesticide licence expiry; verify sales-tax against current CRA rules; and revoke cost columns from the staff role at the database for defense in depth.
