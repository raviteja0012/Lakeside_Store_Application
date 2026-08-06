// What the buyer needs to know before placing an order with a vendor: the minimum the vendor
// will accept, when the summer order has to go in, where orders get placed, and whether last
// season sold well enough to need a reorder.
//
// Today all four live in somebody's head or in the margin of last year's sheet. They are
// recorded on the vendor rather than on each order because they describe the vendor's
// standing terms, not one transaction.
//
// Every rule here is a pure function so the three screens that use it (add vendor, vendor
// details, purchase order) cannot drift apart, and so the rules can be tested without a
// browser or a database.

import type { Vendor } from "@/lib/types";
import { formatCAD } from "@/lib/format";

// Where orders are placed. More than one is normal: a rep visits AND you confirm by email.
export const ORDER_LOCATIONS: string[] = [
  "Gift Show",
  "Email",
  "In Person",
  "Rep Show",
  "Phone",
  "Vendor Website/Portal",
  "Other"
];

export const OTHER_LOCATION = "Other";

export const REORDER_STATUS: { value: string; label: string }[] = [
  { value: "reordered", label: "Reordered" },
  { value: "no_reorder", label: "No Reorder" }
];

// Length caps, from the owner's spec. Enforced on the input as maxLength so the limit is felt
// while typing rather than announced after a failed save.
export const MAX_SUMMER_TIMELINE = 150;
export const MAX_LOCATION_OTHER = 100;
export const MAX_REORDER_COMMENTS = 500;

export const SUMMER_TIMELINE_PLACEHOLDER = "Example: Before mid-January";
export const REORDER_COMMENTS_PLACEHOLDER =
  "Example: Reordered on July 15, 2026. Added 24 units due to strong sales.";

// The minimum-order answer in one sentence, or null when the vendor has never been asked.
// Null is a real third state and must not read as "no minimum": there are 130 vendors on
// file and nobody is going to fill this in for all of them in one sitting.
export function minimumOrderLabel(
  v: Pick<Vendor, "minimum_order_amount" | "no_minimum_order"> | null | undefined
): string | null {
  if (!v) return null;
  if (v.no_minimum_order) return "No minimum order";
  const amount = Number(v.minimum_order_amount);
  if (v.minimum_order_amount == null || !isFinite(amount)) return null;
  return `${formatCAD(amount)} minimum order`;
}

// The minimum-order rule, as the owner wrote it: an amount OR the no-minimum tick, never
// both, never neither. Returns the message to show under the amount box, or null when valid.
//
// Note this makes the pair mandatory on every save, including an edit that only meant to fix
// a phone number. That is deliberate and asked for; the escape hatch is the tick box, which
// takes one click when the vendor genuinely has no minimum.
export function validateMinimumOrder(amountText: string, noMinimum: boolean): string | null {
  const typed = amountText.trim();
  if (noMinimum) {
    // Belt and braces with the database check constraint: a row claiming both is not a state
    // anyone can act on, so the form refuses it before the database has to.
    return typed ? "Clear the amount, or untick No Minimum Order. It cannot be both." : null;
  }
  if (!typed) return "Enter a minimum order amount or select No Minimum Order.";
  if (!/^\d+(\.\d{1,2})?$/.test(typed)) {
    return "Enter a positive amount with up to two decimal places, for example 1500.00.";
  }
  const amount = Number(typed);
  if (!isFinite(amount) || amount <= 0) return "The minimum order amount must be more than zero.";
  return null;
}

// Reorder comments are mandatory when the answer is "Reordered", because that is the answer
// that carries information worth having next season: what was reordered, when, and how much.
// "No Reorder" and a blank status both say everything they have to say on their own.
export function validateReorder(status: string, comments: string): string | null {
  if (status !== "reordered") return null;
  if (!comments.trim()) return "Add the reorder date and what was reordered.";
  return null;
}

// The saved locations as one readable line. The custom "Other" text replaces the bare word
// Other, since "Other" on its own tells the next person nothing.
export function orderLocationLabel(
  locations: string[] | null | undefined,
  other: string | null | undefined
): string | null {
  const list = (locations || []).filter(Boolean);
  if (!list.length) return null;
  return list.map((l) => (l === OTHER_LOCATION && other?.trim() ? other.trim() : l)).join(", ");
}

// Ticking and unticking one option in the multi-select, kept here so both vendor forms
// behave identically. Unticking Other is what clears its free text: leaving orphaned text
// behind would resurface it the next time somebody ticked the box.
export function toggleOrderLocation(current: string[], value: string): string[] {
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}
