"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCAD, daysOverdue, round2, todayISO } from "@/lib/format";
import { useActiveStore } from "@/lib/store";
import { canSeeMoney, currentActorId, useCurrentRole, useMember } from "@/lib/auth";
import { canEdit } from "@/lib/edit";
import {
  PAYMENT_METHODS, referenceLabel, invoiceTotal, isFutureDate,
  recordPaymentRpc, reconcilePostdated, fetchSettlements,
  remainingOwed, remainingToAllocate, type InvoiceSettlement
} from "@/lib/payments";
import type { Invoice } from "@/lib/types";

export default function Overdue() {
  const { storeId, ready } = useActiveStore();
  const { role } = useCurrentRole();
  const { member } = useMember();
  const showMoney = canSeeMoney(role);
  const mayEdit = canEdit(role);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settlements, setSettlements] = useState<Map<string, InvoiceSettlement>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ paid_date: todayISO(), method: "cheque", reference: "", notes: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    // Post-dated cheques whose date has arrived flip to paid on their own here.
    await reconcilePostdated();
    let query = supabase
      .from("invoice")
      .select("id, vendor_id, invoice_number, amount, hst_amount, terms, due_date, status, vendor:vendor_id(name)")
      .is("voided_at", null)
      .in("status", ["unpaid", "partially_paid", "postdated"])
      .not("due_date", "is", null)
      .order("due_date", { ascending: true });
    if (storeId) query = query.eq("store_id", storeId);
    const { data, error } = await query;
    if (error) {
      setError(error.message);
      return;
    }
    const list = (data as unknown as Invoice[]) || [];
    setInvoices(list);
    try {
      setSettlements(await fetchSettlements(list.map((i) => i.id)));
    } catch {
      setSettlements(new Map());
    }
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

  const total = (i: Invoice) => invoiceTotal(i);
  // Owed = invoice total minus settled payments. Post-dated money has not left the account,
  // so it still counts as owed; the chip shows the invoice is covered.
  const owed = (i: Invoice) => remainingOwed(total(i), settlements.get(i.id));
  const toPay = (i: Invoice) => round2(remainingToAllocate(total(i), settlements.get(i.id)));
  const outstanding = useMemo(
    () => invoices.reduce((s, i) => s + owed(i), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, settlements]
  );

  // Record what is left on the invoice through the record_payment RPC: payment row,
  // allocation, recomputed invoice status, and the audit entries in one transaction.
  // A future paid date records it as post-dated and the invoice stays here until it clears.
  async function recordPayment(i: Invoice) {
    if (payForm.method === "other" && !payForm.notes.trim()) {
      setError("Method is Other: say what it was in the notes.");
      return;
    }
    const amount = toPay(i);
    if (amount <= 0) {
      setError("Nothing left to pay on this invoice; a post-dated payment already covers it.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recordPaymentRpc({
        vendorId: i.vendor_id as string,
        method: payForm.method,
        paidDate: payForm.paid_date || todayISO(),
        reference: payForm.reference,
        notes: payForm.notes,
        actorId: currentActorId(member),
        allocations: [{ invoice_id: i.id, amount }]
      });
      setPayingId(null);
      // Statuses may have shifted (paid, or post-dated with a future date); reload the list.
      await load();
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
                    {i.status === "partially_paid" && <span className="chip chip-progress">partially paid</span>}
                  </div>
                  <div className="help" style={{ marginTop: 4 }}>
                    {i.invoice_number || ""}{i.due_date ? ` . due ${i.due_date}` : ""}{i.terms ? ` . ${i.terms}` : ""}
                    {showMoney && i.status === "partially_paid" ? ` . ${formatCAD(owed(i))} of ${formatCAD(total(i))} still owed` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  {showMoney && <div className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{formatCAD(owed(i))}</div>}
                  {showMoney && mayEdit && payingId !== i.id && i.status !== "postdated" && (
                    <button
                      className="btn-ghost"
                      style={{ padding: "4px 10px" }}
                      onClick={() => { setPayingId(i.id); setPayForm({ paid_date: todayISO(), method: "cheque", reference: "", notes: "" }); }}
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
                    {isFutureDate(payForm.paid_date) && <p className="help" style={{ margin: "4px 0 0" }}>Future date: records as post-dated.</p>}
                  </div>
                  <div>
                    <label className="label" htmlFor={`pay-method-${i.id}`}>Method</label>
                    <select id={`pay-method-${i.id}`} className="input" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                      {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`pay-ref-${i.id}`}>{referenceLabel(payForm.method)}</label>
                    <input id={`pay-ref-${i.id}`} className="input" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
                  </div>
                  {payForm.method === "other" && (
                    <div>
                      <label className="label" htmlFor={`pay-notes-${i.id}`}>Notes (say what the method was)</label>
                      <input id={`pay-notes-${i.id}`} className="input" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
                    </div>
                  )}
                  <button className="btn-primary" onClick={() => recordPayment(i)} disabled={busy}>
                    {busy ? "Saving." : `Mark paid ${formatCAD(toPay(i))}`}
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
