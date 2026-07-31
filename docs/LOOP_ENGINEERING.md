# Loop engineering: how this project builds and ships itself

The design behind the automation, and the reasoning for each limit. Written 2026-07-28 when
the owner asked to automate the whole flow: a request lands, the work gets built, the change
deploys, and a bug we introduced gets caught without anyone watching.

The short version: **an agent in a loop is only as reliable as the thing it checks itself
against.** Everything below is either a loop or a check, and the checks are code, not
instructions. An instruction in a prompt is a suggestion the model can talk itself out of. A
script reading the diff is not.

## What a loop actually is

An agent is a model using tools in a loop: gather context, take an action, verify the
result, repeat. Each tool result is ground truth for the next step. The interesting
engineering is not in the model, it is in two things:

1. **What enters the context**, because accuracy decays as a context fills with noise. This
   is why the project rules live in CLAUDE.md and a skill rather than in whoever's memory,
   why searching is delegated to subagents that return a conclusion instead of a file dump,
   and why each automated run works exactly one ticket and then exits.
2. **What the loop checks itself against**, because a model asked "is this right?" will
   usually say yes. The checks here are the three gates, the health endpoint, and the tier
   classifier. None of them involve asking a model to grade its own homework.

## The five loops

### 1. Intake: a request becomes work

