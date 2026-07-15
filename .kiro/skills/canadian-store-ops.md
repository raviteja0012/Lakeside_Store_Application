---
name: canadian-store-ops
description: Canadian store operations rules including Ontario HST (13%), PIPEDA privacy compliance, Ontario regulations (pesticide licences, food safety), CRA record-keeping, tax reporting by department, and Canadian-region hosting preferences. Use when building features that involve tax, compliance, privacy, or Canadian-specific business rules.
---

# Canadian Store Operations Skill

Business rules and compliance requirements for operating a Canadian retail store, specifically in Ontario. Apply these whenever building features that touch tax, privacy, compliance, or regulatory requirements.

## When to use

- Adding tax calculation to invoices or receipts
- Building compliance tracking (licences, insurance, food safety)
- Handling employee/HR data (PIPEDA)
- Creating financial reports or tax summaries
- Choosing hosting regions or data residency

## Ontario HST (Harmonized Sales Tax)

- Rate: 13% (5% federal GST + 8% provincial PST)
- Applied on all taxable goods and services
- Show HST as a separate line on every invoice
- Auto-calculate from pre-tax amount: `hstOn(preTax) = round2(preTax * 0.13)`
- Some items may be HST-exempt (food staples); let the field be editable to override

### Tax Calculation Helper

```typescript
export const HST_RATE = 0.13;

export function hstOn(preTax: number | null | undefined): number {
  const n = typeof preTax === "number" && isFinite(preTax) ? preTax : 0;
  return round2(n * HST_RATE);
}
```

### Tax Rules Table (for portability)

```sql
create table tax_rules (
  region text primary key,
  rate numeric not null,
  label text
);
-- Seed:
insert into tax_rules values
  ('ON', 0.13, 'HST'),
  ('AB', 0.05, 'GST'),
  ('BC', 0.12, 'GST+PST'),
  ('QC', 0.14975, 'GST+QST');
```

Keep rates in a table keyed by province so the app is portable without code changes.

## HST Annual Report by Department

The Excel requirement: "Should be able to report all Departments on HST Amount for the financial year."

Implementation:
- Use `invoice_date` as the primary date (fall back to `due_date`, then `created_at`)
- Group HST amounts by the vendor's department
- Sub-departments (Clothing, Gifts) roll up to their parent category
- Provide a year selector dropdown
- Show bar chart + total for the selected year

```typescript
const invoiceYear = (i) => {
  const d = i.invoice_date || i.due_date || i.created_at?.slice(0, 10);
  return d ? Number(d.slice(0, 4)) : null;
};
```

## CRA Record-Keeping

- Keep all financial records for **six years** from the end of the tax year
- This is why soft-delete (voided_at) is used instead of hard delete for invoices and payments
- The full export includes voided rows as the archival record
- Invoice dates drive the financial year assignment

## PIPEDA (Personal Information Protection)

Applies to employee and customer personal data:
- **Consent**: employees consent to data collection at hire
- **Access**: employees can request their personal data
- **Security**: encrypt at rest, use HTTPS, limit access by role
- **Minimization**: collect only what is needed
- **Retention**: delete personal data when no longer needed (but keep financial records 6 years)

In practice for this app:
- HR data (employee names, pay rates, schedules) is PIPEDA-protected
- Gate HR screens behind role checks
- Prefer Canadian-region hosting for personal data
- The pay_rate and shift tables are personal data

## Quebec Law 25

Only applies if Quebec-resident personal data is processed. For an Ontario store this is unlikely, but:
- If you add Quebec employees or expand to Quebec, this triggers
- Requires a privacy impact assessment and a privacy officer designation
- Treat as a precaution and a reason to favor Canadian hosting regions

## Ontario Pesticide Vendor Licence

Stores selling regulated pesticides need:
- An Ontario vendor licence with a tracked expiry date
- The licence number and holder on file
- Expiry alerts (30 days before, visual indicator on compliance screen)
- The licence at the store: 1062 Main Street, Dorset, Ontario P0A 1E0

### Compliance Screen Pattern

```typescript
type Licence = {
  id: string;
  store_id: string | null;
  name: string;
  authority: string | null;
  number: string | null;
  holder: string | null;
  expiry_date: string | null;
};
```

Show the dueBand chip for expiry (same pattern as invoice due dates).

## Insurance Policies

Track alongside licences on the compliance screen:
- Provider, policy number, coverage description, premium, renewal date, notes
- Premium is money-gated (canSeeMoney)
- Renewal date uses the same dueBand chip for upcoming renewals

## Food Safety (Ontario HPPA and O. Reg. 493/17)

For stores with grocery/bakery/produce/meat (future expansion):
- Fridge and freezer temperature logs
- Sanitation logs
- Food-handler certifications with expiry
- Pest-control records
- Natural fit for the existing capture model (photo + confirm)

## Currency

- Always CAD (Canadian dollars)
- Format with `formatCAD()`: `n.toLocaleString("en-CA", { style: "currency", currency: "CAD" })`
- Input masks for currency fields
- Money stored as numeric in the demo (integer cents before production)

## Hosting Preferences

- Database: Supabase in `ca-central` (Toronto) region
- App hosting: Vercel (US-based but CDN-served)
- AI API: Anthropic is US-hosted, acceptable for non-personal vendor invoices
- Prefer Canadian-region services for personal data (HR, employee info)
- Store original documents in a Canadian-region storage bucket

## Date Handling

- Store dates as ISO strings (YYYY-MM-DD)
- Compare with UTC-anchored helpers (no DST drift):

```typescript
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function daysOverdue(dateISO: string | null): number | null {
  if (!dateISO) return null;
  const today = Date.parse(todayISO() + "T00:00:00Z");
  const target = Date.parse(dateISO + "T00:00:00Z");
  if (isNaN(target)) return null;
  return Math.round((today - target) / 86400000);
}
```
