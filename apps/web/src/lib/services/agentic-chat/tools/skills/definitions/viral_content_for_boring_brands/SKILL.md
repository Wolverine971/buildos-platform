---
name: Viral Content For Boring Brands
description: >-
    Design or audit brand-account and founder-account content for products that are not inherently exciting — B2B SaaS, dev tools, project-management software, supplements, commodity consumables — against the six pre-conscious filters that decide whether a viewer scrolls or stays in the first two seconds. Covers format steal with a moral edge, curiosity gaps, means-end identity ladders, honest credentials, the one-line sharer test, and the story skeleton, with overlays that reject slop formats and performative authority. Not for creator-led personal-brand content, sentence-level hook polish, script bodies, or narrative arcs — escalate those to hook_craft_short_form, viral_video_script_structure, and story_driven_content_craft.
skill_type: procedure # procedure | reference | strategy | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
legacy_paths:
    - viral-content-for-boring-brands
    - docs/research/youtube-library/skill-drafts/viral-content-for-boring-brands/SKILL.md
reference_modules:
    - id: viral_content_for_boring_brands.attention_filters
      name: Attention Filters A–D (checks 1–4)
      summary: Threshold-bearing rules for the four pre-conscious filters that fire in under 2 seconds — format recognition with brand-fit scoring, curiosity-gap mechanisms, the means-end ladder to layer-3 identity, and the credential honesty tiers.
      when_to_load:
          - When executing a full audit or design pass, before producing findings for filters A–D.
          - When a piece reads as an ad, leads with the product, lacks a layer-3 identity statement, or has no credential in the first 2 seconds.
      path: references/attention-filters.md
      visibility: public
    - id: viral_content_for_boring_brands.spread_checks
      name: Spread Checks E–F (checks 5–6)
      summary: Threshold-bearing rules for spread and sustained engagement — the one-line sharer test with identity payoff tagging, drive-emotion rules, and the Hook → Problem → Story → Payoff skeleton with dead-space and caption rules.
      when_to_load:
          - When executing a full audit or design pass, before producing findings for filters E–F.
          - When a piece gets views but no shares, or retention dies mid-piece.
      path: references/spread-checks.md
      visibility: public
    - id: viral_content_for_boring_brands.honesty_overlays
      name: Honesty Overlays (checks 7–8)
      summary: BuildOS overlay rules — slop-format rejection (rage-bait, fake-confession, manufactured-drama mechanisms) and performative-credential rejection (cosplayed authority), with the brand's strongest true credentials.
      when_to_load:
          - Whenever a format-steal candidate or a credential is being evaluated (overlays on filters A and D).
          - Always for BuildOS-tagged work.
      path: references/honesty-overlays.md
      visibility: public
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/viral_content_for_boring_brands/SKILL.md
---

# Viral Content For Boring Brands

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Provenance.
  This file is skill_type: procedure — Procedure carries the weight; Judgment holds the core principles + the
  severity rubric; Routing declares sibling ownership and the brand-content chain; the six-filter threshold detail
  lives in the reference modules (attention_filters, spread_checks, honesty_overlays), each self-provenanced.
-->

## Identity

Use this skill when a brand or founder account is producing content for a product that is not inherently exciting — B2B SaaS, dev tools, project-management software, supplements, commodity consumables — and needs to make the first two seconds of a piece earn the next thirty.

A piece of brand content is not a billboard. It is a stack of **six pre-conscious filters** the viewer's brain runs in the first 0.5–2 seconds. Pass all six, the viewer stays and shares. Fail one, they scroll. The agent's job is to enforce that order, not to generate from blank.

This is a **procedure** skill at **domain** altitude: the ordered six-filter audit/design pass is the spine. Sentence-level hook polish, recordable script bodies, and narrative arcs are owned by siblings and escalated to, not handled here (see **Routing**).

## Activation

