import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { parseWorkbook } from "@/lib/importBookings";
import { parseSchedule, looksLikeSchedule } from "@/lib/importSchedule";

export const runtime = "nodejs";

// Insert in chunks so a large workbook does not exceed the request size. Counts are summed.
// sb is typed any: the installed supabase-js generics narrow .insert() to never[] otherwise.
async function insertChunks(
  sb: any,
  table: string,
  rows: any[]
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sb.from(table).insert(chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
    inserted += chunk.length;
  }
  return inserted;
}

// Load the weekly schedule workbook: upsert employees by name, then shifts deduped by
// (employee, date, start, end). Idempotent, so re-uploading the same week changes nothing and
// a changed cell adds the new shift without duplicating the unchanged ones.
async function importScheduleFlow(
  sb: any,
  sheets: { name: string; rows: any[][] }[],
  storeId: string,
  actorId: string | null
): Promise<Response> {
  // Map our departments by lowercased name so the parser can attach a department to each shift.
  const { data: depts } = await sb.from("department").select("id, name").eq("store_id", storeId);
  const deptMap: Record<string, string> = {};
  for (const d of (depts as any[]) || []) deptMap[String(d.name || "").toLowerCase()] = d.id;

  const parsed = parseSchedule(sheets, deptMap);

  // Employees: insert those not already on file (by name), then build a name -> id map.
  const readEmployees = async () => {
    const { data } = await sb.from("employee").select("id, full_name").eq("store_id", storeId).is("voided_at", null);
    const m = new Map<string, string>();
    for (const e of (data as any[]) || []) m.set(String(e.full_name || "").toLowerCase(), e.id);
    return m;
  };
  let byName = await readEmployees();
  const newEmpNames = parsed.employees.filter((n) => !byName.has(n.toLowerCase()));
  if (newEmpNames.length) {
    const rows = newEmpNames.map((full_name) => ({ store_id: storeId, full_name, status: "active" }));
    const { error } = await sb.from("employee").insert(rows);
    if (error) return Response.json({ ok: false, message: `employee: ${error.message}` }, { status: 200 });
    byName = await readEmployees();
  }

  // Dedupe shifts against what is already on file for these employees.
  const empIds = [...byName.values()];
  const existingKeys = new Set<string>();
  if (empIds.length) {
    const { data: ex } = await sb.from("shift").select("employee_id, work_date, start_time, end_time").in("employee_id", empIds);
    for (const s of (ex as any[]) || []) {
      existingKeys.add(`${s.employee_id}|${s.work_date}|${String(s.start_time).slice(0, 5)}|${String(s.end_time).slice(0, 5)}`);
    }
  }

  const shiftRows: any[] = [];
  let skipped = 0;
  for (const s of parsed.shifts) {
    const empId = byName.get(s.employeeName.toLowerCase());
    if (!empId) { skipped++; continue; }
    const key = `${empId}|${s.workDate}|${s.startTime}|${s.endTime}`;
    if (existingKeys.has(key)) { skipped++; continue; }
    existingKeys.add(key);
    shiftRows.push({
      employee_id: empId,
      department_id: s.departmentId,
      work_date: s.workDate,
      start_time: s.startTime,
      end_time: s.endTime,
      notes: s.departmentId ? null : s.departmentKey,
      created_by: actorId
    });
  }
  const insertedShifts = await insertChunks(sb, "shift", shiftRows);

  return Response.json({
    ok: true,
    kind: "schedule",
    message: `Loaded ${newEmpNames.length} new employees and ${insertedShifts} shifts across ${parsed.summary.weeks} weeks. Skipped ${skipped} shifts already on file.`,
    summary: { weeks: parsed.summary.weeks, employees: parsed.summary.employees, shifts: parsed.summary.shifts, firstDate: parsed.summary.firstDate, lastDate: parsed.summary.lastDate },
    inserted: { employees: newEmpNames.length, shifts: insertedShifts },
    skippedShifts: skipped
  });
}

