---
name: excel-export
description: Patterns for exporting data to Excel (.xlsx) files from a Next.js client app using the SheetJS (xlsx) library. Covers single-sheet exports, multi-tab workbooks, and the full data export pattern with relationships. Use when adding download/export functionality to any screen.
---

# Excel Export Skill

Reusable patterns for exporting data from a Next.js app to Excel workbooks using the `xlsx` (SheetJS) library.

## When to use

- Adding an "Export Excel" button to any data screen
- Building a full database export with multiple tabs
- Exporting filtered/sorted data views
- Creating reports that users can open in Excel or Google Sheets

## Dependencies

```json
{ "dependencies": { "xlsx": "^0.18.5" } }
```

Import:
```typescript
import * as XLSX from "xlsx";
```

## Pattern 1: Simple Single-Sheet Export

Export an array of objects as one sheet:

```typescript
function exportData(data: Record<string, any>[], filename: string, sheetName: string = "Data") {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

// Usage in a component:
function exportPayments() {
  const rows = payments.map((p) => ({
    Vendor: p.vendor?.name || "",
    Amount: Number(p.amount) || 0,
    Method: methodLabel(p.method),
    "Paid Date": p.paid_date || "",
    Reference: p.reference || "",
    "Confirmation Filed": p.confirmation_filing || "",
    Notes: p.notes || "",
    "Invoices Covered": coverage(p),
    "Post-dated": isFutureDate(p.paid_date) ? "Yes" : "No"
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Payments");
  XLSX.writeFile(wb, `payments-export-${todayISO()}.xlsx`);
}
```

## Pattern 2: Multi-Tab Workbook Export

Export multiple tables as separate tabs in one workbook:

```typescript
function exportFullWorkbook(tables: { name: string; data: Record<string, any>[] }[]) {
  const wb = XLSX.utils.book_new();
  
  for (const table of tables) {
    const ws = XLSX.utils.json_to_sheet(table.data);
    XLSX.utils.book_append_sheet(wb, ws, table.name.slice(0, 31)); // Sheet name max 31 chars
  }
  
  // Add a README tab with relationships
  const readme = XLSX.utils.aoa_to_sheet([
    ["Table", "Key", "References"],
    ["invoice", "vendor_id", "vendor.id"],
    ["payment", "vendor_id", "vendor.id"],
    ["payment_allocation", "payment_id", "payment.id"],
    ["payment_allocation", "invoice_id", "invoice.id"],
  ]);
  XLSX.utils.book_append_sheet(wb, readme, "README");
  
  XLSX.writeFile(wb, `full-export-${todayISO()}.xlsx`);
}
```

## Pattern 3: Server-Side Export (API Route)

For large datasets, export from an API route using streaming:

```typescript
// src/app/api/export/route.ts
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function GET() {
  // Query all data from Supabase
  const { data: vendors } = await supabase.from("vendor").select("*").is("voided_at", null);
  const { data: invoices } = await supabase.from("invoice").select("*").is("voided_at", null);
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vendors || []), "Vendors");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invoices || []), "Invoices");
  
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.spreadsheet",
      "Content-Disposition": `attachment; filename="export.xlsx"`
    }
  });
}
```

## UI Button Pattern

```tsx
<button
  className="btn-ghost"
  onClick={exportData}
  disabled={loading || data.length === 0}
>
  Export Excel
</button>
```

Place in `page-actions` div alongside the primary action button.

## Column Formatting Tips

- Use readable column names: `"Paid Date"` not `paid_date`
- Format money as numbers (Excel handles formatting): `Number(p.amount) || 0`
- Format dates as strings in ISO format: `p.paid_date || ""`
- Use human labels for enums: `methodLabel(p.method)` not raw values
- Boolean columns as "Yes"/"No" strings

## Deduplication Pattern

When combining multiple data sources (e.g., scheduled + recent payments):

```typescript
const seen = new Set<string>();
const unique = allItems.filter((item) => {
  if (seen.has(item.id)) return false;
  seen.add(item.id);
  return true;
});
```

## File Naming Convention

```typescript
`${entity}-export-${todayISO()}.xlsx`
// Examples: payments-export-2026-07-14.xlsx, vendors-export-2026-07-14.xlsx
```

## Import Pattern (reading Excel files)

For importing data from uploaded Excel files:

```typescript
async function handleFile(file: File) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);
  // Process rows...
}
```

## Idempotent Import Rules

- Upsert by a natural key (vendor name, SKU, employee name)
- Dedup child records (shifts by employee+date+start+end)
- Auto-detect workbook type from column headers
- Report what was created vs skipped
