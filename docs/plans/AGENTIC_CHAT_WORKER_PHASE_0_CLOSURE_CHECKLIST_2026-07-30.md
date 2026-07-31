<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_CLOSURE_CHECKLIST_2026-07-30.md -->

# Agentic Chat Worker Migration: Phase 0 Closure Checklist

**Date:** 2026-07-30 (updated 2026-07-31)

**Status:** Operator evidence complete. The clean, retry-free, three-sample hosted gate passed; final independent acceptance has not yet been recorded.

**Decision:** Do not begin Phase 1 implementation until every remaining gate below is accepted or explicitly waived.

## Authoritative current state

| Gate                                | State                      | Evidence / next proof                                                                                                           |
| ----------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Executable contract revision .5     | Complete locally           | `@buildos/shared-types` suite: 2 files / 13 tests                                                                               |
| Original independent audit findings | Corrections incorporated   | F1–F23 are mapped through revisions .4/.5; final .5 re-acceptance is still missing                                              |
| Target-database preflight           | Complete                   | `evidence/agentic_chat_worker_phase0_preflight_prod_2026-07-30.json`; all four duplicate probes zero                            |
| Exact-tree hosted quality battery   | Complete                   | Historical sample at `d807d05ed` (11/14), superseded for the gate by the clean `0f63e47bb` run (24/24)                          |
| F14 enforceable tree identity       | Complete                   | Final gate recorded clean `HEAD` `0f63e47bbafc4e58d85b360b1edb1ef8d0fe3fb5` and tree `6e3f1b451e7920478f54fa36dddbb79dc68e7c83` |
| Date-stable reschedule fixture      | Complete and hosted-proven | All three retry-free reschedule repetitions passed                                                                              |
| Concurrent harness isolation        | Complete and hosted-proven | Per-run fixture prefix plus 24-hour stale sweep; research readback passed 3/3                                                   |
| Retained timing/persistence capture | Complete and measured      | Final artifact contains client/server timing, 170 tool samples, terminal state, cost, and retained row/byte footprint           |
| Three-sample hosted gate            | **Complete**               | Eight scenarios × three repetitions: 24/24 scenarios and 30/30 turn assertions passed, with retries disabled                    |
| `research-log-readback` disposition | **Complete**               | Three scenarios / six turns passed with zero stream or capture errors                                                           |
| Final independent audit acceptance  | **Pending**                | Fresh-context review of revision .5, this checklist, the evidence chain, and the final gate artifact                            |

`book-writing-journey` is not part of the enforceable Phase 0 gate while its separately reviewed implementation remains in progress. That deferral must be visible to the final auditor; it is not counted as a silent pass.

## Capture contract

The paid gate artifact is schema `1`, contract family `agentic_chat_worker_v1`. It records, per turn:

- exact repository `HEAD`, tree object, branch, and clean/dirty status before hosted work;
- scenario, repetition, turn index, durable stream/session/client identities, assertion result, and terminal state;
- client response headers, first SSE event, first text, done, and end-to-end timing;
- server admission, first event/response, assistant persistence, finalization, and total timing from the existing `timing` SSE event;
- payload-free SSE arrival metadata for tool-stage timing;
- tool name/op/success/duration without arguments or results;
- model, provider, profile, token, and cost attribution;
- final retained row counts and serialized byte size for the legacy chat persistence tables.

The artifact deliberately does not retain prompt, message, event-payload, tool-argument, or tool-result bodies. Serialized byte size is calculated in memory, and only the resulting numeric size is retained.

The retained-row footprint is a Phase 4 parity comparator. It is not a PostgreSQL statement-frequency or WAL-throughput claim. Phase 2's 100-turn fixture still owns statements, affected rows, flush latency, and WAL/write-rate evidence.

## Local and hosted proof completed

```text
Agentic focused tests: 6 files / 26 tests passed
Phase A harness typecheck: passed
Final hosted gate: 24/24 scenarios; 30/30 turn assertions; 30/30 terminal completions
Final hosted gate errors: 0 stream; 0 capture
Final hosted gate model cost: $0.13314743
```

