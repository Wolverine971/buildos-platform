---
title: 'UI/UX Quality Review: An Agent Skill For Product Interface Audits'
description: 'A source-lineaged agent skill for reviewing product screens, landing pages, dashboards, and mobile flows. Each principle ships in two layers: human-readable principle + agent-checkable rules with thresholds and named patterns.'
author: 'DJ Wayne'
date: '2026-05-02'
lastmod: '2026-05-03'
changefreq: 'monthly'
priority: '0.9'
published: true
tags:
    [
        'agent-skills',
        'ui-ux',
        'design-review',
        'product-design',
        'interface-quality',
        'product-and-design',
        'buildos'
    ]
readingTime: 18
excerpt: 'A practical UI/UX review skill for agents and humans. Each principle has a human view and an agent view: the principle on top, then the checkable rules and thresholds an agent runs against the screen.'
skillId: 'product-and-design/ui-ux-quality-review'
skillType: 'combo'
skillCategory: 'product-and-design'
providers: ['YouTube source analysis', 'BuildOS YouTube library']
compatibleAgents: ['BuildOS-compatible agents', 'Claude Code', 'Codex', 'portable Agent Skills']
stackWith:
    [
        'accessibility-and-inclusive-ui-review',
        'visual-craft-fundamentals',
        'marketing-site-design-review',
        'delightful-product-review'
    ]
skillSource: 'docs/research/youtube-library/skill-drafts/ui-ux-quality-review/SKILL.md'
lineagePath: 'docs/research/youtube-library/skill-drafts/ui-ux-quality-review/lineage.yaml'
lineagePeople:
    - 'Kole Jain'
    - 'Nesrine Changuel'
    - 'Lenny Rachitsky'
lineageStats:
    sources: 7
    primitives: 9
    sourceClaims: 9
    edges: 24
    candidateV2Sources: 3
lineageSources:
    - title: "7 UI/UX mistakes that scream you're a beginner"
      creator: 'Kole Jain'
      creatorType: 'Person'
      creatorUrl: 'https://www.youtube.com/@KoleJain'
      channelName: 'Kole Jain'
      channelUrl: 'https://www.youtube.com/@KoleJain'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=AH_ugxmLeUM'
    - title: 'Every UI/UX Concept Explained in Under 10 Minutes'
      creator: 'Kole Jain'
      creatorType: 'Person'
      creatorUrl: 'https://www.youtube.com/@KoleJain'
      channelName: 'Kole Jain'
      channelUrl: 'https://www.youtube.com/@KoleJain'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=EcbgbKtOELY'
    - title: 'The Complete Guide To Visual Hierarchy'
      creator: 'DesignSpo'
      creatorType: 'Organization'
      creatorUrl: 'https://www.youtube.com/@DesignSpo'
      channelName: 'DesignSpo'
      channelUrl: 'https://www.youtube.com/@DesignSpo'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=kK1TOpI948o'
    - title: 'The ULTIMATE Guide To Typography For Beginners'
      creator: 'DesignSpo'
      creatorType: 'Organization'
      creatorUrl: 'https://www.youtube.com/@DesignSpo'
      channelName: 'DesignSpo'
      channelUrl: 'https://www.youtube.com/@DesignSpo'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=AXpxZMRM1EY'
    - title: 'The ULTIMATE Color Theory Guide For Beginners'
      creator: 'DesignSpo'
      creatorType: 'Organization'
      creatorUrl: 'https://www.youtube.com/@DesignSpo'
      channelName: 'DesignSpo'
      channelUrl: 'https://www.youtube.com/@DesignSpo'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=tKCORDK0IZU'
    - title: 'The Golden Rule Of Web Design'
      creator: 'DesignSpo'
      creatorType: 'Organization'
      creatorUrl: 'https://www.youtube.com/@DesignSpo'
      channelName: 'DesignSpo'
      channelUrl: 'https://www.youtube.com/@DesignSpo'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=CASPWJUsHPM'
    - title: 'A 4-step framework for building delightful products'
      creator: 'Nesrine Changuel'
      creatorType: 'Person'
      channelName: "Lenny's Podcast"
      channelUrl: 'https://www.youtube.com/@LennysPodcast'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=tX6nwT1Bsuo'
