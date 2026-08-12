# Checking the vendor field registry

`src/lib/vendorFields.ts` decides which questions each department is asked about a vendor,
and which saved facts are shown. Getting it wrong is quiet in a way `tsc` cannot see: a
department silently loses a field, or worse, a staff member is shown a dollar figure.

This runs the real module in node and asserts the behaviour, particularly the three rules
that make a wrong department map safe to ship.

## Running it

```sh
npx tsc -p scripts/vendorfields-check/tsconfig.json
# tsc leaves the "@/lib/..." aliases in the output; node cannot resolve them
python3 - <<'PY'
import re, glob, os
d = "scripts/vendorfields-check/out"
for f in glob.glob(os.path.join(d, "*.js")):
    s = open(f).read()
    open(f, "w").write(re.sub(r'require\("@/lib/([^"]+)"\)', r'require("./\1")', s))
PY
cp scripts/vendorfields-check/check.js scripts/vendorfields-check/out/
node scripts/vendorfields-check/out/check.js
```

Adjust `outDir` in the tsconfig if you want the output somewhere else. Nothing here is a
project dependency and it is not wired into the commit gates: run it when you touch
`vendorFields.ts`.

## The three rules it proves

**1. Hiding a question never hides an answer.** A bakery vendor that already has a summer
order timeline saved still shows it, even though the map says bakeries are not asked that.
Without this, changing the map would appear to delete data, and a vendor entered before a
map change would silently lose fields.

**2. An unrecognised department gets everything.** Chip Stand and Checkouts match nothing in
`departments.ts` and are real parts of the store. They must not lose questions for failing
to be on a list. The check asserts Chip Stand receives all fields.

**3. The money gate fails closed, on both paths.** A role that cannot see money gets no
minimum order on the entry form AND does not see one that is already saved. Rules 1 and 2
fail open on purpose; this one does not, and the check covers both directions because the
display path is the easier one to forget.

## The coupling it protects

`asksFor` is the one predicate the entry form draws with and the save path validates with.
They must never answer differently. If the form hides the minimum order for a bakery while
the save still demands one, that bakery can never be saved and the person at the counter
gets an error pointing at a box that is not on their screen.

The check asserts `asksFor` and `fieldsForEntry` agree for every field across eleven
departments in both money roles, so the two entry points cannot drift.

## The escape hatch

Both vendor forms carry one button: "Add the other questions". The department map is the
owner's best guess, and a guess must never be why somebody cannot record something true
about a real vendor.

It works by passing `null` as the department, which is already rule 2's "ask everything".
The split that makes it safe is that the form DRAWS with `null` while the save path keeps
VALIDATING against the real department name: pressing the button puts the minimum order box
back on a bakery, but does not then refuse to save until it is filled in. The check covers
both halves, and that the button never reopens a money field for a role that cannot see
money.

`hiddenFieldCount` is the number on the button, asserted to equal the number of questions
the press actually puts back. Departments asked everything (Dry Goods, and any department
the app does not recognise) show no button at all.

## Also covered

- The bakery form really is the light form, and Dry Goods really does keep the full ordering
  profile, which is the owner's complaint and the fix in one assertion each.
- Property Maintenance calls the same person a technician rather than a rep.
- Department matching survives messy spelling ("dry goods" lowercase), because the sheets
  spell the same department several ways.
- `vendorSelect()` carries every ordering column, which is what stops the eight
  hand-written selects drifting apart again.

## Changing the department map

The `departments` line on each field is data. If the owner says Hardware should be asked for
a summer order timeline, that is one array edit. Re-run this check afterwards: the rules
above should still hold whatever the map says, and if one breaks, the rule broke, not
the map.
