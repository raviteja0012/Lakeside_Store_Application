import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const runtime = "nodejs";

// Ask-your-store: answers questions using only the store's own data as grounding.
// At this scale (tens of vendors) we pass the data directly as context. pgvector is the
// upgrade once the knowledge base grows past what fits in one prompt.
export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
    }

    const [notes, vendors, invoices] = await Promise.all([
      supabase.from("knowledge_note").select("topic, body, tags, department:department_id(name)"),
      supabase.from("vendor").select("name, default_terms, status, notes, phone, department:department_id(name)"),
      supabase.from("invoice").select("amount, hst_amount, due_date, status, terms, vendor:vendor_id(name)")
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

    lines.push("\nINVOICES (amount owed = amount + hst):");
    for (const i of (invoices.data as any[]) || []) {
      const total = (Number(i.amount) || 0) + (Number(i.hst_amount) || 0);
      lines.push(`- ${i.vendor?.name || "unknown"}: $${total.toFixed(2)}, ${i.status}, due ${i.due_date || "n/a"}, terms ${i.terms || "n/a"}`);
    }

    const context = lines.join("\n");
    const system =
      "You are the assistant for Robinsons General Store. Answer the question using ONLY the store data provided in the user message. Be concise and specific, and cite the vendor name or note topic you used. If the answer is not in the data, say you do not have that on file. Do not invent numbers or vendors. No em dashes.";

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
    return NextResponse.json({ answer: textPart?.text || "" });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "unexpected error" }, { status: 500 });
  }
}
