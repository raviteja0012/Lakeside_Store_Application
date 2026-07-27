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
  PAYMENT_METHODS, CONFIRMATION_FILING, DELIVERY_STATUS, WORK_TYPES, SERVICE_CATEGORIES, CREDIT_TYPES,
  isPropertyDept, isFinanceDept, isHardwareDept,
  methodLabel, referenceLabel, referenceHelp, invoiceTotal as invTotal, isFutureDate,
  recordPaymentRpc, voidPaymentRpc, editPaymentRpc, fetchSettlements,
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
    // tax_mode: exact = the HST figure typed here; none = a no-tax vendor (stores 0);
    // invoice = "refer to the actual invoice for tax" (stores blank).
    tax_mode: "exact", po_number: "",
    delivery_status: "", terms: "", due_date: "", status: "unpaid",
    estimate_number: "", work_type: "", service_category: "", service_category_other: "", work_description: "",
    pay_method: "cheque", pay_date: todayISO(), pay_reference: "", pay_filing: ""
  };
  const [invForm, setInvForm] = useState({ ...emptyInvForm });
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "cheque", paid_date: todayISO(), reference: "", notes: "", filing: "" });
  const [settlements, setSettlements] = useState<Map<string, InvoiceSettlement>>(new Map());
  // Editing a recorded payment (Ravi typed a wrong date once and was stuck): date, method,
  // reference, notes, and filing are correctable; the amount means void and re-record.
  const [editPayId, setEditPayId] = useState<string | null>(null);
  const [editPayForm, setEditPayForm] = useState({ method: "cheque", paid_date: "", reference: "", notes: "", filing: "" });

  const [editInvId, setEditInvId] = useState<string | null>(null);
  const [editInvForm, setEditInvForm] = useState({
    invoice_number: "", invoice_date: "", amount: "", hst_amount: "", freight_charges: "",
    tax_mode: "exact", po_number: "",
    delivery_status: "", terms: "", due_date: "", status: "unpaid",
    estimate_number: "", work_type: "", service_category: "", service_category_other: "", work_description: ""
  });
  const [editPoId, setEditPoId] = useState<string | null>(null);
  const [editPoForm, setEditPoForm] = useState({ order_amount: "", ship_date: "", status: "ordered", notes: "" });

  // Credits
  const [credits, setCredits] = useState<CreditNote[]>([]);
  const [showCredit, setShowCredit] = useState(false);
  const [creditForm, setCreditForm] = useState({ invoice_number: "", credit_amount: "", reason: "", comments: "", invoice_id: "", status: "pending", credit_type: "" });

  // Effective role and actor: in enforced auth the signed-in member, else the dropdown.
  const { effectiveActorId, role } = useEffectiveActor(users, actorId);
  const showMoney = canSeeMoney(role);
  // Property Maintenance vendors get the estimate / work fields on their invoices.
  const isProperty = isPropertyDept(vendor?.department?.name);
  // Payrolls & Taxes vendors (CRA remittances and the like) have no delivery or freight.
  const isFinance = isFinanceDept(vendor?.department?.name);
  // Hardware invoices carry the purchase order number.
  const isHardware = isHardwareDept(vendor?.department?.name);

  // What the tax_mode select stores: exact keeps the typed figure, none is a no-tax vendor
  // (0), and "refer to the actual invoice" stores blank so reports show it as unstated.
  const hstFromMode = (mode: string, hst: string): number | null =>
    mode === "none" ? 0 : mode === "invoice" ? null : num(hst) ?? 0;

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
    const { data: inv } = await supabase.from("invoice").select("id, vendor_id, invoice_number, invoice_date, amount, hst_amount, freight_charges, po_number, delivery_status, estimate_number, work_type, service_category, work_description, terms, due_date, status").eq("vendor_id", id).is("voided_at", null).order("due_date", { ascending: true });
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
      .select("id, store_id, vendor_id, invoice_id, invoice_number, credit_amount, reason, comments, credit_type, status, created_by, created_at, voided_at, invoice:invoice_id(invoice_number, amount, hst_amount)")
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
    // The owner's rule: a NEW order's expected ship date cannot be in the past. Editing an
    // old order keeps its historical date, so the check lives only on the add path.
    if (poForm.ship_date && poForm.ship_date < todayISO()) {
      setError("The expected ship date cannot be before today.");
      return;
    }
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
    // The "arrived already paid" flow records a payment for the full total right after the
    // insert, and the RPC refuses a zero allocation. Validate BEFORE anything is written so
    // a bad form never leaves an orphan invoice behind.
    if (invForm.status === "paid") {
      const payTotal = (num(invForm.amount) || 0) + (num(invForm.freight_charges) || 0) + (hstFromMode(invForm.tax_mode, invForm.hst_amount) || 0);
      if (payTotal <= 0) {
        setError("Enter the invoice amount before saving it as already paid.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      // Insert as unpaid; if the invoice arrived already paid, the payment recorded next
      // flips it. That way a paid invoice always has its payment row behind it.
      const svcCat = invForm.service_category === "Others" ? invForm.service_category_other.trim() : invForm.service_category;
      const r = await supabase.from("invoice").insert({
        store_id: vendor.store_id ?? null,
        vendor_id: vendor.id,
        invoice_number: invForm.invoice_number || null,
        invoice_date: invForm.invoice_date || null,
        amount: num(invForm.amount),
        hst_amount: hstFromMode(invForm.tax_mode, invForm.hst_amount),
        freight_charges: num(invForm.freight_charges),
        po_number: isHardware ? invForm.po_number.trim() || null : null,
        delivery_status: invForm.delivery_status || null,
        estimate_number: isProperty ? invForm.estimate_number || null : null,
        work_type: isProperty ? invForm.work_type || null : null,
        service_category: isProperty ? svcCat || null : null,
        work_description: isProperty ? invForm.work_description || null : null,
        terms: invForm.terms || null,
        due_date: invForm.due_date || null,
        status: "unpaid"
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      await log("invoice_added", "invoice", r.data.id as string);
      if (invForm.status === "paid") {
        const total = (num(invForm.amount) || 0) + (num(invForm.freight_charges) || 0) + (hstFromMode(invForm.tax_mode, invForm.hst_amount) || 0);
        try {
          await recordPaymentRpc({
            vendorId: vendor.id,
            method: invForm.pay_method,
            paidDate: invForm.pay_date || todayISO(),
            reference: invForm.pay_reference,
            confirmationFiling: invForm.pay_filing,
            actorId: effectiveActorId,
            allocations: [{ invoice_id: r.data.id as string, amount: round2(total) }]
          });
        } catch (payErr: any) {
          // The payment did not record: take the just-inserted invoice back out so a retry
          // starts clean instead of duplicating it, then surface the real error.
          await supabase.from("invoice").delete().eq("id", r.data.id as string);
          throw new Error(`The invoice was not saved because its payment failed: ${payErr.message}`);
        }
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
    const knownCat = i.service_category && SERVICE_CATEGORIES.includes(i.service_category);
    setEditInvForm({
      invoice_number: i.invoice_number || "",
      invoice_date: i.invoice_date || "",
      amount: i.amount != null ? String(i.amount) : "",
      hst_amount: i.hst_amount != null && Number(i.hst_amount) !== 0 ? String(i.hst_amount) : "",
      // Stored 0 means a no-tax vendor; stored blank means "refer to the actual invoice".
      tax_mode: i.hst_amount == null ? "invoice" : Number(i.hst_amount) === 0 ? "none" : "exact",
      freight_charges: i.freight_charges != null ? String(i.freight_charges) : "",
      po_number: i.po_number || "",
      delivery_status: i.delivery_status || "",
      estimate_number: i.estimate_number || "",
      work_type: i.work_type || "",
      service_category: i.service_category ? (knownCat ? i.service_category : "Others") : "",
      service_category_other: i.service_category && !knownCat ? i.service_category : "",
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
      const svcCat = editInvForm.service_category === "Others" ? editInvForm.service_category_other.trim() : editInvForm.service_category;
      const r = await supabase.from("invoice").update({
        invoice_number: editInvForm.invoice_number || null,
        invoice_date: editInvForm.invoice_date || null,
        amount: num(editInvForm.amount),
        hst_amount: hstFromMode(editInvForm.tax_mode, editInvForm.hst_amount),
        freight_charges: num(editInvForm.freight_charges),
        po_number: isHardware ? editInvForm.po_number.trim() || null : null,
        delivery_status: editInvForm.delivery_status || null,
        estimate_number: editInvForm.estimate_number || null,
        work_type: editInvForm.work_type || null,
        service_category: isProperty ? svcCat || null : null,
        work_description: editInvForm.work_description || null,
        terms: editInvForm.terms || null,
        due_date: editInvForm.due_date || null,
        status: editInvForm.status
      }).eq("id", editInvId);
      if (r.error) throw new Error(r.error.message);
      await log("invoice_edited", "invoice", editInvId);
      const savedId = editInvId;
      const markedPaid = editInvForm.status === "paid";
      setEditInvId(null);
      await load();
      // Ravi's video: he marked an invoice paid through Edit and the payment never showed,
      // so he had to flip it back and use Record payment himself. Close that loop here:
      // a manual "paid" with no payment behind it opens the payment form right away, so
      // the money record always follows the status.
      if (markedPaid) {
        const fresh = await fetchSettlements([savedId]);
        const inv = { amount: num(editInvForm.amount), hst_amount: hstFromMode(editInvForm.tax_mode, editInvForm.hst_amount), freight_charges: num(editInvForm.freight_charges) } as Invoice;
        const left = round2(remainingToAllocate(invTotal(inv), fresh.get(savedId)));
        if (left > 0) {
          setPayFor(savedId);
          setPayForm({ amount: String(left), method: "cheque", paid_date: todayISO(), reference: "", notes: "", filing: "" });
          setError("Marked paid, but no payment is recorded yet. Say how it was paid below so the payment shows in the list.");
        }
      }
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

  function startEditPayment(p: Payment) {
    setEditPayId(p.id);
    setEditPayForm({
      method: p.method || "cheque",
      paid_date: p.paid_date || todayISO(),
      reference: p.reference || "",
      notes: p.notes || "",
      filing: p.confirmation_filing || ""
    });
  }

  async function saveEditPayment() {
    if (!editPayId) return;
    if (!editPayForm.paid_date) {
      setError("Enter the paid date.");
      return;
    }
    if (editPayForm.method === "other" && !editPayForm.notes.trim()) {
      setError("Method is Other: say what it was in the notes.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // One transaction: the corrected facts plus a re-derive of every invoice this
      // payment touches, so moving the date across today flips post-dated correctly.
      await editPaymentRpc({
        paymentId: editPayId,
        method: editPayForm.method,
        paidDate: editPayForm.paid_date,
        reference: editPayForm.reference,
        notes: editPayForm.notes,
        confirmationFiling: editPayForm.filing,
        actorId: effectiveActorId
      });
      setEditPayId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePayment(p: Payment) {
    if (!window.confirm("Void this payment? It will be hidden but kept for the tax history, and its invoices go back to owing.")) return;
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
        credit_type: creditForm.credit_type || null,
        status: creditForm.status,
        created_by: effectiveActorId
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      await log("credit_added", "credit_note", r.data.id as string);
      setShowCredit(false);
      setCreditForm({ invoice_number: "", credit_amount: "", reason: "", comments: "", invoice_id: "", status: "pending", credit_type: "" });
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

  // The two situations that make a bare $0.00 read like a bug (Ravi asked): money paid on
  // account with no invoice to land on, and orders whose invoices have not been entered
  // yet. Say both out loud next to the Outstanding figure.
  const depositOnAccount = payments
    .filter((p) => (p.payment_allocation || []).length === 0 && !isFutureDate(p.paid_date))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const invoicedTotal = invoices.reduce((s, i) => s + invTotal(i), 0);
  const orderedAwaitingInvoice = Math.max(0,
    orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + (Number(o.order_amount) || 0), 0) - invoicedTotal
  );

  // The statement: what a vendor mails once an account runs past due, rebuilt from our own
  // ledger. Charges and payments in date order with a running balance, so their "remaining
  // amount" letter can be checked line by line against ours. Post-dated cheques appear as
  // scheduled lines but do not reduce the balance until their date arrives.
  const statement = (() => {
    type Row = { date: string; label: string; detail: string; charge: number; credit: number; scheduled: boolean };
    const rows: Row[] = [];
    for (const i of invoices) {
      rows.push({
        date: i.invoice_date || i.due_date || "",
        label: `Invoice ${i.invoice_number || ""}`.trim(),
        detail: [i.terms, i.due_date ? `due ${i.due_date}` : ""].filter(Boolean).join(" . "),
        charge: invTotal(i), credit: 0, scheduled: false
      });
    }
    for (const p of payments) {
      const scheduled = isFutureDate(p.paid_date);
      rows.push({
        date: p.paid_date || "",
        label: scheduled ? `Post-dated ${methodLabel(p.method)}` : `Payment, ${methodLabel(p.method)}`,
        detail: [p.reference, (p.payment_allocation || []).map((a) => a.invoice?.invoice_number).filter(Boolean).join(", ")].filter(Boolean).join(" . "),
        charge: 0, credit: Number(p.amount) || 0, scheduled
      });
    }
    rows.sort((a, b) => (a.date || "9999-99-99") < (b.date || "9999-99-99") ? -1 : 1);
    let bal = 0;
    const withBal = rows.map((r) => {
      if (!r.scheduled) bal = round2(bal + r.charge - r.credit);
      return { ...r, balance: bal };
    });
    return { rows: withBal, ending: bal };
  })();
  const [showStatement, setShowStatement] = useState(false);

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
                {canEdit(role) && outstanding > 0 && invoices.filter((i) => i.status !== "paid").length > 1 && (
                  <Link href={`/payments?vendor=${vendor.id}`} className="btn-ghost" style={{ padding: "4px 10px", marginTop: 6, display: "inline-block", textDecoration: "none" }}>
                    Pay across invoices
                  </Link>
                )}
                {depositOnAccount > 0 && (
                  <div className="help" style={{ marginTop: 4 }}>
                    {formatCAD(depositOnAccount)} paid on account, waiting for an invoice
                  </div>
                )}
                {orderedAwaitingInvoice > 0 && (
                  <div className="help" style={{ marginTop: 2 }}>
                    {formatCAD(orderedAwaitingInvoice)} ordered, invoice not entered yet
                  </div>
                )}
                {/* The glance facts Ravi asked for: the latest order and the latest cleared
                    payment, right where the eye lands when the page opens. */}
                {(orders[0] || payments.find((p) => !isFutureDate(p.paid_date))) && (
                  <div className="help" style={{ marginTop: 6 }}>
                    {orders[0] && <span>Last order {orders[0].order_amount != null ? formatCAD(orders[0].order_amount) : ""}{orders[0].ship_date ? ` (ship ${orders[0].ship_date})` : ""}</span>}
                    {orders[0] && payments.find((p) => !isFutureDate(p.paid_date)) && <span> . </span>}
                    {(() => { const lp = payments.find((p) => !isFutureDate(p.paid_date)); return lp ? <span>last paid {lp.paid_date}</span> : null; })()}
                  </div>
                )}
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
              <div><label className="label">Amount (pre-tax)</label><input className="input tabular" type="number" step="0.01" value={invForm.amount} onChange={(e) => setInvForm({ ...invForm, amount: e.target.value, hst_amount: invForm.tax_mode === "exact" ? hstFieldFor(e.target.value) : invForm.hst_amount })} /></div>
              <div><label className="label">Tax</label>
                <select className="input" value={invForm.tax_mode} onChange={(e) => setInvForm({ ...invForm, tax_mode: e.target.value, hst_amount: e.target.value === "exact" ? hstFieldFor(invForm.amount) : "" })}>
                  <option value="exact">HST amount</option>
                  <option value="none">No-tax vendor</option>
                  <option value="invoice">See the invoice</option>
                </select>
              </div>
              {invForm.tax_mode === "exact" && <div><label className="label">HST</label><input className="input tabular" type="number" step="0.01" value={invForm.hst_amount} onChange={(e) => setInvForm({ ...invForm, hst_amount: e.target.value })} /></div>}
              {isHardware && <div><label className="label">PO number</label><input className="input" value={invForm.po_number} onChange={(e) => setInvForm({ ...invForm, po_number: e.target.value })} /></div>}
              {!isFinance && <div><label className="label">Freight</label><input className="input tabular" type="number" step="0.01" value={invForm.freight_charges} onChange={(e) => setInvForm({ ...invForm, freight_charges: e.target.value })} /></div>}
              {!isProperty && !isFinance && (
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
                  <div><label className="label">Service category</label>
                    <select className="input" value={invForm.service_category} onChange={(e) => setInvForm({ ...invForm, service_category: e.target.value })}>
                      <option value="">Pick one</option>
                      {SERVICE_CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  {invForm.service_category === "Others" && (
                    <div><label className="label">Which service?</label><input className="input" value={invForm.service_category_other} onChange={(e) => setInvForm({ ...invForm, service_category_other: e.target.value })} /></div>
                  )}
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
                <div><label className="label">{referenceLabel(invForm.pay_method)}</label><input className="input" value={invForm.pay_reference} onChange={(e) => setInvForm({ ...invForm, pay_reference: e.target.value })} />
                  <p className="help" style={{ margin: "4px 0 0" }}>{referenceHelp(invForm.pay_method)}</p>
                </div>
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
                      {i.po_number ? ` . PO ${i.po_number}` : ""}
                      {i.estimate_number ? ` . estimate ${i.estimate_number}` : ""}
                      {i.service_category ? ` . ${i.service_category}` : ""}
                      {i.hst_amount == null ? " . tax: see the invoice" : ""}
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
                      <div><label className="label">Amount (pre-tax)</label><input className="input tabular" type="number" step="0.01" value={editInvForm.amount} onChange={(e) => setEditInvForm({ ...editInvForm, amount: e.target.value, hst_amount: editInvForm.tax_mode === "exact" ? hstFieldFor(e.target.value) : editInvForm.hst_amount })} /></div>
                      <div><label className="label">Tax</label>
                        <select className="input" value={editInvForm.tax_mode} onChange={(e) => setEditInvForm({ ...editInvForm, tax_mode: e.target.value, hst_amount: e.target.value === "exact" ? hstFieldFor(editInvForm.amount) : "" })}>
                          <option value="exact">HST amount</option>
                          <option value="none">No-tax vendor</option>
                          <option value="invoice">See the invoice</option>
                        </select>
                      </div>
                      {editInvForm.tax_mode === "exact" && <div><label className="label">HST</label><input className="input tabular" type="number" step="0.01" value={editInvForm.hst_amount} onChange={(e) => setEditInvForm({ ...editInvForm, hst_amount: e.target.value })} /></div>}
                      {isHardware && <div><label className="label">PO number</label><input className="input" value={editInvForm.po_number} onChange={(e) => setEditInvForm({ ...editInvForm, po_number: e.target.value })} /></div>}
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
                        <div><label className="label">Service category</label>
                          <select className="input" value={editInvForm.service_category} onChange={(e) => setEditInvForm({ ...editInvForm, service_category: e.target.value })}>
                            <option value="">Pick one</option>
                            {SERVICE_CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        {editInvForm.service_category === "Others" && (
                          <div><label className="label">Which service?</label><input className="input" value={editInvForm.service_category_other} onChange={(e) => setEditInvForm({ ...editInvForm, service_category_other: e.target.value })} /></div>
                        )}
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
                      <div><label className="label">{referenceLabel(payForm.method)}</label><input className="input" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
                        <p className="help" style={{ margin: "4px 0 0" }}>{referenceHelp(payForm.method)}</p>
                      </div>
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
              <div><label className="label">Expected ship date</label><input className="input" type="date" min={todayISO()} value={poForm.ship_date} onChange={(e) => setPoForm({ ...poForm, ship_date: e.target.value })} /></div>
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
                    <div><label className="label">Expected ship date</label><input className="input" type="date" value={editPoForm.ship_date} onChange={(e) => setEditPoForm({ ...editPoForm, ship_date: e.target.value })} /></div>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Statement</h2>
            <div style={{ display: "flex", gap: 8 }}>
              {showStatement && <button className="btn-ghost" onClick={() => window.print()}>Print</button>}
              <button className="btn-ghost" onClick={() => setShowStatement((s) => !s)}>{showStatement ? "Close" : "Open statement"}</button>
            </div>
          </div>
          {showStatement && (
            <div className="card" style={{ padding: 16, display: "grid", gap: 6 }}>
              <p className="help" style={{ margin: "0 0 6px" }}>
                Every charge and payment in date order, the way the vendor&rsquo;s own statement reads. Check their
                &ldquo;remaining amount&rdquo; against the ending balance here, line by line.
              </p>
              <div className="help" style={{ display: "grid", gridTemplateColumns: "90px 1fr 90px 90px 100px", gap: 8, fontWeight: 600 }}>
                <span>Date</span><span>Item</span><span style={{ textAlign: "right" }}>Charge</span><span style={{ textAlign: "right" }}>Payment</span><span style={{ textAlign: "right" }}>Balance</span>
              </div>
              {statement.rows.length === 0 && <p className="help" style={{ margin: 0 }}>Nothing on file yet.</p>}
              {statement.rows.map((r, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "90px 1fr 90px 90px 100px", gap: 8, fontSize: 13, alignItems: "baseline", opacity: r.scheduled ? 0.75 : 1 }}>
                  <span className="tabular">{r.date || ""}</span>
                  <span style={{ minWidth: 0 }}>
                    {r.label}
                    {r.scheduled && <span className="chip chip-progress" style={{ marginLeft: 6 }}>not cleared yet</span>}
                    {r.detail && <span className="help" style={{ display: "block" }}>{r.detail}</span>}
                  </span>
                  <span className="tabular" style={{ textAlign: "right" }}>{r.charge ? formatCAD(r.charge) : ""}</span>
                  <span className="tabular" style={{ textAlign: "right" }}>{r.credit ? formatCAD(r.credit) : ""}</span>
                  <span className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{r.scheduled ? "" : formatCAD(r.balance)}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600 }}>Remaining to pay off</span>
                <span className="tabular" style={{ fontWeight: 700, fontSize: 16 }}>{formatCAD(statement.ending)}</span>
              </div>
              {Math.abs(statement.ending - outstanding) >= 0.01 && (
                <p className="help" style={{ margin: 0 }}>
                  The Outstanding figure above shows {formatCAD(outstanding)} because a deposit or prepayment has not been
                  applied to a specific invoice yet; the statement subtracts every cleared payment.
                </p>
              )}
              {credits.length > 0 && (
                <p className="help" style={{ margin: 0 }}>
                  Credits on file ({credits.map((c) => formatCAD(c.credit_amount)).join(", ")}) are tracked in the Credits
                  section and are not subtracted here until the vendor applies them on their side.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {showMoney && (
        <section>
          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Payments</h2>
          {payments.length === 0 && <p className="help">No payments recorded.</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {payments.map((p) => {
              const covered = (p.payment_allocation || []).map((a) => a.invoice?.invoice_number).filter(Boolean).join(", ");
              return (
                <div key={p.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
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
                      {canEdit(role) && (
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4, flexWrap: "wrap" }}>
                          <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startEditPayment(p)} disabled={busy}>Edit</button>
                          <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => removePayment(p)} disabled={busy}>Void</button>
                        </div>
                      )}
                    </div>
                  </div>
                  {canEdit(role) && editPayId === p.id && (
                    <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, display: "grid", gap: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                        <div><label className="label">Method</label>
                          <select className="input" value={editPayForm.method} onChange={(e) => setEditPayForm({ ...editPayForm, method: e.target.value })}>
                            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </select>
                        </div>
                        <div><label className="label">Paid date</label><input className="input" type="date" value={editPayForm.paid_date} onChange={(e) => setEditPayForm({ ...editPayForm, paid_date: e.target.value })} />
                          {isFutureDate(editPayForm.paid_date) && <p className="help" style={{ margin: "4px 0 0" }}>Future date: becomes post-dated.</p>}
                        </div>
                        <div><label className="label">{referenceLabel(editPayForm.method)}</label><input className="input" value={editPayForm.reference} onChange={(e) => setEditPayForm({ ...editPayForm, reference: e.target.value })} />
                          <p className="help" style={{ margin: "4px 0 0" }}>{referenceHelp(editPayForm.method)}</p>
                        </div>
                        <div><label className="label">Confirmation filed</label>
                          <select className="input" value={editPayForm.filing} onChange={(e) => setEditPayForm({ ...editPayForm, filing: e.target.value })}>
                            <option value="">Not said</option>
                            {CONFIRMATION_FILING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </select>
                        </div>
                        <div><label className="label">Notes{editPayForm.method === "other" ? " (say what the method was)" : ""}</label><input className="input" value={editPayForm.notes} onChange={(e) => setEditPayForm({ ...editPayForm, notes: e.target.value })} /></div>
                      </div>
                      <p className="help" style={{ margin: 0 }}>The amount stays {formatCAD(p.amount)}. Wrong amount? Void this payment and record it again.</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn-primary" onClick={saveEditPayment} disabled={busy}>{busy ? "Saving." : "Save payment"}</button>
                        <button className="btn-ghost" onClick={() => setEditPayId(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
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
                  <label className="label">How it comes back</label>
                  <select className="input" value={creditForm.credit_type} onChange={(e) => setCreditForm({ ...creditForm, credit_type: e.target.value })}>
                    <option value="">Not said</option>
                    {CREDIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
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
                    {c.credit_type ? ` . ${CREDIT_TYPES.find((t) => t.value === c.credit_type)?.label || c.credit_type}` : ""}
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
