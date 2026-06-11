---
name: Cold Email Reply OS
description: Child skill for classifying cold outreach replies into a 12-class taxonomy, routing objections through a 7-route table, reviving silence with numbered forks, and answering within SLA so trust is preserved after a recipient responds or goes quiet.
parent_id: cold_email_engagement_first_outreach
depth: 1
preserve_markdown: true
legacy_paths:
    - cold_email_outreach.reply_os
    - cold_email_outreach.objection_handling
reference_modules:
    - id: cold_email_reply_os.reply_taxonomy_sla
      name: Reply Taxonomy and SLA
      summary: 12-class reply taxonomy with detection cues, owner/SLA matrix, same-day routing rules, reply-to-call frame, and left-company trigger handoff.
      when_to_load:
          - When classifying a reply (workflow step 1) or setting owner and SLA (workflow step 6).
          - When a "left company" auto-reply or referral needs routing.
      path: references/reply-taxonomy-and-sla.md
      visibility: internal
    - id: cold_email_reply_os.objection_routes
      name: Objection Route Table
      summary: 7-objection route table with labels and calibrated questions, Gong 7-step async adaptation, and the objection-bank template structure (acknowledge -> label -> one contrast/artifact -> smallest calibrated question).
      when_to_load:
          - When the reply is an objection, skepticism, competitor-chosen, or a send-info brushoff.
      path: references/objection-route-table.md
      visibility: internal
    - id: cold_email_reply_os.fork_library
      name: Numbered Fork Library
      summary: Three named forks (qualification, ghosted-thread, Hail Mary) with full text, fork discipline rules, and silence-revival cadence by mode.
      when_to_load:
          - When silence revival or a numbered fork is the chosen move (workflow steps 2, 7).
      path: references/numbered-fork-library.md
      visibility: internal
    - id: cold_email_reply_os.tactical_empathy_routes
      name: Tactical Empathy Routes
      summary: Route table and label -> calibrated question patterns for objections, silence, skepticism, angry replies, and ambiguous replies.
      when_to_load:
          - When a reply is skeptical, tense, ambiguous, negative, silent, or objection-heavy and you need label and question phrasing.
      path: references/tactical-empathy-routes.md
      visibility: internal
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_reply_os/SKILL.md
---

# Cold Email Reply OS

Use this child skill after sending, when a reply arrives, a thread goes quiet, or objections need routing. The discipline this skill enforces is **classify first**: every reply gets a taxonomy class before any draft, route, or fork. A route without a taxonomy class is not a route. Replies are scarce trust signals — the north star is qualified conversations started per unit of market trust consumed.

## When to Use

- The user has a reply and needs the next response
- The prospect went silent after interest
- The user needs objection handling
- The user wants a low-friction numbered fork
- The user needs reply-to-call handling without pressure

## Workflow

1. Classify the reply. Load `cold_email_reply_os.reply_taxonomy_sla` and assign exactly one of the 12 classes from its detection cues. If ambiguous (class 12), the only move is one calibrated question — do not assume intent.
2. Route by class. Objection, skeptical, competitor-chosen, or send-info-brushoff → load `cold_email_reply_os.objection_routes` and pick the matching route row. Silence or revival → load `cold_email_reply_os.fork_library` and pick one of the three named forks. For label and calibrated-question phrasing on tense or ambiguous replies, load `cold_email_reply_os.tactical_empathy_routes`.
3. Preserve the original promise. If they asked for info, send the artifact, not a brochure.
4. Draft the response in the response shape: one label, one answer or artifact, one calibrated question or next step. Never two CTAs.
5. Set owner and first-response SLA from the SLA matrix; flag same-day classes (yes/interested, send info, angry/opt-out) explicitly.
6. Handle special handoffs: a left-company auto-reply fires the trigger workflow to `cold_email_icp_signal_design`; an opt-out suppresses the address immediately.
7. If silent after meaningful time, use one respectful numbered fork — one fork per thread, ever — and set the revival cadence by mode from the fork library.
8. Log the exchange: class, route, objection language verbatim (buyer language feeds `cold_email_learning_review`).

## Output Contract

- Reply class (one of the 12, named)
- Intent level
- Chosen route or fork (named row/fork from the loaded reference)
- Response draft (label + answer/artifact + one next step)
- Artifact to send, if promised
- Owner and SLA note (who responds, by when)
- Stop or follow-up rule (cadence by mode, or suppression)
- Buyer-language log line for the learning review

## Guardrails

- Do not respond without classifying first; a route without a taxonomy class is not a route.
- Honor a no.
- Do not guilt, pressure, or insult the recipient.
- Do not push a call after weak interest.
- Do not call without context in sensitive markets.
- Do not leave high-intent replies overnight when the motion depends on calls.
- Do not debate angry replies or continue after opt-out.
- Never ask "why" in an objection reply — what/how questions only.
- One fork per thread, ever.
- Do not counter-pitch a competitor-chosen reply; run the Hail Mary learning move instead.
- Do not cite list-email stats (e.g. Hormozi speed-to-contact) as cold-email SLA facts.

## Notes

- Sources named inline in the references: Steli Efti/Close (forks, follow-up calendar), Gong (objection process, skeptic-signal data), Black Swan Group (labels, calibrated questions), Connor Murray (objection bank, cadence), Craig Elias (trigger events), Austin Schneider (volume touch decay). Async objection adaptations of call-era sources are flagged as derivation inside the modules.
- Maintainers: enrichment lineage lives at `docs/research/youtube-library/cold-email-children-enrichment-plan-2026-06-10.md` and the draft references at `docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/` (not available at runtime).
