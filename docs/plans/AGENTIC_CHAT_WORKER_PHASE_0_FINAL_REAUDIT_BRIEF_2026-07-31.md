<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_FINAL_REAUDIT_BRIEF_2026-07-31.md -->

# Agentic Chat Worker Migration: Phase 0 Final Re-audit Brief

**Prepared:** 2026-07-31

**Status:** Ready for a fresh-context independent reviewer. This brief is an operator handoff, not an acceptance verdict.

**Decision boundary:** Phase 0 remains open and Phase 1 remains unstarted until an independent reviewer records `ACCEPT`, `REJECT`, or an explicit waiver against the exit gate.

## Review anchors

- Merged local `main` at handoff preparation: `826527a9133e4ad90017719152efcf0d4361d992`.
- Phase 0 operator package commit: `5fb3af45380d2e968a0622e85aedca325c25dd53`.
- Exact source commit exercised by the decisive hosted gate: `0f63e47bbafc4e58d85b360b1edb1ef8d0fe3fb5`.
- Exact exercised tree: `6e3f1b451e7920478f54fa36dddbb79dc68e7c83`.
- Decisive artifact: `docs/plans/evidence/agentic_chat_worker_phase0_gate_2026-07-31_0f63e47bb.json`.
- Artifact SHA-256: `894adc1541ce4753966b43a11856af852bacc1ff5a26f3a802df7af85f26b067`.

At preparation time, `git diff 0f63e47bb..826527a91 -- . ':(exclude)docs/plans/**'` was empty. The merge added only the Phase 0 documentation/evidence package relative to the exact exercised source tree. Review from a clean detached worktree; the operator's primary checkout contains unrelated, uncommitted work that is outside this audit.

## Required inputs

Read these as one package:

1. `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md`
2. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_CONTRACTS_2026-07-29.md`
3. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_PARITY_LEDGER_2026-07-29.md`
4. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_BASELINE_2026-07-29.md`
5. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_CLOSURE_CHECKLIST_2026-07-30.md`
6. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_INDEPENDENT_AUDIT_2026-07-29.md`
7. `docs/plans/evidence/agentic_chat_worker_phase0_preflight_prod_2026-07-30.json`
8. The nine retained 2026-07-31 correction/final-gate JSON artifacts indexed in the independent-audit handoff.
9. `packages/shared-types/src/agentic-chat-worker-contract.ts` and its fixture suite.
10. `supabase/tests/20260729000000_agentic_chat_worker_phase0.preflight.sql`.

The original audit findings F1–F23 remain the historical checklist. The 2026-07-30 re-audit left N1 and S1 as normative blockers; contract revision .5 claims to close both. Verify those claims directly rather than inheriting the operator disposition.

## Independent decision rubric

Return a verdict for every item:

| Exit-gate item         | Required independent conclusion                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract revision .5   | Types, prose, hashes, excluded-field retry semantics, sequence ownership, terminal races, leases, cancellation, and operating values are internally consistent and have named proving tests    |
| Original audit closure | F1–F23, N1, and S1 are resolved or explicitly carried into a later proving phase without leaving an unresolved Phase 0 safety-semantic choice                                                  |
| Phase order            | No real asynchronous model/tool execution precedes the Phase 2 safety/control-plane work; Phase 1 remains legacy SSE extraction only                                                           |
| Parity ledger          | Every known legacy behavior has a current owner, target owner, and named proving phase; deferred `book-writing-journey` scope is visible rather than counted as a pass                         |
| Target preflight       | The retained production capture supports the duplicate/index and permission claims, and the read-only SQL is adequate to repeat before Phase 2A                                                |
| Hosted quality gate    | The decisive artifact is schema-valid, exact-tree, retry-free, complete, payload-free, and satisfies all registered scenario/turn assertions                                                   |
| Baseline usefulness    | Legacy client/server timing and retained footprint are valid future comparators without being overstated as worker or WAL/write-rate evidence                                                  |
| Residual tracks        | `queue_jobs` deployment verification, non-service job guard, future WAL/rate measurement, and book-writing work remain explicit later checkpoints rather than hidden Phase 0 acceptance claims |

Use `ACCEPT`, `ACCEPT WITH CONDITIONS`, or `REJECT` per item. A condition is gate-blocking if it can still change a safety semantic, phase order, parity owner/test, or the validity of the retained evidence. Implementation work already assigned to a named later proving phase is not automatically a Phase 0 blocker.

## Reproduction checks

From a clean checkout of the review commit:

```bash
pnpm --filter @buildos/shared-types exec vitest run
pnpm --filter @buildos/shared-types typecheck
pnpm --filter @buildos/web typecheck:phase-a

