// Header-driven parser for the owner's EVOLVED bookings workbook (the 2026-07 layout).
// The first ledger had fixed column positions per sheet; the owner's live file has since
// grown richer columns (PaymentMethod, PaymentAmount, PaymentDate, PaymentConfirmationFiling,
// Credit back for damaged items, filing methods, PriyaComments, StoreApplication) AND the
// column order now differs between sheets, so this parser maps every column BY HEADER NAME.
// Pure module: no React, no Supabase, no fs. Output keys mirror the table columns;
// created_by is attached by the API.
//
// Real-world cells this file handles (all seen in the owner's actual workbook):
//   dates as Excel serials AND as text ("May 12th", "Jun 8, and July 10", "April1,May1, june1")
//   PaymentMethod like "Check", "CC_Visa (Email Link)", "VISA_CC", "AMEX (Link in Email)"
//   PaymentStatus like "PAID (545025)", "PAID $2189.38", "2 Partial Payments"
//   filing like "Digital", "Digital/Physical", "CC Statment" (free text falls into notes)

import { createHash } from "crypto";

// Deterministic md5-based UUIDs (same scheme as importBookings v1, distinct v2| keyspace so
// the two importers can never collide on ids). Stable keys make a re-import land the same
// ids, so the by-name upsert never duplicates a row.
function uuid(key: string): string {
  const h = createHash("md5").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// Department UUIDs match seed.sql: Gifts (Dry goods sheet), Clothing (Lake side), Grocery.
// The Local Vendors tab (greeting cards, local makers) files under Others.
const SHEET_DEPT: Record<string, string> = {
  "dry goods": "22222222-0000-0000-0000-000000000002",
  "lake side": "22222222-0000-0000-0000-000000000005",
  "grocery vendors": "22222222-0000-0000-0000-000000000003",
  "local vendors": "22222222-0000-0000-0000-000000000013"
};

// Section dividers and totals rows that are not vendors (same rule as v1: a divider with
// real money on it is a real vendor).
const DIVIDERS = new Set([
  "faith in the forest", "2026 new", "grand total", "reorder vendors", "clothing",
  "total", "order placed, waiting for confirmation", "need before may long weekend",
  "cancelled & corrections", "grocery vendors", "vendor company"
]);

const text = (v: any): string => (v === null || v === undefined) ? "" : String(v).trim();

// Money and quantities arrive as numbers when the cell is numeric and as text like
// "$3,089.04" when someone typed it; accept both.
function num(v: any): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,\s]/g, ""));
    if (v.trim() !== "" && isFinite(n)) return n;
  }
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

