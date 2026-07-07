"use client";

// Home is role-driven. Owners and managers land on the command dashboard; staff and leads
// (and a manager previewing staff) land on Today: a greeting, the few actions a seasonal
// hire needs as big tiles, then the live feed of what the store has received.

import Link from "next/link";
import { useViewRole, isManagerView } from "@/lib/view";
import CommandDashboard from "@/components/CommandDashboard";
import StaffFeed from "@/components/StaffFeed";
import { Icon } from "@/components/AppShell";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function StaffToday() {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <header className="page-head">
        <div>
          <h1 className="page-title">{greeting()}.</h1>
          <p className="page-sub">A delivery just arrived? Capture it before it goes on the shelf.</p>
        </div>
      </header>

      <div className="action-grid">
        <Link href="/capture" className="action-tile primary">
          <span className="kpi-icon"><Icon name="capture" size={20} /></span>
          Capture a delivery
          <span className="help">Snap the invoice, check it, save</span>
        </Link>
        <Link href="/hr/schedule" className="action-tile">
          <span className="kpi-icon"><Icon name="schedule" size={20} /></span>
          My schedule
          <span className="help">This week&apos;s shifts</span>
        </Link>
        <Link href="/ask" className="action-tile">
          <span className="kpi-icon"><Icon name="ask" size={20} /></span>
          Ask the store
          <span className="help">How do we do this here?</span>
        </Link>
        <Link href="/knowledge" className="action-tile">
          <span className="kpi-icon"><Icon name="knowledge" size={20} /></span>
          Knowledge
          <span className="help">Notes from the team</span>
        </Link>
      </div>

      <StaffFeed />
    </div>
  );
}

export default function Home() {
  const { viewRole } = useViewRole();

  // Until the role resolves, show a quiet placeholder rather than flashing the wrong home.
  if (!viewRole) return <p className="help">Loading.</p>;

  return isManagerView(viewRole) ? <CommandDashboard /> : <StaffToday />;
}