- Plan or audit a single piece of content from a brand or founder account whose product is "boring" — not inherently exciting.
- Diagnose why a brand-account post that "should have worked" died (or one that shouldn't have, hit).
- Translate a feature or release into content that doesn't read as an ad.
- Audit a draft against the six filters before recording or publishing.
- Pick the right format to "borrow" from a brand-aligned creator without stealing slop.
- Run the means-end ladder on a product or feature to find its layer-3 identity statement.
- Score a draft for shareability before posting.

Do **not** use this skill for:

- Creator-led personal-brand content — `hook_craft_short_form`, `story_driven_content_craft`, and `viral_video_script_structure` assume a personal-brand voice; this skill is the brand-account lane.
- Sentence-level hook polish (→ `hook_craft_short_form`), the recordable script body (→ `viral_video_script_structure`), or narrative-arc construction (→ `story_driven_content_craft`). This skill flags the failure; those siblings own the fix.
- Pure paid acquisition / performance ads (different game; algorithm filters work differently when distribution is bought).
- SEO blog content (→ `content_strategy_beyond_blogging`).
- Manufactured-virality / rage-bait playbooks (this skill explicitly refuses those — see Policy).

## Judgment

Core principles: **the brain decides before the viewer does** (align with the filters, don't bypass them); **format steal is a strategic choice with a moral edge** (the principle is brand-amoral — the brand imposes the morality); **identity layer beats feature layer every time**; **credentials matter, performance is a tax** (use receipts, reject cosplay); **sharers protect their reputation, not yours**; **stories suspend skepticism**.

Severity rubric:

- **high** — kills the piece (filter A or B fails; means-end never reaches layer 3; performative credential at slot 1; sharer-test blank is unfillable).
- **medium** — degrades retention or spread significantly (weak credential tier; story-skeleton beat missing; cuts deliver redundant info).
- **low** — stylistic preference, minor friction.

## Procedure

Ordered sequence and intent only. Reference-module loads are owned here **[here]**; escalations route to siblings via the `→` marker, resolved in **Routing** — never re-taught here.

1. **Preflight. [here]** Capture or confirm: the product layer-3 statement (run the means-end ladder if missing), the intended sharer-identity payoff (one sentence, sharer's first-person POV), 5–10 currently-trending format candidates in topic adjacencies with a brand-fit score per format, the pool of available real credentials (founder receipts, customer outcomes, audited numbers, environmental proof), and the four-beat skeleton draft (Hook / Problem / Story / Payoff) even if rough. Confidence floor: if a finding can't be evidenced with a specific time-stamp, frame, or sentence, do not include it.
2. **Load the honesty overlays. [here]** Load `viral_content_for_boring_brands.honesty_overlays` whenever format candidates or credentials are in play — always for BuildOS-tagged work. Reject slop formats and performative credentials before investing in them.
3. **Run filters A–D. [here]** Load `viral_content_for_boring_brands.attention_filters` and run checks 1–4 in order: format recognition (A), curiosity gap (B), identity layer / means-end ladder (C), credential shortcut (D). Produce findings as you go.
4. **Run filters E–F. [here]** Load `viral_content_for_boring_brands.spread_checks` and run checks 5–6: one-line sharer test (E), story skeleton (F).
5. **Fix in order. [here]** Do not optimize filters E–F while A–D are failing.
6. **Tag out-of-scope fixes for escalation** instead of doing them here: hook-line polish → `hook_craft_short_form`; narrative-arc strengthening → `story_driven_content_craft`; the recordable script → `viral_video_script_structure`; distribution-layer decisions → `algorithm_aware_publishing`.
7. **Assemble findings. [here]** Per the **Contract**, in filter order, ending with the top 3 high-severity fixes.

## Routing

Ownership map. The Procedure sequences; this table assigns. One concept, one owner — everyone else routes here.

| Concern                                                                | Owner                              | This skill retains                         |
| ---------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------ |
| Six-filter audit/design pass (all steps)                               | **this skill**                     | full ownership                             |
| Reference modules (attention_filters, spread_checks, honesty_overlays) | **this skill** (own modules)       | loading + applying the threshold rules     |
| Sentence-level hook polish                                             | `hook_craft_short_form`            | flags the failure only                     |
| Narrative-arc construction                                             | `story_driven_content_craft`       | flags the failure only                     |
| Recordable script body                                                 | `viral_video_script_structure`     | flags the failure only                     |
| Distribution / channel & publishing strategy                           | `algorithm_aware_publishing`       | the BuildOS anti-feed posture on the piece |
| Platform-specific algorithm thresholds (TikTok/IG/X/LinkedIn)          | `going_viral`                      | nothing — pure escalation                  |
| SEO blog content                                                       | `content_strategy_beyond_blogging` | nothing — pure escalation                  |

Default brand-content chain: this skill → `hook_craft_short_form` (hook polish) → `story_driven_content_craft` (arc) → `viral_video_script_structure` (recordable script). Skip hook polish if the line is already strong; skip the script step if the surface is text-only. Siblings consume the canonical finding schema directly without re-auditing the six filters.

For platform-specific algorithm behavior (TikTok, Instagram, X, LinkedIn thresholds and distribution mechanics), escalate to `going_viral`; for channel and publishing strategy, escalate to `algorithm_aware_publishing`.

## Contract

Every finding follows this canonical shape:

```txt
Filter: [A | B | C | D | E | F]
Finding: [named principle violated, e.g., "Lead with product (filter B failed)"]
Evidence: [specific frame, sentence, time-stamp, or claim]
Severity: [high | medium | low]
Fix: [concrete rewrite, layer-3 alternative, or format swap]
Source claim: [lineage primitive ID, e.g., primitive.curiosity-gap-hook-audit]
Delegated: [optional sibling skill if the fix is out of scope]
```

A finding without **Evidence** is not a finding. A finding without **Severity** is not actionable. Both fields are required. Severity is assigned against the rubric in **Judgment**.

Stop conditions — the audit is complete when:

- Every applicable filter has been checked or explicitly marked "no issues."
- Top 3 high-severity fixes are ranked by impact.
- All findings carry evidence and severity.
- Any rejected credentials or formats are documented with rejection reason.
- Out-of-scope concerns are tagged `Delegated:` to a sibling skill.

## Policy

- Do not adopt format-steal blindly. Reject slop formats even when they're going viral.
- Do not stage credentials. Borrowed environments and inflated numbers violate the brand's own anti-AI doctrine.
- Do not lead with the product, even when the product is the point. Lead with the gap; let the product show up after curiosity commits the viewer.
- Do not skip the means-end ladder. Layer-1 claims read as ads; the brain never engages.
- Do not chase outrage or sadness as the primary engine. They get views but don't spread, and they erode audience trust over time.
- Do not return findings without specific evidence (frame, sentence, time-stamp).
- Do not assign severity without referencing the rubric.
- Do not optimize filters E–F if filters A–D are failing. Fix in order.
- For BuildOS-tagged work specifically, do not adopt any tactic that would tip the brand into the manufactured-viral economy. The anti-feed posture is non-negotiable — lead with relief, not with AI.
- Do not produce findings for any filter without loading the matching reference module first, and do not approve a format or credential without running the honesty overlays.

## Knowledge

The six pre-conscious filters (taxonomy; owned here). Threshold-bearing rules for each filter are held in the reference modules (`attention_filters` for A–D, `spread_checks` for E–F), each provenance-tagged. **[PRIMARY: Tuan Le]**

```
0.5s  Filter A — Format recognition         → Have I seen this and liked it?
1.0s  Filter B — Curiosity gap              → Is there a gap I want to close?
1.5s  Filter C — Identity layer (means-end) → Does this speak to who I am?
2.0s  Filter D — Credential shortcut        → Should I trust the speaker?
post  Filter E — One-line sharer test       → Will sharing this make me look good?
post  Filter F — Story skeleton             → Am I inside a story I want to finish?
```

## Provenance

- **Framework origin & evidence [PRIMARY: Tuan Le].** The framework comes from Tuan Le, whose agency generated 3B+ views for commodity brands (Bulldock instant ramen: 300K → 1.8M followers, 900M views in 12 months; Stan: 20M views; a Japanese restaurant: 200 views → 1.8M+ per video). The product never changed in any of those cases. The mechanics did.
- Reference modules: `viral_content_for_boring_brands.attention_filters` (filters A–D), `viral_content_for_boring_brands.spread_checks` (filters E–F), `viral_content_for_boring_brands.honesty_overlays` (slop-format and performative-credential rejection).
- Primary source: Tuan Le (Shortscut), "What Getting 3 Billion Views Taught Me About Human Psychology." **[PRIMARY: Tuan Le]** The slop-format and performative-credential overlays are BuildOS synthesis from the anti-AI / anti-feed marketing doctrine **[internal-default]**. Primitive IDs in findings match the draft's `lineage.yaml`.
- Maintainers: the canonical research draft with full lineage lives at `docs/research/youtube-library/skill-drafts/viral-content-for-boring-brands/` (not available at runtime).
