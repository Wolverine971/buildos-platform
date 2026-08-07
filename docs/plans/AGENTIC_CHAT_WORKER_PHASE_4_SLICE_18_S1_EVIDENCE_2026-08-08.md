<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_S1_EVIDENCE_2026-08-08.md -->

# Phase 4 Slice 18 S1 — Multi-Round Fence Evidence (tasker/51 P1)

**Prepared:** 2026-08-08. **Commit:** `32b2b2dfb` (14 files, explicit pathspec).
**Status:** Complete; all exit gates green locally. Test/contract/config code only — no deploy, no routing change, no migration.
**Authority:** `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_READ_LOOP_PARITY_PLAN_2026-08-07.md` S1; implementation handoff `AGENTIC_CHAT_WORKER_PHASE_4_P1_IMPLEMENTATION_HANDOFF_2026-08-07.md`.

## What S1 proved

The executor architecture supports N provider rounds with the durable-then-public
fence held per round, without touching the Phase 3 production adapter, the step
vocabulary, or the database schema.

- **Contract** (`providerContract.ts`): added optional
  `continueWithToolResults?({ round, results })`
  (`AgenticChatProviderToolRoundInputV1`; round = 1-based provider round about
  to start, initial `stream()` = round 1). `synthesize` is retained as the
  deprecated Phase 3 single-result alias. No new step types.
- **Executor** (`fixtureTurnExecutor.ts`): `pendingReadFeedback` single slot →
  `pendingReadResults` array. Round boundary = provider iterable ends without
  `finish`; the executor drains the accumulated results (each already persisted
  via `persistRead` AND publicly committed as a `tool_result` event) into
  `continueWithToolResults`. The Phase 3 guards
  (`provider_read_round_limit_exceeded`, `provider_finished_before_read_synthesis`,
  `provider_mutating_tool_disabled`) fire byte-identically when the provider
  does not expose the new method. New `tool_round` boundary-log stage.
- **Budgets** (executor-owned, never a sweeper terminal):
  `maxProviderRounds` (default 16, bounds continuations = tool rounds) and
  `maxToolCalls` (default 40, counts read + mutating steps), sourced from
  `CHAT_MAX_TOOL_ROUNDS`/`CHAT_MAX_TOOL_CALLS` via
  `loadAgenticChatPhase3Config` → assembly → bootstrap (no module-scope env
  reads). Exceeding either writes a failed terminal with a specific code —
  `provider_round_budget_exceeded` / `provider_tool_call_budget_exceeded` —
  added to `specificTerminalFailureCode` per the Slice 16
  `provider_budget_exhausted` precedent.
- **Terminal truth in metadata**: `tool_round_count` is now the real count of
  provider rounds that completed ≥1 tool execution (was hardcoded 0/1).

## Instrument change (two-sided, one commit)

`read_only_tools` golden extended to two rounds. Derivation order preserved the
audit-the-instrument rule: the web test was extended first and the golden was
transcribed from the REAL route's captured output (second lifecycle pair
inserts as call→result after the first pair's call→cue→result; counts 2/2;
`data_accessed` gains the second tool), then the worker differential was driven
through two rounds via a prepared provider exposing `continueWithToolResults`.

- Fixture gains `secondTool` (`fixture_task_read`); golden events insert the
  second `tool_call`/`tool_result` pair at indices 6–7; outcome
  `tool_call_count: 2, tool_round_count: 2`; `toolExecutions` row 2 at
  `sequence_index: 2`.
- `lifecycle-observability.ts` widened from the deliberate one-read bound to N
  pairs projected in legacy insert order (single planning cue directly after
  the first call); `tool_result > tool_call` cardinality still rejected.
- Registry auto-derivation (`timingDivergencePrefix`/`doneEventGapInventory`)
  absorbed the index shift; the worker's contested diff is still EXACTLY the
  registered done-event inventory — `workerOpenDivergences` neither grew nor
  shrank. The other three goldens are byte-unchanged (verified via git diff:
  only `read-only-tool-parity-fixture.ts` and the lifecycle projection changed
  in the package).

## Postgres proof (disposable, composed suite)

`supabase/tests/20260804036000_agentic_chat_read_tool_execution_ledger.test.sql`
extended: second persist at `sequence_index 2` under a distinct stable id and
prod-compatible `tool_category 'utility'`; asserts two rows with
`sequence_index [1,2]`, distinct ids, both attached to the assistant message at
finalize, and DB-derived `tool_call_count = 2`. No migration — the ledger was
already N-round capable.

## New finding registered (S1 → S5)

`finalize_agentic_chat_turn` derives durable `tool_round_count` as
`CASE WHEN v_tool_call_count > 0 THEN 1 ELSE 0 END`
(`20260804036000_agentic_chat_read_tool_execution_ledger.sql:61`) and
**overrides caller metadata** on both `chat_turn_runs` and the message. Ledger
rows carry no round attribution, so a two-round worker turn persists durable
round count 1 while legacy persists 2; the differential cannot see it because
it referees the executor's finalize input, not the DB row. Registered with the
`get_project_overview` payload divergence in the Slice 18 plan
§Known live divergences; the SQL test pins the current derivation with an
explanatory comment. Owned by S5 (round attribution on ledger rows, or a
ratified decision to trust caller counts).

## Gates (all green, 2026-08-08)

| Gate | Result |
| --- | --- |
| Worker suite (`apps/worker pnpm vitest run`) | 776 passed, 1 skipped |
| Worker native TS7 typecheck | clean |
| Web `server.test.ts` (exact golden equality) | 40/40 |
| Web svelte-check | 0 errors, 0 warnings |
| Runtime package suite + typecheck | 31 passed; clean |
| Composed disposable-Postgres suite | 8/8 (incl. two-row ledger proof) |
| Prettier | clean |
| Other three goldens byte-unchanged | verified (git diff) |

New worker tests: two-round differential (`exposes the exact deterministic
two-round read-only tool parity gaps`), per-round fence mechanics with boundary
log order, round-budget terminal, tool-call-budget terminal, Phase 3
single-read fence regression pin.

## Next

S2 — extract the loop's pure semantic leaves to
`agentic-chat-runtime/src/loop/*` (new tsup entry AND `exports` map entry for
`./loop`), web files become re-export shims in the same commit
(`agentic-chat-v2/last-turn-context.ts` is the ratified pattern), convert
`getToolRegistry()`/`limits.ts`/`context-usage.ts` to injected ports/config,
add the lint rule forbidding `$app`/`$env` in the package.
