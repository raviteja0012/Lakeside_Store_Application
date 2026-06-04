"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AREAS, NAV, STAFF_NAV, AREA_KEY, areaForPath, type Area } from "@/lib/nav";
import { useActiveStore } from "@/lib/store";
import { REQUIRE_AUTH, useMember, canManageStore, signOut, type Role } from "@/lib/auth";
import { useViewRole, isManagerView, ROLE_RANK } from "@/lib/view";
import NotificationBell from "@/components/NotificationBell";

const navLink = { textDecoration: "none", color: "var(--text-secondary)", fontWeight: 500 } as const;
const navLinkActive = { textDecoration: "none", color: "var(--primary)", fontWeight: 600 } as const;

const ROLE_LABEL: Record<Role, string> = { staff: "Staff", lead: "Lead", manager: "Manager", owner: "Owner" };

export default function Header() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [area, setArea] = useState<Area>(() => areaForPath(pathname));
  const { stores, storeId, setStore } = useActiveStore();
  const { member } = useMember();
  const { actualRole, viewRole, canPreview, setViewRole } = useViewRole();

  const managerView = isManagerView(viewRole);
  const previewing = canPreview && actualRole !== null && viewRole !== actualRole;

  // Admin tools (Import, Team) are for owners and managers. Gate on the actual role so the
  // real owner or manager keeps the area even while previewing; in open demo mode the actual
  // role defaults to owner, so the area shows as before.
  const canAdmin = !REQUIRE_AUTH || canManageStore(actualRole);
  const visibleAreas = AREAS.filter((a) => a.key !== "admin" || canAdmin);

  // View-as options run from the actual role down to staff (owner sees Owner, Manager, Staff;
  // manager sees Manager, Staff). The actual role is the "off" choice that clears the preview.
  const viewOptions: Role[] = actualRole
    ? (["owner", "manager", "lead", "staff"] as Role[]).filter((r) => ROLE_RANK[r] <= ROLE_RANK[actualRole])
    : [];

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  // The current path decides the area on load and on navigation, so a deep link or a
  // nav click always shows the right links. The saved area only seeds the very first paint.
  useEffect(() => {
    setArea(areaForPath(pathname));
  }, [pathname]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem(AREA_KEY) as Area | null) : null;
    if (saved && pathname === "/") setArea(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickArea(a: Area) {
    setArea(a);
    if (typeof window !== "undefined") localStorage.setItem(AREA_KEY, a);
  }

  // Manager view gets the area's links; the simple view gets the flat staff nav.
  const links = managerView ? NAV[area] : STAFF_NAV;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // The login screen is its own full page; no app chrome there.
  if (pathname === "/login") return null;

  return (
    <header className="no-print" style={{ borderBottom: "1px solid var(--border)", background: "var(--panel)" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "12px 20px", display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Link href="/" style={{ textDecoration: "none", color: "var(--text-primary)", fontWeight: 700, fontSize: 17 }}>
              Robinsons General Store
            </Link>
            {stores.length > 1 && (
              <select
                className="input"
                aria-label="Active store"
                value={storeId || ""}
                onChange={(e) => setStore(e.target.value)}
                style={{ width: "auto", padding: "5px 8px", fontSize: 13 }}
              >
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {managerView && (
              <div role="tablist" aria-label="Area" style={{ display: "flex", gap: 4, background: "#EEF1F4", borderRadius: 8, padding: 3 }}>
                {visibleAreas.map((a) => {
                  const on = a.key === area;
                  return (
                    <button
                      key={a.key}
                      role="tab"
                      aria-selected={on}
                      onClick={() => pickArea(a.key)}
                      className={on ? "btn-primary" : "btn-ghost"}
                      style={{ padding: "5px 10px", fontSize: 12.5, border: on ? "none" : "1px solid transparent", background: on ? "var(--primary)" : "transparent", color: on ? "#fff" : "var(--text-secondary)" }}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            )}
            {canPreview && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="help" style={{ fontSize: 12 }}>View as</span>
                <div role="tablist" aria-label="View as" style={{ display: "flex", gap: 4, background: "#EEF1F4", borderRadius: 8, padding: 3 }}>
                  {viewOptions.map((r) => {
                    const on = r === viewRole;
                    return (
                      <button
                        key={r}
                        role="tab"
                        aria-selected={on}
                        onClick={() => setViewRole(r === actualRole ? null : r)}
                        className={on ? "btn-primary" : "btn-ghost"}
                        style={{ padding: "5px 10px", fontSize: 12.5, border: on ? "none" : "1px solid transparent", background: on ? "var(--primary)" : "transparent", color: on ? "#fff" : "var(--text-secondary)" }}
                      >
                        {ROLE_LABEL[r]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <NotificationBell />
            <Link href="/capture" className="btn-primary" style={{ textDecoration: "none" }}>
              + Capture
            </Link>
            {REQUIRE_AUTH && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {member && <span className="help">{member.full_name} ({member.role})</span>}
                <button className="btn-ghost" style={{ padding: "5px 10px", fontSize: 12.5 }} onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
        {previewing && viewRole && (
          <div className="help" style={{ fontSize: 12 }}>Previewing as {ROLE_LABEL[viewRole].toLowerCase()}</div>
        )}
        <nav style={{ display: "flex", gap: 14, fontSize: 14, flexWrap: "wrap" }}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} style={isActive(l.href) ? navLinkActive : navLink}>{l.label}</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
