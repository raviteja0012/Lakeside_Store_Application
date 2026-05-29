"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCAD } from "@/lib/format";
import type { Item } from "@/lib/types";

export default function PriceSigns() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [printMode, setPrintMode] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("item")
        .select("id, name, uom, retail_price, sku, department:department_id(name, accent_color)")
        .not("retail_price", "is", null)
        .order("name");
      if (error) setError(error.message);
      else {
        const list = (data as unknown as Item[]) || [];
        setItems(list);
        const p: Record<string, number> = {};
        list.forEach((it) => {
          if (it.retail_price != null) p[it.id] = Number(it.retail_price);
        });
        setPrices(p);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) => it.name.toLowerCase().includes(term) || (it.department?.name || "").toLowerCase().includes(term));
  }, [items, q]);

  const chosen = items.filter((it) => selected[it.id]);

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  if (printMode) {
    return (
      <div>
        <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <button className="btn-primary" onClick={() => window.print()}>Print</button>
          <button className="btn-ghost" onClick={() => setPrintMode(false)}>Back</button>
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          {chosen.map((it) => {
            const override = prices[it.id];
            const shown = typeof override === "number" && override > 0 ? override : Number(it.retail_price) || 0;
            return (
              <div key={it.id} className="sign-card">
                <div className="sign-name">{it.name}</div>
                <div className="sign-price">{formatCAD(shown)}</div>
                {it.uom && <div className="sign-uom">per {it.uom}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Price signs</h1>
        <span className="help">{chosen.length} selected</span>
      </div>

      <input className="input" placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} aria-label="Search items" />

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button className="btn-primary" onClick={() => setPrintMode(true)} disabled={chosen.length === 0}>
          Print selected ({chosen.length})
        </button>
      </div>

      {loading && <p className="help">Loading items.</p>}
      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Connection</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p className="help" style={{ margin: 0 }}>No items with a retail price yet. Add prices in the data, then print signs here.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {filtered.map((it) => (
          <div key={it.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <input type="checkbox" checked={!!selected[it.id]} onChange={() => toggle(it.id)} aria-label={`Select ${it.name}`} />
            <div style={{ flex: 1, cursor: "pointer" }} onClick={() => toggle(it.id)}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{it.name}</strong>
                {it.department && <span className="chip" style={{ background: "#EEF1F4", color: it.department.accent_color || "#6B7480" }}>{it.department.name}</span>}
              </div>
              {it.uom && <div className="help" style={{ marginTop: 4 }}>per {it.uom}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="help">$</span>
              <input
                className="input tabular"
                style={{ width: 90 }}
                type="number"
                step="0.01"
                value={prices[it.id] ?? ""}
                onChange={(e) => setPrices((p) => ({ ...p, [it.id]: e.target.value === "" ? 0 : Number(e.target.value) }))}
                aria-label={`Price for ${it.name}`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
