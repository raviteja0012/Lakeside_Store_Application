"use client";

// The owner and manager home. One glance at what the store needs today: captures logged,
// money outstanding and overdue, late deliveries, and which vendors still need a season order.
// Every read filters the active store and excludes voided rows. Money is gated by role.
// A few queries, then aggregate in JS to keep the round trips small.

import { useEffect, useMemo, useState } from "react";
import KpiRow, { type KpiItem } from "@/components/KpiRow";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabaseClient";
import { formatCAD, todayISO, daysOverdue } from "@/lib/format";
import { useActiveStore } from "@/lib/store";
import { canSeeMoney, useCurrentRole } from "@/lib/auth";

type Recv = { created_at: string; department_id: string | null };
type Inv = { amount: number | null; due_date: string | null; status: string; vendor_id: string | null };
type PO = { vendor_id: string | null; ship_date: string | null; status: string; season_year: number | null };
type Vend = { id: string; status: string };
type Dept = { id: string; name: string };

// Local date as YYYY-MM-DD, matching the feed so "today" and "this month" line up across screens.
function localISO(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CommandDashboard() {
  const { storeId, ready } = useActiveStore();
  const { role } = useCurrentRole();
  const showMoney = canSeeMoney(role);

  const [recv, setRecv] = useState<Recv[]>([]);
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [vendors, setVendors] = useState<Vend[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    // Cancellation guard: switching stores mid-load must not let the slower store's
    // responses land after the faster one's, mixing KPIs from two stores.
    let cancelled = false;
    (async () => {
      let rq = supabase.from("receiving_event").select("created_at, department_id").is("voided_at", null);
      if (storeId) rq = rq.eq("store_id", storeId);
      const r = await rq;
      if (cancelled) return;
      if (r.error) { setError(r.error.message); setLoading(false); return; }
      setRecv((r.data as unknown as Recv[]) || []);

      let iq = supabase.from("invoice").select("amount, due_date, status, vendor_id").is("voided_at", null);
      if (storeId) iq = iq.eq("store_id", storeId);
      const i = await iq;
      if (cancelled) return;
      if (i.error) { setError(i.error.message); setLoading(false); return; }
      setInvoices((i.data as unknown as Inv[]) || []);

      let pq = supabase.from("purchase_order").select("vendor_id, ship_date, status, season_year").is("voided_at", null);
      if (storeId) pq = pq.eq("store_id", storeId);
      const p = await pq;
      if (cancelled) return;
      if (p.error) { setError(p.error.message); setLoading(false); return; }
      setPos((p.data as unknown as PO[]) || []);

      let vq = supabase.from("vendor").select("id, status").is("voided_at", null);
      if (storeId) vq = vq.eq("store_id", storeId);
      const v = await vq;
      if (cancelled) return;
      if (v.error) { setError(v.error.message); setLoading(false); return; }
      setVendors((v.data as unknown as Vend[]) || []);

      let dq = supabase.from("department").select("id, name").order("name");
      if (storeId) dq = dq.eq("store_id", storeId);
      const d = await dq;
      if (cancelled) return;
      if (d.error) { setError(d.error.message); setLoading(false); return; }
      setDepts((d.data as unknown as Dept[]) || []);

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ready, storeId]);

  const kpis = useMemo<KpiItem[]>(() => {
    const today = todayISO();
    const year = new Date().getFullYear();

    // Captures today.
    const capturesToday = recv.filter((r) => localISO(r.created_at) === today).length;

    // Outstanding: unpaid and post-dated invoice amounts, plus distinct vendor count.
    const open = invoices.filter((i) => i.status === "unpaid" || i.status === "postdated");
    const outstanding = open.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const openVendors = new Set(open.map((i) => i.vendor_id).filter(Boolean)).size;

    // Overdue: unpaid invoices past their due date.
    let overdueCount = 0;
    let overdueSum = 0;
    for (const i of invoices) {
      if (i.status !== "unpaid") continue;
      const d = daysOverdue(i.due_date);
      if (d != null && d > 0) { overdueCount++; overdueSum += Number(i.amount) || 0; }
    }

    // Late deliveries: orders past their ship date that have not been received or cancelled.
    const lateDeliveries = pos.filter((p) => {
      if (p.status === "received" || p.status === "cancelled") return false;
      const d = daysOverdue(p.ship_date);
      return d != null && d > 0;
    }).length;

    // To reorder: active vendors with no purchase order for the current season year.
    const orderedThisSeason = new Set(
      pos.filter((p) => p.season_year === year).map((p) => p.vendor_id).filter(Boolean)
    );
    const toReorder = vendors.filter((v) => v.status === "active" && !orderedThisSeason.has(v.id)).length;

    const items: KpiItem[] = [
      { title: "Captures today", value: String(capturesToday), icon: "📦", foot: "captures" },
      {
        title: "Outstanding",
        value: showMoney ? formatCAD(outstanding) : "—",
        icon: "🧾",
        foot: showMoney ? `${openVendors} ${openVendors === 1 ? "vendor" : "vendors"}` : "leads and up"
      },
      {
        title: "Overdue",
        value: String(overdueCount),
        icon: "⏰",
        tone: overdueCount > 0 ? "error" : undefined,
        foot: showMoney ? formatCAD(overdueSum) : "past due"
      },
      {
        title: "Late deliveries",
        value: String(lateDeliveries),
        icon: "🚚",
        tone: lateDeliveries > 0 ? "warning" : undefined,
        foot: "past ship date"
      },
      {
        title: "To reorder",
        value: String(toReorder),
        icon: "🔁",
        tone: toReorder > 0 ? "warning" : undefined,
        foot: "vendors"
      }
    ];
    return items;
  }, [recv, invoices, pos, vendors, showMoney]);

  // By department: receiving events this calendar month, per department.
  const byDept = useMemo(() => {
    const month = todayISO().slice(0, 7);
    const counts = new Map<string, number>();
    for (const r of recv) {
      if (!r.department_id) continue;
      if (localISO(r.created_at).slice(0, 7) !== month) continue;
      counts.set(r.department_id, (counts.get(r.department_id) || 0) + 1);
    }
    return depts.map((d) => ({ id: d.id, name: d.name, count: counts.get(d.id) || 0 }));
  }, [recv, depts]);

  const hasData = recv.length > 0 || invoices.length > 0 || pos.length > 0 || vendors.length > 0;

  return (
    <div>
      <header className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Today</h1>
          <p className="page-sub">What the store needs from you, in one look.</p>
        </div>
      </header>

      {!SUPABASE_CONFIGURED && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="chip chip-error">Connection</span>
          <p className="help" style={{ marginTop: 8 }}>Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then reload.</p>
        </div>
      )}

      {SUPABASE_CONFIGURED && loading && <p className="help">Loading the dashboard.</p>}

      {SUPABASE_CONFIGURED && error && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="chip chip-error">Connection</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}

      {SUPABASE_CONFIGURED && !loading && !error && (
        <>
          <KpiRow items={kpis} />

          {!showMoney && (
            <p className="help" style={{ marginTop: 12 }}>Cost and invoice totals are limited to leads, managers, and the owner.</p>
          )}

          {!hasData ? (
            <div className="empty" style={{ marginTop: 16 }}>
              <div className="empty-icon" aria-hidden="true">📦</div>
              <p className="empty-title">Nothing to show yet</p>
              <p className="help">Capture vendor invoices and load the season ledger to fill this in.</p>
            </div>
          ) : (
            <section style={{ marginTop: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <h2 style={{ fontSize: 16, margin: 0 }}>By department</h2>
                <span className="help">Receivings this month</span>
              </div>
              {byDept.length === 0 ? (
                <p className="help">No departments set up for this store.</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                  {byDept.map((d) => (
                    <div key={d.id} className="card" style={{ padding: 14 }}>
                      <div className="help" style={{ fontWeight: 600 }}>{d.name}</div>
                      <div className="tabular" style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{d.count}</div>
                      <div className="help" style={{ marginTop: 2 }}>{d.count === 1 ? "receiving" : "receivings"}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
