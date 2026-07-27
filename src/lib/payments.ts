// Shared payment model. One method list (the owner's), one label mapping, and thin wrappers
// around the record_payment / void_payment RPCs so every screen records payments through the
// same atomic path: payment row + allocations + invoice statuses + audit in one transaction.
// See supabase/payments_v2.sql for the engine.

import { supabase } from "@/lib/supabaseClient";
import { daysOverdue } from "@/lib/format";
import type { Invoice } from "@/lib/types";

// The owner's locked list. Post-dated is not a method: it is a cheque with a future
// paid date, and the app derives "post-dated" from the date, never from a label.
export const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "cc_visa", label: "CC Visa" },
  { value: "cc_mastercard", label: "CC Mastercard" },
  { value: "cc_amex", label: "CC AMEX" },
  { value: "cc_debit", label: "CC Debit" },
  { value: "etransfer", label: "E-Transfer" },
  { value: "eft", label: "EFT" },
  { value: "other", label: "Other" }
];

// Rows recorded before the card split. Valid in the database, not offered in the UI.
const LEGACY_LABELS: Record<string, string> = { cc: "Credit card" };

// Where the payment confirmation is filed, per the workflow sheet. "Both" is the owner's
// real third case: an emailed receipt that also goes in the paper binder.
export const CONFIRMATION_FILING: { value: string; label: string }[] = [
  { value: "digital", label: "Digital" },
  { value: "physical", label: "Physical" },
  { value: "both", label: "Digital and Physical" }
];

// Delivery state on an invoice entry.
export const DELIVERY_STATUS: { value: string; label: string }[] = [
  { value: "delivered", label: "Delivered" },
  { value: "not_delivered", label: "Not delivered" }
];

// Property Maintenance work types.
export const WORK_TYPES: { value: string; label: string }[] = [
  { value: "repair", label: "Repair" },
  { value: "upgrade", label: "Upgrade" }
];

// Property Maintenance service categories (SCRUM-9). Others opens a free-text box, so the
// column stays plain text and this list is the picker, not a constraint.
export const SERVICE_CATEGORIES = [
  "Electrical", "Plumbing", "HVAC", "Refrigeration", "Lawn", "Septic", "Roofing", "Snow Removal", "Others"
];

// How a vendor credit comes back to the store.
export const CREDIT_TYPES: { value: string; label: string }[] = [
  { value: "bank_account", label: "Refund to bank account" },
  { value: "vendor_account", label: "Credit on vendor account" }
];

// Hardware invoices carry the purchase order number (SCRUM-9 AC 2).
export function isHardwareDept(name: string | null | undefined): boolean {
  return !!name && /hardware/i.test(name);
}

// True when a department (by name) is the Property Maintenance payout category. The
// vendor's category decides which invoice fields the forms show.
export function isPropertyDept(name: string | null | undefined): boolean {
  return !!name && /property/i.test(name);
}

// True for the Payrolls & Taxes payout category (payroll remittances, incorporation
// taxes). Those payouts have no delivery or freight, so the forms drop that noise.
export function isFinanceDept(name: string | null | undefined): boolean {
  return !!name && /payroll|tax/i.test(name);
}

export function methodLabel(value: string | null | undefined): string {
  if (!value) return "Payment";
  return PAYMENT_METHODS.find((m) => m.value === value)?.label || LEGACY_LABELS[value] || value;
}

// The reference field means something different per method; label it so people type the
// right thing (the cheque number is what makes the bank statement reconcile).
export function referenceLabel(method: string): string {
  if (method === "cheque") return "Cheque number";
  if (method === "etransfer") return "E-Transfer reference";
  if (method === "eft") return "EFT reference";
  if (method.startsWith("cc_")) return "Card confirmation";
  return "Reference";
}

// One plain sentence under the reference box, so the field explains itself (the owner
// asked twice what "Card confirmation" meant). Always optional.
export function referenceHelp(method: string): string {
  if (method === "cheque") return "The number on the cheque, so the bank statement matches. Optional.";
  if (method === "etransfer") return "The reference code from the transfer confirmation. Optional.";
  if (method === "eft") return "The reference from the EFT confirmation. Optional.";
  if (method.startsWith("cc_")) return "The approval code on the card slip or emailed receipt. Optional.";
  return "Any number or code that identifies this payment. Optional.";
}

// Total owed on an invoice: goods + freight + HST.
export function invoiceTotal(i: Pick<Invoice, "amount" | "hst_amount"> & { freight_charges?: number | null }): number {
  return (Number(i.amount) || 0) + (Number(i.freight_charges) || 0) + (Number(i.hst_amount) || 0);
}

