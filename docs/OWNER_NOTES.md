# Owner notes and feature requests

A living document. Every feature idea, note, or document the owner shares gets recorded here,
refined into something buildable, and checked against what the app already does, so nothing is
lost and nothing is built twice. Edit freely; append new notes at the bottom with a date.

Last updated: 2026-07-07.

## Sources on file

1. The owner's notes relayed 2026-07-07 (preserved verbatim in the last section).
2. "Dorset Store Ops Hub, Project Execution Document" (PDF, AI-generated blueprint the owner
   received from prompting an AI; 5 pages).
3. Two AI-generated diagrams: an architecture diagram and a monthly budget infographic
   ($200 CAD cap, roughly $45 peak-season target).

## The uploaded blueprint vs the app that exists

The PDF describes the product this repo already is. It was generated without knowledge of this
codebase, so it proposes building from zero on Replit with OpenAI. Item by item:

| Blueprint item | Status here |
|---|---|
| PostgreSQL database (departments, employees, vendors, tasks) | Built, and richer: the schema also covers orders, invoices, payments, receiving, counts, pay rates, shifts, licences, insurance (`supabase/schema.sql`) |
| Supabase for database and identity | Built, Canadian region, with per-store per-role row security (`auth_setup.sql`) |
| Vercel hosting, free tier | Built and deployed |
| Mobile-first staff screen, zero training | Built: the staff Today home with big action tiles and a phone bottom tab bar |
| Remote owner dashboard | Built: the Today command dashboard with KPIs and what needs attention |
| Natural-language AI search over store data | Built: /ask, answering from the store's own notes, vendors, and invoices with sources |
| Notifications engine, email | Built: daily due-date email (Resend) plus the in-app bell |
| Notifications engine, SMS (Twilio) | Not built, stays deferred; email and the bell cover today's need at zero cost |
| Budget: $200 cap, ~$45 target | Matches: the app's realistic run rate is $50 to $100 a month |
| Task checklist per department with Mark as Complete | Partial: recurring department tasks exist (`maintenance_task`, daily/weekly/monthly cadence) but there is no staff tap-to-complete daily checklist yet. Queued below |
| Owner ops overview: tasks done vs remaining today, by department | Not built. Queued with the checklist |
| Tenant tracker: rent owed, last payment, paid-this-month indicator | Not built. The property tenants are not in the app at all. Queued below |
| Smart margin calculator: cost in, department margin rule, retail out | Not built. Queued below |
| Replit as the build environment | Not adopted. This repo builds on GitHub plus Vercel with versioned code review, which is safer for a production store. Locked decision |
| OpenAI gpt-4o-mini as the AI engine | Not adopted. The app uses Claude via the Anthropic API for extraction, ask, and reorder. Locked decision; one AI vendor, already integrated and budgeted |

Verdict: do not execute the PDF. Everything foundational in it exists and is further along here.
Its four genuinely new ideas (checklist, ops overview, tenant tracker, margin calculator) are
captured in the queue below.

## The owner's notes, refined

Each note appears with its plain reading, whether the app covers it today, and what is queued.

### 1. Futures: invoice intake from email
Raw: "get and organise the invoice from Email and we need ability to configure which emails
need to add that job."

Refined: a store email address that invoices get forwarded to. The extraction agent reads each
message, drafts the receiving and invoice records, and a person confirms on screen, exactly like
camera capture today. An owner-editable allowlist controls which sender addresses are trusted to
create these draft jobs; anything else is ignored.

