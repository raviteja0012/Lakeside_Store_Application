import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { invoiceTotal, settlementByInvoice, isFutureDate, type AllocationRow } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What the app checks about itself after every deploy.
//
// A build going green only proves the code compiled. This route proves the deployed app and
// the deployed database still agree about money, which is the thing that actually matters
// here and the thing a type-checker cannot see. The post-deploy watchdog reads it and
// raises a ticket when a check fails, so a bad release is found by the machine rather than
// by the owner noticing a wrong number a week later.
//
// It never returns a dollar figure. Without CRON_SECRET it answers pass/fail per check;
// with the secret it adds counts, so the response is safe to call from anywhere.

type Check = { name: string; ok: boolean; detail?: string; count?: number };

function healthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // The service role sees every row once RLS is on; the anon client is the demo fallback.
  if (url && serviceKey) return createClient(url, serviceKey, { auth: { persistSession: false } });
  return supabase;
}

function detailed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("x-cron-secret") === secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

// The status the engine would derive right now, mirroring recompute_invoice_status.
function deriveStatus(total: number, settled: number, scheduled: number): string {
  if (total <= 0) return settled + scheduled > 0 ? "paid" : "unpaid";
  if (settled >= total) return "paid";
  if (settled + scheduled >= total) return "postdated";
  if (settled + scheduled > 0) return "partially_paid";
  return "unpaid";
}

export async function GET(req: NextRequest) {
  const checks: Check[] = [];
  const full = detailed(req);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    // Blank env is a valid state for this app (the build must pass without it), so say so
    // plainly rather than reporting a failure the owner cannot act on.
    return NextResponse.json({ ok: true, configured: false, checks: [], note: "No database configured. Nothing to check." });
  }

  const db = healthClient();

  // 1. The database answers at all.
  try {
    const { error } = await db.from("invoice").select("id", { count: "exact", head: true }).limit(1);
    checks.push({ name: "database reachable", ok: !error, detail: error?.message });
  } catch (e: any) {
    checks.push({ name: "database reachable", ok: false, detail: e?.message });
  }

  // 2. The money rule in the database matches the one in the app. A tax-included invoice of
  // 113 with 13 of embedded HST owes 113, not 126. If the migration was skipped or someone
  // edited one side only, this is where it shows up.
  try {
    const { data, error } = await db.rpc("invoice_owed_total", {
      p_amount: 113, p_freight: 0, p_hst: 13, p_tax_mode: "included"
    });
    const fromDb = Number(data);
    const fromApp = invoiceTotal({ amount: 113, hst_amount: 13, freight_charges: 0, tax_mode: "included" });
    checks.push({
      name: "database and app agree on what an invoice owes",
      ok: !error && fromDb === fromApp,
      detail: error ? error.message : fromDb === fromApp ? undefined : `database says ${fromDb}, app says ${fromApp}`
    });
  } catch (e: any) {
    checks.push({ name: "database and app agree on what an invoice owes", ok: false, detail: e?.message });
  }

  // 3. The payments engine is installed. Calling recompute on an id that cannot exist is a
  // no-op, so this proves the function is there without touching a real invoice.
  try {
    const { error } = await db.rpc("recompute_invoice_status", { p_invoice_id: "00000000-0000-0000-0000-000000000000" });
    checks.push({ name: "payments engine installed", ok: !error, detail: error?.message });
  } catch (e: any) {
    checks.push({ name: "payments engine installed", ok: false, detail: e?.message });
  }

  // 4. No invoice is showing a status that disagrees with its own payments. This is the
  // check that catches a bad release: if a deploy breaks the total, statuses drift.
  try {
    const { data: inv, error: invErr } = await db
      .from("invoice")
      .select("id, amount, hst_amount, freight_charges, tax_mode, status")
      .is("voided_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (invErr) throw new Error(invErr.message);

    const rows = (inv as any[]) || [];
    const ids = rows.map((r) => r.id);
    let drift = 0;
    if (ids.length) {
      const { data: allocs, error: aErr } = await db
        .from("payment_allocation")
        .select("invoice_id, amount, payment:payment_id(paid_date, voided_at)")
        .in("invoice_id", ids);
      if (aErr) throw new Error(aErr.message);
      const settlements = settlementByInvoice(((allocs as unknown) as AllocationRow[]) || []);
      for (const r of rows) {
        const s = settlements.get(r.id) || { settled: 0, scheduled: 0 };
        const expected = deriveStatus(invoiceTotal(r), s.settled, s.scheduled);
        if (expected !== r.status) drift++;
      }
    }
    checks.push({
      name: "invoice statuses match their payments",
      ok: drift === 0,
      count: drift,
      detail: drift ? `${drift} of ${rows.length} recent invoices disagree with their payments` : undefined
    });
  } catch (e: any) {
    checks.push({ name: "invoice statuses match their payments", ok: false, detail: e?.message });
  }

  // 5. The columns the current release needs actually exist. A missing migration is the
  // most common way a good deploy still breaks the forms.
  try {
    const { error } = await db.from("invoice").select("tax_mode, delivered_date, delivery_comments").limit(1);
    checks.push({ name: "invoice columns present", ok: !error, detail: error?.message });
  } catch (e: any) {
    checks.push({ name: "invoice columns present", ok: false, detail: e?.message });
  }
  try {
    const { error } = await db.from("purchase_order").select("order_filing").limit(1);
    checks.push({ name: "order columns present", ok: !error, detail: error?.message });
  } catch (e: any) {
    checks.push({ name: "order columns present", ok: false, detail: e?.message });
  }

  const ok = checks.every((c) => c.ok);
  const body = full
    ? { ok, configured: true, checks }
    : { ok, configured: true, checks: checks.map((c) => ({ name: c.name, ok: c.ok })) };
  // Always 200: the watchdog reads `ok`, and a non-200 would be indistinguishable from the
  // site being down, which is a different problem with a different fix.
  return NextResponse.json(body);
}
