"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useActiveStore } from "@/lib/store";
import { REQUIRE_AUTH, useMember } from "@/lib/auth";
import { formatCAD } from "@/lib/format";

// The shape the import API returns. The route auto-detects the bookings ledger vs the weekly
// schedule and tags the result with `kind`; `message` summarizes what loaded, and the bookings
// result also carries a per-sheet breakdown.
type ImportResult = {
  ok: boolean;
  kind?: "bookings" | "schedule";
  message?: string;
  summary?: any;
  inserted?: Record<string, number>;
  skippedVendors?: number;
  skippedShifts?: number;
};

// Current session access token for the Authorization header. Null when not signed in or when
// env is blank (the call fails and we degrade rather than throw).
async function getToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export default function Import() {
  const { storeId, ready } = useActiveStore();
  const { member } = useMember();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file || !storeId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("store_id", storeId);
      if (member?.id) fd.append("actor_id", member.id);

      const headers: Record<string, string> = {};
      if (REQUIRE_AUTH) {
        const token = await getToken();
        if (token) headers.authorization = `Bearer ${token}`;
      }

      const res = await fetch("/api/import", { method: "POST", body: fd, headers });
      const data = (await res.json().catch(() => ({}))) as ImportResult;
      if (data.ok) setResult(data);
      else setError(data.message || "The import did not finish.");
    } catch (e: any) {
      setError(e?.message || "The import did not finish.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header className="page-head">
        <div>
          <h1 className="page-title">Import a spreadsheet</h1>
          <p className="page-sub">
            Upload the 2026 bookings workbook or the weekly schedule. It detects which one and loads it into the
            current store: vendors, orders, invoices, and notes from the ledger, or employees and shifts from the
            schedule. Anything already on file is skipped, so it is safe to re-run.
          </p>
        </div>
      </header>

      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div>
          <label className="label" htmlFor="bookings-file">Workbook (.xlsx): bookings ledger or weekly schedule</label>
          <input
            id="bookings-file"
            className="input"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError(null);
            }}
          />
        </div>
        <div>
          <button className="btn-primary" onClick={submit} disabled={busy || !file || !ready || !storeId}>
            {busy ? "Loading." : "Upload and load"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Could not load</span>
          <p className="help" style={{ marginTop: 8, marginBottom: 0 }}>{error}</p>
        </div>
      )}

      {result?.ok && (
        <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
          <span className="chip chip-progress">Done</span>
          {result.message && <p style={{ margin: 0 }}>{result.message}</p>}
          {result.kind === "bookings" && Array.isArray(result.summary?.perSheet) && (
            <div style={{ display: "grid", gap: 8 }}>
              {result.summary.perSheet.map((s: any) => (
                <div
                  key={s.sheet}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}
                >
                  <strong style={{ fontSize: 14 }}>{s.sheet}</strong>
                  <span className="help tabular">
                    {s.vendors} vendors . orders {formatCAD(s.orderSum)} . invoices {formatCAD(s.invSum)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
