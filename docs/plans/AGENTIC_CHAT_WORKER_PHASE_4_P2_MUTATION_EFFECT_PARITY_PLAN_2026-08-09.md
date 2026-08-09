<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P2_MUTATION_EFFECT_PARITY_PLAN_2026-08-09.md -->

# Phase 4 P2 — Mutation / Effect-Reservation Parity Plan

**Prepared:** 2026-08-09
**Status:** S1 hosted; S2-S3 complete locally; S2 category-correction migration pending hosted apply; production mutations remain disabled
**Governing task:** `tasker/51-worker-behavioral-parity-phase4.md` P2
**Prerequisite:** P1 / Slice 18 complete, live gate 9/9, routing restored OFF

## Kernel

Enable worker mutations one adapter at a time without allowing a provider tool-call
identifier, queue retry, cancellation race, or lost response to duplicate a side
effect. Every write crosses the existing stable effect lifecycle:

`reserve -> cancellation check -> begin -> one authorized adapter invocation -> receipt -> tool ledger -> public result`

The first production adapter will be `update_onto_task`, because it is already a
high-value parity scenario and has strong legacy regression coverage. It must not
be advertised until its legacy-compatible arguments, result, side effects,
affected-entity evidence, and no-retry/uncertain behavior are pinned by the
mutation golden.

## Findings from the opening audit

1. The Phase 2B effect substrate already exists and is tested. Stable effect IDs,
   canonical argument hashes, single-winner `begin`, idempotent downstream retry,
   and uncertain-outcome reconciliation are implemented in
   `effectControl.ts`, `effectIdentity.ts`, and `fixtureMutationExecutor.ts`.
2. Production assembly still injects `mutating_tools_disabled`, and the production
   provider rejects every mutating step. No production write was reachable when
   this plan was prepared.
3. The deterministic executor published a successful mutation result without
   first persisting a `chat_tool_executions` row linked to its effect. That meant
   mutation calls were absent from durable call counts and could become public
   without the read path's ledger fence.
4. Cancellation before reservation was not checked, while cancellation after
   `begin` could make the outer executor stop awaiting an irreversible adapter.
   The adapter/effect reconciliation continued in the background, but its receipt
   could be hidden from tool telemetry.
5. The existing `chat_tool_executions_tool_category_check` did not admit the
   semantic `write` category. P1 widened it only for `read` and `search`.
6. `shared-agent-ops` is not automatically a legacy-chat parity adapter. Its
   worker write gateway explicitly carries no downstream idempotency, and P1
   already proved that parallel gateway/read implementations can have different
   payloads. A write adapter must be differentially proven before exposure.

## Non-negotiable invariants

- Routing remains OFF and no live mutating shadow traffic is allowed.
- Provider `tool_call_id` is correlation only. Stable `effect_id` derives from
  turn ID plus the runtime-owned logical operation ID.
- Check cancellation before reservation, after reservation, and immediately
  before `begin`/invocation.
- Only `begin.outcome = started` with `invokeAdapter = true` may invoke a write.
- Once `begin` grants authority, await the adapter and effect reconciliation;
  user cancellation cannot abandon receipt ownership for an irreversible call.
- A succeeded effect is durably linked to one exact `chat_tool_executions` row
  before a public `tool_result` or provider continuation.
- Mutation telemetry derives its result from the authoritative succeeded effect
  receipt, not an independently supplied worker payload.
- An adapter with no downstream idempotency/query capability gets one attempt.
  Ambiguous failure becomes `uncertain_external_commit` and is never retried
  automatically.
- Lost-response replay must resolve exact existing effect/tool receipts; changed
  arguments, operation, tool, effect, sequence, or provider-call correlation fail
  closed.
- A cancellation accepted after downstream commit may suppress the public result,
  but it must not hide the durable effect/tool receipt.
- Adapter enablement, provider advertisement, and routing are separate gates.

## Slices

### S1 — Durable mutation receipt fence — locally complete

Deliverables:

- Add `persist_agentic_chat_mutation_tool_execution(...)` as a service-only,
  generation/queue-owner-fenced RPC.
- Require a matching `succeeded` effect and derive the stored result from
  `chat_turn_effects.downstream_receipt`.
- Link `chat_tool_executions.effect_id`, store the effect operation as
  `gateway_op`, and persist semantic category `write`.
