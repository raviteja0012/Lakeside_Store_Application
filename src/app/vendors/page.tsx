"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { chipClass, labelize } from "@/lib/status";
import type { Vendor } from "@/lib/types";

export default function Vendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("vendor")
        .select("id, name, rep_name, phone, email, products_we_carry, default_terms, status, notes, department:department_id(name, accent_color)")
        .order("name");
      if (error) setError(error.message);
      else setVendors((data as unknown as Vendor[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return vendors;
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(term) ||
        (v.products_we_carry || "").toLowerCase().includes(term) ||
        (v.rep_name || "").toLowerCase().includes(term)
    );
  }, [vendors, q]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Vendors</h1>
        <span className="help">{vendors.length} in the directory</span>
      </div>

      <input
        className="input"
        placeholder="Search by name, product, or rep"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 16 }}
        aria-label="Search vendors"
      />

      {loading && <p className="help">Loading vendors.</p>}
      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Connection</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p className="help" style={{ margin: 0 }}>No vendors match that search.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((v) => (
          <Link key={v.id} href={`/vendors/${v.id}`} className="card" style={{ padding: 14, textDecoration: "none", color: "inherit", display: "block" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 15 }}>{v.name}</strong>
              {v.department && <span className="chip" style={{ background: "#EEF1F4", color: v.department.accent_color || "#6B7480" }}>{v.department.name}</span>}
              <span className={`chip ${chipClass(v.status)}`}>{labelize(v.status)}</span>
              {v.default_terms && <span className="chip chip-neutral">{v.default_terms}</span>}
            </div>
            {v.products_we_carry && <div className="help" style={{ marginTop: 6 }}>{v.products_we_carry}</div>}
            {(v.rep_name || v.phone) && (
              <div className="help" style={{ marginTop: 4 }}>
                {v.rep_name}{v.rep_name && v.phone ? " . " : ""}{v.phone}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
