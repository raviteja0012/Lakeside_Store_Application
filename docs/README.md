# The docs, and which one to open

Twenty files is too many to guess at. This is the index: what each one is for, who it is
written for, and how current it is. Start here.

## Read first, in this order

| File | For | What it answers |
|---|---|---|
| [REQUIREMENTS.md](REQUIREMENTS.md) | Builder | Every ask with its state: shipped, queued, or waiting on the owner. **If it is not here, it is not agreed.** |
| [STATUS.md](STATUS.md) | Builder | What is built right now, and the before-production checklist |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Builder | The stack, the data flow, the capture loop, the Mermaid diagrams |
| [PLATFORM.md](PLATFORM.md) | Builder | Every service and plan in use, what is adopted, and what is deliberately declined with the reason. **Carries two open risks: the Vercel plan and database backups** |

## Operating it

| File | What it answers |
|---|---|
| [ENVIRONMENTS.md](ENVIRONMENTS.md) | The practice site and the live site, and how a change crosses from one to the other |
| [SUPABASE_SETUP.md](SUPABASE_SETUP.md) | Every SQL script and the exact order to run it, fresh install and live upgrade |
| [../RUNBOOK.md](../RUNBOOK.md) | Go live, and the five-minute "turn on login" cutover |
| [DOMAIN_EMAIL.md](DOMAIN_EMAIL.md) | The domain, the ten mailboxes, and the design for email invoice intake |
| [VERIFICATION.md](VERIFICATION.md) | The per-feature sign-off record |

## Where the work comes from

| File | What it answers |
|---|---|
| [OWNER_NOTES.md](OWNER_NOTES.md) | The owner's feedback verbatim, round by round, Telugu translated. The raw input that REQUIREMENTS.md is triaged from |
| [owner-notes/](owner-notes/) | Documents written **for** the owner rather than for the builder, plus the PDF renderer |
| [LOOP_ENGINEERING.md](LOOP_ENGINEERING.md) | How the repo builds and ships itself from the Jira board, and why each limit exists. **Read before touching `.github/` or `.claude/`** |
| [JIRA_AUTOPILOT.md](JIRA_AUTOPILOT.md) | The board, the statuses, and how a ticket becomes a build |

## The store's own data

| File | What it answers |
|---|---|
| [DATA_SOURCES.md](DATA_SOURCES.md) | The Google Drive folder, what each part maps to in the schema, and how to get at the files |
| [DATA_INVENTORY.md](DATA_INVENTORY.md) | The detailed per-file catalog with metadata and sample rows |
| [SYNC_PLAN.md](SYNC_PLAN.md) | The phased plan for syncing with the owner's live sheets |

## History

| File | What it answers |
|---|---|
| [../robinsons_store_build_spec.md](../robinsons_store_build_spec.md) | The original plan with evidence, pricing and citations. Kept for history; where it disagrees with the docs above, the docs above win |

## House rules for these files

- **Date anything that is a snapshot of the outside world**, and re-check it rather than
  reading it. Three records went stale and were caught only by checking: the custom domain
  recorded as blocked when it was live, the vendor ordering columns recorded as missing when
  the health check passed, and the mailbox quota recorded as 250MB when it is 1000MB. The
  last one had the owner on a to-do list to clear mailboxes that were never full.
- **One fact, one home.** If two files would both carry it, one of them links instead.
  `SOURCES.md` was merged into `DATA_SOURCES.md` on 2026-08-12 for exactly this reason.
- **Update in the same pull request as the work.** A doc that lands a week later is a doc
  nobody trusts.
- No em dashes, plain words, and no invented numbers about the store.
