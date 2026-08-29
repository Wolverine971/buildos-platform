<!-- tasker/README.md -->

# Tasker — Open Work

**Audited 2026-08-29.** Fourteen completed trackers were removed; 32 active, parked, or explicitly
deferred trackers remain.

This folder is an active-work queue, not a build log. Completed work belongs in feature docs,
verification receipts, commits, and git history. A tracker stays here only while it has at least one
real unfinished build, deployment, verification, experiment, or owner decision.

## Maintenance rule

When a tracker reaches its exit condition:

1. Move any genuine residual into an existing open tracker or a narrowly scoped new one.
2. Update durable feature or operations documentation with the completion evidence.
3. Delete the completed tracker and its README row in the same change.

Do not keep a completed file around as an archive. Do not mark a tracker complete when deployment,
live verification, or a named exit gate is still pending.

## Current focus

- **Highest-risk open work:** [20](20-agentic-chat-wave3-security-brief.md) still owns the remaining
  Agentic Chat security wave.
- **Time-sensitive evaluation:** [36](36-gmail-project-relevance-phase-a.md) needs its review surface
  deployed and the 300-item sample adjudicated before source retention expires.
- **Closest to deletion:** [54](54-calendar-route-size-guard.md) needs one authenticated live smoke;
  [45](45-legacy-agent-chat-retirement.md) needs the web caller-cutover deployment; and
  [50](50-worker-provider-execution-hardening-slice16.md) needs its follow-up canary and two operator
  gates.
- **Largest active Agentic Chat program:** [65](65-agentic-chat-read-default-cost-program.md) has its
  read-default architecture production-verified, but the streaming, provider/cache, prompt cleanup,
  and experiment packages remain. [67](67-agentic-chat-redundant-read-round-planning.md) owns the
  narrower cross-round planning work. [70](70-agentic-chat-production-battery-remediation.md) owns
  the four production correctness failures and two control-loop efficiency misses found in the
  zero-retry breadth battery; completed tool-call contract Tasker 64 remains closed and deleted.

## Active trackers

### Agentic Chat, platform reliability, and verification

| Tracker | Remaining kernel |
| --- | --- |
| [17 — Skill ontology follow-ups](17-skill-refactor-followups.md) | Run the full post-fix live suite, fidelity-check the named skills, and close the DJ rulings. |
| [20 — Agentic Chat Wave 3 security](20-agentic-chat-wave3-security-brief.md) | Execute the remaining security wave and Wave 2 tail; keep the explicit go/no-go item held. |
| [35 — Agentic Chat Gmail tools](35-agentic-chat-gmail-tools.md) | Gmail reads are generally available; local draft proposals, seeded injection testing, and ZDR enforcement remain. |
| [38 — Live verification debt](38-live-verification-debt.md) | Batch the manual pentest, calendar, audit, onboarding, rotation, and inbox smokes and record each result. |
| [45 — Legacy agent-chat retirement](45-legacy-agent-chat-retirement.md) | The production database is retired; deploy and verify the remaining web caller cutover. |
| [50 — Worker execution hardening](50-worker-provider-execution-hardening-slice16.md) | Deploy/canary the follow-up and run the constraint-diff and deliberate budget-overrun gates. |
| [54 — Calendar route-size guard](54-calendar-route-size-guard.md) | Route split is deployed and `main` is green; run the authenticated live smoke, then delete the tracker. |
| [60 — Fair-share queue claiming](60-agentic-chat-fair-share-queue-claiming.md) | Measure starvation risk and choose a fair claiming policy without weakening durable admission. |
| [61 — Multi-replica capacity observability](61-agentic-chat-multi-replica-capacity-observability.md) | Add fleet-level heartbeat and capacity attribution across worker replicas. |
| [62 — Agent Chat modal decomposition](62-agent-chat-modal-state-orchestration-decomposition.md) | Separate state/orchestration boundaries with transition coverage. |
| [63 — Supabase migration ledger reconciliation](63-supabase-migration-ledger-reconciliation.md) | Classify historical drift, repair the hosted ledger safely, and add divergence checks. |
| [65 — Read-default and cost program](65-agentic-chat-read-default-cost-program.md) | WP-3 is live; WP-1, WP-2, WP-4, WP-5, and the remaining DJ decisions are still open. |
| [67 — Redundant read-round planning](67-agentic-chat-redundant-read-round-planning.md) | Baseline is corrected; add exact-read telemetry, trace result contracts, run bounded experiments, and canary the winner. |
| [70 — Production battery remediation](70-agentic-chat-production-battery-remediation.md) | Fix false email renegotiation, persist project context shifts, require durable clarification, make contract repair converge, repair pass telemetry, and rerun the zero-retry production battery. |
| [73 — Libri post-migration safety audit](73-libri-post-migration-safety-audit.md) | Activate after Libri cutover; prove data reconciliation, BuildOS isolation/performance, and Railway worker recovery before Convex retirement. |

