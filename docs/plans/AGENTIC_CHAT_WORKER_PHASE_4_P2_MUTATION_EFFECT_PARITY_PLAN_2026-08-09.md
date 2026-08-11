<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P2_MUTATION_EFFECT_PARITY_PLAN_2026-08-09.md -->

# Phase 4 P2 — Mutation / Effect-Reservation Parity Plan

**Prepared:** 2026-08-09
**Status:** S1-S4 complete; S5 inventory plus 19 reviewed mutation tools complete, including bounded document relationships, exact edge link/unlink, project-row update/create, and atomic task move; all required task SQL hosted; graph reorganization/tag/delete and remaining provider/control branches next; production mutations remain disabled
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

### S1 — Durable mutation receipt fence — hosted complete

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

### S2 — Ratify the mutation differential contract — locally complete; corrective SQL hosted

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
  composed disposable PostgreSQL suite and is now applied to hosted.
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

Hosted correction evidence on 2026-08-09:

- A fresh receipt-isolated workdir fetched production through `20260809010000`.
  Only `20260809020000_agentic_chat_mutation_tool_execution_legacy_category.sql`
  was added, and its staged SHA-256 matched the committed source exactly:
  `f7329e2c661703a84c457abe760bb08ddb363d4aa15217f2047ddaae3af79a11`.
- The linked dry run named exactly that migration, application succeeded, and
  the post-apply dry run reported the remote database up to date. A second fresh
  hosted receipt contains the same statements; its only differences are the
  Supabase history serializer's removal of blank lines between statements.
- A service-role no-write PostgREST probe reached the 17-argument function and
  failed closed with `P0001` / `agentic_chat_mutation_tool_execution_turn_not_found`.
  The identical anonymous probe was denied with SQLSTATE `42501`. Neither probe
  created a row.

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

### S4 — `update_onto_task` production adapter — complete; corrective SQL hosted

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

Core-unit implementation and findings:

- Added `AgenticChatUpdateOntoTaskMutationAdapter`, which accepts the reserved
  `effect_id` and exact `chat-effect:<effect_id>` identity, rechecks the immutable
  admitted tool surface, derives a project fence from the turn context plus the
  optional legacy `project_id` hint, and calls the worker-safe shared gateway
  in-process. It never calls the web host.
- The gateway cannot atomically persist or query the effect identity, so the
  provider contract remains `downstreamIdempotencySupported = false`. Known
  pre-commit validation/access/not-found failures reconcile as failed; thrown,
  internal, conflict, oversized, or mismatched post-dispatch outcomes reconcile
  as uncertain. The existing effect executor therefore makes one attempt.
- Assembly now has separate default-off provider-advertisement and adapter
  capability gates. Advertising without the matching adapter throws during
  composition. The production bootstrap supplies neither gate, so this work
  does not make a mutation reachable in production.
- The provider narrows the signed legacy definition to the reviewed shared
  gateway subset (`task_id`, optional `project_id`, title/description/type/state,
  priority, scheduling, props, assignee handles/IDs, goal, and supporting
  milestone) and sets `additionalProperties: false`. These fields remain behind
  the separate default-off provider and adapter capabilities; the production
  bootstrap opts into neither.
- The differential found and closed one core behavioral gap in the shared
  gateway: scalar echoes now use the legacy no-effect comparison, including
  trimmed text and timestamp-equivalent dates, instead of bumping `updated_at`
  and reporting false progress. Props and archival updates intentionally retain
  the legacy skip behavior.
- The S2 mutation golden now injects this real adapter (with only its downstream
  gateway runner stubbed), while a separate adapter test crosses the real shared
  gateway handler and proves the project-scoped update plus activity-log side
  effect and legacy-compatible receipt shape.
- Extracted the legacy task-event scheduling coordinator into
  `@buildos/shared-agent-ops/calendar/task-event-sync`; the web
  `TaskEventSyncService` is now a thin adapter over that same coordinator, so
  start-only, due-only, short-range, long-range, backlog, reschedule, and
  completion behavior cannot drift between runtimes.
