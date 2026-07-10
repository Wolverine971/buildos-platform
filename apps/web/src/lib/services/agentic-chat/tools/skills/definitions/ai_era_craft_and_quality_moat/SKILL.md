---
name: AI-Era Craft and Quality Moat
catalog_line: 'Decide where craft and quality are the moat when AI makes shipping cheap: differentiation, quality bets, AI-slop diagnosis.'
description: >-
    Root skill for deciding where craft and quality are the moat when AI makes shipping working software cheap. Use for "how do we differentiate" questions, prioritizing quality investments, good-enough-vs-excellent roadmap arbitration, defending craft hires against AI-substitution arguments, defining a quality north star, or diagnosing why a product feels like AI slop despite functional parity. Strategy layer above per-screen audits — distills the Saarinen/Field/Wen/Lu consensus into a craft priority ladder, a five-question surface-posture filter, a craft-vs-speed quadrant, hiring and roadmap rubrics, and BuildOS posture calls.
skill_type: strategy # procedure | reference | strategy | resource | policy | orchestration
altitude: meta # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
legacy_paths:
    - ai-era-craft-and-quality-moat
    - docs/research/youtube-library/skill-drafts/ai-era-craft-and-quality-moat/SKILL.md
reference_modules:
    - id: ai_era_craft_and_quality_moat.core_thesis_and_consensus
      name: Core Thesis & Four-Leader Consensus
      summary: The five-point consolidated argument (AI lowers the floor, taste rises in value; speed plus taste compounds; quality is strategy; the 1927 Calkins craft cycle; AI tries to outsource judgment), the Saarinen/Field/Wen/Lu claim-by-claim consensus table, and the craft-moat vs. delight-moat (Changuel) school comparison.
      when_to_load:
          - When defending the craft posture, writing strategy or board framing, or answering "why bet on craft" / "how do we differentiate".
          - When choosing between the craft-moat and delight-moat schools for a product category.
      path: references/core-thesis-and-consensus.md
    - id: ai_era_craft_and_quality_moat.craft_priority_ladder
      name: Craft Priority Ladder
      summary: The eight-dimension opinionated ranking of where craft still matters (taste & judgment, time-to-value, IA & opinionated defaults, performance, visual craft, component consistency, copy, accessibility) — each with what AI does well, what it does badly, where the moat lives, and the hiring implication — plus the delegate-confidently-to-AI list.
      when_to_load:
          - When allocating craft investment across dimensions or surfaces.
          - When deciding what to delegate to AI versus keep under human judgment, or setting a quality north star.
      path: references/craft-priority-ladder.md
    - id: ai_era_craft_and_quality_moat.decision_filter_and_failure_modes
      name: Decision Filter & AI-Era Failure Modes
      summary: The five-question "good enough is mediocre" surface-posture filter, the craft-vs-speed quadrant matrix, and the named AI-era failure modes (screenshot trap, Shadcn slop, component sprawl, naming inflation, eval theater, speed-as-shipping-debt, outsourced judgment, process collapse).
      when_to_load:
          - When making a ship/cut or posture call on a specific feature, surface, or release.
          - When diagnosing AI slop, picking a craft-vs-speed quadrant, or running a pre-launch review.
      path: references/decision-filter-and-failure-modes.md
    - id: ai_era_craft_and_quality_moat.hiring_and_roadmap_rubrics
      name: Hiring & Roadmap Rubrics
      summary: Quality as a hiring rubric (makers over specialists, critique-as-application, paid work trials, filter for taste in AI use) and quality as a roadmap framework (door test, scope reduction, internal MVP, no A/B-test crutch, 7-day zero-bug window, main quest only).
      when_to_load:
          - When running a hiring loop, evaluating a candidate, or writing a hiring rubric.
          - When arbitrating a roadmap, scoping a feature, or setting release discipline.
      path: references/hiring-and-roadmap-rubrics.md
    - id: ai_era_craft_and_quality_moat.buildos_application
      name: BuildOS Application
      summary: Concrete BuildOS posture decisions — anti-feed positioning as quality-as-moat, the surface triage table (brain dump / brief / structuring high-craft; settings AI-baseline), Inkprint as the craft-token enforcement layer, and BuildOS hiring and roadmap postures.
      when_to_load:
          - When the decision concerns BuildOS specifically — its surfaces, positioning, design system, hiring, or roadmap.
      path: references/buildos-application.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/ai_era_craft_and_quality_moat/SKILL.md
