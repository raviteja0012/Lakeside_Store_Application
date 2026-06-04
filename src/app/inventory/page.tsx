"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/format";
import { useActiveStore } from "@/lib/store";
import { REQUIRE_AUTH, useEffectiveActor } from "@/lib/auth";
import { canEdit, voidRow } from "@/lib/edit";
import type { Department, AppUser, Item } from "@/lib/types";

const ACTOR_KEY = "rgs_actor";

type CountRow = {
  id: string;
  counted_date: string | null;
  created_at: string;
  department: { name: string; accent_color: string | null } | null;
  inventory_count_line: { counted_qty: number | null }[];
};

export default function Inventory() {
  const { storeId, ready } = useActiveStore();
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [actorId, setActorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [deptId, setDeptId] = useState("");
  const [countDate, setCountDate] = useState(todayISO());
  const [qty, setQty] = useState<Record<string, string>>({});

  // Effective actor: the signed-in member in enforced auth, else the dropdown selection.
  const { effectiveActorId, role } = useEffectiveActor(users, actorId);

  async function load() {
    let query = supabase
      .from("inventory_count")
      .select("id, counted_date, created_at, department:department_id(name, accent_color), inventory_count_line(counted_qty)")
      .is("voided_at", null)
      .order("created_at", { ascending: false })
      .limit(30);
    if (storeId) query = query.eq("store_id", storeId);
    const { data, error } = await query;
    if (error) setError(error.message);
    else setCounts((data as unknown as CountRow[]) || []);
  }

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    (async () => {
      await load();
      let dq = supabase.from("department").select("id, name, accent_color, parent_department_id").order("name");
      if (storeId) dq = dq.eq("store_id", storeId);
      const { data: ds } = await dq;
      const { data: us } = await supabase.from("app_user").select("id, full_name, role").order("full_name");
      let iq = supabase.from("item").select("id, department_id, name, uom, retail_price, sku").order("name");
      if (storeId) iq = iq.eq("store_id", storeId);
      const { data: it } = await iq;
      const dList = (ds as Department[]) || [];
      const usr = (us as AppUser[]) || [];
      setDepartments(dList);
      setUsers(usr);
      setItems((it as unknown as Item[]) || []);
      setDeptId(dList.find((d) => d.name === "Garden Center")?.id || dList[0]?.id || "");
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

  const deptItems = useMemo(() => items.filter((i) => i.department_id === deptId), [items, deptId]);

  async function save() {
    if (!deptId) return;
    const lines = deptItems
      .filter((i) => (qty[i.id] ?? "").trim() !== "")
      .map((i) => ({ item_id: i.id, counted_qty: Number(qty[i.id]) }));
    if (lines.length === 0) {
      setError("Enter a count for at least one item.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const c = await supabase.from("inventory_count").insert({ store_id: storeId, department_id: deptId, counted_date: countDate || null, created_by: effectiveActorId }).select("id").single();
      if (c.error) throw new Error(c.error.message);
      const countId = c.data.id as string;
      const li = await supabase.from("inventory_count_line").insert(lines.map((l) => ({ ...l, inventory_count_id: countId })));
      if (li.error) throw new Error(li.error.message);
      if (effectiveActorId) await supabase.from("activity_log").insert({ actor_id: effectiveActorId, action: "inventory_counted", entity: "inventory_count", entity_id: countId });
      setAdding(false);
      setQty({});
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeCount(c: CountRow) {
    const label = c.department?.name ? `${c.department.name} count` : "this count";
    if (!window.confirm(`Delete ${label}? It will be hidden but kept for the record.`)) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("inventory_count", c.id, effectiveActorId);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Inventory counts</h1>
        <button className="btn-primary" onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "+ New count"}</button>
      </div>
      <p className="help" style={{ marginTop: -8, marginBottom: 16 }}>Count what is on the shelf, by department. Each count is saved with who and when.</p>

      {adding && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div><label className="label">Department</label>
              <select className="input" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div><label className="label">Count date</label><input className="input" type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} /></div>
            {!REQUIRE_AUTH && (
              <div><label className="label">Acting as</label>
                <select className="input" value={actorId} onChange={(e) => setActor(e.target.value)}>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
            )}
          </div>

          {deptItems.length === 0 ? (
            <p className="help">No items in this department yet. Add items first (capture or the catalog), then count them here.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {deptItems.map((i) => (
                <div key={i.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <strong style={{ fontSize: 14 }}>{i.name}</strong>
                    {i.uom && <span className="help"> per {i.uom}</span>}
                  </div>
                  <input
                    className="input tabular"
                    style={{ width: 110 }}
                    type="number"
                    step="1"
                    placeholder="qty"
                    value={qty[i.id] ?? ""}
                    onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })}
                    aria-label={`Count for ${i.name}`}
                  />
                </div>
              ))}
            </div>
          )}
          <div><button className="btn-primary" onClick={save} disabled={busy || deptItems.length === 0}>{busy ? "Saving." : "Save count"}</button></div>
        </div>
      )}

      {loading && <p className="help">Loading counts.</p>}
      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="chip chip-error">Error</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}
      {!loading && !error && counts.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p className="help" style={{ margin: 0 }}>No counts yet. Start one with + New count.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {counts.map((c) => {
          const lines = c.inventory_count_line || [];
          const totalQty = lines.reduce((s, l) => s + (Number(l.counted_qty) || 0), 0);
          return (
            <div key={c.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {c.department && <span className="chip" style={{ background: "#EEF1F4", color: c.department.accent_color || "#6B7480" }}>{c.department.name}</span>}
                <span className="help">{c.counted_date || new Date(c.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="tabular" style={{ textAlign: "right" }}>
                  <strong>{lines.length}</strong> <span className="help">items</span> . <strong>{totalQty}</strong> <span className="help">units</span>
                </div>
                {canEdit(role) && (
                  <button className="btn-ghost" style={{ padding: "4px 10px", color: "var(--error-base)" }} onClick={() => removeCount(c)} disabled={busy}>Delete</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
