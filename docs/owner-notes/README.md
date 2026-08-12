# Owner-facing notes

Documents written for Ravi to read, as opposed to the rest of `docs/`, which is written for
whoever is building. Same facts, different reader: no code, no jargon, and the thing he has
to decide stated at the top rather than at the end.

Each one is published as a private web page he can open on his phone, and rendered to an A4
PDF for sending or printing. The HTML is the source; the PDF is a build output and is not
committed.

| File | What it is | State |
|---|---|---|
| `vendor-fields-requirement.html` | Why three screens do not read back the vendor ordering answers, what the fix is, and the two decisions that are his | Awaiting his answer. Ledger entry under OPEN in docs/REQUIREMENTS.md |
| `store-app-infrastructure.html` | What the app covers, the services behind it, where the data sits, what it costs, and his action list | Reference. Re-check the facts before re-sending |

## Rendering the PDFs

```
node docs/owner-notes/render.mjs
```

Writes to `docs/owner-notes/pdf/`, with the date in each filename so an older copy is never
mistaken for the current one. Chromium is taken from the Playwright browser cache when one
is present and from `CHROME_PATH` otherwise. Nothing is downloaded.

## House rules for these documents

- **Lead with what he has to do.** The ask goes in a panel above the explanation, not in a
  conclusion he has to reach the end to find.
- **No em dashes, no jargon, no AI buzzwords.** Same output rules as the rest of the project.
- **Colour carries status only**, using the tokens in the skill's `references/design-tokens.md`,
  so these read as part of the same system as the app.
- **Both light and dark**, because he reads on a phone at night. The print stylesheet forces
  the light palette: nobody wants a dark-theme PDF.
- **Date every claim that came from a snapshot.** This matters more than it sounds. The first
  version of the infrastructure note told him the custom domain was still blocked on a DNS
  record, because `docs/DOMAIN_EMAIL.md` said so as of 31 July and the record had been added
  in the meantime. He caught it. Anything about DNS, mailboxes, or a live service is worth
  re-checking against reality before it goes in a document, not read out of a file.
