// Header areas and their nav links. Switching the area changes which links show.
// One area at a time keeps the floor laptop simple. + Capture stays visible in every area.

export type Area = "ops" | "property" | "hr" | "reports" | "admin";

export type NavItem = { href: string; label: string };

// Admin is shown only to owners and managers (gated in the Header). It holds the owner tools:
// loading the bookings sheet and managing staff logins.
export const AREAS: { key: Area; label: string }[] = [
  { key: "ops", label: "Store Operations" },
  { key: "property", label: "Property and Maintenance" },
  { key: "hr", label: "HR" },
  { key: "reports", label: "Reports" },
  { key: "admin", label: "Admin" }
];

export const NAV: Record<Area, NavItem[]> = {
  ops: [
    { href: "/", label: "Feed" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/vendors", label: "Vendors" },
    { href: "/overdue", label: "Overdue" },
    { href: "/inventory", label: "Inventory" },
    { href: "/knowledge", label: "Knowledge" },
    { href: "/ask", label: "Ask" },
    { href: "/price-signs", label: "Price signs" }
  ],
  property: [
    { href: "/maintenance", label: "Maintenance" },
    { href: "/compliance", label: "Compliance" }
  ],
  hr: [
    { href: "/hr", label: "Employees" },
    { href: "/hr/schedule", label: "Schedule" }
  ],
  reports: [
    { href: "/reports", label: "Reports" },
    { href: "/reorder", label: "Reorder" }
  ],
  admin: [
    { href: "/import", label: "Import data" },
    { href: "/team", label: "Team" }
  ]
};

export const AREA_KEY = "rgs_area";

// Pick the area that owns a path so the right links show on a hard reload or deep link.
export function areaForPath(path: string): Area {
  if (path.startsWith("/maintenance") || path.startsWith("/compliance")) return "property";
  if (path.startsWith("/hr")) return "hr";
  if (path.startsWith("/reports") || path.startsWith("/reorder")) return "reports";
  if (path.startsWith("/import") || path.startsWith("/team")) return "admin";
  return "ops";
}
