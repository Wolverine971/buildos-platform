<!-- tasker/README.md -->

# Tasker — Open Work

**Audited 2026-08-31.** Sixteen completed trackers were removed; trackers 76–79 now hold the
paid-launch readiness program. **2026-09-01:** tracker 72 reached its exit condition and was
deleted — the pushed worker release (`4a5e29cfc`, deployed 2026-08-29 ~20:00 UTC) processed a real
production image asset at 22:27 UTC the same day (`queue_jobs` completed, `ocr_status=complete`,
`extraction_summary` populated, zero OCR failures since). 36 active, parked, or explicitly deferred
trackers remain.

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

- **Surgical document edits (2026-09-23):**
  [99 — Remove or replace a line without rewriting the doc](99-surgical-document-edits.md)
  shipped in 5014e3ef5 (p04 passed) and preview-before-review in 4ebe44389. The p05 replay and
  the gate still need DJ's approval.
- **Specialist workflow readiness (2026-09-23):**
  [98 — Step limits, speed audit, value test](98-specialist-workflow-step-limits-speed-value.md)
  is ready for another agent. The planner failed validation in 11 of 12 pilot reviews (likely hidden
  reasoning tokens against 1,200/4,000-token caps, enforced in code and SQL); reviews take 15–171 s.
  Fix the limits, audit where the time goes, then test whether specialists beat one chat answer with
  the same evidence. Paid runs need DJ's approval; the OpenRouter balance is low.
- **Supervisor reliability and specialist quality (2026-09-21):**
  [92 — Takeover handoff](92-agentic-chat-supervisor-reliability-and-specialist-handoff.md)
  starts with the retained ownership-check timeout, then task-classification policy, explicit
  completion receipts, and answer comparison. The latest gate failed 48/52. Every paid test or
  rerun requires DJ's explicit approval; begin with existing evidence and free local tests.
- **Workflow Lab inspection (2026-09-20):** [91 — Multi-agent trace and export](91-workflow-lab-audit-and-export.md)
  is ready for another implementation agent: lab log links, specialist flow/evidence inspection,
  and a complete offline audit bundle. See its current production/local scope before starting.
- **Start here for Agentic Chat (2026-09-19):**
  [handoff](../docs/technical/reviews/AGENTIC_CHAT_HANDOFF_2026-09-19.md).
    - The Jev freshness radar ([88](88-chat-workflow-ordinary-chat.md)) is live for DJ, with
      auto-apply off.
    - The 86/87 workflow is merged and deployed with its switches off.
    - One final acceptance run remains at [89](89-chat-workflow-integration-acceptance.md).
- **Chat workflow implementation:** [81](81-chat-workflow-implementation-program.md)
  coordinates the new chat-first pilot. DJ closed the Task 90 testing handoff after
  the focused repairs and deferred calendar work; see the
  [closeout](../docs/technical/reviews/CHAT_WORKFLOW_TASK90_CLOSEOUT_2026-09-14.md).
  Task 83 (bounded reviews and prompt snapshots) closed on 2026-09-14; see its
  [receipt](../docs/technical/reviews/CHAT_WORKFLOW_TASK83_BOUNDED_REVIEWS_2026-09-14.md).
  [85](85-chat-workflow-durable-contracts.md) froze the interfaces and built storage and
  readers with writers off on 2026-09-14, and QA has its migrations. See its
  [receipt](../docs/technical/reviews/CHAT_WORKFLOW_TASK85_DURABLE_CONTRACTS_2026-09-14.md).
  Next are the combined 82+83+84+85 gate and 86/87/88 against the frozen contract.
  Grounding follow-up stays in [82](82-chat-workflow-regression-repairs.md), and
  [89](89-chat-workflow-integration-acceptance.md) retains acceptance evidence.
- **Paid-launch gate:** [76](76-production-database-security-containment.md) owns the confirmed live
  privileged-function exposure; [77](77-billing-commercial-contract-reconciliation.md) owns the
  commercial decision and payment proof; [78](78-product-promise-production-proof.md) owns the
  cross-journey production evidence packet; and [79](79-customer-visible-paid-launch-polish.md)
  owns visible launch defects and the remaining core-surface audit.
