"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { labelize } from "@/lib/status";
import { daysOverdue, dueBand } from "@/lib/format";
import { useActiveStore } from "@/lib/store";
import type { MaintenanceAsset, MaintenanceTask, AppUser, Department } from "@/lib/types";

const ACTOR_KEY = "rgs_actor";
const CATEGORIES = ["building", "refrigeration", "equipment", "grounds", "safety", "other"];
const RECURRENCES = ["none", "weekly", "monthly", "seasonal", "annual"];

export default function Maintenance() {
  const { storeId, ready } = useActiveStore();
  const [assets, setAssets] = useState<MaintenanceAsset[]>([]);
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [actorId, setActorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addAsset, setAddAsset] = useState(false);
  const [editAsset, setEditAsset] = useState<string | null>(null);
  const [aForm, setAForm] = useState({ name: "", category: "building", location: "", department_id: "", notes: "" });

  const [addTask, setAddTask] = useState(false);
  const [tForm, setTForm] = useState({ title: "", detail: "", asset_id: "", due_date: "", recurrence: "none", assigned_to: "" });

  async function load() {
    const a = await supabase
      .from("maintenance_asset")
      .select("id, store_id, department_id, name, category, location, notes, department:department_id(name, accent_color)")
      .order("name");
    if (a.error) { setError(a.error.message); return; }
    setAssets((a.data as unknown as MaintenanceAsset[]) || []);
    const t = await supabase
      .from("maintenance_task")
      .select("id, store_id, asset_id, title, detail, due_date, recurrence, status, assigned_to, completed_at, asset:asset_id(name), assignee:assigned_to(full_name)")
      .order("due_date", { ascending: true });
    setTasks((t.data as unknown as MaintenanceTask[]) || []);
  }

  useEffect(() => {
    if (!ready) return;
    (async () => {
      await load();
      const { data: ds } = await supabase.from("department").select("id, name, accent_color, parent_department_id").order("name");
      const { data: us } = await supabase.from("app_user").select("id, full_name, role").order("full_name");
      const usr = (us as AppUser[]) || [];
      setDepartments((ds as Department[]) || []);
      setUsers(usr);
      const saved = typeof window !== "undefined" ? localStorage.getItem(ACTOR_KEY) : null;
      setActorId(saved || usr[0]?.id || "");
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  function setActor(uid: string) {
    setActorId(uid);
    if (typeof window !== "undefined") localStorage.setItem(ACTOR_KEY, uid);
  }
  async function log(action: string, entity: string, entity_id: string | null) {
    if (actorId) await supabase.from("activity_log").insert({ actor_id: actorId, action, entity, entity_id });
  }

  function startAddAsset() {
    setEditAsset(null);
    setAForm({ name: "", category: "building", location: "", department_id: "", notes: "" });
    setAddAsset(true);
  }
  function startEditAsset(a: MaintenanceAsset) {
    setAddAsset(false);
    setAForm({ name: a.name, category: a.category || "building", location: a.location || "", department_id: a.department_id || "", notes: a.notes || "" });
    setEditAsset(a.id);
  }

  async function saveAsset() {
    if (!aForm.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const row = {
        name: aForm.name.trim(),
        category: aForm.category,
        location: aForm.location || null,
        department_id: aForm.department_id || null,
        notes: aForm.notes || null
      };
      if (editAsset) {
        const r = await supabase.from("maintenance_asset").update(row).eq("id", editAsset);
        if (r.error) throw new Error(r.error.message);
        await log("asset_edited", "maintenance_asset", editAsset);
      } else {
        const r = await supabase.from("maintenance_asset").insert({ ...row, store_id: storeId }).select("id").single();
        if (r.error) throw new Error(r.error.message);
        await log("asset_added", "maintenance_asset", r.data.id as string);
      }
      setAddAsset(false);
      setEditAsset(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveTask() {
    if (!tForm.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("maintenance_task").insert({
        store_id: storeId,
        asset_id: tForm.asset_id || null,
        title: tForm.title.trim(),
        detail: tForm.detail || null,
        due_date: tForm.due_date || null,
        recurrence: tForm.recurrence,
        status: "open",
        assigned_to: tForm.assigned_to || null,
        created_by: actorId || null
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      await log("task_added", "maintenance_task", r.data.id as string);
      setAddTask(false);
      setTForm({ title: "", detail: "", asset_id: "", due_date: "", recurrence: "none", assigned_to: "" });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function assignTask(taskId: string, uid: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("maintenance_task").update({ assigned_to: uid || null }).eq("id", taskId);
      if (r.error) throw new Error(r.error.message);
      await log("task_assigned", "maintenance_task", taskId);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setTaskStatus(taskId: string, status: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("maintenance_task")
        .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
        .eq("id", taskId);
      if (r.error) throw new Error(r.error.message);
      await log(status === "done" ? "task_completed" : "task_status_changed", "maintenance_task", taskId);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Group tasks: overdue (open/in_progress past due), due soon (within 7 days), open (rest), done.
  const groups = useMemo(() => {
    const overdue: MaintenanceTask[] = [];
    const dueSoon: MaintenanceTask[] = [];
    const open: MaintenanceTask[] = [];
    const done: MaintenanceTask[] = [];
    for (const t of tasks) {
      if (t.status === "done") { done.push(t); continue; }
      const d = daysOverdue(t.due_date);
      if (d != null && d > 0) overdue.push(t);
      else if (d != null && d >= -7) dueSoon.push(t);
      else open.push(t);
    }
    return { overdue, dueSoon, open, done };
  }, [tasks]);

  function TaskCard({ t }: { t: MaintenanceTask }) {
    const band = t.status === "done" ? { cls: "chip-success", text: "done" } : dueBand(t.due_date, 7);
    return (
      <div className="card" style={{ padding: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <strong>{t.title}</strong>
              <span className={`chip ${band.cls}`}>{t.status === "done" ? "done" : (t.due_date ? band.text : "no due date")}</span>
              {t.recurrence !== "none" && <span className="chip chip-neutral">{t.recurrence}</span>}
              <span className={`chip ${t.status === "in_progress" ? "chip-progress" : "chip-neutral"}`}>{labelize(t.status)}</span>
            </div>
            <div className="help" style={{ marginTop: 4 }}>
              {t.asset?.name || "No asset"}{t.due_date ? ` . due ${t.due_date}` : ""}{t.detail ? ` . ${t.detail}` : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label className="help" htmlFor={`assign-${t.id}`}>Assigned</label>
          <select id={`assign-${t.id}`} className="input" style={{ width: "auto", padding: "4px 8px", fontSize: 13 }} value={t.assigned_to || ""} onChange={(e) => assignTask(t.id, e.target.value)} disabled={busy}>
            <option value="">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          {t.status !== "done" && t.status !== "in_progress" && (
            <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => setTaskStatus(t.id, "in_progress")} disabled={busy}>Start</button>
          )}
          {t.status !== "done" && (
            <button className="btn-primary" style={{ padding: "4px 10px" }} onClick={() => setTaskStatus(t.id, "done")} disabled={busy}>Mark complete</button>
          )}
          {t.status === "done" && (
            <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => setTaskStatus(t.id, "open")} disabled={busy}>Reopen</button>
          )}
        </div>
      </div>
    );
  }

  function Group({ title, list, accent }: { title: string; list: MaintenanceTask[]; accent?: string }) {
    if (list.length === 0) return null;
    return (
      <div style={{ marginBottom: 16 }}>
        <div className="help" style={{ marginBottom: 8, color: accent, fontWeight: 600 }}>{title} ({list.length})</div>
        <div style={{ display: "grid", gap: 8 }}>{list.map((t) => <TaskCard key={t.id} t={t} />)}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Property and maintenance</h1>
        <div>
          <label className="help" htmlFor="actor">Acting as </label>
          <select id="actor" className="input" style={{ width: "auto", display: "inline-block", padding: "6px 8px" }} value={actorId} onChange={(e) => setActor(e.target.value)}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
          </select>
        </div>
      </div>

      {loading && <p className="help">Loading.</p>}
      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Error</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}

      {!loading && (
        <>
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>Tasks</h2>
              <button className="btn-ghost" onClick={() => setAddTask((s) => !s)}>{addTask ? "Close" : "+ Add task"}</button>
            </div>
            {addTask && (
              <div className="card" style={{ padding: 14, marginBottom: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                  <div><label className="label">Title</label><input className="input" value={tForm.title} onChange={(e) => setTForm({ ...tForm, title: e.target.value })} /></div>
                  <div><label className="label">Asset</label>
                    <select className="input" value={tForm.asset_id} onChange={(e) => setTForm({ ...tForm, asset_id: e.target.value })}>
                      <option value="">No asset</option>
                      {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Due date</label><input className="input" type="date" value={tForm.due_date} onChange={(e) => setTForm({ ...tForm, due_date: e.target.value })} /></div>
                  <div><label className="label">Recurrence</label>
                    <select className="input" value={tForm.recurrence} onChange={(e) => setTForm({ ...tForm, recurrence: e.target.value })}>
                      {RECURRENCES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Assign to</label>
                    <select className="input" value={tForm.assigned_to} onChange={(e) => setTForm({ ...tForm, assigned_to: e.target.value })}>
                      <option value="">Unassigned</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </div>
                </div>
                <div><label className="label">Detail</label><input className="input" value={tForm.detail} onChange={(e) => setTForm({ ...tForm, detail: e.target.value })} /></div>
                <div><button className="btn-primary" onClick={saveTask} disabled={busy || !tForm.title.trim()}>{busy ? "Saving." : "Save task"}</button></div>
              </div>
            )}
            {tasks.length === 0 && <p className="help">No tasks yet. Add one with + Add task.</p>}
            <Group title="Overdue" list={groups.overdue} accent="var(--error-base)" />
            <Group title="Due soon" list={groups.dueSoon} accent="var(--warning-base)" />
            <Group title="Open" list={groups.open} />
            <Group title="Done" list={groups.done} accent="var(--success-base)" />
          </section>

          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>Assets and service accounts</h2>
              <button className="btn-ghost" onClick={startAddAsset}>{addAsset ? "Close" : "+ Add asset"}</button>
            </div>
            {(addAsset || editAsset) && (
              <div className="card" style={{ padding: 14, marginBottom: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                  <div><label className="label">Name</label><input className="input" value={aForm.name} onChange={(e) => setAForm({ ...aForm, name: e.target.value })} /></div>
                  <div><label className="label">Category</label>
                    <select className="input" value={aForm.category} onChange={(e) => setAForm({ ...aForm, category: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Location</label><input className="input" value={aForm.location} onChange={(e) => setAForm({ ...aForm, location: e.target.value })} /></div>
                  <div><label className="label">Department</label>
                    <select className="input" value={aForm.department_id} onChange={(e) => setAForm({ ...aForm, department_id: e.target.value })}>
                      <option value="">Store-wide</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
                <div><label className="label">Notes</label><input className="input" value={aForm.notes} onChange={(e) => setAForm({ ...aForm, notes: e.target.value })} /></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-primary" onClick={saveAsset} disabled={busy || !aForm.name.trim()}>{busy ? "Saving." : "Save asset"}</button>
                  <button className="btn-ghost" onClick={() => { setAddAsset(false); setEditAsset(null); }}>Cancel</button>
                </div>
              </div>
            )}
            {assets.length === 0 && <p className="help">No assets yet.</p>}
            <div style={{ display: "grid", gap: 8 }}>
              {assets.map((a) => (
                <div key={a.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{a.name}</strong>
                      {a.category && <span className="chip chip-neutral">{a.category}</span>}
                      {a.department && <span className="chip" style={{ background: "#EEF1F4", color: a.department.accent_color || "#6B7480" }}>{a.department.name}</span>}
                    </div>
                    <div className="help" style={{ marginTop: 4 }}>{[a.location, a.notes].filter(Boolean).join(" . ")}</div>
                  </div>
                  <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startEditAsset(a)}>Edit</button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
