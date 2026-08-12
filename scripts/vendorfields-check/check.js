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

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
