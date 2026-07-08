"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCAD, daysOverdue, todayISO } from "@/lib/format";
import { useActiveStore } from "@/lib/store";
import { canSeeMoney, currentActorId, useCurrentRole, useMember } from "@/lib/auth";
import { canEdit } from "@/lib/edit";
import type { Invoice } from "@/lib/types";

// Values are the ones the payment.method check constraint allows (and the vendor detail
// screen uses); labels are what a person reads.
const PAY_METHODS: { value: string; label: string }[] = [
  { value: "cheque", label: "cheque" },
  { value: "etransfer", label: "e-transfer" },
  { value: "cc", label: "credit card" },
  { value: "cash", label: "cash" }
];

export default function Overdue() {
  const { storeId, ready } = useActiveStore();
  const { role } = useCurrentRole();
  const { member } = useMember();
  const showMoney = canSeeMoney(role);
  const mayEdit = canEdit(role);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ paid_date: todayISO(), method: "cheque" });
  const [busy, setBusy] = useState(false);

  async function load() {
    let query = supabase
      .from("invoice")
      .select("id, vendor_id, invoice_number, amount, hst_amount, terms, due_date, status, vendor:vendor_id(name)")
      .is("voided_at", null)
      .in("status", ["unpaid", "postdated"])
      .not("due_date", "is", null)
      .order("due_date", { ascending: true });
    if (storeId) query = query.eq("store_id", storeId);
    const { data, error } = await query;
    if (error) setError(error.message);
    else setInvoices((data as unknown as Invoice[]) || []);
  }

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    (async () => {
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  const total = (i: Invoice) => (Number(i.amount) || 0) + (Number(i.hst_amount) || 0);
  const outstanding = useMemo(() => invoices.reduce((s, i) => s + total(i), 0), [invoices]);

  // Record a full payment against the invoice: one payment row, the invoice marked paid,
  // and the audit trail records who did it. Owners and managers only. Not atomic (two
  // writes), so a retry after a half-failure first checks whether the payment row already
  // exists rather than inserting a duplicate.
  async function recordPayment(i: Invoice) {
    setBusy(true);
    setError(null);
    try {
      const actor = currentActorId(member);
      const { data: existing } = await supabase
        .from("payment")
        .select("id")
        .eq("invoice_id", i.id)
        .is("voided_at", null)
        .limit(1)
        .maybeSingle();
      if (!existing) {
        const p = await supabase
          .from("payment")
          .insert({ invoice_id: i.id, amount: total(i), method: payForm.method, paid_date: payForm.paid_date || todayISO(), created_by: actor })
          .select("id")
          .single();
        if (p.error) throw new Error(p.error.message);
      }
      const u = await supabase.from("invoice").update({ status: "paid" }).eq("id", i.id);
      if (u.error) throw new Error(u.error.message);
      if (actor) {
        // Same shape as the vendor detail screen: the log entry points at the invoice.
        await supabase.from("activity_log").insert({ actor_id: actor, action: "payment_recorded", entity: "invoice", entity_id: i.id });
      }
      setPayingId(null);
      // One invoice changed; drop it locally instead of re-downloading the whole list.
      setInvoices((prev) => prev.filter((x) => x.id !== i.id));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function band(status: string, d: number | null): { cls: string; text: string } {
    if (status === "postdated") return { cls: "chip-progress", text: "post-dated" };
    if (d == null) return { cls: "chip-neutral", text: "no due date" };
    if (d > 0) return { cls: "chip-error", text: `${d} days overdue` };
    if (d >= -7) return { cls: "chip-warning", text: d === 0 ? "due today" : `due in ${-d} days` };
    return { cls: "chip-neutral", text: `due in ${-d} days` };
  }

  return (
    <div>
      <header className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Outstanding and overdue</h1>
        </div>
        <div className="page-actions">
          {showMoney && <span className="tabular help">{formatCAD(outstanding)} owed</span>}
        </div>
      </header>

      {loading && <p className="help">Loading invoices.</p>}
      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Error</span>
          <p className="help" style={{ marginTop: 8 }}>{error}</p>
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
            <div key={i.id} className="card" style={{ padding: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{i.vendor?.name || "Vendor"}</strong>
                    <span className={`chip ${b.cls}`}>{b.text}</span>
                  </div>
                  <div className="help" style={{ marginTop: 4 }}>{i.invoice_number || ""}{i.due_date ? ` . due ${i.due_date}` : ""}{i.terms ? ` . ${i.terms}` : ""}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  {showMoney && <div className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{formatCAD(total(i))}</div>}
                  {showMoney && mayEdit && payingId !== i.id && (
                    <button
                      className="btn-ghost"
                      style={{ padding: "4px 10px" }}
                      onClick={() => { setPayingId(i.id); setPayForm({ paid_date: todayISO(), method: "cheque" }); }}
                      disabled={busy}
                    >
                      Record payment
                    </button>
                  )}
                </div>
              </div>
              {showMoney && mayEdit && payingId === i.id && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div>
                    <label className="label" htmlFor={`pay-date-${i.id}`}>Paid date</label>
                    <input id={`pay-date-${i.id}`} className="input" type="date" value={payForm.paid_date} onChange={(e) => setPayForm({ ...payForm, paid_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`pay-method-${i.id}`}>Method</label>
                    <select id={`pay-method-${i.id}`} className="input" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                      {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <button className="btn-primary" onClick={() => recordPayment(i)} disabled={busy}>
                    {busy ? "Saving." : `Mark paid ${formatCAD(total(i))}`}
                  </button>
                  <button className="btn-ghost" onClick={() => setPayingId(null)} disabled={busy}>Cancel</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
