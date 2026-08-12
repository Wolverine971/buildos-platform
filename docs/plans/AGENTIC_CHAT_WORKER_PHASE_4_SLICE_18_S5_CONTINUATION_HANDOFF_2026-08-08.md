<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_S5_CONTINUATION_HANDOFF_2026-08-08.md -->

# Phase 4 Slice 18 — S5 Continuation Handoff

**Prepared:** 2026-08-08
**Pickup point:** P1 / Slice 18 / S5, after unit 1
**Repository baseline observed:** `main` = `origin/main` = `49904355736ba10dcc271959d6237d047e48e34d` (`updates`)
**Next objective:** add worker read-memo and context-saturation behavior, then port only the read-only finalization semantics required to make forced synthesis reliable.

**Closure update (2026-08-09): P1/S5 COMPLETE.** Unit 2, hosted schema,
worker-aware transport/attribution, narrated-read handling, ordered same-round
multi-read continuation, deployment, and the spend-gated quality battery are
complete. The final clean battery passed 9/9 completed and 9/9 assertions with
zero stream/capture errors at `$0.00643681`, 60.9% below the matching Phase 0
subset. Routing is restored OFF. Authoritative evidence:
`docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_S5_LIVE_GATE_2026-08-09.md`.
The next Phase 4 package is tasker/51 P2 mutation/effect-reservation parity; do
not continue the historical implementation instructions below as open S5 work.

**P2 continuation update (2026-08-11): 20 mutation adapters reviewed; all
production gates remain OFF.** S1-S4 of the mutation/effect plan are complete,
and S5 now covers task create/update/move, document create/update/tree/task
relationships, goal/plan/milestone/risk create/update, exact edge link/unlink,
project row/create-shell mutations, and notification-only entity tagging. The
latest bounded unit is commit `962625b25`: `tag_onto_entity` accepts only
explicit `mode: "ping"` plus exact member user UUIDs, while content appends and
handle resolution remain web-owned. Notification delivery is one-attempt/
uncertain because its recipient fan-out is neither atomic nor effect-keyed. No
SQL was required for that unit. The authoritative current documents are:

1. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P2_MUTATION_EFFECT_PARITY_PLAN_2026-08-09.md`
2. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P2_S5_MUTATION_ADAPTER_INVENTORY_2026-08-10.md`
3. `tasker/51-worker-behavioral-parity-phase4.md`

Do not treat the historical S5 instructions below as current work. The next
candidate must be selected from the remaining graph/delete/provider/control
surface only after its partial-commit or reconciliation behavior is explicit.
At this checkpoint graph reorganization remains a compound multi-edge rewrite,
irreversible ontology deletes lack a durable tombstone/query contract, and
calendar work overlaps an active concurrent calendar refactor. Preserve those
boundaries instead of widening a tool merely to increase the reviewed count.

**P2 corrective SQL update (2026-08-11): hosted and verified.** Migration
`20260811230000_agentic_chat_effect_scope_trigger_null_guard.sql` fixes legacy
null-effect end-of-turn telemetry reconciliation without weakening worker
effect scope: the existing validation trigger now runs only when
`NEW.effect_id IS NOT NULL`. The composed disposable PostgreSQL suite passes
13/13. A fresh 85-receipt isolated dry run named only this migration; source
and staged SHA-256 matched at
`ce7af2d65378d2496c5f258b6465cc35c03e80da3add885c38407aa9fc3b8c2c`;
application succeeded; the linked receipt matches; and the post-apply dry run
is empty. A post-apply trailing-blank-line-only cleanup produced committed
source SHA-256
`ac9be4c7f7a9cbb9670089857d9faf5a57d7eb33fa81521e0175a612778a87fd`.
Hosted catalog verification confirms the exact trigger guard, security-invoker
function, fixed search path, anonymous/authenticated denial, and retained
service-role effect-ledger access. No production gate changed.

## Read this first

Read these in order before editing:

