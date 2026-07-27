import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { parseWorkbook } from "@/lib/importBookings";
import { parseWorkbookV2, looksLikeBookingsV2 } from "@/lib/importBookingsV2";
import { parseSchedule, looksLikeSchedule } from "@/lib/importSchedule";
import { parseInventory } from "@/lib/importInventory";
import { REQUIRE_AUTH_SERVER } from "@/lib/serverMember";

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

// Load a category inventory workbook: upsert items by SKU (falling back to name), then post
// one dated inventory count holding every line. Idempotent by file name: the same workbook
// loads once; re-uploading it reports the existing count instead of duplicating it.
async function importInventoryFlow(
  sb: any,
  sheets: { name: string; rows: any[][] }[],
  fileName: string,
  storeId: string,
  actorId: string | null,
  departmentId: string | null
): Promise<Response> {
  const parsed = parseInventory(sheets);
  const sourceLabel = `import:${fileName}`;

  const { data: existingCount } = await sb
    .from("inventory_count")
    .select("id, counted_date")
    .eq("store_id", storeId)
    .eq("source_file_path", sourceLabel)
    .is("voided_at", null)
    .maybeSingle();
  if (existingCount) {
    return Response.json({
      ok: true,
      kind: "inventory",
      message: `This workbook was already loaded as a count on ${existingCount.counted_date}. Nothing was changed. To load it again as a new count, rename the file (for example add the date) and re-upload.`,
      inserted: { items: 0, lines: 0 },
      summary: { perSheet: parsed.perSheet }
    });
  }

  // Default the department to Hardware when none was picked; every inventory sheet in the
  // Drive today is a Hardware category sheet.
  let deptId = departmentId;
  if (!deptId) {
    const { data: hw } = await sb.from("department").select("id").eq("store_id", storeId).ilike("name", "hardware").maybeSingle();
    deptId = hw?.id || null;
  }

  // Upsert items: match existing ones by SKU first, then by name, within the store.
  const { data: existingItems } = await sb.from("item").select("id, sku, name").eq("store_id", storeId);
  const bySku = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const it of (existingItems as any[]) || []) {
    if (it.sku) bySku.set(String(it.sku).toLowerCase(), it.id);
    if (it.name) byName.set(String(it.name).toLowerCase(), it.id);
  }
  const resolveItem = (l: { sku: string | null; name: string }) =>
    (l.sku && bySku.get(l.sku.toLowerCase())) || byName.get(l.name.toLowerCase()) || null;

  const newItems: any[] = [];
  const seenNew = new Set<string>();
  for (const l of parsed.lines) {
    if (resolveItem(l)) continue;
    const key = (l.sku || l.name).toLowerCase();
    if (seenNew.has(key)) continue;
    seenNew.add(key);
    newItems.push({ store_id: storeId, department_id: deptId, sku: l.sku, name: l.name });
  }
  const insertedItems = await insertChunks(sb, "item", newItems);

  // Re-read so every line can resolve to an item id, including the ones just created.
  const { data: allItems } = await sb.from("item").select("id, sku, name").eq("store_id", storeId);
  bySku.clear();
  byName.clear();
  for (const it of (allItems as any[]) || []) {
    if (it.sku) bySku.set(String(it.sku).toLowerCase(), it.id);
    if (it.name) byName.set(String(it.name).toLowerCase(), it.id);
  }

  const counted_date = new Date().toISOString().slice(0, 10);
  const ev = await sb
    .from("inventory_count")
    .insert({ store_id: storeId, department_id: deptId, counted_date, source_file_path: sourceLabel, created_by: actorId })
    .select("id")
    .single();
  if (ev.error) return Response.json({ ok: false, message: `count: ${ev.error.message}` }, { status: 200 });
  const countId = ev.data.id as string;

  const lineRows = parsed.lines
    .map((l) => ({ inventory_count_id: countId, item_id: resolveItem(l), counted_qty: l.qty, notes: l.note }))
    .filter((r) => r.item_id);
  let insertedLines = 0;
  let notesDropped = false;
  try {
    insertedLines = await insertChunks(sb, "inventory_count_line", lineRows);
  } catch (e: any) {
    // A live database from before the notes column exists: load without notes rather than
    // failing the whole import, and say exactly which migration adds them.
    if (String(e?.message || "").includes("notes")) {
      notesDropped = true;
      insertedLines = await insertChunks(sb, "inventory_count_line", lineRows.map(({ notes: _n, ...r }) => r));
    } else {
      throw e;
    }
  }

  await sb.from("activity_log").insert({ actor_id: actorId, action: "imported", entity: "inventory_count", entity_id: countId });

  const skipped = parsed.perSheet.reduce((s, p) => s + p.skipped, 0);
  return Response.json({
    ok: true,
    kind: "inventory",
    message:
      `Loaded ${insertedLines} count lines (${insertedItems} new items) as the ${counted_date} count.` +
      (skipped ? ` Skipped ${skipped} rows that had no product on them (section labels and blanks).` : "") +
      (notesDropped ? " Line notes (FAST/SLOW flags, overstock locations) were skipped: run supabase/edit_delete.sql once to add the notes column, then re-upload under a new file name to keep them." : ""),
    inserted: { items: insertedItems, lines: insertedLines },
    summary: { perSheet: parsed.perSheet }
  });
}

