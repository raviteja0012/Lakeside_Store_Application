"use client";

// Presentational KPI summary row. Calm neutral tiles where color appears only on the value
// when a tone is set, so a hue always carries meaning. No data fetching lives here.
// A tile with an href is a door: the whole tile opens the screen where that number is
// acted on, so the dashboard is never a dead end.

import Link from "next/link";

export type KpiItem = {
  title: string;
  value: string;
  icon?: string;
  tone?: "error" | "warning" | "success";
  foot?: string;
  href?: string;
};

const toneClass: Record<NonNullable<KpiItem["tone"]>, string> = {
  error: "is-error",
  warning: "is-warning",
  success: "is-success"
};

export default function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <div className="kpi-grid">
      {items.map((it, i) => {
        const body = (
          <>
            <div className="kpi-head">
              <span className="kpi-title">{it.title}</span>
              {it.icon && <span className="kpi-icon" aria-hidden="true">{it.icon}</span>}
            </div>
            {/* Six-digit dollar totals get a smaller size so they never spill into the next tile. */}
            <div className={`kpi-value${it.tone ? ` ${toneClass[it.tone]}` : ""}${it.value.length > 13 ? " is-xlong" : it.value.length > 8 ? " is-long" : ""}`}>{it.value}</div>
            {it.foot && <div className="kpi-foot">{it.foot}</div>}
          </>
        );
        return it.href ? (
          <Link href={it.href} className="kpi" key={`${it.title}-${i}`} style={{ textDecoration: "none", color: "inherit" }}>
            {body}
          </Link>
        ) : (
          <div className="kpi" key={`${it.title}-${i}`}>{body}</div>
        );
      })}
    </div>
  );
}
