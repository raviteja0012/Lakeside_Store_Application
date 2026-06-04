"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, DOCUMENTS_BUCKET } from "@/lib/supabaseClient";
import { chipClass, labelize } from "@/lib/status";
import { formatCAD, todayISO } from "@/lib/format";
import { useActiveStore } from "@/lib/store";
import { canSeeMoney, useCurrentRole } from "@/lib/auth";
import type { FeedRow } from "@/lib/types";

function thumb(path: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

function rowSubtotal(r: FeedRow): number {
  return (r.receiving_line || []).reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0);
}

function localISO(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const HOWTO_KEY = "rgs_seen_howto";

export default function StaffFeed() {
  const { storeId, ready } = useActiveStore();
  const { role } = useCurrentRole();
  const showMoney = canSeeMoney(role);
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(HOWTO_KEY)) setShowHowTo(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    (async () => {
      let query = supabase
        .from("receiving_event")
        .select("id, vendor_name, received_date, status, source_file_path, created_at, department:department_id(name, accent_color), app_user:created_by(full_name), receiving_line(qty, unit_cost)")
        .order("created_at", { ascending: false })
        .limit(40);
      if (storeId) query = query.eq("store_id", storeId);
      const { data, error } = await query;
      if (error) setError(error.message);
      else setRows((data as unknown as FeedRow[]) || []);
      setLoading(false);
    })();
  }, [ready, storeId]);

  function dismissHowTo() {
    setShowHowTo(false);
    if (typeof window !== "undefined") localStorage.setItem(HOWTO_KEY, "1");
  }

  // Today strip: group today's posts by department from the rows already loaded. No extra query.
  const today = todayISO();
  const todayByDept = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null; count: number }>();
    for (const r of rows) {
      if (localISO(r.created_at) !== today) continue;
      const name = r.department?.name || "Unassigned";
      const cur = map.get(name) || { name, color: r.department?.accent_color || null, count: 0 };
      cur.count += 1;
      map.set(name, cur);
    }
    return Array.from(map.values());
  }, [rows, today]);

  return (
    <div>
      {showHowTo && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "var(--progress-base)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <strong>How to receive an order</strong>
            <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={dismissHowTo}>Got it</button>
          </div>
          <ol className="help" style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Tap + Capture and drop the vendor invoice, or snap it with the webcam.</li>
            <li>Confirm the fields. Anything in amber was uncertain, so check it.</li>
            <li>Save to the feed. It posts with your name and the time.</li>
          </ol>
        </div>
      )}

      {todayByDept.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>Today</h2>
            <span className="help">What each department did today</span>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {todayByDept.map((d) => (
              <div key={d.name} className="card" style={{ padding: 12, minWidth: 140, flexShrink: 0 }}>
                <span className="chip" style={{ background: "#EEF1F4", color: d.color || "#6B7480" }}>{d.name}</span>
                <div className="tabular" style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>{d.count}</div>
                <div className="help">{d.count === 1 ? "receiving" : "receivings"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Recent activity</h1>
        <span className="help">Every entry shows who and when</span>
      </div>

      {loading && <p className="help">Loading the feed.</p>}
      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="chip chip-error">Connection</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>No activity yet.</p>
          <p className="help" style={{ margin: "0 0 12px" }}>Capture your first vendor invoice to start the feed.</p>
          <Link href="/capture" className="btn-primary" style={{ textDecoration: "none" }}>Capture the first invoice</Link>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((r) => {
          const url = thumb(r.source_file_path);
          const subtotal = rowSubtotal(r);
          return (
            <div key={r.id} className="card" style={{ padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 8, background: "#EEF1F4", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span className="help">file</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 15 }}>{r.vendor_name || "Unknown vendor"}</strong>
                  {r.department && (
                    <span className="chip" style={{ background: "#EEF1F4", color: r.department.accent_color || "#6B7480" }}>{r.department.name}</span>
                  )}
                  <span className={`chip ${chipClass(r.status)}`}>{labelize(r.status)}</span>
                </div>
                <div className="help" style={{ marginTop: 4 }}>
                  {r.app_user?.full_name || "Unknown"} . {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              {showMoney && subtotal > 0 && (
                <div className="tabular" style={{ textAlign: "right", fontWeight: 600, flexShrink: 0 }}>
                  {formatCAD(subtotal)}
                  <div className="help" style={{ fontWeight: 400 }}>subtotal</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