- **Highest-risk open work:** [20](20-agentic-chat-wave3-security-brief.md) has the security and D4b
  implementation in source; finish the pending production/Preview verification gates before
  treating the lane as closed.
- **Time-sensitive evaluation:** [36](36-gmail-project-relevance-phase-a.md) needs its review surface
  deployed and the 300-item sample adjudicated before source retention expires.
- **Closest to deletion:** [50](50-worker-provider-execution-hardening-slice16.md) needs its follow-up
  canary and two operator gates.
- **Main Agentic Chat engineering lane after security verification:**
  [70](70-agentic-chat-production-battery-remediation.md) needs the final bounded compiler deploy,
  classified receipt, and complete production battery. [65](65-agentic-chat-read-default-cost-program.md)
  is now only the cache-measurement plus prompt-cleanup/experiment residual. [67](67-agentic-chat-redundant-read-round-planning.md)
  has a healthy no-duplicate baseline; exact-read observability is in progress, while prompt changes
  remain gated on a fresh reproduction.

## Active trackers

### Chat workflow pilot — ordered by Tasker 81

The package numbers identify owners, not a strictly numeric execution sequence.
82/84 form the first coordinated repair change set. Subsequent integration is
83 (closed 2026-09-14) → 85 → 86 → 87 → 88, with 89 owning acceptance throughout. Parallel development
and shared-file handoffs are specified in 81; all full gates run sequentially.

| Tracker                                                                                                                | Remaining kernel                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [81 — Workflow implementation program](81-chat-workflow-implementation-program.md)                                     | Coordinate source baseline, task dependencies, file ownership, integration gates and pilot completion.                                                           |
| [82 — Regression repairs](82-chat-workflow-regression-repairs.md)                                                      | Repair dependency completion, exact document text and status grounding/read bounds; pass the full strict gate with 84.                                           |
| [84 — Delivery and stall visibility](84-chat-workflow-delivery-and-stall-visibility.md)                                | Let computation advance after durable acceptance, preserve ordered delivery/reconciliation and expose per-turn progress age.                                     |
| [85 — Durable contracts](85-chat-workflow-durable-contracts.md)                                                        | Freeze interfaces; add compatible v4 readers and fenced request/context/step/cost/recovery storage with writers off.                                             |
| [86 — Lightweight submission](86-chat-workflow-lightweight-submission.md)                                              | Save raw requests atomically, gather context in the worker, preserve ordinary admission and measure acknowledgement latency.                                     |
| [87 — Recoverable steps](87-chat-workflow-recoverable-steps.md)                                                        | Reuse accepted work after restart, meter every physical dispatch and reconcile streaming without duplicate answers.                                              |
| [88 — Jev freshness radar](88-chat-workflow-ordinary-chat.md)                                                          | After a brain dump, Jev flags stale tasks/docs/goals, auto-applies very-confident low-risk edits with undo, drafts the rest, retires obsolete inbox items.       |
| [89 — Integration acceptance](89-chat-workflow-integration-acceptance.md)                                              | Prove browser/restart/fault behavior, compare latency/cost/usefulness and publish a repeatable local test handoff.                                               |
| [91 — Workflow Lab trace and export](91-workflow-lab-audit-and-export.md)                                              | Add lab log links, a multi-agent execution/evidence inspector, and a complete Markdown/ZIP audit export.                                                         |
| [92 — Supervisor reliability and specialist handoff](92-agentic-chat-supervisor-reliability-and-specialist-handoff.md) | Repair stalled ownership checks, align task classification, define complete-request receipts, and compare specialist answers; paid validation requires approval. |

### Paid launch readiness

| Tracker                                                                                     | Remaining kernel                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [76 — Production database security](76-production-database-security-containment.md)         | Contain the three confirmed anonymous privileged-function exposures, audit every definer grant, update platform security, and add continuous permission guards.                  |
| [77 — Billing commercial contract](77-billing-commercial-contract-reconciliation.md)        | Ratify one pricing/entitlement contract, align product/legal/Stripe behavior, and prove the complete payment lifecycle before enabling billing.                                  |
| [78 — Product promise production proof](78-product-promise-production-proof.md)             | Ratify the product promise, build the golden-journey evidence matrix, close proof gaps through owning trackers, and issue the paid-launch decision.                              |
| [79 — Customer-visible paid-launch polish](79-customer-visible-paid-launch-polish.md)       | Fix exposed internal content, obstruction and mobile issues, public prototype/content hygiene, unaudited core surfaces, and the missing performance baseline.                    |
| [80 — Agentic chat post-audit follow-through](80-agentic-chat-post-audit-follow-through.md) | Prove the 09-02 turn-executor fixes in production, retire the legacy web chat lane, make turns resumable, canary a cheaper reviewer, finish skill quality and telemetry hygiene. |