`.github/workflows/jira-autopilot.yml`, every 15 minutes. Picks the oldest open ticket that
is not already waiting on a person, and hands it to a build. Comments count as requests:
replying on a ticket puts it back in the queue, which is how a follow-up ("not quite, make
the button say X") re-enters the loop without anyone opening a terminal.

The autopilot marks its own comments with `[autopilot]`. A ticket whose newest comment
carries that marker is waiting on a human and is skipped, so the loop cannot spin on the
same ticket forever.

### 2. Build: implement, then prove it

The build runs the three gates (`tsc --noEmit`, blank-env `npm run build`, `npm run lint`)
and does not proceed while any is red. This is the evaluator-optimizer pattern with the
compiler as the evaluator: the model generates, the toolchain judges, and the judgement is
not negotiable.

Locally the same rule is enforced by a **Stop hook** (`.claude/hooks/gate-typecheck.sh`):
a session cannot end with TypeScript broken. The hook fails open on anything unexpected,
because a hook that wrongly blocks every turn gets disabled, and a disabled hook enforces
nothing.

### 3. Ship: how far a change travels on its own

This is the part that needed the most care, and the design principle is a split:

> **The model writes the code. A script decides whether it merges.**

`.github/scripts/classify-change.mjs` reads the actual diff and returns a tier. Nothing in
a ticket, a prompt, or the model's own reasoning can move it.

| Tier | What it is | What happens |
|---|---|---|
| **A** | Words only: `docs/`, root `.md`, the in-app guide. Under 300 lines. | Merges itself once checks pass, and deploys. |
| **B** | Anything else in the app. | Draft pull request. A person merges. **The default.** |
| **C** | Money, access, the database, or the automation's own files. | Nothing merges. Reported and left. |

Tier C deserves its list spelled out: `supabase/**`, `src/lib/payments.ts`, the auth and
edit helpers, `src/app/api/**`, `package.json`, and critically **`.github/**` and
`.claude/**`**.

That last exclusion is the one people forget. **A loop that can edit its own limits does not
have limits, and a loop that can edit its own reviewer has no reviewer.** The automation is
not allowed to modify the automation. Changing what the autopilot may do requires a human
merging a pull request, every time.

### 4. Watch: catching what we broke

`.github/workflows/post-deploy-watch.yml` runs after every deploy to main and every two
hours. It asks the live site `/api/health`, which is answered by the app itself and checks
the things a green build cannot see:

- The deployed app and the deployed **database agree on what an invoice owes**. It asks the
  database what a tax-included invoice of 113 with 13 of embedded HST owes, and compares
  that with what `invoiceTotal()` says. A migration that was never run, or a money rule
  changed on one side only, fails right here.
- The payments engine functions are installed.
- The columns this release needs exist.
- **No invoice is showing a status its own payments do not support.** This is the drift
  detector, and it is the one that catches a genuinely broken money change: if the total is
  wrong, statuses stop matching their allocations.

A failure raises a bug on the board, which the intake loop then picks up. That is what makes
it a loop rather than a pipeline: the output of the watch is the input of the build.

It never reports a dollar figure, so the endpoint is safe to call from anywhere.

### 5. Refine

The board is the queue for everything: the owner's asks, the health watchdog's bugs, and
anything the Suggestions screen collects in the app. There is one place to look and one way
in.

## Why not just let it merge everything

Because of the exposure, not the capability. The useful frame is: **private data, external
action, untrusted input — pick at most two without a human.**

This system has private data (the store's vendors and payments) and untrusted input (ticket
text, which anyone who can comment on the board can write, and which the model reads as
instructions). That is two. Adding unrestricted external action — merging and deploying
whatever it likes — makes three, and three is where an instruction hidden in a ticket
becomes a deployed change to how the store pays people.

So external action is not off, it is **bounded to a tier where the blast radius is words**.
Tier A can merge because the worst outcome is wrong wording, which is visible, harmless, and
one revert away. Everything that can move money stops for a person. That is not caution for
its own sake; it is the specific reason the automation is allowed to run unattended at all.

The prompt also tells the model to treat instructions embedded in ticket text as text to
ignore rather than orders to follow. That is worth saying, but it is the weak layer. The
tier classifier is the strong one, because it does not read the ticket.

## What is deliberately NOT automated

- **Merging anything that touches money, access, or the schema.** Tier C.
- **Deciding a database migration.** Writing or approving one is human work: `supabase/**`
  is tier C and never auto-merges. Since 2026-07-31 the APPLYING is automated
  (`.github/workflows/migrate.yml`, on push to main only, from the explicit list in
  `supabase/run-order.txt`), which is a different thing. A person still reads the SQL and
  merges it; the machine only stops them from having to paste it into a web editor
  afterwards. `auth_setup.sql` is excluded, because running it while enforced login is off
  would lock everyone out of a working store.
- **Reverting automatically.** The watchdog raises a bug and fails the run; it does not roll
  production back on its own. An automatic revert during a real incident can undo the fix
  someone is mid-way through applying.
- **Acting on more than one ticket per run.** A bad run affects one ticket, and the next run
  starts clean.

## The specialists

`.claude/agents/` holds two read-only reviewers with narrow tools:

- **money-reviewer** knows the ways this codebase has actually broken before: a select that
  forgets `tax_mode`, an inline amount-plus-freight-plus-HST that bypasses `invoiceTotal`,
  SQL and TypeScript changed on one side only.
- **invariant-auditor** checks store scoping, money gating, soft voids, attributed audit
  rows, and the blank-env build.

Both have `tools: Read, Grep, Glob` and no write access at all. That is config, not
instruction: they cannot edit even if asked to.

## Costs

A run with an empty board stops before any model call. A real ticket costs roughly what one
build conversation costs. Fifteen minutes is the polling interval, not the run rate.

## What would make this better

Honest list, in the order I would do them:

1. **A revert path for tier A.** If a words-only change ever does break something, the
   watchdog currently raises a ticket. For tier A specifically, an automatic revert is
   defensible, because the change was words.
2. **Runtime error signal.** The health endpoint checks correctness, not crashes. Wiring the
   Vercel runtime errors API in would catch the class of bug that only appears under real
   use.
3. **A staging database.** Today a migration is verified by running it on production and
   watching the health check. That works because the store is small and the scripts are
   idempotent, but it is the weakest link in the chain.
4. **Screenshot verification.** The gates prove it compiles, not that it looks right. A
   Playwright pass over the key screens would close that gap.
