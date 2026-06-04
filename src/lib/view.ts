"use client";

// View role: the role that decides the on-screen experience.
//
// The signed-in role (actualRole, from useCurrentRole) is the source of truth for access.
// Owners and managers may optionally preview a lower role's view to check what staff see.
// That preview ONLY downgrades the visible role; it never grants extra access. A staff or
// lead user cannot preview anything, and no one can preview a role above their own.
//
// The preview choice is stored in localStorage (rgs_view_as) so it survives navigation.
// State is held in the hook and updated on set, so the header and the home router re-render.

import { useEffect, useState } from "react";
import { useCurrentRole, type Role } from "@/lib/auth";

// Rank lets us compare roles. A preview override is honored only when its rank is at or
// below the actual role's rank, which keeps preview to a downgrade.
export const ROLE_RANK: Record<Role, number> = { staff: 0, lead: 1, manager: 2, owner: 3 };

const VIEW_KEY = "rgs_view_as";

// A manager view is the command experience (dashboard home, full area nav). Staff and lead
// get the simple task experience. Treat a null role as the simple experience (no access).
export function isManagerView(role: Role | null): boolean {
  return role === "manager" || role === "owner";
}

function readOverride(): Role | null {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem(VIEW_KEY);
  if (saved === "staff" || saved === "lead" || saved === "manager" || saved === "owner") return saved;
  return null;
}

// The role that drives the UI. Returns actualRole until resolved, then applies a valid
// preview override for managers and owners. setViewRole writes or clears the override and
// re-renders. Selecting the actual role (or a higher one) clears the override.
export function useViewRole(): {
  actualRole: Role | null;
  viewRole: Role | null;
  canPreview: boolean;
  setViewRole: (r: Role | null) => void;
} {
  const { role: actualRole } = useCurrentRole();
  const [override, setOverride] = useState<Role | null>(null);

  // Seed the override from storage once on mount.
  useEffect(() => {
    setOverride(readOverride());
  }, []);

  const canPreview = actualRole === "manager" || actualRole === "owner";

  // Honor the override only when previewing is allowed and the override is a downgrade
  // (at or below the actual role). Otherwise fall back to the actual role.
  let viewRole = actualRole;
  if (canPreview && override && actualRole && ROLE_RANK[override] <= ROLE_RANK[actualRole]) {
    viewRole = override;
  }

  function setViewRole(r: Role | null) {
    // Clear when picking the actual role (or nothing); a higher pick is also a no-op clear.
    const keep = r && actualRole && ROLE_RANK[r] < ROLE_RANK[actualRole] ? r : null;
    if (typeof window !== "undefined") {
      if (keep) localStorage.setItem(VIEW_KEY, keep);
      else localStorage.removeItem(VIEW_KEY);
    }
    setOverride(keep);
  }

  return { actualRole, viewRole, canPreview, setViewRole };
}
