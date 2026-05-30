"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AREAS, NAV, AREA_KEY, areaForPath, type Area } from "@/lib/nav";
import { useActiveStore } from "@/lib/store";

const navLink = { textDecoration: "none", color: "var(--text-secondary)", fontWeight: 500 } as const;
const navLinkActive = { textDecoration: "none", color: "var(--primary)", fontWeight: 600 } as const;

export default function Header() {
  const pathname = usePathname() || "/";
  const [area, setArea] = useState<Area>(() => areaForPath(pathname));
  const { stores, storeId, setStore } = useActiveStore();

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

  const links = NAV[area];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

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
            <div role="tablist" aria-label="Area" style={{ display: "flex", gap: 4, background: "#EEF1F4", borderRadius: 8, padding: 3 }}>
              {AREAS.map((a) => {
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
            <Link href="/capture" className="btn-primary" style={{ textDecoration: "none" }}>
              + Capture
            </Link>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 14, fontSize: 14, flexWrap: "wrap" }}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} style={isActive(l.href) ? navLinkActive : navLink}>{l.label}</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
