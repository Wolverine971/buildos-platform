---
name: Calm Software Design Review
description: >-
    Child skill under Build Quality UI/UX for calm, attention-respecting software. Audits screens, features, notifications, copy, and roadmaps for restraint instead of delight — flags engagement manufacturing (streaks, badges, urgency timers, re-engagement nags), notification fatigue, motion overload, surface clutter, and unopinionated defaults. Returns evidence-backed findings with severity, subtraction-first fixes, and a calm-vs-delight verdict.
parent_id: build_quality_ui_ux
depth: 1
preserve_markdown: true
legacy_paths:
    - product-and-design.calm-software-design-review.skill
    - docs/research/youtube-library/skill-drafts/calm-software-design-review/SKILL.md
reference_modules:
    - id: calm_software_design_review.surface_audit_checklist
      name: Calm-Surface Audit Checklist
      summary: Checkable rules for screens and features — motion budget, surface count, attention cost, opinionated defaults, engagement-manufacturing red flags, notification posture, empty/loading/error states, hierarchy, onboarding, microcopy tone — plus the door test and the disappearance test.
      when_to_load:
          - When reviewing any screen, feature, flow, notification channel, or copy surface — before producing surface findings.
          - When the user's concern is notification fatigue, streaks/gamification, motion overload, distraction, or anxious copy.
      path: references/surface-audit-checklist.md
    - id: calm_software_design_review.simplicity_rubric
      name: Simplicity Rubric & Calm-vs-Delight Verdict
      summary: The judgment layer — foundational calm-school principles, Maeda's 10 Laws of Simplicity as an operational rubric (SHE, SLIP, Three Keys), the quality-without-a-name diagnostics, and the calm-school vs delight-school comparison table.
      when_to_load:
          - When the surface checklist passes but the screen still feels off, or you need the subtract-the-obvious / sharpen-the-meaningful triage.
          - When rendering the calm-vs-delight verdict or deciding which school fits the product.
      path: references/simplicity-rubric.md
    - id: calm_software_design_review.operations_and_roadmap
      name: Calm Operations & Roadmap Audit
      summary: Org-side checks — main-quest/side-quest discipline, default-no roadmaps, internal-MVP rule, 7-day zero-bug fix window, no per-feature engagement goals, written-async operations, cycles + cooldowns, org red flags.
      when_to_load:
          - When reviewing a roadmap, feature list, team operating model, or per-feature metrics — before producing operations findings.
          - When triaging which features are main-quest, side-quest, or engagement manufacturing in disguise.
      path: references/operations-and-roadmap.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/calm_software_design_review/SKILL.md
---

# Calm Software Design Review

The discipline this skill enforces is **restraint instead of delight**: calm software disappears during use, holds the user's attention only when it serves their work, and never manufactures engagement. Motion, surface count, attention cost, opinionated defaults, and notification posture are the load-bearing variables; confetti, streaks, badges, urgency timers, and celebration UX are failure modes. The deep rules live in reference modules — the skill body holds the sequence, the output contract, and the escalation map. Load the references before producing findings.

## When to Use

- Auditing a productivity tool, knowledge tool, dev tool, dashboard, agent workspace, or any product whose users arrive already cognitively loaded.
- The user asks for restraint, calm, focus, fewer distractions, less notification fatigue, opinionated defaults, or quality in the Linear/Things/Basecamp sense.
- A screen feels "off" but isn't broken — it checks every UX box and still feels like it's pulling at you.
- Triaging a roadmap or feature list for main-quest vs side-quest vs engagement manufacturing in disguise.
- Pre-launch review of a feature that may have drifted toward delight when calm was the brief.
- Reviewing notification, email, or trial/billing messaging posture.

## Workflow

1. Preflight. Confirm what is under review (screen, feature, flow, notifications, copy, roadmap, or operating model) and the user's arrival state. If the audience arrives under-stimulated — entertainment, social, consumer B2C — this is the wrong school: escalate to `delightful_product_review` and stop.
2. For any screen, feature, flow, notification, or copy review, load `calm_software_design_review.surface_audit_checklist` and walk categories 1–10 in order: motion budget, surface count, attention cost, defaults, engagement manufacturing, notification posture, states, hierarchy, onboarding, microcopy tone. Engagement-manufacturing findings outrank everything else — any single red flag is sufficient to flag the surface for rework.
3. Close every surface with the checklist's door test and disappearance test. Subtraction moves come before additions in every fix.
4. If the checklist passes but the surface still feels off, or you need the subtract-vs-sharpen triage or the final verdict, load `calm_software_design_review.simplicity_rubric` and walk the Maeda Laws and the quality-without-a-name diagnostics.
5. For a roadmap, feature list, hiring plan, or team operating model, load `calm_software_design_review.operations_and_roadmap` and run the main-quest/side-quest question on every item plus the calm-operations checklist.
6. Tag out-of-scope findings for escalation instead of dropping them: hierarchy/spacing/type/color fundamentals → `ui_ux_quality_review` (this skill assumes those already pass); works-but-lacks-polish craft execution → `visual_craft_fundamentals`; over-organization, navigation structure, or labeling confusion → `information_architecture_review`; semantics, focus, keyboard, or screen-reader behavior → `accessibility_inclusive_ui_review`; genuine delight opportunities for under-stimulated moments → `delightful_product_review`.
7. Assemble the report using the Output contract below: findings ordered by severity then user impact, then the roll-up.

