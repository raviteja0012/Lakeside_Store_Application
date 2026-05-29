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
  receiving_line?: { qty: number | null; unit_cost: number | null }[];
};

export type Vendor = {
  id: string;
  department_id: string | null;
  name: string;
  rep_name: string | null;
  phone: string | null;
  email: string | null;
  products_we_carry: string | null;
  default_terms: string | null;
  status: string;
  notes: string | null;
  department?: { name: string; accent_color: string | null } | null;
};

export type PurchaseOrder = {
  id: string;
  vendor_id: string | null;
  department_id: string | null;
  season_year: number | null;
  order_amount: number | null;
  ship_date: string | null;
  delivery_commit: string | null;
  status: string;
  notes: string | null;
};

export type Invoice = {
  id: string;
  vendor_id: string | null;
  invoice_number: string | null;
  amount: number | null;
  hst_amount: number | null;
  terms: string | null;
  due_date: string | null;
  status: string;
  vendor?: { name: string } | null;
};

export type Payment = {
  id: string;
  invoice_id: string | null;
  amount: number | null;
  method: string | null;
  paid_date: string | null;
};

export type Item = {
  id: string;
  department_id: string | null;
  name: string;
  uom: string | null;
  retail_price: number | null;
  sku: string | null;
  department?: { name: string; accent_color: string | null } | null;
};

export type TaxRule = {
  region: string;
  rate: number;
  label: string | null;
};

export type KnowledgeNote = {
  id: string;
  department_id: string | null;
  topic: string | null;
  body: string | null;
  tags: string[] | null;
  created_at: string;
  department?: { name: string; accent_color: string | null } | null;
  app_user?: { full_name: string } | null;
};
