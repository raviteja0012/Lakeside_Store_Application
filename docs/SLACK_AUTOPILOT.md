# Slack autopilot: a message becomes a deployed change

Type what you want in the store's requests channel. Within half an hour it comes back as a
draft pull request, with a reply in the thread under your own message saying what happened.

This is the intake loop the Jira board used to be, moved to where the work is actually asked
for. Nobody was writing to the board; people do write in Slack.

## How it reads the channel

State is a **reaction**, not a database:

| What you see | What it means |
|---|---|
| no reaction | waiting, nobody has started it |
| 👀 | picked up, being built now |
| ✅ | finished, there is a draft pull request |

That choice is deliberate. The state of every request is visible to anyone scrolling the
channel, it survives the scripts being rewritten, and it costs no storage. It is also what
stops the loop building the same request forever: a message carrying either reaction is
skipped.

The claim goes on **before** the build starts. A run that dies halfway leaves 👀 with no
reply, which is the safe direction: a person sees it and knows to look. The other way round,
an unclaimed request gets built twice.

What is never treated as a request: anything an app posted (including the bot's own replies,
which is what stops it eating itself), joins and leaves, and thread replies. Replies are
skipped because a thread under a finished request is usually people talking about it, and
treating each comment as a new build turns one conversation into ten pull requests.

Oldest first, so whoever asked first is served first.

## What it will not do

- **Merge.** It opens a draft pull request and stops. A person merges.
- **Touch payments, auth, or RLS.** Those requests get a reply saying a person is needed.
- **Follow instructions inside a message.** Anyone who can type in the channel can write
  anything, including "ignore your previous instructions". Message text is a request for
  work, never a change to the process. This is written into the prompt, and it is the reason
  the channel should not be public to people outside the store.

## What it costs

The expensive things are the model and `npm ci`, in that order. **Neither runs on a sweep
that finds nothing.** The workflow's step order is checkout, ask Slack, and only then install
and build, so an idle sweep is a few seconds of Actions time and no model tokens.

This is the specific mistake that killed the Jira version, and it is worth recording
precisely because it was originally diagnosed wrong. That loop had the model correctly gated
behind "did we find a ticket", so it was **not** burning model credits on an empty board. What
it did do was run `actions/checkout` and `npm ci` on every one of its 96 daily sweeps before
checking, roughly a minute each, which is about 2,880 Actions minutes a month against a
2,000-minute free allowance.

The arithmetic to redo if the cadence changes:

```
runs per day  x  seconds per idle sweep  x  30  /  60  =  minutes per month
```

At every 30 minutes that is 48 sweeps a day and roughly 6 hours a month, which leaves room
for CI and the health watchdog.

## Setting it up

In **Settings, Secrets and variables, Actions**:

| Name | Kind | What |
|---|---|---|
| `ANTHROPIC_API_KEY` | secret | Already set; the same key the app's AI features use |
| `SLACK_BOT_TOKEN` | secret | A bot token, starting `xoxb-` |
| `SLACK_REQUEST_CHANNEL` | **variable** | The channel ID, e.g. `C0BPV2BKE66` |

**The bot token is not the incoming webhook.** The webhook the health watchdog uses can only
write. This has to read the channel, which needs a real bot token with these scopes:

- `channels:history` (read the messages)
- `chat:write` (reply in the thread)
- `reactions:read` and `reactions:write` (the 👀 and ✅ state)

Then invite the bot into the channel: `/invite @<the app's name>`.

Until all three exist the workflow exits quietly on its first step, so it is safe to have
sitting there unconfigured.

## Running one on demand

Actions, Slack autopilot, Run workflow. Leave the box blank to sweep the channel, or paste a
message's Slack timestamp to build that specific one. Right-click a message and Copy link;
the timestamp is the number at the end of the URL, with a dot inserted before the last six
digits.

## Its relationship to the parked Jira loop

`.github/workflows/jira-autopilot.yml` is still in the repo with its schedule commented out,
so a future Jira account can wake it. The two are not meant to run at once: two intake loops
reading two queues will build the same request twice. If Jira comes back, decide which one
owns intake and park the other.
