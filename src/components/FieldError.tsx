"use client";

// A validation message that sits under the field it is about.
//
// The owner asked for this directly: "we need to display the error message near the field,
// not at the top." A single error card above a form with twenty boxes tells you something is
// wrong and makes you hunt for which box. The message belongs where the fix is.
//
// Errors are held in a plain object keyed by field name, so one piece of state covers a whole
// form and clearing it is a single assignment. Keys are namespaced by form ("inv.delivery_
// comments") because the vendor page renders the add form and an edit form at the same time,
// and an error on one must not light up the other.

export type FieldErrors = Record<string, string>;

export function FieldError({ errors, name }: { errors: FieldErrors; name: string }) {
  const message = errors[name];
  if (!message) return null;
  return (
    <p className="field-error" role="alert" style={{ margin: "4px 0 0" }}>
      {message}
    </p>
  );
}

// True when the field is flagged, for the red outline on the input itself. Colour is the
// second signal here, never the only one: the sentence underneath is what says what to do.
export function fieldInputClass(errors: FieldErrors, name: string): string {
  return errors[name] ? "input input-error" : "input";
}
