// Daily-checklist helpers for recurring maintenance and duty tasks. A recurring task is
// never "finished": completing it stamps completed_at, rolls due_date forward one cadence,
// and leaves it open for next time. These helpers keep that date math and the "what counts
// as today's work" rules in one place for the staff Today list, the owner dashboard, and
// the Maintenance screen.

import { supabase } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/format";

export type TaskLite = {
  due_date: string | null;
  recurrence: string;
  status: string;
  completed_at: string | null;
};

// Next due date after completing a recurring task today. Rolls forward from today (not from
// an overdue due_date), so a task three days late completed now is due one clean cadence out.
export function nextDue(recurrence: string, fromISO?: string): string | null {
  const base = fromISO || todayISO();
  const d = new Date(base + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  switch (recurrence) {
    case "daily":
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "monthly": {
      // Adding a month naively overflows at month end (Jan 31 + 1 month lands in March).
      // Clamp to the last day of the target month instead.
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + 1);
      const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      d.setUTCDate(Math.min(day, lastDay));
      break;
    }
    case "seasonal":
    case "annual":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
    default:
      return null;
  }
  return d.toISOString().slice(0, 10);
}

// The one shared completion write, so ticking a task off behaves identically on the staff
// Today checklist and the Maintenance screen: a recurring task stamps completed_at and rolls
// its due date one cadence forward, staying open; a one-off closes. The audit row is written
// only with a known actor, matching every other log call in the app. Returns an error
// message, or null on success.
export async function completeTask(
  t: { id: string; recurrence: string },
  actorId: string | null
): Promise<string | null> {
  const patch =
    t.recurrence !== "none"
      ? { completed_at: new Date().toISOString(), due_date: nextDue(t.recurrence), status: "open" }
      : { completed_at: new Date().toISOString(), status: "done" };
  const r = await supabase.from("maintenance_task").update(patch).eq("id", t.id);
  if (r.error) return r.error.message;
  if (actorId) {
    await supabase.from("activity_log").insert({ actor_id: actorId, action: "task_completed", entity: "maintenance_task", entity_id: t.id });
  }
  return null;
}

// Completed on the current calendar day (local time, matching how staff think about "today").
export function completedToday(t: TaskLite): boolean {
  if (!t.completed_at) return false;
  const c = new Date(t.completed_at);
  const now = new Date();
  return (
    c.getFullYear() === now.getFullYear() && c.getMonth() === now.getMonth() && c.getDate() === now.getDate()
  );
}

// Part of today's work: open, and either a daily duty or anything due today or overdue.
// A daily task with no due date still shows every day; that is what daily means.
export function dueToday(t: TaskLite, today: string = todayISO()): boolean {
  if (t.status === "done") return false;
  if (completedToday(t)) return false;
  return t.due_date ? t.due_date <= today : t.recurrence === "daily";
}
