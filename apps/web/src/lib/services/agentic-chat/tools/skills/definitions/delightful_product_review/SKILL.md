---
name: Delightful Product Review
description: >-
    Child skill under Build Quality UI/UX for delight review — use when the user asks how to make a product
    delightful, add wow or magic moments, increase emotional pull, motivation, or memorability, gate a
    celebration/recap/animation before ship, or balance a roadmap between polish and features. Runs Nesrine
    Changuel's delight framework (motivators, delight grid, three pillars, pre-ship checklist, 50-40-10 rule)
    and returns evidence-backed findings with grid placement, pillar, severity, and named-pattern fixes.
skill_type: procedure # procedure | reference | strategy | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
parent_id: build_quality_ui_ux
depth: 1
preserve_markdown: true
legacy_paths:
    - product-and-design.delightful-product-review.skill
    - docs/research/youtube-library/skill-drafts/delightful-product-review/SKILL.md
reference_modules:
    - id: delightful_product_review.delight_audit_core
      name: Delight Audit Core (motivators, grid, pillars, patterns)
      summary: The working framework for running a delight audit — motivational segmentation with demotivator inversion, the motivator template, opportunity conversion, the delight grid (Low/Surface/Deep with the ~10% surface cap), the three pillars with audit moves, and the named delight pattern catalog.
      when_to_load:
          - Before producing any delight findings — mapping motivators, placing candidates on the grid, or auditing surfaces against the three pillars.
          - When the user asks where delight or "wow" opportunities exist in a feature, flow, or journey.
      path: references/delight-audit-core.md
    - id: delightful_product_review.delight_gates_and_antipatterns
      name: Delight Gates & Anti-Patterns (checklist, rejections, 50-40-10, buy-in)
      summary: The validation occasion — six-gate pre-ship delight checklist, habituation risk, the seven named anti-delight failure modes (Deliveroo fake-call, Apple therapy-fireworks, streak-shaming, default-on celebrations…), the 50-40-10 roadmap audit procedure with diagnoses, and the skeptical-leader buy-in tactic.
      when_to_load:
          - When gating a celebration, recap, animation, or magic-moment feature before ship, or diagnosing one that landed flat.
          - When auditing a roadmap's functionality/delight balance, or preparing findings for a skeptical leader.
      path: references/delight-gates-and-antipatterns.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/delightful_product_review/SKILL.md
---

# Delightful Product Review

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Provenance.
  This file is skill_type: procedure, so Procedure carries the weight. The deep declarative framework
  (motivators, delight grid, three pillars, pattern catalog, pre-ship checklist, anti-delight failure modes,
  50-40-10) already lives in the two reference modules, each loaded before findings — so Knowledge is empty here.
-->

## Identity

The canonical home for Nesrine Changuel's delight framework. The discipline this skill enforces is **delight in functionality, not delight instead of it**: delight = joy + surprise, produced when a surface solves a functional need and honors an emotional need at the same time — and it is only reviewed after foundational quality is clean, because surface delight layered on broken basics is anti-delight.

This is a **procedure** skill at **domain** altitude. The deep rules live in reference modules; the skill body holds the sequence, the output contract, and the escalation map — load the references before producing findings.

## Activation

- The user asks for delight, surprise, motivation, memorability, charm, "wow" or magic moments, or emotional pull in a product.
- Reviewing consumer experiences, onboarding, empty states, achievement moments, habit loops, or emotionally important surfaces.
- Pre-ship gating a celebration, animation, recap, or personalization feature.
- Auditing a roadmap's balance between functionality, deep delight, and surface delight.
- Diagnosing why a feature that "should delight" lands flat, or building a buy-in case for delight investment with a skeptical leader.

## Judgment

Severity rubric:

- **high** — anti-delight risk: inclusion failure (Deliveroo/Apple-fireworks class), context-blind or default-on celebration, streak-shaming in ADHD/burnout-adjacent surfaces, or delight layered over a broken foundation.
- **medium** — failed pre-ship checklist gate, missing valley-moment rescue, habituation with no iteration plan, surface delight exceeding the ~10% cap, motivator coverage gap on a key surface.
- **low** — missed deep-delight opportunity, craft or easter-egg suggestion, buy-in framing improvement.

## Procedure

Ordered sequence and intent. Routed steps carry a `→ <id>` marker; who owns each escalation target is resolved once in **Routing**.

