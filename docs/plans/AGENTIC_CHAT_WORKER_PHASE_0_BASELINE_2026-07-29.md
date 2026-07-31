<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_BASELINE_2026-07-29.md -->

# Agentic Chat Worker Migration: Phase 0 Baseline

**Captured:** 2026-07-29T20:13:33Z

**Git baseline:** `main` at `b326aa74b`

**Hosted quality tree:** `d807d05ed1555a13d0984fc23a32e9b885f2386b`

**Phase 0 closure tree:** `0f63e47bbafc4e58d85b360b1edb1ef8d0fe3fb5` (tree `6e3f1b451e7920478f54fa36dddbb79dc68e7c83`)

**Status:** Local deterministic baseline, production preflight, and clean retry-free hosted timing/quality gate complete. Operator evidence is ready for final independent re-acceptance.

## Repository baseline

The audit was performed with an already-dirty worktree. Existing user changes were preserved. In particular, the agentic E2E harness, book-writing scenario, `apps/web/package.json`, and generated database timestamp already had changes before this Phase 0 work.

**Freeze validity (independent-audit F14, resolved 2026-07-30):** the initial local measurements were taken over staged changes and therefore did not describe the named commit `b326aa74b`. The hosted battery below replaced that ambiguous freeze with an isolated-worktree run at exact commit `d807d05ed1555a13d0984fc23a32e9b885f2386b`. The new Phase 0 evidence capture also refuses a dirty tree and records `HEAD` plus its tree object before hosted work begins.

Current implementation dimensions:

- Live stream route: 4,542 lines.
- Stream orchestrator entrypoint: 2,232 lines.
- Browser stream controller: 947 lines.
- SSE event handler: 786 lines.
- Current legacy turn wall clock: 285 seconds.
- Current cancel watcher interval: 750 ms per active web request.
- Current prepared-prompt client send wait: 250 ms.
- Current history lookback: 10 messages, compression threshold 8, compressed tail 4.
- General production worker queue: 5-second polling, batch size 10, generic stalled timeout 10 minutes.

## Local web baseline

Command:

```bash
pnpm --filter @buildos/web exec vitest run \
  src/lib/services/agentic-chat-v2 \
  src/routes/api/agent/v2/stream/server.test.ts \
  src/routes/api/agent/v2/prewarm/server.test.ts \
  src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts \
  src/lib/components/agent/agent-chat-sse-handler.test.ts \
  src/lib/components/agent/agent-chat-prewarm.svelte.test.ts
```

Result:

```text
Test Files  73 passed (73)
Tests       784 passed (784)
Duration    13.71s
```

This covers the route, request normalization, context/history/prepared prompts, model/tool orchestration, supervisor/checkpoints, cancellation classification, observability, event protocol, controller, SSE handler, and prewarm behavior without calling a live provider.

The Svelte 5 analyzer was also run on `agent-chat-stream-controller.svelte.ts`; it returned no actionable findings.

## Local worker queue baseline

Command:

```bash
pnpm --filter @buildos/worker exec vitest run \
  tests/queueContracts.test.ts \
  tests/queueHealthAndAlerts.test.ts \
  tests/queueCorrelation.test.ts \
  tests/supabaseQueueDrain.test.ts \
  tests/supabaseQueueErrorClassification.test.ts \
  tests/supabaseQueueRefill.test.ts
```

Result:

```text
Test Files  6 passed (6)
Tests       47 passed (47)
Duration    755ms
```

The baseline proves processing-token plumbing, correlation metadata, per-slot refill, drain behavior, health checks, and the current generic error classification. It also documents why chat needs an instance-specific policy: `SupabaseQueue` still reads module-global `queueConfig` for timeouts/retries and calls the generic `reset_stalled_jobs` RPC.

## Executable contract baseline

Command:

```bash
pnpm --filter @buildos/shared-types exec vitest run \
  src/agentic-chat-worker-contract.test.ts
pnpm --filter @buildos/shared-types typecheck
pnpm --filter @buildos/shared-types build
```

