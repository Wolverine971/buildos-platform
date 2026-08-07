<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2_HANDOFF_2026-07-31.md -->

# Agentic Chat Worker Migration: Phase 2 Implementation Handoff

**Prepared:** 2026-07-31 EDT

**Status:** Phase 2A is closed. Phase 2B Slices 1–5 and Phase 2C Slices 1–5 are hosted through exact receipt `20260802037000`; hosted types/schema remain aligned at 241 tables / 13 views and 223 RPC names. Phase 2D Slices 1–6, the remaining local Phase 2 exit matrix, and the Phase 2 exit-gate decision packet are complete. The final matrix proves supersede waits for durable terminal truth even when the provider ignores abort, cancel-first cannot cross the provider-start fence, immutable source history survives edit/delete and a generation-2 retry, prepared-cache cleanup cannot remove the retained input artifact or prevent execution, and duplicate/reload/reconnect/gap/terminal-wait client behavior converges as one flow. The local 100-turn measurement remains 448,376 WAL bytes total / 4,483.76 bytes per turn inside its explicit 64 KiB-per-turn synthetic guardrail. The gate is green at 106 complete Agentic Chat files / 863 tests, 78 passing worker files / 641 passing tests with one explicit opt-in skip, 12 focused Agentic worker/queue files / 79 tests, 3 focused controller/UI/composed files / 33 tests, and 24/24 shared-types tests plus typecheck/build; worker typecheck passes, full lint exits 0 with 170 pre-existing warnings, and whole-worktree `svelte-check` is clean. Worker routing remains disabled: all new decisions are legacy-only, live capacity defaults closed, the fixture consumer and sweeper are not imported or started by production, and no real provider exists. Phase 3 still requires explicit approval.

**Parent plan:** `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md`

## Phase 1 closure carried forward

Phase 1 exited on the complete approved hosted rerun recorded in `docs/plans/evidence/agentic_chat_worker_phase1_gate_rerun_2026-07-31_bb0f16da1.json`:

- 24/24 scenario executions and 30/30 turn assertions passed;
- all 30 turns completed with `finished_reason=stop`;
- stream-error and capture-error counts were both zero;
- Vitest retry count was `0`; and
- the measured worktree was clean at `bb0f16da1ddb96d2519c92987753e941fd46fb43` / tree `61f94f626cc0c96077cc62677bfa0319c6883fd8`.

The Phase 1 handoff and failure investigation contain the full implementation and remediation record. The provider timeout/TTFT signals remain reliability follow-ups; they do not reopen Phase 1.

## Phase 2 package boundaries

Phase 2 remains split into independently deployable packages with worker execution disabled:

1. **Phase 2A — Trust and schema foundation:** staged legacy-compatible columns/tables, prepared/input-artifact lockdown, active/idempotency indexes, generated types, and rollback proof.
2. **Phase 2B — Ownership and atomicity:** worker admission, claim/generation fencing, effects, terminal CAS, retry/recovery classification, and hard capacity rejection.
3. **Phase 2C — Event and control transport:** bounded generation-aware persistence/publishing, cancellation observation, private Realtime authorization, and reconciliation.
4. **Phase 2D — Client and fixture proof:** lease/channel/client adapters and the complete fake-provider/tool Phase 2 exit matrix.

Phase 3 remains the first phase allowed to execute a real model asynchronously.

## Phase 2A Slice 1 — hosted schema applied; application boundary implemented

Migration: `supabase/migrations/20260801010000_agentic_chat_worker_phase2a_trust_foundation.sql`

### Legacy-compatible turn foundation

The migration adds and backfills the command/control fields needed by later worker admission while preserving old legacy inserts:

- `request_payload` / `request_payload_version` with `{}` / `legacy_v1` defaults;
- transport decision, queue-job, and correlation identities;
- execution generation, cancel/boundary timestamps, history lineage, and stale-context policy;
- event/terminal identities and failure code; and
- nullable `input_artifact_id`.

`execution_mode` is constrained to `legacy_sse | worker_realtime` and becomes immutable after insert. This slice does not permit `queued`, create an `agentic_chat_turn` queue type, or admit a worker turn.

### Immutable input-artifact boundary

`chat_turn_input_artifacts` is introduced as a server-only table with:

- exact turn/session/user relational scope;
- `agentic_chat_input_v2` and history-source constraints;
- lowercase SHA-256 format, 2 MiB total, and 256 KiB history bounds;
- a minimum seven-day retention window;
- database-rejected updates;
- database-rejected deletion while the owning turn is queued/running; and
- a validated turn-to-artifact link.

Prepared-prompt lineage is stored as an immutable UUID value rather than a foreign key. Ordinary prepared-prompt cleanup therefore cannot mutate or delete the frozen execution artifact.

### Permission lockdown

The migration removes the old authenticated write policies/grants from `chat_turn_runs`, `chat_turn_events`, `chat_turn_checkpoints`, and `chat_prompt_snapshots`. It also removes direct authenticated prepared-prompt content access and prepared-prompt cleanup execution. These paths were moved behind service-owned stores/writers in Phase 1.

The new input-artifact table grants authenticated/anonymous roles no table access. The service role receives `SELECT`, `INSERT`, and terminal-safe `DELETE`, but no `UPDATE`.

### Shared verification contract

`packages/shared-types/src/agentic-chat-worker-contract.ts` now exports the locked 2 MiB artifact, 256 KiB history, and seven-day retention values plus `validateTurnInputArtifactV1(...)`. The verifier fails closed on:

- version/history-source mismatch;
- malformed or mismatched SHA-256;
- invalid retention;
- oversize canonical UTF-8 input/history;
- prepared history that falsely claims chat-message lineage; and
- a newly admitted user message appearing in frozen history.

Database ownership/current-generation checks remain Phase 2B service responsibilities.

### Server-only artifact store/reader

`apps/web/src/lib/services/agentic-chat-v2/turn-input-artifact-store.server.ts` now provides the generated-type-backed storage boundary for immutable inputs:

- writes normalize content, compute the canonical SHA-256, persist the verifier's exact UTF-8 history/content byte counts, enforce the minimum retention interval, and reject history containing the newly admitted message;
- reads are scoped by artifact, turn, session, and user identities and never fall back to mutable chat-message or prepared-prompt rows;
- every read re-runs `validateTurnInputArtifactV1(...)` before returning content; and
- hash, byte-counter, prepared-prompt-lineage, malformed-content, retention-expiry, and database failures are typed and fail closed before provider work.

The store deliberately does not create or link the turn itself. The atomic admission RPC and current-generation/ownership fencing remain Phase 2B work.

## Phase 2A Slice 2 — queue enum applied to hosted schema

Migration: `supabase/migrations/20260801020000_agentic_chat_worker_queue_type.sql`

The migration contains only `ALTER TYPE public.queue_type ADD VALUE IF NOT EXISTS 'agentic_chat_turn'`. PostgreSQL enum additions are not reversibly removable without rebuilding the enum, so this change is deliberately committed by itself before any migration may use the new value.

This slice does not insert a queue job, permit `chat_turn_runs.status='queued'`, replace the active-turn index, create an RPC or worker consumer, or expose an executable asynchronous path. Its disposable PostgreSQL test applies the migration twice, proves the value exists exactly once, preserves existing enum values, and proves the new value can be stored only after the migration statement has committed.

## Phase 2A Slice 3 — queued status and active index applied to hosted schema

Migrations:

- `20260801030000_agentic_chat_worker_queued_status.sql` adds and validates the five-value status check before removing the four-value legacy check;
- `20260801030100_agentic_chat_worker_active_index_preflight.sql` fails on the deterministic first session with multiple queued/running turns and reports ordered turn IDs;
- `20260801030200_agentic_chat_worker_create_active_index.sql` creates `uq_chat_turn_runs_one_active_per_session` concurrently while the running-only guard remains live;
- `20260801030300_agentic_chat_worker_validate_active_index.sql` verifies that the replacement is valid, unique, session-keyed, and queued/running-scoped; and
- `20260801030400_agentic_chat_worker_drop_running_index.sql` drops the superseded running-only index concurrently only after validation.

The create-new-then-drop-old sequence avoids a gap in active-session uniqueness. The web conflict classifier recognizes both index names during rolling deployment. The installed Supabase CLI is `2.109.1`, which supports the two single-statement pipeline-incompatible concurrent-index migration files.

The disposable contract proves queued/running mutual exclusion, terminal-row coexistence, unsupported-status rejection, unchanged legacy defaults, the full Phase 1 atomic-admission fixture, and rollback to the four-status/running-only schema. A second fixture introduces one running+queued collision and proves the preflight stops before index construction with both ordered turn IDs. No duplicate is silently cancelled or selected by index creation.