// Load the owner's EVOLVED bookings layout (header-named columns, payment and credit
// detail). Same idempotency rule as the original ledger: vendors already in the store
// (by name, case-insensitive) are skipped along with all their children, so re-running
// the import over a live database never duplicates or double-pays anything.
async function importBookingsV2Flow(
  sb: any,
  sheets: { name: string; rows: any[][] }[],
  storeId: string,
  actorId: string | null
): Promise<Response> {
  const parsed = parseWorkbookV2(sheets, storeId);
  if (!parsed.vendors.length) {
    return Response.json({ ok: false, message: "The workbook looked like the bookings ledger but no vendor rows were found." }, { status: 200 });
  }

  const { data: existing, error: exErr } = await sb.from("vendor").select("id, name").eq("store_id", storeId);
  if (exErr) {
    return Response.json({ ok: false, message: `Could not read existing vendors: ${exErr.message}` }, { status: 200 });
  }
  const present = new Map(((existing as any[]) || []).map((v) => [String(v.name || "").toLowerCase(), v.id as string]));

  const newVendors = parsed.vendors.filter((v) => !present.has(v.name.toLowerCase()));
  const newVendorIds = new Set(newVendors.map((v) => v.id));
  const skippedVendors = parsed.vendors.length - newVendors.length;

  const newInvoices = parsed.invoices.filter((inv) => newVendorIds.has(inv.vendor_id));
  const newInvoiceIds = new Set(newInvoices.map((inv) => inv.id));
  const newOrders = parsed.orders.filter((o) => newVendorIds.has(o.vendor_id));
  const newPayments = parsed.payments.filter((p) => newInvoiceIds.has(p.invoice_id));

  // Credits load for EVERY vendor in the workbook, not just new ones: the live store was
  // first loaded by the original importer, so its vendors carry different ids. A credit for
  // an already-present vendor remaps onto that vendor's real id and drops the invoice link
  // (that invoice was not inserted this run). The deterministic credit ids make the whole
  // thing idempotent: anything already on file is filtered out below.
  const vendorNameById = new Map(parsed.vendors.map((v) => [v.id, v.name.toLowerCase()]));
  const creditCandidates = parsed.credits
    .map((cr) => {
      if (newVendorIds.has(cr.vendor_id)) return cr;
      const liveVendorId = present.get(vendorNameById.get(cr.vendor_id) || "");
      if (!liveVendorId) return null;
      return { ...cr, vendor_id: liveVendorId, invoice_id: cr.invoice_id && newInvoiceIds.has(cr.invoice_id) ? cr.invoice_id : null };
    })
    .filter(Boolean) as typeof parsed.credits;
  let creditsTableMissing = false;
  let existingCreditIds = new Set<string>();
  if (creditCandidates.length) {
    const probe = await sb.from("credit_note").select("id").in("id", creditCandidates.map((c) => c.id));
    if (probe.error) {
      // Only a missing table (database from before credit_notes.sql) is recoverable by the
      // advertised "run the script, re-upload" path; anything else is a real failure.
      if (/credit_note/.test(probe.error.message) && /does not exist|schema cache/i.test(probe.error.message)) {
        creditsTableMissing = true;
      } else {
        return Response.json({ ok: false, message: `credit_note: ${probe.error.message}` }, { status: 200 });
      }
    } else {
      existingCreditIds = new Set(((probe.data as any[]) || []).map((r) => r.id as string));
    }
  }
  const newCredits = creditsTableMissing ? [] : creditCandidates.filter((c) => !existingCreditIds.has(c.id));

  // Notes: vendor-keyed ones follow their (new) vendor; the AskingInventory wish list is
  // store-wide with deterministic ids, so it dedupes against what is already on file.
  const askNotes = parsed.notes.filter((n) => n.topic.startsWith("Asking inventory:"));
  let existingAskIds = new Set<string>();
  if (askNotes.length) {
    const { data: exAsk } = await sb.from("knowledge_note").select("id").in("id", askNotes.map((n) => n.id));
    existingAskIds = new Set(((exAsk as any[]) || []).map((r) => r.id as string));
  }
  const newVendorKeys = new Set(newVendors.map((v) => `${v.department_id}|${v.name.toLowerCase()}`));
  const newNotes = parsed.notes.filter((n) => {
    if (n.topic.startsWith("Asking inventory:")) return !existingAskIds.has(n.id);
    const name = n.topic.replace(/^Vendor:\s*/, "").toLowerCase();
    return newVendorKeys.has(`${n.department_id}|${name}`);
  });

  const ordersOut = newOrders.map((o) => ({ ...o, created_by: actorId }));
  const paymentsOut = newPayments.map((p) => ({ ...p, created_by: actorId }));
  const creditsOut = newCredits.map((cr) => ({ ...cr, created_by: actorId }));
  const notesOut = newNotes.map((n) => ({ ...n, created_by: actorId }));

  const insertedVendors = await insertChunks(sb, "vendor", newVendors);
  const insertedOrders = await insertChunks(sb, "purchase_order", ordersOut);
  const insertedInvoices = await insertChunks(sb, "invoice", newInvoices);
  const insertedPayments = await insertChunks(sb, "payment", paymentsOut);
  const insertedCredits = creditsTableMissing ? 0 : await insertChunks(sb, "credit_note", creditsOut);
  const insertedNotes = await insertChunks(sb, "knowledge_note", notesOut);

  return Response.json({
    ok: true,
    kind: "bookings_v2",
    message:
      `Loaded ${insertedVendors} new vendors, ${insertedOrders} orders, ${insertedInvoices} invoices, ` +
      `${insertedPayments} payments, ${insertedCredits} credits, and ${insertedNotes} notes from the updated ledger. ` +
      `Skipped ${skippedVendors} vendors already in this store.` +
      (creditsTableMissing ? " Credits were skipped because the credit_note table is not set up yet: run supabase/credit_notes.sql once, then re-upload this same file and the credits will load (everything else stays skipped as already-loaded)." : ""),
    summary: parsed.summary,
    inserted: {
      vendors: insertedVendors, orders: insertedOrders, invoices: insertedInvoices,
      payments: insertedPayments, credits: insertedCredits, notes: insertedNotes
    },
    skippedVendors
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
    // With login enforced, a token is mandatory. Without this, an anonymous caller could skip
    // the owner/manager gate below and still write through the service-role key.
    if (REQUIRE_AUTH_SERVER && !token) {
      return Response.json({ ok: false, message: "Sign in as an owner or manager to import." }, { status: 401 });
    }
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
    // bookings ledger has the known department sheet names; an inventory workbook has
    // SKU/description/stock headers. Detect in that order and send to the right loader.
    if (looksLikeSchedule(sheets)) {
      return await importScheduleFlow(sb, sheets, storeId, actorId);
    }

    // The evolved ledger layout (named headers like Vendor Company / PaymentMethod) gets
    // the header-driven parser; the original fixed-position layout still goes through v1.
    if (looksLikeBookingsV2(sheets)) {
      return await importBookingsV2Flow(sb, sheets, storeId, actorId);
    }

    const parsed = parseWorkbook(sheets, storeId);
    if (!parsed.vendors.length) {
      const inv = parseInventory(sheets);
      if (inv.lines.length) {
        const fileName = (file as any).name ? String((file as any).name) : "workbook.xlsx";
        const departmentId = form.get("department_id") ? String(form.get("department_id")) : null;
        return await importInventoryFlow(sb, sheets, fileName, storeId, actorId, departmentId);
      }
      return Response.json({
        ok: false,
        message: "This workbook was not recognized. It handles four shapes: the 2026 bookings ledger (original or updated layout), the weekly schedule, and category inventory sheets (SKU, description, stock)."
      }, { status: 200 });
    }

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