Result:

```text
Test Files  1 passed (1)
Tests       6 passed (6)
Typecheck   passed
Build       CJS, ESM, and declarations passed
```

The fixtures pin canonical admission and input-artifact SHA-256 values, immutable history copy/exclusion behavior, generation-aware event IDs, and the terminal-race decision table. The read-only schema/security inventory is captured in `supabase/tests/20260729000000_agentic_chat_worker_phase0.preflight.sql`. It executed successfully against a disposable minimal PostgreSQL catalog, including duplicate detection and privilege/policy/routine reporting. It was not run against the project database because the Docker-backed Supabase stack was unavailable.

## Local legacy parity fixture extension

Deterministic fixtures now pin:

- attachment-only durable display text and the flattened model-facing attachment context;
- the exact compressed history projection;
- qualifying research-call capture and the two-call floor;
- stated-future title/provenance plus stream-scoped idempotency replay;
- current-message exclusion/source isolation in the immutable input contract.

The full focused chat command was rerun with the research and stated-future service suites added:

```text
Test Files  75 passed (75)
Tests       809 passed (809)
Duration    7.96s
```

During the rerun, the stream route gained a concurrent living-workspace tool-profile call. Its existing test mock was updated to expose the new no-op test double; production route changes were left untouched.

## Current behavior that the migration must intentionally change

| Boundary                 | Current behavior                                                                                                 | Required migration behavior                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Legacy admission         | Running turn insert and user-message insert are separate; history is loaded between them.                        | One legacy transaction returns pre-message fallback history and creates/resolves turn + message. |
| Worker admission         | Does not exist.                                                                                                  | Duplicate-first transaction creates message + queued turn + immutable artifact + queue job.      |
| User-message idempotency | `turn:<client_turn_id>:user`; DB uniqueness is metadata-expression based.                                        | `chat-turn:<turn_run_id>:user`, created in admission.                                            |
| History                  | Reloaded from mutable recent messages or prepared row at request execution time.                                 | Exact normalized pre-message history is immutable and hashed at admission.                       |
| Prepared input           | Authenticated client may select/insert/update its row and execute cleanup.                                       | Server-only content, integrity checked and copied into immutable input.                          |
| Active guard             | Unique only for `status='running'`.                                                                              | Unique for queued + running, duplicate lookup first.                                             |
| Cancellation             | Session metadata hint plus process-local hint; no terminal CAS.                                                  | Durable signal, active worker abort, and one terminal finalizer.                                 |
| Supersede                | Waits no more than 120 ms for the hint request, aborts the local stream, and attempts replacement.               | Waits for durable terminal evidence; no fixed-delay admission.                                   |
| Event identity           | Stream-scoped sequence, no execution generation.                                                                 | Turn + generation + sequence identity and fenced progression.                                    |
| Reconciliation           | Session snapshot recovery after a transport break; no complete current-generation stream projection.             | One generation-consistent full snapshot plus independent durable-event cursor.                   |
| Terminal order           | Assistant message is awaited before `done`, but turn status/event persistence follows `done` in separate writes. | Message, terminal projection/event, and status commit together before terminal Broadcast.        |
| Worker retry             | Unknown errors remain generic transient; generic stalled jobs are reset.                                         | Exhaustive chat policy; no blind post-start or post-mutation replay.                             |
| Queue capacity           | All registered job types share one `batchSize`.                                                                  | Dedicated chat consumer and slots from the first real worker slice.                              |

## Paid hosted E2E baseline gate

The original local pass did not run `pnpm --filter @buildos/web test:agentic`. The harness explicitly:

- makes paid model and judge calls;
- writes to hosted Supabase under a dedicated test user;
- requires a separately running dev server and credentials;
- can mutate test projects before teardown.

