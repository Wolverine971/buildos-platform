<!-- apps/worker/src/workers/agentic-chat/djflow-build-list.md -->

# Chat workflow build list

Updated 2026-09-14. Execution companion to [the architecture](./djflow-architecture.md).
The [prototype guide](./djflow-prototype.md) describes what currently runs.

## Current baseline

- [x] Real queued project review: context, planner, two specialists, synthesis.
- [x] Progress, cancellation, completed findings, and saved report restoration.
- [x] Read-only execution, including suppression of automatic domain capture.
- [x] 295 focused tests and two successful live workflow runs recorded.
- [ ] Full regression gate passing. The startup-race patch's complete run scored 44/52,
      with task-dependency, exact-text preservation, and status-report quality/latency failures.
      The earlier streaming run scored 52/52 but failed latency. Retain every scorecard.

## Ordered implementation work

### 1. Resolve the regression gate failures — in progress

- [x] Repair the budget-cap assertion so missing actual spend is not treated as a missing cap.
      Cover both real false-absence claims and legitimate unknowns.
- [ ] Make status grounding reliable across repetitions. The streaming run passed all three;
      the subsequent run's judge rejected an unbounded "No evidence that work has begun" claim.
- [ ] Investigate provider stalls and read/persistence delays; retain strict timing thresholds.
- [x] Run the complete three-repetition gate and preserve its scorecard.
- [x] Supply actual calendar result payloads to the quality judge; test evidence preservation.
- [x] Repair the reproduced startup subscription race: concurrent initial updates share one
      channel setup, with an independent callback deadline. The installed-SDK reproduction
      and 129 focused worker tests pass. See the [startup-stall report](../../../../../docs/technical/reviews/DJFLOW_STARTUP_STALL_2026-09-12.md)
      for the full gate and browser replay evidence.
- [ ] Resolve the later gate's incomplete dependency review and model-authored `&amp;`
      replacement in a verbatim document. Keep the literal-preservation assertion unchanged.
- [x] Verify estimate edits avoid correction loops in the full gate.
- [ ] Stabilize unknown-status wording and status-report read counts; the subsequent run
      still exceeded the eight-read limit once.
- [ ] Profile and reduce the serial mutation/delivery round trips exposed by the next run:
      document edits completed correctly in 36.5s, 32.2s, and 30.3s against the unchanged 30s limit.
      Separate effect reserve/begin, adapter execution, reconciliation, receipt persistence, and
      result publication timings before combining transactions. Preserve lost-response recovery
      and stale-worker fencing; provider time alone does not account for the delay.
- [x] Preserve a narrow QA timing diagnostic. The same document edit took 23.6s and the
      status report 17.6s in that run; this does not replace the failed full gate. The document edit
      made 63 worker REST requests with its turn ID, including 14 semantic writes and 17 delivery
      acknowledgements. The status report made 75. These counts omit untagged requests; concurrent
      request durations must not be added as if they were wall-clock delay. Investigate delivery
      acknowledgement scheduling without weakening the durable-delivery contract.

### 2. Stream the synthesized answer — implemented; full gate remains failed

- [x] Forward final-answer text while the editor generates it; keep the two specialist contexts separate.
- [x] Preserve truthful partial/error/cancel states; do not replay synthesis after visible text.
- [x] Verify first answer text arrives before synthesis finishes, including over the real transport.
      Record time to first server progress, first findings, first answer text, and completion separately.

Live check: first progress 5.21s, first specialist findings 18.91s, first answer text 27.18s, synthesis complete 32.43s,
terminal 33.73s. Both reports saved and project/eight domain tables unchanged.
These are one-run observations, not latency guarantees. The focused change-set suites
passed 207 tests and worker typecheck. Evidence: `output/workflow-prototype/smoke.json`;
the earlier buffered run is preserved in `output/workflow-prototype-buffered-baseline-2026-09-12`.
Full-run evidence: `output/agentic-gate/djflow-streaming-2026-09-12`.
Diagnostic evidence: `output/agentic-gate/djflow-timing-profile-2026-09-12/timing-analysis.json`.

### 2b. Complete bounded reviews and valid prompt snapshots — done (Task 83, 2026-09-14)

- [x] Classify the reviewer "response limit" from real usage. It was hidden reasoning
      consuming the cap (3,200 completion, 2,605 reasoning), not parsing or timeout.
