"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { chipClass, labelize } from "@/lib/status";
import { formatCAD, daysOverdue, round2, todayISO, hstOn } from "@/lib/format";
import { REQUIRE_AUTH, canSeeMoney, useEffectiveActor } from "@/lib/auth";
import { canEdit, voidRow } from "@/lib/edit";
import {
  PAYMENT_METHODS, CONFIRMATION_FILING, DELIVERY_STATUS, WORK_TYPES, isPropertyDept,
  methodLabel, referenceLabel, invoiceTotal as invTotal, isFutureDate,
  recordPaymentRpc, voidPaymentRpc, fetchSettlements,
  remainingOwed, remainingToAllocate, type InvoiceSettlement
} from "@/lib/payments";
import type { Vendor, PurchaseOrder, Invoice, Payment, AppUser, CreditNote } from "@/lib/types";

const ACTOR_KEY = "rgs_actor";
const num = (s: string) => (s.trim() === "" ? null : Number(s));
// HST auto-fills from the pre-tax amount (Ontario 13%), matching the capture screen. Blank
// amount leaves HST blank; the field stays editable so a tax-exempt line can be overridden.
const hstFieldFor = (amount: string) => {
  const n = num(amount);
  return n == null || !isFinite(n) ? "" : String(hstOn(n));
};

