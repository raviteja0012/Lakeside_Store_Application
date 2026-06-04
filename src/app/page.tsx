"use client";

// Home is role-driven. Owners and managers land on the command dashboard; staff and leads
// (and a manager previewing staff) land on the feed. The feed itself lives in StaffFeed.

import { useViewRole, isManagerView } from "@/lib/view";
import CommandDashboard from "@/components/CommandDashboard";
import StaffFeed from "@/components/StaffFeed";

export default function Home() {
  const { viewRole } = useViewRole();

  // Until the role resolves, show a quiet placeholder rather than flashing the wrong home.
  if (!viewRole) return <p className="help">Loading.</p>;

  return isManagerView(viewRole) ? <CommandDashboard /> : <StaffFeed />;
}