### Product, IA, and experiments

| Tracker | Remaining kernel |
| --- | --- |
| [27 — `/today` migration and IA](27-today-migration-ia-consolidation.md) | Live-verify WP-0/WP-2, finish the redirect flip, then resolve the remaining IA packages and owner decisions. |
| [34 — Holistic Project Review synthesis](34-project-review-holistic-synthesis.md) | Build and evaluate the evidence-bound cross-family synthesis. |
| [40 — Working notes and artifacts](40-working-notes-artifacts.md) | Decide the durable note contract and build the channel-agnostic human-facing refresh path. |
| [41 — Open-brief cohort 1](41-open-brief-cohort-1.md) | Clear the veto packet, finish both runners, execute the paid cohort, and produce the blind readout. |
| [43 — Re-entry Compass](43-reentry-compass-experiment.md) | Parked after a failed Phase 0 gate; revisit only when the stated user-volume and routing preconditions exist. |
| [44 — One Clear Next Move](44-one-clear-next-move-experiment.md) | Run Phase 0 before authorizing a treatment or production experiment. |
| [48 — `DocumentModal` decomposition](48-document-modal-decomposition.md) | Explicitly deferred by owner; resume only as a focused workstream with characterization first. |
| [52 — AI Inbox review-loop remediation](52-ai-inbox-review-loop-remediation.md) | WP-1/WP-2 are applied and WP-3 is local; deploy the runtime and verify the one-brief behavior live. |
| [53 — Projects list simplification](53-projects-list-purpose-simplification.md) | Validate the page purpose, ratify the wireframe, then implement and journey-test the simplified launcher. |

### Research, data, and model migration

| Tracker | Remaining kernel |
| --- | --- |
| [29 — Deep Research production track](29-deep-research-production-track.md) | Parked with local code complete; deployment, reconciliation, provenance gating, and the quality architecture remain. |
| [32 — Deep Research chat and progress UX](32-deep-research-chat-tool-and-progress-ui.md) | Build the bounded launch, confirmation, durable progress, controls, and report experience after Tasker 29 clears its gate. |
| [36 — Gmail relevance Phase A](36-gmail-project-relevance-phase-a.md) | Deploy review-off, adjudicate 300 samples, record the aggregate decision, and produce the retention receipt. |
| [46 — Legacy project-generation retirement](46-legacy-project-generation-retirement.md) | Resolve unmapped rows and dependencies, archive safely, then retire the legacy model. |

### Marketing and owner decisions

| Tracker | Remaining kernel |
| --- | --- |
| [10 — Creator outreach](10-creator-outreach-swyx-riley.md) | Send the ready outreach, verify Riley, build the Swyx artifact, and work the candidate pipeline. |
| [12 — Personal-brand throughline](12-personal-brand-throughline.md) | Write and ratify the single throughline across DJ's ventures. |
| [18 — Worldbuilding follow-ons](18-worldbuilding-program.md) | Close the canon decisions, write the specificity/world-bible artifacts, and run the remaining cross-project work. |
| [24 — Creator acquisition pilot](24-creator-social-acquisition-pilot.md) | Resolve the campaign decisions, then run the real 30-day Writer acquisition and return loop. |

Marketing content cadence itself belongs in `docs/marketing/ops/queue.json`, not in Tasker.
