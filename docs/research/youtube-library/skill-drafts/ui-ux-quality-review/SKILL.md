---
name: ui-ux-quality-review
description: Review app screens, landing pages, and product UI for beginner mistakes, missing states, visual hierarchy, spacing, consistency, icons, feedback, charts, and mobile polish. Use when auditing or improving interface quality.
path: docs/research/youtube-library/skill-drafts/ui-ux-quality-review/SKILL.md
---

# UI UX Quality Review

Use this skill to help an agent review a UI for practical quality issues. The review should focus on flow, clarity, consistency, feedback, and communication before decorative polish.

## When to Use

- Review a product screen, landing page, dashboard, or mobile flow
- Diagnose why a UI feels amateur or cluttered
- Improve visual hierarchy, spacing, typography, color, icons, or interaction states
- Audit charts and data visualization
- Give design feedback to a developer or founder
- Turn a rough wireframe into a more polished screen

Do not use this skill for full brand strategy, visual identity exploration, or accessibility audits that require WCAG-specific testing. Use a dedicated accessibility process for that.

## Review Order

1. **Flow before pixels.** Check whether the user can complete the job, escape, skip, search, recover from errors, and handle empty or loading states.
2. **Hierarchy.** Identify the most important thing on screen. Make size, position, weight, color, imagery, and spacing agree with that priority.
3. **Spacing.** Look for cramped groups, inconsistent padding, and mobile layouts that need more breathing room.
4. **Consistency.** Reuse component patterns, radius, spacing, icon style, and button treatment for the same job.
5. **Visual noise.** Remove effects, strokes, arrows, gradients, shadows, and decorations that do not communicate.
6. **Icons and labels.** Use one icon family within a region. Add labels or tooltips for ambiguous icons.
7. **Feedback.** Check hover, active, focus, disabled, loading, success, error, warning, and saved states.
8. **Charts.** Prefer readable axes and honest data communication over portfolio aesthetics.
9. **Responsive fit.** Verify text, controls, and repeated items fit on mobile and desktop without overlap.

## Practical Heuristics

- Plan flows on paper before designing screens.
- Every onboarding or setup flow needs skip, other, no-result, and recovery paths where relevant.
- Mobile needs more whitespace than most beginners expect.
- Use one primary font unless the design system says otherwise.
- Use color for meaning: success, warning, danger, focus, trust, selection, or category.
- In dark mode, create depth with surface contrast, not harsh borders or black shadows.
- If the shadow is the first thing noticed, it is too strong.
- Icons should generally match the text line height around them.
- Every user action needs a visible response.
- Microinteractions should confirm an action, not decorate the page at random.

## Foundational Rules (Quantitative Guardrails)

These are concrete, checkable rules. Run them as a numerical pass after the qualitative review.

### Hierarchy

- **Rank before style.** Decide what is 1st, 2nd, 3rd in primacy _before_ picking sizes, fonts, or colors. Hierarchy is a ranking decision, not a styling decision.
- **One primary, a few secondary, the rest uniform.** If everything is loud, nothing stands out. Most of the screen must look the same.
- **Contrast lever order** (use levers earlier in the list before adding more): motion, task-relevant info, white space, faces, color, size, weight, imagery, extra elements, deliberate misalignment. Beginners reach for color/size and skip the higher-ranked levers.
- **Cohesion rule.** Same-type components share _every_ value: image size, font, weight, line height, border, radius, padding. Change one, change them all.
- **Composition pattern** matches scan path: Z-pattern for minimalist hero or poster, F-pattern for text-heavy pages, top-to-bottom for cards and lists.

### Typography

- **Line height is inversely proportional to font size.** Big headline ~1.0×, body ~1.5×. The browser default 125% is calibrated to be okay everywhere and great nowhere — override it.
- **Letter spacing is also inversely proportional.** Tighten headlines 1–2px; loosen small text. Bold buttons need extra letter spacing so letters do not squish.
- **Use rem, not px**, on the web so user zoom does not break layout. 1rem = 16px default.
- **One hierarchy with four roles**: headings (2–3 levels, not all 6), paragraphs, buttons, labels. Set the largest heading first, then derive smaller / thinner / more-spaced. New screens assemble like Lego — never invent new styles.
- **Match typeface category to brand voice.** Serif = traditional/editorial, sans-serif = modern/neutral, display = personality (headlines only, never body), script = elegant (rarely), mono = technical.
- **Body text contrast ≥ 4.5:1** (WebAIM). Aim for 7:1 for primary content where possible.

