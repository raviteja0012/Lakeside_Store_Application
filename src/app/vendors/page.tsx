"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { chipClass, labelize } from "@/lib/status";
import { useActiveStore } from "@/lib/store";
import { REQUIRE_AUTH, useEffectiveActor } from "@/lib/auth";
import type { Vendor, Department, AppUser } from "@/lib/types";

const ACTOR_KEY = "rgs_actor";

export default function Vendors() {
  const { storeId, ready } = useActiveStore();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [actorId, setActorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", department_id: "", rep_name: "", phone: "", email: "", products_we_carry: "", default_terms: "", status: "active" });

  // Effective actor: the signed-in member in enforced auth, else the dropdown selection.
  const { effectiveActorId } = useEffectiveActor(users, actorId);

  async function load() {
    let query = supabase
      .from("vendor")
      .select("id, name, rep_name, phone, email, products_we_carry, default_terms, status, notes, department:department_id(name, accent_color)")
      .order("name");
    if (storeId) query = query.eq("store_id", storeId);
    const { data, error } = await query;
    if (error) setError(error.message);
    else setVendors((data as unknown as Vendor[]) || []);
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
      const dList = (ds as Department[]) || [];
      const usr = (us as AppUser[]) || [];
      setDepartments(dList);
      setUsers(usr);
      setForm((f) => ({ ...f, department_id: dList[0]?.id || "" }));
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

  async function save() {
    if (!form.name.trim() || !form.department_id) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("vendor").insert({
        store_id: storeId,
        name: form.name.trim(),
        department_id: form.department_id,
        rep_name: form.rep_name || null,
        phone: form.phone || null,
        email: form.email || null,
        products_we_carry: form.products_we_carry || null,
        default_terms: form.default_terms || null,
        status: form.status
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      if (effectiveActorId) await supabase.from("activity_log").insert({ actor_id: effectiveActorId, action: "vendor_added", entity: "vendor", entity_id: r.data.id as string });
      setForm({ name: "", department_id: departments[0]?.id || "", rep_name: "", phone: "", email: "", products_we_carry: "", default_terms: "", status: "active" });
      setAdding(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return vendors;
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(term) ||
        (v.products_we_carry || "").toLowerCase().includes(term) ||
        (v.rep_name || "").toLowerCase().includes(term)
    );
  }, [vendors, q]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Vendors</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="help">{vendors.length} in the directory</span>
          <button className="btn-primary" onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "+ Add vendor"}</button>
        </div>
      </div>

      {adding && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">Department</label>
              <select className="input" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div><label className="label">Rep</label><input className="input" value={form.rep_name} onChange={(e) => setForm({ ...form, rep_name: e.target.value })} /></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="label">Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label">Default terms</label><input className="input" value={form.default_terms} onChange={(e) => setForm({ ...form, default_terms: e.target.value })} /></div>
            <div><label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {["active", "skip", "discontinue", "bankrupt"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {!REQUIRE_AUTH && (
              <div><label className="label">Acting as</label>
                <select className="input" value={actorId} onChange={(e) => setActor(e.target.value)}>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div><label className="label">Products we carry</label><input className="input" value={form.products_we_carry} onChange={(e) => setForm({ ...form, products_we_carry: e.target.value })} /></div>
          <div><button className="btn-primary" onClick={save} disabled={busy || !form.name.trim()}>{busy ? "Saving." : "Save vendor"}</button></div>
        </div>
      )}

      <input
        className="input"
        placeholder="Search by name, product, or rep"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 16 }}
        aria-label="Search vendors"
      />

      {loading && <p className="help">Loading vendors.</p>}
      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="chip chip-error">Error</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p className="help" style={{ margin: 0 }}>No vendors match that search.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((v) => (
          <Link key={v.id} href={`/vendors/${v.id}`} className="card" style={{ padding: 14, textDecoration: "none", color: "inherit", display: "block" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 15 }}>{v.name}</strong>
              {v.department && <span className="chip" style={{ background: "#EEF1F4", color: v.department.accent_color || "#6B7480" }}>{v.department.name}</span>}
              <span className={`chip ${chipClass(v.status)}`}>{labelize(v.status)}</span>
              {v.default_terms && <span className="chip chip-neutral">{v.default_terms}</span>}
            </div>
            {v.products_we_carry && <div className="help" style={{ marginTop: 6 }}>{v.products_we_carry}</div>}
            {(v.rep_name || v.phone) && (
              <div className="help" style={{ marginTop: 4 }}>
                {v.rep_name}{v.rep_name && v.phone ? " . " : ""}{v.phone}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
