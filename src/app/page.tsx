"use client";

// Home is role-driven. Owners and managers land on the command dashboard; staff and leads
// (and a manager previewing staff) land on Today: a greeting, today's duty checklist, the
// few actions a seasonal hire needs as big tiles, then the live feed.

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useActiveStore } from "@/lib/store";
import { currentActorId, useMember } from "@/lib/auth";
import { useViewRole, isManagerView } from "@/lib/view";
import { completeTask, completedToday, dueToday, type TaskLite } from "@/lib/tasks";
import CommandDashboard from "@/components/CommandDashboard";
import StaffFeed from "@/components/StaffFeed";
import { Icon } from "@/components/AppShell";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

type DutyTask = TaskLite & { id: string; title: string; detail: string | null };

// Today's duties: every open task that is due today (daily duties, plus anything overdue).
// Ticking one stamps the completion under the signed-in person (or the Acting-as pick in
// demo mode) and rolls a recurring task's due date forward. Renders nothing when there is
// nothing due, and stays quiet on errors (the Maintenance screen is the full view).
function TodayTasks() {
  const { storeId, ready } = useActiveStore();
  const { member } = useMember();
  const [tasks, setTasks] = useState<DutyTask[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    // Open tasks, plus anything completed in the last two days so today's finished one-offs
    // still show (the window is a superset; completedToday() applies the exact local-day cut).
    const since = new Date(Date.now() - 2 * 86400000).toISOString();
    let q = supabase
      .from("maintenance_task")
      .select("id, title, detail, due_date, recurrence, status, completed_at")
      .is("voided_at", null)
      .or(`status.neq.done,completed_at.gte.${since}`);
    if (storeId) q = q.eq("store_id", storeId);
    const { data, error } = await q;
    if (!error) setTasks((data as unknown as DutyTask[]) || []);
  }

  useEffect(() => {
    if (!ready) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  async function markDone(t: DutyTask) {
    setBusy(true);
    try {
      const err = await completeTask(t, currentActorId(member));
      if (!err) await load();
    } finally {
      setBusy(false);
    }
  }

  const due = tasks.filter((t) => dueToday(t));
  const doneNow = tasks.filter((t) => completedToday(t));
  if (!due.length && !doneNow.length) return null;

  return (
    <div className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <strong>Today&apos;s tasks</strong>
        <span className="help">{due.length === 0 ? "All done. Nice work." : `${due.length} to do`}</span>
      </div>
      {due.map((t) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-primary" style={{ padding: "6px 14px", flexShrink: 0 }} onClick={() => markDone(t)} disabled={busy}>
            Done
          </button>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>{t.title}</span>
            {t.recurrence !== "none" && <span className="chip chip-neutral" style={{ marginLeft: 8 }}>{t.recurrence}</span>}
            {t.detail && <span className="help" style={{ display: "block" }}>{t.detail}</span>}
          </div>
        </div>
      ))}
      {doneNow.map((t) => (
        <div key={t.id} className="help" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="chip chip-success">done</span>
          <span style={{ textDecoration: "line-through" }}>{t.title}</span>
        </div>
      ))}
    </div>
  );
}

function StaffToday() {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <header className="page-head">
        <div>
          <h1 className="page-title">{greeting()}.</h1>
          <p className="page-sub">A delivery just arrived? Capture it before it goes on the shelf.</p>
        </div>
      </header>

      <TodayTasks />

      <div className="action-grid">
        <Link href="/capture" className="action-tile primary">
          <span className="kpi-icon"><Icon name="capture" size={20} /></span>
          Capture a delivery
          <span className="help">Snap the invoice, check it, save</span>
        </Link>
        <Link href="/hr/schedule" className="action-tile">
          <span className="kpi-icon"><Icon name="schedule" size={20} /></span>
          My schedule
          <span className="help">This week&apos;s shifts</span>
        </Link>
        <Link href="/ask" className="action-tile">
          <span className="kpi-icon"><Icon name="ask" size={20} /></span>
          Ask the store
          <span className="help">How do we do this here?</span>
        </Link>
        <Link href="/knowledge" className="action-tile">
          <span className="kpi-icon"><Icon name="knowledge" size={20} /></span>
          Knowledge
          <span className="help">Notes from the team</span>
        </Link>
      </div>

      <StaffFeed />
    </div>
  );
}

export default function Home() {
  const { viewRole } = useViewRole();

  // Until the role resolves, show a quiet placeholder rather than flashing the wrong home.
  if (!viewRole) return <p className="help">Loading.</p>;

  return isManagerView(viewRole) ? <CommandDashboard /> : <StaffToday />;
}