1. Scope check. Confirm the product belongs to the delight school: entertainment, social, consumer, or crowded-B2B categories where emotion differentiates. For productivity tools used under cognitive load, thinking environments, or mental-health-adjacent surfaces (grief, recovery, burnout), delight is the wrong primitive — redirect → `calm_software_design_review` and say why.
2. Sequencing gate. Delight review runs only AFTER foundational quality is clean. Confirm the surface has passed (or recently passed) a `ui_ux_quality_review`-grade check: task completable, states defined, hierarchy readable, no broken funnel. If foundations are unverified, run or escalate → `ui_ux_quality_review` first. Proceed delight-only when the user explicitly insists — and open the report with a caveat that foundations were not verified.
3. Load `delightful_product_review.delight_audit_core`. Identify motivators per surface using the motivator template: functional, personal emotional, and social emotional. When emotional motivators are hard to articulate, use demotivator inversion (collect frustrations, invert them into the emotional brief).
4. Still in the core reference: convert motivators to opportunities (stay in opportunity-space, not feature lists), then place every candidate on the delight grid — Low / Surface / Deep — and run the three-pillar audit per surface: remove friction at valley moments, anticipate unarticulated needs, exceed expectations. Force-rank deep-delight candidates first.
5. Load `delightful_product_review.delight_gates_and_antipatterns` when any candidate is heading to ship, when the review covers a roadmap, or when an existing delight feature landed flat. Run every candidate through the six-gate pre-ship checklist (user impact, business impact, feasibility, familiarity, inclusion, maintainability of surprise), scan against the named anti-delight failure modes, and audit roadmap balance against 50/40/10.
6. Tag out-of-scope findings for escalation instead of dropping them → see **Routing** for the escalation ownership map.
7. Assemble the findings report using the **Contract** below, ordered by severity then user impact, ending with the top 3 moves. If the audit will be presented to a skeptical leader, close with the buy-in framing in the leader's goal language (retention, CAC, positioning) from the gates reference.

## Routing

Ownership map for out-of-scope findings — tagged and escalated, never dropped (Procedure step 6). One concern, one owner:

| Concern (out of scope for delight review)                                                     | Owner                               |
| --------------------------------------------------------------------------------------------- | ----------------------------------- |
| Foundational issues discovered mid-review (broken flows, missing states, contrast, hierarchy) | `ui_ux_quality_review`              |
| Inclusion concerns needing structural review beyond the checklist gate                        | `accessibility_inclusive_ui_review` |
| Over-stimulation or productivity-under-load surfaces                                          | `calm_software_design_review`       |
| Landing pages and persuasion structure                                                        | `marketing_site_design_review`      |

The sibling `ui_ux_quality_review` escalates delight opportunities here once foundations are clean; this skill escalates foundational issues back.

## Contract

Every finding follows this canonical shape:

```
Surface: <feature, screen, flow, or moment>
Finding: <named rule, pattern, or anti-pattern, e.g. "Default-on celebration in unknown context">
Grid: <low | surface | deep | anti-delight>
Pillar: <remove-friction | anticipate-needs | exceed-expectations | none>
Evidence: <specific copy, animation, journey point, metric, or roadmap item>
Severity: <high | medium | low>
Fix: <named pattern from the catalog, or concrete change>
Delegated: <optional sibling skill id if the fix is out of this skill's scope>
```

Stop conditions before returning: every flagged feature has a grid placement; every ship-bound candidate has all six checklist gates reported pass/fail; every finding carries Evidence and Severity; roadmap reviews state the current ratio against 50/40/10; foundational issues are tagged Delegated, not dropped.

## Policy

- A finding without evidence is not a finding — if it cannot be tied to a specific surface, copy, animation, journey point, or roadmap item, do not include it.
- Do not produce findings without loading the matching reference module first.
- Do not review for delight on a surface with unresolved foundational issues unless the user explicitly insists — and never use delight to cover broken basics, unclear flows, or slow performance. Delight cannot fix broken; it amplifies the gap.
- Inclusion is a gate, not a checklist line. If a candidate cannot be defended against the Deliveroo Mother's Day and Apple therapy-fireworks failure modes, kill it. No default-on celebrations in unknown contexts — require an opt-in.
- Do not recommend confetti for routine actions; celebration requires an underlying moment with weight.
- Do not gamify tools used under cognitive load — no streaks, badges, daily-login shaming, or leaderboards in ADHD-, burnout-, or grief-adjacent surfaces.
- Cap surface delight at ~10% of the roadmap. If the delight ideas are mostly animations and recaps, the upstream motivator work is incomplete — go back to step 3.
- Do not skip the maintainability-of-surprise gate; a delight feature without an iteration plan becomes wallpaper within weeks.
- Do not let delight dodge hard tradeoffs — sometimes the most delightful move is removing a feature.

## Provenance

- Reference modules: `delightful_product_review.delight_audit_core` (motivators, grid, pillars, pattern catalog), `delightful_product_review.delight_gates_and_antipatterns` (pre-ship checklist, anti-delight rejections, 50-40-10, buy-in tactic).
- Primary sources: Nesrine Changuel [PRIMARY] (delight model, three pillars, grid, checklist, 50-40-10, anti-delight failure modes, buy-in tactic), Dylan Field [practitioner] (craft as the moat), Kole Jain [practitioner] (atomic UI craft moves).
- For calm-school products (BuildOS included), the useful exports are demotivator inversion, the inclusion gate, and the valley-moments audit — not surprise.
- Maintainers: the canonical research draft with full lineage lives at `docs/research/youtube-library/skill-drafts/delightful-product-review/` (not available at runtime).