- Added a worker-native event mutation port that performs ontology-event CRUD,
  event activity logging, task-event edge maintenance, actor-projection/member-
  fanout target resolution, and version-keyed `sync_calendar` queue enqueues
  entirely through Supabase. It imports no SvelteKit module and never calls the
  web host. The adapter supplies this port to the shared task update handler.
- The service-role path adds an explicit task-project fence to event hydration,
  mutation, failure marking, and edge cleanup. A malformed cross-project edge
  cannot be used to mutate another project's event.
- Calendar fan-out retains the legacy best-effort recovery contract. Durable
  queue jobs use the existing event-version dedup key; an enqueue rejection
  marks the event sync failed without retrying the committed task mutation, and
  a thrown task-sync side effect is warned and does not erase the authoritative
  task receipt.
- Extracted the assignment-notification implementation into
  `@buildos/shared-agent-ops` and made the web service a thin admin-client
  adapter. Worker task updates now use the same recipient filtering, payload,
  assignment-before-mention ordering, and mention coalescing contract.
- Added worker-safe active-member validation, legacy-compatible exact/prefix
  handle resolution, owner handling for explicit actor IDs, a ten-assignee cap,
  and legacy-shaped assignee enrichment in the returned task.
- Goal and supporting-milestone updates now mirror the legacy route: they update
  the shadow IDs in `props`, validate references against the task project, and
  build the shared replace-mode relationship plan. A milestone-only update sets
  `skipContainment` so it cannot detach the task from its existing goal/plan.
- Task fields, assignee synchronization, and relationship mutations cross the
  existing `onto_task_update_with_relationships_atomic` transaction. The audit
  found that the hosted wrapper rejected a valid semantic-only milestone plan
  and that the generic plan applier predated `targets_milestone`. Forward
  migration `20260810010000_atomic_task_semantic_relationship_update.sql` adds a
  task-scoped guarded applier and updates the wrapper without widening anonymous
  access.
- The downstream gateway still cannot atomically persist or query the worker
  effect identity. The adapter therefore remains one-attempt/uncertain and does
  not claim downstream idempotency after this expansion.

Final local evidence for this unit:

- shared gateway no-effect differential: 3/3
- full shared-agent-ops suite: 79/79
- focused provider projection: 21/21; focused provider/adapter matrix: 48/48
- provider/effect/adapter/executor/assembly focused worker matrix remains green
- shared task-calendar coordinator/worker-port matrix: 10/10; web coordinator
  referee: 3/3; exact task-patch calendar referee: 9/9
- focused web relationship/assignment/calendar/stream referee: 77/77
- full worker suite: 838 passed, 1 intentional skip
- runtime suite: 183/183
- shared-agent-ops build/typecheck, worker typecheck, and Svelte check: pass;
  Svelte reports 0 diagnostics
- changed worker source ESLint: zero diagnostics; full worker lint and HTTP
  module-size guard pass with zero errors
- disposable PostgreSQL proof: the new semantic-only task relationship test and
  the prior atomic task relationship suite both pass; the mismatch case proves
  the task row rolls back with an invalid relationship plan

Hosted correction evidence on 2026-08-10:

- A fresh receipt-isolated workdir fetched the linked ledger through
  `20260809020000`. Only
  `20260810010000_atomic_task_semantic_relationship_update.sql` was added; its
  SHA-256 matched the committed source exactly:
  `8753d75b2de296de5d4fca15dfd9ed69741cab5a150f3a8fbe71428f44b414b9`.
- The isolated dry run named exactly that migration, application succeeded, and
  the post-apply dry run reported the remote database up to date. Hosted history
  contains receipt `20260810010000` with 12 statements.
- Live catalog verification confirms the wrapper remains `SECURITY INVOKER`,
  the task-scoped applier is `SECURITY DEFINER`, both fix
  `search_path=public`, anonymous execute is revoked, authenticated execute is
  present, and the installed bodies contain the task-applier delegation and
  `targets_milestone` handling.
- No provider capability, adapter capability, production routing, or live model
  mutation was enabled.

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

S5 inventory and first expansion unit completed on 2026-08-10:

