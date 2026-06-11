---
name: Visual Craft Fundamentals
description: >-
    Child skill under Build Quality UI/UX for the level-up polish pass: when the screen works but looks generic, flat, or AI-generated, this skill applies named craft techniques (two-part shadows, hue rotation, up-pop/down-pop, single-hue HSB palettes, double-your-whitespace, named font pairings, text-on-image methods). Returns evidence-backed findings with severity and before→after token fixes; also the deep corrective lens for v0/Lovable/Cursor/Bolt output after the AI smoke test.
parent_id: build_quality_ui_ux
depth: 1
preserve_markdown: true
legacy_paths:
    - product-and-design.visual-craft-fundamentals.skill
    - docs/research/youtube-library/skill-drafts/visual-craft-fundamentals/SKILL.md
reference_modules:
    - id: visual_craft_fundamentals.depth_color_surfaces
      name: Depth, Color & Surface Craft
      summary: Threshold-bearing rules for shadows and elevation (two-part recipe, xs–xl ladder, inset/outset taxonomy), color systems (HSB single-hue palettes, hue rotation, grey temperature, dark-mode saturation), buttons, form inputs, and icon weight.
      when_to_load:
          - When the finding target is shadows, elevation, color palette, gradients, greys, dark mode, buttons, inputs, or icon weight.
          - When auditing design-system tokens (shadow scale, color scale) against operator canon.
      path: references/depth-color-surfaces.md
    - id: visual_craft_fundamentals.type_spacing_emphasis
      name: Type, Spacing & Emphasis Craft
      summary: Threshold-bearing rules for typography (closed type scale, inverse letter-spacing and line-height, named font shortlist), the 4-pixel spacing system with whitespace numerics, the up-pop/down-pop emphasis framework, and hierarchy levers.
      when_to_load:
          - When the finding target is typography, font selection or pairing, spacing, whitespace, emphasis, or visual hierarchy.
          - When picking fonts for a new brand surface or marketing refresh.
      path: references/type-spacing-emphasis.md
    - id: visual_craft_fundamentals.ai_slop_corrections
      name: AI-Slop Deep Corrections & Text-on-Image Methods
      summary: Four additional AI-slop fingerprints beyond the ui_ux_quality_review smoke test, the deep corrective token recipes for all twelve patterns, and the numbered text-on-image methods (Methods 0–4, Scrim, floor blur).
      when_to_load:
          - When rewriting AI-generated UI (v0, Lovable, Cursor, Bolt) after the smoke test has fingerprinted it.
          - When placing text over photography — heroes, thumbnails, blog covers, OG images.
      path: references/ai-slop-corrections.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/visual_craft_fundamentals/SKILL.md
---

# Visual Craft Fundamentals

Level-up polish child. The discipline this skill enforces is **craft over decoration**: take a screen from "passes the beginner check" to "looks designed by someone who can see," using named, numerical techniques — never vibes-talk. Subtraction beats addition: almost every fix removes weight (fewer borders, softer shadows, hue rotation instead of opacity drop, off-white instead of border, single-hue palette instead of three accents).

This skill assumes the foundational pass is done. It is the level-up sibling of `ui_ux_quality_review` (which catches obviously broken; this ships obviously crafted) and the designated deep corrective lens for AI-generated UI after that skill's smoke test names the slop patterns.

## When to Use

- The screen works and passes the beginner-mistake bar but still feels generic, flat, or assembled rather than designed.
- The user asks for polish, taste, premium feel, visual craft, "make it look less like AI," spacing, type, color, shadows, or layout refinement.
- Rewriting v0 / Lovable / Cursor / Bolt output after `ui_ux_quality_review`'s smoke test fingerprinted it.
- Auditing Inkprint or other design-system tokens against operator canon (shadow ladder, color scale, type scale, spacing scale).
- Picking fonts for a new brand surface, or applying text-on-image overlays (hero photography, thumbnails, OG images).

## Workflow