- Preserve the deployed tool-category expression and add only `write`.
- Resolve exact lost-response replay and reject identity/content conflicts.
- Permit new telemetry after an accepted cancellation only when the effect is
  already succeeded and the same live queue owner still holds the turn.
- Check cancellation before reservation.
- After `begin`, await mutation completion/reconciliation and persist its receipt
  with an independently bounded signal before honoring cancellation or publishing.

Implementation:

- `supabase/migrations/20260809010000_agentic_chat_mutation_tool_execution_ledger.sql`
- `supabase/tests/20260809010000_agentic_chat_mutation_tool_execution_ledger.test.sql`
- `apps/worker/src/workers/agentic-chat/toolExecution.ts`
- `apps/worker/src/workers/agentic-chat/fixtureMutationExecutor.ts`
- `apps/worker/src/workers/agentic-chat/fixtureTurnExecutor.ts`

Local evidence at preparation time:

- focused worker mutation/executor/ledger suite: 63/63
- full worker suite: 817 passed, 1 intentional skip
- worker typecheck: pass
- composed disposable PostgreSQL suite: 12/12, including the new mutation
  effect-link and post-commit cancellation proof
- worker lint: zero errors, unchanged 175-warning repository baseline

Hosted application completed on 2026-08-09. A fresh receipt-isolated workdir
fetched the linked migration ledger, staged only `20260809010000`, and matched
the committed source SHA-256
`13012939a25e3b40ebb51945bcf0d2a7083a0fdd480ebac966acfd689df10afd` before
apply. The dry run named exactly that migration, application succeeded, and the
post-apply dry run reported the remote database up to date. A fresh hosted
receipt contains the same statements with only Supabase history serialization
differences (blank-line removal and the final comment terminator). PostgREST
exposes all 17 required arguments. A service-role no-write probe reached the
function and failed closed with the expected `turn_not_found`; anonymous access
failed with SQLSTATE `42501`. This migration enabled no production mutation.

### S2 — Ratify the mutation differential contract — locally complete

- Add one shared `mutating_tools` fixture/golden centered on
  `update_onto_task`.
- Capture the legacy public event order, message metadata, durable tool row,
  operation/category, arguments/result, affected entities, counts, lifecycle,
  and final outcome.
- Extend the worker fixture through the real effect executor and the S1 ledger
  port.
- Register only the deliberate worker effect-receipt fields as an asymmetry.
  Do not hide ordinary result/persistence drift behind the divergence list.
- Add cancellation fixtures at pre-reserve, reserved/pre-begin, and
  post-commit/pre-public boundaries; keep uncertain external commit as a separate
  recovery assertion rather than a successful parity run.

Implementation and findings:

- Added the shared `update_onto_task` fixture/golden and registered
  `mutating_tools` as implemented on both adapters.
- The legacy route and worker fixture now agree on event order, message metadata,
  provider correlation, canonical operation, arguments/result, affected entity,
  tool/round counts, lifecycle, and terminal outcome.
- The worker acknowledgement now derives the same `project`, `brief`, or
  `workspace` scope as the legacy route instead of always claiming workspace
  context.
- The worker golden delegates through the real effect executor and the real S1
  tool-ledger RPC adapter. Its only mutation-specific deliberate differences are
  `effect_id` and `replayed` on the public receipt plus `effect_id` on the durable
  tool row. Existing async timing and done-event contracts remain unchanged.
- The audit caught that legacy `update_onto_task` rows use `ontology_action`, not
  the initially assumed `write`. The already-applied S1 migration is immutable.
  Forward migration
  `20260809020000_agentic_chat_mutation_tool_execution_legacy_category.sql`
  restores the legacy category in new rows and exact replay checks. It passes the
  composed disposable PostgreSQL suite but is not yet applied to hosted.
- The cancellation/recovery matrix was already present and remains green:
  pre-reserve cancellation creates no effect; reserved/pre-begin cancellation
  closes the reservation without invoking; post-commit/pre-public cancellation
  persists the effect-linked tool receipt while suppressing the public result;
  uncertain external commit remains a recovery-only assertion.

Local evidence on the final S2 tree:

- focused worker mutation/executor/ledger suite: 64/64
- full worker suite: 818 passed, 1 intentional skip
- runtime suite: 183/183
- exact legacy route suite: 41/41
- composed disposable PostgreSQL suite: 12/12
- worker/runtime typechecks and Svelte check: pass; Svelte reports 0 diagnostics
- worker lint: zero errors, unchanged 175-warning repository baseline

