// Shared formatting and date helpers. Money is numeric dollars in the demo (see schema.sql).

export function formatCAD(value: number | null | undefined): string {
  const n = typeof value === "number" && isFinite(value) ? value : 0;
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Ontario HST. 13% is the working default for both candidate store locations (Dorset and
// Atikokan are both in Ontario). See robinsons_store_build_spec.md: "13 percent HST is the
// working default... Show HST as a separate line." Kept here so capture and the vendor
// invoice form share one rate; move to a per-province tax_rules lookup when portability lands.
export const HST_RATE = 0.13;

// HST dollars owed on a pre-tax amount, rounded to cents. Null/blank/non-finite input yields 0.
export function hstOn(preTax: number | null | undefined): number {
  const n = typeof preTax === "number" && isFinite(preTax) ? preTax : 0;
  return round2(n * HST_RATE);
}

// Store-local date as YYYY-MM-DD. For the demo we treat the runtime local date as store time.
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// Whole days a YYYY-MM-DD date is past today. Positive means overdue, negative means days remaining, null if no date.
export function daysOverdue(dateISO: string | null | undefined): number | null {
  if (!dateISO) return null;
  // Anchor both dates at UTC midnight so each day is exactly 86400000 ms (no DST drift).
  const today = Date.parse(todayISO() + "T00:00:00Z");
  const target = Date.parse(dateISO + "T00:00:00Z");
  if (isNaN(target)) return null;
  return Math.round((today - target) / 86400000);
}

// Status band for a due or expiry date, with a configurable warning window in days.
// Overdue is red (error), within the window is amber (warning), else neutral. One hue per meaning.
export function dueBand(dateISO: string | null | undefined, windowDays: number): { cls: string; text: string } {
  const d = daysOverdue(dateISO);
  if (d == null) return { cls: "chip-neutral", text: "no date" };
  if (d > 0) return { cls: "chip-error", text: `${d} ${d === 1 ? "day" : "days"} overdue` };
  if (d === 0) return { cls: "chip-warning", text: "due today" };
  const remaining = -d;
  if (remaining <= windowDays) return { cls: "chip-warning", text: `in ${remaining} ${remaining === 1 ? "day" : "days"}` };
  return { cls: "chip-neutral", text: `in ${remaining} days` };
}
