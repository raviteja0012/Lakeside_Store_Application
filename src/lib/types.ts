export type Department = {
  id: string;
  name: string;
  accent_color: string | null;
  parent_department_id: string | null;
};

export type AppUser = {
  id: string;
  full_name: string;
  role: "staff" | "lead" | "manager" | "owner";
};

export type LineItem = {
  description: string;
  qty: number | null;
  unit_cost: number | null;
  retail_price_note: number | null;
  confidence: number | null;
};

export type Draft = {
  vendor: string;
  invoice_date: string;
  notes: string;
  line_items: LineItem[];
};

export type FeedRow = {
  id: string;
  vendor_name: string | null;
  received_date: string | null;
  status: string;
  source_file_path: string | null;
  created_at: string;
  department: { name: string; accent_color: string | null } | null;
  app_user: { full_name: string } | null;
};
