import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
// Run in Montreal, not the default iad1 (Washington DC). The Supabase project is in
// Toronto, so this keeps the store's vendor, payment and staff data being processed in
// Canada rather than crossing the border on every request, and it is the nearest region
// to the database, which Vercel recommends for latency.
export const preferredRegion = "yul1";

// Owner and manager only team management. Creates real Supabase Auth accounts and the matching
// app_user row, so the owner never has to open the Supabase dashboard to add or remove staff.
//
// This route needs the SERVICE ROLE key (admin powers: create and delete auth users, bypass RLS).
// The key is read only here, on the server, and is never sent to the browser. When it is missing,
// every method returns 200 with a clear message so the UI shows a note instead of crashing.
//
// CALLER AUTH on every method: the browser sends Authorization: Bearer <access token> from the
// signed-in Supabase session. We verify it with the admin client, look up the caller's app_user row
// by auth_id, and require role owner or manager. Every operation is forced to the caller's own
// store_id; a store_id in the request body is never trusted.

type Caller = {
  id: string;
  store_id: string | null;
  role: "staff" | "lead" | "manager" | "owner";
};

const VALID_ROLES = ["staff", "lead", "manager", "owner"] as const;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// Verify the bearer token and resolve the caller's app_user row. Returns either the caller or a
// ready-to-send error Response (401 when no or bad token, 403 when the role is not allowed).
async function resolveCaller(
  // typed any: the generic SupabaseClient from this @supabase/supabase-js version does not match
  // the inferred ReturnType, the same workaround used in src/app/api/import/route.ts.
  db: any,
  req: Request
): Promise<{ caller: Caller } | { error: Response }> {
  const header = req.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return { error: Response.json({ ok: false, message: "Sign in to manage users." }, { status: 401 }) };
  }

  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { error: Response.json({ ok: false, message: "Your session is not valid. Sign in again." }, { status: 401 }) };
  }

  const { data: member } = await db
    .from("app_user")
    .select("id, store_id, role")
    .eq("auth_id", userData.user.id)
    .maybeSingle();

  if (!member) {
    return { error: Response.json({ ok: false, message: "Your login is not linked to a member yet." }, { status: 403 }) };
  }

  const caller = member as Caller;
  if (caller.role !== "owner" && caller.role !== "manager") {
    return { error: Response.json({ ok: false, message: "Owners and managers only." }, { status: 403 }) };
  }
  return { caller };
}

// GET: the roster for the caller's store.
export async function GET(req: Request) {
  try {
    const db = admin();
    if (!db) {
      return Response.json({ ok: false, message: "Set SUPABASE_SERVICE_ROLE_KEY in the server env to manage users." }, { status: 200 });
    }
    const resolved = await resolveCaller(db, req);
    if ("error" in resolved) return resolved.error;
    const { caller } = resolved;

    const { data, error } = await db
      .from("app_user")
      .select("id, full_name, role, email, auth_id")
      .eq("store_id", caller.store_id)
      .order("full_name");
    if (error) return Response.json({ ok: false, message: error.message }, { status: 200 });

    return Response.json({ ok: true, members: data || [] }, { status: 200 });
  } catch (err: any) {
    return Response.json({ ok: false, message: err?.message || "Could not load the team." }, { status: 200 });
  }
}

// POST: create an auth account and the matching app_user row in the caller's store.
export async function POST(req: Request) {
  try {
    const db = admin();
    if (!db) {
      return Response.json({ ok: false, message: "Set SUPABASE_SERVICE_ROLE_KEY in the server env to manage users." }, { status: 200 });
    }
    const resolved = await resolveCaller(db, req);
    if ("error" in resolved) return resolved.error;
    const { caller } = resolved;

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim();
    const password = String(body?.password || "");
    const full_name = String(body?.full_name || "").trim();
    const role = String(body?.role || "");

    if (!email || !password) {
      return Response.json({ ok: false, message: "Email and password are required." }, { status: 200 });
    }
    if (!full_name) {
      return Response.json({ ok: false, message: "Full name is required." }, { status: 200 });
    }
    if (!(VALID_ROLES as readonly string[]).includes(role)) {
      return Response.json({ ok: false, message: "Pick a role of staff, lead, manager, or owner." }, { status: 200 });
    }
    // Only an owner can mint another owner. Without this, a manager could create an owner
    // account and climb to full control of the store.
    if (role === "owner" && caller.role !== "owner") {
      return Response.json({ ok: false, message: "Only the owner can create another owner." }, { status: 403 });
    }

    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data?.user) {
      return Response.json({ ok: false, message: created.error?.message || "Could not create the login." }, { status: 200 });
    }
    const authId = created.data.user.id;

    const { data: inserted, error: insertErr } = await db
      .from("app_user")
      .insert({ store_id: caller.store_id, full_name, role, email, auth_id: authId })
      .select("id, full_name, role, email, auth_id")
      .single();

    if (insertErr || !inserted) {
      // Insert failed (for example a duplicate email on app_user). Roll back the auth account we
      // just made so a half-created member is never left behind.
      await db.auth.admin.deleteUser(authId);
      return Response.json({ ok: false, message: insertErr?.message || "Could not save the member." }, { status: 200 });
    }

    return Response.json({ ok: true, member: inserted }, { status: 200 });
  } catch (err: any) {
    return Response.json({ ok: false, message: err?.message || "Could not add the member." }, { status: 200 });
  }
}

// DELETE: remove a member of the caller's store, auth account and app_user row both.
export async function DELETE(req: Request) {
  try {
    const db = admin();
    if (!db) {
      return Response.json({ ok: false, message: "Set SUPABASE_SERVICE_ROLE_KEY in the server env to manage users." }, { status: 200 });
    }
    const resolved = await resolveCaller(db, req);
    if ("error" in resolved) return resolved.error;
    const { caller } = resolved;

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    if (!id) {
      return Response.json({ ok: false, message: "No member chosen to remove." }, { status: 200 });
    }
    if (id === caller.id) {
      return Response.json({ ok: false, message: "You cannot remove yourself." }, { status: 200 });
    }

    const { data: target } = await db
      .from("app_user")
      .select("id, store_id, auth_id, role")
      .eq("id", id)
      .maybeSingle();

    if (!target || target.store_id !== caller.store_id) {
      return Response.json({ ok: false, message: "That member is not in your store." }, { status: 200 });
    }
    // A manager cannot remove the owner. Same escalation guard as on create.
    if (target.role === "owner" && caller.role !== "owner") {
      return Response.json({ ok: false, message: "Only the owner can remove an owner." }, { status: 403 });
    }

    if (target.auth_id) {
      await db.auth.admin.deleteUser(target.auth_id as string);
    }
    const { error: delErr } = await db.from("app_user").delete().eq("id", id);
    if (delErr) return Response.json({ ok: false, message: delErr.message }, { status: 200 });

    return Response.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    return Response.json({ ok: false, message: err?.message || "Could not remove the member." }, { status: 200 });
  }
}