// One date out of a cell that may hold an Excel serial, "May 12th", "Jun 8, and July 10"
// (first date wins; the raw text is preserved in notes by the callers), or "04/22/2026".
export function dateISO(v: any, defaultYear = 2026): string | null {
  if (typeof v === "number" && isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = text(v);
  if (!s) return null;
  const named = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (named) {
    const m = MONTHS[named[1].toLowerCase()];
    const day = Number(named[2]);
    const yearM = s.match(/\b(20\d{2})\b/);
    const y = yearM ? Number(yearM[1]) : defaultYear;
    if (m && day >= 1 && day <= 31) return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const slash = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (slash) {
    const y = Number(slash[3].length === 2 ? "20" + slash[3] : slash[3]);
    const m = Number(slash[1]), d = Number(slash[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

// The owner's method spellings to the locked list. In strict mode (used on the terms cell,
// where "Net 30" is not a method) unrecognized text maps to null; on the method cell it maps
// to "other" and the raw wording is preserved in the payment notes by the caller.
export function methodFromText(s: string, strict = false): string | null {
  if (!s) return null;
  if (/cheque|check/i.test(s)) return "cheque";
  if (/visa/i.test(s)) return "cc_visa";
  if (/master/i.test(s)) return "cc_mastercard";
  if (/amex/i.test(s)) return "cc_amex";
  if (/debit/i.test(s)) return "cc_debit";
  if (/e-?transfer/i.test(s)) return "etransfer";
  if (/\beft\b/i.test(s)) return "eft";
  if (/cash/i.test(s)) return "cash";
  if (/credit card|\bcc\b/i.test(s)) return "cc";
  return strict ? null : "other";
}

// Filing cells: Digital, Physical, Digital/Physical; anything else ("CC Statment") is
// free text that lands in notes instead of the constrained column.
export function filingFromText(s: string): "digital" | "physical" | "both" | null {
  if (!s) return null;
  const hasD = /digital|email|e-?mail/i.test(s);
  const hasP = /physical|paper|binder|print/i.test(s);
  if (hasD && hasP) return "both";
  if (/\//.test(s) && /digital/i.test(s) && /physical/i.test(s)) return "both";
  if (hasD) return "digital";
  if (hasP) return "physical";
  return null;
}

function vendorStatus(s: string): "bankrupt" | "discontinue" | "skip" | "active" {
  if (/bankrupt|bankcrupt/i.test(s)) return "bankrupt";
  if (/discontinue/i.test(s)) return "discontinue";
  if (/skip/i.test(s)) return "skip";
  return "active";
}

function poStatus(orderStatus: string, deliveryStatus: string, shipText: string): "cancelled" | "received" | "ordered" {
  if (/cancel/i.test(orderStatus) || /cancel/i.test(shipText)) return "cancelled";
  if (/deliver|received/i.test(deliveryStatus)) return "received";
  return "ordered";
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Column resolution: normalize each header to lowercase alphanumerics, then match the
// normalized key. "OrderConirmationFiling Method" (the sheet's own typo), "Order
// confirmationFiling method", "Invoiced Amount" vs "InvoiceAmount" all land correctly.
type Cols = Partial<Record<
  "vendor" | "reorder" | "rep" | "phone" | "email" | "products" | "orderStatus" | "comments" |
  "orderFiling" | "amount" | "ship" | "deliveryStatus" | "deliveryComments" | "invoiceFiling" |
  "invAmount" | "terms" | "due" | "payStatus" | "payAmount" | "payDate" | "payMethod" |
  "payFiling" | "payComments" | "credit" | "priya" | "storeApp" | "payMonth" | "statusNote" | "runout",
  number
>>;

function resolveColumns(headerRow: any[]): Cols {
  const c: Cols = {};
  headerRow.forEach((raw, i) => {
    const k = text(raw).toLowerCase().replace(/[^a-z0-9]/g, "");
    const set = (name: keyof Cols) => { if (c[name] === undefined) c[name] = i; };
    if (k === "vendorcompany") set("vendor");
    else if (k === "reordervendors") set("reorder");
    else if (k === "repname") set("rep");
    else if (k.startsWith("contact")) set("phone");
    else if (k === "email") set("email");
    else if (k === "productswecarry") set("products");
    else if (k.startsWith("orderstatus")) set("orderStatus");
    else if (k === "comments") set("comments");
    else if (k.startsWith("ordercon") || k === "orderfiling") set("orderFiling"); // OrderCon(f)irmationFiling / Order Filing
    else if (k === "amount") set("amount");
    else if (k === "shipdate") set("ship");
    else if (k === "delivery") set("ship");                            // Grocery's ship column
    else if (k === "deliverystatus") set("deliveryStatus");
    else if (k === "deliverycomments") set("deliveryComments");
    else if (k.startsWith("finalinvoice") || k === "invoicefilingmethod") set("invoiceFiling");
    else if (k === "invoicedamount" || k === "invoiceamount") set("invAmount");
    else if (k === "terms") set("terms");
    else if (k === "duedate") set("due");
    else if (k === "paymentstatus") set("payStatus");
    else if (k === "paymentamount" || k === "payment") set("payAmount"); // "Payment$" and "Payment$$$" normalize to "payment"
    else if (k === "paymentdate") set("payDate");
    else if (k === "paymentmethod") set("payMethod");
    else if (k === "paymentconfirmationfiling" || k === "paymentfilingmethod") set("payFiling");
    else if (k === "paymentcomments") set("payComments");
    else if (k === "runout") set("runout");
    else if (k.startsWith("creditback")) set("credit");
    else if (k === "priyacomments") set("priya");
    else if (k === "storeapplication") set("storeApp");
    else if (k === "paymentmonth") set("payMonth");
    else if (k === "status") set("statusNote");
  });
  // Grocery has no "Vendor Company" header; its vendor names sit under a blank first header.
  if (c.vendor === undefined) c.vendor = 0;
  return c;
}

// True when any sheet carries the evolved layout's signature header.
export function looksLikeBookingsV2(sheets: { name: string; rows: any[][] }[]): boolean {
  return sheets.some((s) => {
    const dept = SHEET_DEPT[s.name.trim().toLowerCase()];
    if (!dept || !s.rows.length) return false;
    return (s.rows[0] || []).some((h) => {
      const k = text(h).toLowerCase().replace(/[^a-z0-9]/g, "");
      return k === "vendorcompany" || k === "paymentmethod" || k === "paymentconfirmationfiling";
    });
  });
}

export type ParsedVendorV2 = {
  id: string; store_id: string; department_id: string; name: string; rep_name: string;
  phone: string; email: string; products_we_carry: string; default_terms: string;
  status: "active" | "skip" | "discontinue" | "bankrupt"; notes: string;
};
export type ParsedOrderV2 = {
  id: string; store_id: string; vendor_id: string; department_id: string; season_year: number;
  order_amount: number; ship_date: string | null; status: "cancelled" | "received" | "ordered"; notes: string;
};
export type ParsedInvoiceV2 = {
  id: string; store_id: string; vendor_id: string; amount: number; hst_amount: number | null;
  terms: string; due_date: string | null; delivery_status: string | null;
  status: "paid" | "postdated" | "unpaid" | "partially_paid";
};
export type ParsedPaymentV2 = {
  id: string; invoice_id: string; amount: number; method: string | null;
  paid_date: string | null; reference: string | null; notes: string | null;
  confirmation_filing: "digital" | "physical" | "both" | null;
};
export type ParsedCreditV2 = {
  id: string; store_id: string; vendor_id: string; invoice_id: string | null;
  credit_amount: number; reason: string; comments: string | null; status: "pending";
};
export type ParsedNoteV2 = {
  id: string; store_id: string; department_id: string; topic: string; body: string; tags: string[];
};

export type PerSheetV2 = { sheet: string; vendors: number; orderSum: number; invSum: number; paySum: number; credits: number };

export type ParsedImportV2 = {
  vendors: ParsedVendorV2[];
  orders: ParsedOrderV2[];
  invoices: ParsedInvoiceV2[];
  payments: ParsedPaymentV2[];
  credits: ParsedCreditV2[];
  notes: ParsedNoteV2[];
  summary: {
    vendors: number; orders: number; invoices: number; payments: number; credits: number;
    notes: number; perSheet: PerSheetV2[];
  };
};

export function parseWorkbookV2(
  sheets: { name: string; rows: any[][] }[],
  storeId: string,
  defaultYear: number = new Date().getFullYear()
): ParsedImportV2 {
  const vendors: ParsedVendorV2[] = [];
  const orders: ParsedOrderV2[] = [];
  const invoices: ParsedInvoiceV2[] = [];
  const payments: ParsedPaymentV2[] = [];
  const credits: ParsedCreditV2[] = [];
  const notes: ParsedNoteV2[] = [];
  const perSheet: PerSheetV2[] = [];

  for (const sheet of sheets) {
    const sheetKey = sheet.name.trim().toLowerCase();

    // The AskingInventory wish list: one item per row, kept as reorder notes. Repeated
    // items dedupe here; the ids are deterministic, so a duplicate would abort the insert.
    if (sheetKey === "askinginventory") {
      const seenAsk = new Set<string>();
      for (let i = 0; i < sheet.rows.length; i++) {
        const row = sheet.rows[i] || [];
        const item = text(row[0]);
        if (!item) continue;
        if (seenAsk.has(item.toLowerCase())) continue;
        seenAsk.add(item.toLowerCase());
        // Side cells carry the owner's remarks ("Dont order more"); keep them with the item.
        const remark = row.slice(1).map(text).filter(Boolean).join(" | ");
        notes.push({
          id: uuid(`v2|ask|${item.toLowerCase()}`),
          store_id: storeId,
          department_id: SHEET_DEPT["dry goods"],
          topic: "Asking inventory: " + item,
          body: `${item}: on the owner's asking-inventory wish list from the bookings workbook.${remark ? ` Owner's remark: ${remark}` : ""}`,
          tags: ["reorder", "asking-inventory"]
        });
      }
      continue;
    }

    const dept = SHEET_DEPT[sheetKey];
    if (!dept || !sheet.rows.length) continue;
    const c = resolveColumns(sheet.rows[0] || []);
    const cell = (r: any[], k: keyof Cols) => (c[k] === undefined ? null : r[c[k] as number]);
    const ctext = (r: any[], k: keyof Cols) => text(cell(r, k));

    let orderSum = 0, invSum = 0, paySum = 0, creditCount = 0, vendorCount = 0;
    const seen = new Map<string, number>();

    for (let i = 1; i < sheet.rows.length; i++) {
      const r = sheet.rows[i] || [];
      const name = ctext(r, "vendor");
      const amount = num(cell(r, "amount"));
      const invAmount = num(cell(r, "invAmount"));
      if (name === "") continue;
      if (DIVIDERS.has(name.toLowerCase()) && amount === null && invAmount === null) continue;

      const seenKey = `${sheet.name}|${name.toLowerCase()}`;
      const occurrence = seen.get(seenKey) || 0;
      seen.set(seenKey, occurrence + 1);
      const dupSuffix = occurrence > 0 ? `|${occurrence}` : "";
      const vId = uuid(`v2|v|${sheet.name}|${name.toLowerCase()}`);

      const comments = ctext(r, "comments");
      const statusNote = ctext(r, "statusNote");
      const orderStatus = ctext(r, "orderStatus");
      const deliveryStatusText = ctext(r, "deliveryStatus");
      const deliveryComments = ctext(r, "deliveryComments");
      const terms = ctext(r, "terms");
      const priya = ctext(r, "priya");
      const storeApp = ctext(r, "storeApp");
      const reorderMark = ctext(r, "reorder");
      const runoutMark = ctext(r, "runout");
      const payComments = ctext(r, "payComments");
      const payStatusText = ctext(r, "payStatus");
      const payDateRaw = cell(r, "payDate");
      const payMonthText = ctext(r, "payMonth");
      const dueRaw = cell(r, "due");

      if (amount !== null) orderSum += amount;
      if (invAmount !== null) invSum += invAmount;

      if (occurrence === 0) {
        vendorCount++;
        vendors.push({
          id: vId,
          store_id: storeId,
          department_id: dept,
          name,
          rep_name: ctext(r, "rep"),
          phone: ctext(r, "phone"),
          email: ctext(r, "email"),
          products_we_carry: ctext(r, "products"),
          default_terms: terms,
          status: vendorStatus(`${comments} ${statusNote} ${orderStatus}`),
          notes: comments
        });
      }

      if (amount !== null) {
        const shipRaw = cell(r, "ship");
        const shipText = text(shipRaw);
        const orderFiling = ctext(r, "orderFiling");
        const poNotes = [
          deliveryComments,
          // A text ship cell like "April1,May1, june1" is a split shipment; keep the words.
          shipText && dateISO(shipRaw, defaultYear) === null ? `ship: ${shipText}` : (typeof shipRaw === "string" && /,|&|and/i.test(shipText) ? `ship: ${shipText}` : ""),
          orderFiling ? `confirmation filed: ${orderFiling}` : ""
        ].filter(Boolean).join(" | ");
        orders.push({
          id: uuid(`v2|po|${sheet.name}|${name.toLowerCase()}${dupSuffix}`),
          store_id: storeId,
          vendor_id: vId,
          department_id: dept,
          season_year: defaultYear,
          order_amount: amount,
          ship_date: dateISO(shipRaw, defaultYear),
          status: poStatus(orderStatus, deliveryStatusText, shipText),
          notes: poNotes
        });
      }

      // Paid detection scans every status-bearing cell; sheets encode it in different
      // places (PaymentStatus on Dry goods, the DueDate or PaymentDate cell on Lake side,
      // Payment Month / Status on Grocery).
      const paidScan = [payStatusText, text(dueRaw), payMonthText, statusNote, comments, text(payDateRaw)].join(" ");
      const paid = !/not\s*paid|not\s*yet/i.test(paidScan) && /\bpaid\b/i.test(paidScan);
      const partial = /partial/i.test(`${payStatusText} ${storeApp} ${priya}`);
      const postdated = /post-?\s*dated|post dated/i.test(`${terms} ${comments} ${storeApp} ${priya} ${statusNote}`);

      let invId: string | null = null;
      if (invAmount !== null) {
        invId = uuid(`v2|inv|${sheet.name}|${name.toLowerCase()}${dupSuffix}`);
        const delivered = /deliver|received/i.test(deliveryStatusText) ? "delivered"
          : deliveryStatusText ? "not_delivered" : null;
        // The inserted status is provisional (the engine trigger re-derives it from any
        // payment emitted below), but it must never claim what no payment backs:
        // post-dated only with a dated cheque behind it; a wordy "partial" with no
        // figure stays unpaid with the words kept in the vendor note.
        const pdcDatePeek = dateISO(cell(r, "payDate"), defaultYear) || dateISO(dueRaw, defaultYear);
        invoices.push({
          id: invId,
          store_id: storeId,
          vendor_id: vId,
          amount: invAmount,
          // The workbook carries no HST column: null means "refer to the actual invoice",
          // never 0 (which would assert a no-tax vendor the data cannot support).
          hst_amount: null,
          terms,
          due_date: dateISO(dueRaw, defaultYear),
          delivery_status: delivered,
          status: paid && !partial ? "paid"
            : (paid || partial) && num(cell(r, "payAmount")) !== null ? "partially_paid"
            : postdated && pdcDatePeek ? "postdated"
            : "unpaid"
        });
      }

      const methodText = ctext(r, "payMethod");
      const filingText = ctext(r, "payFiling");
      const filing = filingFromText(filingText);
      const payAmount = num(cell(r, "payAmount"));
      const pdcDate = dateISO(payDateRaw, defaultYear) || dateISO(dueRaw, defaultYear);

      // What the sheet says has actually been paid so far:
      //   fully paid       -> Payment$ if stated, else the invoice total
      //   "2 Partial ..."  -> ONLY the stated Payment$ (a missing figure must never
      //                       fabricate a full payment the sheet did not claim)
      const emitAmt = paid && !partial ? (payAmount !== null ? payAmount : (invAmount as number))
        : (paid || partial) ? payAmount
        : null;

      if (invId && emitAmt !== null && emitAmt > 0) {
        const payNotes = [
          payComments,
          partial ? "partial per the sheet" : "",
          methodText && methodFromText(methodText) === "other" ? `method: ${methodText}` : "",
          filingText && !filing ? `filing: ${filingText}` : "",
          text(payDateRaw) && dateISO(payDateRaw, defaultYear) === null ? `dates: ${text(payDateRaw)}` : "",
          /,|and|&/i.test(text(payDateRaw)) && typeof payDateRaw === "string" ? `dates: ${text(payDateRaw)}` : "",
          payStatusText && !/^paid$/i.test(payStatusText) ? `status: ${payStatusText}` : ""
        ].filter(Boolean);
        payments.push({
          id: uuid(`v2|pay|${sheet.name}|${name.toLowerCase()}${dupSuffix}`),
          invoice_id: invId,
          amount: round2(emitAmt),
          method: methodFromText(methodText) || methodFromText(terms, true),
          paid_date: dateISO(payDateRaw, defaultYear) || dateISO(payMonthText, defaultYear),
          reference: null,
          notes: [...new Set(payNotes)].join(" | ") || null,
          confirmation_filing: filing
        });
        paySum += emitAmt;
      } else if (invId && postdated && pdcDate) {
        // A post-dated cheque already written: emit the future-dated payment the engine
        // derives "postdated" from (a bare status would flip back to unpaid on reconcile).
        payments.push({
          id: uuid(`v2|pdc|${sheet.name}|${name.toLowerCase()}${dupSuffix}`),
          invoice_id: invId,
          amount: round2(payAmount !== null ? payAmount : (invAmount as number)),
          method: methodFromText(methodText) || "cheque",
          paid_date: pdcDate,
          reference: null,
          notes: "Post-dated per the bookings workbook",
          confirmation_filing: filing
        });
      }

      const creditAmount = num(cell(r, "credit"));
      if (creditAmount !== null && creditAmount > 0) {
        creditCount++;
        credits.push({
          id: uuid(`v2|credit|${sheet.name}|${name.toLowerCase()}${dupSuffix}`),
          store_id: storeId,
          vendor_id: vId,
          invoice_id: invId,
          credit_amount: round2(creditAmount),
          reason: "Credit back for damaged items",
          comments: deliveryComments || null,
          status: "pending"
        });
      }

      // Everything wordy lands in one knowledge note per row so no cell is lost. Runout
      // ("we ran out of this") and reorder marks both tag the note for the reorder screen.
      const noteBody = [
        comments && `Comments: ${comments}`,
        deliveryComments && `Delivery: ${deliveryComments}`,
        priya && `Priya: ${priya}`,
        storeApp && `Store application: ${storeApp}`,
        statusNote && `Status: ${statusNote}`,
        reorderMark && `Reorder: ${reorderMark}`,
        runoutMark && `Runout: ${runoutMark}`
      ].filter(Boolean).join(" | ");
      if (noteBody) {
        notes.push({
          id: uuid(`v2|note|${sheet.name}|${name.toLowerCase()}${dupSuffix}`),
          store_id: storeId,
          department_id: dept,
          topic: "Vendor: " + name,
          body: noteBody,
          tags: reorderMark || runoutMark ? ["vendor", "reorder"] : ["vendor"]
        });
      }
    }

    perSheet.push({
      sheet: sheet.name, vendors: vendorCount,
      orderSum: round2(orderSum), invSum: round2(invSum), paySum: round2(paySum), credits: creditCount
    });
  }

  return {
    vendors, orders, invoices, payments, credits, notes,
    summary: {
      vendors: vendors.length, orders: orders.length, invoices: invoices.length,
      payments: payments.length, credits: credits.length, notes: notes.length, perSheet
    }
  };
}
