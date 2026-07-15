"use client";

// Vendor payouts: the one place to record any money going OUT to a vendor, outside the
// department pages. This tracks vendor dues and what we paid; customer sales at the till
// are not part of this system. Flow: category chip (optional filter, never a gate) ->
// vendor (search, or add a new vendor right here) -> tick the open invoices the payout
// covers (one cheque can settle invoices across categories; each keeps its own category
// through its own allocation) -> method, date, reference, filing.
// A future paid date records a post-dated payment; the invoice shows post-dated until the
// date arrives. Recording goes through the record_payment RPC: payment + allocations +
// invoice statuses + audit, one transaction.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCAD, dueBand, round2, todayISO } from "@/lib/format";
import { useActiveStore } from "@/lib/store";
import { canSeeMoney, currentActorId, useCurrentRole, useMember } from "@/lib/auth";
import { canEdit } from "@/lib/edit";
import { chipClass, labelize } from "@/lib/status";
import {
  PAYMENT_METHODS, CONFIRMATION_FILING, methodLabel, referenceLabel, invoiceTotal, isFutureDate,
  recordPaymentRpc, voidPaymentRpc, reconcilePostdated, fetchSettlements,
  remainingOwed, remainingToAllocate, type InvoiceSettlement
} from "@/lib/payments";
import type { Invoice, Payment } from "@/lib/types";

type DeptLite = { id: string; name: string; accent_color: string | null; parent_department_id: string | null };
type VendorLite = {
  id: string;
  name: string;
  department_id: string | null;
  status: string;
  department: { name: string; accent_color: string | null } | null;
};

