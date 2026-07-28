"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatCAD } from "@/lib/format";
import { sortDepartments } from "@/lib/departments";
import { useActiveStore } from "@/lib/store";
import { canSeeMoney, currentActorId, useCurrentRole, useMember } from "@/lib/auth";
import { canEdit } from "@/lib/edit";
import type { Item } from "@/lib/types";

type DeptMargin = { id: string; name: string; target_margin: number | null };

// Retail price from cost and a margin percent of the retail price: price = cost / (1 - m).
// The .99 suggestion is the nearest x.99 at or above the exact price.
function priceFromMargin(cost: number, marginPct: number): { exact: number; psych: number } | null {
  if (!(cost > 0) || !(marginPct >= 0) || marginPct >= 100) return null;
  const exact = cost / (1 - marginPct / 100);
  const base = Math.floor(exact) + 0.99;
  const psych = base >= exact ? base : base + 1;
  return { exact, psych };
}

// The margin calculator card. Costs are money, so the whole card is gated to money roles.
// Each department remembers its target margin; saving needs an owner or manager.
function MarginCalculator() {
  const { storeId, ready } = useActiveStore();
  const { role } = useCurrentRole();
  const { member } = useMember();
  const [depts, setDepts] = useState<DeptMargin[]>([]);
  const [canSave, setCanSave] = useState(true);
  const [deptId, setDeptId] = useState("");
  const [cost, setCost] = useState("");
  const [margin, setMargin] = useState("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      let q = supabase.from("department").select("id, name, target_margin").order("name");
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error && /target_margin/.test(error.message)) {
        // A live database from before the target_margin column: the calculator still works
        // with a typed margin; only per-department saving is off until the migration runs.
        let fq = supabase.from("department").select("id, name").order("name");
        if (storeId) fq = fq.eq("store_id", storeId);
        const fb = await fq;
        setDepts(sortDepartments((((fb.data as any[]) || []).map((d) => ({ ...d, target_margin: null }))) as DeptMargin[]));
        setCanSave(false);
        return;
      }
      setDepts(sortDepartments((data as DeptMargin[]) || []));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  function pickDept(id: string) {
    setDeptId(id);
    setSaveMsg(null);
    const d = depts.find((x) => x.id === id);
    if (d?.target_margin != null) setMargin(String(d.target_margin));
  }

  // One definition of a valid margin, shared by the Save gate and the save itself.
  const m = Number(margin);
  const marginValid = margin !== "" && m >= 0 && m < 100;
  const dept = depts.find((x) => x.id === deptId);

  async function saveMargin() {
    if (!dept || !marginValid) return;
    setBusy(true);
    setSaveMsg(null);
    try {
      const r = await supabase.from("department").update({ target_margin: m }).eq("id", dept.id);
      if (r.error) throw new Error(r.error.message);
      const actor = currentActorId(member);
      if (actor) {
        await supabase.from("activity_log").insert({ actor_id: actor, action: "margin_rule_set", entity: "department", entity_id: dept.id });
      }
      setDepts(depts.map((x) => (x.id === dept.id ? { ...x, target_margin: m } : x)));
      setSaveMsg(`Saved. ${dept.name} now suggests a ${m}% margin.`);
    } catch (e: any) {
      setSaveMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!canSeeMoney(role)) return null;

  const result = priceFromMargin(Number(cost), m);
  const showSave = canEdit(role) && dept && marginValid && m !== dept.target_margin;

  return (
    <div className="card no-print" style={{ padding: 16, marginBottom: 16, display: "grid", gap: 12 }}>
      <div>
        <strong>Price from cost</strong>
        <p className="help" style={{ margin: "4px 0 0" }}>
          Type what it costs you, pick the department, and get the retail price that hits the department&apos;s margin.
        </p>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label className="label" htmlFor="calc-cost">Cost price ($)</label>
          <input id="calc-cost" className="input tabular" type="number" step="0.01" min="0" style={{ width: 130 }} value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="calc-dept">Department</label>
          <select id="calc-dept" className="input" style={{ width: "auto" }} value={deptId} onChange={(e) => pickDept(e.target.value)}>
            <option value="">Pick one</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}{d.target_margin != null ? ` (${d.target_margin}%)` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="calc-margin">Margin %</label>
          <input id="calc-margin" className="input tabular" type="number" step="1" min="0" max="99" style={{ width: 100 }} value={margin} onChange={(e) => { setMargin(e.target.value); setSaveMsg(null); }} />
        </div>
        {showSave && (
          canSave ? (
            <button className="btn-ghost" onClick={saveMargin} disabled={busy}>
              {busy ? "Saving." : `Save ${margin}% as ${dept.name}'s rule`}
            </button>
          ) : (
            <span className="help">Run edit_delete.sql once to save department margins.</span>
          )
        )}
      </div>
      {result && (
        <div style={{ display: "flex", gap: 18, alignItems: "baseline", flexWrap: "wrap" }}>
          <div>
            <span className="help">Suggested price</span>
            <div className="tabular" style={{ fontSize: 24, fontWeight: 700 }}>{formatCAD(result.psych)}</div>
          </div>
          <span className="help tabular">
            exact {formatCAD(result.exact)} . profit {formatCAD(result.psych - Number(cost))} on each
          </span>
        </div>
      )}
      {saveMsg && <p className="help" style={{ margin: 0 }}>{saveMsg}</p>}
    </div>
  );
}

export default function PriceSigns() {
  const { storeId, ready } = useActiveStore();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [printMode, setPrintMode] = useState(false);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    (async () => {
      let query = supabase
        .from("item")
        .select("id, name, uom, retail_price, sku, department:department_id(name, accent_color)")
        .not("retail_price", "is", null)
        .order("name");
      if (storeId) query = query.eq("store_id", storeId);
      const { data, error } = await query;
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
  }, [ready, storeId]);

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
      <header className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Price signs</h1>
        </div>
        <div className="page-actions">
          <span className="help">{chosen.length} selected</span>
        </div>
      </header>

      <MarginCalculator />

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
