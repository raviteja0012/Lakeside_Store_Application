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
const chip = R.fieldsForEntry("Chip Stand", { showMoney: true }).map(f => f.key);
t("RULE 2: unrecognised department gets every question",
  chip.length === R.VENDOR_FIELDS.length, `chip=${chip.length} of ${R.VENDOR_FIELDS.length}`);

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
t("a department asked everything offers no button",
  R.hiddenFieldCount("DryGoods & Lakeside", { showMoney: true }) === 0);
t("an unrecognised department offers no button either",
  R.hiddenFieldCount("Chip Stand", { showMoney: true }) === 0);
t("the money gate is not counted as a hidden question",
  R.hiddenFieldCount("DryGoods & Lakeside", { showMoney: false }) === 0, "staff on a full department");

// The form draws its labels from a key, before it has a field in hand.
t("labelForKey speaks about technicians on maintenance",
  R.labelForKey("rep_name", "Property Maintenance") === "Technician name");
t("labelForKey falls back to the plain label", R.labelForKey("rep_name", "Grocery") === "Rep name");
t("labelForKey on an unknown key returns the key rather than crashing",
  R.labelForKey("nonsense", "Grocery") === "nonsense");

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
