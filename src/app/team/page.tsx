"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { REQUIRE_AUTH, canManageStore, useMember } from "@/lib/auth";

// Team. The owner (and managers) create and manage staff logins from inside the app, without
// opening the Supabase dashboard. Every call goes to /api/admin/users, which holds the service
// role and creates the real Supabase Auth account plus the matching app_user row. The browser
// only ever sends the signed-in access token; the service key stays on the server.
//
// Roles here are the login roles (staff, lead, manager, owner), not the HR job title. This screen
// keeps money out entirely.

type TeamMember = {
  id: string;
  full_name: string;
  role: string;
  email: string | null;
  auth_id: string | null;
};

const ROLES = ["staff", "lead", "manager", "owner"];
const emptyForm = { email: "", full_name: "", role: "staff", password: "" };

// Get the current session access token for the Authorization header. Null when not signed in or
// when env is blank (the call fails and we degrade rather than throw).
async function getToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export default function Team() {
  const { member, ready } = useMember();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const canManage = canManageStore(member?.role);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/users", {
        headers: token ? { authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setMembers((data.members as TeamMember[]) || []);
      } else {
        setMembers([]);
        setError(data.message || "Could not load the team.");
      }
    } catch (e: any) {
      setError(e?.message || "Could not load the team.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    // In demo mode there is no signed-in member, so canManage is false and we never call the API.
    if (REQUIRE_AUTH && !canManage) {
      setLoading(false);
      return;
    }
    load();
  }, [ready, canManage, load]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email.trim() || !form.password || !form.full_name.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          full_name: form.full_name.trim(),
          role: form.role
        })
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setNotice(`Added ${data.member?.full_name || form.full_name.trim()}.`);
        setForm(emptyForm);
        await load();
      } else {
        setError(data.message || "Could not add the member.");
      }
    } catch (e: any) {
      setError(e?.message || "Could not add the member.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(m: TeamMember) {
    if (typeof window !== "undefined" && !window.confirm(`Remove ${m.full_name}? Their login will stop working.`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ id: m.id })
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setNotice(`Removed ${m.full_name}.`);
        await load();
      } else {
        setError(data.message || "Could not remove the member.");
      }
    } catch (e: any) {
      setError(e?.message || "Could not remove the member.");
    } finally {
      setBusy(false);
    }
  }

  // Owners and managers only. In demo mode no one is signed in, so we fall through to the demo
  // card below rather than blocking the screen.
  if (REQUIRE_AUTH && ready && !canManage) {
    return (
      <div style={{ display: "grid", gap: 20 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Team</h1>
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p className="help" style={{ margin: 0 }}>Owners and managers only.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Team</h1>
      </div>
      <p className="help" style={{ marginTop: -12 }}>
        Create and manage staff logins here. Each member gets a real account and can sign in with their email and password.
      </p>

      {!REQUIRE_AUTH && (
        <div className="card" style={{ padding: 16 }}>
          <span className="chip chip-progress">Demo</span>
          <p className="help" style={{ marginTop: 8, marginBottom: 0 }}>
            This page manages real staff logins. It becomes active once login is turned on (see the RUNBOOK,
            section &quot;Turn on login&quot;). Until then you can look around, but saving will return a note
            asking you to sign in and set the server key.
          </p>
        </div>
      )}

      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <strong style={{ fontSize: 15 }}>Add member</strong>
        <form onSubmit={addMember} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <div>
              <label className="label" htmlFor="m-email">Email</label>
              <input id="m-email" className="input" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="m-name">Full name</label>
              <input id="m-name" className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="m-role">Role</label>
              <select id="m-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="m-pass">Password</label>
              <input id="m-pass" className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn-primary" type="submit" disabled={busy || !form.email.trim() || !form.password || !form.full_name.trim()}>
              {busy ? "Saving." : "Add member"}
            </button>
            {notice && <span className="chip chip-progress">{notice}</span>}
            {error && <span className="chip chip-error">{error}</span>}
          </div>
        </form>
        <p className="help" style={{ margin: 0 }}>
          The new member signs in at the <Link href="/login" className="help" style={{ textDecoration: "underline" }}>sign-in page</Link> with this email and password.
        </p>
      </div>

      {loading && <p className="help">Loading.</p>}

      {!loading && members.length === 0 && !error && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <p className="help" style={{ margin: 0 }}>No members yet. Add the first one above.</p>
        </div>
      )}

      {!loading && members.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Name</th>
                <th style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Role</th>
                <th style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Email</th>
                <th style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Login</th>
                <th style={{ padding: "10px 14px" }} />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 14px" }}><strong style={{ fontSize: 14 }}>{m.full_name}</strong></td>
                  <td style={{ padding: "10px 14px" }}><span className="chip chip-neutral">{m.role}</span></td>
                  <td style={{ padding: "10px 14px" }} className="help">{m.email || "no email"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    {m.auth_id ? <span className="chip chip-success">linked</span> : <span className="chip chip-neutral">not linked</span>}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    {member?.id !== m.id && (
                      <button className="btn-ghost" style={{ padding: "4px 10px" }} disabled={busy} onClick={() => removeMember(m)}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
