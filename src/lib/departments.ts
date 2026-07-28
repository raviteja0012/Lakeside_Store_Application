// The order the store thinks in. Every department list and dropdown follows it, so the
// app reads the same way on every screen instead of falling back to alphabetical (which
// put Bakery above Hardware and buried Property Maintenance in the middle).
//
// The owner set this sequence on 2026-07-27 (SCRUM-9). Matching is by pattern, not exact
// text, because the same department is spelled several ways across the sheets and the two
// stores ("Payrolls & Taxes" and "Payroll&Taxes" are the same thing). A department that
// matches nothing keeps working and simply sorts after the named ones, alphabetically:
// nothing ever disappears from a list because it was not on this list.

const ORDER: { label: string; match: RegExp }[] = [
  { label: "DryGoods & Lakeside", match: /dry\s*goods|lakeside/i },
  { label: "Hardware", match: /hardware/i },
  { label: "Grocery", match: /grocer/i },
  { label: "Property Maintenance", match: /property/i },
  { label: "Bakery", match: /baker/i },
  { label: "Meat", match: /meat/i },
  { label: "Produce", match: /produce/i },
  { label: "Payrolls & Taxes", match: /payroll|tax/i },
  { label: "Others", match: /^other/i }
];

// The owner's sequence as plain labels, for docs and for any screen that needs the list
// itself rather than a sort.
export const DEPARTMENT_ORDER = ORDER.map((o) => o.label);

// Where a department sits in the owner's sequence. Unlisted departments share the last
// rank, so the comparator falls through to their name.
export function departmentRank(name: string | null | undefined): number {
  const n = (name || "").trim();
  if (!n) return ORDER.length;
  const i = ORDER.findIndex((o) => o.match.test(n));
  return i === -1 ? ORDER.length : i;
}

// Comparator for anything with a name: the owner's sequence first, then alphabetical
// inside the leftovers.
export function byDepartmentOrder<T extends { name: string | null }>(a: T, b: T): number {
  const d = departmentRank(a.name) - departmentRank(b.name);
  return d !== 0 ? d : (a.name || "").localeCompare(b.name || "");
}

// Sort without mutating the caller's array (React state arrays are shared).
export function sortDepartments<T extends { name: string | null }>(list: T[]): T[] {
  return [...list].sort(byDepartmentOrder);
}
