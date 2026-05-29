# Design tokens, status mapping, and form rules

Adapted from the color and interface guide. The guide was written for a warehouse with barcode guns, gloves, and haptics. This store is department laptops with a webcam and drag-and-drop, so keep the palette, the one-meaning-per-hue discipline, and the never-color-alone rule, and drop the handheld-scanner haptics specifics. Roughly 90 percent of the screen stays neutral. One hue means exactly one thing.

## Surfaces and text
- App background #F7F8FA
- Panel or card #FFFFFF
- Border or divider #E2E6EB
- Primary text #1F2933
- Secondary text #5B6570
- Disabled #9AA3AD

## Primary action and focus
- Primary action #2F5FA8
- Primary hover #244B86
- Focus halo #B8CCE8

## Status, one meaning each. base for text, icon, border. tint for the fill.
- Success base #1E8E5A, tint #E6F4EC. Good, validated, fully received, paid.
- In progress base #2F5FA8, tint #EAF1FB. Parsed, partial received, scanning.
- Warning base #B7791F, tint #FBF1E1. Short, over, damaged, disputed. A person decides.
- Error base #C0362C, tint #FBEAE8. Validation error, wrong item, missing field.
- Neutral base #6B7480. Awaiting, not started, closed, cancelled.

## Receiving workflow status to color
- PENDING_DOCUMENT neutral, received not parsed.
- PARSED in progress, lines extracted in validation.
- VALIDATION_ERROR error, fix before receiving.
- AWAITING_ARRIVAL neutral, waiting on goods.
- PARTIAL_RECEIVED in progress, keep going.
- FULLY_RECEIVED success, ready to complete.
- DISPUTED warning, under review.
- CLOSED neutral, muted, green check.
- CANCELLED neutral, muted.

## Form and interaction rules (NN/g)
- One thing per screen, progressive disclosure.
- Labels always visible above the field. Never use placeholder text as the label.
- Inline validation as the user leaves a field, not on final submit.
- Error prevention first, then plain-language recovery. No hostile or premature errors.
- Input masks for phone, currency in CAD, and dates.
- Big targets, forgiving defaults, autosave, and scan do not type. The camera or a drop fills the form, staff confirm.
- Onboarding: a first-run tour, seeded sample data, and a three-step how to receive card.

## Accessibility
- Never let color be the only signal. Every status carries a label and an icon.
- Text at WCAG 2.2 AA 4.5 to 1, AAA 7 to 1 for small labels on dense forms.
- Targets 24px or larger. A visible 2px focus ring is required since power users tab through fields.

## Typography
- IBM Plex Sans for the interface, IBM Plex Mono with tabular figures for numbers so columns line up. Avoid generic system fonts.

## Dashboard charts (manager and owner, later phase)
Chrome stays neutral, only the data carries saturation. Okabe-Ito colorblind-safe categorical set in order, stop before about seven: #0072B2, #E69F00, #009E73, #CC79A7, #56B4E9, #D55E00, #F0E442, with #999999 for Other. Sequential ramp light #EAF1FB to dark #143A73. Diverging blue to orange #0072B2 low, #F2F2F2 center, #D55E00 high. One color per entity across every chart. Status colors on KPI tiles only.
