<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_CLOSURE_CHECKLIST_2026-07-30.md -->

# Agentic Chat Worker Migration: Phase 0 Closure Checklist

**Date:** 2026-07-30

**Status:** Local capture implementation complete. Paid three-run gate and final independent acceptance not yet run.

**Decision:** Do not begin Phase 1 implementation until every remaining gate below is accepted or explicitly waived.

## Authoritative current state

| Gate                                | State                        | Evidence / next proof                                                                                          |
| ----------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Executable contract revision .5     | Complete locally             | `@buildos/shared-types` suite: 2 files / 13 tests                                                              |
| Original independent audit findings | Corrections incorporated     | F1–F23 are mapped through revisions .4/.5; final .5 re-acceptance is still missing                             |
| Target-database preflight           | Complete                     | `evidence/agentic_chat_worker_phase0_preflight_prod_2026-07-30.json`; all four duplicate probes zero           |
| Exact-tree hosted quality battery   | Complete as first sample     | Commit `d807d05ed`; 11/14 live scenarios passed                                                                |
| F14 enforceable tree identity       | Complete                     | The hosted run used an isolated worktree at exact `HEAD`                                                       |
| Date-stable reschedule fixture      | Complete locally             | Seed date is always distinct from requested Friday; focused regression test passes                             |
| Concurrent harness isolation        | Complete locally             | Per-run fixture prefix plus 24-hour stale sweep; focused cleanup tests pass                                    |
| Retained timing/persistence capture | Complete locally, unmeasured | `phase0/evidence-report.ts` plus `test:agentic:phase0-evidence`                                                |
| Three-sample hosted gate            | **Pending**                  | Run the eight gate scenarios three times, retry-free, from one clean exact tree                                |
| `research-log-readback` disposition | **Pending hosted proof**     | The disappearing-project failure is explained by the fixed cross-run sweep, but must pass the corrected cohort |
| Final independent audit acceptance  | **Pending**                  | Fresh-context review of revision .5, this checklist, and the retained gate artifact                            |

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

## Local proof completed

```text
Agentic focused tests: 6 files / 26 tests passed
Phase A harness typecheck: passed
Paid model calls: none
Hosted database writes: none
```

The focused set covers timing extraction, payload-free event timing, evidence aggregation, pre-release evidence ordering, fixture run isolation, and date-stable rescheduling.

## Paid gate handoff

Run only after the capture/harness changes are committed to an exact tree and checked out in a clean isolated worktree. Start the dev server from that same worktree. The evidence process fails before authentication/model/database work if its own checkout is dirty.

From the isolated worktree:

```bash
AGENTIC_E2E_BASE_URL=http://127.0.0.1:5199 \
AGENTIC_PHASE0_OUTPUT_PATH=/Users/djwayne/buildos-platform/docs/plans/evidence/agentic_chat_worker_phase0_gate_2026-07-30.json \
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

The command spends provider/judge money and writes disposable fixtures to hosted Supabase. It has intentionally not been run during the local implementation pass.

## Acceptance checks for the artifact

- Repository state is clean, and the recorded commit/tree matches the dev server checkout.
- All eight scenarios have three fresh, retry-free executions; skipped or retried results do not count.
- Every streamed turn has a server timing summary, terminal `chat_turn_runs` state, and stream-correlated model usage.
- The artifact has zero capture-error turns.
- No required pass becomes a failure; `task-reschedule-cold-reference` and `research-log-readback` pass the corrected cohort.
- Model/provider/profile and cost are recorded for every turn that invokes a model.
- Client and server timing summaries have usable sample counts for the later worker-overhead comparison.
- Retained persistence footprint is present for every turn; its documented limitation remains attached.

## After the paid gate

1. Attach the artifact result and any failure classification to the baseline and parity ledger.
2. Commission a fresh-context independent re-audit of contract revision .5, the parity ledger, preflight, and gate artifact.
3. If accepted, mark Phase 0 closed.
4. Begin Phase 1 with `admit_legacy_agentic_chat_turn(...)` plus differential pre-message history and exactly-one-message/turn tests. Do not start the worker transport in that slice.

## Parallel security track

The production preflight confirmed the audit's `queue_jobs`/`add_queue_job` exposure. Main now contains the RLS migration and server-client caller changes that revoke authenticated queue inserts, but deployment verification and the future `agentic_chat_turn` non-service guard remain a separate security/Phase 2 checkpoint. Phase 0 closure does not silently declare that production hardening deployed.
