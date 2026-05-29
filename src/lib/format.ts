// Shared formatting and date helpers. Money is numeric dollars in the demo (see schema.sql).

export function formatCAD(value: number | null | undefined): string {
  const n = typeof value === "number" && isFinite(value) ? value : 0;
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
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
