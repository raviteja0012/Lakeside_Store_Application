# The store's domain and email: inventory, integration plan, runbook

Recorded 2026-07-27 from the owner's screenshots of the domain control panel (messages of
2026-07-21). This resolves the July 10 voice notes: they were about the store's own domain
and its email costs.

## What the store owns

- Domain: robinsonsgeneralstore.ca, DOMAIN.CA registration, active since 2006-10-17.
- Email plan: HST-EMAIL-1, up to 10 mailboxes, about $10 per month, active since 2024-09-17.
- Mailboxes (5 of 10 used, all configured by the PREVIOUS owners, unused by the current
  ownership):
  - drygoods@robinsonsgeneralstore.ca (Drygoods Giftshop) . 249.99MB / 250MB, FULL
  - hardware@robinsonsgeneralstore.ca (Hardware Department) . 250MB / 250MB, FULL
  - info@robinsonsgeneralstore.ca (Robinson's General Store) . 250MB / 250MB, FULL
  - joanne@robinsonsgeneralstore.ca (Joanne Robinson, previous owner) . 0.05MB
  - redonion@robinsonsgeneralstore.ca (The Red Onion boutique) . 78.76MB
- Alias: stories@robinsonsgeneralstore.ca forwards to robinsonsstories@hotmail.com.

## Two problems to fix first (owner actions, urgent)

1. THREE MAILBOXES ARE FULL and rejecting new mail: drygoods@, hardware@, info@. Any
   vendor emailing an invoice or order confirmation to those addresses gets a bounce.
   Fix in the panel: open each mailbox, archive or delete old mail (or raise the quota),
   until usage is well under the cap.
2. THE stories@ ALIAS FORWARDS TO THE PREVIOUS OWNERS' PERSONAL HOTMAIL. Store mail is
   leaving the business. Unless this is deliberate, Edit the alias to point at info@ (once
   cleared) or delete it. Review joanne@ the same way: it is the previous owner's personal
   box; archive anything needed, then delete or repurpose the slot.

## Integration plan (in order)

### 1. The app on the store's own domain
Point app.robinsonsgeneralstore.ca at the Vercel app:
- In Vercel: project robinsons-store, Settings, Domains, Add: app.robinsonsgeneralstore.ca.
- At the domain host (the panel in the screenshots): add a CNAME record
  app -> cname.vercel-dns.com.
- Vercel provisions TLS automatically; robinsons-store.vercel.app keeps working.
No code change needed. Staff then log in at app.robinsonsgeneralstore.ca, which reads as
the store, not as a hosting provider.

### 2. Mailbox plan for the 10 slots (the department mapping)
Keep the useful legacy boxes, claim the free slots deliberately:
- KEEP: info@ (front door), drygoods@, hardware@, redonion@ (they match departments;
  vendors already know them from years of use), stories@ only as a repointed alias.
- ADD (5 free slots, suggested): grocery@, invoices@ (every vendor invoice lands here;
  this is the future email-intake feed for Capture), owner@ (Ravi), payments@ or ap@
  (remittance confirmations), maintenance@ (contractors: Muskoka Wiring, Bacher).
- RETIRE: joanne@ after archiving.
The invoices@ convention matters most: one address to give every vendor, one feed for the
app to ingest later.

### 3. App email FROM the domain (daily alerts)
The daily due-date email (/api/alerts, Resend) can send as the store instead of a generic
address:
- In Resend: add domain robinsonsgeneralstore.ca; it issues SPF and DKIM DNS records.
- At the domain host: add those records.
- In Vercel env: ALERT_EMAIL_FROM=alerts@robinsonsgeneralstore.ca (display name
  "Robinson's General Store"). Redeploy.

### 4. Email invoice intake (the queued feature, now concrete)
Design (build when the owner says go):
- Vendors send invoices to invoices@robinsonsgeneralstore.ca.
- The mailbox forwards a copy to the app's inbound address (Resend Inbound or an IMAP
  poll from a Vercel cron; credentials live in env, never in the repo).
- Each attachment runs through the existing Capture extraction with a "from email"
  badge and the usual human confirm; the sender address must match a configurable
  allowlist (the "configure which emails" ask from the first feedback round).
This turns the full-mailbox problem into a workflow: the invoice inbox is drained into
the app instead of rotting at 250MB.

### 5. Member logins on the domain (later, optional)
When enforced-auth accounts are re-issued, use real addresses (owner@, manager@) instead
of the demo ones; auth_setup links by email, so creating the Supabase Auth users with the
new addresses and updating app_user.email is the whole change.

## Who does what

- Owner or Raviteja in the DOMAIN PANEL: clear the three full mailboxes; repoint or delete
  stories@; archive joanne@; create invoices@ (and any of the suggested boxes); add the
  Vercel CNAME and, when doing step 3, the Resend SPF/DKIM records.
- Raviteja in VERCEL: add the custom domain; set ALERT_EMAIL_FROM after Resend verifies.
- The app (Claude, next build rounds): the email-intake pipeline of step 4 once invoices@
  exists and forwarding is chosen; nothing else needs code.

## Costs on record

About $10 per month covers the domain email plan (up to 10 boxes). The July 10 voice notes
discussed this cost; the number the owner quoted in chat is the plan price, and no new
spend is needed for any step above except optional Resend (free tier covers a daily email).
