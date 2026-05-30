"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { REQUIRE_AUTH, useAuthUser } from "@/lib/auth";

// Client-side auth guard. Wraps the app in the layout.
//
// Demo mode (REQUIRE_AUTH false): renders children unchanged, so behavior is exactly as
// today. No redirect, no session check on the hot path.
//
// Enforced mode (REQUIRE_AUTH true): when there is no session, send the user to /login.
// The /login route renders without a session so the gate does not trap it. We intentionally
// avoid server middleware here: middleware runs at the edge and would need env to behave,
// which could break the blank-env build. A client guard degrades gracefully instead.
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { user, ready } = useAuthUser();

  const onLogin = pathname === "/login";

  useEffect(() => {
    if (!REQUIRE_AUTH) return;
    if (ready && !user && !onLogin) router.replace("/login");
  }, [ready, user, onLogin, router]);

  if (!REQUIRE_AUTH) return <>{children}</>;

  // Let the login page through regardless of session so members can sign in.
  if (onLogin) return <>{children}</>;

  // Hold the protected UI until the session check resolves, and while redirecting an
  // unauthenticated visitor, so private screens never flash before the gate.
  if (!ready || !user) {
    return <p className="help" style={{ padding: "24px 20px" }}>Checking your session.</p>;
  }

  return <>{children}</>;
}
