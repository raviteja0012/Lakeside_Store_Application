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
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { formatCAD, dueBand, round2, todayISO } from "@/lib/format";
import { sortDepartments } from "@/lib/departments";
import { useActiveStore } from "@/lib/store";
import { REQUIRE_AUTH, canSeeMoney, currentActorId, useCurrentRole, useMember } from "@/lib/auth";
import { canEdit, voidRow } from "@/lib/edit";
import { chipClass, labelize } from "@/lib/status";
import * as XLSX from "xlsx";
import {
  PAYMENT_METHODS, CONFIRMATION_FILING, methodLabel, referenceLabel, invoiceTotal, isFutureDate,
  referenceHelp,
  recordPaymentRpc, voidPaymentRpc, editPaymentRpc, reconcilePostdated, fetchSettlements,
  remainingOwed, remainingToAllocate, type InvoiceSettlement
} from "@/lib/payments";
import type { Invoice, Payment } from "@/lib/types";

type DeptLite = { id: string; name: string; accent_color: string | null; parent_department_id: string | null };
type VendorLite = {
  id: string;
  name: string;
  department_id: string | null;
  status: string;
  products_we_carry: string | null;
  department: { name: string; accent_color: string | null } | null;
};

// "Mugs, wallets, everyday gifts" reads as quiet chips wherever vendors are picked or
// shown. Free text stays the storage (it drifts over time and the search box already
// matches it); the chips are only how it reads.
function productChips(products: string | null | undefined, max = 4) {
  const items = (products || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!items.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {items.slice(0, max).map((p) => (
        <span key={p} className="chip chip-neutral" style={{ fontSize: 11 }}>{p}</span>
      ))}
      {items.length > max && <span className="help">+{items.length - max}</span>}
    </span>
  );
}

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
  // products and notes are optional color: what the vendor supplies ("Mugs, wallets") and
  // any rule worth remembering. Both editable later from the vendor page as things drift.
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [nvForm, setNvForm] = useState({ name: "", department_id: "", rep_name: "", phone: "", email: "", default_terms: "", products: "", notes: "" });

  // Editing a recorded payment: the facts (date, method, reference, notes, filing) are
  // correctable in place; a wrong amount means void and re-record.
  const [editPayId, setEditPayId] = useState<string | null>(null);
  const [editPayForm, setEditPayForm] = useState({ method: "cheque", paid_date: "", reference: "", notes: "", filing: "" });

  // Demo mode identity, fixable on this screen (the guard error otherwise sends people
  // away and the filled form is lost).
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; role: string }>>([]);
  const [actorPick, setActorPick] = useState("");
  function pickActor(uid: string) {
    setActorPick(uid);
    if (typeof window !== "undefined") localStorage.setItem("rgs_actor", uid);
  }

  // Installments against the whole balance (Ravi's maintenance-vendor case: many invoices
  // over time, one consolidated bill, paid off in chunks aimed at the total, not at any
  // one invoice). Type the chunk, spread it oldest-first, eyeball, record.
  const [spreadAmount, setSpreadAmount] = useState("");

  const PAY_SELECT =
    "id, vendor_id, invoice_id, amount, method, paid_date, reference, notes, confirmation_filing, created_at, " +
    "vendor:vendor_id(name), payment_allocation(invoice_id, amount, invoice:invoice_id(invoice_number))";

  async function load() {
    // Post-dated cheques whose date has arrived flip to paid on their own here. Only an
    // editor's visit triggers it: a status write should never come from a viewer's page load.
    if (mayEdit) await reconcilePostdated();

    let dq = supabase.from("department").select("id, name, accent_color, parent_department_id").order("name");
    if (storeId) dq = dq.eq("store_id", storeId);
    const { data: deps } = await dq;
    setDepartments(sortDepartments((deps as DeptLite[]) || []));

    if (!REQUIRE_AUTH) {
      const { data: us } = await supabase.from("app_user").select("id, full_name, role").order("full_name");
      setUsers((us as any[]) || []);
      const saved = typeof window !== "undefined" ? localStorage.getItem("rgs_actor") : null;
      setActorPick(saved || "");
    }

    let vq = supabase
      .from("vendor")
      .select("id, name, department_id, status, products_we_carry, department:department_id(name, accent_color)")
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
      .select("id, vendor_id, invoice_number, amount, hst_amount, freight_charges, tax_mode, terms, due_date, status")
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

    // payment has no store_id; scope through the vendor so a second store's payments never
    // show, export, or void from this screen.
    let sq = supabase
      .from("payment")
      .select(PAY_SELECT.replace("vendor:vendor_id(name)", "vendor:vendor_id!inner(name, store_id)"))
      .is("voided_at", null)
      .gt("paid_date", todayISO())
      .order("paid_date", { ascending: true });
    if (storeId) sq = sq.eq("vendor.store_id", storeId);
    const { data: sched } = await sq;
    setScheduled(((sched as unknown) as Payment[]) || []);

    let rq = supabase
      .from("payment")
      .select(PAY_SELECT.replace("vendor:vendor_id(name)", "vendor:vendor_id!inner(name, store_id)"))
      .is("voided_at", null)
      .order("created_at", { ascending: false })
      .limit(15);
    if (storeId) rq = rq.eq("vendor.store_id", storeId);
    const { data: rec } = await rq;
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

  // Arriving from a vendor page ("Pay across invoices"): open the form with that vendor
  // picked. Read from window so the page needs no Suspense boundary for search params.
  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    const vid = new URLSearchParams(window.location.search).get("vendor");
    if (vid && !vendorId && vendors.some((v) => v.id === vid)) {
      pickVendor(vid);
      setShowForm(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, vendors]);

  const selVendor = useMemo(() => vendors.find((v) => v.id === vendorId) || null, [vendors, vendorId]);
  const vendorInvoices = useMemo(
    () => openInvoices.filter((i) => i.vendor_id === vendorId),
    [openInvoices, vendorId]
  );
  // The category chips are the top-level list from the owner's sheet; sections like
  // Clothing, Gifts, and Garden Center live under their parent, so filtering by a
  // category also matches vendors filed under its sections.
  // If the database is missing any of the Excel categories, show all top-level
  // departments as-is (they become top-level when their parent does not exist).
  const topCategories = useMemo(
    () => departments.filter((d) => !d.parent_department_id),
    [departments]
  );
  // For the new-vendor dropdown, show ALL departments (including children) so the user
  // can pick any level. Top-level first, then children indented.
  const allDepartments = useMemo(() => {
    const tops = departments.filter((d) => !d.parent_department_id);
    const result: DeptLite[] = [];
    for (const t of tops) {
      result.push(t);
      const children = departments.filter((d) => d.parent_department_id === t.id);
      for (const c of children) result.push(c);
    }
    // Add any orphans (department whose parent is not in the list)
    for (const d of departments) {
      if (!result.find((r) => r.id === d.id)) result.push(d);
    }
    return result;
  }, [departments]);
  const inCategory = useMemo(() => {
    return (departmentId: string | null, category: string) => {
      if (!departmentId) return false;
      if (departmentId === category) return true;
      const d = departments.find((x) => x.id === departmentId);
      return d?.parent_department_id === category;
    };
  }, [departments]);

  const vendorMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors
      .filter((v) => deptFilter === "all" || !v.department_id || inCategory(v.department_id, deptFilter))
      .filter((v) => !q || v.name.toLowerCase().includes(q));
  }, [vendors, deptFilter, search, inCategory]);
  // Browsing everything stays short, but a chosen category or a search shows EVERY match:
  // the owner's big department has 70+ vendors and number 31 must not silently vanish.
  const vendorsCapped = deptFilter === "all" && !search.trim() && vendorMatches.length > 30;
  const filteredVendors = vendorsCapped ? vendorMatches.slice(0, 30) : vendorMatches;
  // Counts on the chips: how many vendors are filed under each category (sections roll up).
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of topCategories) {
      m.set(d.id, vendors.filter((v) => v.department_id && inCategory(v.department_id, d.id)).length);
    }
    return m;
  }, [topCategories, vendors, inCategory]);

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
    setNvForm({ name: "", department_id: "", rep_name: "", phone: "", email: "", default_terms: "", products: "", notes: "" });
  }

  // Quick-add a vendor without leaving the payout flow. Category comes from the active
  // chip when one is picked, otherwise from the select in the small form.
  // Department is optional: a new vendor can be filed as multi-department or unknown
  // and assigned later. Vendors with no department appear in every filter.
  async function addVendor() {
    const name = nvForm.name.trim();
    const dept = nvForm.department_id || (deptFilter !== "all" ? deptFilter : "");
    if (!name) {
      setError("The new vendor needs a name.");
      return;
    }
    if (!currentActorId(member)) {
      setError("Pick who you are first: choose your name under Acting as on any main screen.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await supabase
        .from("vendor")
        .insert({
          store_id: storeId,
          department_id: dept || null,
          name,
          rep_name: nvForm.rep_name.trim() || null,
          phone: nvForm.phone.trim() || null,
          email: nvForm.email.trim() || null,
          default_terms: nvForm.default_terms.trim() || null,
          products_we_carry: nvForm.products.trim() || null,
          notes: nvForm.notes.trim() || null,
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
      setNvForm({ name: "", department_id: "", rep_name: "", phone: "", email: "", default_terms: "", products: "", notes: "" });
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

  async function deactivateVendor(vid: string) {
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.from("vendor").update({ status: "skip" }).eq("id", vid);
      if (e) throw new Error(e.message);
      const actor = currentActorId(member);
      if (actor) await supabase.from("activity_log").insert({ actor_id: actor, action: "vendor_deactivated", entity: "vendor", entity_id: vid });
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function reactivateVendor(vid: string) {
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.from("vendor").update({ status: "active" }).eq("id", vid);
      if (e) throw new Error(e.message);
      const actor = currentActorId(member);
      if (actor) await supabase.from("activity_log").insert({ actor_id: actor, action: "vendor_reactivated", entity: "vendor", entity_id: vid });
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function deleteVendor(vid: string, name: string) {
    if (!currentActorId(member)) {
      setError("Pick who you are first: choose your name under Acting as on any main screen.");
      return;
    }
    if (!window.confirm(`Delete "${name}"? It will be hidden from all lists but kept for the tax history. Its invoices and payments remain.`)) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("vendor", vid, currentActorId(member));
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  // Fill the allocation boxes from one installment amount, oldest due date first, a
  // partial on the last invoice it reaches. Nothing records here: the person still sees
  // the spread and presses Record, and the engine derives partially_paid on its own.
  function spreadOldestFirst() {
    const amt = round2(Number(spreadAmount) || 0);
    if (amt <= 0) {
      setError("Enter the installment amount to spread first.");
      return;
    }
    const open = [...vendorInvoices].sort((a, b) => ((a.due_date || "9999-99-99") < (b.due_date || "9999-99-99") ? -1 : 1));
    let left = amt;
    const next: Record<string, string> = {};
    for (const i of open) {
      if (left <= 0) break;
      const rem = round2(remainingToAllocate(invoiceTotal(i), settlements.get(i.id)));
      if (rem <= 0) continue;
      const take = round2(Math.min(rem, left));
      next[i.id] = String(take);
      left = round2(left - take);
    }
    setNoInvoice(false);
    setAlloc(next);
    const n = Object.keys(next).length;
    if (n === 0) {
      setError("Nothing is owed on this vendor's open invoices, so there is nothing to spread. A payment with no invoice can be recorded as a deposit below.");
      return;
    }
    setError(null);
    setOkMsg(
      `Spread ${formatCAD(amt - left)} across ${n} invoice${n === 1 ? "" : "s"}, oldest first.` +
      (left > 0 ? ` ${formatCAD(left)} did not fit because everything owed is covered; lower the amount or record the extra separately as a deposit.` : "") +
      " Check the split, then record."
    );
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

    // A payout without a known author never posts: the audit trail is the point.
    const actor = currentActorId(member);
    if (!actor) {
      setError("Pick who you are first: open any main screen, choose your name under Acting as, then record the payout.");
      return;
    }

    setBusy(true);
    try {
      // Re-check what each ticked invoice still needs against the database as of right now,
      // not against what this screen loaded earlier. This blocks over-allocation (a typo of
      // 1000 into a $100 box) and the double-pay where two people, or one impatient retry,
      // settle the same invoice twice.
      if (allocations.length) {
        const fresh = await fetchSettlements(allocations.map((a) => a.invoice_id));
        for (const a of allocations) {
          const inv = openInvoices.find((i) => i.id === a.invoice_id);
          if (!inv) {
            // The invoice left the open list (paid elsewhere, or voided) after it was
            // ticked. Letting it through would pay an invoice this screen can no longer
            // see; dropping it silently would record less than the person approved.
            setError("One of the ticked invoices is no longer open (it was paid or removed since this screen loaded). The list refreshed; check the ticks and record again.");
            setAlloc((prev) => {
              const next: Record<string, string> = {};
              for (const [k, v] of Object.entries(prev)) if (k !== a.invoice_id) next[k] = v;
              return next;
            });
            setBusy(false);
            await load();
            return;
          }
          const left = round2(remainingToAllocate(invoiceTotal(inv), fresh.get(a.invoice_id)));
          if (a.amount > left + 0.005) {
            setError(
              left <= 0
                ? `Invoice ${inv.invoice_number || "(no number)"} is already fully covered. Refresh to see it.`
                : `Invoice ${inv.invoice_number || "(no number)"} only has ${formatCAD(left)} left to pay; ${formatCAD(a.amount)} was entered.`
            );
            // Prune the stale allocation so a blind retry cannot sneak it through once the
            // invoice drops off the reloaded open list.
            if (left <= 0) {
              setAlloc((prev) => {
                const next: Record<string, string> = {};
                for (const [k, v] of Object.entries(prev)) if (k !== a.invoice_id) next[k] = v;
                return next;
              });
            }
            setBusy(false);
            await load();
            return;
          }
        }
      }

      await recordPaymentRpc({
        vendorId,
        method,
        paidDate,
        reference,
        notes,
        confirmationFiling: filing,
        actorId: actor,
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
      // Refresh anyway: if the payment actually committed and only the response was lost,
      // the reloaded lists show it, so nobody retries a payment that already went through.
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removePayment(p: Payment) {
    if (!window.confirm("Void this payment? It stays in the history for tax records, but its invoices go back to owing.")) return;
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
        actorId: currentActorId(member)
      });
      setEditPayId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // The shared corrective form under a payment row (both lists use it).
  function editPayFormBlock(p: Payment) {
    if (editPayId !== p.id) return null;
    return (
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
    );
  }

  // One line describing what a payment covered.
  function coverage(p: Payment): string {
    const nums = (p.payment_allocation || [])
      .map((a) => a.invoice?.invoice_number)
      .filter(Boolean);
    if (nums.length) return nums.join(", ");
    return "deposit / prepayment";
  }

  // Export all payments (recent + scheduled) to an Excel workbook.
  function exportPayments() {
    const allPayments = [...scheduled, ...recent];
    // Deduplicate by id (recent may overlap with scheduled).
    const seen = new Set<string>();
    const unique = allPayments.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });

    const rows = unique.map((p) => ({
      Vendor: p.vendor?.name || "",
      Amount: Number(p.amount) || 0,
      Method: methodLabel(p.method),
      "Paid Date": p.paid_date || "",
      Reference: p.reference || "",
      "Confirmation Filed": p.confirmation_filing || "",
      Notes: p.notes || "",
      "Invoices Covered": coverage(p),
      "Post-dated": isFutureDate(p.paid_date) ? "Yes" : "No"
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payments");
    XLSX.writeFile(wb, `payments-export-${todayISO()}.xlsx`);
  }

  // Fail closed: an unresolved or unknown role sees the limited card, never the dollar
  // figures. Same contract as every other money screen (null role = staff visibility).
  if (!showMoney) {
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
          <p className="page-sub">One place to record any vendor payment. Department comes from the <em>invoice</em>, never a question.</p>
        </div>
        <div className="page-actions">
          {!REQUIRE_AUTH && users.length > 0 && (
            <>
              <label className="help" htmlFor="pay-actor">Acting as </label>
              <select id="pay-actor" className="input" style={{ width: "auto", display: "inline-block", padding: "6px 8px" }} value={actorPick} onChange={(e) => pickActor(e.target.value)}>
                <option value="">Pick your name</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
              </select>
            </>
          )}
          <button className="btn-ghost" onClick={exportPayments} disabled={loading || recent.length === 0}>
            Export Excel
          </button>
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
                  All categories . {vendors.length}
                </button>
                {topCategories.map((d) => (
                  <button
                    key={d.id}
                    className="chip"
                    style={{ cursor: "pointer", border: deptFilter === d.id ? "1px solid var(--primary-base, #2F6FEB)" : "1px solid var(--border)", background: "#EEF1F4", color: d.accent_color || undefined }}
                    onClick={() => setDeptFilter(deptFilter === d.id ? "all" : d.id)}
                  >
                    {d.name}{categoryCounts.get(d.id) ? ` . ${categoryCounts.get(d.id)}` : ""}
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
                  <div
                    key={v.id}
                    className="card"
                    style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left" }}
                    onClick={() => pickVendor(v.id)}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{v.name}</span>
                      {v.products_we_carry && <span style={{ display: "block", marginTop: 3 }}>{productChips(v.products_we_carry, 3)}</span>}
                    </span>
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {v.department ? (
                        <span className="chip" style={{ background: "#EEF1F4", color: v.department.accent_color || "#6B7480" }}>
                          {v.department.name}
                        </span>
                      ) : (
                        <span className="chip" style={{ background: "#EEF1F4", color: "#6B7480" }}>Multi-dept</span>
                      )}
                      {v.status !== "active" && (
                        <span className="chip chip-neutral">{v.status}</span>
                      )}
                      {openInvoices.some((i) => i.vendor_id === v.id) && (
                        <span className="chip chip-warning">open invoices</span>
                      )}
                      {mayEdit && (
                        <span style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                          {v.status === "active" ? (
                            <button className="btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => deactivateVendor(v.id)} disabled={busy} title="Deactivate vendor">
                              Deactivate
                            </button>
                          ) : (
                            <button className="btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => reactivateVendor(v.id)} disabled={busy} title="Reactivate vendor">
                              Activate
                            </button>
                          )}
                          <button className="btn-ghost" style={{ padding: "2px 8px", fontSize: 11, color: "var(--error-base, #C0362C)" }} onClick={() => deleteVendor(v.id, v.name)} disabled={busy} title="Delete vendor">
                            Delete
                          </button>
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                {filteredVendors.length === 0 && <p className="help">No vendors match. Clear the search or the category filter, or add the vendor below.</p>}
                {vendorsCapped && (
                  <p className="help" style={{ margin: 0 }}>
                    Showing 30 of {vendorMatches.length}. Pick a category chip or start typing to see everyone.
                  </p>
                )}
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
                    <div><label className="label" htmlFor="nv-dept">Category (optional)</label>
                      <select id="nv-dept" className="input" value={nvForm.department_id || (deptFilter !== "all" ? deptFilter : "")} onChange={(e) => setNvForm({ ...nvForm, department_id: e.target.value })}>
                        <option value="">Multi-department / Unknown</option>
                        {allDepartments.map((d) => <option key={d.id} value={d.id}>{d.parent_department_id ? `  ${d.name}` : d.name}</option>)}
                      </select>
                      <p className="help" style={{ margin: "4px 0 0" }}>Leave blank if the vendor spans multiple departments or you are unsure. Assign later from the vendor page.</p>
                    </div>
                    <div><label className="label" htmlFor="nv-rep">Rep name</label><input id="nv-rep" className="input" value={nvForm.rep_name} onChange={(e) => setNvForm({ ...nvForm, rep_name: e.target.value })} /></div>
                    <div><label className="label" htmlFor="nv-phone">Phone</label><input id="nv-phone" className="input" value={nvForm.phone} onChange={(e) => setNvForm({ ...nvForm, phone: e.target.value })} /></div>
                    <div><label className="label" htmlFor="nv-email">Email</label><input id="nv-email" className="input" type="email" value={nvForm.email} onChange={(e) => setNvForm({ ...nvForm, email: e.target.value })} /></div>
                    <div><label className="label" htmlFor="nv-terms">Terms</label><input id="nv-terms" className="input" placeholder="Net 30" value={nvForm.default_terms} onChange={(e) => setNvForm({ ...nvForm, default_terms: e.target.value })} /></div>
                    <div><label className="label" htmlFor="nv-products">What they supply (optional)</label><input id="nv-products" className="input" placeholder="Mugs, wallets, everyday gifts" value={nvForm.products} onChange={(e) => setNvForm({ ...nvForm, products: e.target.value })} />
                      <p className="help" style={{ margin: "4px 0 0" }}>Comma-separated; shows as small labels and is searchable. Fine to change any time.</p>
                    </div>
                    <div><label className="label" htmlFor="nv-notes">Notes (optional)</label><input id="nv-notes" className="input" placeholder="Rep visits in summer, order by March" value={nvForm.notes} onChange={(e) => setNvForm({ ...nvForm, notes: e.target.value })} /></div>
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
                  {vendorInvoices.length > 1 && (
                    <div className="card" style={{ padding: 10, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", background: "var(--tile)" }}>
                      <div>
                        <label className="label" htmlFor="pay-spread">Paying an installment toward everything owed?</label>
                        <input id="pay-spread" className="input tabular" style={{ width: 150 }} type="number" step="0.01" placeholder="Amount" value={spreadAmount} onChange={(e) => setSpreadAmount(e.target.value)} />
                      </div>
                      <button className="btn-ghost" onClick={spreadOldestFirst} disabled={busy}>Spread it oldest first</button>
                      <p className="help" style={{ margin: 0, flexBasis: "100%" }}>
                        Fills the boxes below across the open invoices, oldest due date first, with a partial on the last one it reaches. Adjust anything before recording.
                      </p>
                    </div>
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
                  <p className="help" style={{ margin: "4px 0 0" }}>{referenceHelp(method)}</p>
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
              <div key={p.id} className="card" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {p.vendor_id ? (
                        <Link href={`/vendors/${p.vendor_id}`} style={{ fontWeight: 700, textDecoration: "none" }}>{p.vendor?.name || "Vendor"}</Link>
                      ) : (
                        <strong>{p.vendor?.name || "Vendor"}</strong>
                      )}
                      <span className="chip chip-progress">clears {p.paid_date}</span>
                    </div>
                    <div className="help" style={{ marginTop: 4 }}>
                      {methodLabel(p.method)}{p.reference ? ` . ${p.reference}` : ""} . {coverage(p)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="tabular" style={{ fontWeight: 600 }}>{formatCAD(p.amount)}</div>
                    {mayEdit && (
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
                        <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startEditPayment(p)} disabled={busy} title="Fix the date, method, reference, notes, or filing">
                          Edit
                        </button>
                        <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => removePayment(p)} disabled={busy} title="The payment stays in the history for the tax record; its invoices go back to owing">
                          Void
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {mayEdit && editPayFormBlock(p)}
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
            {/* A post-dated payment appears in the scheduled list above too; its Edit lives
                there so the shared edit form never renders twice for one payment. */}
            {recent.map((p) => (
              <div key={p.id} className="card" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {p.vendor_id ? (
                        <Link href={`/vendors/${p.vendor_id}`} style={{ fontWeight: 700, textDecoration: "none" }}>{p.vendor?.name || "Vendor"}</Link>
                      ) : (
                        <strong>{p.vendor?.name || "Vendor"}</strong>
                      )}
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
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
                        {!scheduled.some((s) => s.id === p.id) && (
                          <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startEditPayment(p)} disabled={busy} title="Fix the date, method, reference, notes, or filing">
                            Edit
                          </button>
                        )}
                        <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => removePayment(p)} disabled={busy} title="The payment stays in the history for the tax record; its invoices go back to owing">
                          Void
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {mayEdit && !scheduled.some((s) => s.id === p.id) && editPayFormBlock(p)}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
