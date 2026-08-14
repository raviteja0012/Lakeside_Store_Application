const R = require("./vendorFields.js");
let pass = 0, fail = 0;
const t = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  [" + d + "]" : ""}`); };

const entry = R.fieldsForEntry("Bakery", { showMoney: true }).map(f => f.key);
t("bakery form is the light form",
  !entry.includes("minimum_order") && !entry.includes("summer_order_timeline") && !entry.includes("products_we_carry"),
  entry.join(","));
t("bakery form keeps name/status/phone/email/notes",
  ["name", "status", "phone", "email", "notes"].every(k => entry.includes(k)), `${entry.length} fields`);

const dry = R.fieldsForEntry("DryGoods & Lakeside", { showMoney: true }).map(f => f.key);
t("dry goods keeps the full ordering profile",
  ["minimum_order", "summer_order_timeline", "order_location", "reorder"].every(k => dry.includes(k)),
  `${dry.length} fields`);

// RULE 1: hiding a question must never hide an answer.
const bakeryWithData = {
  name: "X", status: "active", department: { name: "Bakery" },
  summer_order_timeline: "Before mid-January", minimum_order_amount: 1500, no_minimum_order: false
};
const facts = R.visibleFacts(bakeryWithData, { showMoney: true }).map(f => f.field.key);
t("RULE 1: bakery still SHOWS a saved summer timeline", facts.includes("summer_order_timeline"), facts.join(","));
t("RULE 1: bakery still SHOWS a saved minimum order", facts.includes("minimum_order"));

// RULE 2: a department this file does not recognise loses nothing.
//
// Chip Stand used to be the example here. On 2026-08-13 the owner said it follows Grocery,
// so it is recognised now and correctly gets Grocery's shorter list. The rule still needs a
// genuinely unknown department to prove itself against.
const unknown = R.fieldsForEntry("Garden Centre", { showMoney: true }).map(f => f.key);
t("RULE 2: unrecognised department gets every question",
  unknown.length === R.VENDOR_FIELDS.length, `${unknown.length} of ${R.VENDOR_FIELDS.length}`);

// The money gate fails closed on both paths.
const staffEntry = R.fieldsForEntry("DryGoods & Lakeside", { showMoney: false }).map(f => f.key);
t("money gate: staff form has no minimum order", !staffEntry.includes("minimum_order"));
const staffFacts = R.visibleFacts(bakeryWithData, { showMoney: false }).map(f => f.field.key);
t("money gate: staff view hides a SAVED minimum order", !staffFacts.includes("minimum_order"), staffFacts.join(","));

// Maintenance speaks about technicians, not reps.
const repField = R.VENDOR_FIELDS.find(f => f.key === "rep_name");
t("maintenance calls the rep a technician",
  R.labelFor(repField, "Property Maintenance") === "Technician name", R.labelFor(repField, "Property Maintenance"));
t("other departments still say rep name", R.labelFor(repField, "Grocery") === "Rep name");
t("pattern matching works on messy spellings",
  R.fieldsForEntry("dry goods", { showMoney: true }).length === dry.length, "lowercase 'dry goods'");

// The derived select is what stops the eight hand-written ones drifting again.
const sel = R.vendorSelect();
t("vendorSelect carries every ordering column",
  ["minimum_order_amount", "no_minimum_order", "summer_order_timeline", "order_location",
   "order_location_other", "reorder_status", "reorder_comments"].every(c => sel.includes(c)),
  `${sel.split(",").length} columns`);

// alwaysShow: the blank is the information. Status is the case that matters, because "we
// stopped buying from them" is worth seeing on every vendor. The flag used to be dead code.
const blankStatus = { name: "X", status: null, department: { name: "Grocery" } };
const blankFacts = R.visibleFacts(blankStatus, { showMoney: true, group: "identity" });
const statusFact = blankFacts.find(f => f.field.key === "status");
t("alwaysShow: a blank status still appears", !!statusFact, blankFacts.map(f => f.field.key).join(","));
t("alwaysShow: it reads as not on file rather than blank", statusFact && statusFact.text === R.NOT_ON_FILE,
  statusFact && statusFact.text);