// Upload the 2026 bookings workbook and load the full vendor ledger into a store.
// Idempotent by vendor name: a vendor already present (case-insensitive) is skipped along
// with all of its children, so the import is safe to re-run. Returns ok:false with status
// 200 on parse or database errors so the UI can show the message instead of crashing.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    let storeId = String(form.get("store_id") || "");
    const actorIdPosted = form.get("actor_id") ? String(form.get("actor_id")) : null;

    if (!file || typeof (file as any).arrayBuffer !== "function") {
      return Response.json({ ok: false, message: "No file was uploaded." }, { status: 200 });
    }
    if (!storeId) {
      return Response.json({ ok: false, message: "No store was selected." }, { status: 200 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return Response.json({ ok: false, message: "Supabase env is not set." }, { status: 200 });
    }
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
    // When a member token is present without a service key, run every call as that member so the
    // per-store RLS policies apply (import works in enforced auth with just the anon key). With a
    // service key the header is harmless; in demo mode there is no token and the dev policies apply.
    const sb = createClient(url, key, {
      auth: { persistSession: false },
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
    });

    // Auth gate. When a bearer token is present, verify it and require an owner or manager,
    // then force the import to the caller's own store. Without a token we are in demo mode and
    // trust the posted store_id (the dev RLS policies already allow the anon key).
    let actorId = actorIdPosted;
    if (token) {
      const { data: userData, error: userErr } = await sb.auth.getUser(token);
      if (userErr || !userData?.user) {
        return Response.json({ ok: false, message: "Your session is not valid. Please sign in again." }, { status: 403 });
      }
      const { data: member } = await sb
        .from("app_user")
        .select("id, role, store_id")
        .eq("auth_id", userData.user.id)
        .maybeSingle();
      const role = (member as any)?.role;
      if (!member || (role !== "owner" && role !== "manager")) {
        return Response.json({ ok: false, message: "Only an owner or manager can import the bookings sheet." }, { status: 403 });
      }
      // Force the caller's own store and attribute the import to the signed-in member.
      storeId = (member as any).store_id || storeId;
      actorId = (member as any).id || null;
    }

    // Read the workbook into per-sheet header:1 row arrays, then parse with the shared module.
    const buf = Buffer.from(await (file as Blob).arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheets = wb.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: null }) as any[][]
    }));
    // Route by file type. The weekly schedule has day-name rows and time+name cells; the
    // bookings ledger has the Vendor and Amount columns. Detect and send to the right loader.
    if (looksLikeSchedule(sheets)) {
      return await importScheduleFlow(sb, sheets, storeId, actorId);
    }

    const parsed = parseWorkbook(sheets, storeId);

    // Idempotent upsert: keep only vendors whose name is not already in the store.
    const { data: existing, error: exErr } = await sb.from("vendor").select("name").eq("store_id", storeId);
    if (exErr) {
      return Response.json({ ok: false, message: `Could not read existing vendors: ${exErr.message}` }, { status: 200 });
    }
    const present = new Set(((existing as any[]) || []).map((v) => String(v.name || "").toLowerCase()));

    const newVendors = parsed.vendors.filter((v) => !present.has(v.name.toLowerCase()));
    const newVendorIds = new Set(newVendors.map((v) => v.id));
    const skippedVendors = parsed.vendors.length - newVendors.length;

    // Children of new vendors only. Invoices first so payments can reference them.
    const newInvoices = parsed.invoices.filter((inv) => newVendorIds.has(inv.vendor_id));
    const newInvoiceIds = new Set(newInvoices.map((inv) => inv.id));
    const newOrders = parsed.orders.filter((o) => newVendorIds.has(o.vendor_id));
    const newPayments = parsed.payments.filter((p) => newInvoiceIds.has(p.invoice_id));
    // A note has no vendor_id, but it shares its department and "Vendor: <name>" topic with the
    // vendor that produced it. Match notes to new vendors by that (department, name) pair.
    const newVendorKeys = new Set(
      newVendors.map((v) => `${v.department_id}|${v.name.toLowerCase()}`)
    );
    const newNotes = parsed.notes.filter((n) => {
      const name = n.topic.replace(/^Vendor:\s*/, "").toLowerCase();
      return newVendorKeys.has(`${n.department_id}|${name}`);
    });

    // The API attaches created_by to orders, payments, and notes (invoice has no such column).
    const ordersOut = newOrders.map((o) => ({ ...o, created_by: actorId }));
    const paymentsOut = newPayments.map((p) => ({ ...p, created_by: actorId }));
    const notesOut = newNotes.map((n) => ({ ...n, created_by: actorId }));

    const insertedVendors = await insertChunks(sb, "vendor", newVendors);
    const insertedOrders = await insertChunks(sb, "purchase_order", ordersOut);
    const insertedInvoices = await insertChunks(sb, "invoice", newInvoices);
    const insertedPayments = await insertChunks(sb, "payment", paymentsOut);
    const insertedNotes = await insertChunks(sb, "knowledge_note", notesOut);

    return Response.json({
      ok: true,
      kind: "bookings",
      message: `Loaded ${insertedVendors} new vendors, ${insertedOrders} orders, ${insertedInvoices} invoices, ${insertedPayments} payments, and ${insertedNotes} notes. Skipped ${skippedVendors} vendors already in this store.`,
      summary: parsed.summary,
      inserted: {
        vendors: insertedVendors,
        orders: insertedOrders,
        invoices: insertedInvoices,
        payments: insertedPayments,
        notes: insertedNotes
      },
      skippedVendors
    });
  } catch (err: any) {
    return Response.json({ ok: false, message: err?.message || "Import failed." }, { status: 200 });
  }
}