---

# AI-Era Craft and Quality Moat

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Related Tools → Examples → Provenance.
  This file is skill_type: strategy (secondary: orchestration — it routes to 5 sibling review skills, but its dominant
  verb is *decide*: it owns the priority ladder, decision filter, craft-vs-speed quadrant, and the hiring/roadmap
  rubrics). Do NOT retype to orchestration. Judgment carries the strategic spine; the deep frameworks and volatile
  domain tables live in the reference modules, each self-provenanced.
-->

## Identity

Use this skill to make **strategic** decisions about where craft is the moat in a world where AI has commoditized "shipping working software."

This is the **strategy** layer (meta altitude) above per-surface audits. It backs roadmap meetings, hiring loops, positioning, and board decks — it allocates craft, it does not perform the reviews. The deep frameworks live in the reference modules; the body holds the sequence, the output contract, and the escalation map.

## Activation

- Prioritizing quality investments — deciding which features, surfaces, or polish work deserve disproportionate craft effort.
- Evaluating a "good enough vs. excellent" tradeoff on a roadmap arbitration.
- Defending craft hires against AI-substitution arguments ("can't an LLM do this?").
- Defining a quality north star for a small team that has to choose what to over-invest in.
- Building a moat or differentiation story in a category where every competitor now ships features at AI speed.
- Diagnosing why a product feels like "AI slop" despite functional parity with competitors.
- Setting the hiring rubric for a team in the AI era — generalist product builders vs. specialists.

Do not use this skill for per-screen visual reviews (`visual_craft_fundamentals`), in-app UI/UX audits (`ui_ux_quality_review`), calm-software restraint review of a flow (`calm_software_design_review`), marketing-site section audits (`marketing_site_design_review`), or tactical "fix this button" requests — this skill answers _whether to fund_ the fix, not how to do it.

## Judgment

The consolidated thesis: models lower the floor of shipping working code, which raises the value of taste, judgment, and design; speed without judgment produces mediocrity at scale, while speed plus taste compounds; quality is strategy, not aesthetics. Prior tech cycles outsourced labor — AI tries to outsource judgment, and the team that refuses wins the next decade.

## Procedure

1. Name the decision in one sentence: ship/cut call, hire/no-hire, roadmap arbitration, positioning/differentiation framing, or slop diagnosis. If the request is actually a tactical per-screen review, escalate immediately per the map in **Routing** instead of running this skill.
2. When the ask is "why craft" / "how do we differentiate" — or the craft posture itself is being challenged — load `ai_era_craft_and_quality_moat.core_thesis_and_consensus` and anchor the argument in the five-point thesis and the four-leader consensus, including the steel-man from the delight-moat school.
3. For a posture call on a specific feature, surface, or release, load `ai_era_craft_and_quality_moat.decision_filter_and_failure_modes`: run the five-question filter, place the product on the craft-vs-speed quadrant, and name any active AI-era failure modes by name.
4. When allocating craft across dimensions or deciding what to delegate to AI, load `ai_era_craft_and_quality_moat.craft_priority_ladder` and rank the implicated dimensions; pair every "human judgment required" item with a "delegate confidently" item so the allocation is honest about cost.
5. For hiring and roadmap decisions, load `ai_era_craft_and_quality_moat.hiring_and_roadmap_rubrics` and apply the rubric lines directly — including the AI-era addition: filter for taste in AI use.
6. When the subject is BuildOS, additionally load `ai_era_craft_and_quality_moat.buildos_application` and use the surface-triage table and Inkprint enforcement rules as the precedent, not a fresh derivation.
7. Tag tactical follow-ups for escalation instead of doing them here → `visual_craft_fundamentals`, `ui_ux_quality_review`, `calm_software_design_review`, `marketing_site_design_review`, `delightful_product_review`; ownership map in **Routing**.
8. Assemble the decision packet using the **Contract** below. Always make the call.

## Routing

Escalation map, declared once. This skill answers _whether to fund_ the fix; the owners below answer _how_. Tactical follow-ups route out instead of being performed here.

| Tactical follow-up (what)            | Owner (who)                    |
| ------------------------------------ | ------------------------------ |
| per-screen visual moves              | `visual_craft_fundamentals`    |
| in-app UI/UX audit                   | `ui_ux_quality_review`         |
| calm / restraint flow review         | `calm_software_design_review`  |
| marketing-site audit                 | `marketing_site_design_review` |
| the delight-school contrast position | `delightful_product_review`    |