1. Preflight. Confirm the foundational pass is complete — if the surface has flow, state, or task-completion problems, escalate to `ui_ux_quality_review` first and stop; craft polish on a broken flow is wasted work. Capture the surface (screenshots or component code), the tokens in play (Inkprint on BuildOS surfaces), and whether the UI is AI-generated. Run the **grayscale-first check** (Erik Kennedy, 7 Rules — "black and white first"): mentally strip the surface to B&W and confirm structure, spacing, and hierarchy hold _before_ judging any color. If it reads badly in grayscale, color cannot fix it — log a hierarchy/spacing finding (or escalate) first, and treat color as the LAST pass: one brand hue + grayscale neutrals + at most ONE accent, added only after structure is working.
2. The Mobbin test (pre-design imitation step — Erik Kennedy, 7 Rules — "steal like an artist"). Before proposing any net-new layout or pattern, pull **5+ real references** for that exact pattern (settings page, create flow, onboarding, empty state) from real-app sources — Mobbin (filterable by pattern) over Dribbble, and never AI output, which is the average of average. Copy the _moves_ (spacing, hierarchy, type pairing, color choices), never whole screens. If a proposed layout was not checked against 5+ vetted real references, flag it as unvetted rather than shipping it. (Skip for targeted single-domain fixes — see step 8.)
4. If the UI is AI-generated or the user says it "looks like AI," load `visual_craft_fundamentals.ai_slop_corrections` and run the deep correction pass: confirm the smoke-test fingerprints, scan for the four additional fingerprints, and write the corrective token recipe for each hit.
5. Establish hierarchy and emphasis before touching surfaces: load `visual_craft_fundamentals.type_spacing_emphasis` and review type roles, the 4-pixel spacing system, whitespace at all three levels, and up-pop/down-pop pairing on every emphasized element.
6. Then polish depth and color: load `visual_craft_fundamentals.depth_color_surfaces` and review the shadow ladder (two-part recipe), the four-cue button lighting recipe, brightness-as-elevation for low-shadow surfaces, single-hue palette discipline, grey temperature, buttons (incl. hover recolor), and form inputs. Depth and color polish only lands after structure, type, and spacing are working.
7. For text-on-image surfaces, load `visual_craft_fundamentals.ai_slop_corrections` and pick a numbered method (Scrim is the default for hero photography) — never freelance an overlay.
8. For a targeted question ("fix my shadows," "pick a font"), load only the reference covering that domain and run just those checks — but still flag any foundational issue you notice as Delegated. (Targeted single-domain fixes skip the step-2 Mobbin test.)
9. Tag out-of-scope findings for escalation instead of dropping them: missing states, broken flows, or beginner-bar issues → `ui_ux_quality_review`; any craft fix that would reduce body-text contrast below 4.5:1 or change element semantics (e.g. removing a border that carried focus indication) → `accessibility_inclusive_ui_review`; landing-page persuasion structure → `marketing_site_design_review`.
10. Assemble the findings report using the Output contract below, ordered by severity then perceived polish gain, ending with the top 5 highest-impact fixes and any token diffs that codify the fix so the same paste does not recur.

## Output

Every finding follows this canonical shape:

```
Domain: <shadows | color | typography | spacing | emphasis | hierarchy | images | icons | buttons-forms>
Finding: <named technique violated, e.g. "Two-part shadow not decomposed">
Evidence: <quoted class string, token value, or component snippet>
Severity: <high | medium | low>
Fix: <before → after token or value pair, e.g. `shadow-md` → ambient `0 1px 2px` + direct `0 4px 12px` light-gray>
Delegated: <optional sibling skill id if the fix is out of this skill's scope>
```

Severity rubric:

- **high** — the surface reads as unmistakably amateur or AI-generated (named slop fingerprint), or the craft issue degrades legibility (untested text-on-image, contrast loss).
- **medium** — a named technique is violated and the fix yields visible polish gain (single flat shadow, full up-pop everywhere, off-scale spacing, pure-grey muted text on color).
- **low** — refinement on an already-competent surface (letter-spacing tune, grey temperature, optical alignment).

