---
skill_id: ui-ux-quality-review
name: UI/UX Quality Review
description: Review product screens, landing pages, dashboards, and mobile flows for flow, hierarchy, spacing, consistency, feedback, and responsive polish. Each principle ships in two layers — human-readable principle plus agent-checkable rules with thresholds and named patterns.
skill_type: combo
categories:
    - product-and-design
lineage: lineage.yaml
path: docs/research/youtube-library/skill-drafts/ui-ux-quality-review/SKILL.md
promoted_to: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/ui_ux_quality_review/SKILL.md
last_promoted: '2026-06-10'
status: registered
---

# UI UX Quality Review

A practical review skill for agents and humans auditing product screens, landing pages, dashboards, and mobile flows.

The discipline this skill enforces is **sequencing**: don't ask whether the interface is pretty until you've answered whether the user can complete the job, whether the screen has a visible hierarchy, whether components behave consistently, and whether the UI responds to user action.

Each principle in this skill ships in two layers:

- **Principle (human view)** — the readable guideline, in plain language.
- **Agent checks** — the same principle expressed as concrete, threshold-bearing rules an agent can execute against a screen.

This dual structure lets a human read the skill as a design manual and an agent run it as a checklist.

## When To Use

- Review a product screen, landing page, dashboard, or mobile flow for practical quality issues.
- Diagnose why a UI feels amateur, cluttered, or hard to trust.
- Improve visual hierarchy, spacing, typography, color, icons, or interaction states.
- Audit charts and data visualization.
- Give design feedback to a developer or founder.
- Turn a rough wireframe into a more polished screen.
- Review AI-generated UI from v0, Lovable, Cursor, or Bolt before it ships.

## Skill Composition

| Primitive ID                     | Job                                                                                | Primary source layer          |
| -------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------- |
| `flow-and-states-review`         | Check completion, recovery, empty, loading, error, skip, search, no-result states. | Kole Jain                     |
| `visual-hierarchy-ranking`       | Decide first/second/third in primacy before styling.                               | DesignSpo hierarchy           |
| `spacing-and-layout-system`      | Audit gaps, padding, type sizes, container widths against the 4-pixel scale.       | DesignSpo golden rule         |
| `typography-system-review`       | Review type roles, line height, letter spacing, contrast, face choice.             | DesignSpo typography          |
| `color-and-contrast-review`      | Check proportions, semantics, contrast, dark-mode saturation, palette balance.     | DesignSpo color theory        |
| `component-consistency-review`   | Normalize same-type components and remove accidental variation.                    | Kole Jain + DesignSpo         |
| `feedback-and-affordance-review` | Check states, icons, labels, tooltips, microinteractions.                          | Kole Jain                     |
| `responsive-fit-review`          | Verify controls, text, repeated items, charts fit on mobile and desktop.           | Kole Jain + BuildOS synthesis |
| `delight-and-anti-delight-audit` | Identify valley moments, useful delight, surface-only decoration, inclusion risk.  | Nesrine Changuel              |

Primitive IDs match `lineage.yaml` so findings can cite the underlying source claim.

## Preflight

Run preflight before producing findings. Same shape for humans and agents — different inputs.

### For humans

Have the following ready before running this review:

- The screen, flow, or page you're reviewing — preferably a live URL or an interactive prototype, not just a static PNG.
- Both **light and dark mode** captured if the product supports both.
- The screen at **mobile (375px), tablet (768px), and desktop (1280px)** widths, plus any breakpoint the design specifies.
- The **interactive states** for the major elements: hover, focus, active, disabled, loading, error, success, empty.
- The **happy path** clearly identified — what is the user trying to accomplish on this screen?
- The **edge paths** at least named — skip, cancel, error, no-results, recovery.
- Any **design tokens or system** the team is working from (Inkprint, Tailwind, internal DS) so findings can be expressed in tokens, not arbitrary values.

### For agents

Before producing findings, capture or confirm:

- Screenshots at the breakpoints listed above for both color modes.
- All defined interactive states for primary CTAs, inputs, and links.
- The DOM/computed-styles snapshot for typography, spacing, and color tokens (when source is available).
- The user task on this surface (one sentence). If unclear, surface the ambiguity and ask before reviewing.
- The closest matching primitive ID per finding, drawn from `lineage.yaml`.
- Confidence floor: if a finding can't be evidenced with a specific component, class, region, or coordinate, do not include it.

## Review (in order)

The review is sequential. Each step lists the **principle** (human view) followed by **agent checks** (the same principle as runnable rules).

