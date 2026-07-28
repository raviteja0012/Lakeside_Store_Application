#!/usr/bin/env bash
# Stop hook: refuse to finish a turn while the TypeScript is broken.
#
# The project rule has always been "a commit does not land red". Stating that in CLAUDE.md
# makes it a suggestion; this makes it hold. Exit 2 blocks the stop and hands the compiler
# output back, so the fix happens in the same turn instead of being discovered in CI.
#
# Deliberately fails OPEN. Anything unexpected (no node_modules, no git, a hook payload we
# cannot parse) exits 0, because a hook that wrongly blocks every turn is worse than a
# missed typecheck: people disable it, and then nothing is enforced at all.

set -uo pipefail

payload=$(cat 2>/dev/null || true)

# Already re-entered from a previous block: let the turn end so a type error nobody can fix
# cannot trap the session in a loop.
if command -v jq >/dev/null 2>&1; then
  if [ "$(printf '%s' "$payload" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ]; then
    exit 0
  fi
  dir=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)
fi

cd "${dir:-${CLAUDE_PROJECT_DIR:-$PWD}}" 2>/dev/null || exit 0
[ -d node_modules ] || exit 0
command -v git >/dev/null 2>&1 || exit 0

# Only when TypeScript actually changed and has not been committed yet.
changed=$(git diff --name-only HEAD -- '*.ts' '*.tsx' 2>/dev/null; git ls-files --others --exclude-standard -- '*.ts' '*.tsx' 2>/dev/null)
[ -n "$changed" ] || exit 0

if ! out=$(npx --no-install tsc --noEmit 2>&1); then
  {
    echo "The TypeScript does not compile, so this change is not finished. Fix these, then stop:"
    printf '%s\n' "$out" | head -25
  } >&2
  exit 2
fi
exit 0
