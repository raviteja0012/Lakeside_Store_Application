"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { formatCAD } from "@/lib/format";
import { useActiveStore } from "@/lib/store";

const CURRENT_SEASON = 2026;
const LOW_STOCK = 3; // a latest count at or below this flags the item for a restock look

type Vend = { id: string; name: string; status: string; default_terms: string | null; notes: string | null; department: { name: string } | null };
type PO = { vendor_id: string | null; order_amount: number | null; ship_date: string | null; season_year: number | null; status: string };
type Note = { topic: string | null; body: string | null; tags: string[] | null };
type ItemRow = { id: string; name: string; vendor_id: string | null };
type CountLine = { item_id: string | null; counted_qty: number | null; inventory_count: { counted_date: string | null } | null };

export default function Reorder() {
  const { storeId, ready } = useActiveStore();
  const [vendors, setVendors] = useState<Vend[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [countLines, setCountLines] = useState<CountLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Optional AI summary, guarded to no-op without ANTHROPIC_API_KEY.
  const [summary, setSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const v = await supabase.from("vendor").select("id, name, status, default_terms, notes, department:department_id(name)").order("name");
      if (v.error) { setError(v.error.message); setLoading(false); return; }
      setVendors((v.data as unknown as Vend[]) || []);
      const p = await supabase.from("purchase_order").select("vendor_id, order_amount, ship_date, season_year, status");
      setPos((p.data as unknown as PO[]) || []);
      const n = await supabase.from("knowledge_note").select("topic, body, tags");
      setNotes((n.data as unknown as Note[]) || []);
      const it = await supabase.from("item").select("id, name, vendor_id");
      setItems((it.data as unknown as ItemRow[]) || []);
      const cl = await supabase.from("inventory_count_line").select("item_id, counted_qty, inventory_count:inventory_count_id(counted_date)");
      setCountLines((cl.data as unknown as CountLine[]) || []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  // Latest counted qty per item from the most recent count that includes it.
  const latestCount = useMemo(() => {
    const m = new Map<string, { qty: number; date: string | null }>();
    for (const l of countLines) {
      if (!l.item_id) continue;
      const date = l.inventory_count?.counted_date || null;
      const cur = m.get(l.item_id);
      if (!cur || (date && (!cur.date || date > cur.date))) m.set(l.item_id, { qty: Number(l.counted_qty) || 0, date });
    }
    return m;
  }, [countLines]);

  // A vendor is "flagged to reorder" if a reorder-tagged note mentions it, or its own notes
  // carry a reorder phrase. Kept as plain string matching so the rule is easy to read.
  const reorderText = useMemo(() => {
    const reNotes = notes.filter((n) => (n.tags || []).includes("reorder")).map((n) => `${n.topic || ""} ${n.body || ""}`.toLowerCase());
    return reNotes.join(" \n ");
  }, [notes]);

  function reorderFlag(v: Vend): boolean {
    const own = (v.notes || "").toLowerCase();
    if (/reorder|order more|need to order|order required/.test(own)) return true;
    return reorderText.includes(v.name.toLowerCase());
  }

  const rows = useMemo(() => {
    return vendors
      .map((v) => {
        const vpos = pos.filter((p) => p.vendor_id === v.id && p.status !== "cancelled");
        const sorted = [...vpos].sort((a, b) => (a.ship_date || "") < (b.ship_date || "") ? 1 : -1);
        const last = sorted[0] || null;
        const hasCurrent = vpos.some((p) => p.season_year === CURRENT_SEASON);
        const lowItems = items
          .filter((i) => i.vendor_id === v.id)
          .map((i) => ({ ...i, count: latestCount.get(i.id) }))
          .filter((i) => i.count && i.count.qty <= LOW_STOCK);
        const flagged = reorderFlag(v);

        const reasons: string[] = [];
        if (v.status === "active" && !hasCurrent) reasons.push(`No ${CURRENT_SEASON} order yet`);
        if (flagged) reasons.push("Flagged to reorder in notes");
        if (lowItems.length) reasons.push(`${lowItems.length} item${lowItems.length === 1 ? "" : "s"} low on the last count`);

        return {
          id: v.id,
          name: v.name,
          status: v.status,
          dept: v.department?.name || "",
          terms: v.default_terms,
          lastAmount: last?.order_amount ?? null,
          lastDate: last?.ship_date ?? null,
          hasCurrent,
          lowItems,
          reasons,
          suggest: reasons.length > 0 && v.status !== "discontinue" && v.status !== "bankrupt"
        };
      })
      .sort((a, b) => Number(b.suggest) - Number(a.suggest) || (b.lastAmount || 0) - (a.lastAmount || 0));
    // reorderFlag is a pure helper over reorderText, which is in the deps; no need to list it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors, pos, items, latestCount, reorderText]);

  const suggested = rows.filter((r) => r.suggest);

  async function runAI() {
    setAiLoading(true);
    setAiMsg(null);
    setSummary(null);
    try {
      const resp = await fetch("/api/reorder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ store_id: storeId }) });
      const data = await resp.json();
      if (data.answer) setSummary(data.answer);
      else setAiMsg(data.message || data.error || "No summary came back.");
    } catch (e: any) {
      setAiMsg(e.message);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Reorder suggestions</h1>
        <span className="help">{suggested.length} flagged</span>
      </div>
      <div className="card" style={{ padding: 12, borderColor: "var(--progress-base)" }}>
        <span className="chip chip-progress">Formula-based</span>
        <p className="help" style={{ margin: "8px 0 0", color: "var(--text-primary)" }}>
          These are simple rules over the order ledger, the knowledge notes, and the latest counts. They are a starting list, not a decision. A person decides what to order.
        </p>
      </div>

      <div>
        <button className="btn-ghost" onClick={runAI} disabled={aiLoading}>{aiLoading ? "Summarizing." : "Summarize with AI"}</button>
        {aiMsg && <span className="help" style={{ marginLeft: 10 }}>{aiMsg}</span>}
      </div>
      {summary && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-progress">AI summary</span>
          <p style={{ margin: "10px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{summary}</p>
        </div>
      )}

      {loading && <p className="help">Loading.</p>}
      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Connection</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Suggested to look at</h2>
            {suggested.length === 0 && <p className="help">Nothing flagged. Every active vendor has a current-season order.</p>}
            <div style={{ display: "grid", gap: 8 }}>
              {suggested.map((r) => (
                <Link key={r.id} href={`/vendors/${r.id}`} className="card" style={{ padding: 12, textDecoration: "none", color: "inherit", display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{r.name}</strong>
                        {r.dept && <span className="chip chip-neutral">{r.dept}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        {r.reasons.map((reason) => <span key={reason} className="chip chip-warning">{reason}</span>)}
                      </div>
                      {r.lowItems.length > 0 && (
                        <div className="help" style={{ marginTop: 6 }}>Low: {r.lowItems.map((i) => `${i.name} (${i.count?.qty})`).join(", ")}</div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="tabular" style={{ fontWeight: 600 }}>{r.lastAmount != null ? formatCAD(r.lastAmount) : "No prior order"}</div>
                      <div className="help">{r.lastDate ? `last order ${r.lastDate}` : ""}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>All vendors, last order and this season</h2>
            <div className="card" style={{ padding: 0, overflowX: "auto" }}>
              <div style={{ minWidth: 620 }}>
                <div className="help" style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                  <span>Vendor</span><span style={{ textAlign: "right" }}>Last order</span><span style={{ textAlign: "right" }}>Last date</span><span style={{ textAlign: "right" }}>{CURRENT_SEASON} order</span>
                </div>
                {rows.map((r) => (
                  <div key={r.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                    <span style={{ fontWeight: 600 }}>{r.name}{r.status !== "active" ? <span className="help"> ({r.status})</span> : ""}</span>
                    <span className="tabular" style={{ textAlign: "right" }}>{r.lastAmount != null ? formatCAD(r.lastAmount) : "n/a"}</span>
                    <span className="tabular" style={{ textAlign: "right" }}>{r.lastDate || "n/a"}</span>
                    <span style={{ textAlign: "right" }}>{r.hasCurrent ? <span className="chip chip-success">yes</span> : <span className="chip chip-neutral">no</span>}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