### Color

- **Pick the model for the medium.** RGB/A for digital, CMYK for print, **HSB for human-friendly selection.** Reason in HSB, ship in hex/RGB. Never type raw hex when picking.
- **60/30/10 proportion rule.** 60% dominant (sets tone), 30% secondary (supports), 10% accent (CTAs and focal points only).
- **Reject pop-psychology color rules** ("blue = trust"). Color reads through context, connotation, relationship, and culture — verify all five before committing.
- **Warm advances, cool recedes.** Use warm hues for focal points and danger; cool hues as ground state.
- **Complementary palettes never split 50/50** — they clash. Use majority + small accent, or step down to split-complementary for CTA pop without eye strain.
- **Dark-mode accents drop ~10–15% saturation** vs. light mode. Screens are additive emitters; saturated colors fatigue the eye against dark backgrounds.

### The 4-Pixel Rule (Mathematical System)

- **Every spacing, padding, gap, container width, and font size is a multiple of 4px.**
- **Spacing scale (closed set):** 4, 8, 12, 16, 24, 32, 48, 64, 96. No 13px, no 27px, no "looks about right."
- **Type scale (closed set):** 16, 20, 24, 28, 32, 40, 48, 64.
- **Spacing assigned by relatedness:**
    - 4px = inside a composite element (icon + label)
    - 8px = list-item internal gap
    - 16px = inside a component
    - 24px = between components
    - 32px = between page sections
- **Container width is derived, not chosen.** `max-width = (column × count) + (gutter × (count − 1))`. If the math feels arbitrary, the design is.

## Common Fixes

- Replace generic "Home" title tags or labels with task-specific text.
- Add a clear first action to empty states.
- Convert repeated ad hoc elements into one component style.
- Standardize button sizes, radius, and icon placement.
- Remove decorative arrows when gestures or layout already imply movement.
- Add focus and error states to inputs.
- Add a saved-state indicator somewhere outside the clicked control if the state matters globally.
- Add axes and labels to charts even if the chart becomes less trendy.

## Delight Layer (Optional Final Pass)

Run this layer after the foundational and section-level review. It does not invent delight; it audits whether any delight already in the design holds up, and whether obvious valley moments are rescued.

### The Three-Pillar Audit

Walk the user journey. For each surface, ask which pillar it serves — or whether it serves none.

- **Pillar 1: Remove friction.** Identify _valley moments_ — points where the user's emotional state is at its lowest (errors, cancellation, refunds, account deletion, lost work, support requests). Anti-delight defaults: hostile cancel flows, multi-step refund forms, generic error pages. _"Just making it easy to do something you expect to be really hard is delightful."_
- **Pillar 2: Anticipate needs.** A surface only honors needs if the user has to ask. To anticipate, the product surfaces something the user did not request but recognizes as theirs the moment they see it. Default: only honoring.
- **Pillar 3: Exceed expectations.** Once a need is anticipated, deliver more than asked. Default: deliver exactly what was asked, no surplus.

### Delight Grid Triage

Place each delight-flagged feature in the design on this grid:

| Type            | Solves Functional? | Solves Emotional? | Verdict                                                                                                    |
| --------------- | ------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Low Delight     | Yes                | No                | Default. Most of the product. Fine.                                                                        |
| Surface Delight | No                 | Yes               | Confetti, animations, celebrations. Allow only when the underlying moment has weight. Cap at ~10% of work. |
| Deep Delight    | Yes                | Yes               | The goal. Same feature does the job _and_ honors the emotion.                                              |

**Roadmap sanity check (50/40/10):** the body of work should be ~50% pure functionality, ~40% deep delight, ~10% surface delight. If a review keeps surfacing surface-only "delighters," something upstream is broken.

### Delight Checklist (Pre-Ship)

Before signing off on any delight-flagged feature, every box must be checked:

- **User impact:** does it move a user metric we believe in?
- **Business impact:** is it tied to a business goal, not a vibe?
- **Feasibility:** can we ship and maintain it?
- **Familiarity:** is there enough of what users already know? Pure novelty fails — Discover Weekly's "bug" was injecting familiar tracks; that's what users actually wanted.
- **Inclusion:** what's joyful for one user is painful for another. Audit edge cases hard: bereavement, mental health context, cultural sensitivity, accessibility. (See anti-delight checklist below.)
- **Maintainability of surprise:** is there a continuous-innovation plan? Surprise decays — first use wow, fifth use wallpaper. Without iteration, the feature becomes invisible.