The hosted preflight scanned all 623 existing turn rows immediately before application: 57 were running, zero were queued, no session had more than one queued/running turn, and no unsupported status existed. An isolated CLI dry run containing only the hosted ledger entries and the six pending Phase 2A migrations proved the exact application set before mutation. All six applied in timestamp order, the catalog-validation migration passed before the old index was dropped, a subsequent ledger read showed local/remote parity through `20260801030400`, and a second dry run reported the remote database up to date. The post-application data scan remained 623 rows with the same status distribution and zero duplicate active sessions.

## Phase 2A Slice 4 — stream-state/cancel-signal foundation applied to hosted schema

Migration: `supabase/migrations/20260801030500_agentic_chat_worker_stream_signal_foundation.sql`

The migration adds two server-only tables without adding a writer/cancel RPC or executable worker route:

- `chat_turn_stream_state` stores one turn/session/user-scoped current-generation snapshot with monotonic snapshot/durable/projection cursors, a complete append-only assistant-text prefix, the complete JSON UI projection, and the durable `reconcile_required` flag;
- stream text is database-bounded at the locked 2 MiB UTF-8 maximum, generation changes must advance exactly once and reset every cursor/text prefix, and every insert/update must match the owning turn's current generation;
- `chat_turn_signals` stores at most one `agentic_chat_signal_v1` cancellation signal per running turn, only after a matching accepted cancel request exists on the turn;
- signal content is immutable, and only one atomic consumption acknowledgement by the current execution generation is permitted;
- both tables use exact composite turn/session/user foreign keys with `ON DELETE RESTRICT`, preventing parent deletion from bypassing explicit retention cleanup; and
- active control rows cannot be deleted, while terminal rows become deletable only after seven full days from the turn's durable terminal timestamp.

RLS is enabled from table creation. `PUBLIC`, `anon`, and `authenticated` receive no table access or trigger-function execution; `service_role` receives the table operations needed by the later fenced RPC layer. The migration creates no client policy.

The shared contract now pins the 2 MiB full-text limit, 512 KiB future spill threshold, seven-day terminal retention window, and `agentic_chat_signal_v1` version. Slice 4 deliberately stores the full supported prefix in the stream-state row; the bounded coalescing/spill writer remains Phase 2C work.

The migration was applied from an isolated workdir containing the exact hosted ledger plus only `20260801030500`; the unrelated local `20260801040000`/`20260801040100` admin migrations were excluded. The pre-apply dry run named only the Slice 4 file, the migration applied successfully, the hosted ledger then showed parity through `20260801030500`, and the post-apply dry run reported the remote database up to date. Read-only hosted checks proved that both tables are visible to `service_role` and denied to `anon`.

Hosted database types and the lightweight schema were regenerated after the receipt. They contain `chat_turn_stream_state` and `chat_turn_signals`; after the later hosted admin-question-tree additions were captured by the final Slice 5 regeneration, the lightweight schema reports 239 tables. Shared-types tests, typecheck, and build all passed after regeneration.

## Phase 2A Slice 5 — queue-function lockdown applied to hosted schema

Migration: `supabase/migrations/20260801030600_agentic_chat_worker_queue_function_lockdown.sql`

The live call-site audit found that authenticated `queue_jobs` inserts were already revoked, but `add_queue_job` and `reset_stalled_jobs` still inherited broad/default function execution and generic stalled recovery was job-type-indiscriminate. Existing application and worker enqueues use the service-role client or trusted database-owner functions; no working authenticated direct enqueue depends on the generic RPC.

Slice 5 therefore takes the stricter server-only branch of the approved queue contract:

- `queue_jobs` `INSERT` remains explicitly revoked from `PUBLIC`, `anon`, and `authenticated`;
- `add_queue_job` is an explicit invoker with a pinned search path and service-role-only execution, preserving deduplication and correlation metadata;
- an `agentic_chat_turn` enqueue additionally requires the trusted signed request role to be `service_role`, so an authenticated request cannot bypass the gate through a user-callable definer wrapper;
- `reset_stalled_jobs` replaces its legacy one-argument signature with a backward-compatible defaulted include/exclude signature and service-role-only execution;
- every generic reset hard-excludes `agentic_chat_turn`, even if it is included or the caller passes a null/empty exclusion, leaving future generation/effect-aware recovery to the chat-specific routine; and
- `SupabaseQueue` now sends its exact registered processor types as the include set and explicitly excludes `agentic_chat_turn`, matching the job-type scoping already used when claiming jobs.

The disposable contract proves direct/function privilege denial, signed-claim wrapper-bypass rejection, successful service enqueue, preserved correlation metadata, exact include/exclude behavior, empty-registration behavior, backward-compatible ordinary-job recovery, the unconditional chat exclusion, the full legacy admission fixture, and fixture-row rollback.

### Hosted type/snapshot alignment and generator hardening

The final hosted regeneration now exposes the three-argument `reset_stalled_jobs` contract (`p_stall_timeout`, `p_include_job_types`, and `p_exclude_job_types`) and captures the unrelated already-hosted admin-question-tree tables/RPCs without replaying those migrations. Both queue-function SQL snapshots now represent the exact Slice 5 bodies.

That regeneration exposed a pre-existing OpenAPI fallback bug: an RPC block with an existing enriched return type was preserved wholesale, so changed live arguments could remain stale. The generator now compares the live and retained argument-name sets, rebuilds only a genuinely changed argument list, and preserves the enriched return contract. Regression coverage proves changed arguments refresh while overloaded and unnamed-argument PostgreSQL contracts remain intact. The queue-lockdown base fixture was also decoupled from the moving current function snapshots: it now reconstructs the historical pre-Slice-5 definitions before applying the Slice 5 migration, so the rollback/security test remains a real migration-boundary test.

Immediately before hosted application, the exact current migration hash was rerun through the disposable PostgreSQL suite and the queue contract suite. The hosted ledger had already advanced through the unrelated `20260801040000`/`20260801040100` admin migrations, so Slice 5 was applied as an intentional out-of-order gap from an isolated workdir containing only exact hosted receipts plus `20260801030600`. `--include-all` was used only inside that isolated workdir. The dry run named only Slice 5; application succeeded; the ledger then showed local/remote parity for `20260801030600`; and the post-apply dry run reported the remote database up to date. A no-op hosted probe with an empty recovery include set returned zero for `service_role`, while `anon` was denied both `reset_stalled_jobs` and `add_queue_job`.

## Proving tests

- `supabase/tests/20260801010000_agentic_chat_worker_phase2a_trust_foundation.test.sql`
- `supabase/tests/fixtures/agentic_chat_worker_phase2a_trust_base.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2a-trust-foundation.postgres.test.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.test.ts`
- `supabase/tests/20260801020000_agentic_chat_worker_queue_type.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2a-queue-type.postgres.test.ts`
- `supabase/tests/20260801030000_agentic_chat_worker_active_status_index.test.sql`
- `supabase/tests/fixtures/agentic_chat_worker_phase2a_duplicate_active.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2a-active-status-index.postgres.test.ts`
- `supabase/tests/20260801030500_agentic_chat_worker_stream_signal_foundation.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2a-stream-signal-foundation.postgres.test.ts`
- `supabase/tests/fixtures/agentic_chat_worker_queue_lockdown_base.sql`
- `supabase/tests/20260801030600_agentic_chat_worker_queue_function_lockdown.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2a-queue-function-lockdown.postgres.test.ts`
- `apps/worker/tests/queueContracts.test.ts`
- `supabase/tests/fixtures/agentic_chat_worker_phase2b_admission_claim_base.sql`
- `supabase/tests/20260802020000_agentic_chat_worker_atomic_admission.test.sql`
- `supabase/tests/20260802020100_agentic_chat_worker_claim_fencing.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2b-admission-claim.postgres.test.ts`
- `supabase/tests/fixtures/agentic_chat_worker_phase2b_message_idempotency_collision.sql`
- `supabase/tests/20260802029900_agentic_chat_worker_message_idempotency_guard.test.sql`
- `supabase/tests/fixtures/agentic_chat_worker_phase2b_terminal_control_legacy_event.sql`
- `supabase/tests/20260802030400_agentic_chat_worker_event_identity.test.sql`
- `supabase/tests/20260802030500_agentic_chat_worker_terminal_control.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2b-terminal-control.postgres.test.ts`
- `supabase/tests/20260802031000_agentic_chat_worker_execution_recovery.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2b-execution-recovery.postgres.test.ts`

