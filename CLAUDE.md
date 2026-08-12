# Robinson's General Store: working context

Next.js (App Router, TypeScript) on Vercel ("robinsons-store", robinsons-store.vercel.app)
with Supabase Postgres/Auth/Storage (Toronto region) and the Anthropic API for extraction,
ask, reorder, and feedback triage. Non-technical owner; treat plain words in the UI as a
feature.

Read before building:
- .claude/skills/robinsons-store/SKILL.md — the invariants; follow them on every change.
- docs/README.md — the index to all eighteen docs and which one to open.
- docs/REQUIREMENTS.md — the living requirements ledger (asks, states, open items).
- docs/PLATFORM.md — every service and plan in use, what is adopted and what is declined
  and why. Carries two open risks: the Vercel plan does not license commercial use, and
  Supabase Free takes no backups. Check it before adding any service.
- docs/STATUS.md and docs/VERIFICATION.md — build state and sign-off; update both in the
  same PR as the work.
- docs/OWNER_NOTES.md — the owner's feedback verbatim (Telugu translated), round by round.
- docs/SUPABASE_SETUP.md — every SQL script and its run order.
- docs/LOOP_ENGINEERING.md — how the automation builds and ships this repo, and why each
  limit exists. Read before changing anything under .github/ or .claude/.

Hard rules:
- Payments only through the engine RPCs (record_payment / void_payment / edit_payment /
  reconcile_postdated). Post-dated is a future-dated cheque, never a method.
- Store scoping + RLS on everything new (schema.sql AND auth_setup.sql 3a AND feedback-style
  migration for live databases). Money fails closed (canSeeMoney). Soft voids only.
- Builds must pass with blank env. Gates: npx tsc --noEmit, npm run build, npm run lint.
- AI routes: grounded prompts, plain-text output (src/lib/aiText.ts strip), low temperature,
  default model claude-sonnet-5 (ANTHROPIC_MODEL overrides).
- No em dashes in user-facing copy. Calm canvas; color = status only.