### Anti-Delight Checks

Reject any delighter that fails these:

- **Default-on celebrations** in unknown contexts. An OS-level animation that fires during a therapy session is not delightful. Surfaces should ship celebration _toggleable_, not default-on.
- **Mother's Day–type pushes.** Anything that mimics a personal interaction (missed call from "Mom") for users whose context is unknown is a trust-destroyer for the minority who get hurt — and one bad press cycle erases the gain for everyone else.
- **Gamification that punishes lapses** (streak loss, shaming dashboards). High inclusion risk in productivity, ADHD, burnout, mental-health adjacent surfaces. Use Airbnb Superhost as the model (status that recognizes effort), not Duolingo streaks (status that punishes drop-off).
- **Surface delight without the moment.** Confetti is fine when the moment underneath has real weight (re-qualifying as Superhost). Confetti for completing a generic task is noise.
- **"Delight" as feature-gating excuse.** If a leader can shut down delight work because the product is fundamentally broken, the leader is right. Functional reliability comes first.

### Demotivator Inversion (When the Skill Has to Diagnose)

When the design clearly tries to delight but feels off and you cannot articulate why, ask the inverse question. Do not ask _"what would feel joyful here?"_ Ask _"what would frustrate, embarrass, or exhaust the user here?"_ Frustrations are easier to articulate than aspirations. Invert the demotivator and you have the emotional design brief.

### Output: Delight Findings

Append to the main review:

- Valley moments identified, with rescue assessment for each (covered / partial / missing).
- Delight grid placement of every delight-flagged feature.
- Delight checklist failures (which boxes are unchecked, per feature).
- Anti-delight risks (specific surfaces flagged + recommended mitigations).
- Habituation risk (which features will become wallpaper without an iteration plan).

## Output Format

Return findings grouped by:

- flow and missing states
- hierarchy and content clarity
- spacing and layout
- consistency and components
- visual noise
- icons and affordances
- interaction feedback
- charts and data display
- mobile and responsive risk

For each issue, give:

- what is wrong
- why it matters
- specific fix
- priority: high, medium, or low

## Guardrails

- Do not recommend decorative gradients, extra cards, or ornamental effects as the first fix.
- Do not prioritize visual novelty over task clarity.
- Do not remove labels from unfamiliar icon-only controls without adding tooltips.
- Do not make every element the same visual weight.
- Do not assume desktop spacing works on mobile.
- Do not allow off-scale spacing or font-size values (anything that is not a multiple of 4px).
- Do not trust the browser default 125% line-height — set explicit line-height per role.
- Do not split a complementary color palette 50/50.
- Do not pick color by typing hex values; pick in HSB and ship the hex.
- Do not "make everything important" by stacking contrast levers — primacy is scarce.

## Source Attribution

Distilled from:

- Kole Jain — [7 UI/UX mistakes that scream you're a beginner](https://www.youtube.com/watch?v=AH_ugxmLeUM), [Every UI/UX Concept Explained in Under 10 Minutes](https://www.youtube.com/watch?v=EcbgbKtOELY). Local notes in `docs/marketing/growth/research/youtube-transcripts/` and `youtube-design.md`.
- DesignSpo — [The Complete Guide To Visual Hierarchy](https://www.youtube.com/watch?v=kK1TOpI948o), [The ULTIMATE Guide To Typography For Beginners](https://www.youtube.com/watch?v=AXpxZMRM1EY), [The ULTIMATE Color Theory Guide For Beginners](https://www.youtube.com/watch?v=tKCORDK0IZU), [The Golden Rule Of Web Design](https://www.youtube.com/watch?v=CASPWJUsHPM). Analyses in `docs/research/youtube-library/analyses/` (`2026-04-29_designspo-visual-hierarchy_analysis.md`, `2026-04-29_designspo-typography_analysis.md`, `2026-04-29_designspo-color-theory_analysis.md`, `2026-04-29_designspo-golden-rule-web-design_analysis.md`).
- Nesrine Changuel — [A 4-step framework for building delightful products](https://www.youtube.com/watch?v=tX6nwT1Bsuo) on Lenny's Podcast. Analysis at `docs/marketing/growth/research/youtube-transcripts/2026-04-28-nesrine-changuel-4-step-delightful-products-framework-ANALYSIS.md`. Source for the Three Pillars, Delight Grid, Delight Checklist, 50/40/10 rule, anti-delight checks, and demotivator inversion.
