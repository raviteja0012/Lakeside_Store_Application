---
name: nextjs-supabase-standards
description: Set up and enforce standards for a Next.js App Router + Supabase project. Covers CI/CD pipeline, ESLint, TypeScript strict mode, Kiro steering files, agent hooks, EditorConfig, and the locked architecture pattern. Use when bootstrapping a new project or enforcing conventions on an existing one.
---

# Next.js + Supabase Project Standards

Reusable skill for setting up and enforcing development standards on a Next.js App Router project backed by Supabase Postgres.

## When to use

- Bootstrapping a new Next.js + Supabase project
- Adding Kiro standards to an existing project
- Setting up CI/CD for lint, typecheck, and build
- Enforcing architecture constraints across a team

## Stack

- Next.js 14+ App Router on Vercel
- Supabase Postgres (database, auth, storage)
- TypeScript strict mode
- Tailwind CSS
- ESLint with next/core-web-vitals

## CI/CD Pipeline (.github/workflows/ci.yml)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ""
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ""
```

Key rules:
- Build must pass with blank Supabase env vars (build-safe pattern)
- Auth and data helpers degrade to null, never throw at build time
- Lint warnings are acceptable, errors are not
- Node 20 in CI

## TypeScript Configuration (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

## ESLint (.eslintrc.json)

```json
{ "extends": "next/core-web-vitals" }
```

## EditorConfig (.editorconfig)

```ini
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
[*.md]
trim_trailing_whitespace = false
```

## Package.json Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  }
}
```

## Kiro Steering Files Pattern

Create `.kiro/steering/` with:
1. `project-overview.md` (inclusion: always) - locked architecture, invariants, writing rules
2. `coding-conventions.md` (inclusion: fileMatch, pattern: `**/*.{ts,tsx}`) - TypeScript patterns
3. `design-tokens.md` (inclusion: fileMatch, pattern: `**/*.{tsx,css}`) - UI standards
4. `data-model.md` (inclusion: fileMatch, pattern: `**/*.sql`) - database conventions

Each steering file uses front-matter:
```yaml
---
inclusion: always | fileMatch | manual
fileMatchPattern: "**/*.{ts,tsx}"
---
```

Use `#[[file:relative/path]]` to reference other docs for context.

## Kiro Agent Hooks Pattern

Create `.kiro/hooks/` with:

### lint-on-save.json
```json
{
  "version": "v1",
  "hooks": [{
    "name": "Lint TypeScript on Save",
    "trigger": "PostFileSave",
    "matcher": "\\.(ts|tsx)$",
    "action": { "type": "command", "command": "npx next lint", "timeout": 60 }
  }]
}
```

### invariant-check.json
```json
{
  "version": "v1",
  "hooks": [{
    "name": "Check Invariants After Task",
    "trigger": "PostTaskExec",
    "action": { "type": "command", "command": "npm run lint && npm run build", "timeout": 120 }
  }]
}
```

### verify-build-safety.json
```json
{
  "version": "v1",
  "hooks": [{
    "name": "Verify Build Safety",
    "trigger": "PreToolUse",
    "matcher": "fs_write|str_replace",
    "action": {
      "type": "agent",
      "prompt": "Before writing this file, verify: (1) Code builds with blank env vars. (2) New table references exist in both schema.sql and auth_setup.sql. (3) Money fields are gated by canSeeMoney(role). (4) created_by/activity_log use useEffectiveActor() not a raw id."
    }
  }]
}
```

## Build-Safe Pattern

Every component and utility must work when Supabase env is blank:

```typescript
// In supabaseClient.ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const SUPABASE_CONFIGURED = !!(url && key);
export const supabase = createClient(url, key);

// In any page
if (!SUPABASE_CONFIGURED) return <ConnectionCard />;
```

## Row-Level Security Two-File Pattern

Every project with RLS needs two SQL files kept in sync:
1. `schema.sql` - full rebuild with dev (open) RLS policies
2. `auth_setup.sql` - production cutover with per-user/per-role policies

Rule: a new table added to schema.sql MUST also be added to auth_setup.sql or production silently denies everyone.

## Audit Pattern

Every meaningful write:
1. Stamps `created_by` on the record
2. Inserts an `activity_log` row with actor_id, action, entity, entity_id
3. Uses `useEffectiveActor()` (never a raw dropdown id)
4. Guards with `if (actor)` so null-actor rows never happen