1. `tasker/51-worker-behavioral-parity-phase4.md`
2. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_READ_LOOP_PARITY_PLAN_2026-08-07.md`
3. This handoff
4. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_S3_EXTRACTION_MAP_2026-08-08.md` only when changing the shared read surface or access rules
5. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P1_IMPLEMENTATION_HANDOFF_2026-08-07.md` for historical S1 mechanics and gate commands

The governing architecture remains hybrid: pure semantic leaves live in
`@buildos/agentic-chat-runtime`; the worker composes them behind its provider
and executor ports; the legacy web round driver remains in place. Do not turn
this continuation into a wholesale extraction of `streamFastChat`.

## Current state

S1 through S4 are complete. S5 unit 1 is complete in `499043557`:

- shared nested context-shift extraction is in
  `packages/agentic-chat-runtime/src/loop/context-shift.ts`;
- web uses the shared helper through its compatibility surface;
- the worker publishes a stable `context_shift` after the durable/public tool
  result and carries the shifted scope into terminal last-turn context;
- lifecycle projection records `context_shift_emitted` in event order;
- the single two-sided `read_only_tools` golden covers a valid read, a durably
  recorded validation failure, a corrected read with context shift, a third
  real read, and final synthesis;
- worker `get_project_overview` telemetry now matches legacy: no invented
  affected-project row and null non-search result telemetry;
- terminal recovery updates its in-memory tool execution and round counters
  immediately after an acknowledged ledger write, before fallible observation
  or public publication;
- migration
  `supabase/migrations/20260808140000_agentic_chat_true_tool_round_count.sql`
  keeps call count ledger-derived while retaining and validating the executor's
  true provider-round count.

The operator reports that migration `20260808140000` has now been applied to
the linked database. That apply was not independently receipt/catalog-verified
during creation of this handoff. Treat the apply as operator-reported, not as a
completed hosted evidence packet, until the read-only checks below are run.
Never run the SQL test file against the linked database; it is explicitly
disposable-only.

No worker deploy, routing/cohort widening, or paid provider run was part of S5
unit 1.

## Working-tree warning

At handoff creation the repository contains many unrelated user-owned edits and
untracked files. The S5 code and migrations are already tracked in `499043557`,
but the agentic-chat phase-plan/tasker status edits are still local. Re-run
`git status --short` before touching anything. Preserve all unrelated changes,
do not reset the tree, and use explicit pathspecs for any staging or commit.

The `499043557` commit is a mixed `updates` commit containing unrelated web and
asset work as well as S4/S5 code. Do not rewrite or partially revert that
commit. Continue forward from it.

## Unit 1 invariants that must not regress

1. **Ledger before public.** A read result, memo-served or freshly executed,
   must be durably persisted before `tool_result` becomes public or is returned
   to the next provider round.
2. **Recovery sees acknowledged rows.** Immediately after ledger acknowledgement,
   terminal context must include the execution and its provider round even if
   a later observation or public publication fails.
3. **Validation failures remain visible.** A rejected provider call is a failed
   durable/public execution. It never reaches the read adapter and never enters
   successful continuation feedback, but it counts as a call and provider round.
4. **Context shift follows its result.** Persist/publish `tool_result`, set the
   terminal shift, then publish the stable `context_shift` transition. Setting
   terminal state before the fallible shift publication is intentional recovery
   behavior.
5. **Call count is database-authoritative.** `tool_call_count` comes from
   durable `chat_tool_executions`; the executor owns provider-round boundaries
   and supplies `tool_round_count`.
6. **Read surface stays bounded.** The production worker advertises the
   immutable artifact surface intersected with the reviewed 34-read allowlist.
   Do not add mutations, OAuth-backed tools, web search, or a worker-to-web tool
   callback in P1.
7. **One parity golden per scenario class.** The registry enforces this. Extend
   the existing `read_only_tools` golden if the shared trace must grow; do not
   add a second golden for the same class without an explicit instrument change.
8. **The worker-only terminal `done.status` and `done.failure_code` fields are
   registered deliberate divergences.** Do not hide or remove them merely to
   make the read-only differential exact.

## Migration semantics and hosted verification

`20260808140000_agentic_chat_true_tool_round_count.sql` patches the existing
16-argument `public.finalize_agentic_chat_turn` body:

- zero durable calls require zero rounds;
- completed turns with durable calls require an executor value in
  `1..tool_call_count`;
- failed/cancelled turns with a durable row but an in-memory zero use a
  conservative one-round floor, covering a committed ledger RPC whose response
  was lost during interruption;
- invalid completed metadata raises
  `agentic_chat_finalize_invalid_tool_counts` and rolls the terminal transaction
  back.

The disposable proof is
`supabase/tests/20260808140000_agentic_chat_true_tool_round_count.test.sql` and
is part of the composed stream-write Postgres suite.

Before claiming the hosted gate complete, verify without mutating data:

1. the linked migration receipt contains `20260808140000`;
2. `pg_get_functiondef(...)` for the exact 16-argument finalizer contains the
   `v_tool_round_count > v_tool_call_count` fence and no longer contains the
   old `CASE WHEN v_tool_call_count > 0 THEN 1 ELSE 0 END` cap;
3. the function remains `SECURITY INVOKER` with fixed
   `search_path=pg_catalog, public` and its pre-existing service-only execution
   boundary;
4. an isolated linked dry run is empty. If it names any unrelated migration,
   stop and separate the receipt check instead of pushing it.

Record the receipt/query evidence in the Slice 18 plan. A live worker turn is
not needed for this schema verification and remains separately gated by deploy,
routing, and spend authorization.

## Next implementation unit

Treat the next work as one round-bridge slice with three layers. Read memo and
context saturation both decide what the provider sees next; saturation's hard
stop is only meaningful if the next pass is actually tool-free and its output
is finalized safely.

### A. Wire the within-turn read memo

The shared primitives already exist and are exported:

- `packages/agentic-chat-runtime/src/loop/read-memo.ts`
- `buildReadMemoKey`
- `shouldMemoizeReadResult`
- `buildMemoServedResult`
- `isPureReadToolName` from `tool-classification.ts`

Legacy wiring is in
`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts` near
the `WP-12 read memo` comments. Its observable contract is important:

- cache only successful pure reads with exact normalized arguments;
- never cache failures or results requiring user action;
- repeat calls still create distinct tool-call/result executions for the model
  and ledger;
- the repeated payload carries `served_from_turn_memo: true` and
  `repeat_read_notice`, uses the new provider call id, has zero execution time,
  and does not replay stream events;
- memoization makes a loop cheap, not invisible: calls and rounds still count;
- legacy clears the memo after a write reaches the write executor. The current
  production worker path is read-only, so do not enable writes merely to test
  invalidation; keep the future invalidation rule explicit in the design.

Recommended ownership: the provider invocation owns the in-turn memo and
recognizes duplicate calls, while the executor owns the durable/public fence.
Add an explicit memo-served read-step payload (parallel to, but mutually
exclusive with, `validationFailure`) so the executor can skip the read adapter
but still persist and publish a normal execution. Do not let the provider
inject a tool result directly into the next prompt without passing through the
executor.

Audit and pin legacy persistence fields before deciding whether cached
duplicates repeat or suppress `affected_entities`, result-count telemetry, and
other out-of-band execution fields. Do not infer those details from
`buildMemoServedResult`, which only owns `ChatToolResult`.

Minimum focused proofs:

- two exact successful reads call the real read adapter once but produce two
  distinct durable/public executions and two provider rounds;
- the second result has the memo marker/notice, call-specific identity, and
  zero duration;
- the second result is what the provider receives for continuation;
- differing arguments execute normally;
- failed, validation-rejected, or user-action results are not memoized;
- persistence/publication failure on a memo hit does not advance the provider.

Prefer extending the existing `read_only_tools` fixture if a cross-adapter
trace is needed; keep its one-scenario registry contract intact.

### B. Wire `ContextGatheringLedger`

The shared implementation is already in
`packages/agentic-chat-runtime/src/loop/context-gathering-ledger.ts`; legacy
wiring is near `contextGatheringLedger.observeToolRound(...)` in the web
orchestrator.

Instantiate one ledger per prepared worker invocation. After durable feedback
for a completed read round, construct the same `FastToolExecution` and
`RoundToolPattern` view used by legacy, then call `observeToolRound` before
building the next provider request. Feed:

- the actual successful/failed execution view for that round;
- real tool-round/max-round counters;
- actual model payload characters, not the raw database result size;
- the admission context-usage snapshot unless/until the worker has a more
  current compatible snapshot.

Append a ledger message only when the ledger returns one. Preserve its monotonic
status emission. Combine `forceSynthesis` with the existing read-loop repair
rank so narrowing/saturated/must-synthesize instructions do not duplicate or
regress in severity.

`must_synthesize` must produce a true no-tool provider pass, matching legacy's
`forceNoToolSynthesisPass`; a prompt that says “do not call tools” while still
advertising them is not equivalent. Keep the capacity lease and accumulated
usage across that pass.

Minimum focused proofs:

- new evidence resets the low-novelty ladder;
- repeated identical/alternating reads progress through narrowing and saturated
  only once per rank;
- must-synthesize removes tools from the next request and terminates without an
  extra adapter call;
- memo-served repeats remain visible to saturation/repetition logic;
- the provider-round and call budgets still fail closed at their existing
  boundaries.

### C. Port only applicable read-only finalization semantics

The legacy runner remains web-side at
`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/finalization-runner.ts`.
Do not move that file wholesale: it imports the web turn supervisor and mutation,
skill, research-persistence, organize-commission, and stated-future repair
machinery that is outside the P1 worker surface.

First write an applicability table against the production read-only provider.
Likely candidates to extract or reproduce through shared pure leaves are:

- forced no-tool synthesis retry when the model requests another tool;
- one bounded retry when a no-tool synthesis pass returns no visible answer;
- exact-option/response-anchor checks only if the read-only golden or quality
  baseline proves they are in scope;
- length continuation and final text sanitation only after their streaming
  consequences are understood.

The worker currently publishes provider text deltas immediately. A post-hoc
sanitizer cannot retract an already durable/public prefix. Do not bolt
`sanitizeAssistantFinalText` onto terminal metadata while leaving different
text in the stream. Either keep the candidate final pass buffered until it is
accepted or define another fence-preserving design and pin it with reconnect
and terminal-message tests.

The smallest acceptable result is a bounded, tool-free synthesis path that:

- cannot issue another read;
- produces nonempty user-facing text or a deterministic terminal failure;
- preserves accumulated usage and final `finished_reason`;
- publishes/persists identical assistant text across stream snapshot, terminal
  message, last-turn context, and reconnect;
- adds no mutation/supervisor behavior not already reachable in P1.

## Test and gate sequence

Start focused, then run the full local matrix. After changing runtime package
exports/source, rebuild declarations before worker/web typechecks:

```sh
pnpm --filter @buildos/agentic-chat-runtime test:run
pnpm --filter @buildos/agentic-chat-runtime typecheck
pnpm --filter @buildos/agentic-chat-runtime build:types