The Phase 0 exit review requires the named gate scenarios to run at least three times each, with raw artifacts, pass/fail, model/provider attribution, cost, and timing retained:

| Required behavior                    | Scenario                                                                                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restraint/no-op and ambiguity        | `restraint-noop-and-ambiguity`                                                                                                                                                                                                                      |
| Multi-operation write turn           | `task-multi-update`                                                                                                                                                                                                                                 |
| Rescheduling                         | `task-reschedule-cold-reference`                                                                                                                                                                                                                    |
| Research answer finalization/capture | `research-turn-finalizes`, `research-log-readback`                                                                                                                                                                                                  |
| Forward carry                        | `task-complete-cold-reference` — stated-future path assertion added 2026-07-29 (ground-truth `onto_tasks.props` provenance: `source`/`source_stream_run_id`, per-turn idempotency, verbatim title, floor-must-fire when the model carries nothing). |
| Project organization                 | `project-organize`                                                                                                                                                                                                                                  |
| Cold context recovery                | `project-catchup-cold`                                                                                                                                                                                                                              |
| Long-form multi-turn continuity      | `book-writing-journey`                                                                                                                                                                                                                              |

The run must record admission, first event, first text, tool stages, assistant persistence, done, and end-to-end distributions. Mocked unit durations above are not performance evidence.

## Hosted quality baseline — RUN 2026-07-30

**Measured tree:** `d807d05ed1555a13d0984fc23a32e9b885f2386b` (`HEAD`), executed from an isolated git worktree at `/Users/djwayne/buildos-baseline-wt` on port 5199 so concurrent work in the main tree could not perturb the measurement. This resolves the F14 freeze objection: the baseline now names a tree anyone can return to, instead of a dirty working copy. Command: `AGENTIC_E2E_BASE_URL=http://127.0.0.1:5199 vitest run --config vitest.config.agentic.ts` (all scenarios, default retry policy). Wall clock 1766.7 s.

**Result: 11 of 14 live scenarios pass; 48 of 51 non-skipped tests pass.**

| Scenario                                       | Result          | Duration |
| ---------------------------------------------- | --------------- | -------- |
| `task-create`                                  | pass            | 24.1 s   |
| `document-create`                              | pass            | 24.6 s   |
| `document-edit-context`                        | pass (retry ×1) | 266.5 s  |
| `project-organize`                             | pass (retry ×1) | 266.5 s  |
| `task-complete-cold-reference` (forward carry) | pass            | 66.0 s   |
| `entity-resolution-misspelled`                 | pass            | 35.6 s   |
| `research-turn-finalizes`                      | pass            | 62.8 s   |
| `restraint-noop-and-ambiguity`                 | pass            | 27.1 s   |
| `task-multi-update`                            | pass            | 35.6 s   |
| `document-from-vague-description`              | pass            | 129.4 s  |
| `project-catchup-cold`                         | pass            | 46.1 s   |
| `task-reschedule-cold-reference`               | **FAIL**        | 138.8 s  |
| `research-log-readback`                        | **FAIL**        | 109.3 s  |
| `book-writing-journey`                         | **FAIL**        | 522.5 s  |

Notably, `project-organize` passes here — it was 0/3 before the seven-layer fix — and the newly added forward-carry stated-future assertion passes on its first hosted run.

### Failure classification

Two of the three failures are not product regressions. Classifying them matters more than the raw count, because an unexamined red row becomes a permanent excuse later.

