// Edit and delete helpers, shared by every data-entry screen.
//
// Permission: owners and managers only (canEdit). Staff and leads keep add, capture, and count.
// Delete is a soft delete (void) for records we retain, and a hard delete only for shifts.
// Every change is written to activity_log so there is a trail of who did it and when.

import { supabase } from "@/lib/supabaseClient";
import { canManageStore, type Role } from "@/lib/auth";

// Who may edit or delete records. Mirrors the money-by-role split: owners and managers only.
export function canEdit(role: Role | null | undefined): boolean {
  return canManageStore(role);
}

// Soft delete. Keeps the row for the audit trail and the six-year tax history; it drops out of
// every list and total because reads filter voided_at is null. Use for transactions and records.
export async function voidRow(table: string, id: string, actorId: string | null): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update({ voided_at: new Date().toISOString(), voided_by: actorId })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("activity_log").insert({ actor_id: actorId, action: "voided", entity: table, entity_id: id });
}

// Hard delete. Only for rows we do not retain (shifts). Removes the row outright.
export async function deleteRow(table: string, id: string, actorId: string | null): Promise<void> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("activity_log").insert({ actor_id: actorId, action: "deleted", entity: table, entity_id: id });
}
