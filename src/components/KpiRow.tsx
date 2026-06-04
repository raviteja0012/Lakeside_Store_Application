"use client";

// Presentational KPI summary row. Calm neutral tiles where color appears only on the value
// when a tone is set, so a hue always carries meaning. No data fetching lives here.

export type KpiItem = {
  title: string;
  value: string;
  icon?: string;
  tone?: "error" | "warning" | "success";
  foot?: string;
};

const toneClass: Record<NonNullable<KpiItem["tone"]>, string> = {
  error: "is-error",
  warning: "is-warning",
  success: "is-success"
};

export default function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <div className="kpi-grid">
      {items.map((it, i) => (
        <div className="kpi" key={`${it.title}-${i}`}>
          <div className="kpi-head">
            <span className="kpi-title">{it.title}</span>
            {it.icon && <span className="kpi-icon" aria-hidden="true">{it.icon}</span>}
          </div>
          <div className={`kpi-value${it.tone ? ` ${toneClass[it.tone]}` : ""}`}>{it.value}</div>
          {it.foot && <div className="kpi-foot">{it.foot}</div>}
        </div>
      ))}
    </div>
  );
}