- The exhaustive signed write-category union contains 38 tools: 28 ontology,
  four calendar, and six contact/external/control tools. The shared in-process
  gateway covers 22; 16 remain web-only. The per-tool owner, timeout, receipt,
  side-effect, idempotency/query, and recovery classification is recorded in
  `AGENTIC_CHAT_WORKER_PHASE_4_P2_S5_MUTATION_ADAPTER_INVENTORY_2026-08-10.md`.
- Added an independently gated `create_onto_task` worker adapter and a mutation
  adapter router, so task create and update can be advertised/installed without
  coupling their gates. Advertising either tool without its matching adapter
  fails assembly. Production bootstrap still supplies no mutation capabilities.
- The provider exposes only the reviewed task-create projection and assigns a
  stable logical operation with `downstreamIdempotencySupported = true`.
- The adapter rechecks the signed surface, effect/key identity, reviewed
  arguments, cancellation, provider correlation, and project fence. It passes
  `chat-effect:<effect_id>` into the shared gateway's atomic task create command
  and returns the legacy-compatible task receipt without gateway-only
  `project_name` or the internal domain idempotency column. External-gateway
  downstream keys are namespaced by caller and canonical op before reaching the
  globally unique task key.
- Shared task creation now matches the legacy task relationship, assignee,
  assignment/mention, activity, and calendar side-effect surface. The task row,
  initial assignees, and relationship plan commit atomically; an idempotent RPC
  replay returns the original task and skips post-commit side effects.
- The existing create wrapper still called the generic relationship applier,
  which predated `targets_milestone`. Forward migration
  `20260810020000_atomic_task_create_milestone_relationship.sql` routes task
  create through the task-scoped applier introduced in S4.

Final local evidence for this unit:

- full shared-agent-ops suite: 82/82
- full worker suite: 849 passed, 1 intentional skip
- runtime suite: 183/183
- external-gateway plus legacy task-create referee: 46/46
- shared-agent-ops build/typecheck, worker typecheck, and Svelte check: pass;
  Svelte reports zero diagnostics
- changed worker source ESLint: zero errors; changed-source formatting: pass
- disposable PostgreSQL task-create milestone/replay proof: pass; predecessor
  atomic task relationship and semantic update suites remain green

Hosted task-create correction evidence on 2026-08-10:

- A fresh receipt-isolated workdir fetched production through
  `20260810010000`. Only
  `20260810020000_atomic_task_create_milestone_relationship.sql` was added; its
  staged SHA-256 matched the committed source exactly:
  `bceeac1605353d14bf80e5bd1b1e69b2ea486204d857cd0b6ddd79fd11e50e15`.
- The isolated dry run named exactly that migration, application succeeded, and
  the post-apply dry run reported the remote database up to date. Hosted history
  contains receipt `20260810020000` with six statements.
- A second fresh hosted receipt differs from source only by the migration
  history serializer removing two blank lines between statements.
- Live catalog verification confirms the create wrapper remains
  `SECURITY INVOKER`, the task-scoped applier remains `SECURITY DEFINER`, both
  fix `search_path=public`, anonymous execute is revoked, authenticated execute
  is present, and the installed wrapper delegates to the applier whose body
  handles `targets_milestone`.
- No provider capability, adapter capability, production routing, worker deploy,
  or live model mutation was enabled.

Pause-point audit hardening on 2026-08-10:

- Corrected idempotent recovery so cancellation after an ambiguous first
  attempt cannot stop stable-key replay or incorrectly reconcile a possible
  external commit as failed. Recovery uses an independent signal, and a later
  known failure preserves `uncertain_external_commit` unless replay proves the
  authoritative receipt.
- Extracted the shared fail-closed mutation adapter boundary used by task create
  and update, leaving their tool-specific project and receipt validation local.
  Simplified assembly around a named adapter-entry type before adding the
  document family.
- Focused adapter/router/assembly/effect tests pass 39/39; the full worker suite
  passes 851 tests with one intentional skip; worker lint/typecheck and changed-
  source formatting/diff checks pass. Hosted SQL and every production mutation
  gate remain unchanged and OFF.

First document-family unit completed locally on 2026-08-10:

- Added an independently gated `create_onto_document` adapter over the shared
  in-process gateway. It rechecks the signed surface, effect/key and provider
  correlation, project fence, reviewed arguments, cancellation, and the
  provider's non-idempotent classification before dispatch.
