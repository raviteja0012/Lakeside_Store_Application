import { NextRequest, NextResponse } from "next/server";
import { resolveMember, memberSeesMoney } from "@/lib/serverMember";
import { plainText } from "@/lib/aiText";
import { APP_GUIDE } from "@/lib/appGuide";
import { invoiceTotal } from "@/lib/payments";
import { minimumOrderLabel, orderLocationLabel } from "@/lib/vendorOrdering";

export const runtime = "nodejs";

// Ask-your-store: answers questions using only the store's own data as grounding.
// At this scale (tens of vendors) we pass the data directly as context. pgvector is the
// upgrade once the knowledge base grows past what fits in one prompt.
// Caller rules: enforced mode requires a signed-in member and every query runs as them, so the
// per-store RLS applies; the invoice dollar section is only included for money roles. Demo mode
// stays open by design (the whole database is open to the anon key there).
export async function POST(req: NextRequest) {
  try {
    const { question, store_id } = await req.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const resolved = await resolveMember(req);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }
    const { client: db, member } = resolved;
    // A signed-in member always asks about their own store, whatever the body says.
    const storeId: string | null = member?.store_id || store_id || null;
    const includeMoney = member ? memberSeesMoney(member.role) : true;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    if (!apiKey) {
      return NextResponse.json({ message: "Ask is off. Set ANTHROPIC_API_KEY to enable it." });
    }

    const scopeNote = db.from("knowledge_note").select("topic, body, tags, department:department_id(name)").is("voided_at", null);
    // The ordering profile is fetched here too. Without it this route answered "not on file"
    // for a summer order timeline that IS on file, because the columns were simply never
    // selected. minimum_order_amount is a dollar figure and rides the same money gate as the
    // invoice section below.
    const scopeVendor = db.from("vendor").select("name, default_terms, status, notes, phone, minimum_order_amount, no_minimum_order, summer_order_timeline, order_location, order_location_other, reorder_status, reorder_comments, department:department_id(name)").is("voided_at", null);
    const scopeInvoice = db.from("invoice").select("amount, hst_amount, freight_charges, tax_mode, due_date, status, terms, vendor:vendor_id(name)").is("voided_at", null);
    const [notes, vendors, invoices] = await Promise.all([
      storeId ? scopeNote.eq("store_id", storeId) : scopeNote,
      storeId ? scopeVendor.eq("store_id", storeId) : scopeVendor,
      includeMoney ? (storeId ? scopeInvoice.eq("store_id", storeId) : scopeInvoice) : Promise.resolve({ data: [] as any[] })
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const lines: string[] = [];
    lines.push(`Today is ${today}. Store: Robinsons General Store, Dorset, Ontario. Money is CAD.`);

    lines.push("\nKNOWLEDGE NOTES:");
    for (const n of (notes.data as any[]) || []) {
      lines.push(`- [${n.department?.name || "Store-wide"}] ${n.topic}: ${n.body}${n.tags?.length ? " (tags: " + n.tags.join(", ") + ")" : ""}`);
    }

    lines.push("\nVENDORS:");
    for (const v of (vendors.data as any[]) || []) {
      // The ordering profile, appended only where an answer exists. minimumOrderLabel and
      // orderLocationLabel are the same pure helpers the vendor screens use, so the wording
      // here cannot drift from what the owner sees on the page. Both return null when
      // nothing is on file, which is the third state: not "no minimum", just never asked.
      const ordering: string[] = [];
      const minimum = includeMoney ? minimumOrderLabel(v) : null;
      if (minimum) ordering.push(minimum);
      if (v.summer_order_timeline) ordering.push(`summer order: ${v.summer_order_timeline}`);
      const where = orderLocationLabel(v.order_location, v.order_location_other);
      if (where) ordering.push(`ordered via ${where}`);
      if (v.reorder_status) {
        ordering.push(`reorder: ${v.reorder_status === "reordered" ? "reordered this year" : "no reorder"}${v.reorder_comments ? " (" + v.reorder_comments + ")" : ""}`);
      }
      lines.push(`- ${v.name} [${v.department?.name || ""}], terms ${v.default_terms || "n/a"}, status ${v.status}${v.phone ? ", phone " + v.phone : ""}${v.notes ? ", note: " + v.notes : ""}${ordering.length ? ", " + ordering.join(", ") : ""}`);
    }

    if (includeMoney) {
      lines.push("\nINVOICES (amount owed = amount + freight + HST, except where the tax is already inside the amount):");
      for (const i of (invoices.data as any[]) || []) {
        const total = invoiceTotal(i);
        lines.push(`- ${i.vendor?.name || "unknown"}: $${total.toFixed(2)}, ${i.status}, due ${i.due_date || "n/a"}, terms ${i.terms || "n/a"}`);
      }
    } else {
      lines.push("\nINVOICES: withheld. The person asking has a role that does not see money, so no invoice or dollar data is available. If asked about amounts, say the question needs a manager or the owner.");
    }

    // A plain question about a problem, phrased as "log/report/file this issue", becomes a
    // Suggestions row BEFORE the model answers: deterministic, verbatim, attributed. Only a
    // signed-in member can log (audit integrity); demo mode is pointed at Suggestions.
    let loggedIssue = false;
    // Imperative only: "log this issue ...", "report a problem ...". A question ABOUT
    // logging ("how do I report a problem?") must never file anything.
    const wantsLog = /\b(log|file|report|raise)\s+(this|that|it|an?\s+|the\s+)/i.test(question)
      && /\b(issue|bug|problem|error|not working|broken)\b/i.test(question)
      && !/^\s*(how|where|what|can|could|do|does|is|are)\b/i.test(question);
    if (wantsLog && member) {
      // A retry or a repeated ask must not stack duplicates in the inbox.
      const dup = await db.from("feedback")
        .select("id")
        .eq("author_id", member.id)
        .eq("body", question)
        .is("voided_at", null)
        .limit(1)
        .maybeSingle();
      if (dup.data) {
        loggedIssue = true;
      } else {
        const ins = await db.from("feedback").insert({
          store_id: member.store_id,
          author_id: member.id,
          kind: "problem",
          page: "Ask the store",
          body: question,
          status: "new"
        }).select("id").single();
        if (!ins.error) {
          loggedIssue = true;
          await db.from("activity_log").insert({ actor_id: member.id, action: "feedback_added", entity: "feedback", entity_id: ins.data.id });
        }
      }
    }

    lines.push("\nAPP GUIDE (how this application works; use it for how-do-I and what-can-it-do questions):");
    lines.push(APP_GUIDE);
    if (loggedIssue) {
      lines.push("\nNOTE TO ASSISTANT: this question was just logged in the Suggestions inbox as a problem report. Confirm that to the person in one sentence as part of the answer.");
    } else if (wantsLog && !member) {
      lines.push("\nNOTE TO ASSISTANT: the person wants to log an issue but is not signed in as a member, so nothing was logged. Point them to the Suggestions screen in the sidebar.");
    }

    const context = lines.join("\n");
    const system =
      "You are the assistant for Robinsons General Store. Two kinds of questions come here: questions about the store's data (answer ONLY from the store data provided, cite the vendor name or note topic, never invent numbers or vendors, and say when something is not on file) and questions about how this application works or what it can do (answer from the APP GUIDE section, naming the screen to use). Be concise and specific. Answer in plain text only: no markdown, no asterisks, no # headers; use simple hyphen lists. No em dashes.";

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
        messages: [{ role: "user", content: `STORE DATA:\n${context}\n\nQUESTION: ${question}` }]
      })
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return NextResponse.json({ error: "model call failed", detail }, { status: 502 });
    }

    const data = await resp.json();
    const textPart = (data.content || []).find((c: any) => c.type === "text");
    return NextResponse.json({ answer: plainText(textPart?.text || "") });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "unexpected error" }, { status: 500 });
  }
}