pnpm --filter @buildos/worker exec vitest run tests/agenticChatReadOnlyProvider.test.ts tests/agenticChatFixtureTurnExecutor.test.ts
pnpm --filter @buildos/worker typecheck

pnpm --filter @buildos/web exec vitest run src/routes/api/agent/v2/stream/server.test.ts
pnpm --filter @buildos/web check

pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat-v2/phase2c-stream-write.postgres.test.ts
```

Full exit gates after focused tests are green:

```sh
pnpm --filter @buildos/worker test:run
pnpm --filter @buildos/worker lint
pnpm --filter @buildos/worker typecheck
pnpm --filter @buildos/agentic-chat-runtime test:run
pnpm --filter @buildos/agentic-chat-runtime typecheck
pnpm --filter @buildos/web check
```

Also run the legacy golden/server suite, changed-file Prettier, and
`git diff --check` on owned paths. The last verified unit-1 baseline was:

- worker: 803 passed, 1 intentional skip (804 total);
- runtime: 183/183;
- legacy server/golden suite: 40/40;
- composed disposable Postgres: 10/10;
- worker/runtime/web typechecks clean;
- Svelte: 0 errors / 0 warnings;
- worker lint/guardrails: 0 errors (175 pre-existing warnings).

Counts will increase as tests are added; do not weaken assertions to preserve
the old totals.

## Spend and deployment boundary

Do not run `test:agentic`, a live provider turn, a worker deployment, a routing
flip, or a cohort expansion merely to finish the local S5 slice. The read-only
agentic E2E quality battery remains explicitly spend-gated on DJ. When
authorization is given, compare only the read-only subset against the Phase 0
baseline and preserve the run artifact; do not silently substitute mocked
goldens for the quality gate.

## Definition of done for S5

S5 can close when:

- read memo and context gathering are active in the production worker bridge;
- forced synthesis uses a bounded tool-free pass with correct finalization;
- context-shift and affected-entity parity remain green;
- true tool-round counts are locally and hosted-verified;
- the single read-only differential has no new unregistered gaps;
- all local gates pass;
- the authorized read-only quality battery meets or exceeds the Phase 0
  baseline, or the task is explicitly handed back as waiting on DJ spend
  authorization.

After S5, return to `tasker/51` and choose the next Phase 4 package; do not drift
into P2 mutations while S5 evidence is incomplete.
