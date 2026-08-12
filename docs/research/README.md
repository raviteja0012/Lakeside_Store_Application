# Platform research, 2026-08-12

A snapshot of what every platform in play can actually do, so that the next person or session
deciding whether to add something starts from a catalog instead of a search engine.

**477 capabilities across seven platforms**, each fetched live from the vendor's own
documentation on 2026-08-12 rather than recalled. Where a researcher could not verify
something, the cost column says so instead of guessing.

| File | Platform | Capabilities |
|---|---|---|
| [vercel.md](vercel.md) | Vercel | 73 |
| [openai.md](openai.md) | OpenAI | 74 |
| [supabase.md](supabase.md) | Supabase | 72 |
| [github.md](github.md) | GitHub | 69 |
| [third-party.md](third-party.md) | AgentMail, Resend, Slack, Google Workspace, marketplace | 67 |
| [anthropic.md](anthropic.md) | Anthropic Claude platform | 62 |
| [aws.md](aws.md) | AWS, checked against ca-central-1 | 60 |

## What this is and is not

- **This is a reference catalog.** It says what exists and what it costs.
- **It is not a plan.** What we adopt and what we decline, with a reason for each, lives in
  [../CAPABILITIES.md](../CAPABILITIES.md).
- **It is not the current stack.** What is actually wired up today lives in
  [../PLATFORM.md](../PLATFORM.md).

## Re-check before acting

This is a dated snapshot of somebody else's product. Pricing moves, features get renamed,
betas ship or die. Treat every row as "true on 2026-08-12" and verify the specific one you
are about to depend on. That habit is not theoretical here: three records in this repo went
stale and were caught only by checking rather than reading, one of which had the owner on a
to-do list to fix something that was never broken.

## Findings worth carrying forward

These came out of the research and change decisions already recorded elsewhere.

- **SES inbound email receiving is available in ca-central-1.** That makes AWS a real
  candidate for the queued email invoice intake, and unlike AgentMail it would keep vendor
  invoices in Canada, which is what the owner's infrastructure note promises him.
  docs/DOMAIN_EMAIL.md section 4 currently prefers AgentMail and should be re-examined
  against this.
- **Bedrock in ca-central-1 serves Anthropic Claude only through Geo or Global cross-region
  inference profiles, never in-region.** So moving the AI to Bedrock for data-residency
  reasons would weaken the Canadian story rather than strengthen it. Worth knowing before
  anyone proposes it as a residency fix.
- **Rekognition in ca-central-1 supports face operations only.** No text detection, label
  detection or moderation in Canada.

## How this was produced

Seven research agents in parallel, one per platform, each instructed to enumerate the full
product surface from the live docs and to flag anything unverifiable. Each result then went
to a second agent that verdicted every capability against this store's actual backlog. The
workflow script is kept with the session; the verdicts land in ../CAPABILITIES.md.