## Output

Every finding follows this canonical shape:

```
Category: <motion | surfaces | attention | defaults | engagement | notifications | states | hierarchy | onboarding | tone | operations>
Finding: <named rule violated, e.g. "Celebration animation on routine action">
Evidence: <specific screen, element, copy string, setting, email, or roadmap item>
Why it violates calm: <named principle or test — e.g. disappearance test, Maeda Law 7, main-quest discipline>
Severity: <high | medium | low>
Fix: <concrete change, subtraction moves first>
Delegated: <optional sibling skill id if the fix is out of this skill's scope>
```

Severity rubric:

- **high** — engagement manufacturing (streaks, urgency timers, faux-FOMO, re-engagement nags, login rewards), push/email on by default, punishing absence, or `prefers-reduced-motion` ignored.
- **medium** — motion or surface budget exceeded, configurability instead of opinion, demanding-not-inviting screens, anxious or mascot-voice copy, unrecoverable defaults.
- **low** — tone polish, a single decorative flourish, minor density or whitespace issues.

Roll-up (after the findings list): top 5 highest-leverage fixes ordered by impact; engagement-manufacturing red flags found (state "none found" explicitly if zero); calm-operations risks if the org was in scope; a Law-10 audit (what is obvious → subtract, what is meaningful → sharpen); and a calm-vs-delight verdict — does this product fit the calm school, and where is it leaking toward delight?

Stop conditions before returning: every applicable category has at least one finding or an explicit "no issues"; every finding carries Evidence and Severity; the door test and disappearance test were run on each surface; out-of-scope concerns are tagged Delegated, not dropped.

## Guardrails

- A finding without evidence is not a finding — if it cannot be tied to a specific screen, element, copy string, setting, or roadmap item, do not include it.
- Do not produce findings without loading the matching reference module first.
- Do not recommend animations to "fix" calm. If the surface feels flat, the issue is likely emotion via voice, color, or detail (Maeda Law 7), not motion.
- Do not add streaks, badges, or celebrations to "drive engagement" — manufactured engagement is leading-indicator churn in retention businesses.
- Do not assume more configurability is better. Opinionated defaults are the move; configurability is what teams ship when they couldn't decide.
- Do not push notifications by default, and do not manufacture urgency — no "limited time," no "only N left," no FOMO.
- Do not confuse calm with sterile. Calm is restraint paired with strong opinion, not minimalism applied to soul — color, voice, texture, and signature interactions belong.
- Do not strip features so aggressively the tool can't do real work. Calm ≠ feature-thin; if everything feels like a side quest, the discipline has lost its bias-to-ship.
- Do not apply this skill to entertainment or under-stimulation apps — use `delightful_product_review`. Wrong school = wrong product.

## Notes

- Reference modules: `calm_software_design_review.surface_audit_checklist` (surface categories 1–10 + door/disappearance tests), `calm_software_design_review.simplicity_rubric` (principles, Maeda Laws, verdict), `calm_software_design_review.operations_and_roadmap` (org-side checks).
- Primary sources: Karri Saarinen (Linear — craft, door test, main quest), Werner Jainek (Cultured Code/Things — disappearance, do-not-over-organize), Jason Fried & DHH (37signals — calm-company doctrine), John Maeda (Laws of Simplicity), Steph Ango (Obsidian — constraints, file-over-app).
- This skill is the on-brand counterweight to `delightful_product_review`; BuildOS surfaces default to the calm school.
- Enrichment (2026-06-11): added four Saarinen/Linear org-side checks to `operations-and-roadmap.md` — quality-as-aspiration red flag (no owner/plan/rationale), principles-over-process / rigid-checkpoint-queue red flag, makers-in-direct-user-contact as the compensating control that makes no-A/B safe, and the organic-mentions qualitative KPI. Source: `docs/research/youtube-library/analyses/2026-04-29_karri-saarinen-linear_craft-and-calm-software_analysis.md`.
- Maintainers: the canonical research draft with full lineage lives at `docs/research/youtube-library/skill-drafts/calm-software-design-review/` (not available at runtime).
