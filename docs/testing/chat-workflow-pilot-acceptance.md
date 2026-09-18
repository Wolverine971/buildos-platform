<!-- docs/testing/chat-workflow-pilot-acceptance.md -->

# Chat workflow pilot acceptance

Status: implementation in progress; **not accepted**. This document is the Tasker
89 evidence index and test plan. Rows become accepted only from retained integrated
evidence produced by the source identity recorded for that run.

**Task 90 closeout (September 14):** DJ closed the testing handoff after the focused
repair batch and deferred calendar work. The batch passed 371 distinct focused
worker tests; the final selected diagnostic passed 12/12 turns, with a manual
grounding concern the judge missed. The [closeout](../technical/reviews/CHAT_WORKFLOW_TASK90_CLOSEOUT_2026-09-14.md)
transfers grounding follow-up to 82 and acceptance evidence to 89. Closing the
tracker does not accept the pilot or trigger another full gate.

**Last complete stabilization receipt (September 14):** Task 90's authorized isolated
three-repetition gate failed at **45/52**. Cases 2/4 and Case 14 time/read limits
pass, but Case 8 latency and Case 9/10/14 content/quality failures keep 82/84 open.
Web, worker, and final snapshot provenance match. See the
[complete result and next repair steps](../technical/reviews/CHAT_WORKFLOW_TASK90_GATE_RESULT_2026-09-14.md).
This does not accept any later pilot/browser/restart requirement below.

## Integration baseline

The initial coordinator receipt is
[`artifacts/chat-workflow-program-baseline-2026-09-12.md`](../../artifacts/chat-workflow-program-baseline-2026-09-12.md).
It records HEAD `c324762250e8c9546d63cf1dada4b6c885d36974`, executable dirty-tree SHA-256
`79e3613c2cb2ca0d2c7176476fab884e560bba53c2adec2dffe134f82a55fb3f`,
the selected path manifest, and the package ownership lock. Each full gate or live
run must record a fresh provenance value; the baseline hash is not expected to stay
constant after implementation.

The retained 44/52 gate and partial browser replay remain failures/partial evidence:

- `output/agentic-gate/djflow-subscription-race-2026-09-12/`
- `output/workflow-startup-stall-2026-09-12/`
- `output/agentic-gate/djflow-timing-profile-2026-09-12/`

No later focused test may rewrite those outcomes.

## Stabilization run 1 — failed

The first integrated Tasker 82/84 gate is retained at
`output/agentic-gate/chat-workflow-stabilization-2026-09-13/`. It executed all 13
cases three times and scored **49/52**, so it is not an acceptance receipt.

- Expected service/source dirty hash:
  `5a036aa7fa1b886f1f1ef4fc55f6f285659b325563877e1903b4ee333ce6818e`.
- Final checkout dirty hash:
  `f98b4a883d9a4ae5abd5bcdac2dbeb34c09b0935f62704955cf7b747dec17447`.
  The content delta was the generated timestamp in
  `packages/shared-types/src/database.schema.ts`; it was restored after capture.
- Case 8 scored 3/4: one repetition lost an `onto_events` evidence snapshot to
  `TypeError: fetch failed`; another took 504,229 ms client-side after an
  approximately eight-minute pre-admission stall, although its admitted server
  path completed in about 19.5 seconds.
- Case 10 scored 2/4: one answer swapped source attribution between the empty
  user-scope read and the populated project-scope read.

The calendar response contract now echoes a normalized `query_scope` and the
prompt says calendar events/coverage cannot move between scopes. Focused evidence
passes 34 shared calendar tests, 16 worker calendar-port tests, 64 prompt/budget
tests, and zero runtime/worker/web test-type debt. A stable-source full rerun is
still mandatory.

The retained three-repetition Case 10 diagnostic at
`output/agentic-gate/chat-workflow-case10-diagnostic-2026-09-13/` scored **4/4**
with three `end_to_end_pass` results, 3/4/3 tool calls, and durations of 25,080 ms,
25,375 ms, and 20,580 ms. Web, worker, and final checkout provenance all matched
`2a51772a48e63d32aeeafe5222cce539edcd864dab21b8e320b2f5c9bc3df434`.
Its gate status remains `failed` by design because a one-case diagnostic is not
the complete release battery; it validates the repair but cannot accept the row.

Tasker 84's deterministic delivery proof is recorded in
[`CHAT_WORKFLOW_DELIVERY_STABILIZATION_2026-09-13.md`](../technical/reviews/CHAT_WORKFLOW_DELIVERY_STABILIZATION_2026-09-13.md).
The integrated publisher/executor/health suite passes 122/122, including durable
progress advancing while Broadcast/ACK is gated and the `newer_snapshot`
reconciliation behavior. This focused proof does not override the failed full
gate.

## Acceptance matrix

