"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useActiveStore } from "@/lib/store";
import { REQUIRE_AUTH, useEffectiveActor } from "@/lib/auth";
import { canEdit, voidRow } from "@/lib/edit";
import type { KnowledgeNote, Department, AppUser } from "@/lib/types";

export default function Knowledge() {
  const { storeId, ready } = useActiveStore();
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // add-note form
  const [adding, setAdding] = useState(false);
  const [topic, setTopic] = useState("");
  const [body, setBody] = useState("");
  const [deptId, setDeptId] = useState("");
  const [tags, setTags] = useState("");
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);

  // inline edit of an existing note (owners and managers only)
  const [editId, setEditId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTags, setEditTags] = useState("");
  const [busy, setBusy] = useState(false);

  // Effective actor: the signed-in member in enforced auth, else the chosen author.
  const { effectiveActorId, role } = useEffectiveActor(users, userId);

  async function load() {
    let query = supabase
      .from("knowledge_note")
      .select("id, department_id, topic, body, tags, created_at, department:department_id(name, accent_color), app_user:created_by(full_name)")
      .is("voided_at", null)
      .order("created_at", { ascending: false });
    if (storeId) query = query.eq("store_id", storeId);
    const { data, error } = await query;
    if (error) setError(error.message);
    else setNotes((data as unknown as KnowledgeNote[]) || []);
  }

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    (async () => {
      await load();
      let dq = supabase.from("department").select("id, name, accent_color, parent_department_id").order("name");
      if (storeId) dq = dq.eq("store_id", storeId);
      const { data: ds } = await dq;
      const { data: us } = await supabase.from("app_user").select("id, full_name, role").order("full_name");
      setDepartments((ds as Department[]) || []);
      setUsers((us as AppUser[]) || []);
      if (us && us.length) setUserId((us as AppUser[])[0].id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storeId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return notes;
    return notes.filter(
      (n) =>
        (n.topic || "").toLowerCase().includes(term) ||
        (n.body || "").toLowerCase().includes(term) ||
        (n.tags || []).join(" ").toLowerCase().includes(term) ||
        (n.department?.name || "").toLowerCase().includes(term)
    );
  }, [notes, q]);

  async function save() {
    if (!topic.trim() || !body.trim() || !effectiveActorId) return;
    setSaving(true);
    setError(null);
    try {
      const tagArr = tags.split(",").map((t) => t.trim()).filter(Boolean);
      const ins = await supabase.from("knowledge_note").insert({
        store_id: storeId,
        department_id: deptId || null,
        topic: topic.trim(),
        body: body.trim(),
        tags: tagArr.length ? tagArr : null,
        created_by: effectiveActorId
      }).select("id").single();
      if (ins.error) throw new Error(ins.error.message);
      await supabase.from("activity_log").insert({ actor_id: effectiveActorId, action: "note_added", entity: "knowledge_note", entity_id: ins.data.id as string });
      setTopic(""); setBody(""); setDeptId(""); setTags(""); setAdding(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(n: KnowledgeNote) {
    setEditId(n.id);
    setEditTopic(n.topic || "");
    setEditBody(n.body || "");
    setEditTags((n.tags || []).join(", "));
  }

  async function saveEdit() {
    if (!editId || !editTopic.trim() || !editBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const tagArr = editTags.split(",").map((t) => t.trim()).filter(Boolean);
      const up = await supabase.from("knowledge_note").update({
        topic: editTopic.trim(),
        body: editBody.trim(),
        tags: tagArr.length ? tagArr : null
      }).eq("id", editId);
      if (up.error) throw new Error(up.error.message);
      if (effectiveActorId) await supabase.from("activity_log").insert({ actor_id: effectiveActorId, action: "note_edited", entity: "knowledge_note", entity_id: editId });
      setEditId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeNote(n: KnowledgeNote) {
    if (!window.confirm(`Delete "${n.topic || "this note"}"? It will be hidden but kept for the record.`)) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("knowledge_note", n.id, effectiveActorId);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Knowledge base</h1>
          <p className="page-sub">The rules and exceptions that used to live only in the owner&apos;s head. Search them, add to them.</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "+ Add note"}</button>
        </div>
      </header>

      {adding && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div>
              <label className="label">Topic</label>
              <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div>
              <label className="label">Department</label>
              <select className="input" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                <option value="">Store-wide</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Note</label>
            <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="label">Tags (comma separated)</label>
              <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="reorder, payments" />
            </div>
            {!REQUIRE_AUTH && (
              <div>
                <label className="label">Author</label>
                <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
                </select>
              </div>
            )}
          </div>
          <div>
            <button className="btn-primary" onClick={save} disabled={saving || !topic.trim() || !body.trim()}>{saving ? "Saving." : "Save note"}</button>
          </div>
        </div>
      )}

      <input className="input" placeholder="Search topic, text, tag, or department" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16 }} aria-label="Search knowledge" />

      {loading && <p className="help">Loading notes.</p>}
      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="chip chip-error">Connection</span>
          <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p className="help" style={{ margin: 0 }}>No notes match. Add the first one with + Add note.</p>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((n) => (
          <div key={n.id} className="card" style={{ padding: 14 }}>
            {editId === n.id ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <label className="label">Topic</label>
                  <input className="input" value={editTopic} onChange={(e) => setEditTopic(e.target.value)} />
                </div>
                <div>
                  <label className="label">Note</label>
                  <textarea className="input" rows={3} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                </div>
                <div>
                  <label className="label">Tags (comma separated)</label>
                  <input className="input" value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="reorder, payments" />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-primary" onClick={saveEdit} disabled={busy || !editTopic.trim() || !editBody.trim()}>{busy ? "Saving." : "Save"}</button>
                  <button className="btn-ghost" onClick={() => setEditId(null)} disabled={busy}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 15 }}>{n.topic}</strong>
                  {n.department && <span className="chip" style={{ background: "#EEF1F4", color: n.department.accent_color || "#6B7480" }}>{n.department.name}</span>}
                  {canEdit(role) && (
                    <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                      <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startEdit(n)} disabled={busy}>Edit</button>
                      <button className="btn-ghost" style={{ padding: "4px 10px", color: "var(--error-base)" }} onClick={() => removeNote(n)} disabled={busy}>Delete</button>
                    </span>
                  )}
                </div>
                <p style={{ margin: "8px 0 0" }}>{n.body}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {(n.tags || []).map((t) => <span key={t} className="chip chip-neutral">{t}</span>)}
                </div>
                <div className="help" style={{ marginTop: 8 }}>{n.app_user?.full_name || "Unknown"} . {new Date(n.created_at).toLocaleDateString()}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
