<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_17_PARITY_SCENARIO_REGISTRY_EVIDENCE_2026-08-07.md -->

# Phase 4 Slice 17 — Shared Parity Scenario Registry and Differential Runner (tasker/51 P0)

**Prepared:** 2026-08-07
**Status:** Complete and locally verified. All gates green; no deploy required (test/contract code only).
**Authority:** `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md` §Phase 4 (lines 857–886); `tasker/51-worker-behavioral-parity-phase4.md` P0.

## What this slice is

tasker/51 P0 asked for the "differential harness foundation." Recon showed the
foundation was already substantially built by Phase 4 Slices 1–10: the shared
normalizer and bounded JSON-pointer differ
(`packages/agentic-chat-runtime/src/parity.ts`), four golden fixtures, a legacy
adapter proof (`apps/web/src/routes/api/agent/v2/stream/server.test.ts` asserts
exact golden equality), and a worker adapter proof
(`apps/worker/tests/agenticChatFixtureTurnExecutor.test.ts` asserts an explicit
remaining-gap inventory against the same goldens).

What was missing — and what this slice adds — is the piece that keeps the two
sides from drifting apart:

1. **A shared scenario registry** —
   `packages/agentic-chat-runtime/src/parity-scenarios.ts`,
   `AGENTIC_CHAT_PARITY_SCENARIOS_V1`. All eight plan-mandated scenario classes
   (plan line 882) are registered: `success`, `read_only_tools`,
   `cancellation`, `provider_error` as **implemented** (golden + divergence
   contract), and `clarification`, `mutating_tools`, `supervisor_checkpoint`,
   `timeout` as **blocked**, each naming the tasker/51 work package that must
   land first.
2. **An in-code parity ledger per implemented scenario.** Each entry carries
   `workerDeliberateDivergencePrefixes` (today: exactly the golden's timing
   event — the ratified Slice 6 async-timing ownership split) and
   `workerOpenDivergences` — the exact path+kind inventory of open gaps
   (today: the worker `done` payload's extra `failure_code`/`status` fields on
   all four scenarios). Closing a gap must shrink this list in the same
   change; a new difference outside the list fails the worker suite.
3. **Shared evaluators replacing per-test partition logic.**
   `evaluateAgenticChatWorkerParityRunV1` (diff → partition → inventory match)
   and `evaluateAgenticChatLegacyParityRunV1` (exact equality). The worker
   suite's four hand-rolled prefix-filter blocks were replaced with evaluator
   calls; the provider-error scenario, previously asserted only structurally,
   is now pinned to the same exact inventory (verified empirically: its only
   contested gaps are the two done-event fields).
4. **Cross-side coverage guards.** Each adapter suite owns one
   `createAgenticChat{Worker,Legacy}ParityCoverageTrackerV1()`; every
   differential test evaluates through it, and a final test asserts
   `missing() === []`. Registering a new implemented scenario now fails BOTH
   adapter suites until each side exercises it — registry drift is
   structurally impossible.

## Corrections to tasker/51 premises (recorded so nobody relearns them)

- **"Build the runner + normalizer + first golden fixture" was stale.** The
  normalizer, differ, and four goldens existed (Slices 1–10). This slice built
  the registry/runner/coverage layer on top; it did not rebuild the harness.
- **`agentic_chat_prepared_history_divergence` is not existing material.** It
  is an aspirational test-group name from the Phase 0/1 parity ledger
  (`docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_PARITY_LEDGER_2026-07-29.md:120`)
  that never materialized as code. The divergence rule it names (prepared tail
  older than latest persisted message ⇒ prefer admission-window history) has
  **no staleness check** in
  `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-consumer.server.ts`
  — that is a genuine open P3 item, not a reusable asset.
- **The read-only scenario is not yet at exact parity.** Canary 11 proved the
  production shape live, but the fixture differential still carries the
  done-event gap inventory. The "known-equal" harness validation P0 wanted is
  the text-only scenario modulo the two ratified/registered divergence classes.

## Why no new goldens were authored this slice

The four blocked classes are owned by later work packages (P2 mutating, P4
supervisor/clarification, P6 timeout + full eight-class coverage) per
tasker/51's own slicing. A timeout golden authored today would have to be
captured from the legacy route test, which mocks `streamFastChat` — i.e. the
golden would encode a fabricated orchestrator outcome, not recorded legacy
behavior. That violates the campaign's audit-the-instrument rule, so the
registry records the blockage explicitly instead.

## Files changed

- `packages/agentic-chat-runtime/src/parity-scenarios.ts` — new (registry,
  partition, evaluators, coverage trackers).
- `packages/agentic-chat-runtime/src/parity-scenarios.test.ts` — new (11
  tests: registry integrity, blocked inventory, partition, stale-inventory
  enforcement — an exact golden match FAILS the worker contract until the
  open-divergence list shrinks — contested-drift rejection, blocked-scenario
  refusal, tracker mechanics).
- `packages/agentic-chat-runtime/src/index.ts` — export the new module.
- `apps/worker/tests/agenticChatFixtureTurnExecutor.test.ts` — four
  differential tests now evaluate through the shared worker tracker; new final
  coverage test (37 → 38 tests).
- `apps/web/src/routes/api/agent/v2/stream/server.test.ts` — four golden
  assertions now also evaluate through the shared legacy tracker; new final
  coverage test (39 → 40 tests).

## Gates

- `packages/agentic-chat-runtime`: 30/30 tests, `tsc --noEmit` clean.
- `apps/worker`: full suite 772 passed / 1 intentional skip; native TS7
  typecheck clean; lint (http-module size guard) clean.
- `apps/web`: `server.test.ts` 40/40; `svelte-check` 0 errors / 0 warnings.
- Prettier applied to all touched files.

## Exit-gate position after this slice (tasker/51 ledger)

| Scenario class | State | Referee |
| --- | --- | --- |
| success | Implemented; open gaps = done-event `failure_code`/`status` | registry inventory |
| read_only_tools | Implemented; same gap inventory | registry inventory |
| cancellation | Implemented; same gap inventory | registry inventory |
| provider_error | Implemented; contract tightened from structural to exact inventory | registry inventory |
| clarification | Blocked on P4 | registry `blockedOn` |
| mutating_tools | Blocked on P2 (legacy has no effect ledger — asymmetry must be ratified first) | registry `blockedOn` |
| supervisor_checkpoint | Blocked on P4 | registry `blockedOn` |
| timeout | Blocked on P6 (golden must be captured from real loop behavior, post-P1) | registry `blockedOn` |

Next slice: P1 (full read loop). The registry is the referee: P1's worker loop
runs must keep the four implemented scenarios inside their registered
inventories, and P1 should shrink the done-event gap or ratify it as a
deliberate contract split.
