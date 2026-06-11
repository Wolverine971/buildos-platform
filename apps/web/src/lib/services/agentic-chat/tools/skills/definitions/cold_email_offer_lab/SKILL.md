---
name: Cold Email OfferLab
description: Child skill for designing or repairing the cold outreach offer before copy is written — separates the core offer from a front-end artifact, picks mode-appropriate artifacts, sizes the smallest useful yes against a T0-T3 trust ladder, and runs false-positive checks on the result.
parent_id: cold_email_engagement_first_outreach
depth: 1
preserve_markdown: true
legacy_paths:
    - cold_email_outreach.offer_lab
    - cold_email_outreach.offer_creation
reference_modules:
    - id: cold_email_offer_lab.offer_design_rubric
      name: Offer Design Rubric
      summary: Buyer-progress, alternatives-aware, proof-matched rubric for creating artifact offers and smallest useful yes CTAs — six-test artifact filter, seven artifact families, rewrite patterns, disqualifiers.
      when_to_load:
          - When the offer is missing, meeting-first, feature-first, too large, or weakly tied to buyer progress.
          - When filtering or rewriting a candidate artifact (workflow steps 2 and 8).
      path: references/offer-design-rubric.md
      visibility: internal
    - id: cold_email_offer_lab.artifact_library
      name: Offer Artifact Library by Mode
      summary: Mode-keyed artifact library across 8 modes, core-vs-front-end worked examples from Aaron Shepherd, CTA-fits-product table, and the production-cost rule.
      when_to_load:
          - When generating artifact hypotheses (workflow step 5).
          - When the mode is non-sales (investor, recruiting, PR/podcast, customer research, founder-to-founder) or a tangible-product mode.
      path: references/artifact-library-by-mode.md
      visibility: internal
    - id: cold_email_offer_lab.trust_ask_rubric
      name: Trust/Ask Ratio Rubric
      summary: T0-T3 trust ladder with ask ceilings, the meeting-ask exception register, and false-positive checks (Mom Test, Dunford, Moesta, production cost).
      when_to_load:
          - When sizing the smallest useful yes (workflow step 6).
          - When judging whether a meeting-first ask is permissible for this mode and trust level.
      path: references/trust-ask-ratio-rubric.md
      visibility: internal
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_offer_lab/SKILL.md
---

# Cold Email OfferLab

Use this child skill when the offer is missing, meeting-first, too large for cold trust, or not artifact-shaped. The north star is qualified conversations started per unit of market trust consumed: the offer is the largest lever on both halves of that ratio.

The deep rules live in the reference modules. This shell holds the sequence and the decision rules; load the matching reference before producing the offer.

## When to Use

- The user says "I want meetings" but has no front-end offer
- The current CTA is "worth a chat?"
- The campaign has low positive reply rate
- The user has an offer but no useful artifact
- The segment is new and needs offer hypotheses
- A meeting-first ask needs a permissibility ruling

## Workflow

1. Identify the mode (high-volume B2B, strategic B2B, tangible product, investor, recruiting, PR/podcast, customer research, founder-to-founder) and name the persona, moment, pain, and desired outcome.
2. Load `cold_email_offer_lab.offer_design_rubric` when the existing offer is weak, meeting-first, or feature-first; apply its six-test filter to anything already on the table.
3. Name the buyer's current alternative, workaround, or tradeoff.
4. Separate the core offer from the cold front-end artifact. The front-end offer is a no-commitment test drive of the core service, never the core service itself.
5. Load `cold_email_offer_lab.artifact_library` and generate 2-3 artifact hypotheses keyed to the mode. Match the artifact to what is actually being sold (data product → snapshot; service → teardown; SaaS → 3 signals; advisory → note).
6. Load `cold_email_offer_lab.trust_ask_rubric`. Assign the trust tier (T0-T3) and choose the smallest useful yes within that tier's ask ceiling. If a meeting ask is proposed, allow it only if it appears in the exception register.
7. Run the false-positive checks from the trust/ask rubric: production cost (>30 min per accepted reply disqualifies volume use), Mom Test evidence standard, Dunford buyer-choice check, Moesta struggling-moment check.
8. Add proof only if it is true, relevant, approved, and matched to the exact claim.
9. Return one recommended artifact offer and backup tests using the output contract.

## Output Contract

- Mode
- Core offer
- Pain hypothesis
- Artifact offer (the recommended front-end artifact)
- Why the artifact is useful before a meeting
- Current alternative or tradeoff
- Trust tier (T0-T3) and the chosen smallest useful yes
- False-positive check results (production cost, Mom Test, buyer-choice, struggling-moment)
- Production cost and delivery path
- Proof slot
- Follow-up path after reply
- Test metric

## Guardrails

- Do not accept a meeting as the offer by default; a meeting-first ask is permitted only when it appears in the trust/ask rubric's exception register (owned enterprise relationship at T3; recruiting 15-min call).
- The offer must be artifact-shaped: a specific deliverable (audit, teardown, sample, note, benchmark, angle list), not "let's chat."
- Do not let the ask outrun the trust tier by more than one level.
- Do not use a Loom, deck, or calendar link as the cold value unless the mode specifically supports it.
- Do not create artifacts the sender cannot deliver, or artifacts costing >30 min per accepted reply in a volume campaign.
- Do not use unsupported ROI or outcome claims.
- Do not hide a sales pitch inside a research ask (Mom Test).
- Do not offer a feature walkthrough when the buyer needs help making a choice (Dunford).
- Do not let mode permissions leak across modes: no direct time asks in investor or PR modes; recruiting benchmarks and allowances stay in recruiting.
- Do not import list-email or opt-in newsletter tactics as cold-email offer advice.

## Notes

- Reference modules: `cold_email_offer_lab.offer_design_rubric` (six-test filter, families, rewrites), `cold_email_offer_lab.artifact_library` (mode-keyed artifacts, core-vs-front-end), `cold_email_offer_lab.trust_ask_rubric` (T0-T3 ladder, exception register, false-positive checks).
- Primary sources: Aaron Shepherd (front-end offer), Austin Schneider (deliverable-not-a-meeting), April Dunford (buyer choice), Bob Moesta (struggling moment), Rob Fitzpatrick's Mom Test (false positives), Challenger Customer (Mobilizer material), Michael Seibel/YC (investor mode), Kai Davis and Muck Rack (PR/podcast mode).
- Maintainers: enrichment lineage lives at `docs/research/youtube-library/cold-email-children-enrichment-plan-2026-06-10.md` (not available at runtime).
