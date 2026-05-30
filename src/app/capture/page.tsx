"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, DOCUMENTS_BUCKET } from "@/lib/supabaseClient";
import { formatCAD, round2 } from "@/lib/format";
import type { AppUser, Department, Draft, LineItem } from "@/lib/types";

type VendorLite = { id: string; name: string; department_id: string | null; default_terms: string | null };
type POLite = { vendor_id: string | null; order_amount: number | null };

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(new Error("could not read file"));
    r.readAsDataURL(file);
  });
}

const LOW_CONFIDENCE = 0.7;

export default function Capture() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [pos, setPos] = useState<POLite[]>([]);
  const [taxRate, setTaxRate] = useState(0.13);
  const [deptId, setDeptId] = useState("");
  const [userId, setUserId] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [manual, setManual] = useState(false);
  const [ack, setAck] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: depts } = await supabase.from("department").select("id, name, accent_color, parent_department_id").order("name");
      const { data: us } = await supabase.from("app_user").select("id, full_name, role").order("full_name");
      const { data: vs } = await supabase.from("vendor").select("id, name, department_id, default_terms");
      const { data: po } = await supabase.from("purchase_order").select("vendor_id, order_amount");
      const { data: tr } = await supabase.from("tax_rules").select("rate").eq("region", "Ontario").limit(1).maybeSingle();
      const ds = (depts as Department[]) || [];
      const usr = (us as AppUser[]) || [];
      setDepartments(ds);
      setUsers(usr);
      setVendors((vs as VendorLite[]) || []);
      setPos((po as POLite[]) || []);
      if (tr && tr.rate != null) setTaxRate(Number(tr.rate));
      if (ds[0]) setDeptId(ds.find((d) => d.name === "Hardware")?.id || ds[0].id);
      if (usr[0]) setUserId(usr.find((u) => u.role === "staff")?.id || usr[0].id);
    })();
  }, []);

  function pickFile(f: File | null) {
    setError(null);
    setSaved(false);
    setDraft(null);
    setManual(false);
    setAck(false);
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  // Fallback for a phone order with no document: open the same confirm form, blank, so it
  // can be typed and posted to the feed with author and time. Photo-first stays the default.
  function startManual() {
    setError(null);
    setSaved(false);
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setAck(false);
    setManual(true);
    setDraft({ vendor: "", invoice_date: "", notes: "", line_items: [{ description: "", qty: null, unit_cost: null, retail_price_note: null, confidence: 1 }] });
  }

  async function extract() {
    if (!file) return;
    setExtracting(true);
    setError(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const resp = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64, mediaType: file.type })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || data.error || "extraction failed");
      setAck(false);
      setDraft({
        vendor: data.vendor || "",
        invoice_date: data.invoice_date || "",
        notes: data.notes || "",
        line_items: (data.line_items || []).map((l: any) => ({
          description: l.description || "",
          qty: l.qty ?? null,
          unit_cost: l.unit_cost ?? null,
          retail_price_note: l.retail_price_note ?? null,
          confidence: l.confidence ?? null
        }))
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExtracting(false);
    }
  }

  function updateLine(i: number, patch: Partial<LineItem>) {
    if (!draft) return;
    const next = [...draft.line_items];
    next[i] = { ...next[i], ...patch };
    setDraft({ ...draft, line_items: next });
  }

  function addLine() {
    if (!draft) return;
    setDraft({ ...draft, line_items: [...draft.line_items, { description: "", qty: null, unit_cost: null, retail_price_note: null, confidence: 1 }] });
  }

  function removeLine(i: number) {
    if (!draft) return;
    setDraft({ ...draft, line_items: draft.line_items.filter((_, idx) => idx !== i) });
  }

  // Totals (pre-tax subtotal, HST, total). Money is dollars in the demo.
  const subtotal = draft ? round2(draft.line_items.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0)) : 0;
  const hst = round2(subtotal * taxRate);
  const total = round2(subtotal + hst);

  // Match the typed vendor to a known vendor in this department, then look for an order to reconcile against.
  const matchedVendor = draft
    ? vendors.find((v) => v.department_id === deptId && v.name.trim().toLowerCase() === draft.vendor.trim().toLowerCase())
    : undefined;
  const matchedPO = matchedVendor ? pos.find((p) => p.vendor_id === matchedVendor.id && p.order_amount != null) : undefined;
  const orderAmount = matchedPO?.order_amount ?? null;
  const discrepancy = orderAmount != null ? round2(subtotal - orderAmount) : null;
  const hasDiscrepancy = discrepancy != null && Math.abs(discrepancy) >= 0.01;

  async function save() {
    if (!draft || (!file && !manual) || !deptId || !userId) return;
    if (hasDiscrepancy && !ack) return;
    setSaving(true);
    setError(null);
    try {
      // Photo capture uploads the document; a manual phone-order entry has no file to store.
      let path: string | null = null;
      if (file) {
        path = `${deptId}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
        const up = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, file, { upsert: false });
        if (up.error) throw new Error(`storage: ${up.error.message}`);
      }

      const ev = await supabase
        .from("receiving_event")
        .insert({
          department_id: deptId,
          vendor_id: matchedVendor?.id ?? null,
          vendor_name: draft.vendor,
          received_date: draft.invoice_date || null,
          source_file_path: path,
          status: "confirmed",
          discrepancy_ack: hasDiscrepancy ? ack : false,
          created_by: userId
        })
        .select("id")
        .single();
      if (ev.error) throw new Error(`event: ${ev.error.message}`);

      const eventId = ev.data.id as string;
      if (draft.line_items.length) {
        const lines = draft.line_items.map((l) => ({
          receiving_event_id: eventId,
          description: l.description,
          qty: l.qty,
          unit_cost: l.unit_cost,
          retail_price_note: l.retail_price_note,
          confidence: l.confidence
        }));
        const li = await supabase.from("receiving_line").insert(lines);
        if (li.error) throw new Error(`lines: ${li.error.message}`);
      }

      await supabase.from("activity_log").insert({ actor_id: userId, action: "received", entity: "receiving_event", entity_id: eventId });

      // Clear the form fields directly. Do not call pickFile(null) here: it resets `saved`
      // to false in the same React batch, which would hide the confirmation card.
      setSaved(true);
      setDraft(null);
      setFile(null);
      setManual(false);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      setAck(false);
      setTimeout(() => router.push("/"), 900);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Capture a receiving</h1>
        <span className="help">Drop the invoice, confirm, done</span>
      </div>

      <div className="card" style={{ padding: 16, display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label className="label" htmlFor="dept">Department</label>
            <select id="dept" className="input" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="user">Acting as</label>
            <select id="user" className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
            </select>
          </div>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0] || null); }}
          onClick={() => inputRef.current?.click()}
          style={{ border: "2px dashed var(--border)", borderRadius: 12, padding: 24, textAlign: "center", cursor: "pointer", background: "#fff" }}
        >
          {preview ? (
            <img src={preview} alt="preview" style={{ maxHeight: 220, maxWidth: "100%", borderRadius: 8 }} />
          ) : file ? (
            <p style={{ margin: 0 }}>{file.name}</p>
          ) : (
            <div>
              <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Drop a vendor invoice here</p>
              <p className="help" style={{ margin: 0 }}>or click to choose an image or PDF</p>
            </div>
          )}
          <input ref={inputRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => pickFile(e.target.files?.[0] || null)} />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={extract} disabled={!file || extracting}>
            {extracting ? "Reading the invoice." : "Extract"}
          </button>
          {!file && !manual && <button className="btn-ghost" onClick={startManual}>Enter manually</button>}
          {(file || manual) && <button className="btn-ghost" onClick={() => pickFile(null)}>Clear</button>}
        </div>
        {!file && !draft && !saved && (
          <p className="help" style={{ margin: 0 }}>The invoice photo fills the form for you. You confirm one screen, then save. No document? Enter a phone order by hand.</p>
        )}
      </div>

      {error && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-error">Error</span>
          <p className="help" style={{ marginTop: 8 }}>{error}</p>
        </div>
      )}

      {saved && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-success">Saved</span>
          <p className="help" style={{ marginTop: 8 }}>Posted to the feed. Taking you there.</p>
        </div>
      )}

      {draft && (
        <div className="card" style={{ padding: 16, display: "grid", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>{manual ? "Enter the order" : "Confirm"}</h2>
            <span className="chip chip-progress">{manual ? "Type the vendor, date, and lines, then save" : "Fields in amber were uncertain, check them"}</span>
          </div>

          {hasDiscrepancy && (
            <div className="card" style={{ padding: 12, background: "var(--warning-tint)", borderColor: "var(--warning-base)" }}>
              <span className="chip chip-warning">&#9888; Order vs invoiced</span>
              <p className="help" style={{ marginTop: 8, color: "var(--text-primary)" }}>
                Ordered {formatCAD(orderAmount)} vs invoiced {formatCAD(subtotal)} (pre-tax).{" "}
                {discrepancy! < 0
                  ? `Short by ${formatCAD(Math.abs(discrepancy!))}. Check for missing items.`
                  : `Over by ${formatCAD(discrepancy!)}. Check for extra or unordered items.`}
              </p>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 13 }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                I checked this discrepancy
              </label>
            </div>
          )}
          {matchedVendor && !matchedPO && (
            <p className="help">No order amount on file for {matchedVendor.name} to compare against.</p>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
            <div>
              <label className="label">Vendor</label>
              <input className="input" value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} />
            </div>
            <div>
              <label className="label">Invoice date</label>
              <input className="input" type="date" value={draft.invoice_date} onChange={(e) => setDraft({ ...draft, invoice_date: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">Line items</label>
            <div style={{ display: "grid", gap: 8 }}>
              <div className="help" style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1.2fr 1.2fr 32px", gap: 8 }}>
                <span>Description</span><span>Qty</span><span>Unit cost</span><span>Retail note</span><span></span>
              </div>
              {draft.line_items.map((l, i) => {
                const low = l.confidence !== null && l.confidence < LOW_CONFIDENCE;
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1.2fr 1.2fr 32px", gap: 8 }}>
                    <input className={`input ${low ? "field-flag" : ""}`} value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                    <input className={`input tabular ${low ? "field-flag" : ""}`} value={l.qty ?? ""} onChange={(e) => updateLine(i, { qty: e.target.value === "" ? null : Number(e.target.value) })} />
                    <input className={`input tabular ${low ? "field-flag" : ""}`} value={l.unit_cost ?? ""} onChange={(e) => updateLine(i, { unit_cost: e.target.value === "" ? null : Number(e.target.value) })} />
                    <input className="input tabular" value={l.retail_price_note ?? ""} onChange={(e) => updateLine(i, { retail_price_note: e.target.value === "" ? null : Number(e.target.value) })} />
                    <button className="btn-ghost" style={{ padding: "6px 8px" }} onClick={() => removeLine(i)} aria-label="remove line">x</button>
                  </div>
                );
              })}
            </div>
            <button className="btn-ghost" style={{ marginTop: 8 }} onClick={addLine}>Add line</button>
          </div>

          <div style={{ maxWidth: 280, marginLeft: "auto", width: "100%" }}>
            <div className="totals-row"><span className="help">Subtotal</span><span className="tabular">{formatCAD(subtotal)}</span></div>
            <div className="totals-row"><span className="help">HST ({Math.round(taxRate * 100)}%)</span><span className="tabular">{formatCAD(hst)}</span></div>
            <div className="totals-row total"><span>Total</span><span className="tabular">{formatCAD(total)}</span></div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>

          <div>
            <button className="btn-primary" onClick={save} disabled={saving || (hasDiscrepancy && !ack)}>
              {saving ? "Saving." : "Save to feed"}
            </button>
            {hasDiscrepancy && !ack && (
              <span className="help" style={{ marginLeft: 10 }}>Acknowledge the discrepancy to save.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
