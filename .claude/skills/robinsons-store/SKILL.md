---
name: robinsons-store
description: Build, extend, and maintain the entire Robinsons General Store platform, a capture-first store operations app for a Canadian general store. This covers the whole build, not just one area: the receiving and capture loop, inventory and counts, the vendor and order ledger, invoices and payments and due-date alerts, retail pricing and price signs, property maintenance, HR, the Ontario pesticide licence and its expiry, the tribal-knowledge base, the document-extraction and reorder and ask-your-store AI agents, the Postgres schema, the color and form design system, and Canadian tax and privacy rules. Use it whenever the work touches the Robinsons app, Ravikiran's store, the receiving screen, or any store feature, even without naming this skill. Apply the locked architecture and the output rules here on every task.
---

# Robinsons General Store, Store Operations Platform

## What this project is
A capture-first operations app for a Canadian brick-and-mortar general store with heavy summer seasonality. The store currently runs on Excel, scribbled invoices, and Gmail subject-line search. The thesis: turn paper and the owner's head knowledge into a structured, attributed, searchable system simple enough for untrained seasonal staff, so the owner can hire a manager and run the store remotely.

Store facts:
- Robinsons General Store, the general store Ravikiran acquired, in Dorset, Ontario, P0A 1E0 per the pesticide licence at 1062 Main Street. Lakeside Dry Goods and L_S and Dry goods are a section inside it, not the store name. Confirm the operating address, an earlier note mentioned Atikokan. Tax is unaffected, both are Ontario at 13 percent HST.
- Owner is Ravi Kiran. Expert in Hardware, only high-level knowledge of the other departments, which is the reason tribal-knowledge capture matters.
- Departments: Grocery, Bakery, Clothing, Hardware, Gifts, Produce, Meat, Chip Stand, with Garden Center under Hardware.
- Sells regulated pesticides under an Ontario vendor licence with a tracked expiry.
- The 2026 bookings spreadsheet is the schema and the seed data. About 120 vendors with order amount, ship date, delivery status, invoiced amount, terms, due date, payment status.

The full plan with evidence, pricing, and citations is in robinsons_store_build_spec.md. Read it for depth. This skill is the working summary plus the rules to apply on every task.

## Locked architecture (do not re-debate)
- Frontend and API: Next.js App Router on Vercel, TypeScript.
- Database, auth, storage, vectors: Supabase Postgres in a Canadian region (ca-central, Toronto). Bundles Auth, Storage, and pgvector.
- Document AI: Claude Sonnet vision by default for the dollar fields, GPT-4o as fallback or cross-check on low confidence, AWS Textract AnalyzeExpense in ca-central-1 for clean high-volume typed invoices.
- RAG: pgvector for the ask-your-store assistant.
- Not the enterprise stack. No Snowflake, Fabric, Redpanda, MuleSoft, API gateway, or MCP governance at this scale. One store, thousands of rows a month. The upgrade path is in the build spec and is earned only if the business grows to many stores.
- Alternative backend if pure Postgres is ever wanted: Neon plus Auth.js plus S3. More moving parts, so not the default.
- Budget ceiling is a couple hundred dollars a month. Realistic run rate 50 to 100.

## Repo layout
```
robinsons-store/
  README.md
  supabase/schema.sql        v1 data model with audit and a licence table
  supabase/seed.sql          departments, demo users, real vendors from the bookings sheet
  src/app/page.tsx           the department feed home
  src/app/capture/page.tsx   capture, extract, confirm, save
  src/app/api/extract/route.ts  the vision call, handles images and PDF
  src/app/globals.css        the color tokens
  src/lib/supabaseClient.ts
  src/lib/types.ts
  .claude/skills/robinsons-store/  this skill, so it travels with the code
```

## Conventions
Data model rules and the entity list are in references/data-model.md. The short version: snake_case, audit on every write through activity_log plus created_by, a confidence value on every extracted line, low-confidence dollar fields never auto-post, money as integer cents before production. Replace the dev row-level security with Supabase Auth and per-role policies before real use.

## Design system
Exact color tokens, the one-meaning-per-hue status mapping, and the form and accessibility rules are in references/design-tokens.md. The short version: a calm neutral canvas, one calm blue primary, color carries meaning and never decorates, labels always visible above fields and never as placeholders, inline validation, big targets, scan do not type, WCAG AA. The one Instagram idea that transfers is letting the captured photos and the data carry the color while the interface stays quiet.

## AI agents
1. Document extraction, ship first. Serverless function sends the image or PDF to the vision model with a strict JSON-only contract: vendor, invoice_date, notes, line_items each with description, qty, unit_cost, retail_price_note, confidence. Validate, write a draft event, flag low-confidence fields. Cross-check the dollar total against the order amount to auto-flag over-ships and missing items. Never auto-post low-confidence amounts.
2. Reorder suggestions, ship second. Dual-season reorder points: separate peak and off-peak average demand plus safety stock per SKU. Formula-based in SQL first, ML only after one or two clean seasons. The human decides.
3. Ask-your-store, ship third. Embed knowledge notes, vendor rules, and key rows into pgvector. Answer with citations back to the source. This is what lets a manager run a department the owner is not expert in.

Hosting note: vision LLM APIs are US-hosted, fine for non-personal vendor invoices. For any personal data prefer the Canadian-region OCR services.

## Canada rules
- Ontario 13 percent HST is the working default. Keep a tax_rules table keyed by province for portability. Show HST as a separate line. Keep records six years.
- Province rates for seeding tax_rules are in the build spec section 13.
- PIPEDA governs the HR and employee data: consent, access, security. Quebec Law 25 only triggers if Quebec-resident personal data is processed, unlikely for an Ontario store, treat as a precaution and a reason to favor Canadian regions.
- Currency CAD, currency input masks.

## Build sequence
Phase 0 kickoff and setup. Phase 1 capture and receiving, the Hardware loop, demoable. Phase 2 pricing and inventory. Phase 3 orders, vendors, payments, due-date alerts. Phase 4 manager dashboard with the Today view. Phase 5 tribal knowledge and reorder AI. Phase 6 ask-your-store. Later property maintenance, HR, licence expiry reminders, price-sign printing, a sales feed.

## Output and communication rules for this project
- Lead with the answer, then context. Short and direct. No hedging or caveats unless asked.
- No em dashes anywhere.
- No AI buzzwords such as significantly, dramatically, meaningful, comprehensive, noticeably.
- Never invent or inflate metrics about the store. Use only real numbers from the bookings sheet or the owner.
- Prefer complete deliverables over step-by-step guides. After delivering a file, keep the explanation minimal.
- Optimize every decision for the store owner's time saved, money saved, and ability to run the store remotely. Skill-building for the builder is a byproduct, never a driver. Boring and working beats novel and fragile.
- Human-in-the-loop on every dollar field. Confidence is captured per line for exactly this reason.

## When to split this skill
Keep this as one skill for now. Split only if a piece grows past what fits cleanly here:
- A dedicated extraction skill if the document-extraction prompts, schemas, and fallback routing grow complex.
- A dashboard or charting skill when Phase 4 starts, using the Okabe-Ito palette in references/design-tokens.md.
- A Canada tax skill if multi-province support becomes real.

## References
- references/data-model.md, the entity list and database conventions.
- references/design-tokens.md, the exact color values, status mapping, and form rules.
- robinsons_store_build_spec.md in the repo, the full plan with evidence, pricing, and caveats.
