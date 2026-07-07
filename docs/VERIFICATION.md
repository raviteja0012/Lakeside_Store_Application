# Verification and sign-off record

The rule that prevents rework: a feature is "done" only when it has a row here. A row means it was verified at the named commit, by the named method, and does not need re-checking unless its files change again. When later work touches an area, re-verify only that area and update its row; everything else stands.

How things get verified in this project:
- Machine gates, every commit: `npx tsc --noEmit`, `npm run build` with blank env, `npm run lint`. A commit does not land red.
- Invariant review, every feature: the seven invariants in the project skill (store scoping, money gating, actor integrity, audit logging, human-in-the-loop on dollars, RLS coverage for new tables, blank-env build). Checked per screen during the work, recorded here.
- Owner sign-off: the owner uses the deployed preview or production and confirms the behavior. Until then a row says "verified, awaiting owner".

Where the record lives:
- This file: the per-area sign-off table below.
- docs/STATUS.md: the current state and what is left, updated in the same PR as the work.
- Pull requests on GitHub: the change-by-change record with verification notes in each description. PR #8 is the current one.
- activity_log in the database: the runtime audit of who did what in the app itself.

## Sign-off table

| Area | Verified at | Method | Status |
|---|---|---|---|
| Schema, seed, real bookings ledger (125 vendors) | ad89a59 (main) | Generator self-checks against the sheet's printed totals; loaded and used in production | Owner signed off (in production) |
| Capture, extract, confirm, save; feed; vendors; overdue; inventory; knowledge; ask; price signs; reports; reorder; maintenance; compliance; HR; schedule | main | Machine gates; invariant review; owner has used them on the live site | Owner signed off (in production) |
| Auth modes, per-store per-role RLS, Team page, in-app importer | dfef032 (main) | Machine gates; RLS policies reviewed table by table against auth_setup.sql | Owner signed off (in production) |
| Role-based home, command dashboard, notification bell, View as | 31b081a (PR #8) | Machine gates; invariant review (money gating on every KPI, store scoping on every query) | Verified, awaiting owner |
| Edit and delete on every data-entry screen; voided rows excluded everywhere | e042f3a (PR #8) | Machine gates; four independent agent passes each confirmed gating (owner and manager only), confirm-before-delete, audit rows, and voided_at filters per screen | Verified, awaiting owner; requires edit_delete.sql before deploy |
| Importer auto-detect (bookings vs weekly schedule), idempotent loads | e042f3a (PR #8) | Machine gates; dedupe keys reviewed (vendor name; employee plus date plus times) | Verified, awaiting owner |
| Redesign: app shell, navigation, design system, Today homes | de8459f, fe03392 (PR #8) | Machine gates; class-contract check (all existing class names kept); print rules re-checked for price signs | Verified, awaiting owner |
| Screen consistency pass and phone-first capture | e28828a, 7f46721, 27e1938, 7aa36d3 (PR #8) | Machine gates per batch; each agent confirmed presentation-only diffs with queries, gating, and handlers untouched | Verified, awaiting owner |
| edit_delete.sql completeness vs code | f30bc64 (PR #8) | Audited: the 13 tables with voidRow calls equal the 13 the migration adds voided_at/voided_by to; shift.department_id and the daily cadence covered; no read filters voided_at on shift, department, or any child table; migration is additive and idempotent | Verified; merge is safe once the owner runs it |
| Signed document URLs (private bucket, expiring links) | PR #8, 2026-07-07 | Machine gates; single call site confirmed (docUrls in src/lib/docs.ts); auth_setup.sql sets the bucket private; demo fallback to public URL confirmed in code | Verified, awaiting owner |
| Hard low-confidence gate (UI block plus DB trigger) | PR #8, 2026-07-07 | Machine gates; save-path review: editing clears the flag, remaining amber lines block save until acknowledged, ack stored on receiving_event, trigger refuses unacked low-confidence dollar lines; seeds confirmed to insert no receiving lines, so the trigger cannot break them | Verified, awaiting owner |
| Production audit fixes (money leaks, voided rows in totals, API hardening, admin escalation, import dedupe, auth_setup idempotency) | PR #8, 2026-07-07 | Seven-dimension audit (100 agents, three adversarial verifiers per finding); 50 raw findings triaged; every fix re-verified by hand against the code before landing; machine gates green after | Verified, awaiting owner; the fix list is in docs/STATUS.md "Production audit" |

## Known-good environment facts (do not re-derive)
- The build must pass with blank env; auth and data helpers degrade to null rather than throw.
- schema.sql is a full rebuild; live databases get targeted ALTER snippets instead (edit_delete.sql is one).
- The documents bucket needs its storage policy or every capture fails RLS; shipped in schema.sql (dev) and auth_setup.sql (production).
- The Anthropic API key absence makes extract, ask, and reorder report it instead of failing.

## Open verifications
- edit_delete.sql run against the live database (owner action; everything in PR #8 that touches voided_at depends on it).
- Owner walkthrough of PR #8 preview: capture on a phone, edit and delete as manager, View as staff to confirm money stays hidden.
- Enforced-auth smoke test with one owner and one staff account after the login cutover.