### S3 — Mixed provider round bridge, still adapter-disabled — locally complete

- Generalize continuation results from read-only to successful read/write tool
  results while preserving ordered same-round execution.
- Generate one stable logical operation ID per normalized model write and retain
  it across callbacks/recovery; never derive it from provider call ID.
- Clear the within-turn read memo as soon as a write reaches the mutation
  executor, whether it succeeds or fails.
- Keep validation failures durable/public and keep mutation budget/round counts
  database-authoritative.
- Add `update_onto_task` to the reviewed catalog only behind an explicit assembly
  capability; default production assembly remains disabled through this slice.

Implementation and findings:

- Provider continuation now accepts an ordered union of durable read and mutation
  receipts. The executor processes mixed same-round calls sequentially and does
  not invoke the next provider round until every successful result is both
  ledger-persisted and publicly committed.
- A normalized model write receives a deterministic logical operation UUID from
  turn ID, one-based provider round, and one-based call position. Provider call
  IDs remain correlation only and do not contribute to effect identity.
- `update_onto_task` is present in the worker's reviewed loop catalog as
  `onto.task.update`, with downstream idempotency declared false. It is offered
  only when the signed admission surface contains it and the explicit provider
  capability is true.
- The provider owns an explicit read-memo invalidation hook. The executor calls
  it before entering the mutation executor, including the uncertain-failure
  path, and mixed rounds are prevented from re-memoizing pre-write reads.
- `createAgenticChatPhase3Assembly` defaults the capability off and continues to
  inject `mutating_tools_disabled`; the production bootstrap supplies no opt-in.
  No production adapter, deploy, routing change, or model spend was introduced.

Local evidence on the final S3 tree:

- focused provider/executor/effect/assembly suite: 84/84
- full worker suite: 823 passed, 1 intentional skip
- runtime suite: 183/183
- worker typecheck: pass
- changed worker source ESLint: zero diagnostics; full worker lint remains at the
  zero-error repository baseline

### S4 — `update_onto_task` production adapter

- Differentially compare the legacy `OntologyWriteExecutor.updateOntoTask`
  behavior with the worker-safe shared gateway implementation.
- Extract the smallest shared implementation needed if arguments, result shape,
  assignment/mention handling, update strategies, activity side effects, or
  affected-entity evidence diverge. Do not call back into the web host.
- Pass `effect_id` / `chat-effect:<effect_id>` through the adapter boundary.
- Unless the downstream commit can atomically persist or query that key, declare
  `downstreamIdempotencySupported = false`, perform one attempt, and classify a
  lost/ambiguous response as uncertain. Do not claim idempotency from the effect
  ledger alone.
- Enable the adapter only after the S2 golden and S1 PostgreSQL proof pass with
  the real adapter injected.

### S5 — Adapter-by-adapter expansion and local exit

- Inventory every write tool reachable from the signed admission surface.
- For each adapter, record tool name, canonical op, implementation owner,
  downstream idempotency/query capability, timeout, external side effects,
  receipt shape, affected-entity derivation, and reconciliation policy.
- Add one adapter family at a time (task, document, core ontology, relationships,
  project, calendar/email/external last).
- Keep OAuth/external mutations out until their provider-specific idempotency and
  reconciliation contracts exist.
- Close the `mutating_tools` parity registry block only when the golden is
  exercised by both legacy and worker suites.

## P2 exit gate

- The mutation differential passes on both adapters with only ratified effect
  receipt asymmetry.
- Every reachable mutating adapter accepts the stable effect identity.
- Every adapter is classified idempotent/queryable or one-attempt/uncertain, with
  recovery tests for the latter.
- Reserve/begin/cancel/commit/receipt interleavings are covered in TypeScript and
  disposable PostgreSQL.
- Tool rows are effect-linked, ordered, terminally attached, and included in
  database-authoritative call counts.
- Full worker/runtime/legacy/PostgreSQL/typecheck/lint gates pass.
- Production routing remains OFF. Any later live mutation gate requires an
  isolated test project, exact one-user cohort, explicit spend/write authorization,
  verified worker/web deploys, and unconditional routing-OFF cleanup.