Coverage: not built. Already first in the expansion plan (docs/STATUS.md, Wave 1, "email intake
agent"). The allowlist requirement from this note is now part of that item's definition.

### 2. Grocery: price check as a daily activity with a notification
Raw: "Price check in a day activity list & notification."

Refined: a recurring daily task, "Price check", in the Grocery department, that shows on a daily
activity list and reminds whoever is on it.

Coverage: partial. A daily recurring Grocery task can be created today (Maintenance screen;
daily cadence shipped in PR #8) and overdue tasks already surface in the notification bell. What
is missing is the staff-facing daily checklist with a big Mark as Complete and a per-day
completion record. Queued below as the department task checklist.

### 3. Maintenance, building: back door control
Raw: "Back Door Door control."

Refined: the back door (its closer, lock, or access control) tracked as a building asset with a
recurring check.

Coverage: covered by entering data, no code needed. Add a maintenance asset "Back door" and a
recurring task for its check on the Maintenance screen.

### 4. Hardware, daily operations: restocking frequency
Raw: "restocking frequency."

Refined: how often each Hardware section gets restocked, visible as a cadence so staff know what
to walk and refill each day.

Coverage: partial. Reorder suggestions exist from the order ledger and counts, and recurring
tasks can model "walk and restock aisle X" per section today. A true per-item restock cadence
belongs with the sales-data work (POS import) already queued in the expansion plan, because
real restock frequency comes from sales velocity.

### 5. Hardware: "taken care locations"
Raw: "Hardware taken care care locations."

Two possible readings, needs the owner's one-line answer:
(a) the physical store zones each hardware person is responsible for, or
(b) the locations where hardware stock is kept and maintained.

Interim: either reading can be captured today as knowledge notes tagged Hardware, one per
location, with the responsible person named. If (a) becomes a real roster, it belongs on the
schedule (shifts already carry a department; a zone field would be the extension).

### 6. Other vendors: DT across departments
Raw: "DT :- hardware, grocery 2nd aisle, dry goods."

Refined: the vendor DT supplies more than one department (Hardware, the second grocery aisle,
and Dry Goods).

Coverage: gap. A vendor currently belongs to exactly one department in the schema. Until
multi-department vendors are built (queued below), the working convention is: create the vendor
once under its main department and record the other placements in the vendor's notes, so orders
still reconcile.

### 7. Link and LP departments
Raw: "Link:- need to list done what all the department involved in LP."

Best reading: list which departments are involved in LP for the vendor Link. LP most likely
means liquid propane in a Dorset general store context, but this is unconfirmed. Needs the
owner's one-line answer on what LP stands for and who Link is.

Interim: a knowledge note titled "Link / LP departments" holding the list as the owner dictates
it. If LP is propane, it may also touch compliance (TSSA rules for propane handling in Ontario),
which would join the licence tracking already on the Compliance screen.

## Queued enhancements from these notes (proposed order)

Recorded here and mirrored in docs/STATUS.md. Nothing below is built yet; the owner picks when.

1. Department task checklist: recurring tasks surface as a daily list per department with a big
   Mark as Complete; each completion is logged (who, when). The owner's Today dashboard gains
   "done vs remaining today, by department". Covers notes 2 and 4 and two blueprint items.
   Small build, high value, uses the existing maintenance_task table plus one completion table.
2. Smart margin calculator: cost price in, department margin rule applied, recommended retail
   out; margin rules editable per department. Pairs naturally with the price-signs screen.
3. Tenant tracker: tenants, monthly rent, payments, paid-this-month indicator on the owner
   dashboard. New module; needs the real tenant list from the owner.
4. Multi-department vendors: let one vendor serve several departments (covers DT, note 6).
5. Email invoice intake with a sender allowlist (note 1; already Wave 1 in the expansion plan).

## Open questions for the owner

1. Note 5: does "hardware taken care locations" mean staff zone responsibilities or stock
   locations?
2. Note 7: what does LP stand for, and is Link a vendor? List the departments involved.
3. Tenant tracker: how many tenants, and what are the rents? (Needed before building item 3.)

## Raw notes as received, 2026-07-07 (verbatim, unedited)

> Futures:
> 1. get & organise the invoice from Email and we need ability to configure which emails need to add that job.
> 2.
>
> Notifications:
> Grocery
> 1. Price check in a day activity list & notification
> 2.
>
> Maintenance
> Building
> 1. Back Door Door control
>
> Hardware
> Daily operations
> 1. restocking frequency
> 2. Hardware taken care locations
>
> Other vendors
> 1. DT :- hardware, grocery 2nd aisle, dry goods
> 2. Link:- need to list done what all the department involved in LP
