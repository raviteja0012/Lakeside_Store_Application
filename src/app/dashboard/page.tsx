"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { formatCAD, daysOverdue } from "@/lib/format";

type Inv = { id: string; amount: number | null; hst_amount: number | null; due_date: string | null; status: string; vendor: { name: string; department_id: string | null } | null };
type PO = { order_amount: number | null; status: string; department_id: string | null };
type Dept = { id: string; name: string; accent_color: string | null };
type Vend = { id: string; department_id: string | null; status: string };

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="help">{label}</div>
      <div className="tabular" style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: accent || "var(--text-primary)" }}>{value}</div>
      {sub && <div className="help" style={{ marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [vendors, setVendors] = useState<Vend[]>([]);
  const [recentCount, setRecentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const inv = await supabase.from("invoice").select("id, amount, hst_amount, due_date, status, vendor:vendor_id(name, department_id)");
      if (inv.error) {
        setError(inv.error.message);
        setLoading(false);
        return;
      }
      setInvoices((inv.data as unknown as Inv[]) || []);
      const po = await supabase.from("purchase_order").select("order_amount, status, department_id");
      setPos((po.data as unknown as PO[]) || []);
      const d = await supabase.from("department").select("id, name, accent_color").order("name");
      setDepts((d.data as unknown as Dept[]) || []);
      const v = await supabase.from("vendor").select("id, department_id, status");
      setVendors((v.data as unknown as Vend[]) || []);
      const re = await supabase.from("receiving_event").select("id", { count: "exact", head: true });
      setRecentCount(re.count || 0);
      setLoading(false);
    })();
  }, []);

  const total = (i: Inv) => (Number(i.amount) || 0) + (Number(i.hst_amount) || 0);

  const m = useMemo(() => {
    const open = invoices.filter((i) => i.status === "unpaid" || i.status === "postdated");
    const outstanding = open.reduce((s, i) => s + total(i), 0);
    let overdueCount = 0, overdueSum = 0, dueSoonSum = 0;
    for (const i of invoices) {
      if (i.status !== "unpaid") continue;
      const dd = daysOverdue(i.due_date);
      if (dd == null) continue;
      if (dd > 0) { overdueCount++; overdueSum += total(i); }
      else if (dd >= -7) { dueSoonSum += total(i); }
    }
    const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + total(i), 0);
    const ordered = pos.reduce((s, p) => s + (Number(p.order_amount) || 0), 0);
    const invoiced = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const awaiting = pos.filter((p) => p.status === "ordered").length;
    return { outstanding, overdueCount, overdueSum, dueSoonSum, paid, ordered, invoiced, awaiting };
  }, [invoices, pos]);

  const byDept = useMemo(() => {
    return depts
      .map((d) => {
        const ordered = pos.filter((p) => p.department_id === d.id).reduce((s, p) => s + (Number(p.order_amount) || 0), 0);
        const invoiced = invoices.filter((i) => i.vendor?.department_id === d.id).reduce((s, i) => s + (Number(i.amount) || 0), 0);
        const vcount = vendors.filter((v) => v.department_id === d.id).length;
        return { id: d.id, name: d.name, color: d.accent_color, ordered, invoiced, vcount };
      })
      .filter((d) => d.ordered > 0 || d.invoiced > 0 || d.vcount > 0);
  }, [depts, pos, invoices, vendors]);

  const topOverdue = useMemo(() => {
    return invoices
      .filter((i) => i.status === "unpaid" && daysOverdue(i.due_date) != null && (daysOverdue(i.due_date) as number) > 0)
      .sort((a, b) => (daysOverdue(b.due_date) as number) - (daysOverdue(a.due_date) as number))
      .slice(0, 6);
  }, [invoices]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Owner dashboard</h1>
        <span className="help">Remote oversight at a glance</span>
      </div>

      {loading && <p className="help">Loading the dashboard.</p>}
      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="chip chip-error">Connection</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
            <Tile label="Outstanding" value={formatCAD(m.outstanding)} sub="unpaid and post-dated" />
            <Tile label="Overdue" value={formatCAD(m.overdueSum)} sub={`${m.overdueCount} ${m.overdueCount === 1 ? "invoice" : "invoices"}`} accent="var(--error-base)" />
            <Tile label="Due in 7 days" value={formatCAD(m.dueSoonSum)} sub="plan the cash" accent="var(--warning-base)" />
            <Tile label="Paid" value={formatCAD(m.paid)} sub="recorded payments" accent="var(--success-base)" />
            <Tile label="Open orders" value={String(m.awaiting)} sub="awaiting delivery" />
            <Tile label="Vendors" value={String(vendors.length)} sub={`${recentCount} receivings logged`} />
          </div>

          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>By department: ordered vs invoiced</h2>
          <div className="card" style={{ padding: 0, marginBottom: 24, overflow: "hidden" }}>
            <div className="help" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
              <span>Department</span><span style={{ textAlign: "right" }}>Vendors</span><span style={{ textAlign: "right" }}>Ordered</span><span style={{ textAlign: "right" }}>Invoiced</span><span style={{ textAlign: "right" }}>Gap</span>
            </div>
            {byDept.map((d) => {
              const gap = d.ordered - d.invoiced;
              return (
                <div key={d.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                  <span><span className="chip" style={{ background: "#EEF1F4", color: d.color || "#6B7480" }}>{d.name}</span></span>
                  <span className="tabular" style={{ textAlign: "right" }}>{d.vcount}</span>
                  <span className="tabular" style={{ textAlign: "right" }}>{formatCAD(d.ordered)}</span>
                  <span className="tabular" style={{ textAlign: "right" }}>{formatCAD(d.invoiced)}</span>
                  <span className="tabular" style={{ textAlign: "right", color: Math.abs(gap) >= 0.01 ? "var(--warning-base)" : "var(--text-secondary)" }}>{formatCAD(gap)}</span>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Most overdue</h2>
            <Link href="/overdue" className="help" style={{ textDecoration: "none" }}>See all</Link>
          </div>
          {topOverdue.length === 0 && <p className="help">Nothing overdue.</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {topOverdue.map((i) => {
              const dd = daysOverdue(i.due_date) as number;
              return (
                <div key={i.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <strong>{i.vendor?.name || "Vendor"}</strong>
                    <span className="chip chip-error" style={{ marginLeft: 8 }}>{dd} days overdue</span>
                  </div>
                  <div className="tabular" style={{ fontWeight: 600 }}>{formatCAD(total(i))}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
