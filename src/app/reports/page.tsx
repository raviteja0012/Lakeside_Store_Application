"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCAD, daysOverdue } from "@/lib/format";
import { labelize } from "@/lib/status";
import { paletteColor } from "@/lib/charts";
import { useActiveStore } from "@/lib/store";
import { canSeeMoney, useCurrentRole } from "@/lib/auth";
import { fetchSettlements, invoiceTotal, invoiceGoods, orderIsOpen, type InvoiceSettlement } from "@/lib/payments";

type Inv = { id: string; amount: number | null; hst_amount: number | null; freight_charges: number | null; tax_mode: string | null; invoice_date: string | null; created_at: string | null; due_date: string | null; status: string; vendor_id: string | null; vendor: { name: string; department_id: string | null } | null };
type PO = { vendor_id: string | null; order_amount: number | null; department_id: string | null; ship_date: string | null; status: string | null };
type Dept = { id: string; name: string; accent_color: string | null; parent_department_id: string | null };
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
  const [settlements, setSettlements] = useState<Map<string, InvoiceSettlement>>(new Map());
  const [pos, setPos] = useState<PO[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [vendors, setVendors] = useState<Vend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    (async () => {
      let invq = supabase.from("invoice").select("id, amount, hst_amount, freight_charges, tax_mode, invoice_date, created_at, due_date, status, vendor_id, vendor:vendor_id(name, department_id)").is("voided_at", null);
      if (storeId) invq = invq.eq("store_id", storeId);
      const inv = await invq;
      if (inv.error) { setError(inv.error.message); setLoading(false); return; }
      const invList = (inv.data as unknown as Inv[]) || [];
      setInvoices(invList);
      // Settled amounts per open invoice, so aging shows what is actually still owed.
      try {
        const openIds = invList.filter((i) => i.status === "unpaid" || i.status === "partially_paid" || i.status === "postdated").map((i) => i.id);
        setSettlements(await fetchSettlements(openIds));
      } catch {
        setSettlements(new Map());
      }
      let poq = supabase.from("purchase_order").select("vendor_id, order_amount, department_id, ship_date, status").is("voided_at", null);
      if (storeId) poq = poq.eq("store_id", storeId);
      const po = await poq;
      setPos((po.data as unknown as PO[]) || []);
      let dq = supabase.from("department").select("id, name, accent_color, parent_department_id").order("name");
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

  // Goods only, before tax and freight, so the comparison against order amounts is like
  // for like even when a vendor's invoice quotes a tax-inclusive price.
  const invAmount = (i: Inv) => invoiceGoods(i);

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
      if (i.status !== "unpaid" && i.status !== "partially_paid" && i.status !== "postdated") continue;
      // What is still owed: goods + freight + HST minus what has settled. A partially paid
      // invoice ages only its remainder, matching the overdue screen's owed figure.
      const total = invoiceTotal(i);
      const owed = Math.max(0, total - (settlements.get(i.id)?.settled || 0));
      if (owed <= 0) continue;
      const d = daysOverdue(i.due_date);
      if (d == null || d <= 0) b.current += owed;
      else if (d <= 30) b.b1 += owed;
      else if (d <= 60) b.b2 += owed;
      else b.b3 += owed;
    }
    return [
      { label: "Current", value: b.current, color: paletteColor(2) },
      { label: "1 to 30 days", value: b.b1, color: paletteColor(1) },
      { label: "31 to 60 days", value: b.b2, color: paletteColor(5) },
      { label: "60+ days", value: b.b3, color: "var(--error-base)" }
    ];
  }, [invoices, settlements]);
  const maxAging = Math.max(1, ...aging.map((a) => a.value));

  // Payment status mix by count.
  const statusMix = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of invoices) m.set(i.status, (m.get(i.status) || 0) + 1);
    const order = ["paid", "partially_paid", "unpaid", "postdated"];
    return order.filter((s) => m.has(s)).map((s, idx) => ({ label: labelize(s), value: m.get(s) || 0, color: paletteColor(idx) }));
  }, [invoices]);
  const totalInv = statusMix.reduce((s, r) => s + r.value, 0);

  // HST by department for the financial year (Ravi's workflow sheet: "report all Departments
  // on HST Amount for the financial year"). The year of an invoice is its invoice date,
  // falling back to the due date, then the entry date. Sections (Clothing, Gifts, Garden
  // Center) roll up into their parent category.
  const [hstYear, setHstYear] = useState<number>(new Date().getFullYear());
  const invoiceYear = (i: Inv): number | null => {
    const d = i.invoice_date || i.due_date || (i.created_at ? i.created_at.slice(0, 10) : null);
    return d ? Number(d.slice(0, 4)) : null;
  };
  const hstYears = useMemo(() => {
    const ys = new Set<number>();
    ys.add(new Date().getFullYear());
    for (const i of invoices) {
      const y = invoiceYear(i);
      if (y) ys.add(y);
    }
    return Array.from(ys).sort((a, b) => b - a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices]);
  const hstByDept = useMemo(() => {
    const parentOf = new Map(depts.map((d) => [d.id, d.parent_department_id || null]));
    const rollup = (id: string | null): string | null => (id ? (parentOf.get(id) as string | null) || id : null);
    const sums = new Map<string, number>();
    for (const i of invoices) {
      if (invoiceYear(i) !== hstYear) continue;
      const hst = Number(i.hst_amount) || 0;
      if (hst === 0) continue;
      const key = rollup(i.vendor?.department_id || null) || "none";
      sums.set(key, (sums.get(key) || 0) + hst);
    }
    return depts
      .map((d, idx) => ({ id: d.id, name: d.name, color: paletteColor(idx), hst: sums.get(d.id) || 0 }))
      .filter((r) => r.hst > 0)
      .sort((a, b) => b.hst - a.hst)
      .concat(sums.has("none") ? [{ id: "none", name: "No department", color: "var(--error-base)", hst: sums.get("none") || 0 }] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, depts, hstYear]);
  const hstTotal = hstByDept.reduce((s, r) => s + r.hst, 0);
  const maxHst = Math.max(1, ...hstByDept.map((r) => r.hst));
  // Tax mode "refer to the actual invoice" stores a blank HST; those invoices are real tax
  // the report cannot see, so the report says so instead of silently under-counting.
  const hstUnknownCount = useMemo(
    () => invoices.filter((i) => i.hst_amount == null && invoiceYear(i) === hstYear).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, hstYear]
  );

  // Late deliveries: the Today tile's number, itemized, so clicking it lands on the rows
  // to act on (same filter as the tile: past ship date, not received, not cancelled).
  // What is arriving in the next seven days, so the week can be staffed for it. The April
  // delivery wave is the case this exists for: a truck a day and nobody rostered to price
  // and shelve it.
  const arrivingSoon = useMemo(() => {
    const names = new Map(vendors.map((v) => [v.id, v.name]));
    return pos
      .filter((p) => {
        if (!p.ship_date || !orderIsOpen(p.status)) return false;
        const d = daysOverdue(p.ship_date);
        // daysOverdue counts down: 0 is today, -7 is a week out.
        return d != null && d <= 0 && d >= -7;
      })
      .map((p) => ({
        vendorId: p.vendor_id,
        vendor: (p.vendor_id && names.get(p.vendor_id)) || "Vendor",
        ship: p.ship_date as string,
        inDays: -(daysOverdue(p.ship_date) || 0),
        amount: Number(p.order_amount) || 0
      }))
      .sort((a, b) => a.inDays - b.inDays);
  }, [pos, vendors]);

  const lateDeliveries = useMemo(() => {
    const names = new Map(vendors.map((v) => [v.id, v.name]));
    return pos
      .filter((p) => p.ship_date && (daysOverdue(p.ship_date) || 0) > 0 && orderIsOpen(p.status))
      .map((p) => ({
        vendorId: p.vendor_id,
        vendor: (p.vendor_id && names.get(p.vendor_id)) || "Vendor",
        ship: p.ship_date as string,
        daysLate: daysOverdue(p.ship_date) || 0,
        amount: Number(p.order_amount) || 0
      }))
      .sort((a, b) => b.daysLate - a.daysLate);
  }, [pos, vendors]);

  // Department drill-down (the board's SCRUM-8 ask): every department's money picture at a
  // glance, opening into its vendors. Owed follows the app's rule: post-dated money has not
  // left the account, so it still counts as owed until the date arrives.
  const drilldown = useMemo(() => {
    const invTotal = (i: Inv) => invoiceTotal(i);
    const owedOf = (i: Inv): number => {
      if (i.status === "paid") return 0;
      // Post-dated still counts as owed (the money has not left), but any portion that
      // HAS settled comes off, matching the overdue and vendor pages to the cent.
      return Math.max(0, invTotal(i) - (settlements.get(i.id)?.settled || 0));
    };
    return depts
      .map((d) => {
        const dv = vendors.filter((v) => v.department_id === d.id);
        const rows = dv
          .map((v) => {
            const vinv = invoices.filter((i) => i.vendor_id === v.id);
            const ordered = pos.filter((p) => p.vendor_id === v.id).reduce((s, p) => s + (Number(p.order_amount) || 0), 0);
            const invoiced = vinv.reduce((s, i) => s + invTotal(i), 0);
            const owed = vinv.reduce((s, i) => s + owedOf(i), 0);
            const overdue = vinv.filter((i) => (i.status === "unpaid" || i.status === "partially_paid") && (daysOverdue(i.due_date) || 0) > 0).length;
            return { id: v.id, name: v.name, ordered, invoiced, owed, paid: Math.max(0, invoiced - owed), overdue };
          })
          .filter((r) => r.ordered > 0 || r.invoiced > 0)
          .sort((a, b) => b.owed - a.owed || b.invoiced - a.invoiced);
        const sum = (k: "ordered" | "invoiced" | "owed" | "paid") => rows.reduce((s, r) => s + r[k], 0);
        return { id: d.id, name: d.name, rows, ordered: sum("ordered"), invoiced: sum("invoiced"), paid: sum("paid"), owed: sum("owed"), overdue: rows.reduce((s, r) => s + r.overdue, 0) };
      })
      .filter((d) => d.rows.length > 0)
      .sort((a, b) => b.owed - a.owed || b.invoiced - a.invoiced);
  }, [depts, vendors, invoices, pos, settlements]);

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
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Ordered vs invoiced by department <span className="help" style={{ fontWeight: 400 }}>(before HST and freight)</span></h2>
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
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Arriving in the next 7 days</h2>
            <div className="card" style={{ padding: 16, display: "grid", gap: 6 }}>
              {arrivingSoon.length === 0 && <p className="help" style={{ margin: 0 }}>No deliveries are expected this week.</p>}
              {arrivingSoon.map((a, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                    {a.vendorId ? <a href={`/vendors/${a.vendorId}`} style={{ textDecoration: "none", fontWeight: 600 }}>{a.vendor}</a> : <strong>{a.vendor}</strong>}
                    <span className="chip chip-progress">{a.inDays === 0 ? "today" : `in ${a.inDays} day${a.inDays === 1 ? "" : "s"}`}</span>
                  </span>
                  <span className="help tabular">expected {a.ship}{a.amount ? ` . ${formatCAD(a.amount)}` : ""}</span>
                </div>
              ))}
              {arrivingSoon.length > 0 && <p className="help" style={{ margin: "6px 0 0" }}>Staff the week around these: each one needs someone to check it against the invoice, price it, and shelve it.</p>}
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Late deliveries</h2>
            <div className="card" style={{ padding: 16, display: "grid", gap: 6 }}>
              {lateDeliveries.length === 0 && <p className="help" style={{ margin: 0 }}>Nothing is past its expected ship date.</p>}
              {lateDeliveries.map((l, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                    {l.vendorId ? <a href={`/vendors/${l.vendorId}`} style={{ textDecoration: "none", fontWeight: 600 }}>{l.vendor}</a> : <strong>{l.vendor}</strong>}
                    <span className="chip chip-warning">{l.daysLate} day{l.daysLate === 1 ? "" : "s"} late</span>
                  </span>
                  <span className="help tabular">expected {l.ship}{l.amount ? ` . ${formatCAD(l.amount)}` : ""}</span>
                </div>
              ))}
              {lateDeliveries.length > 0 && <p className="help" style={{ margin: "6px 0 0" }}>A vendor name opens the ledger; mark the order received there when it lands, or phone the rep.</p>}
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Department drill-down</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {drilldown.length === 0 && <div className="card" style={{ padding: 16 }}><p className="help" style={{ margin: 0 }}>No department activity yet.</p></div>}
              {drilldown.map((d) => (
                <details key={d.id} className="card" style={{ padding: 0 }}>
                  <summary style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", listStyle: "none" }}>
                    <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{d.name}</strong>
                      <span className="help">{d.rows.length} vendor{d.rows.length === 1 ? "" : "s"}</span>
                      {d.overdue > 0 && <span className="chip chip-error">{d.overdue} overdue</span>}
                    </span>
                    <span className="help tabular">
                      invoiced {formatCAD(d.invoiced)} . paid {formatCAD(d.paid)} . owed {formatCAD(d.owed)}
                    </span>
                  </summary>
                  <div style={{ borderTop: "1px solid var(--border)", padding: "8px 16px 12px", display: "grid", gap: 4 }}>
                    <div className="help" style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px", gap: 8, fontWeight: 600 }}>
                      <span>Vendor</span><span style={{ textAlign: "right" }}>Invoiced</span><span style={{ textAlign: "right" }}>Paid</span><span style={{ textAlign: "right" }}>Owed</span>
                    </div>
                    {d.rows.map((r) => (
                      <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px", gap: 8, fontSize: 13, alignItems: "center" }}>
                        <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                          <a href={`/vendors/${r.id}`} style={{ textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</a>
                          {r.overdue > 0 && <span className="chip chip-error" style={{ flexShrink: 0 }}>{r.overdue}</span>}
                        </span>
                        <span className="tabular" style={{ textAlign: "right" }}>{formatCAD(r.invoiced)}</span>
                        <span className="tabular" style={{ textAlign: "right" }}>{formatCAD(r.paid)}</span>
                        <span className="tabular" style={{ textAlign: "right", fontWeight: r.owed > 0 ? 600 : 400 }}>{formatCAD(r.owed)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
            <p className="help" style={{ margin: "8px 0 0" }}>Open a department to see its vendors; a vendor name opens the full ledger. Post-dated money counts as owed until its date arrives.</p>
          </section>

          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Outstanding aging</h2>
            <div className="card" style={{ padding: 16 }}>
              {aging.every((a) => a.value === 0) ? <p className="help" style={{ margin: 0 }}>Nothing outstanding.</p> :
                aging.map((a) => <Bar key={a.label} label={a.label} value={a.value} max={maxAging} color={a.color} display={formatCAD(a.value)} />)}
              <p className="help" style={{ marginTop: 10, marginBottom: 0 }}>From open invoice due dates, post-dated remainders included. Current means not yet due.</p>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>HST by department</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label className="help" htmlFor="hst-year">Financial year</label>
                <select id="hst-year" className="input" style={{ width: "auto", padding: "6px 8px" }} value={hstYear} onChange={(e) => setHstYear(Number(e.target.value))}>
                  {hstYears.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              {hstByDept.length === 0 ? (
                <p className="help" style={{ margin: 0 }}>No HST recorded on {hstYear} invoices.</p>
              ) : (
                <>
                  {hstByDept.map((r) => <Bar key={r.id} label={r.name} value={r.hst} max={maxHst} color={r.color} display={formatCAD(r.hst)} />)}
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>Total HST {hstYear}</span>
                    <span className="tabular" style={{ fontWeight: 600 }}>{formatCAD(hstTotal)}</span>
                  </div>
                </>
              )}
              <p className="help" style={{ marginTop: 10, marginBottom: 0 }}>
                From the HST line on every invoice, grouped by the vendor&apos;s department (sections roll up into their category).
                {hstUnknownCount > 0 && ` ${hstUnknownCount} invoice${hstUnknownCount === 1 ? " says" : "s say"} see-the-invoice for tax; that HST is not in this total until it is entered.`}
                Uses the invoice date, falling back to due date, then entry date. For the six-year records, the full export keeps every line.
              </p>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Vendor scorecard</h2>
            <div className="card tbl-wrap" style={{ padding: 0 }}>
              <div style={{ minWidth: 560 }}>
                <div className="help" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr 1fr", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                  <span>Vendor</span><span style={{ textAlign: "right" }}>Orders</span><span style={{ textAlign: "right" }}>Invoiced (pre-tax)</span><span style={{ textAlign: "right" }}>Discrepancies</span>
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
