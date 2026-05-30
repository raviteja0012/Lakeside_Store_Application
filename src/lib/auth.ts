"use client";

// Authentication and role helpers.
//
// The app runs in two modes, switched by NEXT_PUBLIC_REQUIRE_AUTH:
//   - unset or "false" (default): demo mode. Open access, no login. The "Acting as"
//     actor dropdown (rgs_actor) decides who a write is attributed to and which role
//     the UI gates against. This is the current behavior and stays the default.
//   - "true": enforced auth. A Supabase Auth session is required. The signed-in
//     member's app_user row (linked by auth_id) decides identity, role, and store.
//
// Keep this client-only and build-safe: it must not require Supabase env or auth.users
// to exist at build time. With blank env the auth calls fail at runtime and the guard
// sends the user to /login, which shows its connection note.

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import type { AppUser } from "@/lib/types";

export type Role = AppUser["role"];

// True when the team has deliberately flipped to enforced auth. Read once at module load.
// Vercel inlines NEXT_PUBLIC_ vars at build, so this is a constant in the client bundle.
export const REQUIRE_AUTH = process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true";

// The app_user row linked to the signed-in auth user. Shape matches the seed and types.
export type Member = {
  id: string;
  store_id: string | null;
  full_name: string;
  role: Role;
};

// Money visibility. Floor staff see quantities, vendors, due dates, and can capture and
// count, but never costs, order or invoice amounts, premiums, or pay. Leads, managers,
// and owner see everything. Conservative: an unknown or missing role is treated as staff.
export function canSeeMoney(role: Role | null | undefined): boolean {
  return role === "lead" || role === "manager" || role === "owner";
}

// Writes to app_user and store are limited to managers and owners (mirrors the DB policy).
export function canManageStore(role: Role | null | undefined): boolean {
  return role === "manager" || role === "owner";
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

// Current Supabase Auth user, or null. Subscribes to auth state so a sign-in or sign-out
// in this tab updates immediately. `ready` flips true once the first session check returns.
export function useAuthUser(): { user: User | null; ready: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, ready };
}

// Resolve the effective actor for the current screen in either mode.
//   - demo mode: the actor is whoever the rgs_actor dropdown has selected. Its role drives
//     UI gating and its id stamps created_by and activity_log.
//   - enforced mode: the actor is always the signed-in member, regardless of any dropdown.
// Pass the screen's already-loaded users list and selected actorId. Returns the actor id to
// write with (null until known) and the role to gate on (null until known). Conservative:
// when nothing resolves, role is null and canSeeMoney treats it as no access.
export function useEffectiveActor(
  users: Pick<AppUser, "id" | "role">[],
  actorId: string
): { effectiveActorId: string | null; role: Role | null } {
  const { member } = useMember();
  if (REQUIRE_AUTH) {
    return { effectiveActorId: member?.id ?? null, role: member?.role ?? null };
  }
  const selected = users.find((u) => u.id === actorId);
  return { effectiveActorId: actorId || null, role: selected?.role ?? null };
}

// The current role for screens that have no actor dropdown (dashboard, reports).
//   - enforced mode: the signed-in member's role.
//   - demo mode: the role of the saved rgs_actor, looked up in app_user. Falls back to the
//     first user if nothing is saved, matching how the dropdown screens seed their selection.
// Returns null until resolved. Conservative: an unresolved role hides money via canSeeMoney.
const ACTOR_KEY = "rgs_actor";
export function useCurrentRole(): { role: Role | null; ready: boolean } {
  const { member, ready: memberReady } = useMember();
  const [role, setRole] = useState<Role | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (REQUIRE_AUTH) return;
    let alive = true;
    (async () => {
      const saved = typeof window !== "undefined" ? localStorage.getItem(ACTOR_KEY) : null;
      let q = supabase.from("app_user").select("id, role").order("full_name");
      const { data } = await q;
      const users = (data as Pick<AppUser, "id" | "role">[]) || [];
      const picked = (saved && users.find((u) => u.id === saved)) || users[0] || null;
      if (!alive) return;
      setRole(picked?.role ?? null);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (REQUIRE_AUTH) return { role: member?.role ?? null, ready: memberReady };
  return { role, ready };
}

// The app_user row for the signed-in auth user, resolved via auth_id. Returns null when
// not signed in, when no app_user is linked yet, or when env or the auth_id column is
// absent (the query then errors and we degrade to null rather than throwing).
export function useMember(): { member: Member | null; ready: boolean } {
  const { user, ready: authReady } = useAuthUser();
  const [member, setMember] = useState<Member | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    let alive = true;
    (async () => {
      if (!user) {
        if (alive) {
          setMember(null);
          setReady(true);
        }
        return;
      }
      const { data } = await supabase
        .from("app_user")
        .select("id, store_id, full_name, role")
        .eq("auth_id", user.id)
        .maybeSingle();
      if (!alive) return;
      setMember((data as Member) || null);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [user, authReady]);

  return { member, ready };
}
