"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { formatCAD, todayISO } from "@/lib/format";
import { weekStart, weekDays, addDays, DOW_LABELS, shiftHours, hourlyRateOn } from "@/lib/hr";
import { useActiveStore } from "@/lib/store";
import type { Employee, PayRate, Shift, AppUser } from "@/lib/types";

const ACTOR_KEY = "rgs_actor";

export default function Schedule() {
  const { storeId, ready } = useActiveStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rates, setRates] = useState<PayRate[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [actorId, setActorId] = useState("");
  const [week, setWeek] = useState(weekStart(todayISO()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ employee_id: "", work_date: "", start_time: "09:00", end_time: "17:00", notes: "" });

  const days = useMemo(() => weekDays(week), [week]);
  const weekEnd = addDays(week, 6);

  async function loadShifts() {
    const s = await supabase
      .from("shift")
      .select("id, employee_id, work_date, start_time, end_time, notes, employee:employee_id(full_name)")
      .gte("work_date", week)
      .lte("work_date", weekEnd)
      .order("work_date", { ascending: true });
    if (s.error) { setError(s.error.message); return; }
    setShifts((s.data as unknown as Shift[]) || []);
  }

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const e = await supabase.from("employee").select("id, store_id, department_id, full_name, role, phone, email, hire_date, status, notes").eq("status", "active").order("full_name");
      setEmployees((e.data as unknown as Employee[]) || []);
      const r = await supabase.from("pay_rate").select("id, employee_id, rate, unit, effective_date").order("effective_date", { ascending: false });
      setRates((r.data as unknown as PayRate[]) || []);
      const { data: us } = await supabase.from("app_user").select("id, full_name, role").order("full_name");
      const usr = (us as AppUser[]) || [];
      setUsers(usr);
      const saved = typeof window !== "undefined" ? localStorage.getItem(ACTOR_KEY) : null;
      setActorId(saved || usr[0]?.id || "");
      await loadShifts();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  useEffect(() => {
    if (!ready || loading) return;
    loadShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  function setActor(uid: string) {
    setActorId(uid);
    if (typeof window !== "undefined") localStorage.setItem(ACTOR_KEY, uid);
  }

  function startAdd(empId?: string, day?: string) {
    setForm({ employee_id: empId || employees[0]?.id || "", work_date: day || week, start_time: "09:00", end_time: "17:00", notes: "" });
    setAdding(true);
  }

  async function saveShift() {
    if (!form.employee_id || !form.work_date) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("shift").insert({
        employee_id: form.employee_id,
        work_date: form.work_date,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        notes: form.notes || null,
        created_by: actorId || null
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      if (actorId) await supabase.from("activity_log").insert({ actor_id: actorId, action: "shift_added", entity: "shift", entity_id: r.data.id as string });
      setAdding(false);
      await loadShifts();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const shiftsByEmpDay = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of shifts) {
      const k = `${s.employee_id}|${s.work_date}`;
      const arr = m.get(k) || [];
      arr.push(s);
      m.set(k, arr);
    }
    return m;
  }, [shifts]);

  // Hours and estimated pay per employee for the chosen week. Pay uses the hourly rate in
  // effect on each shift's date. Salary-only employees show hours but no estimated pay.
  const summary = useMemo(() => {
    return employees
      .map((e) => {
        const empShifts = shifts.filter((s) => s.employee_id === e.id);
        let hours = 0;
        let pay = 0;
        let anyHourly = false;
        for (const s of empShifts) {
          const h = shiftHours(s.start_time, s.end_time);
          hours += h;
          const rate = hourlyRateOn(rates.filter((r) => r.employee_id === e.id), s.work_date || week);
          if (rate != null) { pay += h * rate; anyHourly = true; }
        }
        return { id: e.id, name: e.full_name, hours: Math.round(hours * 100) / 100, pay: Math.round(pay * 100) / 100, anyHourly, count: empShifts.length };
      })
      .filter((r) => r.count > 0);
  }, [employees, shifts, rates, week]);

  const totalHours = summary.reduce((s, r) => s + r.hours, 0);
  const totalPay = summary.reduce((s, r) => s + r.pay, 0);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <Link href="/hr" className="help" style={{ textDecoration: "none" }}>&larr; Employees</Link>
          <h1 style={{ fontSize: 22, margin: "8px 0 0" }}>Weekly schedule</h1>
        </div>
        <div>
          <label className="help" htmlFor="actor">Acting as </label>
          <select id="actor" className="input" style={{ width: "auto", display: "inline-block", padding: "6px 8px" }} value={actorId} onChange={(e) => setActor(e.target.value)}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="btn-ghost" onClick={() => setWeek(addDays(week, -7))}>&larr; Previous</button>
        <strong className="tabular">{week} to {weekEnd}</strong>
        <button className="btn-ghost" onClick={() => setWeek(addDays(week, 7))}>Next &rarr;</button>
        <button className="btn-ghost" onClick={() => setWeek(weekStart(todayISO()))}>This week</button>
        <div style={{ flex: 1 }} />
        <button className="btn-primary" onClick={() => startAdd()}>{adding ? "Close" : "+ Add shift"}</button>
      </div>

      {adding && (
        <div className="card" style={{ padding: 14, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
            <div><label className="label">Employee</label>
              <select className="input" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div><label className="label">Date</label><input className="input" type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} /></div>
            <div><label className="label">Start</label><input className="input tabular" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
            <div><label className="label">End</label><input className="input tabular" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
            <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div><button className="btn-primary" onClick={saveShift} disabled={busy || !form.employee_id || !form.work_date}>{busy ? "Saving." : "Save shift"}</button></div>
        </div>
      )}

      {loading && <p className="help">Loading the schedule.</p>}
      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Error</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}

      {!loading && !error && employees.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p className="help" style={{ margin: 0 }}>No active employees. Add staff on the <Link href="/hr">Employees</Link> screen first.</p>
        </div>
      )}

      {!loading && !error && employees.length > 0 && (
        <>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <div style={{ minWidth: 720 }}>
              <div className="help" style={{ display: "grid", gridTemplateColumns: "160px repeat(7, 1fr)", gap: 1, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                <span>Employee</span>
                {days.map((d, i) => <span key={d} style={{ textAlign: "center" }}>{DOW_LABELS[i]} {d.slice(8)}</span>)}
              </div>
              {employees.map((e) => (
                <div key={e.id} style={{ display: "grid", gridTemplateColumns: "160px repeat(7, 1fr)", gap: 1, padding: "8px 12px", borderBottom: "1px solid var(--border)", alignItems: "stretch" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, alignSelf: "center" }}>{e.full_name}</span>
                  {days.map((d) => {
                    const cell = shiftsByEmpDay.get(`${e.id}|${d}`) || [];
                    return (
                      <button
                        key={d}
                        onClick={() => startAdd(e.id, d)}
                        className="btn-ghost"
                        style={{ padding: 4, fontSize: 11, minHeight: 38, border: "1px solid var(--border)", background: cell.length ? "var(--progress-tint)" : "#fff", color: "var(--text-primary)", display: "grid", gap: 2, alignContent: "center" }}
                        aria-label={`Add shift for ${e.full_name} on ${d}`}
                      >
                        {cell.length === 0 ? <span className="help" style={{ fontSize: 14 }}>+</span> : cell.map((s) => (
                          <span key={s.id} className="tabular">{(s.start_time || "").slice(0, 5)}-{(s.end_time || "").slice(0, 5)}</span>
                        ))}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Hours and pay this week</h2>
            <p className="help" style={{ marginTop: -6, marginBottom: 10 }}>Estimated pay uses the hourly rate in effect on each shift date. A person reviews before payroll.</p>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="help" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                <span>Employee</span><span style={{ textAlign: "right" }}>Shifts</span><span style={{ textAlign: "right" }}>Hours</span><span style={{ textAlign: "right" }}>Est. pay</span>
              </div>
              {summary.length === 0 && <div style={{ padding: 14 }}><span className="help">No shifts this week.</span></div>}
              {summary.map((r) => (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{r.name}</span>
                  <span className="tabular" style={{ textAlign: "right" }}>{r.count}</span>
                  <span className="tabular" style={{ textAlign: "right" }}>{r.hours}</span>
                  <span className="tabular" style={{ textAlign: "right" }}>{r.anyHourly ? formatCAD(r.pay) : "n/a"}</span>
                </div>
              ))}
              {summary.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, padding: "10px 14px", fontWeight: 700 }}>
                  <span>Total</span><span /><span className="tabular" style={{ textAlign: "right" }}>{Math.round(totalHours * 100) / 100}</span><span className="tabular" style={{ textAlign: "right" }}>{formatCAD(totalPay)}</span>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
