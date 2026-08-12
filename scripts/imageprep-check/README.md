# Checking the invoice photo downscale

`src/lib/imagePrep.ts` decides, on its own, whether the copy of an invoice photo sent to the
extraction model needs to be smaller. It runs in the browser, on a staff member's phone, at
the receiving door. Nothing about it is visible when it goes wrong: a bad resize does not
crash, it just hands the model a worse picture, and the first sign would be extraction
quality quietly dropping.

`tsc`, `lint` and `build` cannot catch any of that, so this runs the real module in a real
browser against real images and asserts what came out.

## Running it

Needs Chromium and `playwright-core`. Neither is a project dependency, because this is a
check you run when touching `imagePrep.ts`, not a gate on every commit.

```sh
npx tsc src/lib/imagePrep.ts --outDir /tmp/iptest --target es2020 \
  --module esnext --lib es2020,dom,dom.iterable --skipLibCheck
cp scripts/imageprep-check/* /tmp/iptest/
cd /tmp/iptest && npm init -y && npm i playwright-core
python3 serve.py &          # serves the compiled module and the harness
node run.mjs                # exits non-zero if anything failed
```

`run.mjs` expects Chromium at the Playwright cache path used by the cloud build container
(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Point `executablePath` at any
Chromium if yours is elsewhere.

## What it asserts

| Check | Why it matters |
|---|---|
| A 12 MP photo is reduced | The case that could not be captured at all before |
| The sent copy is under 3.2 MB, and its base64 under 4.5 MB | Vercel's function body limit, which is the actual failure |
| Long edge capped at 2576 | Sonnet 5's high-resolution cap; more is paid for and discarded |
| Aspect ratio preserved | A stretched invoice reads worse, not better |
| A small photo is NOT touched | Never re-encode something that did not need it |
| An in-spec image is left alone | The size-driven branch, separate from the pixel-driven one |
| Transparent areas flatten to WHITE | A transparent PNG flattened to JPEG goes black wherever the scan had no ink, which is most of an invoice |
| An oversized PDF explains what to do | The person holding it can act on "photograph the pages" and cannot act on a 413 |
| A small PDF passes through untouched | PDFs cannot be drawn to a canvas |

## A note on writing tests for this

The transparency check failed on its first run, and the code was right. The harness paints
noise rectangles to give the JPEG encoder real work, and the first one lands at (0,0) in
black, so the sampled pixel was opaque black by construction and never transparent at all.
The fix was `clearRect` in the harness.

Worth remembering when a check here goes red: this file fakes the input, so suspect the fake
before the code.