path: apps/web/src/content/blogs/agent-skills/ui-ux-quality-review.md
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

This is a combo skill distilled from Kole Jain, DesignSpo, and Nesrine Changuel source layers.

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

The review is sequential. Each step lists the **principle** (human view) followed by **agent checks** (the same principle as runnable rules). Findings should be produced as you go, in the order below.

### 1. Flow & states

**Principle.** Check whether the user can complete the job before fixing pixels. Every non-happy path needs a defined behavior — skip, search, recover, empty, loading, error. Sketch flows on paper before designing screens; users feel missing edges instantly.

> _"These are things you will miss if you don't plan out your flow, but users, they'll feel it instantly."_ — Kole Jain

**Agent checks**

- Every onboarding/setup screen has: skip path, "other" or search escape, no-result fallback, error recovery.
- Every interactive element has at least one of `:hover`, `:focus`, `:active`, `:disabled`, loading, success, error states defined in styles.
- Every async action ≥ 200ms has a loading indicator (spinner, skeleton, or progress bar — pick one pattern per surface).
- Every state-change action (save, submit, delete) has a system-wide visible feedback. Example: save → fill the icon AND drop a badge dot on the related tab so the user sees the system-level consequence.
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
- Flag designs that lead with #5–#6 (color/size) and skip #1–#4. Beginners reach for color and size and miss higher-ranked levers.
- **Composition matches scan path**: F-pattern for text-heavy pages; Z-pattern for minimalist hero or poster; top-to-bottom for cards and lists.
- **Cohesion rule**: same-type components share every value — image size, font, weight, line height, border, radius, padding. Change one, change them all.
- Stock human/face imagery is allowed only when the person is performing the task the product solves. Reject decorative stock people stealing the headline.
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
- **Mobile padding ≥ 1.25× equivalent desktop padding**. Mobile needs more, not less.
- **Touch targets ≥ 44px (iOS HIG) or 48dp (Android Material)**. Flag any tap target smaller than 44px on mobile.
- Whitespace must exist at all three levels simultaneously: line-height (within text), element padding/margin (between elements), section gaps (between groupings). One level breathing alone is not enough.
- Container widths are derived, not chosen: `max-width = (column × count) + (gutter × (count − 1))`.
- Off-grid placement is allowed as a deliberate hierarchy lever (#10) but flag if it looks accidental.
- Cite primitive ID `spacing-and-layout-system` on findings.

### 4. Typography

**Principle.** One hierarchy with four roles: headings, paragraphs, buttons, labels. Don't trust browser defaults. Set line-height and letter-spacing per role and per size.

**Agent checks**

- One primary font in product UI. Pair with display only on marketing surfaces.
- **Type scale (closed set)**: 16, 20, 24, 28, 32, 40, 48, 64.
- **Headings**: 2–3 levels max (not all 6). Set the largest heading first, then derive smaller / thinner / more-spaced for H2/H3.
- **Line-height inversely proportional to size**: ~1.0× for big headlines, ~1.5× for body. Override the browser default 125% — calibrated to be okay everywhere and great nowhere.
- **Letter-spacing inversely proportional to size**: tighten display sizes (48+) by ~−1% (-0.01em); body sizes default; small text loosens; bold buttons need extra tracking so letters do not squish.
- Use **rem on the web** so user zoom does not break layout. 1rem = 16px default.
- **Body text contrast ≥ 4.5:1 (WebAIM AA)**. Aim for 7:1 for primary content.
- **Typeface category matches voice**: serif = traditional/editorial; sans-serif = modern/neutral; display = personality (headlines only, never body); script = elegant (rarely); mono = technical.
- Headings as labels, not headlines, in tables and dense data: small, bold, uppercase, softer color. Header doesn't steal attention from the data.
- Cite primitive ID `typography-system-review` on findings.

### 5. Color & contrast

**Principle.** Reason in HSB, ship in hex. Pick by hue/saturation/brightness; don't type raw hex when picking. Use color for meaning. Maintain 60/30/10 proportions.

**Agent checks**

- **Pick the model for the medium**: RGB/A for digital, CMYK for print, **HSB for selection**. Never type a raw hex when picking.
- **60/30/10 proportion rule**: 60% dominant (sets tone), 30% secondary (supports), 10% accent (CTAs and focal points only).
- **Body text contrast ≥ 4.5:1 (WebAIM)**. Run https://webaim.org/resources/contrastchecker/ on key pairings, including text over Inkprint texture overlays — `tx-bloom`, `tx-grain` can degrade real contrast even when underlying tokens pass.
- **Complementary palettes never split 50/50** — they clash. Use majority + small accent, or step down to split-complementary.
- **Dark-mode accents drop ~10–15% saturation vs. light mode**. Screens are additive emitters; saturated colors fatigue against dark backgrounds.
- **Warm advances, cool recedes**. Use warm hues for focal points and danger; cool hues as ground state.
- **"Lighter" colored text uses hue rotation, not lightness.** For subtitles or muted text on a colored background: sample the background color, drag picker toward the top-left in HSB (lighter, less saturated, same hue). Do not use `text-gray-400` on a colored background.
- **Greys are not pure grey.** Saturate cool (blue) for cool-temperature brands, warm (yellow/brown) for warm-temperature brands. Bump saturation at the lightest and darkest extremes so temperature stays consistent.
- Reject pop-psychology color shortcuts ("blue = trust"). Color reads through context, connotation, relationship, and culture.
- Each semantic role (success, warning, danger, focus, selection, category) maps to ≤ 1 color per surface. Flag ambiguous overload.
- Cite primitive ID `color-and-contrast-review` on findings.

### 6. Component consistency (cohesion)

**Principle.** Same-type components share every value. Change one, change them all. Cohesion is the cheapest way to make a product feel designed instead of assembled.

**Agent checks**

- Same-type components have identical: image/icon size, font, weight, line-height, border, radius, padding, height.
- **Corner-radius standard**: pick one radius for the whole system (often 10px for small components like buttons/chips/search bars; 8–12px for inputs/cards). Mixing 4px / 12px / 24px on the same screen is a tell.
- Same-purpose buttons (back, cancel, skip) match in size, radius, and style. Different prompting text only.
- Variation between rows of the same kind is intentional, not accidental — flag drift.
- Use Figma's reusability primitives (or system equivalents): styles for colors, variables for measurements, components for UI elements.
- Cite primitive ID `component-consistency-review` on findings.

### 7. Visual noise (subtraction first)

**Principle.** Subtraction beats addition. Most fixes remove weight: gradients, decorative shadows, redundant arrows, cosmetic strokes. _"Less visual noise equals a better design."_

**Agent checks**

- **Gradients**: same color family only (darker green → lighter green, not blue → green). Default = no gradient.
- **Three-step shadow recipe** (in this order):
    1. Change shadow color to **light gray**, not pure black. Figma's default `0 4px 4px rgba(0,0,0,0.25)` is too harsh.
    2. **Increase blur ≥ 8px**.
    3. Or **remove the shadow** entirely.
- Shadow opacity ≤ 0.15 on most elements. If the shadow is the first thing noticed, it's too strong.
- Decorative arrows next to swipeable carousels = remove (gesture implies movement).
- Borders that aren't doing real work = remove or dim heavily. Borders are an amateur hierarchy tool — use spacing, color shifts, and typography first.
- Reject "AI gradients" — `bg-gradient-to-r from-blue-500 to-purple-500` distant-hue blends. Rotate hue across a single hue family or remove.

### 8. Icons & affordances

**Principle.** One icon library per region. Match line height. Label ambiguous icons.

**Agent checks**

- One library per region — no Heroicons + Lucide + Phosphor mixed on the same screen.
- Icons next to text match the text's line-height around them.
- Solid icons softened in color so perceived weight matches the label (solid icons cover more surface area than text).
- **Universal icons** (house, bookmark, user, search) — no label needed.
- **Ambiguous icons** — tooltip required, or pair with a text label.
- Mixed icon styles okay only when visually separate (different region, different purpose).
- Replace browser-default form controls — radios, checkboxes, select chevrons. The Safari default `<select>` chevron is the modern equivalent of `<font face="Times New Roman">`.

### 9. Feedback & states

**Principle.** Every user action needs a visible response. Feedback closes the action-result loop. No feedback = "did that work?" = re-tapping = bug reports.

**Agent checks**

- Every interactive element has hover / focus / active / disabled states defined.
- Click → at least a fraction-of-a-second visual change (grayed-out, depressed, color shift) tells the user "the next screen is coming."
- Async actions ≥ 200ms = loading spinner or skeleton.
- State-change actions propagate system-wide: save → fill the icon AND add a badge dot to the related tab.
- **No layout shift on hover/selected**: don't change size, weight, or case — they cause shift. Acceptable: text color, background color, shadow appearance, slight raise/lower transform.
- Cite primitive ID `feedback-and-affordance-review` on findings.

### 10. Charts & data clarity

**Principle.** Function over Dribbble aesthetic. Show the axis. One bar per data point. Boring readable beats pretty unreadable.

**Agent checks**

- Vertical axis labels visible. Reject "no axis."
- Bar tops flat, not rounded, when reading the value matters.
- One bar per data point. Reject 16 bars for 7 days of the week (decorative padding).
- No portfolio-style decorative gradients on data series.
- Headings as labels, not headlines, in dense data tables: small, bold, uppercase, softer color.
- Y-axis starts at zero unless explicitly truncating with a clear visual marker; otherwise the chart misleads.
- Color coding has a legend, and the legend is reachable in the first scan, not buried.

### 11. Responsive fit

**Principle.** Verify text, controls, repeated items, and charts fit on mobile and desktop without overlap or clipping.

**Agent checks**

- Capture screens at **mobile (375px), tablet (768px), desktop (1280px)** plus any design-specified breakpoint.
- Text wraps; doesn't overflow or clip.
- Touch targets ≥ 44px on mobile (cross-reference §3).
- Repeated lists/cards stack vertically on mobile, grid on desktop.
- Charts re-flow or scroll horizontally on mobile (don't squash to unreadable).
- Mobile padding > desktop padding (cross-reference §3).
- No horizontal scroll on mobile unless explicitly intended (e.g., card carousel).
- Cite primitive ID `responsive-fit-review` on findings.

### 12. Delight & anti-delight (optional final pass)

**Principle.** Run only after foundational review. Delight does not rescue broken flow. Use the three pillars: remove friction at valley moments, anticipate needs, exceed expectations after needs are anticipated.

**Agent checks — three-pillar audit**

Walk the user journey. For each surface, ask which pillar it serves — or whether it serves none.

- **Pillar 1 — Remove friction.** Identify _valley moments_: errors, cancellation, refunds, account deletion, lost work, support requests. Anti-delight defaults: hostile cancel flows, multi-step refund forms, generic error pages.
- **Pillar 2 — Anticipate needs.** A surface only honors needs if the user has to ask. To anticipate, the product surfaces something the user did not request but recognizes as theirs the moment they see it.
- **Pillar 3 — Exceed expectations.** Once a need is anticipated, deliver more than asked.

**Agent checks — delight grid placement**

Place each delight-flagged feature on this grid:

| Type            | Solves Functional? | Solves Emotional? | Verdict                                                                                                    |
| --------------- | ------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Low Delight     | Yes                | No                | Default. Most of the product. Fine.                                                                        |
| Surface Delight | No                 | Yes               | Confetti, animations, celebrations. Allow only when the underlying moment has weight. Cap at ~10% of work. |
| Deep Delight    | Yes                | Yes               | The goal. The feature works AND honors the emotion.                                                        |

**Agent checks — roadmap balance (50/40/10)**

The body of work should be ~50% pure functionality, ~40% deep delight, ~10% surface delight. If a review keeps surfacing surface-only "delighters," something upstream is broken.

**Agent checks — pre-ship checklist (every box must be checked)**

- **User impact**: does it move a user metric we believe in?
- **Business impact**: tied to a business goal, not a vibe?
- **Feasibility**: can we ship and maintain it?
- **Familiarity**: enough of what users already know? Pure novelty fails.
- **Inclusion**: what's joyful for one user is painful for another. Audit edge cases hard.
- **Maintainability of surprise**: surprise decays — first-use wow, fifth-use wallpaper. Without a continuous-iteration plan, the feature becomes invisible.

**Agent checks — anti-delight rejections**

Reject any delighter that fails these:

- **Default-on celebrations** in unknown contexts. An OS-level animation that fires during a therapy session is not delightful. Ship celebration toggleable, not default-on.
- **Pseudo-personal pushes** (missed call from "Mom") for users whose context is unknown. Trust-destroyer for the minority who get hurt; one bad press cycle erases the gain for everyone else.
- **Streak-loss / shaming gamification** in productivity, ADHD, burnout, mental-health adjacent surfaces. Use Airbnb Superhost as the model (status that recognizes effort), not Duolingo streaks (status that punishes drop-off).
- **Surface delight without the moment**. Confetti is fine when the moment has real weight. Confetti for completing a generic task is noise.
- **"Delight" as feature-gating excuse**. If a leader can shut down delight work because the product is fundamentally broken, the leader is right. Functional reliability comes first.

**Demotivator inversion** (when delight feels off and the agent cannot articulate why):

Do not ask "what would feel joyful here?" Ask "what would frustrate, embarrass, or exhaust the user here?" Frustrations are easier to articulate than aspirations. Invert the demotivator and you have the emotional design brief.

Cite primitive ID `delight-and-anti-delight-audit` on findings.

## AI-Generated UI Smoke Test

Reviewing AI-generated UI from v0 / Lovable / Cursor / Bolt is now the most common modern use of this skill. Detect these fingerprints first, then run the full review:

| AI-slop pattern                                                  | Why it reads as slop                                              | Corrective move                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `rounded-2xl` + `shadow-md` + `border` stacked on every card     | Triple belt-and-suspenders; no sense of when to use what          | Pick one. Two-part shadow OR border OR background-tint — not all three.        |
| `text-gray-400` / `text-slate-500` on every muted element        | Pure grey on colored backgrounds reads dull; no brand temperature | Replace with a lighter S/B variant of the brand hue.                           |
| `shadow-md` everywhere, no elevation distinction                 | Flat shadow; nothing reads as elevated vs. nested                 | Define an elevation ladder. Match shadow tier to elevation.                    |
| `bg-gradient-to-r from-blue-500 to-purple-500`                   | The "AI gradient" — distant hues blended; no taste signal         | Rotate hue across a single family (blue → cyan), or remove.                    |
| Inter, Inter, Inter                                              | Single biggest fingerprint of AI-generated UI in 2025–2026        | Swap to Satoshi / Metropolis / Figtree, or pair Inter with a display headline. |
| Default `p-4` / `gap-4` / `space-y-4` everywhere                 | Tight Tailwind defaults; no inverse-whitespace pass               | Double the spacing values. Menu items ≥ 2× text height. Sections ≥ 24–32px.    |
| Outline buttons everywhere                                       | Ghost buttons feel weightless                                     | Replace with soft-solid based on text color at low alpha.                      |
| Borders separating every form field, table row, and card section | Borders as the only hierarchy lever                               | Replace with zebra striping, off-white background blocks, or spacing alone.    |

For deeper AI-slop coverage and corrective tokens, hand off to the sister skill `visual-craft-fundamentals`.

## Output Schema

Every finding follows this canonical shape:

```txt
Domain: [flow | hierarchy | spacing | typography | color | consistency | noise | icons | feedback | charts | responsive | delight]
Finding: [named principle violated, e.g., "Closed-scale spacing violated"]
Evidence: [specific component, class string, region, or coordinate]
Severity: [high | medium | low]
Fix: [concrete tokens or named technique]
Source claim: [lineage primitive ID, e.g., primitive.spacing-and-layout-system]
Delegated: [optional sibling skill if the fix is out of scope]
```

A finding without **Evidence** is not a finding. A finding without **Severity** is not actionable. Both fields are required.

### Severity rubric

- **high** — blocks task completion, breaks accessibility floor (body text contrast &lt; 4.5:1), or creates inclusion risk (anti-delight).
- **medium** — degrades polish or readability significantly; consistency drift across same-type components; off-scale spacing values.
- **low** — stylistic preference, minor decorative noise.

### Stop conditions

The review is complete when:

- At least one finding exists per applicable category (or the category is explicitly marked "no issues").
- Top 3 high-severity fixes are ranked by impact.
- All findings carry evidence and severity.
- Out-of-scope concerns are tagged `Delegated:` to a sibling skill rather than dropped.

## Stack With (Workflow)

`stackWith` is not just metadata. The full workflow chains four sibling skills:

1. **`ui-ux-quality-review`** (this skill) — foundational pass. Catches the obviously broken: missing states, cramped spacing, tiny touch targets, inconsistent components, mystery icons, no feedback on click.
2. **`accessibility-and-inclusive-ui-review`** — when WCAG 2.2 AA, semantics, keyboard navigation, focus order, or screen-reader behavior matter. This skill emits accessibility-adjacent findings (contrast, touch targets, label requirements); accessibility-and-inclusive-ui-review goes deeper.
3. **`visual-craft-fundamentals`** — level-up pass once the foundational review clears. Two-part shadows, hue rotation, single-hue palettes, up-pop/down-pop, named text-on-image methods. The corrective lens for AI-generated UI.
4. **`marketing-site-design-review`** — section-by-section landing-page review (different rubric for hero, social proof, pricing).
5. **`delightful-product-review`** — full delight pass when foundational + craft passes are complete. The §12 delight check here is a triage; the delightful-product-review skill is the dedicated rubric.

**Handoff outputs.** Findings tagged `Delegated: <sibling-skill>` route to the appropriate sibling. Each sibling consumes the canonical schema directly without re-reviewing foundational categories. This keeps reviews additive, not redundant.

**Default order**: 1 → 2 → 3 → 4 → 5. Skip 2 if accessibility is out of scope. Skip 4 unless the surface is a marketing page. Skip 5 unless the foundational + craft passes are clean.

## Guardrails

- Do not recommend decorative gradients, extra cards, or ornamental effects as the first fix. Subtraction beats addition.
- Do not prioritize visual novelty over task clarity.
- Do not remove labels from unfamiliar icon-only controls without adding tooltips.
- Do not make every element the same visual weight. Primacy is scarce.
- Do not assume desktop spacing works on mobile. Mobile needs more whitespace, not less.
- Do not allow off-scale spacing or font-size values. The closed scale is the system.
- Do not trust default line-height for all type roles. Override 125% per role.
- Do not split complementary color palettes 50/50.
- Do not pick color by typing arbitrary hex values. Pick in HSB; ship the hex.
- Do not stack contrast levers to make everything important.
- Do not return findings without evidence (specific component / class / region / coordinate).
- Do not assign severity without referencing the rubric.

## Sources

### Source attribution

This skill is distilled from seven source layers across three creators:

- **Kole Jain** — [7 UI/UX mistakes that scream you're a beginner](https://www.youtube.com/watch?v=AH_ugxmLeUM). Beginner-tell taxonomy, flow-before-polish posture, missing states, three-step shadow recipe, 10px corner-radius standard, save→badge-dot pattern, "less visual noise = better design."
- **Kole Jain** — [Every UI/UX Concept Explained in Under 10 Minutes](https://www.youtube.com/watch?v=EcbgbKtOELY). Broad concept coverage for affordances, feedback, data presentation, interaction review.
- **DesignSpo** — [The Complete Guide To Visual Hierarchy](https://www.youtube.com/watch?v=kK1TOpI948o). Rank-before-style, 10-lever contrast rank, cohesion rule, F vs. Z vs. top-to-bottom composition.
- **DesignSpo** — [The ULTIMATE Guide To Typography For Beginners](https://www.youtube.com/watch?v=AXpxZMRM1EY). Type roles, line-height rules, letter-spacing rules, typeface category matching, rem usage.
- **DesignSpo** — [The ULTIMATE Color Theory Guide For Beginners](https://www.youtube.com/watch?v=tKCORDK0IZU). HSB reasoning, 60/30/10 proportions, warm/cool behavior, dark-mode saturation.
- **DesignSpo** — [The Golden Rule Of Web Design](https://www.youtube.com/watch?v=CASPWJUsHPM). 4-pixel mathematical system, closed spacing scale, type scale, container math.
- **Nesrine Changuel** on [Lenny's Podcast](https://www.youtube.com/@LennysPodcast) — [A 4-step framework for building delightful products](https://www.youtube.com/watch?v=tX6nwT1Bsuo). Three pillars, delight grid, 50/40/10 roadmap, anti-delight checks, demotivator inversion, habituation risk.

### Deep-read source analyses

Each source video above is also published as a standalone deep-read post in the [`source-analyses`](/blogs/source-analyses) category. Use these when you want the operating logic behind a check, not just the rule:

- [Visual Hierarchy: Lessons from DesignSpo](/blogs/source-analyses/designspo-visual-hierarchy) — rank-before-style, 10-lever contrast rank, cohesion rule, F vs. Z vs. top-to-bottom composition.
- [Typography Fundamentals: Lessons from DesignSpo](/blogs/source-analyses/designspo-typography) — type roles, line-height proportions, letter-spacing rules, typeface category matching, rem usage.
- [Color Theory: Lessons from DesignSpo](/blogs/source-analyses/designspo-color-theory) — HSB selection, 60/30/10 proportions, complementary clash, dark-mode saturation.
- [The 4-Pixel Rule: Lessons from DesignSpo's Golden Rule of Web Design](/blogs/source-analyses/designspo-golden-rule-web-design) — closed spacing scale, type scale, container math.
- [7 UI/UX Mistakes That Scream Beginner: Lessons from Kole Jain](/blogs/source-analyses/kole-jain-7-ui-ux-mistakes-beginner) — three-step shadow recipe, 10px radius standard, save→badge-dot pattern, beginner-tell taxonomy.
- [Building Delightful Products: Nesrine Changuel's 4-Step Framework](/blogs/source-analyses/nesrine-changuel-delightful-products-framework) — three pillars, delight grid, 50/40/10 roadmap, anti-delight checks, demotivator inversion, habituation risk.

### External tools referenced in the agent checks

- **WebAIM contrast checker** — verify body text and CTA pairings against the 4.5:1 floor. https://webaim.org/resources/contrastchecker/
- **iOS Human Interface Guidelines — touch targets** — 44pt minimum on iOS. https://developer.apple.com/design/human-interface-guidelines/accessibility#tap-targets
- **Material Design accessibility basics** — 48dp touch-target floor on Android. https://m3.material.io/foundations/accessible-design/accessibility-basics
