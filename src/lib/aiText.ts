// Model output hygiene for the screens. The prompts ask for plain text, but a model can
// still slip into markdown; the app renders answers as text (never as HTML), so tokens
// like **bold** would show up literally. This strips the common ones instead.
export function plainText(s: string): string {
  return (s || "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^\s*[*•]\s+/gm, "- ")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}
