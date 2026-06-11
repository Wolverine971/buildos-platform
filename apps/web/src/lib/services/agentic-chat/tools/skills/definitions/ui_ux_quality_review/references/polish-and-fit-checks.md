<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/ui_ux_quality_review/references/polish-and-fit-checks.md -->

# Polish & Fit Checks: Visual Noise, Icons, Feedback, Charts, Responsive

Use this reference when executing review areas 7–11 of the UI/UX quality review. These are threshold-bearing rules — cite the specific rule violated in each finding's Evidence/Fix.

## 7. Visual noise (subtraction first)

Subtraction beats addition. Most fixes remove weight: gradients, decorative shadows, redundant arrows, cosmetic strokes.

- Gradients: same color family only. Default = no gradient.
- Three-step shadow recipe (in order):
    1. Shadow color = light gray, not pure black.
    2. Increase blur ≥ 8px.
    3. Or remove the shadow entirely.
- Shadow opacity ≤ 0.15 on most elements.
- Decorative arrows next to swipeable carousels = remove.
- Borders that aren't doing real work = remove or dim heavily.
- Reject "AI gradients" — `bg-gradient-to-r from-blue-500 to-purple-500` distant-hue blends.

## 8. Icons & affordances

One icon library per region. Match line height. Label ambiguous icons.

- One library per region — no Heroicons + Lucide + Phosphor mixed.
- Icons next to text match the text's line-height around them.
- Solid icons softened in color so perceived weight matches the label.
- Universal icons (house, bookmark, user, search) — no label needed.
- Ambiguous icons — tooltip required, or pair with a text label.
- Mixed icon styles okay only when visually separate (different region, different purpose).
- Replace browser-default form controls — radios, checkboxes, select chevrons.

## 9. Feedback & states

Every user action needs a visible response. Feedback closes the action-result loop.

- Every interactive element has hover / focus / active / disabled states defined.
- Click → at least a fraction-of-a-second visual change.
- Async actions ≥ 200ms = loading spinner or skeleton.
- State-change actions propagate system-wide.
- No layout shift on hover/selected: don't change size, weight, or case. Acceptable: text color, background, shadow, slight transform.

## 10. Charts & data clarity

Function over Dribbble aesthetic. Show the axis. One bar per data point.

- Vertical axis labels visible. Reject "no axis."
- Bar tops flat, not rounded, when reading the value matters.
- One bar per data point. Reject 16 bars for 7 days of the week.
- No portfolio-style decorative gradients on data series.
- Headings as labels, not headlines, in dense data tables.
- Y-axis starts at zero unless explicitly truncating with a clear marker.
- Color coding has a legend reachable in the first scan.

## 11. Responsive fit

Verify text, controls, repeated items, and charts fit on mobile and desktop without overlap or clipping.

- Capture screens at mobile (375px), tablet (768px), desktop (1280px) plus design-specified breakpoints.
- Text wraps; doesn't overflow or clip.
- Touch targets ≥ 44px on mobile.
- Repeated lists/cards stack vertically on mobile, grid on desktop.
- Charts re-flow or scroll horizontally on mobile.
- Mobile padding > desktop padding.
- No horizontal scroll on mobile unless explicitly intended.