### 1. Flow & states

**Principle.** Check whether the user can complete the job before fixing pixels. Every non-happy path needs a defined behavior — skip, search, recover, empty, loading, error. Sketch flows on paper before designing screens; users feel missing edges instantly.

> _"These are things you will miss if you don't plan out your flow, but users, they'll feel it instantly."_ — Kole Jain

**Agent checks**

- Every onboarding/setup screen has: skip path, "other" or search escape, no-result fallback, error recovery.
- Every interactive element has at least one of `:hover`, `:focus`, `:active`, `:disabled`, loading, success, error states defined in styles.
- Every async action ≥ 200ms has a loading indicator (spinner, skeleton, or progress bar — pick one pattern per surface).
- Every state-change action (save, submit, delete) has a system-wide visible feedback. Example: save → fill the icon AND drop a badge dot on the related tab.
- Empty states are not just "no items." They include: illustration or icon, first-action CTA, helper text explaining how to populate.
- Error messages name what went wrong AND what the user can do next. "Something went wrong" alone is a finding.
- Cite primitive ID `flow-and-states-review` on findings in this section.

### 2. Visual hierarchy

**Principle.** Rank before style. Decide what is first, second, and third in primacy before picking sizes, fonts, or colors. Hierarchy is a ranking decision, not a styling decision. Most of the screen must be uniform — primacy is scarce.

> _"Hierarchy is not the decision of what's essential in the design, but simply what visitors should see first, second, third."_ — DesignSpo

**Agent checks**

- Exactly one primary element per surface; flag if 3+ elements compete for primacy.
- **Contrast levers in rank order — use earlier levers before later ones**:
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
- **Composition matches scan path**: F-pattern for text-heavy pages; Z-pattern for minimalist hero or poster; top-to-bottom for cards and lists.
- **Cohesion rule**: same-type components share every value — image size, font, weight, line height, border, radius, padding. Change one, change them all.
- Stock human/face imagery is allowed only when the person is performing the task the product solves.
- Motion is bounded: once the user is looking, motion minimizes or stops. Flag persistent looping animations.
- Cite primitive ID `visual-hierarchy-ranking` on findings.

### 3. Spacing & layout

**Principle.** Use a 4-pixel-derived system. Every spacing value, padding, gap, container width, and font size is a multiple of 4. The closed scale is the system. Mobile needs more whitespace than desktop, not less.

**Agent checks**

- **Closed spacing scale (no exceptions)**: 4, 8, 12, 16, 24, 32, 48, 64, 96. Reject 13px, 27px, "looks about right."
- **Spacing assigned by relatedness**:
    - 4px inside a composite element (icon + label)
    - 8px inside list items
    - 16px inside a component
    - 24px between components
    - 32px+ between sections