// True when the date is after today: the payment is post-dated and has not settled yet.
export function isFutureDate(dateISO: string | null | undefined): boolean {
  const d = daysOverdue(dateISO);
  return d != null && d < 0;
}

export type AllocationInput = { invoice_id: string; amount: number };

// Record a payment. Allocations settle invoices (one payment can cover several, even across
// departments); a payment with no allocations is a deposit/prepayment and needs `amount`.
export async function recordPaymentRpc(args: {
  vendorId: string;
  method: string;
  paidDate: string; // YYYY-MM-DD; a future date records a post-dated payment
  reference?: string;
  notes?: string;
  confirmationFiling?: string; // digital | physical
  actorId: string | null;
  allocations: AllocationInput[];
  amount?: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc("record_payment", {
    p_vendor_id: args.vendorId,
    p_method: args.method,
    p_paid_date: args.paidDate,
    p_reference: args.reference || null,
    p_notes: args.notes || null,
    p_confirmation_filing: args.confirmationFiling || null,
    p_actor: args.actorId,
    p_allocations: args.allocations,
    p_amount: args.amount ?? null
  });
  if (error) throw new Error(error.message);
  return data as string;
}

// Void a payment and put every invoice it touched back to its true status.
export async function voidPaymentRpc(paymentId: string, actorId: string | null): Promise<void> {
  const { error } = await supabase.rpc("void_payment", { p_payment_id: paymentId, p_actor: actorId });
  if (error) throw new Error(error.message);
}

// Fix a recorded payment's facts (date, method, reference, notes, filing) and re-derive
// the touched invoice statuses. The amount stays: void and re-record for a wrong amount.
export async function editPaymentRpc(args: {
  paymentId: string;
  method: string;
  paidDate: string;
  reference?: string;
  notes?: string;
  confirmationFiling?: string;
  actorId: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("edit_payment", {
    p_payment_id: args.paymentId,
    p_method: args.method,
    p_paid_date: args.paidDate,
    p_reference: args.reference || null,
    p_notes: args.notes || null,
    p_confirmation_filing: args.confirmationFiling || null,
    p_actor: args.actorId
  });
  if (error) throw new Error(error.message);
}

// Flip post-dated invoices whose payment dates have arrived. Cheap; call on page load.
// Errors are swallowed on purpose: a stale badge is better than a blocked page.
export async function reconcilePostdated(): Promise<void> {
  try {
    await supabase.rpc("reconcile_postdated");
  } catch {
    /* non-fatal */
  }
}

// Settled (money gone) vs scheduled (post-dated, not yet cleared) per invoice, from its
// allocations. A null paid_date counts as settled: legacy imports carry no date.
export type InvoiceSettlement = { settled: number; scheduled: number };
export type AllocationRow = {
  invoice_id: string;
  amount: number | null;
  payment: { paid_date: string | null; voided_at?: string | null } | null;
};

export function settlementByInvoice(allocations: AllocationRow[]): Map<string, InvoiceSettlement> {
  const m = new Map<string, InvoiceSettlement>();
  for (const a of allocations) {
    if (!a.payment || a.payment.voided_at) continue;
    const cur = m.get(a.invoice_id) || { settled: 0, scheduled: 0 };
    const amt = Number(a.amount) || 0;
    if (isFutureDate(a.payment.paid_date)) cur.scheduled += amt;
    else cur.settled += amt;
    m.set(a.invoice_id, cur);
  }
  return m;
}

// What is still owed on an invoice right now (scheduled money has not left the account,
// so it does not reduce the owed figure, but the UI shows it as covered/post-dated).
export function remainingOwed(total: number, s: InvoiceSettlement | undefined): number {
  return Math.max(0, total - (s?.settled || 0));
}

// What is left to allocate when recording a new payment (a post-dated cheque already
// covers its share, so it does reduce this figure).
export function remainingToAllocate(total: number, s: InvoiceSettlement | undefined): number {
  return Math.max(0, total - (s?.settled || 0) - (s?.scheduled || 0));
}

// Fetch settlement state for a set of invoices in one query.
export async function fetchSettlements(invoiceIds: string[]): Promise<Map<string, InvoiceSettlement>> {
  if (!invoiceIds.length) return new Map();
  const out: AllocationRow[] = [];
  // .in() has practical URL-length limits; chunk the id list.
  for (let i = 0; i < invoiceIds.length; i += 200) {
    const chunk = invoiceIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from("payment_allocation")
      .select("invoice_id, amount, payment:payment_id(paid_date, voided_at)")
      .in("invoice_id", chunk);
    if (error) throw new Error(error.message);
    out.push(...(((data as unknown) as AllocationRow[]) || []));
  }
  return settlementByInvoice(out);
}
