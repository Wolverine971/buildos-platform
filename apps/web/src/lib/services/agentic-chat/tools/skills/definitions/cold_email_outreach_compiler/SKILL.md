---
name: Cold Email Outreach Compiler
description: Child skill for compiling prepared mode, segment, anchor, offer, proof, and sender constraints into a finished cold outreach bundle — seven mode scaffolds, a subject/preview packaging pass, a 9-point body lint, and a mode-keyed cadence map. Also executes full rebuilds routed from cold_email_taste_review; for judging or tightening an existing draft, use taste review first.
parent_id: cold_email_engagement_first_outreach
depth: 1
preserve_markdown: true
legacy_paths:
    - cold_email_outreach.compiler
    - cold_email_outreach.drafting
reference_modules:
    - id: cold_email_outreach_compiler.mode_templates
      name: Mode Templates and Scaffolds
      summary: Seven mode-specific compiler templates with verbatim scaffolds (Shepherd volume pattern, Murray three-paragraph, strategic anchor anatomy, Seibel investor payload and three-sentence framework, recruiting checklist, Kai Davis podcast template with PR beat seasoning, founder-to-founder), plus the body length and register table.
      when_to_load:
          - When drafting the body in the mode register (workflow step 4).
          - When the user asks what a given mode's email should look like, or needs the length/register rules for a mode.
      path: references/mode-templates.md
      visibility: internal
    - id: cold_email_outreach_compiler.packaging_rules
      name: Subject and Preview Rules
      summary: Mode-keyed subject table, the universal rejection list with Lavender deltas (questions −56% opens, 1–3 word subjects), preview-text rules, and the title-case-vs-lowercase register resolution.
      when_to_load:
          - When running the subject/preview packaging pass (workflow step 5).
          - When diagnosing low opens on an existing draft before touching the body.
      path: references/subject-preview-rules.md
      visibility: internal
    - id: cold_email_outreach_compiler.lint_and_cadence
      name: Body Lint and Cadence Map
      summary: The 9-point lint checklist, Murray's assumptive-language replacement table, the cadence map by mode with verbatim follow-up lines, follow-up content rules, and compile-time refusal triggers.
      when_to_load:
          - When running the final lint pass and attaching cadence, reply routes, and refusal notes (workflow steps 6-8).
          - When auditing a drafted email or sequence for passive language, multi-CTA, or cadence violations.
      path: references/body-lint-and-cadence.md
      visibility: internal
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_outreach_compiler/SKILL.md
---

# Cold Email Outreach Compiler

Use this child skill when the core inputs are ready and the user wants the finished email, sequence, or audit rewrite. The north star is qualified conversations started per unit of market trust consumed: the compiler's job is to spend prepared inputs well, never to paper over missing ones.

The templates, numbers, and checklists live in the reference modules. This shell holds the sequence, the routing rules, and the output contract; load the matching reference before drafting or linting.

## When to Use

- Mode, target/segment, offer, and sender constraints are already known
- The user asks to draft, rewrite, or package the outreach
- The user wants a campaign bundle or per-email bundle
- The root skill has routed weak inputs to other child skills already

## Workflow