The disposable PostgreSQL test applies the Phase 1 admission migration first, then the Phase 2A migration, reruns the full Phase 1 admission SQL fixture against the locked-down schema, and verifies legacy defaults, artifact immutability/scope/retention/limits, execution-mode immutability, and role privileges.

Current results through hosted Phase 2B Slice 5:

- Complete legacy/Phase 2A/Phase 2B disposable PostgreSQL set: 11 files / 15 tests passed, including full legacy admission, negative active-index preflight, effect lifecycle/scope, admission capacity/duplicate/session races, claim-generation contention, reserved message-key security, event-generation identity, terminal/message/claim/start/recovery races, post-lock timestamps, security/ownership fencing, terminal queue repair, and package rollback proofs.
- Complete non-PostgreSQL `agentic-chat-v2` suite: 72 files / 721 tests passed.
- Focused queue runtime/contract regression: 5 files / 45 tests passed.
- Shared-types suite: 2 files / 19 tests passed.
- Shared-types typecheck and build: passed.
- Server-only artifact store: 11/11 tests passed.
- `@buildos/agentic-chat-runtime`: 2 files / 4 tests passed; typecheck passed.
- `@buildos/worker` typecheck: passed.
- `@buildos/web` Svelte check: 0 errors and 0 warnings.
- Supabase select guardrail: passed.
- Hosted RPC drift: 210 aligned function names.
- OpenAPI schema-generator regression suite: 3/3 tests passed.
- `git diff --check` and `git diff --cached --check`: passed for the shared dirty worktree.

## Deployment and rollback state

The hosted Phase 2A SQL and Phase 2B through Slice 5 are visible in the schema: `chat_turn_input_artifacts` and the additive `chat_turn_runs` fields are present; `queue_type` contains `agentic_chat_turn`; `chat_turn_runs.status` permits queued/running/completed/failed/cancelled; `uq_chat_turn_runs_one_active_per_session` is the validated queued/running uniqueness guard; both server-only stream/signal tables are present; `chat_turn_effects` plus `chat_tool_executions.effect_id` are present; the three effect lifecycle RPCs are service-visible; the active daily-brief canonical-session key plus `create_agentic_chat_turn_with_job` and `claim_agentic_chat_turn` are live; generation-scoped event identity plus the two terminal-control RPCs are live; and `begin_agentic_chat_turn_execution` plus `recover_agentic_chat_turn` are service-visible. `packages/shared-types/src/database.types.ts` and `database.schema.ts` were regenerated from that current hosted schema and are aligned at 240 tables / 13 views and 212 RPC names. `chat_turn_events.Insert.event_id` and `execution_generation` remain optional because their trigger-consumed defaults preserve the legacy writer contract.

The Slice 1 deployment ledger is now reconciled. `supabase migration repair 20260801010000 --status applied --linked` updated only the migration-history receipt, and a subsequent read-only list verified `local=remote=20260801010000`. The SQL was not replayed.

Do **not** use a sweeping `supabase db push`: the remote ledger intentionally has many historical gaps relative to the local directory. Slices 2 and 3 were applied from an isolated temporary migration workdir that contained the exact hosted ledger plus only `20260801020000` and `20260801030000`–`20260801030400`; Slice 4 used the same method with only `20260801030500`. Before/after dry runs proved each exact set. A schema-only catalog dump was not available on this machine because the current Supabase CLI requires Docker Desktop for `db dump`; the permission and rollback contracts remain executable in the disposable PostgreSQL fixtures.

Completed deployment order:

1. reviewed and applied the additive/permission schema with worker routing disabled;
2. regenerated hosted database types and the lightweight schema;
3. added the compatible server-only input-artifact store/reader; and
4. reran RPC/select guardrails, shared/runtime typechecks, legacy SSE-focused regressions, and disposable PostgreSQL contracts.

The compatible daily-brief SQLSTATE `23505` winner-adoption change remains a local application change and should be deployed next. The unique canonical-session index is already hosted, so until that application change is live, a rare concurrent legacy daily-brief session creation can surface the uniqueness error instead of adopting the committed winner; it still cannot create duplicate canonical sessions. Keep the worker flag disabled until every Phase 2 package exits.

Rollback avoids destructive removal of Slices 1–3. Disable any future worker flag, keep their additive columns/tables in place, and restore only the named authenticated policies/grants if the already-deployed Phase 1 server writers themselves must be rolled back. Before worker routing exists, Slice 4 can roll back independently by dropping its two empty control tables and three trigger functions; the disposable fixture proves that exact sequence leaves the earlier Phase 2A foundation intact. Slice 5 can roll back by restoring the prior correlation-aware `add_queue_job`, dropping the three-argument reset function, restoring the prior one-argument recovery body, and restoring only intentionally required grants.

The enum addition committed before every migration that may use `agentic_chat_turn`. Phase 2A Slice 3 permitted queued rows structurally but created no admission path, queue job, or worker consumer.

The admission/claim hosted application used a receipt-isolated workdir containing the exact remote ledger plus only `20260802020000` and `20260802020100`; the then-unhosted, unrelated `20260802010100_question_tree_normalize_trim.sql` was excluded and applied later with the receipt-isolated Slice 4 deployment. The pre-apply dry run named exactly the two worker files, the live daily-brief preflight remained clean at 12 active rows / 12 canonical keys / zero duplicates, both migrations applied in timestamp order, and the post-apply dry run reported the remote database up to date. The ledger now shows exact local/remote parity for both receipts. Service-role OpenAPI returned `200` and exposed both RPCs; anon returned `401` and exposed neither. Type regeneration added both RPC contracts, RPC drift aligned at 208 names, the OpenAPI generator passed 3/3, shared types passed 2 files / 15 tests plus typecheck/build, the select guard passed, and web `svelte-check` remained at 0 errors / 0 warnings.

## Explicit non-goals after Phase 2D Slice 4

- no registered `agentic_chat_turn` queue consumer or provider/model invocation;
- no browser lease prefetch or production Send-path selection (the worker admission HTTP surface now exists but is unreachable from the browser and capacity-default-closed);
- no production worker handle discovery/adoption, event-to-UI adapter, or reconciliation cursor application (the mounted receive runtime remains handle-free);
- no browser call site for the local transport/discovery/cancel gateway;
- no publisher/cancellation-observer registration in a live execution assembly;
- no feature-flag change or user-visible worker routing; and
- no real asynchronous provider/model execution.

## Phase 2B Slice 1 — mutation-effect foundation applied to hosted schema

Migration: `supabase/migrations/20260801041000_agentic_chat_worker_effect_foundation.sql`

Proof:

- `supabase/tests/fixtures/agentic_chat_worker_phase2b_effect_base.sql`
- `supabase/tests/20260801041000_agentic_chat_worker_effect_foundation.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2b-effect-foundation.postgres.test.ts`

This first Phase 2B slice is additive and inert until the later fenced RPC layer exists. It introduces:

- the server-only `chat_turn_effects` ledger, scoped by exact turn/session/user and execution generation;
- stable runtime-generated effect identity, canonical lowercase SHA-256 argument hashes, provider-call telemetry that is explicitly not the idempotency key, downstream-idempotency capability, receipts, failure code, and lifecycle timestamps;
- database-enforced `reserved -> started -> succeeded/failed/uncertain`, `reserved -> cancelled`, and `uncertain -> succeeded/failed` transitions;
- a required `reserved` initial state, immutable identity/timestamps, and fully immutable succeeded/failed/cancelled effects;
- deletion protection for every active-turn effect and every unreconciled `uncertain` effect;
- a nullable `chat_tool_executions.effect_id` telemetry link with a database trigger rejecting cross-turn links; and
- RLS from table creation, no `PUBLIC`/`anon`/`authenticated` privileges, and service-role-only table access.

The disposable PostgreSQL contract passes scope, hash/timeline, initial-state, transition, terminal-immutability, active/uncertain-retention, telemetry-link, service-only permission, legacy-admission compatibility, and full schema rollback checks. Immediately before application, the exact migration hash `98e71ea389b532504c27a0b8f00581c330d2c81ac1d5d7cce56ecdaef29b018b` passed that contract.

The hosted ledger had already advanced through the unrelated `20260801040200`/`20260801040300` question-tree receipts. An isolated workdir containing the exact hosted receipts plus `20260801041000` produced a dry run naming only the effect-foundation migration. Application succeeded, the post-apply dry run reported the database up to date, and the ledger showed local/remote parity for `20260801041000`. A live REST/OpenAPI probe returned `200` for service-role table access, `401` for anon, and confirmed both `chat_turn_effects` and `chat_tool_executions.effect_id`. Hosted type regeneration now reports 240 tables; RPC drift remains aligned at 203 names because this slice adds only trigger functions, not PostgREST-callable RPCs.

