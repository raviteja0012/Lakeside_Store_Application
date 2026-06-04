"use client";

// The alerts bell for the header. Reads the active store's notifications (overdue invoices,
// licence and insurance dates, maintenance due) and shows a count dot when any are open.
// Clicking opens a small panel; each row links to the screen that resolves it. Closes on
// outside click or Escape. Self-guards when Supabase env is blank: the bell renders with no dot.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SUPABASE_CONFIGURED } from "@/lib/supabaseClient";
import { useActiveStore } from "@/lib/store";
import { loadNotifications, type Notification } from "@/lib/notify";

const chipFor: Record<Notification["severity"], string> = {
  error: "chip-error",
  warning: "chip-warning",
  info: "chip-progress"
};

export default function NotificationBell() {
  const { storeId, ready } = useActiveStore();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready || !storeId || !SUPABASE_CONFIGURED) return;
    let alive = true;
    (async () => {
      const list = await loadNotifications(storeId);
      if (alive) setItems(list);
    })();
    return () => { alive = false; };
  }, [ready, storeId]);

  // Close on outside click or Escape, only while the panel is open.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = items.length;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="bell"
        aria-label={count > 0 ? `Alerts, ${count}` : "Alerts"}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((s) => !s)}
      >
        <span aria-hidden="true">🔔</span>
        {count > 0 && <span className="bell-dot">{count > 9 ? "9+" : count}</span>}
      </button>

      {open && (
        <div
          className="card"
          role="menu"
          style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 300, maxWidth: "90vw", padding: 8, zIndex: 50 }}
        >
          {count === 0 ? (
            <div style={{ padding: 16, textAlign: "center" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>All caught up.</p>
              <p className="help" style={{ margin: "4px 0 0" }}>No alerts for this store.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              {items.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  className="row-hover"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 10, borderRadius: 8, textDecoration: "none", color: "var(--text-primary)" }}
                >
                  <span className={`chip ${chipFor[n.severity]}`} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true">
                    {n.severity === "error" ? "!" : n.severity === "warning" ? "•" : "i"}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>{n.title}</span>
                    {n.detail && <span className="help" style={{ display: "block", marginTop: 2 }}>{n.detail}</span>}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