t("a blank ordinary field is still left out",
  !blankFacts.some(f => f.field.key === "notes"), "notes is not alwaysShow");

// asksFor is the predicate the entry FORM draws with and the SAVE path validates with. If
// those two ever answer differently, a department becomes unsaveable: the form hides the
// minimum order, the save still demands one, and the error points at a box that is not on
// the screen. This asserts they are the same answer for every field and every department.
const DEPTS = [null, "Bakery", "Meat", "Produce", "Grocery", "Hardware", "DryGoods & Lakeside",
               "Property Maintenance", "Payrolls & Taxes", "Others", "Chip Stand"];
for (const money of [true, false]) {
  let agree = true, where = "";
  for (const d of DEPTS) {
    const drawn = new Set(R.fieldsForEntry(d, { showMoney: money }).map(f => f.key));
    for (const f of R.VENDOR_FIELDS) {
      if (R.asksFor(d, f.key, { showMoney: money }) !== drawn.has(f.key)) {
        agree = false; where = `${d}/${f.key}`;
      }
    }
  }
  t(`asksFor matches fieldsForEntry everywhere (money=${money})`, agree, where || "all match");
}
t("asksFor on an unknown key is false, not a crash", R.asksFor("Grocery", "nonsense", { showMoney: true }) === false);

// The bakery is the case the owner reported and the one that could have been made
// unsaveable. The minimum order is mandatory whenever it is asked, so not asking it is what
// lets a bakery vendor be saved at all.
t("a bakery is not asked for a minimum order, so it can be saved",
  R.asksFor("Bakery", "minimum_order", { showMoney: true }) === false);
t("dry goods is still asked for a minimum order",
  R.asksFor("DryGoods & Lakeside", "minimum_order", { showMoney: true }) === true);

// The escape hatch: the form passes null to put every question back. It must reveal the
// question WITHOUT the save path then demanding an answer, so the button cannot punish the
// person who pressed it. That split is exactly null-for-drawing, real-name-for-validating.
t("escape hatch reveals the minimum order for a bakery",
  R.asksFor(null, "minimum_order", { showMoney: true }) === true);
t("escape hatch does not make it mandatory (validation still asks the real department)",
  R.asksFor("Bakery", "minimum_order", { showMoney: true }) === false);
t("escape hatch never reopens a money field for staff",
  R.asksFor(null, "minimum_order", { showMoney: false }) === false);

// The count on the button. It has to be the number of questions actually put back, or the
// button lies about what pressing it does.
const bakeryHidden = R.hiddenFieldCount("Bakery", { showMoney: true });
t("hidden count equals what the hatch puts back",
  bakeryHidden === R.fieldsForEntry(null, { showMoney: true }).length - R.fieldsForEntry("Bakery", { showMoney: true }).length,
  `bakery hides ${bakeryHidden}`);
// Since "Specializes in" arrived, NO department is asked every question: it belongs to
// Property Maintenance alone, so even Dry Goods now has one question it is not asked and
// will offer it behind the button. Only a department the app does not recognise gets the
// full set, and only that one has nothing left to offer.
t("an unrecognised department offers no button, because it already has everything",
  R.hiddenFieldCount("Garden Centre", { showMoney: true }) === 0);
t("Dry Goods now hides exactly one question, the maintenance trade",
  R.hiddenFieldCount("DryGoods & Lakeside", { showMoney: true }) === 1);
t("Property Maintenance hides the merchandise questions",
  R.hiddenFieldCount("Property Maintenance", { showMoney: true }) ===
    R.fieldsForEntry(null, { showMoney: true }).length - R.fieldsForEntry("Property Maintenance", { showMoney: true }).length);