- The reviewed provider projection requires the signed `project_id`, `title`,
  and `description` fields; the adapter trims and rejects an empty description.
  It excludes legacy `props` because the current web route does not persist
  them, translates signed `parent_id` to canonical `parent_document_id`, and
  preserves legacy blank-parent and invalid-position normalization.
- The shared handler covers the authoritative document row, initial version,
  tree placement, mention notifications, and activity. The public receipt keeps
  the legacy `{ document, message }` shape while gateway-only project name and
  external-agent provenance are removed only from the receipt copy.
- Document create has no atomic effect-key persistence or exact query, so it is
  explicitly one-attempt/uncertain. A new boundary assertion prevents provider
  metadata from accidentally upgrading or downgrading any adapter's downstream
  idempotency classification.
- Provider mutation metadata is now a declarative table rather than repeated
  create/update branches. Assembly still normalizes every provider and adapter
  capability independently and production bootstrap supplies none.
- The web executor's context-aware duplicate-title guard and same-turn document
  registry are not yet worker-owned, and the route-owned project-loop burst is
  not part of the shared gateway. They remain explicit production-enablement
  prerequisites. The shared gateway's earlier rejection of invalid non-empty
  parent IDs is retained as an intentional fail-closed differential.
- Focused provider/adapter/executor/assembly tests pass 68/68; the full worker
  suite passes 860 tests with one intentional skip; worker lint/typecheck and
  HTTP module-size guard pass with zero errors. The external shared-gateway plus
  legacy document-create/mention/schema referee passes 53/53.
- No SQL, migration, deploy, provider capability, adapter capability, routing,
  or live model mutation was introduced or enabled in this unit.

Straightforward entity expansion completed locally on 2026-08-10:

- Added independently gated provider/adapter capabilities for document update
  plus goal, plan, milestone, and risk create/update. A central catalog now
  drives every implemented mutation's operation, projection, required fields,
  idempotency classification, assembly gate, and adapter allowlist.
- The nine new tools share a one-attempt gateway entity adapter. Thrown,
  internal, or mismatched-receipt outcomes are uncertain; validation, not-found,
  and forbidden gateway results remain known pre-commit failures. No adapter in
  this unit claims downstream idempotency or automatic reconciliation.
- Provider projection excludes document `merge_llm`, compound plan/milestone/
  risk relationship fields, and create-only opaque props that the legacy routes
  ignore. Milestone create requires the goal UUID that its authoritative route
  requires. Parent-by-title tree moves, new task-document creation, project/
  edge/graph/delete, calendar/provider, contact, external MCP, delegation, and
  staged-commit tools remain out of scope.
- Shared handlers now preserve the legacy goal/plan/milestone/risk props and
  timestamp behavior. Goal create/update includes mention notification diffing;
  document update adds best-effort tree metadata and mention diffing alongside
  its existing version/activity behavior. Public-page sync and the project-loop
  burst remain web-owned live-enablement prerequisites for document update.
- Full local gates pass: shared-agent-ops 89/89, worker 876 passed with one
  intentional skip, external gateway referee 42/42, and shared/worker
  typechecks. No SQL or migration was required. All production mutation gates,
  routing, deployment, and live model writes remain OFF.

Document relationship subset completed locally on 2026-08-10:

- Added independently gated `move_document_in_tree` and
  `create_task_document` adapters over the shared in-process gateway. The move
  surface accepts only exact project/document/optional-parent UUIDs plus a
  non-negative position. The task-document surface requires both an existing
  task UUID and existing document UUID, with an optional role.
- Parent-by-title creation remains excluded from the worker because parent
  creation and the requested move are separate commits. New document creation
  through `create_task_document` also remains excluded because the document can
  commit before its task edge. Provider descriptions state both exclusions and
  the projected schemas reject those fields.
- Exact tree move has no downstream effect-key query and is one-attempt/
  uncertain. Its receipt must contain the requested document exactly once under
  the requested parent at the service-clamped sibling position.
- Attach-existing is replayable: the shared edge path queries the exact
  task/document/`task_has_document` identity before insert and returns the
  existing edge on replay. The adapter validates project, endpoint kinds/IDs,
  relationship, and role before returning the legacy-compatible public
  `{ document, edge, message }` receipt.
