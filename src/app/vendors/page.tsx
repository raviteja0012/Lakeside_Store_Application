"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { chipClass, labelize } from "@/lib/status";
import { sortDepartments } from "@/lib/departments";
import { useActiveStore } from "@/lib/store";
import { REQUIRE_AUTH, useEffectiveActor } from "@/lib/auth";
import { canEdit, voidRow } from "@/lib/edit";
import type { Vendor, Department, AppUser } from "@/lib/types";

const ACTOR_KEY = "rgs_actor";
// The two views that are not a department: everyone at once, and the vendors still waiting
// to be filed. Both are reachable from the department list so no vendor is ever stranded.
const ALL = "all";
const NONE = "none";
const EMPTY_FORM = { name: "", department_id: "", rep_name: "", phone: "", email: "", products_we_carry: "", default_terms: "", status: "active", notes: "" };

export default function Vendors() {
  const { storeId, ready } = useActiveStore();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [actorId, setActorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // The directory opens on the department list, the way the store is organized. null means
  // that list; a department id, ALL, or NONE means we are inside one of them.
  const [open, setOpen] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

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
    // Switching stores must land back on the department list: department ids belong to one
    // store, so a leftover selection (or a half-typed vendor) would file the next vendor
    // under the wrong store's department.
    setOpen(null);
    setQ("");
    setAdding(false);
    setForm({ ...EMPTY_FORM });
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

  // Open a department (or one of the two special views) with a clean search box.
  function openView(id: string | null) {
    setOpen(id);
    setQ("");
    setAdding(false);
    // Drop any half-typed vendor: an abandoned draft reappearing under a different
    // department is how a vendor ends up filed in the wrong place.
    setForm({ ...EMPTY_FORM });
  }

  async function save() {
    if (!form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // Inside a department the department is already chosen: the form does not ask again.
      const deptId = open && open !== ALL && open !== NONE ? open : form.department_id || null;
      const r = await supabase.from("vendor").insert({
        store_id: storeId,
        name: form.name.trim(),
        department_id: deptId,
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
      setForm({ ...EMPTY_FORM });
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

  // Departments in the owner's sequence, sections rolled into their parent.
  const topCats = useMemo(() => sortDepartments(departments.filter((d) => !d.parent_department_id)), [departments]);
  const topOf = useMemo(() => {
    const parent = new Map(departments.map((d) => [d.id, d.parent_department_id]));
    return (id: string | null | undefined): string | null => {
      if (!id) return null;
      const p = parent.get(id);
      return (p as string | null) || id;
    };
  }, [departments]);

  // Which card a vendor belongs to. A vendor filed under a department that did not load
  // falls into NONE rather than vanishing: every vendor is reachable from the list.
  const bucketOf = useMemo(() => {
    const tops = new Set(topCats.map((d) => d.id));
    return (v: Vendor): string => {
      const t = topOf(v.department_id);
      return t && tops.has(t) ? t : NONE;
    };
  }, [topCats, topOf]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vendors) {
      const b = bucketOf(v);
      m.set(b, (m.get(b) || 0) + 1);
    }
    return m;
  }, [vendors, bucketOf]);

  // Vendors in the open view, then narrowed by the search box.
  const inView = useMemo(() => {
    if (open === null || open === ALL) return vendors;
    return vendors.filter((v) => bucketOf(v) === open);
  }, [vendors, open, bucketOf]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return inView;
    return inView.filter(
      (v) =>
        v.name.toLowerCase().includes(term) ||
        (v.products_we_carry || "").toLowerCase().includes(term) ||
        (v.rep_name || "").toLowerCase().includes(term)
    );
  }, [inView, q]);

  const openName =
    open === ALL ? "All vendors" : open === NONE ? "No department yet" : topCats.find((d) => d.id === open)?.name || "Vendors";
  const inDepartment = !!open && open !== ALL && open !== NONE;

  const vendorRow = (v: Vendor) => (
    <Link key={v.id} href={`/vendors/${v.id}`} className="card" style={{ padding: 14, textDecoration: "none", color: "inherit", display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>{v.name}</strong>
        {v.department && (
          <button
            className="chip"
            style={{ background: "#EEF1F4", color: v.department.accent_color || "#6B7480", cursor: "pointer", border: "none" }}
            title={`Show all ${v.department.name} vendors`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); openView(bucketOf(v)); }}
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

  return (
    <div>
      <header className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Vendors</h1>
          <p className="page-sub">
            {open === null ? `${vendors.length} in the directory, by department` : `${openName} . ${inView.length}`}
          </p>
        </div>
        <div className="page-actions">
          {open !== null && (
            <button className="btn-ghost" onClick={() => openView(null)}>All departments</button>
          )}
          {open !== null && open !== NONE && (
            <button className="btn-primary" onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "+ Add vendor"}</button>
          )}
        </div>
      </header>

      {loading && <p className="help">Loading vendors.</p>}
      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="chip chip-error">Error</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}

      {/* Step one: pick a department. */}
      {!loading && open === null && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
          {topCats.map((d) => (
            <button
              key={d.id}
              className="card"
              style={{ padding: 16, textAlign: "left", cursor: "pointer", border: "1px solid var(--border)", display: "grid", gap: 6 }}
              onClick={() => openView(d.id)}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: d.accent_color || "#6B7480", flex: "0 0 auto" }} />
                <strong style={{ fontSize: 15 }}>{d.name}</strong>
              </span>
              <span className="help">{counts.get(d.id) || 0} {(counts.get(d.id) || 0) === 1 ? "vendor" : "vendors"}</span>
            </button>
          ))}
          <button
            className="card"
            style={{ padding: 16, textAlign: "left", cursor: "pointer", border: "1px solid var(--border)", display: "grid", gap: 6 }}
            onClick={() => openView(ALL)}
          >
            <strong style={{ fontSize: 15 }}>All vendors</strong>
            <span className="help">{vendors.length} in the directory</span>
          </button>
          {(counts.get(NONE) || 0) > 0 && (
            <button
              className="card"
              style={{ padding: 16, textAlign: "left", cursor: "pointer", border: "1px solid var(--border)", display: "grid", gap: 6 }}
              onClick={() => openView(NONE)}
            >
              <strong style={{ fontSize: 15 }}>No department yet</strong>
              <span className="help">{counts.get(NONE)} waiting to be filed</span>
            </button>
          )}
        </div>
      )}

      {/* Step two: the vendors in that department. */}
      {!loading && open !== null && (
        <>
          {adding && (
            <div className="card" style={{ padding: 16, marginBottom: 16, display: "grid", gap: 10 }}>
              {inDepartment && <p className="help" style={{ margin: 0 }}>Filed under {openName}.</p>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                <div><label className="label">Company or vendor name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                {!inDepartment && (
                  <div><label className="label">Department</label>
                    <select className="input" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                      <option value="">Multi-department / Unknown</option>
                      {sortDepartments(departments).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                )}
                <div><label className="label">Rep name</label><input className="input" value={form.rep_name} onChange={(e) => setForm({ ...form, rep_name: e.target.value })} /></div>
                <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><label className="label">Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><label className="label">Payment terms</label><input className="input" placeholder="Net 30" value={form.default_terms} onChange={(e) => setForm({ ...form, default_terms: e.target.value })} /></div>
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

          <input
            className="input"
            placeholder={inDepartment ? `Search ${openName} by name, product, or rep` : "Search by name, product, or rep"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ marginBottom: 16 }}
            aria-label="Search vendors"
          />

          {rows.length === 0 && (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p className="help" style={{ margin: 0 }}>
                {q.trim() ? "No vendors match that search." : `No vendors in ${openName} yet.`}
              </p>
            </div>
          )}
          <div style={{ display: "grid", gap: 10 }}>{rows.map(vendorRow)}</div>
        </>
      )}
    </div>
  );
}
