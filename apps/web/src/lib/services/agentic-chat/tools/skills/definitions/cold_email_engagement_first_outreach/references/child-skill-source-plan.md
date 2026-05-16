---
doc_type: skill-reference
skill: cold_email_engagement_first_outreach
reference: child-skill-source-plan
visibility: internal
publish: false
purpose: Runtime guide for agents assigned to source and deepen cold email child skills.
canonical_research_path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/internal-child-skill-source-development-plan.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_engagement_first_outreach/references/child-skill-source-plan.md
---

# Child Skill Source Plan

Internal runtime guide. Do not publish.

Use this reference when an agent is assigned to flesh out a cold email child skill with real source material. The root skill should stay usable on its own. Child skills should become deep optional modules that return structured artifacts to the root workflow.

The root sequence is:

```text
right person -> right moment -> right reason -> right offer -> right ask -> right follow-up
```

The north star is:

```text
qualified conversations started per unit of market trust consumed
```

## Research Protocol

1. Start with the current child `SKILL.md`, the root source map, and the canonical research plan.
2. Write the unresolved questions for that child skill.
3. Gather 3-7 strong sources specific to that child skill.
4. Prefer official/current sources for deliverability, DNS, privacy, and compliance.
5. Treat vendor benchmark claims as directional unless backed by method and context.
6. Extract workflows, rubrics, examples, failure modes, and guardrails.
7. Resolve conflicts by mode: high-volume, strategic, investor, recruiting, PR/podcast, partnership, and customer research have different standards.
8. Keep the runtime `SKILL.md` compact. Put long examples, scorecards, source notes, and edge cases in references.
9. Update lineage so the source-to-rule mapping is clear.

## Definition Of Done

A child skill is source-backed when it has:

- 3-7 relevant sources with provenance.
- A clear workflow and output contract.
- A scoring rubric, checklist, decision tree, or examples.
- Guardrails and known failure modes.
- A structured artifact the root skill can consume.
- Open questions and weak areas explicitly noted.

## Child Skill Source Queues

### `cold_email_icp_signal_design`

Find sources on ICP design, segmentation, buying committees, timing triggers, intent data, account scoring, Jobs-to-be-Done, and RevOps fit/intent models.

Build:

- Segment definition schema.
- Signal scoring rubric.
- Disqualifier checklist.
- Buying committee map.
- Weak/acceptable/strong segment examples.

Questions:

- What makes a signal strong enough to justify outreach now?
- How should signal freshness, reliability, pain likelihood, and testability be scored?
- Which disqualifiers keep campaign data interpretable?

### `cold_email_offer_lab`

Find sources on offer creation, positioning, value propositions, service packaging, cold-safe front-end artifacts, proof, risk reversal, and real cold email offer teardowns.

Build:

- Artifact offer library by mode.
- Core offer vs front-end artifact distinction.
- Trust/ask ratio rubric.
- Production-cost and delivery-risk check.
- Examples converting meeting-first offers into useful artifacts.

Questions:

- What is useful before a meeting?
- Which artifacts fit each mode?
- When is a meeting ask acceptable?

### `cold_email_research_anchors`

Find sources on research-led outreach, executive research, Sam McKenna-style personalization, 30MPC teardowns, podcast/PR audience-fit research, recruiting sourcing, and privacy boundaries.

Build:

- Research surface map by mode.
- Specificity ladder examples.
- Bridge sentence patterns.
- Invasive or decorative personalization guardrails.
- Anchor grading worksheet.

Questions:

- What makes the anchor cause the outreach?
- How much research is enough by mode?
- When does public information become creepy or irrelevant?

### `cold_email_outreach_compiler`

Find sources on cold email teardown mechanics, subject and preview packaging, mobile readability, concise sales writing, proof placement, and mode-specific examples.

Build:

- Mode-specific draft templates.
- Subject/preview rules.
- Body lint checklist.
- Bad-to-good rewrites.
- Campaign and per-email output schemas.

Questions:

- What must be rejected before drafting?
- What should the final bundle always include?
- How do subject and preview work together?

### `cold_email_taste_review`

Find sources on editorial review, reputation risk, plain-language business writing, persuasion ethics, bad cold email examples, and expert teardown standards.

Build:

- Taste scorecard.
- Screenshot test.
- Fake-warmth detector.
- Ask/trust mismatch rubric.
- Highest-risk-line rewrite protocol.

Questions:

- When is fluent copy still unsafe?
- What earns pass, revise, or do-not-send?
- Which claims or lines create reputation risk?

### `cold_email_deliverability_readiness`

Find current official sources for Google, Yahoo, Microsoft/Outlook, and applicable regulator guidance. Use one practical secondary deliverability explainer, such as Postmark, only to clarify implementation details.

Build:

- Deliverability intake form.
- DNS checklist.
- Pass/blocked/manual-only decision tree.
- Conservative send-volume table.
- Monitoring and troubleshooting playbook.
- Provider requirement matrix. Current runtime matrix exists at `../cold_email_deliverability_readiness/references/provider-requirement-matrix.md`; update it instead of duplicating provider rules.

Questions:

- What are current official requirements?
- Which checks are hard requirements vs heuristics?
- What symptoms point to domain, list, content, or complaint problems?

Always verify this area with current sources before making changes.

### `cold_email_reply_os`

Find sources on reply classification, objection handling, Steli Efti/Close numbered forks, sales response handling, customer support tone, opt-out handling, and internal reply corpora if available.

Build:

- Reply taxonomy.
- Route table by reply class.
- SLA matrix.
- Objection response bank.
- Numbered fork library.
- Opt-out and angry-reply handling.

Questions:

- What next action preserves the original promise?
- Which replies need same-day handling?
- When should the system stop?

### `cold_email_learning_review`

Find sources on experiment design, A/B testing, sales outreach metrics, growth learning loops, benchmark caveats, and internal campaign result analysis.

Build:

- Learning memo template.
- Metric diagnostic table.
- Stop/iterate/recycle decision tree.
- Buyer-language extraction worksheet.
- Next-test template with one variable changed.

Questions:

- Which metric diagnoses which failure?
- When is sample size too small?
- How do we measure trust consumed, not just meetings booked?

## Candidate Future Child Skills

Promote these only when repeated usage proves they block the root workflow:

- Source of Truth Builder: account/person/proof data model, citations, CRM hygiene.
- Buyer-Language Mining: customer calls, reviews, transcripts, community language.
- Proof Asset Selection: proof hierarchy, claims substantiation, customer permission.
- Sequence and Cadence Planner: deeper follow-up timing, stop rules, channel mix.

## Tangential Skill Queues

Keep these adjacent unless the current outreach job directly needs them:

- Relationship building.
- Founder-led content.
- Community building.
- Customer research interviewing.
- Positioning and messaging.
- Case study and proof creation.
- CRM and data hygiene.
- Lead enrichment and verification.
- Compliance and privacy review.
- Analytics and experiment design.
- Warm intro strategy.
- Investor narrative.
- Recruiting strategy.
- PR and media strategy.
- Partnership strategy.

## Do Not Do

- Do not dump raw transcripts into child skills.
- Do not publish this internal plan.
- Do not use newsletter/list-email advice as cold outreach advice without explicitly separating the audience physics.
- Do not make tangential skills mandatory root steps.
- Do not fabricate current deliverability rules, proof, research, examples, or campaign data.