export default function VendorDetail() {
  const params = useParams();
  const id = String(params?.id || "");
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [actorId, setActorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editVendor, setEditVendor] = useState(false);
  const [vForm, setVForm] = useState({ rep_name: "", phone: "", email: "", products_we_carry: "", default_terms: "", status: "active", notes: "" });
  const [showPO, setShowPO] = useState(false);
  const [poForm, setPoForm] = useState({ order_amount: "", ship_date: "", delivery_commit: "", status: "ordered", season_year: "2026", notes: "" });
  const [showInv, setShowInv] = useState(false);
  // The workflow-sheet fields. status "paid" at entry also records the payment
  // (Ravi: an invoice arrives paid or unpaid). Property Maintenance vendors get the
  // estimate / work fields; merchandise vendors get delivery and freight.
  const emptyInvForm = {
    invoice_number: "", invoice_date: todayISO(), amount: "", hst_amount: "", freight_charges: "",
    delivery_status: "", terms: "", due_date: "", status: "unpaid",
    estimate_number: "", work_type: "", work_description: "",
    pay_method: "cheque", pay_date: todayISO(), pay_reference: "", pay_filing: ""
  };
  const [invForm, setInvForm] = useState({ ...emptyInvForm });
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "cheque", paid_date: todayISO(), reference: "", notes: "", filing: "" });
  const [settlements, setSettlements] = useState<Map<string, InvoiceSettlement>>(new Map());

  const [editInvId, setEditInvId] = useState<string | null>(null);
  const [editInvForm, setEditInvForm] = useState({
    invoice_number: "", invoice_date: "", amount: "", hst_amount: "", freight_charges: "",
    delivery_status: "", terms: "", due_date: "", status: "unpaid",
    estimate_number: "", work_type: "", work_description: ""
  });
  const [editPoId, setEditPoId] = useState<string | null>(null);
  const [editPoForm, setEditPoForm] = useState({ order_amount: "", ship_date: "", status: "ordered", notes: "" });

  // Credits
  const [credits, setCredits] = useState<CreditNote[]>([]);
  const [showCredit, setShowCredit] = useState(false);
  const [creditForm, setCreditForm] = useState({ invoice_number: "", credit_amount: "", reason: "", comments: "", invoice_id: "", status: "pending" });

  // Effective role and actor: in enforced auth the signed-in member, else the dropdown.
  const { effectiveActorId, role } = useEffectiveActor(users, actorId);
  const showMoney = canSeeMoney(role);
  // Property Maintenance vendors get the estimate / work fields on their invoices.
  const isProperty = isPropertyDept(vendor?.department?.name);

  async function load() {
    const { data: v, error: ve } = await supabase
      .from("vendor")
      .select("id, store_id, department_id, name, rep_name, phone, email, products_we_carry, default_terms, status, notes, department:department_id(name, accent_color)")
      .eq("id", id)
      .is("voided_at", null)
      .maybeSingle();
    if (ve) {
      setError(ve.message);
      return;
    }
    setVendor((v as unknown as Vendor) || null);
    const { data: po } = await supabase.from("purchase_order").select("id, vendor_id, order_amount, ship_date, delivery_commit, status, season_year, notes, department_id").eq("vendor_id", id).is("voided_at", null).order("ship_date", { ascending: false });
    setOrders((po as unknown as PurchaseOrder[]) || []);
    const { data: inv } = await supabase.from("invoice").select("id, vendor_id, invoice_number, invoice_date, amount, hst_amount, freight_charges, delivery_status, estimate_number, work_type, work_description, terms, due_date, status").eq("vendor_id", id).is("voided_at", null).order("due_date", { ascending: true });
    const invList = (inv as unknown as Invoice[]) || [];
    setInvoices(invList);
    try {
      setSettlements(await fetchSettlements(invList.map((i) => i.id)));
    } catch {
      setSettlements(new Map());
    }
    // Payments belong to the vendor now (the migration backfills vendor_id on legacy rows).
    const { data: pay } = await supabase
      .from("payment")
      .select("id, invoice_id, vendor_id, amount, method, paid_date, reference, notes, confirmation_filing, payment_allocation(invoice_id, amount, invoice:invoice_id(invoice_number))")
      .eq("vendor_id", id)
      .is("voided_at", null)
      .order("paid_date", { ascending: false });
    setPayments((pay as unknown as Payment[]) || []);

    // Load credit notes for this vendor.
    const { data: creds } = await supabase
      .from("credit_note")
      .select("id, store_id, vendor_id, invoice_id, invoice_number, credit_amount, reason, comments, status, created_by, created_at, voided_at, invoice:invoice_id(invoice_number, amount, hst_amount)")
      .eq("vendor_id", id)
      .is("voided_at", null)
      .order("created_at", { ascending: false });
    setCredits((creds as unknown as CreditNote[]) || []);
  }

  useEffect(() => {
    if (!id) return;
    (async () => {
      await load();
      const { data: us } = await supabase.from("app_user").select("id, full_name, role").order("full_name");
      const usr = (us as AppUser[]) || [];
      setUsers(usr);
      const saved = typeof window !== "undefined" ? localStorage.getItem(ACTOR_KEY) : null;
      setActorId(saved || usr[0]?.id || "");
      setLoading(false);
    })();
  }, [id]);

  function setActor(uid: string) {
    setActorId(uid);
    if (typeof window !== "undefined") localStorage.setItem(ACTOR_KEY, uid);
  }
  async function log(action: string, entity: string, entity_id: string | null) {
    if (effectiveActorId) await supabase.from("activity_log").insert({ actor_id: effectiveActorId, action, entity, entity_id });
  }

  function startEditVendor() {
    if (!vendor) return;
    setVForm({
      rep_name: vendor.rep_name || "",
      phone: vendor.phone || "",
      email: vendor.email || "",
      products_we_carry: vendor.products_we_carry || "",
      default_terms: vendor.default_terms || "",
      status: vendor.status || "active",
      notes: vendor.notes || ""
    });
    setEditVendor(true);
  }

  async function saveVendor() {
    if (!vendor) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("vendor").update({
        rep_name: vForm.rep_name || null,
        phone: vForm.phone || null,
        email: vForm.email || null,
        products_we_carry: vForm.products_we_carry || null,
        default_terms: vForm.default_terms || null,
        status: vForm.status,
        notes: vForm.notes || null
      }).eq("id", vendor.id);
      if (r.error) throw new Error(r.error.message);
      await log("vendor_edited", "vendor", vendor.id);
      setEditVendor(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addPO() {
    if (!vendor) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("purchase_order").insert({
        store_id: vendor.store_id ?? null,
        vendor_id: vendor.id,
        department_id: vendor.department_id,
        season_year: num(poForm.season_year),
        order_amount: num(poForm.order_amount),
        ship_date: poForm.ship_date || null,
        delivery_commit: poForm.delivery_commit || null,
        status: poForm.status,
        notes: poForm.notes || null,
        created_by: effectiveActorId
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      await log("order_added", "purchase_order", r.data.id as string);
      setShowPO(false);
      setPoForm({ order_amount: "", ship_date: "", delivery_commit: "", status: "ordered", season_year: "2026", notes: "" });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function updatePOStatus(poId: string, status: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("purchase_order").update({ status }).eq("id", poId);
      if (r.error) throw new Error(r.error.message);
      await log("order_status_changed", "purchase_order", poId);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addInvoice() {
    if (!vendor) return;
    setBusy(true);
    setError(null);
    try {
      // Insert as unpaid; if the invoice arrived already paid, the payment recorded next
      // flips it. That way a paid invoice always has its payment row behind it.
      const r = await supabase.from("invoice").insert({
        store_id: vendor.store_id ?? null,
        vendor_id: vendor.id,
        invoice_number: invForm.invoice_number || null,
        invoice_date: invForm.invoice_date || null,
        amount: num(invForm.amount),
        hst_amount: num(invForm.hst_amount) ?? 0,
        freight_charges: num(invForm.freight_charges),
        delivery_status: invForm.delivery_status || null,
        estimate_number: isProperty ? invForm.estimate_number || null : null,
        work_type: isProperty ? invForm.work_type || null : null,
        work_description: isProperty ? invForm.work_description || null : null,
        terms: invForm.terms || null,
        due_date: invForm.due_date || null,
        status: "unpaid"
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      await log("invoice_added", "invoice", r.data.id as string);
      if (invForm.status === "paid") {
        const total = (num(invForm.amount) || 0) + (num(invForm.freight_charges) || 0) + (num(invForm.hst_amount) || 0);
        await recordPaymentRpc({
          vendorId: vendor.id,
          method: invForm.pay_method,
          paidDate: invForm.pay_date || todayISO(),
          reference: invForm.pay_reference,
          confirmationFiling: invForm.pay_filing,
          actorId: effectiveActorId,
          allocations: [{ invoice_id: r.data.id as string, amount: round2(total) }]
        });
      }
      setShowInv(false);
      setInvForm({ ...emptyInvForm });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startEditInvoice(i: Invoice) {
    setEditInvId(i.id);
    setEditInvForm({
      invoice_number: i.invoice_number || "",
      invoice_date: i.invoice_date || "",
      amount: i.amount != null ? String(i.amount) : "",
      hst_amount: i.hst_amount != null ? String(i.hst_amount) : "",
      freight_charges: i.freight_charges != null ? String(i.freight_charges) : "",
      delivery_status: i.delivery_status || "",
      estimate_number: i.estimate_number || "",
      work_type: i.work_type || "",
      work_description: i.work_description || "",
      terms: i.terms || "",
      due_date: i.due_date || "",
      status: i.status || "unpaid"
    });
  }

  async function saveInvoice() {
    if (!editInvId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("invoice").update({
        invoice_number: editInvForm.invoice_number || null,
        invoice_date: editInvForm.invoice_date || null,
        amount: num(editInvForm.amount),
        hst_amount: num(editInvForm.hst_amount) ?? 0,
        freight_charges: num(editInvForm.freight_charges),
        delivery_status: editInvForm.delivery_status || null,
        estimate_number: editInvForm.estimate_number || null,
        work_type: editInvForm.work_type || null,
        work_description: editInvForm.work_description || null,
        terms: editInvForm.terms || null,
        due_date: editInvForm.due_date || null,
        status: editInvForm.status
      }).eq("id", editInvId);
      if (r.error) throw new Error(r.error.message);
      await log("invoice_edited", "invoice", editInvId);
      setEditInvId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeInvoice(i: Invoice) {
    if (!window.confirm(`Delete invoice ${i.invoice_number || ""}? It will be hidden but kept for the tax history.`)) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("invoice", i.id, effectiveActorId);
      if (editInvId === i.id) setEditInvId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startEditPO(o: PurchaseOrder) {
    setEditPoId(o.id);
    setEditPoForm({
      order_amount: o.order_amount != null ? String(o.order_amount) : "",
      ship_date: o.ship_date || "",
      status: o.status || "ordered",
      notes: o.notes || ""
    });
  }

  async function savePO() {
    if (!editPoId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("purchase_order").update({
        order_amount: num(editPoForm.order_amount),
        ship_date: editPoForm.ship_date || null,
        status: editPoForm.status,
        notes: editPoForm.notes || null
      }).eq("id", editPoId);
      if (r.error) throw new Error(r.error.message);
      await log("order_edited", "purchase_order", editPoId);
      setEditPoId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePO(o: PurchaseOrder) {
    if (!window.confirm(`Delete this ${o.season_year || ""} order? It will be hidden but kept for the tax history.`)) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("purchase_order", o.id, effectiveActorId);
      if (editPoId === o.id) setEditPoId(null);
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
      // void_payment also puts every invoice this payment touched back to its true status.
      await voidPaymentRpc(p.id, effectiveActorId);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addCredit() {
    if (!vendor) return;
    const amount = Number(creditForm.credit_amount);
    if (!amount || amount <= 0) {
      setError("Enter the credit amount.");
      return;
    }
    if (!creditForm.reason.trim()) {
      setError("Enter the reason for the credit.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("credit_note").insert({
        store_id: vendor.store_id ?? null,
        vendor_id: vendor.id,
        invoice_id: creditForm.invoice_id || null,
        invoice_number: creditForm.invoice_number.trim() || null,
        credit_amount: amount,
        reason: creditForm.reason.trim(),
        comments: creditForm.comments.trim() || null,
        status: creditForm.status,
        created_by: effectiveActorId
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      await log("credit_added", "credit_note", r.data.id as string);
      setShowCredit(false);
      setCreditForm({ invoice_number: "", credit_amount: "", reason: "", comments: "", invoice_id: "", status: "pending" });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeCredit(c: CreditNote) {
    if (!window.confirm("Delete this credit note? It will be hidden but kept for the history.")) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("credit_note", c.id, effectiveActorId);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeVendor() {
    if (!vendor) return;
    if (!window.confirm(`Delete ${vendor.name}? It will be hidden from the directory but kept for the tax history.`)) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("vendor", vendor.id, effectiveActorId);
      window.location.href = "/vendors";
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  function startPay(i: Invoice) {
    setPayFor(i.id);
    // Prefill what is left to allocate: partial payments and post-dated cheques already
    // covering their share reduce it.
    const left = round2(remainingToAllocate(invTotal(i), settlements.get(i.id)));
    setPayForm({ amount: left > 0 ? String(left) : "", method: "cheque", paid_date: todayISO(), reference: "", notes: "", filing: "" });
  }

  async function recordPayment() {
    if (!payFor || !vendor) return;
    const amount = num(payForm.amount);
    if (!amount || amount <= 0) {
      setError("Enter the payment amount.");
      return;
    }
    if (payForm.method === "other" && !payForm.notes.trim()) {
      setError("Method is Other: say what it was in the notes.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // One atomic call: payment + allocation + invoice status + audit. A partial amount
      // leaves the invoice partially paid; a future date records it as post-dated.
      await recordPaymentRpc({
        vendorId: vendor.id,
        method: payForm.method,
        paidDate: payForm.paid_date || todayISO(),
        reference: payForm.reference,
        notes: payForm.notes,
        confirmationFiling: payForm.filing,
        actorId: effectiveActorId,
        allocations: [{ invoice_id: payFor, amount }]
      });
      setPayFor(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const invoiceTotal = (i: Invoice) => invTotal(i);
  // Owed right now: post-dated money has not left the account, so it still counts as owed
  // here; the invoice chip shows it is covered.
  const outstanding = invoices
    .filter((i) => i.status !== "paid")
    .reduce((s, i) => s + remainingOwed(invTotal(i), settlements.get(i.id)), 0);

  if (loading) return <p className="help">Loading vendor.</p>;
  if (error && !vendor)
    return (
      <div className="card" style={{ padding: 16 }}>
        <span className="chip chip-error">Connection</span>
        <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
      </div>
    );
  if (!vendor)
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <p style={{ margin: "0 0 12px" }}>Vendor not found.</p>
        <Link href="/vendors" className="btn-ghost" style={{ textDecoration: "none" }}>Back to vendors</Link>
      </div>
    );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header className="page-head">
        <div>
          <Link href="/vendors" className="help" style={{ textDecoration: "none" }}>&larr; Vendors</Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <h1 className="page-title">{vendor.name}</h1>
            {vendor.department && <span className="chip" style={{ background: "#EEF1F4", color: vendor.department.accent_color || "#6B7480" }}>{vendor.department.name}</span>}
            <span className={`chip ${chipClass(vendor.status)}`}>{labelize(vendor.status)}</span>
          </div>
        </div>
        {!REQUIRE_AUTH && (
          <div className="page-actions">
            <label className="help" htmlFor="actor">Acting as </label>
            <select id="actor" className="input" style={{ width: "auto", display: "inline-block", padding: "6px 8px" }} value={actorId} onChange={(e) => setActor(e.target.value)}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
            </select>
          </div>
        )}
      </header>

      {error && (
        <div className="card" style={{ padding: 12 }}>
          <span className="chip chip-error">Error</span>
          <span className="help" style={{ marginLeft: 8 }}>{error}</span>
        </div>
      )}

      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="help">Contact</div>
            <div>{vendor.rep_name || "No rep on file"}</div>
            <div className="help">{[vendor.phone, vendor.email].filter(Boolean).join(" . ")}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            {showMoney && (
              <>
                <div className="help">Outstanding</div>
                <div className="tabular" style={{ fontSize: 20, fontWeight: 700 }}>{formatCAD(outstanding)}</div>
              </>
            )}
            <div className="help">{vendor.default_terms || ""}</div>
          </div>
        </div>
        {vendor.products_we_carry && <div><div className="help">Products</div><div>{vendor.products_we_carry}</div></div>}
        {vendor.notes && <div><div className="help">Notes and rules</div><div>{vendor.notes}</div></div>}
        {!editVendor && canEdit(role) && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" onClick={startEditVendor}>Edit vendor</button>
            <button className="btn-ghost" onClick={removeVendor} disabled={busy}>Delete vendor</button>
          </div>
        )}

        {editVendor && (
          <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label className="label">Rep</label><input className="input" value={vForm.rep_name} onChange={(e) => setVForm({ ...vForm, rep_name: e.target.value })} /></div>
              <div><label className="label">Phone</label><input className="input" value={vForm.phone} onChange={(e) => setVForm({ ...vForm, phone: e.target.value })} /></div>
              <div><label className="label">Email</label><input className="input" value={vForm.email} onChange={(e) => setVForm({ ...vForm, email: e.target.value })} /></div>
              <div><label className="label">Status</label>
                <select className="input" value={vForm.status} onChange={(e) => setVForm({ ...vForm, status: e.target.value })}>
                  {["active", "skip", "discontinue", "bankrupt"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="label">Default terms</label><input className="input" value={vForm.default_terms} onChange={(e) => setVForm({ ...vForm, default_terms: e.target.value })} /></div>
              <div><label className="label">Products</label><input className="input" value={vForm.products_we_carry} onChange={(e) => setVForm({ ...vForm, products_we_carry: e.target.value })} /></div>
            </div>
            <div><label className="label">Notes and rules</label><textarea className="input" rows={2} value={vForm.notes} onChange={(e) => setVForm({ ...vForm, notes: e.target.value })} /></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" onClick={saveVendor} disabled={busy}>{busy ? "Saving." : "Save vendor"}</button>
              <button className="btn-ghost" onClick={() => setEditVendor(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Invoices</h2>
          {showMoney && <button className="btn-ghost" onClick={() => setShowInv((s) => !s)}>{showInv ? "Close" : "+ Add invoice"}</button>}
        </div>
        {showMoney && showInv && (
          <div className="card" style={{ padding: 14, marginBottom: 10, display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
              <div><label className="label">Invoice number</label><input className="input" value={invForm.invoice_number} onChange={(e) => setInvForm({ ...invForm, invoice_number: e.target.value })} /></div>
              <div><label className="label">Invoice date</label><input className="input" type="date" value={invForm.invoice_date} onChange={(e) => setInvForm({ ...invForm, invoice_date: e.target.value })} /></div>
              <div><label className="label">Amount (pre-tax)</label><input className="input tabular" type="number" step="0.01" value={invForm.amount} onChange={(e) => setInvForm({ ...invForm, amount: e.target.value, hst_amount: hstFieldFor(e.target.value) })} /></div>
              <div><label className="label">HST</label><input className="input tabular" type="number" step="0.01" value={invForm.hst_amount} onChange={(e) => setInvForm({ ...invForm, hst_amount: e.target.value })} /></div>
              <div><label className="label">Freight</label><input className="input tabular" type="number" step="0.01" value={invForm.freight_charges} onChange={(e) => setInvForm({ ...invForm, freight_charges: e.target.value })} /></div>
              {!isProperty && (
                <div><label className="label">Delivery</label>
                  <select className="input" value={invForm.delivery_status} onChange={(e) => setInvForm({ ...invForm, delivery_status: e.target.value })}>
                    <option value="">Not said</option>
                    {DELIVERY_STATUS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              )}
              <div><label className="label">Terms</label><input className="input" value={invForm.terms} onChange={(e) => setInvForm({ ...invForm, terms: e.target.value })} /></div>
              <div><label className="label">Due date</label><input className="input" type="date" value={invForm.due_date} onChange={(e) => setInvForm({ ...invForm, due_date: e.target.value })} /></div>
              <div><label className="label">Arrived as</label>
                <select className="input" value={invForm.status} onChange={(e) => setInvForm({ ...invForm, status: e.target.value })}>
                  <option value="unpaid">unpaid (has a due date)</option>
                  <option value="paid">already paid</option>
                </select>
              </div>
            </div>
            {isProperty && (
              <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div className="help">Property Maintenance work</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                  <div><label className="label">Estimate #</label><input className="input" placeholder="Blank if not preplanned" value={invForm.estimate_number} onChange={(e) => setInvForm({ ...invForm, estimate_number: e.target.value })} /></div>
                  <div><label className="label">Type of work</label>
                    <select className="input" value={invForm.work_type} onChange={(e) => setInvForm({ ...invForm, work_type: e.target.value })}>
                      <option value="">Pick one</option>
                      {WORK_TYPES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                    </select>
                  </div>
                </div>
                <div><label className="label">Description of the work</label>
                  <textarea className="input" rows={2} maxLength={500} value={invForm.work_description} onChange={(e) => setInvForm({ ...invForm, work_description: e.target.value })} />
                </div>
              </div>
            )}
            {invForm.status === "paid" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div><label className="label">Method</label>
                  <select className="input" value={invForm.pay_method} onChange={(e) => setInvForm({ ...invForm, pay_method: e.target.value })}>
                    {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div><label className="label">Paid date</label><input className="input" type="date" value={invForm.pay_date} onChange={(e) => setInvForm({ ...invForm, pay_date: e.target.value })} /></div>
                <div><label className="label">{referenceLabel(invForm.pay_method)}</label><input className="input" value={invForm.pay_reference} onChange={(e) => setInvForm({ ...invForm, pay_reference: e.target.value })} /></div>
                <div><label className="label">Confirmation filed</label>
                  <select className="input" value={invForm.pay_filing} onChange={(e) => setInvForm({ ...invForm, pay_filing: e.target.value })}>
                    <option value="">Not said</option>
                    {CONFIRMATION_FILING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div><button className="btn-primary" onClick={addInvoice} disabled={busy}>{busy ? "Saving." : invForm.status === "paid" ? "Save invoice and payment" : "Save invoice"}</button></div>
          </div>
        )}
        {invoices.length === 0 && <p className="help">No invoices on file.</p>}
        <div style={{ display: "grid", gap: 8 }}>
          {invoices.map((i) => {
            const d = daysOverdue(i.due_date);
            const overdue = (i.status === "unpaid" || i.status === "partially_paid") && d != null && d > 0;
            const owedNow = remainingOwed(invTotal(i), settlements.get(i.id));
            const partly = i.status === "partially_paid" || (i.status !== "paid" && owedNow > 0 && owedNow < invTotal(i));
            return (
              <div key={i.id} className="card" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{i.invoice_number || "Invoice"}</strong>
                      <span className={`chip ${overdue ? "chip-error" : chipClass(i.status)}`}>{overdue ? `${d} days overdue` : labelize(i.status)}</span>
                      {overdue && i.status === "partially_paid" && <span className={`chip ${chipClass(i.status)}`}>{labelize(i.status)}</span>}
                      {i.delivery_status && <span className={`chip ${chipClass(i.delivery_status)}`}>{labelize(i.delivery_status)}</span>}
                      {i.work_type && <span className="chip chip-neutral">{labelize(i.work_type)}</span>}
                    </div>
                    <div className="help" style={{ marginTop: 4 }}>
                      {i.invoice_date ? `dated ${i.invoice_date} . ` : ""}{i.terms || ""}{i.due_date ? ` . due ${i.due_date}` : ""}
                      {i.estimate_number ? ` . estimate ${i.estimate_number}` : ""}
                      {showMoney && Number(i.freight_charges) > 0 ? ` . freight ${formatCAD(Number(i.freight_charges))}` : ""}
                      {showMoney && partly && i.status !== "paid" ? ` . ${formatCAD(owedNow)} still owed` : ""}
                    </div>
                    {i.work_description && <div className="help" style={{ marginTop: 2 }}>{i.work_description}</div>}
                  </div>
                  {showMoney && (
                    <div style={{ textAlign: "right" }}>
                      <div className="tabular" style={{ fontWeight: 600 }}>{formatCAD(invoiceTotal(i))}</div>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4, flexWrap: "wrap" }}>
                        {i.status !== "paid" && <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startPay(i)}>Record payment</button>}
                        {canEdit(role) && <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startEditInvoice(i)} disabled={busy}>Edit</button>}
                        {canEdit(role) && <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => removeInvoice(i)} disabled={busy}>Delete</button>}
                      </div>
                    </div>
                  )}
                </div>
                {canEdit(role) && editInvId === i.id && (
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                      <div><label className="label">Invoice number</label><input className="input" value={editInvForm.invoice_number} onChange={(e) => setEditInvForm({ ...editInvForm, invoice_number: e.target.value })} /></div>
                      <div><label className="label">Invoice date</label><input className="input" type="date" value={editInvForm.invoice_date} onChange={(e) => setEditInvForm({ ...editInvForm, invoice_date: e.target.value })} /></div>
                      <div><label className="label">Amount (pre-tax)</label><input className="input tabular" type="number" step="0.01" value={editInvForm.amount} onChange={(e) => setEditInvForm({ ...editInvForm, amount: e.target.value, hst_amount: hstFieldFor(e.target.value) })} /></div>
                      <div><label className="label">HST</label><input className="input tabular" type="number" step="0.01" value={editInvForm.hst_amount} onChange={(e) => setEditInvForm({ ...editInvForm, hst_amount: e.target.value })} /></div>
                      <div><label className="label">Freight</label><input className="input tabular" type="number" step="0.01" value={editInvForm.freight_charges} onChange={(e) => setEditInvForm({ ...editInvForm, freight_charges: e.target.value })} /></div>
                      <div><label className="label">Delivery</label>
                        <select className="input" value={editInvForm.delivery_status} onChange={(e) => setEditInvForm({ ...editInvForm, delivery_status: e.target.value })}>
                          <option value="">Not said</option>
                          {DELIVERY_STATUS.map((ds) => <option key={ds.value} value={ds.value}>{ds.label}</option>)}
                        </select>
                      </div>
                      <div><label className="label">Terms</label><input className="input" value={editInvForm.terms} onChange={(e) => setEditInvForm({ ...editInvForm, terms: e.target.value })} /></div>
                      <div><label className="label">Due date</label><input className="input" type="date" value={editInvForm.due_date} onChange={(e) => setEditInvForm({ ...editInvForm, due_date: e.target.value })} /></div>
                      <div><label className="label">Status</label>
                        {/* Normally derived from payments; this is the owner's manual override. */}
                        <select className="input" value={editInvForm.status} onChange={(e) => setEditInvForm({ ...editInvForm, status: e.target.value })}>
                          {["unpaid", "partially_paid", "paid", "postdated"].map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
                        </select>
                      </div>
                    </div>
                    {isProperty && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                        <div><label className="label">Estimate #</label><input className="input" value={editInvForm.estimate_number} onChange={(e) => setEditInvForm({ ...editInvForm, estimate_number: e.target.value })} /></div>
                        <div><label className="label">Type of work</label>
                          <select className="input" value={editInvForm.work_type} onChange={(e) => setEditInvForm({ ...editInvForm, work_type: e.target.value })}>
                            <option value="">Pick one</option>
                            {WORK_TYPES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                          </select>
                        </div>
                        <div style={{ gridColumn: "1 / -1" }}><label className="label">Description of the work</label>
                          <textarea className="input" rows={2} maxLength={500} value={editInvForm.work_description} onChange={(e) => setEditInvForm({ ...editInvForm, work_description: e.target.value })} />
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn-primary" onClick={saveInvoice} disabled={busy}>{busy ? "Saving." : "Save invoice"}</button>
                      <button className="btn-ghost" onClick={() => setEditInvId(null)}>Cancel</button>
                    </div>
                  </div>
                )}
                {showMoney && payFor === i.id && (
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                      <div><label className="label">Amount</label><input className="input tabular" type="number" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
                        <p className="help" style={{ margin: "4px 0 0" }}>A smaller amount records a partial payment.</p>
                      </div>
                      <div><label className="label">Method</label>
                        <select className="input" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                      <div><label className="label">Paid date</label><input className="input" type="date" value={payForm.paid_date} onChange={(e) => setPayForm({ ...payForm, paid_date: e.target.value })} />
                        {isFutureDate(payForm.paid_date) && <p className="help" style={{ margin: "4px 0 0" }}>Future date: records as post-dated.</p>}
                      </div>
                      <div><label className="label">{referenceLabel(payForm.method)}</label><input className="input" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} /></div>
                      <div><label className="label">Confirmation filed</label>
                        <select className="input" value={payForm.filing} onChange={(e) => setPayForm({ ...payForm, filing: e.target.value })}>
                          <option value="">Not said</option>
                          {CONFIRMATION_FILING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      </div>
                      <div><label className="label">Notes{payForm.method === "other" ? " (say what the method was)" : ""}</label><input className="input" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} /></div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn-primary" onClick={recordPayment} disabled={busy}>{busy ? "Saving." : "Save"}</button>
                      <button className="btn-ghost" onClick={() => setPayFor(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Purchase orders</h2>
          {showMoney && <button className="btn-ghost" onClick={() => setShowPO((s) => !s)}>{showPO ? "Close" : "+ Add order"}</button>}
        </div>
        {showMoney && showPO && (
          <div className="card" style={{ padding: 14, marginBottom: 10, display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
              <div><label className="label">Order amount</label><input className="input tabular" type="number" step="0.01" value={poForm.order_amount} onChange={(e) => setPoForm({ ...poForm, order_amount: e.target.value })} /></div>
              <div><label className="label">Season year</label><input className="input tabular" type="number" value={poForm.season_year} onChange={(e) => setPoForm({ ...poForm, season_year: e.target.value })} /></div>
              <div><label className="label">Ship date</label><input className="input" type="date" value={poForm.ship_date} onChange={(e) => setPoForm({ ...poForm, ship_date: e.target.value })} /></div>
              <div><label className="label">Delivery commit</label><input className="input" type="date" value={poForm.delivery_commit} onChange={(e) => setPoForm({ ...poForm, delivery_commit: e.target.value })} /></div>
              <div><label className="label">Status</label>
                <select className="input" value={poForm.status} onChange={(e) => setPoForm({ ...poForm, status: e.target.value })}>
                  {["draft", "ordered", "confirmed", "shipped", "received", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div><label className="label">Notes</label><input className="input" value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} /></div>
            <div><button className="btn-primary" onClick={addPO} disabled={busy}>{busy ? "Saving." : "Save order"}</button></div>
          </div>
        )}
        {orders.length === 0 && <p className="help">No orders on file.</p>}
        <div style={{ display: "grid", gap: 8 }}>
          {orders.map((o) => (
            <div key={o.id} className="card" style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{o.season_year || ""} order</strong>
                    <select className="input" style={{ width: "auto", padding: "2px 6px", fontSize: 12 }} value={o.status} onChange={(e) => updatePOStatus(o.id, e.target.value)} disabled={busy || !canEdit(role)} aria-label="order status">
                      {["draft", "ordered", "confirmed", "shipped", "received", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="help" style={{ marginTop: 4 }}>{o.ship_date ? `ship ${o.ship_date}` : ""}{o.notes ? ` . ${o.notes}` : ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {showMoney && <div className="tabular" style={{ fontWeight: 600 }}>{o.order_amount != null ? formatCAD(o.order_amount) : "n/a"}</div>}
                  {canEdit(role) && (
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4, flexWrap: "wrap" }}>
                      <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startEditPO(o)} disabled={busy}>Edit</button>
                      <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => removePO(o)} disabled={busy}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
              {canEdit(role) && editPoId === o.id && (
                <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                    <div><label className="label">Order amount</label><input className="input tabular" type="number" step="0.01" value={editPoForm.order_amount} onChange={(e) => setEditPoForm({ ...editPoForm, order_amount: e.target.value })} /></div>
                    <div><label className="label">Ship date</label><input className="input" type="date" value={editPoForm.ship_date} onChange={(e) => setEditPoForm({ ...editPoForm, ship_date: e.target.value })} /></div>
                    <div><label className="label">Status</label>
                      <select className="input" value={editPoForm.status} onChange={(e) => setEditPoForm({ ...editPoForm, status: e.target.value })}>
                        {["draft", "ordered", "confirmed", "shipped", "received", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div><label className="label">Notes</label><input className="input" value={editPoForm.notes} onChange={(e) => setEditPoForm({ ...editPoForm, notes: e.target.value })} /></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-primary" onClick={savePO} disabled={busy}>{busy ? "Saving." : "Save order"}</button>
                    <button className="btn-ghost" onClick={() => setEditPoId(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {showMoney && (
        <section>
          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Payments</h2>
          {payments.length === 0 && <p className="help">No payments recorded.</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {payments.map((p) => {
              const covered = (p.payment_allocation || []).map((a) => a.invoice?.invoice_number).filter(Boolean).join(", ");
              return (
                <div key={p.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{methodLabel(p.method)}</strong>
                      {isFutureDate(p.paid_date) && <span className="chip chip-progress">post-dated, clears {p.paid_date}</span>}
                    </div>
                    <div className="help" style={{ marginTop: 4 }}>
                      {p.paid_date && !isFutureDate(p.paid_date) ? `paid ${p.paid_date}` : ""}
                      {p.reference ? ` . ${p.reference}` : ""}
                      {covered ? ` . ${covered}` : " . deposit / prepayment"}
                      {p.confirmation_filing ? ` . filed ${p.confirmation_filing}` : ""}
                      {p.notes ? ` . ${p.notes}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="tabular" style={{ fontWeight: 600 }}>{formatCAD(p.amount)}</div>
                    {canEdit(role) && <button className="btn-ghost" style={{ padding: "4px 10px", marginTop: 4 }} onClick={() => removePayment(p)} disabled={busy}>Delete</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {showMoney && (
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Credits</h2>
            {canEdit(role) && <button className="btn-ghost" onClick={() => setShowCredit((s) => !s)}>{showCredit ? "Close" : "+ Record credit"}</button>}
          </div>
          {showCredit && (
            <div className="card" style={{ padding: 14, marginBottom: 10, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                <div>
                  <label className="label">Invoice number</label>
                  <input className="input" placeholder="The invoice this credit applies to" value={creditForm.invoice_number} onChange={(e) => setCreditForm({ ...creditForm, invoice_number: e.target.value })} />
                </div>
                <div>
                  <label className="label">Link to invoice</label>
                  <select className="input" value={creditForm.invoice_id} onChange={(e) => setCreditForm({ ...creditForm, invoice_id: e.target.value })}>
                    <option value="">None (standalone credit)</option>
                    {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_number || "Invoice"} ({formatCAD(invTotal(i))})</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Credit amount</label>
                  <input className="input tabular" type="number" step="0.01" value={creditForm.credit_amount} onChange={(e) => setCreditForm({ ...creditForm, credit_amount: e.target.value })} />
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={creditForm.status} onChange={(e) => setCreditForm({ ...creditForm, status: e.target.value })}>
                    <option value="pending">Pending</option>
                    <option value="applied">Applied</option>
                    <option value="disputed">Disputed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Reason for credit</label>
                <input className="input" placeholder="Damaged goods, short shipment, overcharge, return" value={creditForm.reason} onChange={(e) => setCreditForm({ ...creditForm, reason: e.target.value })} />
              </div>
              <div>
                <label className="label">Comments</label>
                <textarea className="input" rows={2} value={creditForm.comments} onChange={(e) => setCreditForm({ ...creditForm, comments: e.target.value })} />
              </div>
              {creditForm.invoice_id && (
                <div className="help">
                  Adjusted invoice amount after credit: {formatCAD(
                    invTotal(invoices.find((i) => i.id === creditForm.invoice_id)!) - (Number(creditForm.credit_amount) || 0)
                  )}
                </div>
              )}
              <div>
                <button className="btn-primary" onClick={addCredit} disabled={busy}>{busy ? "Saving." : "Save credit"}</button>
              </div>
            </div>
          )}
          {credits.length === 0 && !showCredit && <p className="help">No credits recorded.</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {credits.map((c) => (
              <div key={c.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{c.invoice_number || c.invoice?.invoice_number || "Credit"}</strong>
                    <span className={`chip ${c.status === "applied" ? "chip-success" : c.status === "disputed" ? "chip-warning" : "chip-neutral"}`}>{c.status}</span>
                  </div>
                  <div className="help" style={{ marginTop: 4 }}>
                    {c.reason}{c.comments ? ` . ${c.comments}` : ""}
                    {c.invoice ? ` . invoice total ${formatCAD((Number(c.invoice.amount) || 0) + (Number(c.invoice.hst_amount) || 0))}, adjusted ${formatCAD((Number(c.invoice.amount) || 0) + (Number(c.invoice.hst_amount) || 0) - c.credit_amount)}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="tabular" style={{ fontWeight: 600, color: "var(--success-base, #1E8E5A)" }}>{formatCAD(c.credit_amount)}</div>
                  {canEdit(role) && <button className="btn-ghost" style={{ padding: "4px 10px", marginTop: 4 }} onClick={() => removeCredit(c)} disabled={busy}>Delete</button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
