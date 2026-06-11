---
name: Accessibility and Inclusive UI Review
description: >-
    Child skill under Build Quality UI/UX for accessibility and inclusive component behavior: semantics, keyboard support, focus, ARIA restraint, reduced motion, dynamic regions, charts, and forms. Use when the user asks for an accessibility audit, WCAG check, screen-reader or keyboard review, focus/tab-order debugging, or an inclusive-design pass on a screen or component. Returns WCAG-cited findings with evidence, blocker-to-minor severity, and code-level fixes, split into a screen-level pass and a component-pattern pass.
parent_id: build_quality_ui_ux
depth: 1
preserve_markdown: true
legacy_paths:
    - product-and-design.accessibility-and-inclusive-ui-review.skill
    - docs/research/youtube-library/skill-drafts/accessibility-and-inclusive-ui-review/SKILL.md
reference_modules:
    - id: accessibility_inclusive_ui_review.screen_audit_checklist
      name: Per-Screen Audit Checklist
      summary: WCAG-cited checklist walked top-to-bottom on a screen — foundation (lang, title, headings, landmarks, skip link), ARIA restraint, keyboard model, focus management, the hiding-techniques matrix, screen-reader naming and live regions, contrast/motion thresholds, and form labeling/error rules.
      when_to_load:
          - When auditing a full screen, route, or page, before producing any screen-level findings.
          - When the concern is keyboard reachability, focus, headings/landmarks, hidden content, contrast, reduced motion, forms, or screen-reader naming.
      path: references/screen-audit-checklist.md
    - id: accessibility_inclusive_ui_review.component_patterns
      name: Per-Component Pattern Catalog
      summary: Canonical accessible patterns for 13 primitives — button, toggle, disclosure/accordion, dialog, tabs, menu, tooltip/toggletip, live regions, tables, checkbox/radio/switch, combobox, card, carousel — with required roles, states, and keyboard models.
      when_to_load:
          - When the surface contains interactive primitives (dialog, tabs, menu, table, combobox, card, carousel, custom inputs), before judging any of them.
          - When reviewing or building a design-system primitive in isolation.
      path: references/component-patterns.md
    - id: accessibility_inclusive_ui_review.failure_modes_spa_pitfalls
      name: Failure-Mode Catalog & SPA Pitfalls
      summary: Sixteen named anti-patterns with fixes (div-as-button, whole-card link, placeholder-as-label, class-based state styling, outline:none) plus the top 10 SPA/dynamic pitfalls — route-change focus, streaming announcements, toasts, $effect mutations, AI-generated UI.
      when_to_load:
          - When diagnosing a specific reported accessibility bug and you need to name the anti-pattern and its fix.
          - When the review involves SPA route changes, modals, streaming or async content, toasts, live regions, drag-and-drop, voice UI, or AI-generated UI.
      path: references/failure-modes-and-spa-pitfalls.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/accessibility_inclusive_ui_review/SKILL.md
---

# Accessibility and Inclusive UI Review

Accessibility-floor child. The discipline this skill enforces is **two passes, semantic HTML first**: a per-screen audit (does this screen ship broken?) and a per-component pattern audit (does each primitive match its canonical accessible pattern?). ARIA is a last resort — if you're reaching for `role="button"`, use a `<button>`. The leverage point is the design system: a primitive fixed once is fixed everywhere.

The deep rules live in reference modules. The skill body holds the sequence, the output contract, and the escalation map; load the references before producing findings.

## When to Use

- Auditing a screen, route, form, dialog, menu, tabs, table, chart, or custom control for accessibility before ship.
- The user mentions WCAG, screen readers, keyboard navigation, focus, tab order, ARIA, color contrast, reduced motion, or inclusive design.
- Diagnosing a reported accessibility issue (for example "tab order is broken on the project page").
- Reviewing a design-system primitive (Button, Input, Dialog, Tabs, Toggle) before it propagates.
- Auditing AI-generated UI fragments or dynamic screens (streaming content, toasts, live updates) for accessibility regressions.

## Workflow

