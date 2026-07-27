"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { chipClass, labelize } from "@/lib/status";
import { useActiveStore } from "@/lib/store";
import { REQUIRE_AUTH, useEffectiveActor } from "@/lib/auth";
import { canEdit, voidRow } from "@/lib/edit";
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
  // The directory is organized the way the store thinks: by department. "all" shows
  // grouped sections; a chip narrows to one category (sections roll up into parents).
  const [catFilter, setCatFilter] = useState<string>("all");

  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", department_id: "", rep_name: "", phone: "", email: "", products_we_carry: "", default_terms: "", status: "active", notes: "" });

  // Effective actor: the signed-in member in enforced auth, else the dropdown selection.
  const { effectiveActorId, role } = useEffectiveActor(users, actorId);

  async function load() {
    let query = supabase
      .from("vendor")
      .select("id, name, department_id, rep_name, phone, email, products_we_carry, default_terms, status, notes, department:department_id(name, accent_color)")
      .is("voided_at", null)
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
      const { data: ds, error: derr } = await dq;
      if (derr) setError(derr.message);
      const { data: us } = await supabase.from("app_user").select("id, full_name, role").order("full_name");
      const dList = (ds as Department[]) || [];
      const usr = (us as AppUser[]) || [];
      setDepartments(dList);
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

  async function save() {
    if (!form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("vendor").insert({
        store_id: storeId,
        name: form.name.trim(),
        department_id: form.department_id || null,
        rep_name: form.rep_name || null,
        phone: form.phone || null,
        email: form.email || null,
        products_we_carry: form.products_we_carry || null,
        default_terms: form.default_terms || null,
        status: form.status,
        notes: form.notes.trim() || null
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      if (effectiveActorId) await supabase.from("activity_log").insert({ actor_id: effectiveActorId, action: "vendor_added", entity: "vendor", entity_id: r.data.id as string });
      setForm({ name: "", department_id: departments[0]?.id || "", rep_name: "", phone: "", email: "", products_we_carry: "", default_terms: "", status: "active", notes: "" });
      setAdding(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeVendor(v: Vendor) {
    if (!window.confirm(`Delete ${v.name}? It will be hidden from the directory but kept for the tax history.`)) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("vendor", v.id, effectiveActorId);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const topCats = useMemo(() => departments.filter((d) => !d.parent_department_id), [departments]);
  // Roll a section (Clothing, Gifts, Garden Center) up into its top-level category.
  const topOf = useMemo(() => {
    const parent = new Map(departments.map((d) => [d.id, d.parent_department_id]));
    return (id: string | null | undefined): string | null => {
      if (!id) return null;
      const p = parent.get(id);
      return (p as string | null) || id;
    };
  }, [departments]);

  const searched = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return vendors;
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(term) ||
        (v.products_we_carry || "").toLowerCase().includes(term) ||
        (v.rep_name || "").toLowerCase().includes(term)
    );
  }, [vendors, q]);
  const filtered = useMemo(
    () => (catFilter === "all" ? searched : searched.filter((v) => topOf(v.department_id) === catFilter)),
    [searched, catFilter, topOf]
  );
  // Grouped sections for browsing: every top category with its vendors alphabetical
  // inside, and the vendors still waiting for a category at the end (a quiet cleanup
  // list). Searching or picking a chip switches to the flat filtered list.
  const grouped = useMemo(() => {
    const groups = topCats
      .map((d) => ({ id: d.id as string, name: d.name as string, rows: searched.filter((v) => topOf(v.department_id) === d.id) }))
      .filter((g) => g.rows.length > 0);
    const none = searched.filter((v) => !v.department_id);
    if (none.length) groups.push({ id: "none", name: "No category yet", rows: none });
    return groups;
  }, [topCats, searched, topOf]);
  const catCount = (id: string) => vendors.filter((v) => topOf(v.department_id) === id).length;

  return (
    <div>
      <header className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Vendors</h1>
          <p className="page-sub">{vendors.length} in the directory</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "+ Add vendor"}</button>
        </div>
      </header>

      {adding && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">Department (optional)</label>
              <select className="input" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">Multi-department / Unknown</option>
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
          <div><label className="label">Products we carry</label><input className="input" placeholder="Mugs, wallets, everyday gifts (comma-separated)" value={form.products_we_carry} onChange={(e) => setForm({ ...form, products_we_carry: e.target.value })} /></div>
          <div><label className="label">Notes (optional)</label><input className="input" placeholder="Rep visits in summer, order by March" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div><button className="btn-primary" onClick={save} disabled={busy || !form.name.trim()}>{busy ? "Saving." : "Save vendor"}</button></div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          className="chip"
          style={{ cursor: "pointer", border: catFilter === "all" ? "1px solid var(--primary)" : "1px solid var(--border)", background: "#EEF1F4" }}
          onClick={() => setCatFilter("all")}
        >
          All . {vendors.length}
        </button>
        {topCats.map((d) => (
          <button
            key={d.id}
            className="chip"
            style={{ cursor: "pointer", border: catFilter === d.id ? "1px solid var(--primary)" : "1px solid var(--border)", background: "#EEF1F4", color: d.accent_color || undefined }}
            onClick={() => setCatFilter(catFilter === d.id ? "all" : d.id)}
          >
            {d.name}{catCount(d.id) ? ` . ${catCount(d.id)}` : ""}
          </button>
        ))}
      </div>

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

      {(() => {
        const row = (v: Vendor) => (
          <Link key={v.id} href={`/vendors/${v.id}`} className="card" style={{ padding: 14, textDecoration: "none", color: "inherit", display: "block" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 15 }}>{v.name}</strong>
              {v.department && (
                <button
                  className="chip"
                  style={{ background: "#EEF1F4", color: v.department.accent_color || "#6B7480", cursor: "pointer", border: "none" }}
                  title={`Show all ${v.department.name} vendors`}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); const t = topOf(v.department_id); if (t) setCatFilter(t); }}
                >
                  {v.department.name}
                </button>
              )}
              <span className={`chip ${chipClass(v.status)}`}>{labelize(v.status)}</span>
              {v.default_terms && <span className="chip chip-neutral">{v.default_terms}</span>}
              {canEdit(role) && (
                <button
                  className="btn-ghost"
                  style={{ marginLeft: "auto", padding: "4px 10px" }}
                  disabled={busy}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeVendor(v); }}
                >
                  Delete
                </button>
              )}
            </div>
            {v.products_we_carry && <div className="help" style={{ marginTop: 6 }}>{v.products_we_carry}</div>}
            {(v.rep_name || v.phone) && (
              <div className="help" style={{ marginTop: 4 }}>
                {v.rep_name}{v.rep_name && v.phone ? " . " : ""}{v.phone}
              </div>
            )}
          </Link>
        );
        // Browsing everything with no search: sections per category, the sheet's own shape.
        // If grouping came up empty while vendors exist (departments failed to load, or a
        // section points at a missing parent), fall back to the flat list: never blank.
        if (catFilter === "all" && !q.trim() && grouped.reduce((n, g) => n + g.rows.length, 0) === searched.length && grouped.length > 0) {
          return (
            <div style={{ display: "grid", gap: 20 }}>
              {grouped.map((g) => (
                <section key={g.id}>
                  <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>
                    {g.name} <span className="help" style={{ fontWeight: 400 }}>{g.rows.length}</span>
                  </h2>
                  <div style={{ display: "grid", gap: 10 }}>{g.rows.map(row)}</div>
                </section>
              ))}
            </div>
          );
        }
        if (catFilter === "all" && !q.trim()) {
          // Grouping lost rows (missing department rows): show everyone flat instead.
          return <div style={{ display: "grid", gap: 10 }}>{searched.map(row)}</div>;
        }
        return <div style={{ display: "grid", gap: 10 }}>{filtered.map(row)}</div>;
      })()}
    </div>
  );
}