pnpm --filter @buildos/web exec vitest run \
  src/routes/api/agent/v2/stream/server.test.ts \
  src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts \
  src/lib/services/agentic-chat-v2/stream-orchestrator/llm-pass-runner.test.ts \
  src/lib/services/agentic-chat-v2/tool-selector.test.ts \
  src/lib/services/agentic-chat-lite/prompt/situational-rules.test.ts

pnpm --filter @buildos/web exec vitest run \
  --config vitest.config.agentic.ts \
  src/lib/tests/agentic-e2e/harness/judge.test.ts \
  src/lib/tests/agentic-e2e/scenarios/task-reschedule-cold-reference.scenario.test.ts
```

Expected current results:

- shared-types: 2 files / 13 tests; contract fixture file: 8 tests;
- shared-types typecheck: pass;
- Phase A typecheck: pass;
- focused web source suites: 5 files / 196 tests;
- focused agentic harness suites: 2 files / 6 tests.

Validate the decisive evidence independently:

```bash
jq -e '
  (.schemaVersion == 1) and
  (.contractFamily == "agentic_chat_worker_v1") and
  (.repository.head == "0f63e47bbafc4e58d85b360b1edb1ef8d0fe3fb5") and
  (.repository.headTree == "6e3f1b451e7920478f54fa36dddbb79dc68e7c83") and
  (.repository.dirty == false) and
  (.configuration.repetitions == 3) and
  (.configuration.retryCount == 0) and
  (.configuration.scenarioIds | length == 8) and
  (.summary.turnCount == 30) and
  (.summary.assertionPassCount == 30) and
  (.summary.completedCount == 30) and
  (.summary.streamErrorTurnCount == 0) and
  (.summary.captureErrorTurnCount == 0) and
  ([.turns[] | {scenarioId, repetition}] | unique | length == 24) and
  ([.turns[] | select(.assertionPassed == true)] | length == 30)
' docs/plans/evidence/agentic_chat_worker_phase0_gate_2026-07-31_0f63e47bb.json

shasum -a 256 \
  docs/plans/evidence/agentic_chat_worker_phase0_gate_2026-07-31_0f63e47bb.json
```

Do not rerun the paid hosted cohort merely to reproduce the review: the retained artifact is the registered evidence. A rerun spends provider/judge money and writes disposable hosted fixtures, so it should happen only if the artifact's integrity or sufficiency is rejected.

## Required audit output

The independent reviewer should append or create a dated verdict containing:

1. review identity and explicit no-authorship/fresh-context statement;
2. exact reviewed commit and tree;
3. checks run and artifacts inspected;
4. one verdict per rubric row;
5. any gate-blocking finding with file/line evidence and a concrete correction;
6. an overall `PHASE 0 ACCEPTED`, `PHASE 0 REJECTED`, or explicit waiver statement;
7. if accepted, confirmation that the first authorized Phase 1 slice is the service-only `admit_legacy_agentic_chat_turn(...)` RPC with transactionally pre-message fallback history and exactly-one turn/message differential tests—without worker transport or worker-control-plane schema work; use `docs/plans/AGENTIC_CHAT_WORKER_PHASE_1_HANDOFF_2026-07-31.md` for implementation context;
8. an explicit resolution of the common admission-schema boundary identified in that handoff: Phase 1 needs persisted request-hash/execution-mode and duplicate keys, while the current plan lists those columns/indexes under Phase 2.

Until that output exists, do not mark Phase 0 closed and do not implement Phase 1.