The slice deliberately creates no reserve/begin RPC, does not set `chat_turn_runs.irreversible_boundary_at`, and creates no admission, claim, queue consumer, or provider path.

## Phase 2B Slice 2 — fenced mutation-effect RPCs applied to hosted schema

Migration: `supabase/migrations/20260801041100_agentic_chat_worker_effect_rpcs.sql`

Current reviewed local migration SHA-256: `0a22d5aac48582a2faec85c05ba037e36eda3f51c0d12d9e530f5f29886f901f`.

Proof:

- `supabase/tests/20260801041100_agentic_chat_worker_effect_rpcs.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2b-effect-rpcs.postgres.test.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.ts`

This slice adds exactly three service-only RPCs and no execution path:

- `reserve_agentic_chat_effect` resolves an existing stable effect before checking current ownership; a new row requires the exact running worker turn, queue job, processing token, current execution generation, user, `turnRunId`, and correlation relationship. Creation and the turn's first `mutation_reserved_at` commit atomically while `irreversible_boundary_at` remains null.
- `begin_agentic_chat_effect` re-resolves the effect under the serialized turn lock, rejects an accepted cancellation or stale owner, and atomically commits `reserved -> started` with the turn's first `irreversible_boundary_at`. Only the single response with `outcome='started'` and `invokeAdapter=true` may invoke the mutating adapter; every duplicate receipt returns `invokeAdapter=false`.
- `reconcile_agentic_chat_effect` records current-owner-fenced `started -> succeeded/failed/uncertain`, safely cancels an unstarted reservation, returns immutable terminal receipts idempotently, and permits explicit service reconciliation from `uncertain -> succeeded/failed` by stable effect id without granting another invocation.

Stable identity is `effect_id` plus turn/logical tool scope and canonical argument hash. Provider tool-call id and reservation execution generation remain telemetry/fencing context, not effect idempotency keys: the proof rejects a stale generation but allows a new current generation to resume the same still-reserved effect without rewriting its original reservation generation. A same-id/hash lost-response retry can also recover the existing receipt after queue ownership changes; a different hash, tool/op scope, or downstream-idempotency capability is a hard conflict.

The shared `ChatTurnEffectRpcResultV1` is a discriminated result contract: `invokeAdapter: true` is type-reachable only for `outcome: 'started'`; `reserved`, `reconciled`, and `existing` are receipt-only.

The disposable fixture proves direct and definer-wrapper privilege denial, exact queue metadata/user/token/current-generation relationships, reservation/boundary atomicity, different-hash conflict, provider-id nonidentity, cancel-before-begin safety, stale-owner rejection without partial writes, cross-generation stable-effect recovery, uncertain no-retry behavior and explicit reconciliation, immutable terminal duplicate receipts, genuine two-connection single-winner begin contention, rollback isolation, and legacy/Phase 2A compatibility. Current validation is 8 PostgreSQL files / 9 tests, 72 non-PostgreSQL agentic-chat files / 717 tests, 2 shared-types files / 15 tests plus shared-types typecheck, and web `svelte-check` at 0 errors / 0 warnings.

The exact reviewed hash was applied from an isolated migration workdir containing the hosted receipts plus `20260801041100`. The hosted ledger had already advanced through the unrelated `20260802010000` web-visit receipt, so `--include-all` was used only in that isolated directory. The pre-apply dry run named exactly `20260801041100_agentic_chat_worker_effect_rpcs.sql`; application succeeded; the post-apply dry run reported the remote database up to date; and the ledger now shows `local=remote=20260801041100` without replaying `20260802010000`.

A live PostgREST OpenAPI probe returned `200` for service role with all three RPC paths present. The anon probe returned `401` and exposed none of the three paths. Hosted regeneration remains at 240 tables / 13 views, adds the three RPC argument contracts with `Json` returns, and captures the unrelated already-hosted web-visit columns. RPC drift is aligned at 206 function names. The OpenAPI generator suite passes 3/3; shared-types tests pass 2 files / 15 tests; shared-types typecheck and CJS/ESM/declaration build pass.

## Phase 2B Slice 3A — atomic worker admission applied to hosted schema

Migration: `supabase/migrations/20260802020000_agentic_chat_worker_atomic_admission.sql`

Applied migration SHA-256: `b46f33e86cf589a56d6c693dbf1dac58e3a05f3981cf354dc898b0fcbafa3eee`.

Proof and compatibility changes:

- `supabase/tests/fixtures/agentic_chat_worker_phase2b_admission_claim_base.sql`
- `supabase/tests/20260802020000_agentic_chat_worker_atomic_admission.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2b-admission-claim.postgres.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/session-service.ts`
- `apps/web/src/lib/services/agentic-chat-v2/session-service.test.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.ts`

The service-only `create_agentic_chat_turn_with_job` RPC is one transaction boundary for worker admission. It takes the same per-user advisory lock as legacy turn admission, resolves `(user_id, client_turn_id)` duplicates before pressure, prompt consumption, or writes, preserves the stored execution mode on a duplicate, enforces hard caps of two running and twenty queued turns plus the server-observed pressure decision, and returns a typed capacity result before creating a session, consuming a prepared prompt, or inserting a message, turn, artifact, or queue row.

After the capacity gate it resolves or creates the session, rejects another active turn, selects and locks the bounded pre-message history lineage, validates trusted prepared-prompt scope/expiry/hash/surface/content before consuming it, and atomically creates the queued worker turn, immutable input artifact, exactly-once user message, stable-dedup `agentic_chat_turn` queue job, and all relationship links. A failed transaction leaves none of those objects behind. The database selects and locks the permitted source-message lineage; the trusted gateway supplies the canonical frozen artifact and byte/hash claims, which the later worker reader must verify again before execution.

Legacy daily-brief session creation predates the admission advisory lock, so the migration adds a preflighted unique partial key for one active `(user_id, entity_id)` daily-brief session. The compatible legacy session service now catches SQLSTATE `23505` and adopts the canonical concurrent winner. A read-only hosted preflight found 12 active daily-brief rows across 12 canonical keys, zero duplicate keys, zero duplicate rows, and a maximum of one row per key.

The proof covers duplicate-first behavior under pressure and consumed prepared input, request-hash/session conflicts, immutable frozen history despite source-message mutation, no-orphan capacity rejection and the hard queued cap, canonical daily-brief resolution, legacy stored-mode convergence, genuine concurrent inline duplicate admission with one session/turn/message, complete package rollback, exact service-only grants, and signed-role denial through a definer wrapper.

## Phase 2B Slice 3B — queue claim/current-generation fencing applied to hosted schema

Migration: `supabase/migrations/20260802020100_agentic_chat_worker_claim_fencing.sql`

Applied migration SHA-256: `b8e9e6c3855e19ac124b9b86981824717cee65e5294dbe986f6c1dbeb50c3d8e`.

Proof and result contract:

- `supabase/tests/20260802020100_agentic_chat_worker_claim_fencing.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2b-admission-claim.postgres.test.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.ts`

The service-only `claim_agentic_chat_turn` RPC bridges an already-claimed chat-only queue envelope into domain ownership. Under the shared turn-first lock order it validates the exact `agentic_chat_turn` job, processing status/token, stable dedup key, queue user, turn/job/correlation metadata, immutable input-artifact scope, and worker execution mode. A safe `queued -> running` winner increments `execution_generation` exactly once, records worker start/progress ownership, and atomically creates or resets `chat_turn_stream_state` to empty text/projection and zero cursors for that generation.

A repeat with the same live queue token returns `matching_current_claim` without incrementing the generation, while a wrong token or forged envelope is rejected. Terminal turns and queued turns with an accepted cancellation return typed non-start results. A new generation is rejected if execution, mutation reservation, an irreversible boundary, or terminalization already exists. `execution_started_at` is deliberately untouched: a later fenced primitive must own the immediate-before-provider boundary.

Because active input artifacts are immutable and service role intentionally has no artifact `UPDATE`, claim checks artifact scope with a plain read rather than a row lock that would require update privilege; turn ownership still serializes the governing relationship. The proof covers generation 1, idempotent repeats, ownership loss, forged metadata, cancellation winning before claim, rollback isolation, a simulated safe generation-2 retry with a complete stream-state reset, stale stream-generation rejection, and a genuine two-connection claim race yielding one `claimed` plus one `matching_current_claim` at a single generation.

These two slices create no queue consumer or generic queue claimer, make no provider/model call, and add no cancellation, terminal finalization, retry classifier, recovery loop, event writer, or client transport.

## Phase 2B Slice 4 — event identity and terminal control applied to hosted schema

Migrations, in required order:

