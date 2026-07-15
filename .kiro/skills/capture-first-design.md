---
name: capture-first-design
description: Design system for a capture-first store operations app. Covers the full design token set, accessibility rules (WCAG AA), form patterns (NN/g), page scaffolding, status-to-color mapping, responsive shell (sidebar/tab bar/More sheet), and the one-meaning-per-hue principle. Use when building or modifying any UI screen.
---

# Capture-First Design System Skill

A complete design system for store operations apps where the primary interaction is capturing data (invoices, counts, notes) quickly. The interface stays quiet so the captured data carries the color.

## When to use

- Building any new screen or component
- Modifying existing UI elements
- Adding status indicators or badges
- Creating responsive layouts
- Ensuring accessibility compliance

## Core Philosophy

- **Capture first**: the camera or a file drop fills the form; staff confirm
- **90% neutral**: the interface stays quiet, only data and status carry saturation
- **One meaning per hue**: each color means exactly one thing everywhere
- **Scan, do not type**: big targets, autosave, progressive disclosure

## Color Tokens

### Surfaces
| Token | Value | Use |
|-------|-------|-----|
| --app-bg | #F7F8FA | App background |
| --panel | #FFFFFF | Card/panel |
| --border | #E2E6EB | Dividers |
| --text-primary | #1F2933 | Body text |
| --text-secondary | #5B6570 | Help text |
| --disabled | #9AA3AD | Disabled |

### Primary Action
| Token | Value | Use |
|-------|-------|-----|
| --primary | #2F5FA8 | Buttons, links |
| --primary-hover | #244B86 | Hover state |
| --focus-halo | #B8CCE8 | Focus ring |

### Status (one meaning each)
| Status | Base | Tint | Means |
|--------|------|------|-------|
| Success | #1E8E5A | #E6F4EC | Validated, received, paid |
| In progress | #2F5FA8 | #EAF1FB | Parsing, partial, scanning |
| Warning | #B7791F | #FBF1E1 | Short, damaged, disputed |
| Error | #C0362C | #FBEAE8 | Validation error, missing |
| Neutral | #6B7480 | -- | Awaiting, closed, cancelled |

## Tailwind Semantic Colors

```typescript
// tailwind.config.ts
colors: {
  app: "var(--app-bg)",
  panel: "var(--panel)",
  edge: "var(--border)",
  ink: "var(--text-primary)",
  muted: "var(--text-secondary)",
  primary: "var(--primary)",
  "primary-hover": "var(--primary-hover)"
}
```

## Status Chip Classes

```css
.chip-success { background: #E6F4EC; color: #1E8E5A; }
.chip-progress { background: #EAF1FB; color: #2F5FA8; }
.chip-warning { background: #FBF1E1; color: #B7791F; }
.chip-error { background: #FBEAE8; color: #C0362C; }
.chip-neutral { background: #EEF1F4; color: #6B7480; }
```

Never use color alone. Every chip also carries a text label.

## Typography

- Interface: IBM Plex Sans (`var(--font-sans)`)
- Numbers: IBM Plex Mono with tabular figures (`var(--font-mono)`)
- Tabular figures keep number columns aligned

```typescript
fontFamily: {
  sans: ["var(--font-sans)", "system-ui", "sans-serif"],
  mono: ["var(--font-mono)", "monospace"]
}
```

## Page Scaffolding Pattern

Every screen opens with:

```tsx
<header className="page-head">
  <div>
    <h1 className="page-title">Page Title</h1>
    <p className="page-sub">Short description of what this screen does.</p>
  </div>
  <div className="page-actions">
    <button className="btn-ghost">Secondary</button>
    <button className="btn-primary">Primary Action</button>
  </div>
</header>
```

Tables use `tbl-wrap` (scrollable container) and `tbl` (the table itself).

## Form Rules (NN/g based)

1. **One thing per screen**: progressive disclosure, not everything at once
2. **Labels above fields**: always visible, never as placeholder text
3. **Inline validation**: on field blur, not on final submit
4. **Error prevention first**: then plain-language recovery
5. **Input masks**: phone, currency (CAD), dates
6. **Big targets**: 24px minimum touch area
7. **Autosave where possible**: the user should not lose work
8. **Forgiving defaults**: pre-fill what can be inferred (HST from amount, today's date)

## Accessibility (WCAG 2.2 AA, non-negotiable)

- Color is never the only signal (every status has label + icon)
- Text contrast: 4.5:1 minimum (7:1 for small labels on dense forms)
- Touch targets: 24px or larger
- Visible 2px focus ring (var(--focus-halo)) on all interactive elements
- Keyboard navigation: power users tab through fields
- Screen reader: semantic HTML, proper labels, ARIA where needed

## Responsive Shell Pattern

The app shell (AppShell.tsx) owns ALL navigation. Screens never draw their own.

### Desktop (managers/owners)
- Grouped sidebar: Today, Money, Store, People, Property, Admin
- Slim topbar: View-as dropdown, notification bell, Capture button

### Desktop (staff/leads)
- Four-item sidebar list
- Same topbar

### Mobile (all roles)
- Bottom tab bar with Capture in thumb reach
- "More" sheet for overflow items
- Capture is phone-first: one large photo card, stacking actions, sideways-scrolling line items

## Dashboard Charts (Okabe-Ito colorblind-safe)

Categorical palette (stop before 7 categories):
```
#0072B2, #E69F00, #009E73, #CC79A7, #56B4E9, #D55E00, #F0E442
```
- `#999999` for "Other"
- Sequential ramp: #EAF1FB to #143A73
- Diverging: #0072B2 (low), #F2F2F2 (center), #D55E00 (high)
- One color per entity across every chart
- Chrome stays neutral, only data carries saturation
- Status colors on KPI tiles only

## Card Pattern

```tsx
<div className="card" style={{ padding: 12 }}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
    <div>
      <strong>Title</strong>
      <div className="help" style={{ marginTop: 4 }}>Secondary info</div>
    </div>
    <div style={{ textAlign: "right" }}>
      <div className="tabular" style={{ fontWeight: 600 }}>{formatCAD(amount)}</div>
      <button className="btn-ghost" style={{ padding: "4px 10px" }}>Action</button>
    </div>
  </div>
</div>
```

## Button Hierarchy

- `.btn-primary`: main action (one per screen section)
- `.btn-ghost`: secondary actions, inline operations
- Disabled state: set `disabled={busy}` during async operations

## Inline Edit Pattern

Sections that can be edited:
1. Show read-only content by default
2. "Edit" button (btn-ghost) reveals the form inline (no modal)
3. Form has Save + Cancel buttons
4. Cancel reverts to read-only
5. Gate with `canEdit(role)` (owners and managers only)

## Loading States

```tsx
if (loading) return <p className="help">Loading the data.</p>;
```

Keep loading messages plain and specific to what is loading.

## Error Display

```tsx
{error && (
  <div className="card" style={{ padding: 12 }}>
    <span className="chip chip-error">Error</span>
    <span className="help" style={{ marginLeft: 8 }}>{error}</span>
  </div>
)}
```
