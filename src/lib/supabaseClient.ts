import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Fall back to placeholders when env is absent so the app still builds without keys.
// Without real keys the data calls fail at runtime and each screen shows its connection card.
export const supabase = createClient(url || "https://placeholder.supabase.co", anon || "placeholder-anon-key");
export const DOCUMENTS_BUCKET = "documents";
export const SUPABASE_CONFIGURED = Boolean(url && anon);
