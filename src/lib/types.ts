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
  store_id?: string | null;
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
  invoice_date?: string | null; // drives the HST-by-department financial-year report
  amount: number | null;
  hst_amount: number | null;
  freight_charges?: number | null; // total owed = amount + freight + HST
  delivery_status?: string | null; // delivered | not_delivered
  estimate_number?: string | null; // Property Maintenance: preplanned work has an estimate #
  work_type?: string | null; // Property Maintenance: repair | upgrade
  work_description?: string | null; // Property Maintenance: short description of the work
  terms: string | null;
  due_date: string | null;
  status: string;
  vendor?: { name: string } | null;
};

export type Payment = {
  id: string;
  invoice_id: string | null; // legacy single-invoice link; allocations are the real links
  vendor_id?: string | null;
  amount: number | null;
  method: string | null;
  paid_date: string | null; // a future date means post-dated, not settled yet
  reference?: string | null;
  notes?: string | null;
  confirmation_filing?: string | null; // digital | physical
  created_at?: string;
  vendor?: { name: string } | null;
  payment_allocation?: {
    invoice_id: string;
    amount: number | null;
    invoice?: { invoice_number: string | null } | null;
  }[];
};

export type PaymentAllocation = {
  id: string;
  payment_id: string;
  invoice_id: string;
  amount: number | null;
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

export type MaintenanceAsset = {
  id: string;
  store_id: string | null;
  department_id: string | null;
  name: string;
  category: string | null;
  location: string | null;
  notes: string | null;
  department?: { name: string; accent_color: string | null } | null;
};

export type MaintenanceTask = {
  id: string;
  store_id: string | null;
  asset_id: string | null;
  title: string;
  detail: string | null;
  due_date: string | null;
  recurrence: string;
  status: "open" | "in_progress" | "done";
  assigned_to: string | null;
  completed_at: string | null;
  asset?: { name: string } | null;
  assignee?: { full_name: string } | null;
};

export type InsurancePolicy = {
  id: string;
  store_id: string | null;
  name: string;
  provider: string | null;
  policy_number: string | null;
  coverage: string | null;
  premium: number | null;
  renewal_date: string | null;
  notes: string | null;
};

export type Licence = {
  id: string;
  store_id: string | null;
  name: string;
  authority: string | null;
  number: string | null;
  holder: string | null;
  expiry_date: string | null;
};

export type Employee = {
  id: string;
  store_id: string | null;
  department_id: string | null;
  full_name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  hire_date: string | null;
  status: "active" | "inactive";
  notes: string | null;
  department?: { name: string; accent_color: string | null } | null;
};

export type PayRate = {
  id: string;
  employee_id: string | null;
  rate: number | null;
  unit: "hour" | "salary" | null;
  effective_date: string | null;
};

export type Shift = {
  id: string;
  employee_id: string | null;
  work_date: string | null;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  employee?: { full_name: string } | null;
};

export type CreditNote = {
  id: string;
  store_id: string | null;
  vendor_id: string;
  invoice_id: string | null;
  invoice_number: string | null;
  credit_amount: number;
  reason: string;
  comments: string | null;
  status: "pending" | "applied" | "disputed";
  created_by: string | null;
  created_at: string;
  voided_at?: string | null;
  invoice?: { invoice_number: string | null; amount: number | null; hst_amount: number | null } | null;
};

// The owner suggestion box: a note with optional screenshot and voice recording.
export type Feedback = {
  id: string;
  store_id: string | null;
  author_id: string | null;
  kind: "idea" | "problem" | "question" | "praise";
  page: string | null;
  body: string | null;
  screenshot_path: string | null;
  audio_path: string | null;
  ai_summary: string | null;
  status: "new" | "planned" | "done" | "declined";
  created_at: string;
  voided_at?: string | null;
  author?: { full_name: string | null } | null;
};
