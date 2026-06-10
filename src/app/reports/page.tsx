"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCAD, daysOverdue } from "@/lib/format";
import { labelize } from "@/lib/status";
import { paletteColor } from "@/lib/charts";
import { useActiveStore } from "@/lib/store";
import { canSeeMoney, useCurrentRole } from "@/lib/auth";

type Inv = { id: string; amount: number | null; hst_amount: number | null; due_date: string | null; status: string; vendor_id: string | null; vendor: { name: string; department_id: string | null } | null };
type PO = { vendor_id: string | null; order_amount: number | null; department_id: string | null };
type Dept = { id: string; name: string; accent_color: string | null };
type Vend = { id: string; name: string; department_id: string | null };

// One horizontal bar with an always-visible label and value, so meaning never rests on color alone.
function Bar({ label, value, max, color, display }: { label: string; value: number; max: number; color: string; display: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 90px", gap: 10, alignItems: "center", padding: "5px 0" }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <div style={{ background: "#EEF1F4", borderRadius: 5, height: 16, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
      <span className="tabular" style={{ textAlign: "right", fontSize: 13 }}>{display}</span>
    </div>
  );
}

export default function Reports() {
  const { storeId, ready } = useActiveStore();
  const { role } = useCurrentRole();
  const showMoney = canSeeMoney(role);
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [vendors, setVendors] = useState<Vend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    (async () => {
      let invq = supabase.from("invoice").select("id, amount, hst_amount, due_date, status, vendor_id, vendor:vendor_id(name, department_id)").is("voided_at", null);
      if (storeId) invq = invq.eq("store_id", storeId);
      const inv = await invq;
      if (inv.error) { setError(inv.error.message); setLoading(false); return; }
      setInvoices((inv.data as unknown as Inv[]) || []);
      let poq = supabase.from("purchase_order").select("vendor_id, order_amount, department_id").is("voided_at", null);
      if (storeId) poq = poq.eq("store_id", storeId);
      const po = await poq;
      setPos((po.data as unknown as PO[]) || []);
      let dq = supabase.from("department").select("id, name, accent_color").order("name");
      if (storeId) dq = dq.eq("store_id", storeId);
      const d = await dq;
      setDepts((d.data as unknown as Dept[]) || []);
      let vq = supabase.from("vendor").select("id, name, department_id").is("voided_at", null);
      if (storeId) vq = vq.eq("store_id", storeId);
      const v = await vq;
      setVendors((v.data as unknown as Vend[]) || []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  const invAmount = (i: Inv) => Number(i.amount) || 0;

  // Spend (ordered) and invoiced by department, with one Okabe-Ito color per department.
  const byDept = useMemo(() => {
    return depts
      .map((d, idx) => {
        const ordered = pos.filter((p) => p.department_id === d.id).reduce((s, p) => s + (Number(p.order_amount) || 0), 0);
        const invoiced = invoices.filter((i) => i.vendor?.department_id === d.id).reduce((s, i) => s + invAmount(i), 0);
        return { id: d.id, name: d.name, color: paletteColor(idx), ordered, invoiced };
      })
      .filter((d) => d.ordered > 0 || d.invoiced > 0)
      .sort((a, b) => b.ordered - a.ordered);
  }, [depts, pos, invoices]);

  const maxOrdered = Math.max(1, ...byDept.map((d) => d.ordered));
  const maxOIv = Math.max(1, ...byDept.map((d) => Math.max(d.ordered, d.invoiced)));

  // Outstanding aging from unpaid invoice due dates: current (not yet due), 1-30, 31-60, 60+.
  const aging = useMemo(() => {
    const b = { current: 0, b1: 0, b2: 0, b3: 0 };
    for (const i of invoices) {
      if (i.status !== "unpaid") continue;
      const total = invAmount(i) + (Number(i.hst_amount) || 0);
      const d = daysOverdue(i.due_date);
      if (d == null || d <= 0) b.current += total;
      else if (d <= 30) b.b1 += total;
      else if (d <= 60) b.b2 += total;
      else b.b3 += total;
    }
    return [
      { label: "Current", value: b.current, color: paletteColor(2) },
      { label: "1 to 30 days", value: b.b1, color: paletteColor(1) },
      { label: "31 to 60 days", value: b.b2, color: paletteColor(5) },
      { label: "60+ days", value: b.b3, color: "var(--error-base)" }
    ];
  }, [invoices]);
  const maxAging = Math.max(1, ...aging.map((a) => a.value));

  // Payment status mix by count.
  const statusMix = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of invoices) m.set(i.status, (m.get(i.status) || 0) + 1);
    const order = ["paid", "unpaid", "postdated"];
    return order.filter((s) => m.has(s)).map((s, idx) => ({ label: labelize(s), value: m.get(s) || 0, color: paletteColor(idx) }));
  }, [invoices]);
  const totalInv = statusMix.reduce((s, r) => s + r.value, 0);

  // Vendor scorecard: orders count, invoiced total, and discrepancy count (order vs invoiced differ).
  const scorecard = useMemo(() => {
    return vendors
      .map((v) => {
        const vpos = pos.filter((p) => p.vendor_id === v.id);
        const vinv = invoices.filter((i) => i.vendor_id === v.id);
        const ordered = vpos.reduce((s, p) => s + (Number(p.order_amount) || 0), 0);
        const invoiced = vinv.reduce((s, i) => s + invAmount(i), 0);
        // Count as a discrepancy when both an order and an invoice exist and the amounts differ.
        const discrepancy = vpos.length > 0 && vinv.length > 0 && Math.abs(ordered - invoiced) >= 0.01 ? 1 : 0;
        return { id: v.id, name: v.name, orders: vpos.length, invoiced, ordered, discrepancy };
      })
      .filter((r) => r.orders > 0 || r.invoiced > 0)
      .sort((a, b) => b.invoiced - a.invoiced);
  }, [vendors, pos, invoices]);

  return (
    <div style={{ display: "grid", gap: 28 }}>
      <header className="page-head">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">From the order and invoice ledger</p>
        </div>
      </header>

      {loading && <p className="help">Loading the reports.</p>}
      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Connection</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}

      {!loading && !error && !showMoney && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-neutral">Limited view</span>
          <p className="help" style={{ marginTop: 8 }}>
            Reports show cost and payment figures, so they are limited to leads, managers, and the owner.
          </p>
        </div>
      )}

      {!loading && !error && showMoney && (
        <>
          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Spend ordered by department</h2>
            <div className="card" style={{ padding: 16 }}>
              {byDept.length === 0 ? <p className="help" style={{ margin: 0 }}>No orders on file.</p> :
                byDept.map((d) => <Bar key={d.id} label={d.name} value={d.ordered} max={maxOrdered} color={d.color} display={formatCAD(d.ordered)} />)}
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Ordered vs invoiced by department</h2>
            <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
              {byDept.length === 0 ? <p className="help" style={{ margin: 0 }}>No data.</p> :
                byDept.map((d) => (
                  <div key={d.id}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{d.name}</div>
                    <Bar label="Ordered" value={d.ordered} max={maxOIv} color={paletteColor(0)} display={formatCAD(d.ordered)} />
                    <Bar label="Invoiced" value={d.invoiced} max={maxOIv} color={paletteColor(1)} display={formatCAD(d.invoiced)} />
                  </div>
                ))}
              {byDept.length > 0 && (
                <div className="help" style={{ display: "flex", gap: 16 }}>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: paletteColor(0), borderRadius: 2, marginRight: 5 }} />Ordered</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: paletteColor(1), borderRadius: 2, marginRight: 5 }} />Invoiced</span>
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Outstanding aging</h2>
            <div className="card" style={{ padding: 16 }}>
              {aging.every((a) => a.value === 0) ? <p className="help" style={{ margin: 0 }}>Nothing outstanding.</p> :
                aging.map((a) => <Bar key={a.label} label={a.label} value={a.value} max={maxAging} color={a.color} display={formatCAD(a.value)} />)}
              <p className="help" style={{ marginTop: 10, marginBottom: 0 }}>From unpaid invoice due dates. Current means not yet due.</p>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Payment status mix</h2>
            <div className="card" style={{ padding: 16 }}>
              {totalInv === 0 ? <p className="help" style={{ margin: 0 }}>No invoices.</p> : (
                <>
                  <div style={{ display: "flex", height: 20, borderRadius: 5, overflow: "hidden", marginBottom: 12 }}>
                    {statusMix.map((s) => <div key={s.label} title={`${s.label} ${s.value}`} style={{ width: `${(s.value / totalInv) * 100}%`, background: s.color }} />)}
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    {statusMix.map((s) => (
                      <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span><span style={{ display: "inline-block", width: 10, height: 10, background: s.color, borderRadius: 2, marginRight: 6 }} />{s.label}</span>
                        <span className="tabular">{s.value} of {totalInv} ({Math.round((s.value / totalInv) * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Vendor scorecard</h2>
            <div className="card tbl-wrap" style={{ padding: 0 }}>
              <div style={{ minWidth: 560 }}>
                <div className="help" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr 1fr", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                  <span>Vendor</span><span style={{ textAlign: "right" }}>Orders</span><span style={{ textAlign: "right" }}>Invoiced</span><span style={{ textAlign: "right" }}>Discrepancies</span>
                </div>
                {scorecard.length === 0 && <div style={{ padding: 14 }}><span className="help">No vendor activity.</span></div>}
                {scorecard.map((r) => (
                  <div key={r.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr 1fr", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <span className="tabular" style={{ textAlign: "right" }}>{r.orders}</span>
                    <span className="tabular" style={{ textAlign: "right" }}>{formatCAD(r.invoiced)}</span>
                    <span style={{ textAlign: "right" }}>
                      {r.discrepancy ? <span className="chip chip-warning">{r.discrepancy}</span> : <span className="help">none</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="help" style={{ marginTop: 8 }}>A discrepancy means the ordered amount and the invoiced amount differ. A person reviews each one.</p>
          </section>
        </>
      )}
    </div>
  );
}
