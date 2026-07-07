"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabaseClient";
import { REQUIRE_AUTH, useAuthUser } from "@/lib/auth";

// Sign-in screen. Email and password only, no public sign-up: accounts are created by the
// owner in Supabase. On success we send the member to the feed. Already-signed-in members
// and demo mode (auth not required) bounce home, so /login is only ever the gate.
export default function Login() {
  const router = useRouter();
  const { user, ready } = useAuthUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!REQUIRE_AUTH || user) router.replace("/");
  }, [ready, user, router]);

  async function signIn() {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(error.message);
      router.replace("/");
    } catch (e: any) {
      setError(e.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--app-bg)", padding: 16 }}>
      <div className="card" style={{ padding: 24, display: "grid", gap: 16, width: "100%", maxWidth: 380 }}>
        <div className="brand" style={{ marginBottom: 8 }}><span className="brand-mark">R</span><span className="brand-name">Robinsons<br/>General Store</span></div>
        <div>
          <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Sign in</h1>
          <p className="help" style={{ margin: 0 }}>Robinsons General Store</p>
        </div>

        {!SUPABASE_CONFIGURED && (
          <div className="card" style={{ padding: 12 }}>
            <span className="chip chip-error">Connection</span>
            <p className="help" style={{ marginTop: 8 }}>
              Sign-in is not configured yet. Set the Supabase env values and enable Email auth.
            </p>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            signIn();
          }}
          style={{ display: "grid", gap: 12 }}
        >
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <div className="card" style={{ padding: 10 }}>
              <span className="chip chip-error">Error</span>
              <span className="help" style={{ marginLeft: 8 }}>{error}</span>
            </div>
          )}
          <button className="btn-primary" type="submit" disabled={busy || !email.trim() || !password}>
            {busy ? "Signing in." : "Sign in"}
          </button>
        </form>

        <p className="help" style={{ margin: 0 }}>
          No account? There is no public sign-up. Ask the owner to create one for you.
        </p>
      </div>
    </div>
  );
}
