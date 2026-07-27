import { NextRequest, NextResponse } from "next/server";
import { resolveMember, memberSeesMoney } from "@/lib/serverMember";
import { plainText } from "@/lib/aiText";

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
    const scopeVendor = db.from("vendor").select("name, default_terms, status, notes, phone, department:department_id(name)").is("voided_at", null);
    const scopeInvoice = db.from("invoice").select("amount, hst_amount, due_date, status, terms, vendor:vendor_id(name)").is("voided_at", null);
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
      lines.push(`- ${v.name} [${v.department?.name || ""}], terms ${v.default_terms || "n/a"}, status ${v.status}${v.phone ? ", phone " + v.phone : ""}${v.notes ? ", note: " + v.notes : ""}`);
    }

    if (includeMoney) {
      lines.push("\nINVOICES (amount owed = amount + hst):");
      for (const i of (invoices.data as any[]) || []) {
        const total = (Number(i.amount) || 0) + (Number(i.hst_amount) || 0);
        lines.push(`- ${i.vendor?.name || "unknown"}: $${total.toFixed(2)}, ${i.status}, due ${i.due_date || "n/a"}, terms ${i.terms || "n/a"}`);
      }
    } else {
      lines.push("\nINVOICES: withheld. The person asking has a role that does not see money, so no invoice or dollar data is available. If asked about amounts, say the question needs a manager or the owner.");
    }

    const context = lines.join("\n");
    const system =
      "You are the assistant for Robinsons General Store. Answer the question using ONLY the store data provided in the user message. Be concise and specific, and cite the vendor name or note topic you used. If the answer is not in the data, say you do not have that on file. Do not invent numbers or vendors. Answer in plain text only: no markdown, no asterisks, no # headers; use simple hyphen lists. No em dashes.";

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
