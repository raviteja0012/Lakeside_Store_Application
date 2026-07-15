---
name: payment-workflow
description: Complete payment recording workflow for vendor payouts. Covers the consolidated payment flow with invoice allocations, partial payments, post-dated cheques, multiple payment methods, confirmation filing, and the record_payment/void_payment RPC pattern. Use when building or extending payment features.
---

# Payment Workflow Skill

A complete vendor payment recording system. One cheque can settle multiple invoices across departments. Partial payments, post-dated cheques, and deposits/prepayments are all supported through a single atomic RPC.

## When to use

- Building a payment recording screen
- Adding payment functionality to a vendor or invoice page
- Implementing partial payments or post-dated cheque support
- Adding payment allocation tracking

## Architecture

```
Payment -> payment_allocation[] -> Invoice (status derived)
   |
   +-> vendor_id (the vendor being paid)
   +-> method (cash, cheque, cc_visa, cc_mastercard, cc_amex, cc_debit, etransfer, eft, other)
   +-> paid_date (future = post-dated)
   +-> reference (cheque #, e-transfer ref, card confirmation)
   +-> confirmation_filing (digital | physical)
   +-> notes
```

## Payment Methods (locked list)

```typescript
export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "cc_visa", label: "CC Visa" },
  { value: "cc_mastercard", label: "CC Mastercard" },
  { value: "cc_amex", label: "CC AMEX" },
  { value: "cc_debit", label: "CC Debit" },
  { value: "etransfer", label: "E-Transfer" },
  { value: "eft", label: "EFT" },
  { value: "other", label: "Other" }
];
```

## Reference Field Labels (per method)

```typescript
export function referenceLabel(method: string): string {
  if (method === "cheque") return "Cheque number";
  if (method === "etransfer") return "E-Transfer reference";
  if (method === "eft") return "EFT reference";
  if (method.startsWith("cc_")) return "Card confirmation";
  return "Reference";
}
```

## Confirmation Filing

```typescript
export const CONFIRMATION_FILING = [
  { value: "digital", label: "Digital" },
  { value: "physical", label: "Physical" }
];
```

## Database Schema

### payment table
- id, vendor_id, amount, method, paid_date, reference, notes, confirmation_filing
- created_by, created_at, voided_at, voided_by
- Method check constraint matches the locked list plus legacy "cc"

### payment_allocation table
- id, payment_id, invoice_id, amount, created_at
- One payment can allocate across multiple invoices
- The sum of allocations = payment.amount

### Invoice status derivation
Status is computed from allocations, never stored directly by user:
- `unpaid`: no allocations cover it
- `partially_paid`: some money applied but less than total
- `postdated`: fully covered but only by future-dated payments
- `paid`: settled amount >= invoice total

## RPC Pattern (record_payment)

```sql
create function record_payment(
  p_vendor_id uuid,
  p_method text,
  p_paid_date date,
  p_reference text default null,
  p_notes text default null,
  p_actor uuid default null,
  p_allocations jsonb default '[]'::jsonb,  -- [{"invoice_id": uuid, "amount": number}]
  p_amount numeric default null,            -- for deposits with no invoice
  p_confirmation_filing text default null
) returns uuid
```

One atomic transaction: payment row + allocations + invoice status recompute + audit log.

## RPC Pattern (void_payment)

```sql
create function void_payment(p_payment_id uuid, p_actor uuid default null)
```

Soft-deletes the payment and recomputes every touched invoice's status.

## Post-dated Cheque Pattern

- A payment with `paid_date` in the future is post-dated
- The invoice shows status "postdated" (money committed but not cleared)
- `reconcile_postdated()` flips invoices whose payment dates have arrived
- Call it on page load (cheap, no cron needed)
- `isFutureDate(dateISO)` helper detects post-dated

## UI Flow

1. **Vendor selection**: search + category filter chips + quick-add new vendor
2. **Invoice selection**: tick invoices to cover, each gets an editable allocation amount
3. **Or deposit/prepayment**: check "no invoice" and enter flat amount
4. **Method, date, reference, filing, notes**: the payment details
5. **Save**: calls recordPaymentRpc atomically

## Settlement Tracking

```typescript
type InvoiceSettlement = { settled: number; scheduled: number };

// What is still owed (post-dated has not left the account)
function remainingOwed(total, settlement) { return total - settled; }

// What is left to allocate (post-dated already covers its share)
function remainingToAllocate(total, settlement) { return total - settled - scheduled; }
```

## Duplicate Prevention

- Guard against duplicate payments on retry (the RPC is idempotent per the allocation check)
- UI disables the save button while busy

## Money Gating

- The entire payments screen is gated by `canSeeMoney(role)`
- Staff and leads cannot access payments (they see a "limited" message)
- Only owners and managers can record or void payments