- `20260802029900_agentic_chat_worker_message_idempotency_guard.sql`
- `20260802030000_agentic_chat_worker_event_identity_foundation.sql`
- `20260802030100_agentic_chat_worker_create_event_generation_index.sql`
- `20260802030200_agentic_chat_worker_create_event_identity_index.sql`
- `20260802030300_agentic_chat_worker_validate_event_identity_indexes.sql`
- `20260802030400_agentic_chat_worker_drop_legacy_event_sequence.sql`
- `20260802030500_agentic_chat_worker_terminal_control_rpcs.sql`

Applied SHA-256 values, in that order: `3daba0c48023d3d977ea5fecf284389c207882f584cd2b64363c734588dd7e0f`, `5c97127ea9d70b21441a6e2c0ceeeef73a7ed94646d6aad5cf2c5d6903b9ea0d`, `9dfc871bec0afeca791b4e0abd912690df9e6d063775e704d8f74675cdae2ceb`, `e8d876d1fd99d0737f48865c6483fadd2b62cca2de349c7e8bf20e1d8cfedc05`, `b26610977f88b0b1d0bb38f085f3a2cf32ab1c746fcb8743cfd025eb7d266b1b`, `8b09f06c99429784f7386e3a0439f69f0fe7622217b0b0ec4659d3a1ea03493b`, and `198280b157de39f8e44b18d96e675867801e532ae2847a40dae40b026834e3ea`.

Proof and shared contract:

- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2B_SLICE_4_REMEDIATION_PLAN_2026-08-02.md`
- `supabase/tests/fixtures/agentic_chat_worker_phase2b_message_idempotency_collision.sql`
- `supabase/tests/20260802029900_agentic_chat_worker_message_idempotency_guard.test.sql`
- `supabase/tests/fixtures/agentic_chat_worker_phase2b_terminal_control_legacy_event.sql`
- `supabase/tests/20260802030400_agentic_chat_worker_event_identity.test.sql`
- `supabase/tests/20260802030500_agentic_chat_worker_terminal_control.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2b-terminal-control.postgres.test.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.ts`

The message guard reserves only exact `chat-turn:<uuid>:user|assistant` idempotency keys for service-role/admin writes. Authenticated ordinary and legacy `turn:<client-id>:...` messages remain compatible, while a signed authenticated request cannot preempt a future worker terminal key through a definer wrapper. Existing reserved rows must already be linked to the corresponding turn/message/role or the migration fails its preflight.

The event package closes a prerequisite correctness gap before terminal writes exist. Claim resets `last_event_sequence` to zero for every new execution generation, but the hosted `chat_turn_events` uniqueness key is still `(turn_run_id, sequence_index)`. Slice 4 backfills every historical event to generation zero with deterministic `<turn_run_id>:<generation>:<sequence>` identity, guards all new writes against the owning turn's current scope/generation, makes event rows immutable, builds both replacement unique indexes concurrently, validates the indexes and staged constraints, promotes both columns to `NOT NULL`, and only then removes the old turn-wide sequence constraint. `event_id` retains a trigger-consumed empty sentinel default so hosted OpenAPI regeneration keeps it optional for the still-live legacy event writer; the sentinel cannot persist past the validator. A retry generation can therefore restart at sequence one without colliding with retained prior-generation events.

The service-only `request_agentic_chat_turn_cancel` RPC locks the turn first. A queued turn atomically cancels its queue row and finalizes a generation-zero cancelled turn with no synthetic assistant message. A running turn records only the first accepted reason/timestamp and inserts or resolves one immutable cancellation signal. A terminal turn returns its stored immutable receipt. Repeated requests cannot rewrite the first reason/source/signal.

The service-only `finalize_agentic_chat_turn` RPC is the one worker-mode terminal linearization point. A running caller must present the exact queue id, live processing token, current execution generation, queue user/dedup/turn/correlation envelope, and allowed predecessor state. A queued predecessor is accepted only for cancellation. Completion and failure are typed no-ops after an accepted cancellation; cancelled finalization requires that request. Terminal duplicates resolve the committed receipt before stale request payload or ownership is considered.

| Locked turn truth                  | Requested terminal outcome         | Result                               |
| ---------------------------------- | ---------------------------------- | ------------------------------------ |
| already terminal                   | any retry payload/token/generation | immutable `already_terminal` receipt |
| active, stale generation           | any                                | typed `stale_generation`, no write   |
| queued, accepted cancel            | `cancelled`                        | commit queued cancellation           |
| queued                             | `completed` / `failed`             | reject invalid predecessor           |
| running, no cancel                 | `completed` / `failed`             | commit terminal outcome              |
| running, accepted cancel           | `completed` / `failed`             | typed `cancel_requested`, no write   |
| running, accepted cancel           | `cancelled`                        | commit cancelled outcome             |
| active, wrong queue/token/envelope | any otherwise-valid outcome        | fail closed with ownership loss      |

One transaction persists or resolves the deterministic assistant-message idempotency key, exact complete accumulated assistant text, independently optional nonnegative provider token counts, terminal stream projection/cursors, deterministic durable `done` event, and turn status/reason/failure/message/event/timestamps. Complete token arithmetic is checked as `bigint` only when all three counters exist. A concurrent exact message winner is reselected and adopted in the same call, while incomplete authoritative worker metadata fails closed. Completed turns always own exactly one assistant message, including empty output; failed/cancelled turns own at most one message and only when partial text is nonempty; queued cancellation creates none. Cancellation and terminal timestamps are captured only after their governing locks. Stream state is conservatively marked `reconcile_required=true` because Broadcast is post-commit and is not part of this package.

Running queue rows intentionally remain `processing` after domain finalization. The later chat-specific recovery package is responsible for reconciling a terminal domain row if generic queue completion fails; generic stalled recovery remains forbidden from replaying `agentic_chat_turn`. Queued cancellation is different: the terminal transaction cancels the unstarted queue row and clears any generic processing token so a late claim cannot begin model work.

The proof includes reserved-key direct/wrapper denial with legacy-key compatibility; insert-optional event identity and generation-zero backfill; valid cross-generation sequence reuse; same-generation duplicate and stale-event rejection; event immutability; queued cancellation after generic processing starts; completed-empty, failed-empty, partial-message, and partial-token rules; exact terminal projection/event state; lost-response idempotency; exact pre-existing and concurrent assistant-message adoption; malformed metadata denial; stale-generation and forged-token rejection; running queue ownership preservation; full transaction rollback; post-lock timestamps; genuine two-connection completion-first, cancel-first, claim-versus-cancel, and message-winner races; and package-only rollback while earlier Phase 2B RPCs remain intact. The focused PostgreSQL runner passes 3/3, the complete PostgreSQL gate passes 10 files / 14 tests, the complete `agentic-chat-v2` suite passes 82 files / 734 tests, the session-service file passes 9/9, the shared worker-contract file passes 11/11, the shared-types package passes 16/16 plus typecheck/build, the OpenAPI generator passes 3/3, and web `svelte-check` reports zero errors and zero warnings.

Hosted application completed on 2026-08-02 from a receipt-isolated workdir. The read-only preflight found 10,324 legacy event rows, zero invalid event scopes, zero duplicate turn/sequence groups, zero reserved worker-message keys, zero worker-mode turns/events, and no conflicting target columns or indexes. The dry run named only `20260802029900`–`20260802030500`; all seven migrations applied in order; the post-apply dry run was empty; and the ledger shows local/remote parity through `20260802030500`. All 10,324 events now have valid generation-zero identities, both replacement indexes are ready/valid/unique, both staged checks are validated, and the old turn-wide sequence constraint is absent. Live OpenAPI exposes both terminal RPCs to `service_role` and neither to `anon`; regenerated types/schema align at 240 tables / 13 views and 210 RPC names.

This package remains inert: it contains no application call site, API route, notification/Broadcast, queue consumer, provider/model call, execution-start boundary, billing-gate call, or retry/recovery loop. The worker must perform the decided terminal consumption-gate re-evaluation when the execution path is later wired; terminal database atomicity must not be weakened by a failure-prone external follow-up.

## Phase 2B Slice 5 — execution-start fence and chat recovery hosted

Applied migration: `20260802031000_agentic_chat_worker_execution_recovery.sql`

Applied SHA-256: `0885c69b21f468152c96884028a33fc98ea061b0dbc3cfd5aed47a06714f6736`.

Plan, proof, and shared contract:

- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2B_SLICE_5_EXECUTION_RECOVERY_PLAN_2026-08-02.md`
- `supabase/tests/20260802031000_agentic_chat_worker_execution_recovery.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2b-execution-recovery.postgres.test.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.test.ts`