- [x] Bounded JSON role reports, accepted only when findings cite supplied records.
      Caps are 1,200 / 4,000 / 4,000 / 3,200, inside the 4,000 acting client ceiling.
- [x] One compact retry per specialist for truncated or invalid reports, only when
      75 s of budget remain. Otherwise the review is labeled partial.
- [x] Repair the workflow prompt snapshot: migration `20260914165546` adds a fenced
      workflow branch to v3. Applied to the isolated QA database only.
- [x] Live prewarmed replay `1bbcc9d0` (QA):
    - both specialists completed, as did the snapshot and the terminal step;
    - domain rows unchanged;
    - 16.8 s from admission to terminal (one run; different upstream);
    - $0.0114.
- [x] Durable workflow contract frozen; v4 storage, dispatch ledger, recovery and readers built with writers off; QA migrations applied (85, 2026-09-14).
- [ ] Production migrations before any deploy (85). Full gate and a live intentional
      partial review (89).

Evidence: [Task 83 receipt](../../../../../docs/technical/reviews/CHAT_WORKFLOW_TASK83_BOUNDED_REVIEWS_2026-09-14.md).

### 3. Make chat submission lightweight and expose preparation progress

- [ ] Add a versioned worker-owned request contract for the explicitly enabled text/project workflow.
      Current input artifacts are v3 with v2 readers: assign a new version from that baseline.
- [ ] Atomically save the user request and queue job, preserving authorization, deduplication,
      limits, and immutable request identity.
- [ ] Let the worker gather context and prepare model input after acceptance, eliminating the
      duplicate web preparation for this supported path.
- [ ] Publish truthful queued/context progress before model work. Measure acknowledgement
      latency; no promised subsecond SLA until measured.
- [ ] Prove duplicate send, context-load failure, cancellation, and crash before context attachment.

### 4. Make individual steps recoverable

- [ ] Persist step claims, accepted results, context identity, and bounded attempts.
- [ ] Fence stale workers and reuse completed steps after restart.
- [ ] Record physical provider dispatches and preserve uncertain charges; enforce durable budgets.
- [ ] Checkpoint accepted synthesis and reconcile streamed partial text without a duplicate final answer.
- [ ] Kill/restart the real worker after one specialist completes and prove it is not rerun.

### 5. Bring the experience into ordinary project chat

- [ ] Add a clear internal-cohort review entry in ordinary chat; remove the need to type `/workflow`.
- [ ] Keep one conversation with compact progress and expandable findings.
- [ ] Preserve ordinary-chat behavior and explicitly scoped permissions for each turn.
- [ ] Compare usefulness, latency, and cost against matched single-agent requests.

## Completion rule

Each runtime change set gets focused tests and the required `pnpm agentic:gate` before
the next is stacked. Update this list with evidence, not just implementation status.
No production rollout, autonomous writes, or web-research capability is part of this batch.

## Boundaries established by the implementation audit

- **Streaming:** the delivery publisher already batches text with backpressure. Forward only
  final synthesis through that path; planner output and specialist drafts remain internal until
  their reports are accepted. A cancelled or incomplete synthesis must never mark the answer
  step complete, and visible text must not trigger an automatic replay in the same generation.
- **Admission:** `create_agentic_chat_turn_with_job` and the worker input loader both require
  a prepared artifact today. Change the versioned contract and database validation together.
  Preserve the user/session locks, duplicate-before-capacity behavior, and frozen history.
- **Recovery:** current SQL permits retries only before execution starts. Add an explicit
  persisted read-only workflow policy, not a general relaxation for all chat turns. Current
  stale-job detection defaults to seven minutes and each invocation has a five-minute provider
  budget. The current QA recovery function uses artifact retention for expiry; an older migration's
  five-minute queue-residence rule was replaced. Set an explicit total workflow lifetime and
  recovery delay rather than confusing these three clocks.
- **Ownership:** checkpoint acceptance must verify the current processing token and execution
  generation, including cancellation. A late response from a replaced worker cannot overwrite
  an accepted result. Reuse the same frozen context for all resumed steps.
- **Spend:** reserve every physical provider dispatch, including fallbacks. A crash can leave
  a charge uncertain even when no result was saved; keep that exposure against the budget.
- **Ordinary chat:** bind review intent to one immutable submitted turn. The server's cohort
  and capability policy remains authoritative; a button or a browser flag cannot grant access.
