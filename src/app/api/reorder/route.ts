import { NextRequest, NextResponse } from "next/server";
import { resolveMember, memberSeesMoney } from "@/lib/serverMember";
import { plainText } from "@/lib/aiText";
import { minimumOrderLabel, orderLocationLabel } from "@/lib/vendorOrdering";

export const runtime = "nodejs";

const CURRENT_SEASON = new Date().getFullYear();

// Reorder summary. Pulls the same order ledger and knowledge notes the /reorder screen uses
// and asks the model to summarize the likely reorders. Mirrors /api/ask: no-op (200 with a
// clear message) when ANTHROPIC_API_KEY is missing, so the screen never crashes.
// The summary quotes order amounts, so in enforced mode it is limited to money roles.
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    if (!apiKey) {
      return NextResponse.json({ message: "AI summary is off. Set ANTHROPIC_API_KEY to enable it. The formula-based list above still works." });
    }

    const resolved = await resolveMember(req);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }
    const { client: db, member } = resolved;
    if (member && !memberSeesMoney(member.role)) {
      return NextResponse.json({ error: "The reorder summary quotes order amounts, so it needs a lead, manager, or owner login." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const storeId: string | null = member?.store_id || body?.store_id || null;
    // The ordering profile is what the buyer needs before placing an order, so the summary
    // that suggests orders has to see it. Without these columns it could suggest an order
    // under a vendor's stated minimum, or miss that the summer order is already overdue.
    // No money gate is applied per field here: the route already returned 403 above for any
    // role that cannot see money, so everything past that point is money-visible.
    const scopeVendor = db.from("vendor").select("name, status, default_terms, notes, minimum_order_amount, no_minimum_order, summer_order_timeline, order_location, order_location_other, reorder_status, reorder_comments, department:department_id(name)").is("voided_at", null);
    const scopePo = db.from("purchase_order").select("vendor_id, order_amount, ship_date, season_year, status, vendor:vendor_id(name)").is("voided_at", null);
    const scopeNote = db.from("knowledge_note").select("topic, body, tags").is("voided_at", null);
    const [vendors, pos, notes] = await Promise.all([
      storeId ? scopeVendor.eq("store_id", storeId) : scopeVendor,
      storeId ? scopePo.eq("store_id", storeId) : scopePo,
      storeId ? scopeNote.eq("store_id", storeId) : scopeNote
    ]);

    const lines: string[] = [];
    lines.push(`Current season is ${CURRENT_SEASON}. Store: Robinsons General Store, Dorset, Ontario. Money is CAD.`);

    lines.push("\nVENDORS:");
    for (const v of (vendors.data as any[]) || []) {
      // Same helpers the vendor screens use, so the wording cannot drift. Both return null
      // when nothing is on file, and a blank stays blank rather than reading as "no minimum".
      const ordering: string[] = [];
      const minimum = minimumOrderLabel(v);
      if (minimum) ordering.push(minimum);
      if (v.summer_order_timeline) ordering.push(`summer order: ${v.summer_order_timeline}`);
      const where = orderLocationLabel(v.order_location, v.order_location_other);
      if (where) ordering.push(`ordered via ${where}`);
      if (v.reorder_status) {
        ordering.push(`reorder: ${v.reorder_status === "reordered" ? "reordered this year" : "no reorder"}${v.reorder_comments ? " (" + v.reorder_comments + ")" : ""}`);
      }
      lines.push(`- ${v.name} [${v.department?.name || ""}], status ${v.status}, terms ${v.default_terms || "n/a"}${v.notes ? ", note: " + v.notes : ""}${ordering.length ? ", " + ordering.join(", ") : ""}`);
    }

    lines.push("\nORDERS (vendor, season, amount, ship date, status):");
    for (const p of (pos.data as any[]) || []) {
      lines.push(`- ${p.vendor?.name || "unknown"}: ${p.season_year || "?"}, $${(Number(p.order_amount) || 0).toFixed(2)}, ${p.ship_date || "n/a"}, ${p.status}`);
    }

    lines.push("\nREORDER NOTES:");
    for (const n of (notes.data as any[]) || []) {
      if ((n.tags || []).includes("reorder")) lines.push(`- ${n.topic}: ${n.body}`);
    }

    const context = lines.join("\n");
    const system =
      "You are the reorder assistant for Robinsons General Store. Using ONLY the data provided, list the vendors most likely to need an order this season and the reason for each (no current-season order, a note that says to reorder, or a discontinue/skip note to respect). Be concise, use the vendor names, and end by reminding that a person makes the final call. Do not invent vendors or numbers. Answer in plain text only: no markdown, no asterisks, no # headers; use simple hyphen lists. No em dashes.";

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        // No temperature override: current Claude models reject non-default sampling
        // params; consistency comes from the grounded prompt instead.
        system,
        messages: [{ role: "user", content: `STORE DATA:\n${context}\n\nSummarize the likely reorders.` }]
      })
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return NextResponse.json({ error: "model call failed", detail });
    }

    const data = await resp.json();
    const textPart = (data.content || []).find((c: any) => c.type === "text");
    return NextResponse.json({ answer: plainText(textPart?.text || "") });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "unexpected error" }, { status: 500 });
  }
}