export default function Payments() {
  const { storeId, ready } = useActiveStore();
  const { role } = useCurrentRole();
  const { member } = useMember();
  const showMoney = canSeeMoney(role);
  const mayEdit = canEdit(role);

  const [departments, setDepartments] = useState<DeptLite[]>([]);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const [settlements, setSettlements] = useState<Map<string, InvoiceSettlement>>(new Map());
  const [scheduled, setScheduled] = useState<Payment[]>([]);
  const [recent, setRecent] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The consolidated form.
  const [showForm, setShowForm] = useState(false);
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [noInvoice, setNoInvoice] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cheque");
  const [paidDate, setPaidDate] = useState(todayISO());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [filing, setFiling] = useState(""); // digital | physical | "" (not said)

  // Quick-add vendor, so entering a category never dead-ends when the vendor is new.
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [nvForm, setNvForm] = useState({ name: "", department_id: "", phone: "", default_terms: "" });

  const PAY_SELECT =
    "id, vendor_id, invoice_id, amount, method, paid_date, reference, notes, confirmation_filing, created_at, " +
    "vendor:vendor_id(name), payment_allocation(invoice_id, amount, invoice:invoice_id(invoice_number))";

  async function load() {
    // Post-dated cheques whose date has arrived flip to paid on their own here.
    await reconcilePostdated();

    let dq = supabase.from("department").select("id, name, accent_color, parent_department_id").order("name");
    if (storeId) dq = dq.eq("store_id", storeId);
    const { data: deps } = await dq;
    setDepartments((deps as DeptLite[]) || []);

    let vq = supabase
      .from("vendor")
      .select("id, name, department_id, status, department:department_id(name, accent_color)")
      .is("voided_at", null)
      .order("name");
    if (storeId) vq = vq.eq("store_id", storeId);
    const { data: vens, error: verr } = await vq;
    if (verr) {
      setError(verr.message);
      return;
    }
    setVendors(((vens as unknown) as VendorLite[]) || []);

    let iq = supabase
      .from("invoice")
      .select("id, vendor_id, invoice_number, amount, hst_amount, freight_charges, terms, due_date, status")
      .is("voided_at", null)
      .in("status", ["unpaid", "partially_paid", "postdated"])
      .order("due_date", { ascending: true });
    if (storeId) iq = iq.eq("store_id", storeId);
    const { data: invs } = await iq;
    const invoiceList = ((invs as unknown) as Invoice[]) || [];
    setOpenInvoices(invoiceList);
    try {
      setSettlements(await fetchSettlements(invoiceList.map((i) => i.id)));
    } catch {
      setSettlements(new Map());
    }

    const { data: sched } = await supabase
      .from("payment")
      .select(PAY_SELECT)
      .is("voided_at", null)
      .gt("paid_date", todayISO())
      .order("paid_date", { ascending: true });
    setScheduled(((sched as unknown) as Payment[]) || []);

    const { data: rec } = await supabase
      .from("payment")
      .select(PAY_SELECT)
      .is("voided_at", null)
      .order("created_at", { ascending: false })
      .limit(15);
    setRecent(((rec as unknown) as Payment[]) || []);
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

  const selVendor = useMemo(() => vendors.find((v) => v.id === vendorId) || null, [vendors, vendorId]);
  const vendorInvoices = useMemo(
    () => openInvoices.filter((i) => i.vendor_id === vendorId),
    [openInvoices, vendorId]
  );
  // The category chips are the top-level list from the owner's sheet; sections like
  // Clothing, Gifts, and Garden Center live under their parent, so filtering by a
  // category also matches vendors filed under its sections.
  const topCategories = useMemo(
    () => departments.filter((d) => !d.parent_department_id),
    [departments]
  );
  const inCategory = useMemo(() => {
    return (departmentId: string | null, category: string) => {
      if (!departmentId) return false;
      if (departmentId === category) return true;
      const d = departments.find((x) => x.id === departmentId);
      return d?.parent_department_id === category;
    };
  }, [departments]);

  const filteredVendors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors
      .filter((v) => deptFilter === "all" || inCategory(v.department_id, deptFilter))
      .filter((v) => !q || v.name.toLowerCase().includes(q))
      .slice(0, 30);
  }, [vendors, deptFilter, search, inCategory]);

  const allocTotal = useMemo(
    () => Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0),
    [alloc]
  );
  const totalToRecord = noInvoice ? Number(amount) || 0 : allocTotal;

  function resetForm() {
    setVendorId(null);
    setSearch("");
    setDeptFilter("all");
    setAlloc({});
    setNoInvoice(false);
    setAmount("");
    setMethod("cheque");
    setPaidDate(todayISO());
    setReference("");
    setNotes("");
    setFiling("");
    setShowNewVendor(false);
    setNvForm({ name: "", department_id: "", phone: "", default_terms: "" });
  }

  // Quick-add a vendor without leaving the payout flow. Category comes from the active
  // chip when one is picked, otherwise from the select in the small form.
  async function addVendor() {
    const name = nvForm.name.trim();
    const dept = nvForm.department_id || (deptFilter !== "all" ? deptFilter : "");
    if (!name) {
      setError("The new vendor needs a name.");
      return;
    }
    if (!dept) {
      setError("Pick the category for the new vendor.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await supabase
        .from("vendor")
        .insert({
          store_id: storeId,
          department_id: dept,
          name,
          phone: nvForm.phone.trim() || null,
          default_terms: nvForm.default_terms.trim() || null,
          status: "active"
        })
        .select("id")
        .single();
      if (r.error) throw new Error(r.error.message);
      const actor = currentActorId(member);
      if (actor) {
        await supabase.from("activity_log").insert({ actor_id: actor, action: "vendor_added", entity: "vendor", entity_id: r.data.id });
      }
      setShowNewVendor(false);
      setNvForm({ name: "", department_id: "", phone: "", default_terms: "" });
      await load();
      pickVendor(r.data.id as string);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function pickVendor(id: string) {
    setVendorId(id);
    setAlloc({});
    setNoInvoice(false);
    setOkMsg(null);
  }

  function toggleInvoice(i: Invoice) {
    setAlloc((prev) => {
      const next = { ...prev };
      if (next[i.id] !== undefined) {
        delete next[i.id];
      } else {
        const left = round2(remainingToAllocate(invoiceTotal(i), settlements.get(i.id)));
        next[i.id] = left > 0 ? String(left) : "";
      }
      return next;
    });
  }

  async function save() {
    setError(null);
    setOkMsg(null);
    if (!vendorId) {
      setError("Pick the vendor first.");
      return;
    }
    if (!paidDate) {
      setError("Pick the paid date.");
      return;
    }
    if (method === "other" && !notes.trim()) {
      setError("Method is Other: say what it was in the notes.");
      return;
    }
    const allocations = noInvoice
      ? []
      : Object.entries(alloc).map(([invoice_id, v]) => ({ invoice_id, amount: Number(v) || 0 }));
    if (!noInvoice) {
      if (allocations.length === 0) {
        setError("Tick at least one invoice, or mark it as a deposit or prepayment.");
        return;
      }
      if (allocations.some((a) => a.amount <= 0)) {
        setError("Every ticked invoice needs an amount above zero.");
        return;
      }
    } else if (!(Number(amount) > 0)) {
      setError("Enter the amount for the deposit or prepayment.");
      return;
    }

    setBusy(true);
    try {
      await recordPaymentRpc({
        vendorId,
        method,
        paidDate,
        reference,
        notes,
        confirmationFiling: filing,
        actorId: currentActorId(member),
        allocations,
        amount: noInvoice ? Number(amount) : undefined
      });
      const postdated = isFutureDate(paidDate);
      setOkMsg(
        postdated
          ? `Recorded ${formatCAD(totalToRecord)} to ${selVendor?.name || "vendor"} as post-dated. It counts as paid on ${paidDate}.`
          : `Recorded ${formatCAD(totalToRecord)} to ${selVendor?.name || "vendor"}.`
      );
      resetForm();
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePayment(p: Payment) {
    if (!window.confirm("Delete this payment? It will be hidden but kept for the tax history, and its invoices go back to owing.")) return;
    setBusy(true);
    setError(null);
    try {
      await voidPaymentRpc(p.id, currentActorId(member));
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // One line describing what a payment covered.
  function coverage(p: Payment): string {
    const nums = (p.payment_allocation || [])
      .map((a) => a.invoice?.invoice_number)
      .filter(Boolean);
    if (nums.length) return nums.join(", ");
    return "deposit / prepayment";
  }

  if (!loading && role != null && !showMoney) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Vendor payouts are limited.</p>
        <p className="help" style={{ margin: "6px 0 0" }}>
          Payouts hold dollar figures, so they are limited to leads, managers, and the owner.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header className="page-head">
        <div>
          <h1 className="page-title">Vendor payouts</h1>
          <p className="page-sub">Money going out to vendors: what we owe and what we paid. Customer sales at the till are not tracked here.</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setShowForm((s) => !s); setOkMsg(null); }}>
            {showForm ? "Close" : "+ Record payout"}
          </button>
        </div>
      </header>

      {error && (
        <div className="card" style={{ padding: 12 }}>
          <span className="chip chip-error">Error</span>
          <span className="help" style={{ marginLeft: 8 }}>{error}</span>
        </div>
      )}
      {okMsg && (
        <div className="card" style={{ padding: 12 }}>
          <span className="chip chip-success">Saved</span>
          <span className="help" style={{ marginLeft: 8 }}>{okMsg}</span>
        </div>
      )}
      {loading && <p className="help">Loading payments.</p>}

      {showForm && !loading && (
        <div className="card" style={{ padding: 16, display: "grid", gap: 14 }}>
          {/* Step 1: vendor. Search first; department is a filter chip, never a required step. */}
          {!selVendor && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  className="chip"
                  style={{ cursor: "pointer", border: deptFilter === "all" ? "1px solid var(--primary-base, #2F6FEB)" : "1px solid var(--border)", background: "#EEF1F4" }}
                  onClick={() => setDeptFilter("all")}
                >
                  All categories
                </button>
                {topCategories.map((d) => (
                  <button
                    key={d.id}
                    className="chip"
                    style={{ cursor: "pointer", border: deptFilter === d.id ? "1px solid var(--primary-base, #2F6FEB)" : "1px solid var(--border)", background: "#EEF1F4", color: d.accent_color || undefined }}
                    onClick={() => setDeptFilter(deptFilter === d.id ? "all" : d.id)}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
              <div>
                <label className="label" htmlFor="pay-vendor-search">Vendor</label>
                <input
                  id="pay-vendor-search"
                  className="input"
                  placeholder="Start typing the vendor name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {filteredVendors.map((v) => (
                  <button
                    key={v.id}
                    className="card"
                    style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left" }}
                    onClick={() => pickVendor(v.id)}
                  >
                    <span style={{ fontWeight: 600 }}>{v.name}</span>
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {v.department && (
                        <span className="chip" style={{ background: "#EEF1F4", color: v.department.accent_color || "#6B7480" }}>
                          {v.department.name}
                        </span>
                      )}
                      {openInvoices.some((i) => i.vendor_id === v.id) && (
                        <span className="chip chip-warning">open invoices</span>
                      )}
                    </span>
                  </button>
                ))}
                {filteredVendors.length === 0 && <p className="help">No vendors match. Clear the search or the category filter, or add the vendor below.</p>}
              </div>
              {!showNewVendor && (
                <div>
                  <button className="btn-ghost" onClick={() => { setShowNewVendor(true); setNvForm({ ...nvForm, department_id: deptFilter !== "all" ? deptFilter : "" }); }}>
                    + New vendor
                  </button>
                </div>
              )}
              {showNewVendor && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                    <div><label className="label" htmlFor="nv-name">Vendor name</label><input id="nv-name" className="input" value={nvForm.name} onChange={(e) => setNvForm({ ...nvForm, name: e.target.value })} /></div>
                    <div><label className="label" htmlFor="nv-dept">Category</label>
                      <select id="nv-dept" className="input" value={nvForm.department_id || (deptFilter !== "all" ? deptFilter : "")} onChange={(e) => setNvForm({ ...nvForm, department_id: e.target.value })}>
                        <option value="">Pick a category</option>
                        {topCategories.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div><label className="label" htmlFor="nv-phone">Phone</label><input id="nv-phone" className="input" value={nvForm.phone} onChange={(e) => setNvForm({ ...nvForm, phone: e.target.value })} /></div>
                    <div><label className="label" htmlFor="nv-terms">Terms</label><input id="nv-terms" className="input" placeholder="Net 30" value={nvForm.default_terms} onChange={(e) => setNvForm({ ...nvForm, default_terms: e.target.value })} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-primary" onClick={addVendor} disabled={busy}>{busy ? "Saving." : "Add vendor"}</button>
                    <button className="btn-ghost" onClick={() => setShowNewVendor(false)} disabled={busy}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: what the payment covers, then how it was paid. */}
          {selVendor && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong>{selVendor.name}</strong>
                {selVendor.department && (
                  <span className="chip" style={{ background: "#EEF1F4", color: selVendor.department.accent_color || "#6B7480" }}>
                    {selVendor.department.name}
                  </span>
                )}
                <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => { setVendorId(null); setAlloc({}); }}>
                  Change vendor
                </button>
              </div>

              {!noInvoice && (
                <div style={{ display: "grid", gap: 8 }}>
                  <div className="label">Apply to invoices</div>
                  {vendorInvoices.length === 0 && (
                    <p className="help">No open invoices for this vendor. Mark it as a deposit or prepayment below, or add the invoice on the vendor page first.</p>
                  )}
                  {vendorInvoices.map((i) => {
                    const s = settlements.get(i.id);
                    const total = invoiceTotal(i);
                    const owed = remainingOwed(total, s);
                    const left = remainingToAllocate(total, s);
                    const checked = alloc[i.id] !== undefined;
                    const b = i.status === "postdated" ? { cls: "chip-progress", text: "post-dated" } : dueBand(i.due_date, 7);
                    return (
                      <div key={i.id} className="card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <input
                          type="checkbox"
                          id={`alloc-${i.id}`}
                          checked={checked}
                          onChange={() => toggleInvoice(i)}
                          style={{ width: 18, height: 18 }}
                        />
                        <label htmlFor={`alloc-${i.id}`} style={{ flex: 1, cursor: "pointer" }}>
                          <span style={{ fontWeight: 600 }}>{i.invoice_number || "Invoice"}</span>
                          <span className={`chip ${b.cls}`} style={{ marginLeft: 8 }}>{b.text}</span>
                          {i.status === "partially_paid" && (
                            <span className={`chip ${chipClass(i.status)}`} style={{ marginLeft: 6 }}>{labelize(i.status)}</span>
                          )}
                          <span className="help" style={{ display: "block", marginTop: 2 }}>
                            {formatCAD(owed)} owed{left !== owed ? ` . ${formatCAD(left)} after post-dated` : ""}{i.due_date ? ` . due ${i.due_date}` : ""}
                          </span>
                        </label>
                        {checked && (
                          <div>
                            <label className="label" htmlFor={`alloc-amt-${i.id}`}>Amount</label>
                            <input
                              id={`alloc-amt-${i.id}`}
                              className="input tabular"
                              style={{ width: 130 }}
                              type="number"
                              step="0.01"
                              value={alloc[i.id]}
                              onChange={(e) => setAlloc({ ...alloc, [i.id]: e.target.value })}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  id="pay-noinvoice"
                  checked={noInvoice}
                  onChange={(e) => { setNoInvoice(e.target.checked); if (e.target.checked) setAlloc({}); }}
                  style={{ width: 18, height: 18 }}
                />
                <label htmlFor="pay-noinvoice">Deposit or prepayment, no invoice yet</label>
              </div>
              {noInvoice && (
                <div>
                  <label className="label" htmlFor="pay-amount">Amount</label>
                  <input
                    id="pay-amount"
                    className="input tabular"
                    style={{ maxWidth: 200 }}
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <p className="help" style={{ margin: "4px 0 0" }}>When the invoice arrives later, it matches on this vendor.</p>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                <div>
                  <label className="label" htmlFor="pay-method">Method</label>
                  <select id="pay-method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="pay-date">Paid date</label>
                  <input id="pay-date" className="input" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
                  {isFutureDate(paidDate) && <p className="help" style={{ margin: "4px 0 0" }}>Future date: records as post-dated.</p>}
                </div>
                <div>
                  <label className="label" htmlFor="pay-ref">{referenceLabel(method)}</label>
                  <input id="pay-ref" className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="pay-filing">Confirmation filed</label>
                  <select id="pay-filing" className="input" value={filing} onChange={(e) => setFiling(e.target.value)}>
                    <option value="">Not said</option>
                    {CONFIRMATION_FILING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="pay-notes">Notes{method === "other" ? " (say what the method was)" : ""}</label>
                <input id="pay-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn-primary" onClick={save} disabled={busy || totalToRecord <= 0}>
                  {busy ? "Saving." : `Record ${formatCAD(totalToRecord)}`}
                </button>
                <button className="btn-ghost" onClick={() => { resetForm(); setShowForm(false); }} disabled={busy}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {!loading && scheduled.length > 0 && (
        <section>
          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Post-dated and scheduled</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {scheduled.map((p) => (
              <div key={p.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{p.vendor?.name || "Vendor"}</strong>
                    <span className="chip chip-progress">clears {p.paid_date}</span>
                  </div>
                  <div className="help" style={{ marginTop: 4 }}>
                    {methodLabel(p.method)}{p.reference ? ` . ${p.reference}` : ""} . {coverage(p)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="tabular" style={{ fontWeight: 600 }}>{formatCAD(p.amount)}</div>
                  {mayEdit && (
                    <button className="btn-ghost" style={{ padding: "4px 10px", marginTop: 4 }} onClick={() => removePayment(p)} disabled={busy}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && (
        <section>
          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Recent payments</h2>
          {recent.length === 0 && <p className="help">No payments recorded yet.</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {recent.map((p) => (
              <div key={p.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{p.vendor?.name || "Vendor"}</strong>
                    {isFutureDate(p.paid_date) && <span className="chip chip-progress">post-dated</span>}
                  </div>
                  <div className="help" style={{ marginTop: 4 }}>
                    {methodLabel(p.method)}{p.reference ? ` . ${p.reference}` : ""}{p.paid_date ? ` . paid ${p.paid_date}` : ""} . {coverage(p)}
                    {p.confirmation_filing ? ` . filed ${p.confirmation_filing}` : ""}
                    {p.notes ? ` . ${p.notes}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="tabular" style={{ fontWeight: 600 }}>{formatCAD(p.amount)}</div>
                  {mayEdit && (
                    <button className="btn-ghost" style={{ padding: "4px 10px", marginTop: 4 }} onClick={() => removePayment(p)} disabled={busy}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
