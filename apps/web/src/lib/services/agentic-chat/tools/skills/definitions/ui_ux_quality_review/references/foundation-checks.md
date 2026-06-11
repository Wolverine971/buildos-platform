<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/ui_ux_quality_review/references/foundation-checks.md -->

# Foundation Checks: Flow, Hierarchy, Spacing, Typography, Color, Consistency

Use this reference when executing review areas 1–6 of the UI/UX quality review. These are threshold-bearing rules — cite the specific rule violated in each finding's Evidence/Fix.

## 1. Flow & states

Check whether the user can complete the job before fixing pixels. Every non-happy path needs a defined behavior.

- Every onboarding/setup screen has: skip path, "other" or search escape, no-result fallback, error recovery.
- Every interactive element has at least one of `:hover`, `:focus`, `:active`, `:disabled`, loading, success, error states defined.
- Every async action ≥ 200ms shows a loading indicator (spinner, skeleton, or progress bar — one pattern per surface).
- Every state-change action (save, submit, delete) has system-wide visible feedback. Example: save → fill the icon AND drop a badge dot on the related tab.
- Empty states are not just "no items." They include: illustration or icon, first-action CTA, helper text explaining how to populate.
- Error messages name what went wrong AND what the user can do next. "Something went wrong" alone is a finding.

## 2. Visual hierarchy

Rank before style. Hierarchy is a ranking decision, not a styling decision. Primacy is scarce.

- Exactly one primary element per surface; flag if 3+ elements compete for primacy.
- Contrast levers in rank order — use earlier levers before later ones:
    1. Motion
    2. Task-relevant information (the thing the user actually wants)
    3. White space (focal point via breathing room)
    4. Humans / faces (only when contextually relevant to the offer)
    5. Color
    6. Size
    7. Weight
    8. Imagery
    9. Extra elements (tags like "best value", borders, badges)
    10. Deliberate misalignment
- Flag designs that lead with #5–#6 (color/size) and skip #1–#4.
- Composition matches scan path: F-pattern for text-heavy pages; Z-pattern for minimalist hero or poster; top-to-bottom for cards and lists.
- Stock human/face imagery is allowed only when the person is performing the task the product solves.
- Motion is bounded: once the user is looking, motion minimizes or stops. Flag persistent looping animations.

## 3. Spacing & layout

Use a 4-pixel-derived system. Mobile needs more whitespace than desktop, not less.

- Closed spacing scale (no exceptions): 4, 8, 12, 16, 24, 32, 48, 64, 96. Reject 13px, 27px, "looks about right."
- Spacing assigned by relatedness:
    - 4px inside a composite element (icon + label)
    - 8px inside list items
    - 16px inside a component
    - 24px between components
    - 32px+ between sections
- Mobile padding ≥ 1.25× equivalent desktop padding.
- Touch targets ≥ 44px (iOS HIG) or 48dp (Android Material).
- Whitespace at all three levels: line-height, element padding/margin, section gaps. One level alone is not enough.
- Container widths derived: `max-width = (column × count) + (gutter × (count − 1))`.
- Off-grid placement allowed as a deliberate hierarchy lever (#10 above) but flag if it looks accidental.

## 4. Typography

One hierarchy with four roles: headings, paragraphs, buttons, labels. Don't trust browser defaults.

- One primary font in product UI. Pair with display only on marketing surfaces.
- Type scale (closed set): 16, 20, 24, 28, 32, 40, 48, 64.
- Headings: 2–3 levels max. Set the largest first, derive smaller / thinner / more-spaced.
- Line-height inversely proportional to size: ~1.0× for big headlines, ~1.5× for body. Override the browser default 125%.
- Letter-spacing inversely proportional to size: tighten display sizes (48+) by ~−1% (−0.01em); body default; small text loosens; bold buttons get extra tracking.
- Use rem on the web. 1rem = 16px default.
- Body text contrast ≥ 4.5:1 (WebAIM AA). Aim for 7:1.
- Typeface category matches voice: serif = traditional/editorial; sans-serif = modern/neutral; display = headlines only; script = rarely; mono = technical.
- Headings as labels, not headlines, in tables: small, bold, uppercase, softer color.

## 5. Color & contrast

Reason in HSB, ship in hex. Use color for meaning. Maintain 60/30/10 proportions.

- Pick the model for the medium: RGB/A for digital, CMYK for print, HSB for selection.
- 60/30/10 proportion rule: 60% dominant, 30% secondary, 10% accent (CTAs and focal points only).
- Body text contrast ≥ 4.5:1 (WebAIM). Test text over Inkprint texture overlays — `tx-bloom`, `tx-grain` can degrade real contrast.
- Complementary palettes never split 50/50 — they clash.
- Dark-mode accents drop ~10–15% saturation vs. light mode.
- Warm advances, cool recedes.
- "Lighter" colored text uses hue rotation, not lightness. Drag picker toward top-left in HSB, same hue. Do not use `text-gray-400` on a colored background.
- Greys are not pure grey. Saturate cool for cool brands, warm for warm brands. Bump saturation at the lightest and darkest extremes.
- Reject pop-psychology shortcuts ("blue = trust").
- Each semantic role (success, warning, danger, focus, selection, category) maps to ≤ 1 color per surface.

## 6. Component consistency (cohesion)

Same-type components share every value. Change one, change them all.

- Same-type components have identical: image/icon size, font, weight, line-height, border, radius, padding, height.
- Corner-radius standard: pick one radius for the whole system (often 10px for small components; 8–12px for inputs/cards). Mixing scales on the same screen is a tell.
- Same-purpose buttons (back, cancel, skip) match in size, radius, and style. Different prompting text only.
- Variation between rows of the same kind is intentional, not accidental.
- Use the system's reusability primitives: styles for colors, variables for measurements, components for UI elements.