The focused set covers timing extraction, payload-free event timing, evidence aggregation, pre-release evidence ordering, fixture run isolation, and date-stable rescheduling.

## Paid gate result — 2026-07-31

The registered cohort ran from an isolated, clean worktree with Vitest retries disabled. The retained artifact is:

`docs/plans/evidence/agentic_chat_worker_phase0_gate_2026-07-31_0f63e47bb.json`

Repository identity:

- `HEAD`: `0f63e47bbafc4e58d85b360b1edb1ef8d0fe3fb5`
- tree: `6e3f1b451e7920478f54fa36dddbb79dc68e7c83`
- repository dirty: `false`

Gate outcome:

- 24/24 scenario executions passed across the eight registered scenarios and three repetitions;
- 30/30 turn assertions passed and all 30 turns reached terminal completion;
- zero stream-error turns and zero capture-error turns;
- 170 tool-execution samples, with p50 649 ms, p95 3,963 ms, and max 5,968 ms;
- final hosted model cost: $0.13314743.

Legacy SSE client timing was response headers p95 296.283 ms, first SSE event p95 296.623 ms, TTFT p95 16,681.192 ms, terminal event p95 170,696.101 ms, and total duration p95 171,001.530 ms. Server timing was admission p95 108 ms, first event p95 7 ms, first response p95 16,448 ms, assistant persistence p95 320 ms, finalization p95 8 ms, and total request p95 170,454 ms. Retained footprint was p95 105 rows and 312,523 serialized bytes per turn.

These are legacy-path baselines, not worker measurements. The `<= 250 ms` worker-overhead threshold remains a later differential comparison, and the retained footprint does not substitute for the Phase 2 WAL/statement-rate load fixture.

### Reproduction command

The evidence process fails before authentication/model/database work if its checkout is dirty. From the isolated worktree and matching server checkout:

From the isolated worktree:

```bash
AGENTIC_E2E_BASE_URL=http://127.0.0.1:5199 \
AGENTIC_PHASE0_OUTPUT_PATH=/Users/djwayne/buildos-platform/docs/plans/evidence/agentic_chat_worker_phase0_gate_<date>_<short-head>.json \
pnpm --filter @buildos/web test:agentic:phase0-evidence
```

The command runs these eight scenarios three times each with Vitest retries disabled:

1. `restraint-noop-and-ambiguity`
2. `task-multi-update`
3. `task-reschedule-cold-reference`
4. `research-turn-finalizes`
5. `research-log-readback`
6. `task-complete-cold-reference`
7. `project-organize`
8. `project-catchup-cold`

The command spends provider/judge money and writes disposable fixtures to hosted Supabase.

## Acceptance checks for the artifact

- Repository state is clean, and the recorded commit/tree matches the dev server checkout.
- All eight scenarios have three fresh, retry-free executions; skipped or retried results do not count.
- Every streamed turn has a server timing summary, terminal `chat_turn_runs` state, and stream-correlated model usage.
- The artifact has zero capture-error turns.
- No required pass becomes a failure; `task-reschedule-cold-reference` and `research-log-readback` pass the corrected cohort.
- Model/provider/profile and cost are recorded for every turn that invokes a model.
- Client and server timing summaries have usable sample counts for the later worker-overhead comparison.
- Retained persistence footprint is present for every turn; its documented limitation remains attached.

## Independent re-audit handoff

1. Commission a fresh-context independent re-audit of contract revision .5, the parity ledger, production preflight, correction evidence chain, and final gate artifact.
2. Record the auditor's explicit acceptance, rejection, or waiver. Operator evidence alone does not satisfy this gate.
3. If accepted, mark Phase 0 closed.
4. Only then begin Phase 1 with `admit_legacy_agentic_chat_turn(...)` plus differential pre-message history and exactly-one-message/turn tests. Do not start the worker transport in that slice.

## Parallel security track

The production preflight confirmed the audit's `queue_jobs`/`add_queue_job` exposure. Main now contains the RLS migration and server-client caller changes that revoke authenticated queue inserts, but deployment verification and the future `agentic_chat_turn` non-service guard remain a separate security/Phase 2 checkpoint. Phase 0 closure does not silently declare that production hardening deployed.
