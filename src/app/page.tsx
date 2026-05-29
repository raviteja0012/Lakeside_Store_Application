"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, DOCUMENTS_BUCKET } from "@/lib/supabaseClient";
import type { FeedRow } from "@/lib/types";

function statusChip(status: string) {
  const map: Record<string, string> = {
    confirmed: "chip-success",
    fully_received: "chip-success",
    partial_received: "chip-progress",
    parsed: "chip-progress",
    disputed: "chip-warning",
    validation_error: "chip-error",
    pending_document: "chip-neutral",
    awaiting_arrival: "chip-neutral",
    closed: "chip-neutral",
    cancelled: "chip-neutral"
  };
  return map[status] || "chip-neutral";
}

function thumb(path: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

export default function Home() {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("receiving_event")
        .select("id, vendor_name, received_date, status, source_file_path, created_at, department:department_id(name, accent_color), app_user:created_by(full_name)")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) setError(error.message);
      else setRows((data as unknown as FeedRow[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
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
          <p style={{ margin: "0 0 12px" }}>No activity yet.</p>
          <Link href="/capture" className="btn-primary" style={{ textDecoration: "none" }}>Capture the first invoice</Link>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((r) => {
          const url = thumb(r.source_file_path);
          return (
            <div key={r.id} className="card" style={{ padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 8, background: "#EEF1F4", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span className="help">file</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong style={{ fontSize: 15 }}>{r.vendor_name || "Unknown vendor"}</strong>
                  {r.department && (
                    <span className="chip" style={{ background: "#EEF1F4", color: r.department.accent_color || "#6B7480" }}>{r.department.name}</span>
                  )}
                  <span className={`chip ${statusChip(r.status)}`}>{r.status.replace(/_/g, " ")}</span>
                </div>
                <div className="help" style={{ marginTop: 4 }}>
                  {r.app_user?.full_name || "Unknown"} . {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
