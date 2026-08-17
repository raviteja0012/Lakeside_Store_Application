# Checking the invoice field registry

`src/lib/invoiceFields.ts` decides which invoice questions each department's forms ask. It
replaced three hand-coded booleans whose call sites had already drifted: the edit form was
nulling a saved PO number and service category on any invoice whose vendor was not the
matching department, while preserving the estimate number beside them.

This runs the real module in node and pins the old behaviour exactly, department by
department, because these are live money screens and the registry's acceptance criterion
was zero behaviour change on the asking side. The one deliberate change is on the SAVING
side: the edit path now writes a hidden question's seeded answer back instead of nulling
it, so correcting an amount can no longer erase a fact.

## Running it

```sh
npx tsc -p scripts/invoicefields-check/tsconfig.json
python3 - <<'PY'
import re, glob, os
for f in glob.glob("scripts/invoicefields-check/out/*.js"):
    s = open(f).read()
    open(f, "w").write(re.sub(r'require\("@/lib/([^"]+)"\)', r'require("./\1")', s))
PY
cp scripts/invoicefields-check/check.js scripts/invoicefields-check/out/
node scripts/invoicefields-check/out/check.js
```

Not wired into the commit gates; run it whenever `invoiceFields.ts` or `departments.ts`
changes. The department matrix at the top of check.js is the contract.
