// Notification computation for the bell. One place to read the alerts a store owner or
// manager cares about: overdue invoices, licence expiry, insurance renewals, maintenance due.
// Every query filters the active store and excludes voided rows. Degrades to [] on any error
// so the bell never throws, even with blank Supabase env.

import { supabase } from "@/lib/supabaseClient";
import { formatCAD, todayISO, daysOverdue } from "@/lib/format";

export type Notification = {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail?: string;
  href: string;
};

type InvRow = { amount: number | null; due_date: string | null; status: string };
type LicRow = { id: string; name: string; expiry_date: string | null };
type PolRow = { id: string; name: string; renewal_date: string | null };
type TaskRow = { id: string; due_date: string | null; status: string };

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export async function loadNotifications(storeId: string): Promise<Notification[]> {
  if (!storeId) return [];
  const out: Notification[] = [];
  const today = todayISO();

  try {
    // Overdue invoices: unpaid and past due. One rolled-up item with the total past due.
    const inv = await supabase
      .from("invoice")
      .select("amount, due_date, status")
      .eq("store_id", storeId)
      .is("voided_at", null)
      .eq("status", "unpaid");
    if (!inv.error) {
      const rows = (inv.data as unknown as InvRow[]) || [];
      let count = 0;
      let total = 0;
      for (const r of rows) {
        const d = daysOverdue(r.due_date);
        if (d != null && d > 0) {
          count++;
          total += Number(r.amount) || 0;
        }
      }
      if (count > 0) {
        out.push({
          id: "overdue-invoices",
          severity: "error",
          title: `${plural(count, "invoice", "invoices")} overdue`,
          detail: formatCAD(total),
          href: "/overdue"
        });
      }
    }

    // Licence expiry: each licence within 30 days or already past gets an item.
    const lic = await supabase
      .from("licence")
      .select("id, name, expiry_date")
      .eq("store_id", storeId)
      .is("voided_at", null);
    if (!lic.error) {
      for (const l of ((lic.data as unknown as LicRow[]) || [])) {
        const d = daysOverdue(l.expiry_date);
        if (d == null) continue;
        if (d > 0) {
          out.push({
            id: `licence-${l.id}`,
            severity: "error",
            title: `${l.name} expired`,
            detail: `${plural(d, "day", "days")} ago`,
            href: "/compliance"
          });
        } else if (-d <= 30) {
          const remaining = -d;
          out.push({
            id: `licence-${l.id}`,
            severity: "warning",
            title: `${l.name} expiring`,
            detail: remaining === 0 ? "expires today" : `in ${plural(remaining, "day", "days")}`,
            href: "/compliance"
          });
        }
      }
    }

    // Insurance renewals: each policy within 30 days or past renewal date gets an item.
    const pol = await supabase
      .from("insurance_policy")
      .select("id, name, renewal_date")
      .eq("store_id", storeId)
      .is("voided_at", null);
    if (!pol.error) {
      for (const p of ((pol.data as unknown as PolRow[]) || [])) {
        const d = daysOverdue(p.renewal_date);
        if (d == null) continue;
        if (d >= 0 || -d <= 30) {
          const detail =
            d > 0 ? `${plural(d, "day", "days")} overdue` : d === 0 ? "renews today" : `in ${plural(-d, "day", "days")}`;
          out.push({
            id: `policy-${p.id}`,
            severity: "warning",
            title: `${p.name} renewal`,
            detail,
            href: "/compliance"
          });
        }
      }
    }

    // Maintenance due: open or in-progress tasks due within the next 7 days (or already due).
    const task = await supabase
      .from("maintenance_task")
      .select("id, due_date, status")
      .eq("store_id", storeId)
      .is("voided_at", null)
      .neq("status", "done");
    if (!task.error) {
      const rows = (task.data as unknown as TaskRow[]) || [];
      let due = 0;
      for (const t of rows) {
        const d = daysOverdue(t.due_date);
        if (d != null && d >= -7) due++;
      }
      if (due > 0) {
        out.push({
          id: "maintenance-due",
          severity: "warning",
          title: `${plural(due, "maintenance task", "maintenance tasks")} due`,
          detail: "within 7 days",
          href: "/maintenance"
        });
      }
    }
  } catch {
    return [];
  }

  return out;
}