### Agentic Chat, platform reliability, and verification

| Tracker                                                                                              | Remaining kernel                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [17 — Skill ontology follow-ups](17-skill-refactor-followups.md)                                     | Run the full post-fix live suite, fidelity-check the named skills, and close the DJ rulings.                                                                  |
| [20 — Agentic Chat Wave 3 security](20-agentic-chat-wave3-security-brief.md)                         | Finish the source-complete security wave's deploy receipts and D4b Preview detach/reconcile gate; keep its Production lifecycle flag off until that proof.    |
| [35 — Agentic Chat Gmail tools](35-agentic-chat-gmail-tools.md)                                      | Gmail reads are generally available; local draft proposals, seeded injection testing, and ZDR enforcement remain.                                             |
| [38 — Live verification debt](38-live-verification-debt.md)                                          | Batch the manual pentest, calendar, audit, onboarding, rotation, and inbox smokes and record each result.                                                     |
| [50 — Worker execution hardening](50-worker-provider-execution-hardening-slice16.md)                 | Deploy/canary the follow-up and run the constraint-diff and deliberate budget-overrun gates.                                                                  |
| [60 — Fair-share queue claiming](60-agentic-chat-fair-share-queue-claiming.md)                       | Measure starvation risk and choose a fair claiming policy without weakening durable admission.                                                                |
| [61 — Multi-replica capacity observability](61-agentic-chat-multi-replica-capacity-observability.md) | Add fleet-level heartbeat and capacity attribution across worker replicas.                                                                                    |
| [62 — Agent Chat modal decomposition](62-agent-chat-modal-state-orchestration-decomposition.md)      | Separate state/orchestration boundaries with transition coverage.                                                                                             |
| [63 — Supabase migration ledger reconciliation](63-supabase-migration-ledger-reconciliation.md)      | Classify historical drift, repair the hosted ledger safely, and add divergence checks.                                                                        |
| [65 — Read-default and cost program](65-agentic-chat-read-default-cost-program.md)                   | WP-1 mechanics, WP-2 mechanics, and WP-3 are implemented; close the live cache/span receipts, then WP-4 prompt cleanup, D2/D3, and WP-5 experiments.          |
| [67 — Redundant read-round planning](67-agentic-chat-redundant-read-round-planning.md)               | Current production baseline has zero duplicates; finish exact-read/resource telemetry, and require a fresh reproduction before any planner prompt experiment. |
| [70 — Production battery remediation](70-agentic-chat-production-battery-remediation.md)             | Deploy the independently reviewed schedule compiler, obtain its classified ≤6-pass receipt, then run the isolated and full zero-retry production battery.     |
| [73 — Libri post-migration safety audit](73-libri-post-migration-safety-audit.md)                    | Activate after Libri cutover; prove data reconciliation, BuildOS isolation/performance, and Railway worker recovery before Convex retirement.                 |
| [74 — Calendar legacy-surface cleanup](74-calendar-legacy-surface-cleanup.md)                        | Reconcile legacy connection status and task recurrence editing with the multi-source ontology calendar model.                                                 |
| [75 — Prepared-admission lease](75-agentic-chat-prepared-admission-lease.md)                         | Production canary is green; collect the 100–500-turn control/treatment latency and safety receipt before closing the lane.                                    |

### Product, IA, and experiments

