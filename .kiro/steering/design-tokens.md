---
inclusion: fileMatch
fileMatchPattern: "**/*.{tsx,css}"
---

# Design System and UI Standards

When working on UI components or styles, follow these design tokens and rules strictly.

#[[file:.claude/skills/robinsons-store/references/design-tokens.md]]

## Color Tokens (wired into src/app/globals.css)

### Surfaces and text
- App background: #F7F8FA
- Panel/card: #FFFFFF
- Border/divider: #E2E6EB
- Primary text: #1F2933
- Secondary text: #5B6570
- Disabled: #9AA3AD

### Primary action
- Primary action: #2F5FA8
- Primary hover: #244B86
- Focus halo: #B8CCE8

### Status colors (one meaning per hue, never decorative)
- Success (base #1E8E5A, tint #E6F4EC): validated, fully received, paid
- In progress (base #2F5FA8, tint #EAF1FB): parsed, partial received, scanning
- Warning (base #B7791F, tint #FBF1E1): short, over, damaged, disputed
- Error (base #C0362C, tint #FBEAE8): validation error, wrong item, missing field
- Neutral (base #6B7480): awaiting, not started, closed, cancelled

## Receiving Workflow Status to Color
- PENDING_DOCUMENT: neutral
- PARSED: in progress
- VALIDATION_ERROR: error
- AWAITING_ARRIVAL: neutral
- PARTIAL_RECEIVED: in progress
- FULLY_RECEIVED: success
- DISPUTED: warning
- CLOSED: neutral with green check
- CANCELLED: neutral, muted

## Form and Interaction Rules (NN/g based)
- One thing per screen, progressive disclosure
- Labels always visible above the field. Never use placeholder as label
- Inline validation on field blur, not on final submit
- Error prevention first, then plain-language recovery. No hostile or premature errors
- Input masks for phone, currency (CAD), and dates
- Big targets (24px minimum), forgiving defaults, autosave
- Scan do not type: camera or drop fills the form, staff confirm
- Onboarding: first-run tour, seeded sample data, three-step how-to-receive card

## Accessibility (non-negotiable)
- Never let color be the only signal. Every status has a label AND an icon
- Text contrast: WCAG 2.2 AA (4.5:1), AAA (7:1) for small labels on dense forms
- Touch targets: 24px or larger
- Visible 2px focus ring on all interactive elements (power users tab through fields)

## Typography
- Interface: IBM Plex Sans (var(--font-sans))
- Numbers: IBM Plex Mono with tabular figures (var(--font-mono)) so columns line up
- Do not use generic system fonts

## Dashboard Charts (Okabe-Ito colorblind-safe)
Categorical palette in order (stop before 7):
#0072B2, #E69F00, #009E73, #CC79A7, #56B4E9, #D55E00, #F0E442, #999999 (Other)

- Sequential ramp: #EAF1FB (light) to #143A73 (dark)
- Diverging: #0072B2 (low) to #F2F2F2 (center) to #D55E00 (high)
- One color per entity across every chart
- Chrome stays neutral, only data carries saturation
- Status colors on KPI tiles only

## Page Scaffolding Pattern
Every screen opens with:
```html
<div className="page-head">
  <h1 className="page-title">Title</h1>
  <p className="page-sub">Subtitle</p>
  <div className="page-actions">Action buttons</div>
</div>
```
Tables use `tbl-wrap` and `tbl` classes. New screens must follow this pattern.

## Tailwind Custom Colors (from tailwind.config.ts)
Use these semantic tokens instead of raw hex:
- `app` - app background (var(--app-bg))
- `panel` - card/panel background (var(--panel))
- `edge` - border/divider (var(--border))
- `ink` - primary text (var(--text-primary))
- `muted` - secondary text (var(--text-secondary))
- `primary` - action color (var(--primary))
- `primary-hover` - hover state (var(--primary-hover))

## Key Design Principles
- 90% of the screen stays neutral. One hue means exactly one thing
- The captured photos and data carry the color; the interface stays quiet
- Use `.chip-*` classes for status badges
- Capture screen is phone-first: one large photo card, stacking actions, sideways-scrolling line items
- The app shell (AppShell.tsx) owns all chrome: sidebar, topbar, phone tab bar, More sheet. Screens never draw their own nav

## Font Families (tailwind.config.ts)
```
fontFamily: {
  sans: ["var(--font-sans)", "system-ui", "sans-serif"],
  mono: ["var(--font-mono)", "monospace"]
}
```
