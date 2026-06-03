"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useActiveStore } from "@/lib/store";
import { REQUIRE_AUTH, useMember } from "@/lib/auth";
import { formatCAD } from "@/lib/format";

// The shape the import API returns. perSheet drives the result card.
type PerSheet = { sheet: string; vendors: number; orderSum: number; invSum: number };
type ImportResult = {
  ok: boolean;
  message?: string;
  skippedVendors?: number;
  summary?: { vendors: number; orders: number; invoices: number; payments: number; notes: number; perSheet: PerSheet[] };
  inserted?: { vendors: number; orders: number; invoices: number; payments: number; notes: number };
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
      <h1 style={{ fontSize: 22, margin: 0 }}>Import the bookings sheet</h1>
      <p className="help" style={{ marginTop: -12 }}>
        Upload the 2026 bookings workbook. It loads vendors, orders, invoices, and notes into the current store,
        skips any vendor already present, and is safe to re-run.
      </p>

      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div>
          <label className="label" htmlFor="bookings-file">Bookings workbook (.xlsx)</label>
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

      {result?.ok && result.summary && result.inserted && (
        <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
          <span className="chip chip-progress">Done</span>

          <div style={{ display: "grid", gap: 8 }}>
            {result.summary.perSheet.map((s) => (
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

          <p className="help" style={{ margin: 0 }}>
            Loaded {result.inserted.vendors} vendors, {result.inserted.orders} orders, {result.inserted.invoices} invoices,
            {" "}{result.inserted.payments} payments, and {result.inserted.notes} notes.
            {" "}Skipped {result.skippedVendors ?? 0} vendors already in this store.
          </p>
        </div>
      )}
    </div>
  );
}