- **Mobile padding ≥ 1.25× equivalent desktop padding**.
- **Touch targets ≥ 44px (iOS HIG) or 48dp (Android Material)**.
- Whitespace at all three levels: line-height, element padding/margin, section gaps. One level alone is not enough.
- Container widths derived: `max-width = (column × count) + (gutter × (count − 1))`.
- Off-grid placement allowed as a deliberate hierarchy lever (#10) but flag if it looks accidental.
- Cite primitive ID `spacing-and-layout-system` on findings.

### 4. Typography

**Principle.** One hierarchy with four roles: headings, paragraphs, buttons, labels. Don't trust browser defaults. Set line-height and letter-spacing per role and per size.

**Agent checks**

- One primary font in product UI. Pair with display only on marketing surfaces.
- **Type scale (closed set)**: 16, 20, 24, 28, 32, 40, 48, 64.
- **Headings**: 2–3 levels max. Set the largest first, derive smaller / thinner / more-spaced.
- **Line-height inversely proportional to size**: ~1.0× for big headlines, ~1.5× for body. Override the browser default 125%.
- **Letter-spacing inversely proportional to size**: tighten display sizes (48+) by ~−1% (-0.01em); body default; small text loosens; bold buttons get extra tracking.
- Use **rem on the web**. 1rem = 16px default.
- **Body text contrast ≥ 4.5:1 (WebAIM AA)**. Aim for 7:1.
- **Typeface category matches voice**: serif = traditional/editorial; sans-serif = modern/neutral; display = headlines only; script = rarely; mono = technical.
- Headings as labels, not headlines, in tables: small, bold, uppercase, softer color.
- Cite primitive ID `typography-system-review` on findings.

### 5. Color & contrast

**Principle.** Reason in HSB, ship in hex. Pick by hue/saturation/brightness; don't type raw hex when picking. Use color for meaning. Maintain 60/30/10 proportions.

**Agent checks**

- **Pick the model for the medium**: RGB/A for digital, CMYK for print, **HSB for selection**.
- **60/30/10 proportion rule**: 60% dominant, 30% secondary, 10% accent (CTAs and focal points only).
- **Body text contrast ≥ 4.5:1 (WebAIM)**. Test text over Inkprint texture overlays — `tx-bloom`, `tx-grain` can degrade real contrast.
- **Complementary palettes never split 50/50** — they clash.
- **Dark-mode accents drop ~10–15% saturation vs. light mode**.
- **Warm advances, cool recedes**.
- **"Lighter" colored text uses hue rotation, not lightness.** Drag picker toward top-left in HSB, same hue. Do not use `text-gray-400` on a colored background.
- **Greys are not pure grey.** Saturate cool for cool brands, warm for warm brands. Bump saturation at lightest and darkest extremes.
- Reject pop-psychology shortcuts ("blue = trust").
- Each semantic role (success, warning, danger, focus, selection, category) maps to ≤ 1 color per surface.
- Cite primitive ID `color-and-contrast-review` on findings.

### 6. Component consistency (cohesion)

**Principle.** Same-type components share every value. Change one, change them all.

**Agent checks**

- Same-type components have identical: image/icon size, font, weight, line-height, border, radius, padding, height.
- **Corner-radius standard**: pick one radius for the whole system (often 10px for small components; 8–12px for inputs/cards). Mixing scales on the same screen is a tell.
- Same-purpose buttons (back, cancel, skip) match in size, radius, and style. Different prompting text only.
- Variation between rows of the same kind is intentional, not accidental.
- Use the system's reusability primitives: styles for colors, variables for measurements, components for UI elements.
- Cite primitive ID `component-consistency-review` on findings.

### 7. Visual noise (subtraction first)

**Principle.** Subtraction beats addition. Most fixes remove weight: gradients, decorative shadows, redundant arrows, cosmetic strokes.

**Agent checks**

- **Gradients**: same color family only. Default = no gradient.
- **Three-step shadow recipe** (in order):
    1. Shadow color = **light gray**, not pure black.
    2. **Increase blur ≥ 8px**.
    3. Or **remove the shadow** entirely.
- Shadow opacity ≤ 0.15 on most elements.
- Decorative arrows next to swipeable carousels = remove.
- Borders that aren't doing real work = remove or dim heavily.
- Reject "AI gradients" — `bg-gradient-to-r from-blue-500 to-purple-500` distant-hue blends.

### 8. Icons & affordances

**Principle.** One icon library per region. Match line height. Label ambiguous icons.

**Agent checks**

- One library per region — no Heroicons + Lucide + Phosphor mixed.
- Icons next to text match the text's line-height around them.
- Solid icons softened in color so perceived weight matches the label.
- **Universal icons** (house, bookmark, user, search) — no label needed.
- **Ambiguous icons** — tooltip required, or pair with a text label.
- Mixed icon styles okay only when visually separate (different region, different purpose).
- Replace browser-default form controls — radios, checkboxes, select chevrons.

### 9. Feedback & states

**Principle.** Every user action needs a visible response. Feedback closes the action-result loop.

**Agent checks**

- Every interactive element has hover / focus / active / disabled states defined.
- Click → at least a fraction-of-a-second visual change.
- Async actions ≥ 200ms = loading spinner or skeleton.
- State-change actions propagate system-wide.
- **No layout shift on hover/selected**: don't change size, weight, or case. Acceptable: text color, background, shadow, slight transform.
- Cite primitive ID `feedback-and-affordance-review` on findings.

### 10. Charts & data clarity

**Principle.** Function over Dribbble aesthetic. Show the axis. One bar per data point.

**Agent checks**

- Vertical axis labels visible. Reject "no axis."
- Bar tops flat, not rounded, when reading the value matters.
- One bar per data point. Reject 16 bars for 7 days of the week.
- No portfolio-style decorative gradients on data series.
- Headings as labels, not headlines, in dense data tables.
- Y-axis starts at zero unless explicitly truncating with a clear marker.
- Color coding has a legend reachable in the first scan.

### 11. Responsive fit

**Principle.** Verify text, controls, repeated items, and charts fit on mobile and desktop without overlap or clipping.

**Agent checks**

- Capture screens at **mobile (375px), tablet (768px), desktop (1280px)** plus design-specified breakpoints.
- Text wraps; doesn't overflow or clip.
- Touch targets ≥ 44px on mobile.
- Repeated lists/cards stack vertically on mobile, grid on desktop.
- Charts re-flow or scroll horizontally on mobile.
- Mobile padding > desktop padding.
- No horizontal scroll on mobile unless explicitly intended.
- Cite primitive ID `responsive-fit-review` on findings.

### 12. Delight & anti-delight (optional final pass)

**Principle.** Run only after foundational review. Delight does not rescue broken flow. Use the three pillars: remove friction at valley moments, anticipate needs, exceed expectations after needs are anticipated.

**Agent checks — three-pillar audit**

- **Pillar 1 — Remove friction.** Identify _valley moments_: errors, cancellation, refunds, account deletion, lost work, support requests.
- **Pillar 2 — Anticipate needs.** Surface something the user did not request but recognizes as theirs.
- **Pillar 3 — Exceed expectations.** Once a need is anticipated, deliver more than asked.

**Agent checks — delight grid placement**

| Type            | Solves Functional? | Solves Emotional? | Verdict                                                        |
| --------------- | ------------------ | ----------------- | -------------------------------------------------------------- |
| Low Delight     | Yes                | No                | Default. Most of the product. Fine.                            |
| Surface Delight | No                 | Yes               | Allow only when the underlying moment has weight. Cap at ~10%. |
| Deep Delight    | Yes                | Yes               | The goal.                                                      |

**Agent checks — roadmap balance (50/40/10)**

~50% pure functionality, ~40% deep delight, ~10% surface delight. If a review keeps surfacing surface-only delighters, something upstream is broken.

**Agent checks — pre-ship checklist**

User impact / business impact / feasibility / familiarity / inclusion / maintainability of surprise. Every box must be checked.

**Agent checks — anti-delight rejections**

- Default-on celebrations in unknown contexts.
- Pseudo-personal pushes (missed call from "Mom") for unknown user contexts.
- Streak-loss / shaming gamification in productivity, ADHD, burnout, mental-health adjacent surfaces.
- Surface delight without the moment.
- "Delight" as a feature-gating excuse for a broken product.

**Demotivator inversion** (when delight feels off): ask "what would frustrate, embarrass, or exhaust the user here?" Invert the demotivator, get the brief.

**Habituation risk**: surprise decays — first-use wow, fifth-use wallpaper. Every delight feature needs a continuous-iteration plan or it becomes invisible.

Cite primitive ID `delight-and-anti-delight-audit` on findings.

## AI-Generated UI Smoke Test

Reviewing AI-generated UI from v0 / Lovable / Cursor / Bolt is the most common modern use of this skill. Detect these fingerprints first:

| AI-slop pattern                                              | Why it reads as slop                          | Corrective move                                                        |
| ------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------- |
| `rounded-2xl` + `shadow-md` + `border` stacked on every card | Triple belt-and-suspenders                    | Pick one.                                                              |
| `text-gray-400` / `text-slate-500` on every muted element    | Pure grey on colored backgrounds reads dull   | Replace with a lighter S/B variant of the brand hue.                   |
| `shadow-md` everywhere, no elevation distinction             | No two-part decomposition                     | Define an elevation ladder.                                            |
| `bg-gradient-to-r from-blue-500 to-purple-500`               | "AI gradient" — distant hues blended          | Rotate hue across a single family or remove.                           |
| Inter, Inter, Inter                                          | Single biggest fingerprint of AI-generated UI | Swap to Satoshi / Metropolis / Figtree, or pair with display headline. |
| Default `p-4` / `gap-4` / `space-y-4` everywhere             | Tight Tailwind defaults                       | Double the spacing values.                                             |
| Outline buttons everywhere                                   | Ghost buttons feel weightless                 | Soft-solid based on text color at low alpha.                           |
| Borders separating every form field, table row, card section | Borders as the only hierarchy lever           | Replace with zebra striping, off-white blocks, or spacing.             |

For deeper AI-slop coverage and corrective tokens, hand off to `visual-craft-fundamentals`.

## Output Schema

Every finding follows this canonical shape:

```
Domain: <flow | hierarchy | spacing | typography | color | consistency | noise | icons | feedback | charts | responsive | delight>
Finding: <named principle violated, e.g., "Closed-scale spacing violated">
Evidence: <specific component, class string, region, or coordinate>
Severity: <high | medium | low>
Fix: <concrete tokens or named technique>
Source claim: <lineage primitive ID>
Delegated: <optional sibling skill if the fix is out of scope>
```

A finding without **Evidence** is not a finding. A finding without **Severity** is not actionable.

### Severity rubric

- **high** — blocks task completion, breaks accessibility floor (body text contrast < 4.5:1), or creates inclusion risk.
- **medium** — degrades polish or readability significantly; consistency drift; off-scale spacing.
- **low** — stylistic preference, minor decorative noise.

### Stop conditions

- At least one finding per applicable category (or category explicitly marked "no issues").
- Top 3 high-severity fixes ranked by impact.
- All findings carry evidence and severity.
- Out-of-scope concerns tagged `Delegated:` to a sibling skill rather than dropped.

## Stack With (Workflow)

`stackWith` is workflow, not just metadata. Default chain:

1. **`ui-ux-quality-review`** (this skill) — foundational pass.
2. **`accessibility-and-inclusive-ui-review`** — when WCAG 2.2 AA, semantics, keyboard, screen-reader behavior matter.
3. **`visual-craft-fundamentals`** — level-up pass: two-part shadows, hue rotation, single-hue palettes, up-pop/down-pop, named text-on-image methods. Corrective lens for AI-generated UI.
4. **`marketing-site-design-review`** — section-by-section landing-page review.
5. **`delightful-product-review`** — full delight rubric when foundational + craft are clean.

**Handoff outputs.** Findings tagged `Delegated: <sibling-skill>` route to the appropriate sibling. Each sibling consumes the canonical schema directly.

**Default order**: 1 → 2 → 3 → 4 → 5. Skip 2 if accessibility is out of scope. Skip 4 unless the surface is a marketing page. Skip 5 unless foundational + craft passes are clean.

## Guardrails

- Do not recommend decorative gradients, extra cards, or ornamental effects as the first fix.
- Do not prioritize visual novelty over task clarity.
- Do not remove labels from unfamiliar icon-only controls without adding tooltips.
- Do not make every element the same visual weight.
- Do not assume desktop spacing works on mobile.
- Do not allow off-scale spacing or font-size values.
- Do not trust the browser default 125% line-height.
- Do not split a complementary color palette 50/50.
- Do not pick color by typing hex values.
- Do not stack contrast levers to make everything important.
- Do not return findings without evidence.
- Do not assign severity without referencing the rubric.

## Sources

### Human-facing source attribution

- **Kole Jain** — [7 UI/UX mistakes that scream you're a beginner](https://www.youtube.com/watch?v=AH_ugxmLeUM); [Every UI/UX Concept Explained in Under 10 Minutes](https://www.youtube.com/watch?v=EcbgbKtOELY).
- **DesignSpo** — [Visual Hierarchy](https://www.youtube.com/watch?v=kK1TOpI948o); [Typography](https://www.youtube.com/watch?v=AXpxZMRM1EY); [Color Theory](https://www.youtube.com/watch?v=tKCORDK0IZU); [The Golden Rule Of Web Design](https://www.youtube.com/watch?v=CASPWJUsHPM).
- **Nesrine Changuel** on [Lenny's Podcast](https://www.youtube.com/@LennysPodcast) — [A 4-step framework for building delightful products](https://www.youtube.com/watch?v=tX6nwT1Bsuo).

### Agent-facing deep-dive references

- Visual hierarchy / contrast levers / scan-pattern → `docs/research/youtube-library/analyses/2026-04-29_designspo-visual-hierarchy_analysis.md`
- Typography / line-height / letter-spacing → `docs/research/youtube-library/analyses/2026-04-29_designspo-typography_analysis.md`
- Color contrast / palette / dark-mode → `docs/research/youtube-library/analyses/2026-04-29_designspo-color-theory_analysis.md`
- 4-pixel system / spacing math / container width → `docs/research/youtube-library/analyses/2026-04-29_designspo-golden-rule-web-design_analysis.md`
- Beginner-tell taxonomy / shadow recipe / 10px radius / save→badge-dot → `docs/marketing/growth/research/youtube-transcripts/2025-06-07-kole-jain-7-ui-ux-mistakes-beginner-ANALYSIS.md`
- Delight pillars / inclusion risk / habituation → `docs/marketing/growth/research/youtube-transcripts/2026-04-28-nesrine-changuel-4-step-delightful-products-framework-ANALYSIS.md`
- Lineage source claims and primitive IDs → `docs/research/youtube-library/skill-drafts/ui-ux-quality-review/lineage.yaml`
- WebAIM contrast checker → https://webaim.org/resources/contrastchecker/

Source captures dated 2026-04-27 to 2026-04-29.
