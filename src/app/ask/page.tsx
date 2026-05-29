"use client";

import { useState } from "react";

const EXAMPLES = [
  "Which gift vendors should we skip in 2026 and why?",
  "What is overdue right now and how much?",
  "Who do I call to reorder moccasins?",
  "Which vendors use post-dated cheques?"
];

export default function Ask() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(question?: string) {
    const text = (question ?? q).trim();
    if (!text) return;
    setQ(text);
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const resp = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || data.error || "request failed");
      setAnswer(data.answer || "No answer came back.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, margin: "0 0 6px" }}>Ask your store</h1>
      <p className="help" style={{ marginBottom: 16 }}>Ask about vendors, money owed, reorder rules, or anything in the knowledge base. Answers use only your store data.</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
          placeholder="Ask a question about the store"
          aria-label="Ask a question"
        />
        <button className="btn-primary" onClick={() => ask()} disabled={loading || !q.trim()}>
          {loading ? "Thinking." : "Ask"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {EXAMPLES.map((ex) => (
          <button key={ex} className="btn-ghost" style={{ fontSize: 13, padding: "6px 10px" }} onClick={() => ask(ex)} disabled={loading}>{ex}</button>
        ))}
      </div>

      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="chip chip-error">Error</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. The assistant needs ANTHROPIC_API_KEY set and the data loaded in Supabase.</p>
        </div>
      )}

      {answer && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-progress">Answer</span>
          <p style={{ margin: "10px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{answer}</p>
        </div>
      )}
    </div>
  );
}
