"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { chipClass, labelize } from "@/lib/status";
import { formatCAD } from "@/lib/format";
import { useActiveStore } from "@/lib/store";
import type { Employee, PayRate, Department, AppUser } from "@/lib/types";

const ACTOR_KEY = "rgs_actor";
const num = (s: string) => (s.trim() === "" ? null : Number(s));

export default function HR() {
  const { storeId, ready } = useActiveStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rates, setRates] = useState<PayRate[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [actorId, setActorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addEmp, setAddEmp] = useState(false);
  const [editEmp, setEditEmp] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", role: "", department_id: "", phone: "", email: "", hire_date: "", status: "active", notes: "" });

  const [rateFor, setRateFor] = useState<string | null>(null);
  const [rateForm, setRateForm] = useState({ rate: "", unit: "hour", effective_date: "" });

  async function load() {
    let eq = supabase
      .from("employee")
      .select("id, store_id, department_id, full_name, role, phone, email, hire_date, status, notes, department:department_id(name, accent_color)")
      .order("full_name");
    if (storeId) eq = eq.eq("store_id", storeId);
    const e = await eq;
    if (e.error) { setError(e.error.message); return; }
    const emps = (e.data as unknown as Employee[]) || [];
    setEmployees(emps);
    // Pay rates have no store_id; keep only those for this store's employees.
    const ids = emps.map((x) => x.id);
    const r = await supabase.from("pay_rate").select("id, employee_id, rate, unit, effective_date").order("effective_date", { ascending: false });
    setRates(((r.data as unknown as PayRate[]) || []).filter((x) => x.employee_id && ids.includes(x.employee_id)));
  }

  useEffect(() => {
    if (!ready) return;
    (async () => {
      await load();
      let dq = supabase.from("department").select("id, name, accent_color, parent_department_id").order("name");
      if (storeId) dq = dq.eq("store_id", storeId);
      const { data: ds } = await dq;
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

  function startAdd() {
    setEditEmp(null);
    setForm({ full_name: "", role: "", department_id: "", phone: "", email: "", hire_date: "", status: "active", notes: "" });
    setAddEmp(true);
  }
  function startEdit(e: Employee) {
    setAddEmp(false);
    setForm({ full_name: e.full_name, role: e.role || "", department_id: e.department_id || "", phone: e.phone || "", email: e.email || "", hire_date: e.hire_date || "", status: e.status, notes: e.notes || "" });
    setEditEmp(e.id);
  }

  async function saveEmp() {
    if (!form.full_name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const row = {
        full_name: form.full_name.trim(),
        role: form.role || null,
        department_id: form.department_id || null,
        phone: form.phone || null,
        email: form.email || null,
        hire_date: form.hire_date || null,
        status: form.status,
        notes: form.notes || null
      };
      if (editEmp) {
        const r = await supabase.from("employee").update(row).eq("id", editEmp);
        if (r.error) throw new Error(r.error.message);
        await log("employee_edited", "employee", editEmp);
      } else {
        const r = await supabase.from("employee").insert({ ...row, store_id: storeId }).select("id").single();
        if (r.error) throw new Error(r.error.message);
        await log("employee_added", "employee", r.data.id as string);
      }
      setAddEmp(false);
      setEditEmp(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startRate(empId: string) {
    setRateFor(rateFor === empId ? null : empId);
    setRateForm({ rate: "", unit: "hour", effective_date: "" });
  }

  async function saveRate() {
    if (!rateFor || rateForm.rate.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("pay_rate").insert({
        employee_id: rateFor,
        rate: num(rateForm.rate),
        unit: rateForm.unit,
        effective_date: rateForm.effective_date || null
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      await log("pay_rate_added", "pay_rate", r.data.id as string);
      setRateFor(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const ratesFor = (empId: string) => rates.filter((r) => r.employee_id === empId);
  const currentRate = (empId: string) => ratesFor(empId)[0]; // sorted desc by effective_date

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Employees</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/hr/schedule" className="help" style={{ textDecoration: "none" }}>Schedule and hours &rarr;</Link>
          <div>
            <label className="help" htmlFor="actor">Acting as </label>
            <select id="actor" className="input" style={{ width: "auto", display: "inline-block", padding: "6px 8px" }} value={actorId} onChange={(e) => setActor(e.target.value)}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={startAdd}>{addEmp ? "Close" : "+ Add employee"}</button>
        </div>
      </div>
      <p className="help" style={{ marginTop: -12 }}>Staff records hold personal data under PIPEDA. Collect with consent, limit who can see it, keep it in the Canadian region.</p>

      {(addEmp || editEmp) && (
        <div className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <div><label className="label">Full name</label><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><label className="label">Role</label><input className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
            <div><label className="label">Department</label>
              <select className="input" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">Unassigned</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="label">Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label">Hire date</label><input className="input" type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
            <div><label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {["active", "inactive"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-primary" onClick={saveEmp} disabled={busy || !form.full_name.trim()}>{busy ? "Saving." : "Save employee"}</button>
            <button className="btn-ghost" onClick={() => { setAddEmp(false); setEditEmp(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {loading && <p className="help">Loading.</p>}
      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Error</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}
      {!loading && !error && employees.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p className="help" style={{ margin: 0 }}>No employees yet. Add the first one with + Add employee.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {employees.map((e) => {
          const cr = currentRate(e.id);
          const list = ratesFor(e.id);
          return (
            <div key={e.id} className="card" style={{ padding: 14, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 15 }}>{e.full_name}</strong>
                    {e.department && <span className="chip" style={{ background: "#EEF1F4", color: e.department.accent_color || "#6B7480" }}>{e.department.name}</span>}
                    <span className={`chip ${chipClass(e.status)}`}>{labelize(e.status)}</span>
                  </div>
                  <div className="help" style={{ marginTop: 4 }}>{[e.role, e.phone, e.email].filter(Boolean).join(" . ")}</div>
                  {e.hire_date && <div className="help">Hired {e.hire_date}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="tabular" style={{ fontWeight: 600 }}>{cr && cr.rate != null ? `${formatCAD(cr.rate)}/${cr.unit === "hour" ? "hr" : "yr"}` : "No rate"}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startRate(e.id)}>{rateFor === e.id ? "Close" : "Pay rates"}</button>
                    <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startEdit(e)}>Edit</button>
                  </div>
                </div>
              </div>

              {rateFor === e.id && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "grid", gap: 10 }}>
                  <div className="help">Pay rates are effective-dated. Add a new row when pay changes; history stays.</div>
                  <div style={{ display: "grid", gap: 4 }}>
                    {list.length === 0 && <span className="help">No pay rates on file.</span>}
                    {list.map((r) => (
                      <div key={r.id} className="tabular" style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span>{r.effective_date || "no date"}</span>
                        <span>{formatCAD(r.rate)} / {r.unit === "hour" ? "hour" : "salary"}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, alignItems: "end" }}>
                    <div><label className="label">Rate</label><input className="input tabular" type="number" step="0.01" value={rateForm.rate} onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })} /></div>
                    <div><label className="label">Unit</label>
                      <select className="input" value={rateForm.unit} onChange={(e) => setRateForm({ ...rateForm, unit: e.target.value })}>
                        {["hour", "salary"].map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div><label className="label">Effective date</label><input className="input" type="date" value={rateForm.effective_date} onChange={(e) => setRateForm({ ...rateForm, effective_date: e.target.value })} /></div>
                    <div><button className="btn-primary" onClick={saveRate} disabled={busy || rateForm.rate.trim() === ""}>{busy ? "Saving." : "Add rate"}</button></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
