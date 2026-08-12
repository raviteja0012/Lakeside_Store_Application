import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { REQUIRE_AUTH_SERVER } from "@/lib/serverMember";
import { invoiceTotal } from "@/lib/payments";

export const runtime = "nodejs";
// Run in Montreal, not the default iad1 (Washington DC). The Supabase project is in
// Toronto, so this keeps the store's vendor, payment and staff data being processed in
// Canada rather than crossing the border on every request, and it is the nearest region
// to the database, which Vercel recommends for latency.
export const preferredRegion = "yul1";

// Due-date alerts. Selects unpaid invoices that are overdue or due within 7 days and emails a
// short summary via Resend. Designed to run on a daily Vercel cron (see vercel.json).
// - Missing RESEND_API_KEY returns 200 with a clear message; it never crashes the cron.
// - Protected by CRON_SECRET checked against the x-cron-secret header (Vercel cron sends it via
//   the Authorization: Bearer header, which is accepted too). If CRON_SECRET is unset, the route
//   only runs open in demo mode; with login enforced it fails closed, because the response and
//   the email hold invoice dollar totals.

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return !REQUIRE_AUTH_SERVER; // open only for demo and local first-run testing
  const header = req.headers.get("x-cron-secret");
  const bearer = req.headers.get("authorization");
  return header === secret || bearer === `Bearer ${secret}`;
}

// The cron has no user session, so once the production RLS is on, the anon client reads zero
// rows and the alert would silently report nothing due. Use the service role when it is set
// (it already is for the Team page); fall back to the anon client for the open demo.
function alertsClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) return createClient(url, serviceKey, { auth: { persistSession: false } });
  return supabase;
}

const ms = (d: string) => Date.parse(d + "T00:00:00Z");

async function run(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized. Set CRON_SECRET and send it as x-cron-secret." }, { status: 401 });
  }

  // Pull open invoices (unpaid or partially paid) with a due date and split into overdue
  // and due within 7 days. Post-dated invoices are excluded: a cheque already covers them.
  const db = alertsClient();
  const { data, error } = await db
    .from("invoice")
    .select("id, invoice_number, amount, hst_amount, freight_charges, tax_mode, due_date, vendor:vendor_id(name), store:store_id(name)")
    .in("status", ["unpaid", "partially_paid"])
    .is("voided_at", null)
    .not("due_date", "is", null)
    .order("due_date", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const todayMs = ms(todayISO);

  // Settled allocations per invoice, so a partially paid invoice alerts on what is left.
  const rows = (data as any[]) || [];
  const settled = new Map<string, number>();
  const ids = rows.map((i) => i.id);
  for (let n = 0; n < ids.length; n += 200) {
    const chunk = ids.slice(n, n + 200);
    const { data: allocs } = await db
      .from("payment_allocation")
      .select("invoice_id, amount, payment:payment_id(paid_date, voided_at)")
      .in("invoice_id", chunk);
    for (const a of ((allocs as any[]) || [])) {
      if (!a.payment || a.payment.voided_at) continue;
      if (a.payment.paid_date && ms(a.payment.paid_date) > todayMs) continue; // post-dated, not settled yet
      settled.set(a.invoice_id, (settled.get(a.invoice_id) || 0) + (Number(a.amount) || 0));
    }
  }

  const overdue: any[] = [];
  const dueSoon: any[] = [];
  for (const i of rows) {
    const days = Math.round((todayMs - ms(i.due_date)) / 86400000);
    const total = invoiceTotal(i);
    const remaining = Math.max(0, total - (settled.get(i.id) || 0));
    if (remaining <= 0.005) continue;
    const row = { name: i.vendor?.name || "Vendor", number: i.invoice_number || "", due: i.due_date, total: remaining, days, store: i.store?.name || "" };
    if (days > 0) overdue.push(row);
    else if (days >= -7) dueSoon.push(row);
  }

  const count = overdue.length + dueSoon.length;
  const fmt = (n: number) => n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
  const owed = [...overdue, ...dueSoon].reduce((s, r) => s + r.total, 0);

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM;
  const to = process.env.ALERT_EMAIL_TO;

  if (!resendKey || !from || !to) {
    return NextResponse.json({
      sent: false,
      message: "Email is off. Set RESEND_API_KEY, ALERT_EMAIL_FROM, and ALERT_EMAIL_TO to send the daily alert.",
      counts: { overdue: overdue.length, dueSoon: dueSoon.length, owed }
    });
  }

  if (count === 0) {
    return NextResponse.json({ sent: false, message: "Nothing overdue or due within 7 days. No email sent.", counts: { overdue: 0, dueSoon: 0, owed: 0 } });
  }

  const line = (r: any) => `  - ${r.store ? `[${r.store}] ` : ""}${r.name}${r.number ? ` (${r.number})` : ""}: ${fmt(r.total)}, due ${r.due}${r.days > 0 ? ` (${r.days} days overdue)` : r.days === 0 ? " (due today)" : ` (in ${-r.days} days)`}`;
  const textParts: string[] = [`Robinsons General Store payment alert for ${todayISO}.`, `${count} invoice${count === 1 ? "" : "s"}, ${fmt(owed)} owed.`];
  if (overdue.length) textParts.push(`\nOverdue (${overdue.length}):`, overdue.map(line).join("\n"));
  if (dueSoon.length) textParts.push(`\nDue within 7 days (${dueSoon.length}):`, dueSoon.map(line).join("\n"));
  const text = textParts.join("\n");

  const subject = `Robinsons: ${overdue.length} overdue, ${dueSoon.length} due soon (${fmt(owed)})`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${resendKey}`,
      // Resend rejects a request with no User-Agent as 403. A server runtime does not
      // necessarily set one, and a 403 here looked exactly like every other failure
      // because of the status bug fixed just below.
      "user-agent": "robinsons-store/1.0 (+https://app.robinsonsgeneralstore.ca)"
    },
    body: JSON.stringify({ from, to: to.split(",").map((s) => s.trim()), subject, text })
  });

  if (!resp.ok) {
    const detail = await resp.text();
    // This used to return HTTP 200 with sent:false. The Vercel cron reads 200 as success,
    // so the one daily push telling the owner what the store owes could stop arriving and
    // nothing anywhere would say so. A failed send is now a failed request, which the cron
    // records and the post-deploy watchdog can see.
    return NextResponse.json(
      { sent: false, error: "resend call failed", detail: detail.slice(0, 300) },
      { status: 502 }
    );
  }

  return NextResponse.json({ sent: true, counts: { overdue: overdue.length, dueSoon: dueSoon.length, owed } });
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