1. Preflight. Confirm the scope in one sentence: full screen/route, single component, or a specific reported bug. Capture the markup or component code, both light and dark modes, and the list of interactive primitives present.
2. For a reported bug, load `accessibility_inclusive_ui_review.failure_modes_spa_pitfalls` first and try to name the anti-pattern; then widen to the relevant checklist section.
3. For a screen or route, load `accessibility_inclusive_ui_review.screen_audit_checklist` and walk it top-to-bottom: foundation, semantics & ARIA, keyboard, focus management, hiding techniques, screen reader, visual & motion, forms. Cite the WCAG criterion on every finding.
4. For every interactive primitive on the surface, load `accessibility_inclusive_ui_review.component_patterns` and verify the canonical pattern. Report these separately — primitive-level fixes propagate and outrank one-off page fixes.
5. If the surface is an SPA view with dynamic behavior (route changes, modals, streaming, toasts, `$effect`-driven updates) or AI-generated UI, also load `accessibility_inclusive_ui_review.failure_modes_spa_pitfalls` and run the SPA pitfalls list.
6. For a targeted question (for example "is this dialog accessible?"), load only the matching reference and run just those checks — but still flag any blocker you notice in passing.
7. Tag out-of-scope findings for escalation instead of dropping them: general visual hierarchy, spacing, or state polish → `ui_ux_quality_review`; typography/color craft beyond the contrast floor → `visual_craft_fundamentals`; navigation structure or labeling confusion → `information_architecture_review`; landing-page persuasion → `marketing_site_design_review`; delight ideas once the floor is met → `delightful_product_review`.
8. Assemble the report using the Output contract: screen-level findings, then component-pattern findings, then the roll-up.

## Output

Every finding follows this canonical shape:

```
Category: <foundation | semantics-aria | keyboard | focus | hiding | screen-reader | visual-motion | forms | component-pattern | spa-dynamic>
Finding: <named rule or anti-pattern, e.g. "Whole-card link">
WCAG: <criterion number + name, e.g. 4.1.2 Name, Role, Value — or "best practice" if no criterion applies>
Evidence: <specific element, selector, component, code line, or observed behavior>
Severity: <blocker | serious | moderate | minor>
Fix: <code-level fix naming the canonical pattern or technique>
Delegated: <optional sibling skill id if the fix is out of this skill's scope>
```

Severity rubric:

- **blocker** — AT users cannot complete a core flow: no keyboard reachability, no accessible name on a primary action, modal focus broken, route-change silent for screen readers.
- **serious** — the flow is technically completable but degraded: missing live region for async updates, contrast below 4.5:1, missing error association.
- **moderate** — inconvenience, not a blocker: suboptimal heading order, redundant ARIA, mouse-only nice-to-have.
- **minor** — polish: focus indicator slightly off-brand, decorative SVG missing `focusable="false"`.

End with a roll-up: top 5 highest-impact fixes ranked by leverage (primitive-level fixes outrank one-off page fixes); primitives needing design-system-level fixes; severity distribution; and "items requiring human review" for judgment calls (for example "does this need to be a dialog at all?").

Stop conditions before returning: every applicable category has at least one finding or an explicit "no issues"; screen-level and component-level passes are documented separately; every finding carries WCAG, Evidence, and Severity; judgment calls are surfaced, not asserted pass/fail; out-of-scope concerns are tagged Delegated, not dropped.

## Guardrails

- A finding without evidence is not a finding — tie it to a specific element, selector, component, or observed behavior, or leave it out.
- Do not produce findings without loading the matching reference module first.
- Do not add ARIA to fix what semantic HTML already provides — if you're reaching for `role="button"`, use a `<button>`.
- Do not remove visible focus indicators — no `outline: none` without a replacement at least as visible.
- Do not roll your own modal — use native `<dialog>`, Radix, Headless UI, or Scott O'Hara's pattern.
- Do not use positive `tabindex` values — only `0` or `-1`; positive values shatter the natural tab order.
- Do not use `aria-hidden="true"` on focusable content, and do not use color alone to communicate state.
- Do not assume mouse-only interaction — every drag, hover, and click needs a keyboard equivalent.
- Do not declare a screen "accessible" — accessibility is a gradient; report "more inclusive / less inclusive" and rank fixes by leverage.

## Notes

- Reference modules: `accessibility_inclusive_ui_review.screen_audit_checklist` (per-screen pass), `accessibility_inclusive_ui_review.component_patterns` (per-component pass), `accessibility_inclusive_ui_review.failure_modes_spa_pitfalls` (named anti-patterns + SPA/dynamic pitfalls).
- Primary sources: Heydon Pickering (Inclusive Components — the per-component canon), Sara Soueidan (Applied Accessibility — the per-screen audit and hiding-techniques taxonomy), WCAG 2.2 / WAI-ARIA.
- Maintainers: the canonical research draft with full lineage lives at `docs/research/youtube-library/skill-drafts/accessibility-and-inclusive-ui-review/` (not available at runtime).
