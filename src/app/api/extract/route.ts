import { NextRequest, NextResponse } from "next/server";
import { resolveMember } from "@/lib/serverMember";

export const runtime = "nodejs";

const PROMPT = `You are extracting a vendor invoice or receipt for a Canadian general store.
Read printed text and any handwritten notes or prices written in the margins.
Return ONLY a JSON object, no prose and no code fences, in exactly this shape:
{
  "vendor": string,
  "invoice_date": string in YYYY-MM-DD or empty string if unknown,
  "notes": string,
  "line_items": [
    {
      "description": string,
      "qty": number,
      "unit_cost": number,
      "retail_price_note": number or null,
      "confidence": number between 0 and 1
    }
  ]
}
Rules: amounts are in CAD as plain numbers with no currency symbol. retail_price_note is the retail price written by hand next to a line, or null if none. Set a low confidence on any field you are unsure about. If a value is missing use 0 for numbers and an empty string for text.`;

export async function POST(req: NextRequest) {
  try {
    // Any signed-in member can extract (capture is the staff job); what enforced mode blocks
    // is anonymous use of the store's Anthropic key as a free OCR proxy. Demo mode stays open.
    const resolved = await resolveMember(req);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64 || !mediaType) {
      return NextResponse.json({ error: "imageBase64 and mediaType are required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
    }

    const block =
      mediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: imageBase64 } }
        : { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } };

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }]
      })
    });

    if (!resp.ok) {
      const detail = (await resp.text()).slice(0, 300);
      return NextResponse.json({ error: "model call failed", detail }, { status: 502 });
    }

    const data = await resp.json();
    const textPart = (data.content || []).find((c: any) => c.type === "text");
    const raw = (textPart?.text || "").replace(/```json|```/g, "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "could not parse model output", raw }, { status: 502 });
    }

    if (!Array.isArray(parsed.line_items)) parsed.line_items = [];
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "unexpected error" }, { status: 500 });
  }
}