- The shared tree service now rejects self-parenting and exact parents that are
  not linked in the current tree instead of silently placing the document at
  root. The gateway and web route classify those failures as validation errors.
  The shared parent-title path now creates a canonical document/tree entry so
  existing external callers are not broken by the stricter parent invariant;
  that compound path is still not worker-admitted.
- No SQL or migration was required. Full local gates pass: worker 882 passed
  with one intentional skip, shared-agent-ops 92/92, agentic-chat-runtime
  183/183, web gateway/tree referees 71/71, all four type/check gates, and
  Svelte diagnostics with zero errors and zero warnings. Production mutation
  capabilities, routing, deployment, and live model writes remain OFF.

Exact edge link/unlink subset completed locally on 2026-08-11:

- Added independently gated `link_onto_entities` and `unlink_onto_edge`
  adapters. Link requires exact endpoint UUIDs, canonical non-project entity
  kinds, a relationship, and optional props. Unlink requires an exact edge UUID
  from a prior graph/relationship read. Both require an admitted project
  context and cross the shared gateway with that single-project write scope.
- The link adapter resolves invented relationship labels, preserves
  `original_rel`, and canonicalizes deprecated/swapped directions before
  dispatch. Self-links and project endpoints fail before dispatch. Project
  endpoints are deliberately excluded because the legacy web route treats them
  as skipped no-ops while the shared gateway can create them.
- Neither tool claims downstream idempotency. General `onto_edges` rows have no
  uniqueness constraint, so a check-then-insert recovery can race and duplicate
  a link. Deletes have no durable tombstone, so a missing edge cannot prove that
  a lost unlink response committed. Each therefore gets one attempt and any
  ambiguous response remains `uncertain_external_commit`.
- Successful link receipts prove the canonical edge project, endpoints,
  relationship, and newly inserted props before returning the legacy
  `{ created, message }` shape. Successful unlink receipts prove the exact
  deleted edge and project before returning `{ deleted, message }`.
- The shared existing-edge query now includes project, source/destination kinds
  and IDs, and relationship instead of relying on IDs plus relationship alone.
  This prevents UUID collisions across entity tables from satisfying the wrong
  edge lookup. Existing Agent Run alias validation order remains unchanged.
- No SQL or migration was required. Full local gates pass: worker 889 passed
  with one intentional skip, shared-agent-ops 95/95, agentic-chat-runtime
  183/183, external gateway referee 42/42, all relevant typechecks, and Svelte
  diagnostics with zero errors and zero warnings. Production mutation gates,
  routing, deployment, and live model writes remain OFF.

Project-row update subset completed locally on 2026-08-11:

- Added an independently gated `update_onto_project` adapter over the shared
  gateway. It admits exactly the signed legacy fields: canonical `project_id`,
  name, description, state, start/end dates, and props. The gateway-only
  `archived` field and legacy internal `state` alias are not provider-visible.
- The adapter requires the requested project to match any admitted project
  context, normalizes legacy state aliases and dates before dispatch, strips
  server-owned `agent_workspace` and hidden `preferences` props, and rejects an
  empty effective update without calling the gateway.
- The project row has no effect-key persistence or exact replay query, so the
  adapter is one-attempt/uncertain. A successful receipt proves the exact
  project UUID, enforces the effect-ledger size cap, and restores the legacy
  `{ project, message }` response without the shared gateway's trailing period.
- The shared project handler now lives with the project read handlers, applies
  the same reserved-prop and blank-description behavior as the web route, and
  selects the full public project mutation row (including generated facets and
  timeline fields) before sanitizing its receipt. Activity logging remains on
  the single successful row update.
- No SQL or migration was required. Full local gates pass: worker 893 passed
  with one intentional skip, shared-agent-ops 97/97, agentic-chat-runtime
  183/183, external gateway referee 42/42, shared/worker typechecks, changed
  worker ESLint, project-column guard, formatting, and Svelte diagnostics with
  zero errors and zero warnings. Production mutation gates, routing,
  deployment, and live model writes remain OFF.

