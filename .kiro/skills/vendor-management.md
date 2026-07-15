---
name: vendor-management
description: Complete vendor management patterns including multi-department/unknown vendors, quick-add from any context, credit notes (returns/adjustments), vendor detail pages with invoices/orders/payments/credits, and the vendor ledger. Use when building or extending vendor features.
---

# Vendor Management Skill

Patterns for managing vendors in a store operations app. Covers the full lifecycle from adding a vendor through recording credits and managing their invoices.

## When to use

- Adding vendor CRUD functionality
- Implementing multi-department or unassigned vendors
- Building credit note / return / adjustment features
- Creating vendor detail pages with related data
- Quick-adding vendors inline from other workflows (e.g., payments)

## Multi-Department / Unknown Vendor Strategy

Not every vendor fits one department. The best approach:

1. Make `department_id` nullable on the vendor table
2. Null means "multi-department" or "unassigned"
3. Vendors with null department appear in ALL category filters
4. Show a "Multi-dept" chip in vendor lists for null-department vendors
5. Let users assign/change the department later from the vendor page

```typescript
// Filter logic: vendors with no dept show everywhere
const filtered = vendors.filter((v) =>
  deptFilter === "all" || !v.department_id || inCategory(v.department_id, deptFilter)
);
```

## Quick-Add Vendor Pattern

Allow adding a vendor inline without leaving the current workflow:

```typescript
// State
const [showNewVendor, setShowNewVendor] = useState(false);
const [nvForm, setNvForm] = useState({ name: "", department_id: "", phone: "", default_terms: "" });

// Insert with optional department
async function addVendor() {
  const name = nvForm.name.trim();
  if (!name) { setError("The new vendor needs a name."); return; }
  
  const r = await supabase.from("vendor").insert({
    store_id: storeId,
    department_id: dept || null,  // null = multi-dept / unknown
    name,
    phone: nvForm.phone.trim() || null,
    default_terms: nvForm.default_terms.trim() || null,
    status: "active"
  }).select("id").single();
  
  // Log the action
  if (actor) await supabase.from("activity_log").insert({
    actor_id: actor, action: "vendor_added", entity: "vendor", entity_id: r.data.id
  });
  
  // Auto-select the new vendor in the calling flow
  pickVendor(r.data.id);
}
```

## Credit Notes

Credits record money the vendor owes the store (damaged goods, returns, overcharges, short shipments).

### Database Schema

```sql
create table credit_note (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references store(id),
  vendor_id uuid not null references vendor(id),
  invoice_id uuid references invoice(id),      -- optional link
  invoice_number text,                          -- the invoice this applies to
  credit_amount numeric not null,
  reason text not null,                         -- why the credit was issued
  comments text,
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'disputed')),
  created_by uuid references app_user(id),
  created_at timestamptz default now(),
  voided_at timestamptz,
  voided_by uuid references app_user(id)
);
```

### Credit Status Values
- `pending`: credit confirmed by vendor but not yet applied to an invoice
- `applied`: credit has been deducted from a payment or invoice
- `disputed`: store and vendor disagree on the credit

### Adjusted Amount Calculation
```typescript
const adjustedAmount = invoiceTotal - creditAmount;
```

### UI Pattern
- Credits section on vendor detail page (after Payments)
- Form: invoice number, link to invoice (dropdown), credit amount, reason, status, comments
- Shows adjusted invoice amount when linked to an invoice
- Can be voided (soft delete) by owners/managers

## Vendor Detail Page Structure

A vendor detail page shows:
1. **Header**: name, department chip, status chip, contact info, outstanding total
2. **Vendor info card**: contact, products, terms, notes, edit/delete buttons
3. **Invoices section**: add form + list with payment recording inline
4. **Purchase Orders section**: add form + list with status dropdowns
5. **Payments section**: list of all payments to this vendor
6. **Credits section**: add form + list of credits

## Vendor Status Values

```typescript
const VENDOR_STATUSES = ["active", "skip", "discontinue", "bankrupt"];
```

## Department Category Hierarchy

Top-level departments are the payout categories. Sub-departments (like Clothing under DryGoods) are children via `parent_department_id`. When filtering by a category, include its children:

```typescript
function inCategory(departmentId: string | null, category: string): boolean {
  if (!departmentId) return false;
  if (departmentId === category) return true;
  const d = departments.find((x) => x.id === departmentId);
  return d?.parent_department_id === category;
}
```

## Soft Delete for Vendors

- Use `voidRow("vendor", id, actorId)` (sets voided_at, logs to activity_log)
- All vendor queries filter `.is("voided_at", null)`
- Vendors are kept for the six-year tax history

## Invoice Fields Per Department Type

Standard merchandise invoices:
- invoice_number, invoice_date, amount, hst_amount, freight_charges, delivery_status, terms, due_date

Property Maintenance invoices add:
- estimate_number (blank if not preplanned)
- work_type (repair | upgrade)
- work_description

Detection: `isPropertyDept(vendor.department.name)` checks if the name contains "property".
