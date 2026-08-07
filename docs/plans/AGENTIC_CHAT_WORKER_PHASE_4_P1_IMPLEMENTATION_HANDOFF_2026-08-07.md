<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P1_IMPLEMENTATION_HANDOFF_2026-08-07.md -->

# Phase 4 P1 Implementation Handoff — Read-Loop Parity (start at S1)

**Prepared:** 2026-08-07, at the close of the P0 session (commits `6898acbd6` P0, `4ae990c63` P1 plan).
**Status:** Ready to start. All P1 work is local code — no deploys, no routing flips, no spend needed until S3's live gate and S5's E2E battery.
**Authority chain:** master plan `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md` §Phase 4 → `tasker/51-worker-behavioral-parity-phase4.md` P1 → ratified architecture `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_READ_LOOP_PARITY_PLAN_2026-08-07.md` (the plan; this doc is the how).

## Read these first, in order

1. `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_READ_LOOP_PARITY_PLAN_2026-08-07.md` — the ratified architecture, sub-slices S1–S5, landmines. Do not re-litigate the architecture decision without new evidence.
2. `packages/agentic-chat-runtime/src/parity-scenarios.ts` — the referee. Understand `workerOpenDivergences` (exact gap inventory), `workerDeliberateDivergencePrefixes` (ratified async-timing split), and the coverage trackers before touching any golden.
3. `apps/worker/src/workers/agentic-chat/providerContract.ts` (120 lines) and `fixtureTurnExecutor.ts:460-610` — the loop you are extending.
4. `apps/worker/tests/agenticChatFixtureTurnExecutor.test.ts:216` (`createHarness`) — how canned provider steps drive the real executor.
5. `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_17_PARITY_SCENARIO_REGISTRY_EVIDENCE_2026-08-07.md` — what P0 built and the premise corrections.

## State of the world (2026-08-07)

- **Deployed/live:** Phase 3 bounded worker (one read tool + synthesis), routing OFF, internal cohort only. Canary 11 passed; Phase 3 exit gate closed GO.
- **Local `main` (not pushed):** P0 registry + coverage guards (`6898acbd6`), Slice 18 plan (`4ae990c63`).
- **Known live divergence (unrefereed):** worker `get_project_overview` routes through `shared-agent-ops` gateway (`onto.project.status.get`) whose payload shape differs from legacy `overview-helper.ts`. Registered nowhere executable yet — S1 must record it (see below), S3 closes it.
- **Landmine standing in the repo:** DJ keeps `packages/shared-types/src/database.schema.ts` STAGED with an unrelated regeneration. Always commit with explicit pathspec: `git commit -- <files>`.
- **tasker/50 operator gates** (constraint-diff sweep, provider-budget overrun canary, client-fix canary) are open but gate the next LIVE run only — S1/S2 proceed without them.

## S1 — Multi-round fence with the existing single tool

Smallest change that proves the architecture. Everything below is verified against current source (line numbers checked 2026-08-07).

### Current single-round mechanics (what you're relaxing)

`fixtureTurnExecutor.ts`:

- `:473` — `let pendingReadFeedback: AgenticChatProviderReadSynthesisInputV1 | null` — a single-slot holder; this becomes an array (`pendingReadResults`).
- `:482` — `while (!finished)` — the loop already re-enters; multi-round is structurally supported.
- `:525-529` — the guard that fails a second read round with `provider_read_round_limit_exceeded` when `synthesisStarted || pendingReadFeedback !== null`. Relax ONLY when the prepared provider exposes the new `continueWithToolResults` (keep the legacy behavior byte-identical when it doesn't — Phase 3 adapter and its 8 tests must pass unchanged).
- `:564-568` — "provider finished before the durable read result was synthesized" guard.
- `:580-590` — the round handoff: drains `pendingReadFeedback`, reassigns `providerStream = preparedProvider.synthesize(feedback)`. Your new path does the same but calls `continueWithToolResults({ round, results })` with the drained array.
- Fence invariant (do not weaken): each read result is persisted via `toolExecutions.persistRead` AND published as a public `tool_result` semantic event BEFORE it may enter the next provider round. See `executeReadTool` ordering (publish `tool_call` → observation → execute → ledger persist → observation → publish `tool_result`).

### Contract change (`providerContract.ts`)

- `:87-88` — `synthesize?(input: AgenticChatProviderReadSynthesisInputV1)` stays as the deprecated single-result alias.
- Add to `AgenticChatPreparedProviderInvocationV1` (`:76`):
  `continueWithToolResults?(input: { round: number; results: readonly AgenticChatProviderReadSynthesisInputV1[] }): AsyncIterable<AgenticChatProviderStepV1>;`
- Round boundary = the provider's iterable ends WITHOUT emitting `finish`. No new step types.

### Executor budgets (new, executor-owned)

`maxProviderRounds` (default 16) and `maxToolCalls` (default 40) as constructor options beside `providerBudgetMs`/`overheadTimeoutMs`, sourced from new worker envs `CHAT_MAX_TOOL_ROUNDS`/`CHAT_MAX_TOOL_CALLS` via the `phase3Config.ts:43` `loadAgenticChatPhase3Config(environment)` pattern (never module-scope `process.env` — that is web's `limits.ts` mistake; web defaults live at `limits.ts:2-3` and are 40/16, keep them aligned). Exceeding a budget must produce an executor-written terminal failure with a specific failure code (follow the `provider_budget_exhausted` precedent from Slice 16), never a sweeper terminal.

### Ledger

Already N-round capable — `toolExecution.ts:112` sends `p_sequence_index`, `:148` validates the receipt echoes it, `:174-179` derives the stable row id from `turnRunId:sequenceIndex`. The executor computes it as `terminalContext.toolExecutions.length + 1`. **No migration.**

### Tests to add/extend

1. `agenticChatFixtureTurnExecutor.test.ts` — new cases through `createHarness`:
   - two `read_tool` steps across two rounds via a `prepare` mock exposing `continueWithToolResults` → completed, two `persistRead` calls with `sequenceIndex` 1 and 2, two `tool_result` publishes, fence order held per round;
   - round-budget exceeded → executor-written failed terminal with the new failure code;
   - tool-call budget exceeded → same;
   - Phase 3 shape (no `continueWithToolResults`) → second read round still fails `provider_read_round_limit_exceeded` (regression pin).
2. Disposable-Postgres proof (S1 exit gate): two ledger rows, `sequence_index` 1,2, distinct stable ids, prod-compatible `tool_category`. Extend `supabase/tests/…agentic_chat_read_tool_execution_ledger.test.sql` (runs inside the composed suite driven by `apps/web/src/lib/services/agentic-chat-v2/phase2c-stream-write.postgres.test.ts`; needs local `initdb`/`pg_ctl`/`psql`, auto-skips otherwise).
3. `agenticChatReadOnlyProvider.test.ts` — the production adapter accepts N tool calls once it implements `continueWithToolResults` (S1 may implement it on the adapter or defer the adapter to S4; implementing the contract on the fixture path alone is acceptable for S1 as long as the Phase 3 adapter regression-pins hold).

### Golden extension (INSTRUMENT CHANGE — two-sided, one commit)

Extending `read_only_tool-parity-fixture.ts` to two rounds changes the shared golden, and the web suite asserts EXACT equality against it:

- Worker side: extend the differential test's canned steps to two `read_tool` steps and re-derive.
- Web side: `apps/web/src/routes/api/agent/v2/stream/server.test.ts` (~`:1576-1631`) — the mocked `streamFastChat` flow must emit the second tool_call/tool_result pair and second toolExecution row.
- Registry side: `parity-scenarios.ts` auto-derives the timing prefix and done-event inventory from the golden's event indices (`timingDivergencePrefix`/`doneEventGapInventory` throw on ≠1 timing/done event) — adding tool events shifts indices automatically, but rerun the package suite to confirm.
- The four goldens must otherwise stay byte-unchanged (S1 exit gate). If a diff shows anything outside the extended read-only golden, stop and audit.

### Recording the live payload divergence (S1 deliverable)

The registry can't express it (goldens use a synthetic tool), so: add a `## Known live divergences` section to the Slice 18 plan or a short ledger block in tasker/51 P1 stating: `get_project_overview` worker payload (gateway `op-execution-gateway.project-status.ts`: `counts`/`count_summary`/`overdue_tasks`/`due_soon_tasks`) ≠ legacy (`overview-helper.ts`: `counts`/`entity_counts`/`active_tasks`/`blocked_tasks`/…), closed by S3's shared implementation, verified closed when S3's ≥3-real-tool golden covers it.

### S1 exit gate (from Slice 18, restated)

- [ ] Two-round postgres proof (rows, sequence, stable ids).
- [ ] Existing four goldens byte-unchanged except the deliberate read-only extension.
- [ ] `read_only_tools` golden at two rounds on BOTH sides, worker diff ⊆ registered inventories, coverage trackers still green.
- [ ] Phase 3 single-round behavior regression-pinned.
- [ ] Live divergence recorded durably.
- [ ] Full gates: worker suite + TS7 typecheck, web `server.test.ts` + svelte-check, runtime package suite, prettier.

## S2–S5 (see Slice 18 plan for full detail)

- **S2** — extract loop leaves to `agentic-chat-runtime/src/loop/*`; web files become re-export shims same commit (`agentic-chat-v2/last-turn-context.ts` is the ratified shim pattern). Convert `getToolRegistry()` singleton + `limits.ts`/`context-usage.ts` env reads to injected ports/config. Needs a second tsup entry AND `exports` map entry for `./loop` or web resolves stale `dist` (tests alias to src via `workspacePackageAliases`, builds do not).
- **S3** — shared read-tool implementations behind an access port. FIRST ACTION: payload-diff `onto.task.get` vs `get_onto_task_details` and `onto.search` vs `search_ontology` — if gateway-compatible, S3 collapses to allowlist-over-gateway. Security invariant: every shared read scopes via `ensureActorId` + actor-visible projects (`utility-executor.ts:1102`/`:320` fail OPEN under service role — never expose unpatched). Prod `pg_constraint` diff on `chat_tool_executions_tool_category_check` BEFORE any live run (canary 8 precedent).
- **S4** — compose the shared loop in the worker provider via the ~150-line round bridge (loop's injected `toolExecutor` pushes a `read_tool` step, awaits a deferred resolved by `continueWithToolResults`). Sequential tool execution only.
- **S5** — context-gathering ledger, read-memo, context shifts, affected entities, finalization-runner; then the agentic E2E battery vs the Phase 0 baseline (`docs/plans/evidence/agentic_chat_worker_phase0_gate_2026-07-31_0f63e47bb.json`) — **spend-gated on DJ**.

## Standing rules (condensed from tasker/51 — the long-form is authoritative)

- Audit the instrument first; goldens/inventories change only with a ratified contract decision, never to make a run pass. Shrink `workerOpenDivergences`, never grow it silently.
- Prod-vs-disposable constraint diff before any new write path goes live.
- Bare catches are defects (log through a port + bounded fallback — D2a precedent).
- Diagnosis order: durable tables → `agentic_chat_execution_observations` → Supabase logs → Railway boundary logs.
- Routing stays OFF; cohort unchanged; internal-only throughout P1.

## Commands

```bash
# worker suite + the executor file alone
cd apps/worker && pnpm vitest run
cd apps/worker && pnpm vitest run tests/agenticChatFixtureTurnExecutor.test.ts
cd apps/worker && pnpm typecheck            # native TS7

# web parity suite + typecheck
cd apps/web && pnpm vitest run src/routes/api/agent/v2/stream/server.test.ts
cd apps/web && pnpm typecheck               # svelte-check, slow

# runtime package (registry + goldens)
cd packages/agentic-chat-runtime && pnpm vitest run && pnpm typecheck

# composed disposable-Postgres suite (hosts the ledger SQL test; needs initdb/pg_ctl/psql)
cd apps/web && pnpm vitest run src/lib/services/agentic-chat-v2/phase2c-stream-write.postgres.test.ts

# commit — ALWAYS explicit pathspec (DJ pre-stages unrelated schema regen)
git add <new files> && git commit -m "…" -- <files>
```

## Do NOT

- Do not author a timeout golden from the mocked route (fabricated behavior — P6, post-P1, from the real loop).
- Do not build a worker→web HTTP tool-exec callback (new prod surface; RLS incident open).
- Do not use `runGatewayReadOp` as the S3 parity path unless the targeted payload diff proves compatibility.
- Do not touch `AGENTIC_CHAT_WORKER_ENABLED`, cohort env vars, or Vercel routing in P1 code slices.
- Do not widen the one-golden-per-scenario registry shape without an explicit instrument-change note.
- Do not read module-scope `process.env` in any new worker/package code.