1. **`task-reschedule-cold-reference` — instrument bug (date-fragile fixture), not a regression.** The model declined to write and asked a clarifying question instead: the task was _already_ due Friday July 31, and the scenario instructs "push it to Friday," so the model asked whether the user meant the following Friday. The fixture now derives a seed date that is always distinct from the requested Friday and has a focused regression test. The second-attempt "target task vanished" error is consistent with the cross-run cleanup collision described next.
2. **`research-log-readback` — likely harness isolation failure, but still requires hosted proof.** Assertion: `no "Research Log" document after 7 research calls. Deterministic capture did not run. Titles: []`. The harness previously let any concurrent process sweep every `AE2E` project owned by the shared test actor. Fixtures are now namespaced by process/run id, while broad cleanup requires a 24-hour age guard; focused cleanup tests pass. This directly explains an entire seeded project disappearing, but the research scenario remains unresolved until the retry-free three-run hosted cohort passes.
3. **`book-writing-journey` — expected at this tree.** Its supporting implementation is uncommitted work in progress (with P0s already identified by a separate review), so the scenario runs against code that is absent at `HEAD`. It reports four checkpoint failures plus one stream error event, including "durable book documents changed while the user was only comparing options" — a known P0 from that review, reproduced here. Excluded from the enforceable bar until that work lands.

**Enforceable Phase 4 bar from this run:** the 11 passing scenarios must still pass after the runtime extraction. `task-reschedule-cold-reference` and `research-log-readback` are quarantined only until the corrected retry-free gate cohort runs; `book-writing-journey` remains excluded until its supporting implementation lands.

### Timing distribution — capture state after the 2026-07-30 run

Correcting an earlier assumption recorded during setup: the SSE harness _measures_ per-turn milestones (`firstSseEventMs`, `ttftMs`, `terminalEventMs`, `responseHeadersMs`, `totalDurationMs` in `harness/sse-client.ts`), but nothing **persists or reports** them — this run produced no timing artifact. Per-scenario wall clock (above) is multi-turn and includes fixture setup, so it is not the per-milestone distribution the gate requires.

The Phase 0 capture is now implemented behind `AGENTIC_PHASE0_CAPTURE=true` and the `test:agentic:phase0-evidence` command. It retains client response/first-event/TTFT/done/end-to-end timing; the route's existing server timing summary (admission, first event/response, assistant persistence, finalization, total); tool execution durations; model/provider/cost attribution; terminal turn state; and per-table retained row/serialized-byte footprint. Prompt, message, tool, and event bodies are measured for byte size but are not written to the artifact.

The persistence footprint is a final-state parity baseline, not a claim about PostgreSQL statement frequency or WAL throughput. Phase 2's 100-turn fixture still owns statement, affected-row, payload-byte, flush-latency, and WAL/write-rate measurement.

This historical limitation was resolved by the 2026-07-31 closure run below. The `<= 250 ms` worker-overhead regression budget now has a measured legacy comparator, but remains unenforceable until a later phase measures the worker path on a matched workload.

## Hosted Phase 0 closure gate — PASS 2026-07-31

**Measured tree:** `0f63e47bbafc4e58d85b360b1edb1ef8d0fe3fb5`; tree object `6e3f1b451e7920478f54fa36dddbb79dc68e7c83`. The evidence runner recorded a clean repository and ran in an isolated worktree with Vitest retries disabled.

**Retained artifact:** `docs/plans/evidence/agentic_chat_worker_phase0_gate_2026-07-31_0f63e47bb.json`

**Result: 24/24 registered scenario executions passed; 30/30 turn assertions passed; all 30 turns reached terminal completion.** There were zero stream-error turns and zero capture-error turns. The run cost $0.13314743 in recorded provider/model usage.

| Scenario                         | Scenario executions | Turn assertions | Stream/capture errors |
| -------------------------------- | ------------------- | --------------- | --------------------- |
| `project-catchup-cold`           | 3/3                 | 3/3             | 0 / 0                 |
| `project-organize`               | 3/3                 | 3/3             | 0 / 0                 |
| `research-log-readback`          | 3/3                 | 6/6             | 0 / 0                 |
| `research-turn-finalizes`        | 3/3                 | 3/3             | 0 / 0                 |
| `restraint-noop-and-ambiguity`   | 3/3                 | 6/6             | 0 / 0                 |
| `task-complete-cold-reference`   | 3/3                 | 3/3             | 0 / 0                 |
| `task-multi-update`              | 3/3                 | 3/3             | 0 / 0                 |
| `task-reschedule-cold-reference` | 3/3                 | 3/3             | 0 / 0                 |

