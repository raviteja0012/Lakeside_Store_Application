"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { chipClass, labelize } from "@/lib/status";
import { formatCAD, daysOverdue } from "@/lib/format";
import type { Vendor, PurchaseOrder, Invoice, Payment } from "@/lib/types";

export default function VendorDetail() {
  const params = useParams();
  const id = String(params?.id || "");
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: v, error: ve } = await supabase
        .from("vendor")
        .select("id, name, rep_name, phone, email, products_we_carry, default_terms, status, notes, department:department_id(name, accent_color)")
        .eq("id", id)
        .maybeSingle();
      if (ve) {
        setError(ve.message);
        setLoading(false);
        return;
      }
      setVendor((v as unknown as Vendor) || null);

      const { data: po } = await supabase
        .from("purchase_order")
        .select("id, vendor_id, order_amount, ship_date, delivery_commit, status, season_year, notes, department_id")
        .eq("vendor_id", id)
        .order("ship_date", { ascending: false });
      setOrders((po as unknown as PurchaseOrder[]) || []);

      const { data: inv } = await supabase
        .from("invoice")
        .select("id, vendor_id, invoice_number, amount, hst_amount, terms, due_date, status")
        .eq("vendor_id", id)
        .order("due_date", { ascending: true });
      const invList = (inv as unknown as Invoice[]) || [];
      setInvoices(invList);

      const invoiceIds = invList.map((i) => i.id);
      if (invoiceIds.length) {
        const { data: pay } = await supabase
          .from("payment")
          .select("id, invoice_id, amount, method, paid_date")
          .in("invoice_id", invoiceIds)
          .order("paid_date", { ascending: false });
        setPayments((pay as unknown as Payment[]) || []);
      }
      setLoading(false);
    })();
  }, [id]);

  const invoiceTotal = (i: Invoice) => (Number(i.amount) || 0) + (Number(i.hst_amount) || 0);
  const outstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + invoiceTotal(i), 0);

  if (loading) return <p className="help">Loading vendor.</p>;
  if (error)
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
      <div>
        <Link href="/vendors" className="help" style={{ textDecoration: "none" }}>&larr; Vendors</Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>{vendor.name}</h1>
          {vendor.department && <span className="chip" style={{ background: "#EEF1F4", color: vendor.department.accent_color || "#6B7480" }}>{vendor.department.name}</span>}
          <span className={`chip ${chipClass(vendor.status)}`}>{labelize(vendor.status)}</span>
        </div>
      </div>

      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="help">Contact</div>
            <div>{vendor.rep_name || "No rep on file"}</div>
            <div className="help">{[vendor.phone, vendor.email].filter(Boolean).join(" . ")}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="help">Outstanding</div>
            <div className="tabular" style={{ fontSize: 20, fontWeight: 700 }}>{formatCAD(outstanding)}</div>
            <div className="help">{vendor.default_terms || ""}</div>
          </div>
        </div>
        {vendor.products_we_carry && (
          <div>
            <div className="help">Products</div>
            <div>{vendor.products_we_carry}</div>
          </div>
        )}
        {vendor.notes && (
          <div>
            <div className="help">Notes and rules</div>
            <div>{vendor.notes}</div>
          </div>
        )}
      </div>

      <section>
        <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Invoices</h2>
        {invoices.length === 0 && <p className="help">No invoices on file.</p>}
        <div style={{ display: "grid", gap: 8 }}>
          {invoices.map((i) => {
            const d = daysOverdue(i.due_date);
            const overdue = i.status === "unpaid" && d != null && d > 0;
            return (
              <div key={i.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{i.invoice_number || "Invoice"}</strong>
                    <span className={`chip ${overdue ? "chip-error" : chipClass(i.status)}`}>{overdue ? `${d} days overdue` : labelize(i.status)}</span>
                  </div>
                  <div className="help" style={{ marginTop: 4 }}>{i.terms || ""}{i.due_date ? ` . due ${i.due_date}` : ""}</div>
                </div>
                <div className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{formatCAD(invoiceTotal(i))}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Purchase orders</h2>
        {orders.length === 0 && <p className="help">No orders on file.</p>}
        <div style={{ display: "grid", gap: 8 }}>
          {orders.map((o) => (
            <div key={o.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>{o.season_year || ""} order</strong>
                  <span className={`chip ${chipClass(o.status)}`}>{labelize(o.status)}</span>
                </div>
                <div className="help" style={{ marginTop: 4 }}>{o.ship_date ? `ship ${o.ship_date}` : ""}{o.notes ? ` . ${o.notes}` : ""}</div>
              </div>
              <div className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{o.order_amount != null ? formatCAD(o.order_amount) : "n/a"}</div>
            </div>
          ))}
        </div>
      </section>

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
    </div>
  );
}