Standard project-shell creation completed locally on 2026-08-11:

- Added an independently gated `create_onto_project` adapter over the shared
  project instantiator. The reviewed provider surface requires a project plus
  empty `entities` and `relationships` arrays; arbitrary initial entities,
  relationships, custom context documents, clarifications, and meta remain on
  the web-owned compound creation path.
- The adapter admits only global/general/project-create contexts and standard
  project fields: canonical name/type, description, state, dates, and validated
  facets. Explicit fiction domain types and unreviewed/server-owned props fail
  before dispatch because they require the web-owned domain-profile and
  living-reference policy.
- The worker generates the legacy Context document, normalizes state and date
  boundaries, and validates the exact compound receipt: one project, one
  Context document, no initial graph entities/edges, matching counts, and a
  canonical project row. It then restores the legacy project ID, counts,
  `created_entities`, message, and project `context_shift`.
- Project instantiation remains a multi-write service without an atomic domain
  effect key or exact lost-response query. The adapter is therefore explicitly
  one-attempt/uncertain; it never claims compound idempotency or automatically
  replays an ambiguous result.
- The shared handler now returns the instantiator's `created_entities`, strips
  untrusted server-owned project props, and restores the legacy best-effort
  project-context snapshot enqueue. External caller scope expansion remains in
  the shared handler; the internal worker path has no external caller grant.
- No SQL or migration was required. Full local gates pass: worker 896/896 with
  one intentional skip, shared-agent-ops 99/99, agentic-chat-runtime 183/183,
  legacy/external project-create referees 50/50, shared/worker typechecks,
  changed worker ESLint, shared build, HTTP/project-column guards, formatting,
  and Svelte diagnostics with zero errors and zero warnings. Production
  provider capability, adapter capability, routing, deployment, and live model
  mutations remain OFF.

Atomic task move completed and hosted on 2026-08-11:

- Added independently gated `move_onto_task` provider and adapter capabilities.
  The reviewed surface requires canonical task/source/destination UUIDs, pins
  the source to the admitted project, rejects identical projects, and bounds an
  optional confirmation token. Production bootstrap supplies neither gate.
- Extracted a shared task-move service used by the web route, legacy executor,
  and worker adapter. It delegates all locking, destructive-impact preview,
  signed later-turn confirmation, blocked dependency handling, and compound
  movement to the existing atomic database command; validates exact status and
  identity receipts; compacts internal task details; and logs truthful activity
  for both projects only after a committed move.
- Added a service-role-only SQL bridge that resolves the explicit user's actor,
  checks write access to both source and destination projects, invokes the
  established atomic command under that user subject, and restores the prior
  request subject. It is not available to authenticated or anonymous clients.
- The move remains one-attempt/uncertain. Destination inspection can prove an
  `already_moved` state but cannot reconstruct the exact original impact and
  applied receipt. Network, malformed, or unclassified post-dispatch outcomes
  therefore never auto-retry. Known authorization/validation/blocked command
  failures remain known failures.
- The worker-only `onto.task.move` operation is explicitly excluded from the
  external gateway allowlist, preventing accidental scope expansion. Successful
  moved/already-moved receipts publish a durable destination context shift only
  after the durable tool result; previews and blocked receipts require user
  action without shifting context.
- Full local gates pass: worker 904 tests plus one intentional skip,
  shared-agent-ops 103/103, runtime 183/183, focused web move referees 8/8,
  shared build/typecheck, worker lint/typecheck/HTTP guard, Svelte check with
  zero diagnostics, and the disposable PostgreSQL bridge proof.
- A fresh receipt-isolated workdir fetched the 85 hosted receipts and staged
  only `20260811010000_agentic_chat_task_move_worker_bridge.sql`. Source and
  staged SHA-256 matched at
  `a4c4022d9aa7996f9853bf72237f29dd3c8f4ab9d3092811da68a7e8679e7170`.
  The dry run named only that migration, application succeeded, the post-apply
  dry run is empty, hosted history contains the receipt, and hosted OpenAPI
  exposes the RPC to `service_role` while hiding it from anonymous callers.
  Production provider/adapter gates, routing, worker deploy, and live model
  writes remain OFF.

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