`begin_agentic_chat_turn_execution` is the immediate-before-provider linearization point. It follows turn-then-queue lock order, validates the complete processing-token/user/dedup/turn/correlation/generation/input-artifact envelope, rejects accepted cancellation and stale 300-second input, and atomically sets the post-lock `execution_started_at` receipt. Exactly one caller returns `outcome='started'` with `invoke_provider=true`; every duplicate returns the immutable `already_started` receipt with `invoke_provider=false`. A lost response therefore fails closed rather than authorizing a second provider call.

`recover_agentic_chat_turn` replaces the generic queue's retry-by-default behavior with the locked `agentic_chat_error_v1` taxonomy. It can atomically return the domain turn to `queued` and the exact owned queue row to `pending` only for `transient_infra`, `provider_throttle`, or the first `timeout_pre_start`, while `execution_started_at`, mutation boundaries, any effect row, stale context, exhausted attempts, and all unmapped/unknown classes forbid whole-turn replay. Reserved/started/uncertain effects return `effect_reconciliation_required`; accepted cancellation returns `finalize_cancelled`; nonretry cases return `finalize_failed`; stale generations are typed no-ops. A terminal domain turn reconciles its still-processing queue row to the identical terminal status without executing work, and repeats return `already_reconciled`.

The PostgreSQL proof includes service-only and signed-definer-wrapper denial, lost-response start replay, stale-input start denial, safe retry plus duplicate recovery, one-time timeout and exhaustion, unknown/post-start/mutation/effect fail-closed decisions, terminal queue reconciliation, forged-token and stale-generation rejection, transaction rollback, post-lock timing, exactly-one concurrent start authorization, and genuine start-first/recovery-first races. The defensive retry predicate requires both clean boundary timestamps and zero effect rows of any state, so corrupted boundary metadata cannot replay a turn with a completed external effect.

Current validation after Slice 5: the focused shared contract passes 14/14; the shared-types package passes 19/19 plus typecheck/build; the focused execution/recovery PostgreSQL runner passes 1/1; the cumulative PostgreSQL gate passes 11 files / 15 tests; the complete `agentic-chat-v2` suite passes 83 files / 736 tests; and web `svelte-check` reports zero errors and zero warnings.

Hosted application completed on 2026-08-02. The read-only preflight found zero active worker-mode turns and no conflicting target RPCs. A receipt-isolated workdir contained the 40 exact hosted receipts plus only `20260802031000`; `20260802032000_native_search_query_cache.sql` was intentionally excluded and remained unapplied at this Slice 5 gate. The source and staged migration hashes matched, the dry run named only `20260802031000`, application succeeded, the post-apply dry run reported the remote database up to date, and the linked ledger showed exact local/remote parity for `20260802031000`. Hosted OpenAPI exposes both new RPCs to `service_role` and neither to anonymous clients; regenerated types/schema aligned at 240 tables / 13 views and RPC drift was clean at 212 function names at this gate. The native-search `20260802032000` receipt was subsequently applied and verified later on 2026-08-02.

This package remains inert. It adds no worker processor/caller, provider invocation, queue consumer registration, publisher, cancellation observer, sweep timer, feature-flag change, or automatic terminal-finalization loop.

## Phase 2C Slice 1 — stream persistence hosted and verified

Local migrations:

- `20260802033000_agentic_chat_worker_stream_write_foundation.sql`
- `20260802033100_agentic_chat_worker_create_transition_index.sql`
- `20260802033200_agentic_chat_worker_stream_write_rpcs.sql`

Implementation record:

- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2C_SLICE_1_STREAM_PERSISTENCE_PLAN_2026-08-02.md`
- `supabase/tests/20260802033200_agentic_chat_worker_stream_write_rpcs.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2c-stream-write.postgres.test.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.test.ts`

This slice establishes the database boundary required by the later bounded publisher. `persist_agentic_chat_text_batch` appends one complete coalesced assistant prefix without creating token/event rows. `persist_agentic_chat_semantic_event` atomically stores one immutable nonterminal event and the complete UI projection. `flush_agentic_chat_text_batches` accepts at most 128 items / 16 MiB and isolates every item in its own subtransaction, so a bad turn cannot roll back another turn's accepted prefix.

Both individual writers preserve the hosted `turn -> queue -> stream` lock order, validate the exact service role, worker mode, execution generation, queue job, processing token, user/dedup/turn/correlation envelope, running status, cancellation, stream cursor, prefix, and size bounds, and allocate `last_event_sequence + 1` only while the turn is locked. A newly committed write alone returns `publish_allowed=true`; stale, cancelled, terminal, duplicate, and rejected writes return or fail with no publication authority. Lost-response text replay is recognized by the latest batch receipt on stream state, while semantic replay uses a generation-scoped transition UUID and concurrent unique partial index. Every committed write marks `reconcile_required=true`; the later publisher acknowledgement owns its safe clearing after successful Broadcast.

The ordinary semantic writer rejects `done`, `text`, and `text_delta`, preserving the existing rule that only `finalize_agentic_chat_turn` can create terminal truth. Existing claim remains signature-compatible: the revised stream validator clears additive text receipts when claim advances the generation even though its hosted upsert names only the original reset columns.

The focused PostgreSQL proof is green at 1/1 and covers signed-definer denial, immediate first-text plus three semantic writes with sequences 1–4, replay suppression, conflicting identity denial, isolated mixed batches, stale/cancelled/terminal no-writes, injected event/projection rollback, genuine two-connection sequence contention, generation reset, and package-only rollback. The cumulative PostgreSQL gate is 12 files / 16 tests; the complete `agentic-chat-v2` suite is 84 files / 737 tests; the shared worker contract is 15/15; the shared-types package is 20/20 plus typecheck/build; and web `svelte-check` reports zero errors and zero warnings.

Hosted application completed on 2026-08-02. The read-only preflight found zero active or historical worker-mode turns, 10,324 existing events, and no target-object conflicts. A receipt-isolated dry run named only `20260802033000`–`20260802033200`; the reviewed and staged hashes matched; all three receipts applied in order; and the post-apply dry run reported the remote database up to date. The linked ledger is aligned through `20260802033200`, the concurrent generation-scoped transition index exists, service-role OpenAPI exposes all three RPCs while anonymous access is denied, and the target stream/event columns are live. Regenerated types/schema align at 241 tables / 13 views and RPC drift is clean at 220 function names. The OpenAPI type-generator proof passes 3/3. The package adds no application publisher/caller, Realtime policy, cancellation observer, reconciliation route, queue consumer, provider/model execution, or enabled worker route.

## Phase 2C Slice 2 — bounded publisher hosted and verified

Hosted migration:

- `20260802034000_agentic_chat_worker_stream_delivery_ack.sql`

Implementation record and proof:

- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2C_SLICE_2_PUBLISHER_PLAN_2026-08-02.md`
- `apps/worker/src/workers/agentic-chat/streamPublisher.ts`
- `apps/worker/src/workers/agentic-chat/supabaseStreamPublisherAdapters.ts`
- `apps/worker/tests/agenticChatStreamPublisher.test.ts`
- `supabase/tests/20260802034000_agentic_chat_worker_stream_delivery_ack.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2c-stream-delivery-ack.postgres.test.ts`

The inert publisher uses one worker-level scheduler and one ordered per-turn operation queue across text and semantic writes. It persists first text immediately, coalesces steady-state text, batches ready turns through the Slice 1 flush RPC, caps cross-turn semantic concurrency, and never Broadcasts without a newly persisted receipt carrying explicit publication authority. Broadcast and acknowledgement remain inside the per-turn slot, so later semantic/text work cannot pass an unresolved delivery boundary.

Realtime uncertainty is fail-closed. A lost persistence response, duplicate receipt, Broadcast failure, non-exact acknowledgement, or receipt-scope mismatch moves that generation into reconcile-only mode; later full live events stay suppressed, hints are rate-limited, and durable `reconcile_required` remains authoritative. Per-turn/worker soft pressure exposes an awaitable relief signal, hard bounds produce a complete-prefix `publisher_overload` error, terminal Broadcast retries are bounded, permanent database rejections do not spin, shutdown is a single idempotent bounded drain, and the Supabase adapter's private user-topic cache is bounded with explicit release.

The new service-only acknowledgement RPC preserves `turn -> queue -> stream` lock order and clears `reconcile_required` only when the supplied generation and delivered sequence exactly equal the current durable snapshot. Its SHA-256 is `68b13b8263dd7bce619025ad8e7e6619dc53870193ce8a5a855f510dc9d14267`. Disposable PostgreSQL proves exact/idempotent clearing, older/stale no-ops, forged-token and future-sequence denial, signed-definer denial, service-only grants, and rollback.