// The money gate removes the minimum order from BOTH sides of the subtraction, so the number
// on the button is the same whoever is looking. A staff member must never see a button
// offering to put a dollar field back.
t("the money gate does not change the count",
  R.hiddenFieldCount("DryGoods & Lakeside", { showMoney: false }) ===
    R.hiddenFieldCount("DryGoods & Lakeside", { showMoney: true }),
  `staff ${R.hiddenFieldCount("DryGoods & Lakeside", { showMoney: false })}, money ${R.hiddenFieldCount("DryGoods & Lakeside", { showMoney: true })}`);

// The form draws its labels from a key, before it has a field in hand.
t("labelForKey speaks about technicians on maintenance",
  R.labelForKey("rep_name", "Property Maintenance") === "Technician name");
t("labelForKey falls back to the plain label", R.labelForKey("rep_name", "Grocery") === "Rep name");
t("labelForKey on an unknown key returns the key rather than crashing",
  R.labelForKey("nonsense", "Grocery") === "nonsense");

// THE OWNER'S ANSWER, 2026-08-13. He marked up the table in the vendor questions document
// and these are his ticks, transcribed. Asserting them here means a later edit to the map
// cannot quietly walk away from what he actually said without a test going red.
const OWNER = {
  "DryGoods & Lakeside": ["name","status","phone","email","notes","rep_name","default_terms","products_we_carry","minimum_order","reorder","order_location","summer_order_timeline"],
  "Hardware":            ["name","status","phone","email","notes","rep_name","default_terms","products_we_carry","minimum_order","reorder","order_location"],
  "Grocery":             ["name","status","phone","email","notes","rep_name","default_terms","products_we_carry","minimum_order","reorder"],
  "Property Maintenance":["name","status","phone","email","notes","rep_name","default_terms","specializes_in"],
  "Bakery":              ["name","status","phone","email","notes"],
  "Meat":                ["name","status","phone","email","notes"],
  "Produce":             ["name","status","phone","email","notes"],
  "Others":              ["name","status","phone","email","notes"]
};
for (const [dept, expected] of Object.entries(OWNER)) {
  const got = R.fieldsForEntry(dept, { showMoney: true }).map(f => f.key).sort();
  const want = [...expected].sort();
  t(`owner's table: ${dept}`, JSON.stringify(got) === JSON.stringify(want),
    got.join(",") === want.join(",") ? "" : `got ${got.join(",")} want ${want.join(",")}`);
}

// "Chip Stand follows Grocery, and Checkouts follows Others, unless you say otherwise."
// Before his answer these matched nothing and were asked EVERY question, which is the
// opposite of what he wanted.
t("Chip Stand follows Grocery",
  R.fieldsForEntry("Chip Stand", { showMoney: true }).map(f => f.key).sort().join(",") ===
  R.fieldsForEntry("Grocery", { showMoney: true }).map(f => f.key).sort().join(","));
t("Checkouts follows Others",
  R.fieldsForEntry("Checkouts", { showMoney: true }).map(f => f.key).sort().join(",") ===
  R.fieldsForEntry("Others", { showMoney: true }).map(f => f.key).sort().join(","));
t("a genuinely unknown department is still asked everything",
  R.fieldsForEntry("Garden Centre", { showMoney: true }).length === R.VENDOR_FIELDS.length);

// Specializes in is the one NEW question, and it belongs to maintenance alone.
t("Specializes in is asked of Property Maintenance",
  R.asksFor("Property Maintenance", "specializes_in", { showMoney: true }) === true);
for (const d of ["Grocery", "Hardware", "DryGoods & Lakeside", "Bakery"]) {
  t(`Specializes in is NOT asked of ${d}`, R.asksFor(d, "specializes_in", { showMoney: true }) === false);
}
t("vendorSelect fetches the new column", R.vendorSelect().includes("specializes_in"));

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