Stop conditions before returning: every reviewed domain has at least one finding or an explicit "no issues"; the top 5 fixes are ranked by perceived polish gain; every finding carries Evidence and Severity; every Fix is expressed in concrete tokens or a named technique, not adjectives; out-of-scope concerns are tagged Delegated, not dropped.

## Guardrails

- A finding without evidence is not a finding — if it cannot be tied to a quoted class string, token, or component snippet, do not include it.
- Do not produce findings without loading the matching reference module first.
- Do not add gradients, glows, or extra cards as the first fix. Subtraction beats addition.
- Do not use lightness alone to make a colored element "lighter" — rotate the hue.
- Do not stack all up-pop properties on every emphasized element. Only the page title gets full up-pop.
- Do not use a single flat `box-shadow` to communicate elevation — decompose into ambient + direct.
- Do not let a single screen carry more than one icon library, more than two fonts (one display + one body), or more than one corner-radius scale.
- Do not allow off-scale spacing values (13px, 27px) — every value lives on the 4-pixel system.
- Do not ship a craft fix that drops body-text contrast below 4.5:1 or strips semantic affordances — tag it Delegated to `accessibility_inclusive_ui_review` instead.
- Keep every fix implementable in the existing design system (Inkprint tokens on BuildOS surfaces); do not invent parallel token scales.

## Notes

- Reference modules: `visual_craft_fundamentals.depth_color_surfaces` (shadows, color, buttons, forms), `visual_craft_fundamentals.type_spacing_emphasis` (type, spacing, up-pop/down-pop, hierarchy), `visual_craft_fundamentals.ai_slop_corrections` (deep AI-slop recipes, text-on-image methods).
- Sequence with siblings: run `ui_ux_quality_review` first for the beginner bar and the 8-pattern AI smoke test; this skill ships the crafted layer on top and owns the corrective token recipes.
- For marketing surfaces: `marketing_site_design_review` owns section-by-section conversion review, and `landing_page_scorecard_funnel` owns assessment/quiz funnel design — hand off structure-level findings there and keep only the craft-layer fixes here.
- Primary sources: Steve Schoger / Refactoring UI (two-part shadows, hue rotation, single-hue palettes), Adam Wathan / Refactoring UI (token-ownership build discipline, uppercase letter-spacing, equal-height card flex recipe, negative-margin border overlap), Erik D. Kennedy / Learn UI Design (light-from-the-sky, up-pop/down-pop, text-on-image methods, font shortlist), Kole Jain and DesignSpo (supporting numerics).
- Enrichment (2026-06-11): added five Erik Kennedy "7 Rules for Gorgeous UI" rules — grayscale-first preflight + Mobbin pre-design imitation test (workflow steps 1–2), four-cue button lighting recipe + brightness-as-elevation (depth-color-surfaces.md), and the hover recolor rule (depth-color-surfaces.md buttons/forms). Source: `docs/research/youtube-library/analyses/2026-04-29_erik-kennedy_7-rules-gorgeous-ui_analysis.md`.
- Enrichment (2026-06-11): added six Adam Wathan / RefactoringUI build rules — uppercase ⇒ `tracking-wide`, global type defaults (anti-alias + tight/normal leading), and the equal-height card flex recipe (type-spacing-emphasis.md); own-the-config / extend-the-scale-never-a-magic-number and the negative-margin border-overlap fix (depth-color-surfaces.md). Also marked the hover-recolor rule as converging on a second primary source (Wathan, with the live-tune-then-codify process). Source: `docs/research/youtube-library/analyses/2026-06-11_adam-wathan_building-refactoringui-with-tailwind_analysis.md`.
- Maintainers: the canonical research draft with full lineage lives at `docs/research/youtube-library/skill-drafts/visual-craft-fundamentals/` (not available at runtime).
