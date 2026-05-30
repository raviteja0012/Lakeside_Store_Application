"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCAD, daysOverdue } from "@/lib/format";
import { useActiveStore } from "@/lib/store";
import type { Invoice } from "@/lib/types";

export default function Overdue() {
  const { storeId, ready } = useActiveStore();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    (async () => {
      let query = supabase
        .from("invoice")
        .select("id, vendor_id, invoice_number, amount, hst_amount, terms, due_date, status, vendor:vendor_id(name)")
        .in("status", ["unpaid", "postdated"])
        .not("due_date", "is", null)
        .order("due_date", { ascending: true });
      if (storeId) query = query.eq("store_id", storeId);
      const { data, error } = await query;
      if (error) setError(error.message);
      else setInvoices((data as unknown as Invoice[]) || []);
      setLoading(false);
    })();
  }, [ready, storeId]);

  const total = (i: Invoice) => (Number(i.amount) || 0) + (Number(i.hst_amount) || 0);
  const outstanding = useMemo(() => invoices.reduce((s, i) => s + total(i), 0), [invoices]);

  function band(status: string, d: number | null): { cls: string; text: string } {
    if (status === "postdated") return { cls: "chip-progress", text: "post-dated" };
    if (d == null) return { cls: "chip-neutral", text: "no due date" };
    if (d > 0) return { cls: "chip-error", text: `${d} days overdue` };
    if (d >= -7) return { cls: "chip-warning", text: d === 0 ? "due today" : `due in ${-d} days` };
    return { cls: "chip-neutral", text: `due in ${-d} days` };
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Outstanding and overdue</h1>
        <span className="tabular help">{formatCAD(outstanding)} owed</span>
      </div>

      {loading && <p className="help">Loading invoices.</p>}
      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Connection</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}
      {!loading && !error && invoices.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Nothing outstanding.</p>
          <p className="help" style={{ margin: "6px 0 0" }}>Every invoice on file is paid.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {invoices.map((i) => {
          const d = daysOverdue(i.due_date);
          const b = band(i.status, d);
          return (
            <div key={i.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>{i.vendor?.name || "Vendor"}</strong>
                  <span className={`chip ${b.cls}`}>{b.text}</span>
                </div>
                <div className="help" style={{ marginTop: 4 }}>{i.invoice_number || ""}{i.due_date ? ` . due ${i.due_date}` : ""}{i.terms ? ` . ${i.terms}` : ""}</div>
              </div>
              <div className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{formatCAD(total(i))}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