Validation is green at 11/11 focused publisher/adapter tests; 68 worker files / 575 tests; worker typecheck/build/lint guardrails; 13 Agentic Chat PostgreSQL files / 17 tests; 85 complete `agentic-chat-v2` files / 738 tests; 16/16 shared worker-contract tests; 21/21 shared-types tests plus typecheck/build; and web `svelte-check` with zero errors and zero warnings.

Hosted application completed on 2026-08-02. The read-only preflight found zero historical or active worker-mode turns, zero reconcile-pending worker stream rows, and no conflicting target RPC. The reviewed and receipt-isolated staged SQL matched SHA-256 `68b13b8263dd7bce619025ad8e7e6619dc53870193ce8a5a855f510dc9d14267`; the isolated dry run named only `20260802034000`; application succeeded; the post-apply dry run was empty; and the linked ledger is aligned through `20260802034000`. Service-role OpenAPI exposes the exact RPC, the service probe reaches its fail-closed identity validation, anonymous invocation is denied with `42501`, and the worker-turn count remained zero. Regenerated types/schema align at 241 tables / 13 views, RPC drift is clean at 221 function names, and the OpenAPI generator proof passes 3/3.

No queue consumer, provider/model invocation, browser reconciliation path, Realtime authorization policy, feature-flag change, or enabled worker route was added.

## Phase 2C Slice 3 — batched cancellation observer hosted and verified

Local migration:

- `20260802035000_agentic_chat_worker_cancel_observation.sql`

Implementation record and proof:

- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2C_SLICE_3_CANCELLATION_OBSERVER_PLAN_2026-08-02.md`
- `apps/worker/src/workers/agentic-chat/cancellationObserver.ts`
- `apps/worker/src/workers/agentic-chat/supabaseCancellationObserverAdapter.ts`
- `apps/worker/tests/agenticChatCancellationObserver.test.ts`
- `supabase/tests/20260802035000_agentic_chat_worker_cancel_observation.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2c-cancel-observation.postgres.test.ts`

The new RPC accepts at most 128 unique exact-generation identities, locks matching current turns in deterministic UUID order, returns only accepted cancellations for current running worker generations, and idempotently records signal consumption without making cancellation disappear on replay. Malformed/fractional identities, duplicate turns, corrupt signal state, signed-definer authenticated calls, and over-bound batches fail closed. Stale, unknown, uncancelled, and terminal entries return no row.

The inert worker observer uses one 500 ms loop and one non-overlapping batch RPC for every registered turn; it never creates per-turn timers or queries. Exact receipts abort only their matching controller with a typed durable reason, RPC failure retries on the next interval without aborting, invalid response scope cannot abort a newer generation, registration is capacity-bound, and shutdown is idempotent. The migration SHA-256 is `e547916267396c87160018af8d34863c1e887ab11c0f5252d9a2e9763ef1ec8d`.

Validation is green at 11/11 focused observer/adapter tests; 69 worker files / 586 tests; worker typecheck/build/lint guardrails; 14 Agentic Chat PostgreSQL files / 18 tests, including a genuine two-connection cancel/observe race; 86 complete `agentic-chat-v2` files / 739 tests; 17/17 shared worker-contract tests; 22/22 shared-types tests plus typecheck/build; and web `svelte-check` with zero errors and zero warnings. A scheduler timing assertion that failed only while four large validation commands competed for the host passed in isolation and in the subsequent complete worker run; the implementation record retains the exact diagnostic.

Hosted application completed on 2026-08-02. The read-only preflight found the ledger aligned through `20260802034000`, no target RPC, zero worker-mode turns, and zero reconcile-pending worker stream rows. A receipt-isolated workdir contained the 46 exact hosted receipts plus only `20260802035000`; the staged hash matched the reviewed source; the dry run named only that migration; application succeeded; the post-apply dry run was empty; and the linked ledger shows exact local/remote parity. Service-role OpenAPI exposes the RPC and returns `200 []` for an exact empty batch, while anonymous invocation is denied with `401` / SQLSTATE `42501`. The worker-turn count remained zero. Regenerated types/schema align at 241 tables / 13 views, RPC drift is clean at 222 function names, and the OpenAPI generator proof passes 3/3.

No queue consumer, provider/model invocation, targeted notification transport, combined execution abort assembly, cancellation finalizer wiring, private Realtime policy, browser reconciliation path, feature-flag change, or enabled worker route was added.

## Phase 2C Slice 4 — private per-user Realtime authorization hosted

Hosted migration:

- `20260802036000_agentic_chat_private_realtime_authorization.sql`

Implementation record and proof:

- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2C_SLICE_4_PRIVATE_REALTIME_AUTH_PLAN_2026-08-02.md`
- `supabase/tests/20260802036000_agentic_chat_private_realtime_authorization.test.sql`
- `supabase/tests/fixtures/agentic_chat_realtime_authorization_base.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2c-private-realtime-authorization.postgres.test.ts`

The migration replaces any same-name policy with one exact `SELECT TO authenticated` rule for Broadcast joins on the attempted `chat-user:<auth.uid()>` channel returned by `realtime.topic()`. Its anchored topic check rejects malformed UUIDs, suffixes, alternate prefixes, and other topic families before casting, and the extension guard prevents accidental Presence authorization. It adds no authenticated or anonymous publish policy; browser roles remain receive-only, while the service role continues publishing through its existing RLS bypass. The migration SHA-256 is `6e4dde1da09e4e32614def74f4c4983c020cacd784b5226e16dbf23c32123617`.

Disposable PostgreSQL proves restrictive replacement of a permissive prior policy, two-user exact-topic isolation, anonymous denial, authenticated/anonymous insert denial, service publication, idempotent reapplication, and package-only rollback. Validation is green at 1/1 focused proof.

Hosted application completed on 2026-08-02 from a receipt-isolated workdir containing the 47 exact pre-existing hosted receipts plus only `20260802036000` and `20260802037000`. Both staged files matched their reviewed source hashes, the dry run named exactly those two migrations in order, application succeeded, the post-apply dry run reported the remote database up to date, and the linked ledger shows exact local/remote parity for `20260802036000`. The migration deterministically replaced the absent same-name policy with the exact reviewed receive-only definition. No production browser subscription, queue consumer, provider/model invocation, feature-flag change, or enabled worker route was added.

## Phase 2C Slice 5 — generation-consistent reconciliation hosted

Hosted migration:

- `20260802037000_agentic_chat_worker_reconciliation.sql`

Implementation record and proof:

- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2C_SLICE_5_RECONCILIATION_PLAN_2026-08-02.md`
- `supabase/tests/20260802037000_agentic_chat_worker_reconciliation.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2c-reconciliation.postgres.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/reconciliation.server.ts`
- `apps/web/src/routes/api/agent/v2/turns/[id]/reconcile/+server.ts`

The service-only RPC takes the exact owned turn lock before reading stream state, current-generation retained events, terminal receipt, and final assistant message. It returns a complete projection and authoritative cursors, ignores stale-generation cursors, hides foreign ownership behind the same `not_found` outcome, permits an empty admitted generation-zero turn, and rejects stream/cursor/message/terminal corruption. The retained post-projection event window is hard-bounded at 64. The authenticated endpoint derives `user_id` only from the session, validates unambiguous generation/cursor inputs, uses a runtime-validating server adapter, returns private no-store responses, and never exposes database failure details.

Disposable PostgreSQL proves service-only grants, signed-definer denial, current/stale/queued/terminal outcomes, ownership privacy, cursor and stream corruption, the event bound, idempotent application/rollback, and a genuine two-connection generation-reset race. The migration SHA-256 is `8e9d377a58e58357f864cffc7d2ac69a46a1eb4eefd45e8afdb0dd1d916d0840`. Validation is green at 1/1 focused PostgreSQL proof, 12/12 focused adapter/route tests, 16 Agentic Chat PostgreSQL files / 20 tests, 91 complete `agentic-chat-v2` files / 762 tests, 24/24 shared-types tests plus typecheck/build, worker typecheck, and web `svelte-check` with zero errors and zero warnings.

Hosted application completed on 2026-08-02 in the same exact receipt-isolated set as Slice 4. The linked ledger shows local/remote parity for `20260802037000`, and the post-apply dry run is empty. Live PostgREST exposes the RPC to `service_role`, returns `200` with the ownership-safe `not_found` shape for an unknown identity, hides it from anonymous OpenAPI, and denies anonymous execution with `401` / SQLSTATE `42501`. Regenerated hosted types/schema align at 241 tables / 13 views and 223 RPC names; RPC drift is clean and the OpenAPI generator proof passes 3/3. No browser event application, polling fallback, queue consumer, provider/model invocation, feature-flag change, or enabled worker route was added.

## Phase 2D Slice 1 — private channel and bounded reconciliation inbox local and inert

Implementation record and proof:

- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_1_REALTIME_INBOX_PLAN_2026-08-02.md`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-channel.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-channel.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-inbox.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-inbox.test.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.ts`
- `apps/worker/src/workers/agentic-chat/streamPublisher.ts`

The shared contract now owns both Broadcast event names and the reconcile-hint payload. The browser channel opens only the exact private user topic, exposes observable readiness, relies on the Supabase client's auth propagation and transient channel rejoin, and replaces a terminally closed channel with one bounded channel-level timer. It exposes no send path.

The per-turn inbox accepts only explicitly registered worker handles, begins in reconcile/buffer mode, ignores other tabs' turns, applies only exact-scope deterministic current-generation events, suppresses duplicates, and never advances across a sequence gap. Reconciliation applies complete snapshot truth first, adopts the response watermark, then applies only contiguous buffered events above it. Each tracked turn is bounded to 128 events / 1 MiB; overflow drops only Realtime acceleration and forces another durable reconciliation. At most eight turns can be tracked by one inbox.

Validation is green at 15/15 focused channel/inbox tests, 91 complete `agentic-chat-v2` files / 762 tests, 69 worker files / 586 tests plus typecheck, 24/24 shared-types tests plus typecheck/build, and web `svelte-check` with zero errors and zero warnings. The intended Svelte integration boundary has zero analyzer issues; an unrelated existing mutable-`Date` suggestion remains outside scope.

This slice has no migration. At Slice 1 completion it was intentionally inert with no production import/construction site. Phase 2D Slice 2 now mounts it behind an authenticated handle-free coordinator; no worker handle is registered and legacy SSE behavior remains unchanged.

## Phase 2D Slice 2 — mounted private channel and reconciliation coordinator local and handle-free

Implementation record and proof:

- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_2_MOUNTED_RECONCILIATION_PLAN_2026-08-02.md`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-coordinator.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-coordinator.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-runtime.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-runtime.test.ts`
- `apps/web/src/lib/components/agent/AgentChatModal.svelte`

The coordinator converts inbox requests into same-origin authenticated reconciliation calls carrying the inbox's exact execution-generation and durable-sequence cursor. Each registered turn has at most one request in flight; concurrent reasons coalesce; reconciliation is immediate on registration/gaps/hints/channel transitions and visible-tab/network wake; a jittered approximately two-second watchdog backs off to five seconds when durable truth is unchanged; and terminal truth stops polling. Pause, auth loss, unregistration, or teardown aborts work, clears timers, and fences late results.

HTTP/network failures and invalid or application-rejected receipts release the inbox latch while preserving reconcile/buffer mode, then retry through one five-second timer. The final review caught and fixed an invalid-receipt path that could otherwise synchronously requeue and spin. The exact private user channel now follows Supabase auth identity at `AgentChatModal` mount: it stays paused before authentication, preserves the same channel across token refresh, replaces it on user change, closes on sign-out, and survives the modal's hidden keep-alive lifecycle.

The production runtime intentionally has no registered worker handle yet. It can establish the receive-only private channel, but it makes no turn reconciliation request and cannot change Send, Stop, detach, session recovery, or legacy SSE routing until the next API/lease/adapter slice supplies a server-authoritative worker handle.

The 2026-08-03 post-implementation audit also closed terminal-channel replacement cleanup, partial channel-construction failure, false reconnect reporting, in-flight latch retention after stop, tracked-observer retention across auth/teardown, malformed authenticated identity, synchronous auth-subscription setup cleanup, and synchronous auth-event versus initial-lookup races. Validation is green at 34/34 focused channel/inbox/coordinator/runtime tests, 24/24 unchanged legacy stream-controller tests, Svelte analyzer with no issues, and web `svelte-check` with zero errors and zero warnings. This slice adds no migration or hosted mutation.

## Phase 2D Slice 3 — signed transport lease and owned-turn gateway local and legacy-only

Implementation record and proof:

- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_3_TRANSPORT_GATEWAY_PLAN_2026-08-03.md`
- `apps/web/src/lib/services/agentic-chat-v2/transport-lease.server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/transport-decision.server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-gateway.server.ts`
- `apps/web/src/routes/api/agent/v2/transport/+server.ts`
- `apps/web/src/routes/api/agent/v2/turns/+server.ts`
- `apps/web/src/routes/api/agent/v2/turns/[id]/+server.ts`
- `apps/web/src/routes/api/agent/v2/turns/[id]/cancel/+server.ts`

The versioned `actl1` HMAC lease is short-lived, size-bounded, canonical, constant-time verified, and bound to authenticated user/client-turn/stream/context plus selected mode/contract, decision id, expiry, and worker kill epoch. Missing/weak secrets, tampering, noncanonical claims, cross-binding replay, future/expired leases, mode/contract drift, and stale worker epochs fail closed. `POST /transport` treats capabilities and a prior decision id only as hints: an owned persisted turn may recover its immutable decision, while every genuinely new decision is server-generated and forced to `legacy_sse` / `legacy_internal_v1`.

The owned-turn routes expose one exact worker descriptor, a bounded active-session list, and durable cancellation through the hosted service-only RPC. User identity and cancel source are server-derived; malformed/ambiguous/corrupt database results fail closed; missing, foreign, and non-worker identities share one not-found boundary; and internal details never enter client responses. Terminal identities must match the deterministic current-generation event with a positive durable sequence.

Validation is green at 43/43 focused transport/gateway tests, 77/77 combined Realtime/gateway edge tests, 101 complete Agentic Chat files / 830 tests, 24/24 unchanged legacy-controller tests, 24/24 shared-types tests plus typecheck/build, and zero web-check errors/warnings. No migration or hosted mutation was added. The production browser does not call these routes and routing remains disabled.

## Phase 2D Slice 4 — lease-verified atomic admission gateway local and inert

Implementation record:

- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_4_ATOMIC_ADMISSION_GATEWAY_PLAN_2026-08-03.md`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-admission.server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-admission.test.ts`

The service-only adapter invokes the exact hosted `create_agentic_chat_turn_with_job` signature and parses newly admitted, matching duplicate, active conflict, idempotency conflict, and bounded capacity receipts. It rejects any browser-execution authority, contradictory generated/request identities, corrupt queue/artifact/message relationships, malformed bounds, and database detail leakage. The shared result contract accurately permits a null client-turn id only for an active legacy conflict; newly admitted, matching-duplicate, and idempotency-conflict results still require the request's exact client-turn identity.

`worker-turn-preparation.server.ts` now builds the complete server-owned RPC input: normalized command/attachments, owned existing or inline session intent, deterministic turn preparation/surface/tools/session metadata, stable non-consuming prepared-prompt lineage, exact frozen model history and source ids, trusted context/system prompt/sections/tool surface/summary, canonical request and artifact hashes, exact UTF-8 byte counts, request payload/message metadata, and server UUIDs. Prepared rows are never claimed during preparation; the hosted transaction revalidates, locks, copies, and consumes them atomically. Inline-created sessions always carry empty `admission_window` history and null prepared lineage. Consumption/expiry after a successful admission leaves retry hash lineage stable.

The explicit capacity boundary requires fresh queue/provider/publisher evidence and defaults closed because the live collector does not exist yet. Authenticated `POST /api/agent/v2/turns` verifies a strict worker lease before admin-client construction, rejects legacy or stale leases, accepts no trusted client fields, invokes preparation and the atomic adapter once, returns a private immutable worker handle for new/matching worker admissions, hides conflict identities/details, and returns exact bounded `Retry-After` for capacity. Matching legacy duplicates fail closed. Transport negotiation remains legacy-only for new decisions.

Validation is green at 5 focused Slice 4 files / 30 tests, 104 complete Agentic Chat service/route/PostgreSQL files / 852 tests, 24/24 unchanged legacy-controller tests, 24/24 shared-types tests plus typecheck/build, and zero web-check errors/warnings. The restricted complete run hit only the documented localhost `EPERM`; the permission-correct rerun passed all 104 files / 852 tests. No migration or hosted mutation was added, the browser has no admission call site, and no worker handle is registered.

## Next work

The standalone continuation handoff is `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_NEXT_AGENT_HANDOFF_2026-08-03.md`.

1. Add the composed duplicate/reload/reconnect/gap/supersede/terminal-wait flow and close any still-uncovered two-scheduler start/cancel ordering at the executor boundary.
2. Prove immutable-history retry generations and prepared-artifact TTL/cleanup safety while keeping production startup, worker routing, live capacity, and real provider invocation disabled.