## Contract

When applying this skill to a decision (a feature ship/cut call, a hire/no-hire call, a roadmap arbitration), return:

```
Decision Summary
  - what is being decided
  - the candidate options

Craft-Moat Dimensions Implicated
  - which of the priority-ladder dimensions are at stake (taste, time-to-value, IA, performance, visual, components, copy, a11y)

Where AI Helps vs. Where Craft Must Lead
  - delegated to AI: <list>
  - human judgment required: <list>

Surface Posture
  - high-craft / hybrid / AI-baseline
  - reasoning anchored to the 5-question filter

Recommended Decision
  - ship / cut / hire / pass / arbitrate
  - what the decision protects (moat-wise) and what it risks

Risks If You Optimize The Wrong Axis
  - specific failure modes from the AI-era list
  - which sources predict the failure (Saarinen / Field / Wen / Lu / Schoger)

Counter-Position (steel-man)
  - the strongest argument _against_ this decision
  - the conditions under which the counter-position would be right
```

The output is always opinionated. The point of the skill is to make the call, not to enumerate options.

## Policy

- Do not produce a decision packet, posture call, or rubric application without loading the matching reference module first.
- Do not use this skill as an excuse for "all surfaces deserve maximum craft." Cost matters; some surfaces are AI-baseline + manual polish only. The skill _allocates_ craft, it doesn't maximize it everywhere.
- Do not conflate "craft" with "polished aesthetic." Judgment > pixel-perfect. A well-judged plain interface beats a beautifully-rendered confused one.
- Do not assume craft applies equally across B2B / B2C / consumer / enterprise. Saarinen's framework works best in B2B retention with switching inertia. Apply with adjustment elsewhere.
- Do not skip evals on AI features. Field is direct: vibes is not eval. Build adversarial QA, real benchmarks, willingness to pull (Make Design → First Draft).
- Do not assume "ship faster" is always the answer. Saarinen ships slower than competitors and wins on quality. Speed is a knob; not every position should turn it up.
- Do not assume the calm-software school and the craft-moat school disagree. They're the same school applied at different layers: calm is the user-facing posture, craft is the operational discipline that produces calm.
- Do not let AI-era failure modes go unnamed in the room. If "looks great in screenshots, fails on use" is happening, say it. If "Shadcn slop" is happening, say it. If "naming inflation" is happening, say it.
- Do not pull this skill for tactical per-screen reviews — escalate per **Routing**.

## Provenance

- Reference modules: `core_thesis_and_consensus` (the argument), `craft_priority_ladder` (allocation), `decision_filter_and_failure_modes` (posture calls + diagnosis), `hiring_and_roadmap_rubrics` (people + roadmap), `buildos_application` (BuildOS precedent). Each module carries its own provenance tags (PRIMARY / practitioner / internal-default).
- Primary sources (all 2026): Karri Saarinen / Linear (Lenny's Podcast, Config 2025, Conversations on Quality, 10 Rules, Why is Quality So Rare?), Dylan Field / Figma (Lenny's Podcast), Jenny Wen / Anthropic (Lenny's Podcast), Ryo Lu / Cursor (with Peter Yang), Steve Schoger / Refactoring UI (CSS Day 2019). Contrast school: Nesrine Changuel (delight framework, consumed via `delightful_product_review`).
- This thesis is core to BuildOS's anti-AI positioning ("lead with relief, not AI") — craft and restraint as the differentiator, not AI-feature count.
- Enrichment (2026-06-11): added five Saarinen/Linear rules — the leadership-commitment quality rubric (owner + plan + rationale, Coinbase example), the organic-mentions qualitative north star, principles-over-process / design-review-as-cadence, and the "surprise users" no-A/B extension (all in `hiring-and-roadmap-rubrics.md`); plus quality-as-daily-individual-choice and craft-cycle-stage-as-positioning-diagnostic (`core-thesis-and-consensus.md`). Source: `docs/research/youtube-library/analyses/2026-04-29_karri-saarinen-linear_craft-and-calm-software_analysis.md`.
- Maintainers: the canonical research draft with full source links and local analysis paths lives at `docs/research/youtube-library/skill-drafts/ai-era-craft-and-quality-moat/` (not available at runtime).
