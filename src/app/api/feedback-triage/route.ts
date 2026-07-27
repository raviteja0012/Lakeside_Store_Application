import { NextRequest, NextResponse } from "next/server";
import { resolveMember } from "@/lib/serverMember";
import { plainText } from "@/lib/aiText";

export const runtime = "nodejs";

// Reads an attached screenshot with the store's Anthropic key and writes a text
// description onto the feedback row, so a picture-based request becomes searchable text
// and the developer digest carries the whole story without the image. Best-effort: the
// note itself is already saved before this is called, so any failure here only means
// the ai_summary stays empty.

const PROMPT = `This screenshot was attached to a suggestion inside a general store's management app.
Describe exactly what the screenshot shows (which screen, what data, anything circled,
highlighted, or annotated), then restate what the person seems to be asking for.
Answer as plain text in under 120 words. If it is not an app screenshot, describe it anyway.`;

const BUCKET = "documents";

export async function POST(req: NextRequest) {
  try {
    const resolved = await resolveMember(req);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const { feedbackId } = await req.json();
    if (!feedbackId) {
      return NextResponse.json({ error: "feedbackId is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    if (!apiKey) {
      // The suggestion is saved either way; without a key there is just no auto-read.
      return NextResponse.json({ message: "ANTHROPIC_API_KEY is not set; skipped" });
    }

    const db = resolved.client;
    const { data: row, error } = await db
      .from("feedback")
      .select("id, screenshot_path, body, page")
      .eq("id", feedbackId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row?.screenshot_path) return NextResponse.json({ message: "no screenshot to read" });

    const dl = await db.storage.from(BUCKET).download(row.screenshot_path);
    if (dl.error || !dl.data) {
      return NextResponse.json({ error: dl.error?.message || "could not download screenshot" }, { status: 500 });
    }
    const buf = Buffer.from(await dl.data.arrayBuffer());
    const mediaType = dl.data.type && dl.data.type.startsWith("image/") ? dl.data.type : "image/png";

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        // No temperature override: current Claude models reject non-default sampling params.
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: buf.toString("base64") } },
            { type: "text", text: `${PROMPT}\n\nThe person's own note: ${row.body || "(none)"}\nScreen they named: ${row.page || "(none)"}` }
          ]
        }]
      })
    });
    if (!resp.ok) {
      const detail = (await resp.text()).slice(0, 300);
      return NextResponse.json({ error: "model call failed", detail }, { status: 502 });
    }
    const data = await resp.json();
    const textPart = (data.content || []).find((c: any) => c.type === "text");
    const summary = plainText(textPart?.text || "");
    if (!summary) return NextResponse.json({ message: "model returned nothing" });

    const upd = await db.from("feedback").update({ ai_summary: summary }).eq("id", feedbackId);
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
    return NextResponse.json({ ai_summary: summary });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "unexpected error" }, { status: 500 });
  }
}