| Journey or cut                               | Required durable oracle                                                                      | Current status                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Stabilized ordinary chat                     | 52/52, all repetitions and timing/read thresholds, matching provenance                       | Failed run 1: 49/52; repaired, rerun pending |
| Complete and bounded prepared review         | Two accepted role reports, valid prewarm snapshot, incremental editor text, one final answer | Pending 83                                   |
| Duplicate or changed raw Send                | One request/message/turn/job; changed immutable payload conflicts                            | Pending 85/86                                |
| Context timeout or access revocation         | Bounded terminal result; no unauthorized context or dispatch                                 | Pending 85/86                                |
| Slow/missing subscription, broadcast, or ACK | Durable acceptance advances computation; reconnect is ordered; memory is bounded             | Focused 122/122; full gate pending           |
| Kill after an accepted specialist            | Frozen context/result reused; completed step has no second dispatch                          | Pending 85/87 real restart                   |
| Kill during a provider dispatch              | Reservation remains charged or uncertain; retry cannot reset limits                          | Pending 85/87                                |
| Duplicate delivery or late old worker        | One accepted result/terminal outcome; stale generation loses                                 | Pending 85/87                                |
| Stop in context/specialist/synthesis         | Future dispatch and commits fenced; incurred exposure retained; one terminal state           | Pending 86/87/88                             |
| Disconnect, remount, and reconnect           | Durable progress/text restore exactly once                                                   | Pending 84/87/88                             |
| Stream cut or lost terminal response         | Accepted text reconciles without regenerated appended answer                                 | Pending 85/87/88                             |
| Truncation, failure, or no evidence          | Honest partial/failure with named missing coverage                                           | Pending 83/87/88                             |
| Reservation race, fallback, exhaustion       | Every physical attempt counted; cap/headroom enforced; uncertain exposure survives           | Pending 85/87                                |
| Ordinary and unsupported inputs              | Existing lane unchanged; review intent is not sticky; mutation recovery is not widened       | Pending 82/86/88                             |
| Read-only/cohort boundary                    | Zero domain writes/tools; server-owned cohort and per-turn policy                            | Pending integrated proof                     |

## Deterministic fault boundaries

Tests should pause at accepted durable operations, not at arbitrary elapsed sleeps:

1. raw request transaction committed;
2. prepared-context checkpoint committed;
3. physical dispatch reservation committed;
4. specialist result plus progress committed;
5. synthesis text/checkpoint committed;
6. terminal state committed before its caller receives the response.

Test-only hooks must be disabled by default, unavailable from browser input, and
must not weaken the production owner/generation/cancellation checks. Fault fixtures
record the turn ID, request/context/plan hashes, execution generation, step attempt,
dispatch identity, durable sequence, and before/after domain row hashes. They must
not retain private prompt content in this public document.

## Required timing and cost record

Every browser/restart sample records separate clocks for click, request arrival,
durable admission, queue claim, context start/end, first durable and first visible
progress, first accepted findings, first visible answer text, synthesis end, terminal
commit, and visible terminal state. Restart samples also record process death, stale
detection, requeue, reclaim, and completion. Overlapping call durations are not
summed into elapsed latency.

Three matched workflow/ordinary pairs use equivalent seeded snapshots, question,
and model configuration. Report individual samples plus median/range for grounded
coverage, useful actions, unknowns, latency, and total physical-provider cost.
Unpriced or uncertain exposure stays visible.

## Full-gate protocol

Use the private `AGENTIC_GATE_ENV_FILE` and the isolated database described in
[`agentic-chat-gate.md`](./agentic-chat-gate.md). Identify any worker attached to
that database before stopping only that process. Rebuild through the existing gate
runner, run one gate at a time, preserve all raw output, and require all expected
turns, 13 cases, three repetitions, 52/52, matching web/worker provenance, Case 2
under 60 seconds, Cases 4 and 8 under 30 seconds, and Case 14 under 40 seconds with
at most eight tool calls.

A missing database/calendar prerequisite, skipped scenario, stale executable source,
capture failure, or resource-gate refusal is a failed/blocked run, never acceptance.

## Manual acceptance script

This becomes executable only after packages 85–88 are integrated and the internal
cohort is enabled:

1. Open a project chat and choose **Review project**.
2. Send a project question without `/workflow`; observe Sending, Queued, preparation,
   two bounded investigations, incremental answer text, and terminal truth.
3. Expand accepted findings and confirm any coverage gaps agree with the saved answer.
4. Start a second review and Stop it; confirm one cancelled terminal state and no
   active Stop control afterward.
5. Refresh or switch sessions during a review; confirm progress and answer restore
   exactly once.
6. Run the documented worker-kill boundary after one specialist is accepted; restart
   and confirm that specialist is not dispatched again.

Workflow Lab remains the diagnostic path until final acceptance. No row in this
document authorizes production rollout, web research, domain writes, or broader
autonomous execution.

## Rollback order

Readers and recovery support deploy before writers. To roll back, stop new raw
workflow admissions first while retaining compatible v4 readers and recovery for
accepted work until it drains or is explicitly terminalized. Do not route an
in-progress workflow into ordinary execution. The existing v2/v3 prepared path and
ordinary mutation-recovery rules remain intact.
