"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { chipClass, labelize } from "@/lib/status";
import { formatCAD, daysOverdue } from "@/lib/format";
import { REQUIRE_AUTH, canSeeMoney, useEffectiveActor } from "@/lib/auth";
import type { Vendor, PurchaseOrder, Invoice, Payment, AppUser } from "@/lib/types";

const ACTOR_KEY = "rgs_actor";
const num = (s: string) => (s.trim() === "" ? null : Number(s));

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
  const [invForm, setInvForm] = useState({ invoice_number: "", amount: "", hst_amount: "", terms: "", due_date: "", status: "unpaid" });
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "cheque", paid_date: "" });

  // Effective role and actor: in enforced auth the signed-in member, else the dropdown.
  const { effectiveActorId, role } = useEffectiveActor(users, actorId);
  const showMoney = canSeeMoney(role);

  async function load() {
    const { data: v, error: ve } = await supabase
      .from("vendor")
      .select("id, store_id, department_id, name, rep_name, phone, email, products_we_carry, default_terms, status, notes, department:department_id(name, accent_color)")
      .eq("id", id)
      .maybeSingle();
    if (ve) {
      setError(ve.message);
      return;
    }
    setVendor((v as unknown as Vendor) || null);
    const { data: po } = await supabase.from("purchase_order").select("id, vendor_id, order_amount, ship_date, delivery_commit, status, season_year, notes, department_id").eq("vendor_id", id).order("ship_date", { ascending: false });
    setOrders((po as unknown as PurchaseOrder[]) || []);
    const { data: inv } = await supabase.from("invoice").select("id, vendor_id, invoice_number, amount, hst_amount, terms, due_date, status").eq("vendor_id", id).order("due_date", { ascending: true });
    const invList = (inv as unknown as Invoice[]) || [];
    setInvoices(invList);
    const ids = invList.map((i) => i.id);
    if (ids.length) {
      const { data: pay } = await supabase.from("payment").select("id, invoice_id, amount, method, paid_date").in("invoice_id", ids).order("paid_date", { ascending: false });
      setPayments((pay as unknown as Payment[]) || []);
    } else {
      setPayments([]);
    }
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
      const r = await supabase.from("invoice").insert({
        store_id: vendor.store_id ?? null,
        vendor_id: vendor.id,
        invoice_number: invForm.invoice_number || null,
        amount: num(invForm.amount),
        hst_amount: num(invForm.hst_amount) ?? 0,
        terms: invForm.terms || null,
        due_date: invForm.due_date || null,
        status: invForm.status
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      await log("invoice_added", "invoice", r.data.id as string);
      setShowInv(false);
      setInvForm({ invoice_number: "", amount: "", hst_amount: "", terms: "", due_date: "", status: "unpaid" });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startPay(i: Invoice) {
    setPayFor(i.id);
    setPayForm({ amount: String((Number(i.amount) || 0) + (Number(i.hst_amount) || 0)), method: "cheque", paid_date: "" });
  }

  async function recordPayment() {
    if (!payFor) return;
    setBusy(true);
    setError(null);
    try {
      const p = await supabase.from("payment").insert({
        invoice_id: payFor,
        amount: num(payForm.amount),
        method: payForm.method,
        paid_date: payForm.paid_date || null,
        created_by: effectiveActorId
      }).select("id").single();
      if (p.error) throw new Error(p.error.message);
      const u = await supabase.from("invoice").update({ status: "paid" }).eq("id", payFor);
      if (u.error) throw new Error(u.error.message);
      await log("payment_recorded", "invoice", payFor);
      setPayFor(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const invoiceTotal = (i: Invoice) => (Number(i.amount) || 0) + (Number(i.hst_amount) || 0);
  const outstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + invoiceTotal(i), 0);

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <Link href="/vendors" className="help" style={{ textDecoration: "none" }}>&larr; Vendors</Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <h1 style={{ fontSize: 22, margin: 0 }}>{vendor.name}</h1>
            {vendor.department && <span className="chip" style={{ background: "#EEF1F4", color: vendor.department.accent_color || "#6B7480" }}>{vendor.department.name}</span>}
            <span className={`chip ${chipClass(vendor.status)}`}>{labelize(vendor.status)}</span>
          </div>
        </div>
        {!REQUIRE_AUTH && (
          <div>
            <label className="help" htmlFor="actor">Acting as </label>
            <select id="actor" className="input" style={{ width: "auto", display: "inline-block", padding: "6px 8px" }} value={actorId} onChange={(e) => setActor(e.target.value)}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
            </select>
          </div>
        )}
      </div>

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
        {!editVendor && <button className="btn-ghost" style={{ justifySelf: "start" }} onClick={startEditVendor}>Edit vendor</button>}

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
              <div><label className="label">Amount (pre-tax)</label><input className="input tabular" type="number" step="0.01" value={invForm.amount} onChange={(e) => setInvForm({ ...invForm, amount: e.target.value })} /></div>
              <div><label className="label">HST</label><input className="input tabular" type="number" step="0.01" value={invForm.hst_amount} onChange={(e) => setInvForm({ ...invForm, hst_amount: e.target.value })} /></div>
              <div><label className="label">Terms</label><input className="input" value={invForm.terms} onChange={(e) => setInvForm({ ...invForm, terms: e.target.value })} /></div>
              <div><label className="label">Due date</label><input className="input" type="date" value={invForm.due_date} onChange={(e) => setInvForm({ ...invForm, due_date: e.target.value })} /></div>
              <div><label className="label">Status</label>
                <select className="input" value={invForm.status} onChange={(e) => setInvForm({ ...invForm, status: e.target.value })}>
                  {["unpaid", "paid", "postdated"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div><button className="btn-primary" onClick={addInvoice} disabled={busy}>{busy ? "Saving." : "Save invoice"}</button></div>
          </div>
        )}
        {invoices.length === 0 && <p className="help">No invoices on file.</p>}
        <div style={{ display: "grid", gap: 8 }}>
          {invoices.map((i) => {
            const d = daysOverdue(i.due_date);
            const overdue = i.status === "unpaid" && d != null && d > 0;
            return (
              <div key={i.id} className="card" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{i.invoice_number || "Invoice"}</strong>
                      <span className={`chip ${overdue ? "chip-error" : chipClass(i.status)}`}>{overdue ? `${d} days overdue` : labelize(i.status)}</span>
                    </div>
                    <div className="help" style={{ marginTop: 4 }}>{i.terms || ""}{i.due_date ? ` . due ${i.due_date}` : ""}</div>
                  </div>
                  {showMoney && (
                    <div style={{ textAlign: "right" }}>
                      <div className="tabular" style={{ fontWeight: 600 }}>{formatCAD(invoiceTotal(i))}</div>
                      {i.status !== "paid" && <button className="btn-ghost" style={{ padding: "4px 10px", marginTop: 4 }} onClick={() => startPay(i)}>Record payment</button>}
                    </div>
                  )}
                </div>
                {showMoney && payFor === i.id && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, alignItems: "end" }}>
                    <div><label className="label">Amount</label><input className="input tabular" type="number" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></div>
                    <div><label className="label">Method</label>
                      <select className="input" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                        {["cheque", "cc", "etransfer", "cash"].map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div><label className="label">Paid date</label><input className="input" type="date" value={payForm.paid_date} onChange={(e) => setPayForm({ ...payForm, paid_date: e.target.value })} /></div>
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
            <div key={o.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>{o.season_year || ""} order</strong>
                  <select className="input" style={{ width: "auto", padding: "2px 6px", fontSize: 12 }} value={o.status} onChange={(e) => updatePOStatus(o.id, e.target.value)} disabled={busy} aria-label="order status">
                    {["draft", "ordered", "confirmed", "shipped", "received", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="help" style={{ marginTop: 4 }}>{o.ship_date ? `ship ${o.ship_date}` : ""}{o.notes ? ` . ${o.notes}` : ""}</div>
              </div>
              {showMoney && <div className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{o.order_amount != null ? formatCAD(o.order_amount) : "n/a"}</div>}
            </div>
          ))}
        </div>
      </section>

      {showMoney && (
        <section>
          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Payments</h2>
          {payments.length === 0 && <p className="help">No payments recorded.</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {payments.map((p) => (
              <div key={p.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <strong>{labelize(p.method) || "Payment"}</strong>
                  <div className="help" style={{ marginTop: 4 }}>{p.paid_date ? `paid ${p.paid_date}` : ""}</div>
                </div>
                <div className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{formatCAD(p.amount)}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
