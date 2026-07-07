// Keep in sync with scripts/generate-seed-bookings.mjs (same mapping, two callers).
//
// Pure parser for the 2026 bookings workbook. No React, no Supabase, no Node fs.
// Takes the three department sheets already read into rows (header:1 arrays) and maps
// each vendor row to a vendor plus, when present, a purchase order, an invoice, a
// payment, and a knowledge note. Output is plain objects whose keys mirror the table
// columns. created_by is intentionally not set here; the API attaches it.

import { createHash } from "crypto";

// Deterministic md5-based UUIDs, identical to the seed generator. Stable keys mean a
// re-import lands the same ids, so the by-name upsert never duplicates a row.
function uuid(key: string): string {
  const h = createHash("md5").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// Department UUIDs match seed.sql exactly: Gifts, Grocery, Clothing.
const DEPT: Record<string, string> = {
  Gifts: "22222222-0000-0000-0000-000000000002",
  Grocery: "22222222-0000-0000-0000-000000000003",
  Clothing: "22222222-0000-0000-0000-000000000005"
};

type ColMap = Record<string, number>;
type SheetCfg = { dept: keyof typeof DEPT; col: ColMap };

// Sheet name -> { dept, columns }. Each sheet has its own column order.
const SHEETS: Record<string, SheetCfg> = {
  "Dry goods": {
    dept: "Gifts",
    col: { vendor: 0, rep: 1, phone: 2, email: 3, products: 4, orderStatus: 5, comments: 6,
           amount: 8, ship: 9, deliveryStatus: 10, deliveryComments: 11, invAmount: 13,
           terms: 14, due: 15, payStatus: 16, payDate: 17 }
  },
  "Lake side": {
    dept: "Clothing",
    col: { vendor: 0, rep: 1, phone: 2, products: 3, orderStatus: 6, ship: 7, deliveryStatus: 8,
           amount: 9, invAmount: 10, due: 11, terms: 12, payMonth: 13, comments: 14, statusNote: 15 }
  },
  "Grocery Vendors": {
    dept: "Grocery",
    col: { vendor: 0, rep: 1, phone: 2, products: 3, orderStatus: 4, ship: 5, deliveryStatus: 6,
           amount: 7, invAmount: 8, due: 9, terms: 10, payMonth: 11, comments: 12, statusNote: 13 }
  }
};

// Vendor-cell text that marks a section divider or totals row, not a vendor. A divider is
// skipped only when it carries no money: "2026 new" is an empty divider on the Lake side sheet
// but a real vendor (order $1,518) on Dry goods, so the money test keeps the real one.
const DIVIDERS = new Set([
  "faith in the forest", "2026 new", "grand total", "reorder vendors", "clothing",
  "total", "order placed, waiting for confirmation", "need before may long weekend",
  "cancelled & corrections", "grocery vendors"
]);

const num = (v: any): number | null => (typeof v === "number" && isFinite(v)) ? v : null;
const text = (v: any): string => (v === null || v === undefined) ? "" : String(v).trim();

// Excel serial date -> ISO yyyy-mm-dd (Excel epoch 1899-12-30). Text dates return null.
function iso(v: any): string | null {
  if (typeof v !== "number" || !isFinite(v)) return null;
  const ms = Math.round((v - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function vendorStatus(s: string): "bankrupt" | "discontinue" | "skip" | "active" {
  if (/bankrupt|bankcrupt/i.test(s)) return "bankrupt";
  if (/discontinue/i.test(s)) return "discontinue";
  if (/skip/i.test(s)) return "skip";
  return "active";
}
function payMethod(s: string): "cheque" | "etransfer" | "cc" | "cash" | null {
  if (/cheque/i.test(s)) return "cheque";
  if (/e-?transfer/i.test(s)) return "etransfer";
  if (/credit card|\bcc\b/i.test(s)) return "cc";
  if (/cash/i.test(s)) return "cash";
  return null;
}
function poStatus(orderStatus: string, deliveryStatus: string): "cancelled" | "received" | "ordered" {
  if (/cancel/i.test(orderStatus)) return "cancelled";
  if (/deliver|received/i.test(deliveryStatus)) return "received";
  return "ordered";
}
// Paid is encoded differently per sheet (a PaymentStatus column on Dry goods, the DueDate cell
// on Lake side, scattered on Grocery), so scan every status-bearing cell. Guard against the
// "Not Paid" / "Not Yet" rows, and \bpaid\b never matches "payment" or "after Payment".
function isPaid(r: any[], c: ColMap): boolean {
  const s = [c.payStatus, c.due, c.payMonth, c.statusNote, c.comments]
    .filter((k) => k !== undefined).map((k) => text(r[k])).join(" ");
  if (/not\s*paid|not\s*yet/i.test(s)) return false;
  return /\bpaid\b/i.test(s);
}
function invStatus(paid: boolean, termsAndNotes: string): "paid" | "postdated" | "unpaid" {
  if (paid) return "paid";
  if (/post-?dated|post dated/i.test(termsAndNotes)) return "postdated";
  return "unpaid";
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Plain output objects. Keys mirror the table columns. created_by is left to the API.
export type ParsedVendor = {
  id: string;
  store_id: string;
  department_id: string;
  name: string;
  rep_name: string;
  phone: string;
  email: string;
  products_we_carry: string;
  default_terms: string;
  status: "active" | "skip" | "discontinue" | "bankrupt";
  notes: string;
};

export type ParsedOrder = {
  id: string;
  store_id: string;
  vendor_id: string;
  department_id: string;
  season_year: number;
  order_amount: number;
  ship_date: string | null;
  status: "cancelled" | "received" | "ordered";
  notes: string;
};

export type ParsedInvoice = {
  id: string;
  store_id: string;
  vendor_id: string;
  amount: number;
  hst_amount: number;
  terms: string;
  due_date: string | null;
  status: "paid" | "postdated" | "unpaid";
};

export type ParsedPayment = {
  id: string;
  invoice_id: string;
  amount: number;
  method: "cheque" | "etransfer" | "cc" | "cash" | null;
  paid_date: string | null;
};

export type ParsedNote = {
  id: string;
  store_id: string;
  department_id: string;
  topic: string;
  body: string;
  tags: string[];
};

export type PerSheet = { sheet: string; vendors: number; orderSum: number; invSum: number };

export type ParsedImport = {
  vendors: ParsedVendor[];
  orders: ParsedOrder[];
  invoices: ParsedInvoice[];
  payments: ParsedPayment[];
  notes: ParsedNote[];
  summary: {
    vendors: number;
    orders: number;
    invoices: number;
    payments: number;
    notes: number;
    perSheet: PerSheet[];
  };
};

// Map the three department sheets to the full vendor ledger. storeId stamps every
// store-scoped row (vendor, order, invoice, note); payment has no store_id.
export function parseWorkbook(
  sheets: { name: string; rows: any[][] }[],
  storeId: string
): ParsedImport {
  const vendors: ParsedVendor[] = [];
  const orders: ParsedOrder[] = [];
  const invoices: ParsedInvoice[] = [];
  const payments: ParsedPayment[] = [];
  const notes: ParsedNote[] = [];
  const perSheet: PerSheet[] = [];

  const byName = new Map(sheets.map((s) => [s.name, s.rows]));

  for (const [sheetName, cfg] of Object.entries(SHEETS)) {
    const rows = byName.get(sheetName);
    if (!rows) continue;
    const c = cfg.col;
    let orderSum = 0, invSum = 0, vendorCount = 0;
    // A vendor can appear on more than one row of a sheet (a second order or invoice). The
    // deterministic ids are keyed on sheet+name, so without this occurrence counter the second
    // row would collide on the same primary keys and abort the whole import. Repeat rows keep
    // the same vendor id (their children attach to the one vendor) and suffix the child ids.
    const seen = new Map<string, number>();

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const name = text(r[c.vendor]);
      const amount = num(r[c.amount]);
      const invAmount = num(r[c.invAmount]);
      // Skip blank vendor cells (the printed total rows) and empty section dividers.
      if (name === "") continue;
      if (DIVIDERS.has(name.toLowerCase()) && amount === null && invAmount === null) continue;

      const seenKey = `${sheetName}|${name.toLowerCase()}`;
      const occurrence = seen.get(seenKey) || 0;
      seen.set(seenKey, occurrence + 1);
      const dupSuffix = occurrence > 0 ? `|${occurrence}` : "";

      const vId = uuid(`v|${sheetName}|${name.toLowerCase()}`);
      const comments = text(r[c.comments]);
      const statusNote = text(r[c.statusNote]);
      const orderStatus = text(r[c.orderStatus]);
      const deliveryStatus = text(r[c.deliveryStatus]);
      const terms = text(r[c.terms]);
      const noteText = [comments, statusNote].filter(Boolean).join(" | ");
      const status = vendorStatus(`${comments} ${statusNote} ${orderStatus}`);
      const dept = DEPT[cfg.dept];

      if (amount !== null) orderSum += amount;
      if (invAmount !== null) invSum += invAmount;

      if (occurrence === 0) {
      vendorCount++;

      vendors.push({
        id: vId,
        store_id: storeId,
        department_id: dept,
        name,
        rep_name: text(r[c.rep]),
        phone: text(r[c.phone]),
        email: text(r[c.email]),
        products_we_carry: text(r[c.products]),
        default_terms: terms,
        status,
        notes: noteText
      });
      }

      if (amount !== null) {
        orders.push({
          id: uuid(`po|${sheetName}|${name.toLowerCase()}${dupSuffix}`),
          store_id: storeId,
          vendor_id: vId,
          department_id: dept,
          season_year: 2026,
          order_amount: amount,
          ship_date: iso(r[c.ship]),
          status: poStatus(orderStatus, deliveryStatus),
          notes: text(r[c.deliveryComments])
        });
      }

      const paid = isPaid(r, c);
      let invId: string | null = null;
      if (invAmount !== null) {
        invId = uuid(`inv|${sheetName}|${name.toLowerCase()}${dupSuffix}`);
        invoices.push({
          id: invId,
          store_id: storeId,
          vendor_id: vId,
          amount: invAmount,
          hst_amount: 0,
          terms,
          due_date: iso(r[c.due]),
          status: invStatus(paid, terms + " " + noteText)
        });
      }

      if (invId && paid) {
        payments.push({
          id: uuid(`pay|${sheetName}|${name.toLowerCase()}${dupSuffix}`),
          invoice_id: invId,
          amount: invAmount as number,
          method: payMethod(terms),
          paid_date: iso(r[c.payDate])
        });
      }

      if (noteText) {
        notes.push({
          id: uuid(`note|${sheetName}|${name.toLowerCase()}${dupSuffix}`),
          store_id: storeId,
          department_id: dept,
          topic: "Vendor: " + name,
          body: noteText,
          tags: ["vendor"]
        });
      }
    }

    perSheet.push({ sheet: sheetName, vendors: vendorCount, orderSum: round2(orderSum), invSum: round2(invSum) });
  }

  return {
    vendors,
    orders,
    invoices,
    payments,
    notes,
    summary: {
      vendors: vendors.length,
      orders: orders.length,
      invoices: invoices.length,
      payments: payments.length,
      notes: notes.length,
      perSheet
    }
  };
}
