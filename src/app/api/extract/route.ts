import { NextRequest, NextResponse } from "next/server";
import { resolveMember } from "@/lib/serverMember";

export const runtime = "nodejs";
// Run in Montreal, not the default iad1 (Washington DC). The Supabase project is in
// Toronto, so this keeps the store's vendor, payment and staff data being processed in
// Canada rather than crossing the border on every request, and it is the nearest region
// to the database, which Vercel recommends for latency.
export const preferredRegion = "yul1";

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
Rules: amounts are in CAD as plain numbers with no currency symbol. retail_price_note is the retail price written by hand next to a line, or null if none. confidence is between 0 and 1; set it low on any field you are unsure about. If a value is missing use 0 for numbers and an empty string for text.`;

// The same contract as the prompt, enforced by the API instead of asked for politely.
// Structured outputs constrain the response to this schema, so "the model wrapped it in a
// code fence" and "the model added a sentence before the JSON" stop being failure modes.
//
// Restrictions worth knowing before editing this (from the structured outputs docs):
// no recursive schemas, no minimum/maximum, no minLength/maxLength, and additionalProperties
// may only be false. That is why the 0-to-1 bound on confidence lives in the prompt above
// rather than here: the schema cannot express it, and a schema the API rejects would fail
// every capture rather than one.
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    vendor: { type: "string" },
    invoice_date: { type: "string" },
    notes: { type: "string" },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          qty: { type: "number" },
          unit_cost: { type: "number" },
          retail_price_note: { anyOf: [{ type: "number" }, { type: "null" }] },
          confidence: { type: "number" }
        },
        required: ["description", "qty", "unit_cost", "retail_price_note", "confidence"],
        additionalProperties: false
      }
    }
  },
  required: ["vendor", "invoice_date", "notes", "line_items"],
  additionalProperties: false
} as const;

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
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
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
        // Was 2000, which a long delivery could exceed. Running out of room mid-answer
        // truncates the JSON, and the store was then told "could not parse model output"
        // for what was really a full invoice with too many lines to fit.
        max_tokens: 8000,
        // No temperature override: current Claude models reject non-default sampling
        // params; the strict JSON contract in the prompt keeps extraction stable.
        output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }]
      })
    });

    if (!resp.ok) {
      const detail = (await resp.text()).slice(0, 300);
      return NextResponse.json({ error: "model call failed", detail }, { status: 502 });
    }

    const data = await resp.json();

    // A refusal arrives as HTTP 200 with stop_reason "refusal" and no usable content, so
    // code that reads the first content block unconditionally would fail here with something
    // meaningless. The person holding the invoice is a seasonal employee at the receiving
    // door, and the standing rule is that they are never asked to debug: tell them what to
    // do next instead.
    if (data.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The reader would not process this document. Enter the invoice by hand using Enter manually, and tell the owner which invoice it was." },
        { status: 422 }
      );
    }

    // Ran out of room. Distinguishing this from a parse failure matters: the invoice was
    // read fine, there were just more lines than would fit, and saying so points at the
    // real fix (capture it in two photos) rather than at a broken reader.
    if (data.stop_reason === "max_tokens") {
      return NextResponse.json(
        { error: "This invoice is longer than the reader can return in one go. Photograph it in two halves and capture each, or enter it by hand." },
        { status: 422 }
      );
    }

    const textPart = (data.content || []).find((c: any) => c.type === "text");
    // Structured outputs should make the fence strip unnecessary, since the response is
    // constrained to the schema. It stays because it costs nothing and this is the path a
    // failed capture blocks the receiving door on.
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
