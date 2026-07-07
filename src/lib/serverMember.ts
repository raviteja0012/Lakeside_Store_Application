import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side caller resolution for the API routes. Mirrors the app's two modes:
// - Demo mode (NEXT_PUBLIC_REQUIRE_AUTH unset or "false"): open by design; requests carry no
//   token and the dev RLS policies allow the anon key. resolveMember returns a null member.
// - Enforced mode ("true"): a request must carry Authorization: Bearer <session token>. The
//   token is verified, the caller's app_user row resolved by auth_id, and every query runs
//   through a client that carries the token so the per-store RLS policies apply as the caller.
// Vercel inlines NEXT_PUBLIC_ vars at build time on the server too, so this is a constant.
export const REQUIRE_AUTH_SERVER = process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true";

export type ServerMember = {
  id: string;
  store_id: string | null;
  role: "staff" | "lead" | "manager" | "owner";
};

// Same rule as src/lib/auth.ts canSeeMoney, duplicated here because that module is client-only.
export function memberSeesMoney(role: ServerMember["role"] | null | undefined): boolean {
  return role === "lead" || role === "manager" || role === "owner";
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
}

type Resolved =
  | { ok: true; client: SupabaseClient; member: ServerMember | null }
  | { ok: false; status: number; message: string };

// Resolve the caller and hand back the client their queries should run through.
// In enforced mode a missing, invalid, or unlinked token is a hard failure so no route can be
// driven anonymously once login is on. In demo mode the anon client and a null member come back.
export async function resolveMember(req: Request): Promise<Resolved> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, status: 200, message: "Supabase env is not set." };
  }

  const token = bearerToken(req);
  if (!token) {
    if (REQUIRE_AUTH_SERVER) {
      return { ok: false, status: 401, message: "Sign in to use this." };
    }
    return { ok: true, client: createClient(url, anon, { auth: { persistSession: false } }), member: null };
  }

  const client = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: userData, error: userErr } = await client.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, message: "Your session is not valid. Sign in again." };
  }
  const { data: member } = await client
    .from("app_user")
    .select("id, store_id, role")
    .eq("auth_id", userData.user.id)
    .maybeSingle();
  if (!member) {
    return { ok: false, status: 403, message: "Your login is not linked to a member yet." };
  }
  return { ok: true, client, member: member as ServerMember };
}
