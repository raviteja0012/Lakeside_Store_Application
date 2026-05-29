// One shared status-to-chip mapping so every screen uses the same hues.
// Reuses the .chip-* classes defined in globals.css. One hue means one thing.

const MAP: Record<string, string> = {
  // receiving_event
  confirmed: "chip-success",
  fully_received: "chip-success",
  partial_received: "chip-progress",
  parsed: "chip-progress",
  disputed: "chip-warning",
  validation_error: "chip-error",
  pending_document: "chip-neutral",
  awaiting_arrival: "chip-neutral",
  closed: "chip-neutral",
  cancelled: "chip-neutral",
  // invoice
  paid: "chip-success",
  unpaid: "chip-warning",
  postdated: "chip-progress",
  // purchase_order
  draft: "chip-neutral",
  ordered: "chip-progress",
  shipped: "chip-progress",
  received: "chip-success",
  // vendor
  active: "chip-success",
  skip: "chip-warning",
  discontinue: "chip-neutral",
  bankrupt: "chip-error"
};

export function chipClass(status: string | null | undefined): string {
  if (!status) return "chip-neutral";
  return MAP[status] || "chip-neutral";
}

export function labelize(s: string | null | undefined): string {
  return (s || "").replace(/_/g, " ");
}
