// HR helpers: week math (Monday start) and shift hours from HH:MM time strings.

import type { PayRate } from "@/lib/types";

// Monday of the week containing the given YYYY-MM-DD date, as YYYY-MM-DD.
export function weekStart(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const back = dow === 0 ? 6 : dow - 1; // days back to Monday
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekDays(startISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startISO, i));
}

export const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Decimal hours between two HH:MM strings. Returns 0 if either is missing or end <= start.
export function shiftHours(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => isNaN(n))) return 0;
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
}

// The hourly rate in effect on a given date from an employee's effective-dated pay rates.
// Salary rows are not an hourly figure, so they return null for the hourly pay calc.
export function hourlyRateOn(rates: PayRate[], dateISO: string): number | null {
  const applicable = rates
    .filter((r) => r.unit === "hour" && r.effective_date && r.effective_date <= dateISO && r.rate != null)
    .sort((a, b) => (a.effective_date! < b.effective_date! ? 1 : -1));
  return applicable.length ? Number(applicable[0].rate) : null;
}