1. Confirm the ingredient chain exists: person, moment, reason (anchor + bridge for relationship-sensitive modes), artifact offer, proof status, sender constraints. Refuse to compile around a missing critical ingredient — route it instead: vague segment/persona → `cold_email_icp_signal_design`; missing or meeting-first offer → `cold_email_offer_lab`; anchor below Level 3 for strategic/single-target → `cold_email_research_anchors`; unverified sender at volume → `cold_email_deliverability_readiness`.
2. Pick exactly one mode (volume casual, volume/enterprise formal, strategic anchor-led, investor, recruiting, PR/podcast, founder-to-founder — partnership and customer research as flagged thin variants) and restate why it is the right mode.
3. Confirm the offer is artifact-first, buyer-progress-oriented, and alternatives-aware. A meeting-first ask is allowed only where the mode sanctions it (strategic sales, recruiting) — never in investor or PR modes.
4. Load `cold_email_outreach_compiler.mode_templates` and draft the body in that mode's scaffold, length cap, and register. Add proof only if credible, relevant, approved, and claim-matched. For PR/podcast, package beat fit, audience reason, and the topic-angle menu. For strategic B2B, package the artifact so a Mobilizer could forward it internally.
5. Load `cold_email_outreach_compiler.packaging_rules` and run the subject/preview pass: mode-keyed subject, rejection-list sweep, register resolution (title case for formal modes, lowercase for casual volume), and deliberate first-two-sentences preview that extends the subject and surfaces the anchor.
6. Load `cold_email_outreach_compiler.lint_and_cadence` and run the 9-point lint. Fix every failure or name it in the bundle; the passive-to-assumptive sweep and single-CTA rule are non-negotiable.
7. Attach the mode's cadence from the cadence map, with follow-up content per the follow-up rules (follow-up #1 reformats, #2 restates the CTA, #3 breaks up; volume stops at two touches; PR follows up exactly once).
8. Define reply routes (yes / no / objection / silence — hand objection and revival handling to `cold_email_reply_os`) and tracking targets per stage. Targets come from `cold_email_learning_review`'s benchmark bands and gate tree — set positive-reply-per-send and bounce/complaint ceilings there; do not invent target numbers here. Note: low opens in 2026 are more likely a compliance/placement failure than a copy failure.
9. Return the bundle with refusal notes for any precondition that remains weak.

## Output Contract

- Mode and why it fits
- Subject and one alternate
- Preview text (the first two sentences, written deliberately)
- Email body (plus follow-up bodies for a campaign bundle)
- Proof slot or named proof gap
- CTA and why it is the smallest useful yes
- Buyer progress / alternative being addressed
- Lint results (9-point pass/fail with fixes applied)
- Cadence map for the mode
- Reply routes
- Tracking targets (sourced from `cold_email_learning_review` benchmark bands — never invented)
- Refusal or risk notes

## Guardrails

- Do not compile around missing critical inputs — name the gap and route to the sibling that produces it (`cold_email_icp_signal_design`, `cold_email_offer_lab`, `cold_email_research_anchors`).
- Do not compile for an unverified sender at volume — name the deliverability gap and route to `cold_email_deliverability_readiness` instead.
- Do not use multiple CTAs.
- Do not leave preview text to chance.
- Do not turn an artifact offer into a meeting-first ask.
- Do not compile PR/podcast outreach without verified audience/beat fit.
- Do not compile strategic B2B outreach without a recipient or internal-consensus logic.
- Do not let mode allowances leak across modes: time-asks stay in strategic/recruiting; recruiting and PR benchmarks stay in their modes; never mix registers in one campaign.
- Do not treat vendor numbers (Lavender, Recruiterflow, Greenhouse, Schneider) as governing thresholds — they are directional patterns.
- Do not import opt-in newsletter or list-email tactics as cold-email advice.

## Notes

- Reference modules: `cold_email_outreach_compiler.mode_templates` (seven scaffolds, length/register table), `cold_email_outreach_compiler.packaging_rules` (subject/preview rules, Lavender deltas), `cold_email_outreach_compiler.lint_and_cadence` (9-point lint, assumptive table, cadence map, refusal triggers).
- Primary sources: Connor Murray (three-paragraph body, assumptive language, strategic cadence), Aaron Shepherd (casual volume pattern), Sam McKenna (anchor/bridge, executive single-target), Michael Seibel and Y Combinator (investor payload, three-sentence framework), Kai Davis and Muck Rack (podcast/PR), Gem/Greenhouse/RecruitingDaily (recruiting patterns), Sahil Bloom (founder operator variant), Lavender (subject/body deltas — 231,818-email vendor benchmark, directional), Austin Schneider/Instantly (two-touch volume cadence), Close/Steli Efti (follow-up content rules).
- Maintainers: enrichment lineage lives at `docs/research/youtube-library/cold-email-children-enrichment-plan-2026-06-10.md` with ported draft references under `docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/` (not available at runtime).