| Tracker                                                                                           | Remaining kernel                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [27 — `/today` migration and IA](27-today-migration-ia-consolidation.md)                          | Live-verify WP-0/WP-2, finish the redirect flip, then resolve the remaining IA packages and owner decisions.                                                                                                                                                                                                             |
| [34 — Holistic Project Review synthesis](34-project-review-holistic-synthesis.md)                 | Build and evaluate the evidence-bound cross-family synthesis.                                                                                                                                                                                                                                                            |
| [40 — Working notes and artifacts](40-working-notes-artifacts.md)                                 | Decide the durable note contract and build the channel-agnostic human-facing refresh path.                                                                                                                                                                                                                               |
| [41 — Open-brief cohort 1](41-open-brief-cohort-1.md)                                             | Clear the veto packet, finish both runners, execute the paid cohort, and produce the blind readout.                                                                                                                                                                                                                      |
| [43 — Re-entry Compass](43-reentry-compass-experiment.md)                                         | Parked after a failed Phase 0 gate; revisit only when the stated user-volume and routing preconditions exist.                                                                                                                                                                                                            |
| [44 — One Clear Next Move](44-one-clear-next-move-experiment.md)                                  | Run Phase 0 before authorizing a treatment or production experiment.                                                                                                                                                                                                                                                     |
| [48 — `DocumentModal` decomposition](48-document-modal-decomposition.md)                          | Explicitly deferred by owner; resume only as a focused workstream with characterization first.                                                                                                                                                                                                                           |
| [52 — AI Inbox review-loop remediation](52-ai-inbox-review-loop-remediation.md)                   | WP-1/WP-2 are applied and WP-3 is local; deploy the runtime and verify the one-brief behavior live.                                                                                                                                                                                                                      |
| [53 — Projects list simplification](53-projects-list-purpose-simplification.md)                   | Validate the page purpose, ratify the wireframe, then implement and journey-test the simplified launcher.                                                                                                                                                                                                                |
| [93 — START HERE capture reconciles, not appends](93-start-here-capture-synthesize-not-append.md) | Superseded by checkpoint capture (tasker 95, live in `6660f80ce`). Only the damaged-doc cleanup remains, and DJ deferred it.                                                                                                                                                                                             |
| [96 — Capture follow-ups from the book loop](96-capture-followups-from-book-loop.md)              | Second pass built 2026-09-23 and uncommitted. Current state now needs cited evidence plus write receipts (status reads 11/11), and `restates`/`kind` are verified. Open: a request recorded as done (~1/3; structural fix documented, DJ holding), stale untouched lines, Finding 8, and the receipt-chip browser check. |
| [97 — Chat as a writing partner](97-chat-as-writing-partner.md)                                   | Built 2026-09-23 and uncommitted. Re-entry answers lead with the work, interviews ask at most 3 questions, and START HERE shows when newer docs exist. DJ declined the gate for now; the prompt-size payload cap is nearly exhausted.                                                                                    |

### Research, data, and model migration

| Tracker                                                                                  | Remaining kernel                                                                                                           |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [29 — Deep Research production track](29-deep-research-production-track.md)              | Parked with local code complete; deployment, reconciliation, provenance gating, and the quality architecture remain.       |
| [32 — Deep Research chat and progress UX](32-deep-research-chat-tool-and-progress-ui.md) | Build the bounded launch, confirmation, durable progress, controls, and report experience after Tasker 29 clears its gate. |
| [36 — Gmail relevance Phase A](36-gmail-project-relevance-phase-a.md)                    | Deploy review-off, adjudicate 300 samples, record the aggregate decision, and produce the retention receipt.               |
| [46 — Legacy project-generation retirement](46-legacy-project-generation-retirement.md)  | Resolve unmapped rows and dependencies, archive safely, then retire the legacy model.                                      |

### Marketing and owner decisions

| Tracker                                                                  | Remaining kernel                                                                                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| [10 — Creator outreach](10-creator-outreach-swyx-riley.md)               | Send the ready outreach, verify Riley, build the Swyx artifact, and work the candidate pipeline.                  |
| [12 — Personal-brand throughline](12-personal-brand-throughline.md)      | Write and ratify the single throughline across DJ's ventures.                                                     |
| [18 — Worldbuilding follow-ons](18-worldbuilding-program.md)             | Close the canon decisions, write the specificity/world-bible artifacts, and run the remaining cross-project work. |
| [24 — Creator acquisition pilot](24-creator-social-acquisition-pilot.md) | Resolve the campaign decisions, then run the real 30-day Writer acquisition and return loop.                      |

Marketing content cadence itself belongs in `docs/marketing/ops/queue.json`, not in Tasker.
