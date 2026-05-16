---
name: Cold Email OfferLab
description: Child skill for designing or repairing the cold outreach artifact offer, proof, and smallest useful yes before copy is written.
parent_id: cold_email_engagement_first_outreach
depth: 1
legacy_paths:
    - cold_email_outreach.offer_lab
    - cold_email_outreach.offer_creation
reference_modules:
    - id: cold_email_offer_lab.offer_design_rubric
      name: Offer Design Rubric
      summary: Buyer-progress, alternatives-aware, proof-matched rubric for creating artifact offers and smallest useful yes CTAs.
      when_to_load:
          - When the offer is missing, meeting-first, feature-first, too large, or weakly tied to buyer progress.
      path: references/offer-design-rubric.md
      visibility: internal
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_offer_lab/SKILL.md
---

# Cold Email OfferLab

Use this child skill when the offer is missing, meeting-first, too large for cold trust, or not artifact-shaped.

## When to Use

- The user says "I want meetings" but has no front-end offer
- The current CTA is "worth a chat?"
- The campaign has low positive reply rate
- The user has an offer but no useful artifact
- The segment is new and needs offer hypotheses

## Workflow

1. Name the persona, moment, pain, and desired outcome.
2. Load [references/offer-design-rubric.md](references/offer-design-rubric.md) when the offer is weak or meeting-first.
3. Name the buyer's current alternative, workaround, or tradeoff.
4. Separate the core offer from the cold front-end artifact.
5. Generate 2-3 artifact hypotheses that help the buyer make progress before a meeting.
6. Choose the smallest useful yes for each artifact.
7. Check production cost: can the sender deliver the artifact quickly after reply?
8. Add proof only if it is true, relevant, approved, and matched to the exact claim.
9. Return one recommended artifact offer and backup tests.

## Output Contract

- Core offer
- Pain hypothesis
- Artifact offer
- Why the artifact is useful before a meeting
- Current alternative or tradeoff
- Production cost and delivery path
- Proof slot
- Smallest useful yes
- Follow-up path after reply
- Test metric

## Guardrails

- Do not accept a meeting as the offer by default.
- Do not use a Loom, deck, or calendar link as the cold value unless the mode specifically supports it.
- Do not create artifacts the sender cannot deliver.
- Do not use unsupported ROI or outcome claims.
- Do not hide a sales pitch inside a research ask.
- Do not offer a feature walkthrough when the buyer needs help making a choice.