The closure work also corrected five defects exposed by the hosted cohorts: internal lifecycle failures now retain completed tool executions; generic-error paths retain reads/writes and timing; write-intent provider rotation no longer stops after one provider failure; exact research phrasing and judge failure handling are deterministic; metadata-only document updates no longer suppress stated-future carry; and the completion harness observes every pre-existing `START HERE` surface instead of assuming a single title.

### Measured legacy SSE timing and footprint

| Signal                             | p50           | p95            | Max            |
| ---------------------------------- | ------------- | -------------- | -------------- |
| Client response headers            | 240.439 ms    | 296.283 ms     | 297.444 ms     |
| Client first SSE event             | 240.529 ms    | 296.623 ms     | 298.354 ms     |
| Client time to first text          | 4,253.559 ms  | 16,681.192 ms  | 16,953.591 ms  |
| Client terminal event              | 30,407.668 ms | 170,696.101 ms | 244,809.574 ms |
| Client total duration              | 30,643.520 ms | 171,001.530 ms | 245,136.843 ms |
| Server admission                   | 96 ms         | 108 ms         | 113 ms         |
| Server first event                 | 2 ms          | 7 ms           | 8 ms           |
| Server first response              | 4,012 ms      | 16,448 ms      | 16,750 ms      |
| Server assistant persistence       | 232 ms        | 320 ms         | 472 ms         |
| Server finalization                | 2 ms          | 8 ms           | 8 ms           |
| Server total request               | 30,200 ms     | 170,454 ms     | 244,542 ms     |
| Tool execution (170 samples)       | 649 ms        | 3,963 ms       | 5,968 ms       |
| Retained persistence rows per turn | 38            | 105            | 107            |
| Retained serialized bytes per turn | 158,273       | 312,523        | 318,798        |

Provider time dominates first-text and total-turn latency and is tracked separately from BuildOS overhead. These measurements describe the legacy HTTP/SSE path. A future matched worker run must compare against them; they are not evidence that the worker already meets the `<= 250 ms` overhead budget. Likewise, retained rows/bytes are a final-state footprint, not PostgreSQL statement, affected-row, flush-latency, or WAL evidence. The Phase 2 load fixture still owns those measurements.

## Phase 0 status

| Deliverable                                                        | Status                                                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Fresh local deterministic baseline                                 | Complete                                                                                 |
| Route-owned behavior parity ledger                                 | Complete for Phase 0; final independent re-acceptance pending                            |
| Versioned command/event/snapshot/signal/transport/effect contracts | Executable revision .5 lock complete; final independent re-acceptance pending            |
| State transition, terminal race, retry, and rollback locks         | Initial complete                                                                         |
| Direct authenticated policy/caller inventory                       | Complete; production SELECT-only capture retained 2026-07-30                             |
| Named proving tests for all 12 audit corrections                   | Complete in parity ledger                                                                |
| Local P04/P12/P27/P28 legacy parity fixtures                       | Complete                                                                                 |
| P13 route-to-runtime exact-once legacy fixture                     | Complete                                                                                 |
| Paid hosted quality baseline                                       | Complete: clean retry-free closure gate at `0f63e47bb` passed 24/24                      |
| Production-like latency/persistence baseline                       | Complete for legacy-path timing and final-state footprint; Phase 2 WAL/rate work remains |
| Independent audit sign-off                                         | Re-audit run 2026-07-30; revision .5 closed both blockers; final re-acceptance pending   |

The operator-side baseline is complete. Phase 1 implementation should begin only after final independent acceptance or an explicit waiver. The safest first Phase 1 slice remains the service-only atomic legacy admission RPC plus differential history/message tests; it removes a known split-write correctness gap while keeping SSE as the only production transport.
