<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2_HANDOFF_2026-07-31.md -->

# Agentic Chat Worker Migration: Phase 2 Implementation Handoff

**Prepared:** 2026-07-31 EDT

**Status:** Phase 2 has started. Phase 2A Slice 1 is implemented and locally verified but is not deployed. The worker rollout flag remains disabled, and no worker admission, queue job, Realtime transport, or asynchronous model execution exists.

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

## Phase 2A Slice 1 — implemented locally

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

## Proving tests

- `supabase/tests/20260801010000_agentic_chat_worker_phase2a_trust_foundation.test.sql`
- `supabase/tests/fixtures/agentic_chat_worker_phase2a_trust_base.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2a-trust-foundation.postgres.test.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.test.ts`

The disposable PostgreSQL test applies the Phase 1 admission migration first, then the Phase 2A migration, reruns the full Phase 1 admission SQL fixture against the locked-down schema, and verifies legacy defaults, artifact immutability/scope/retention/limits, execution-mode immutability, and role privileges.

Current focused results:

- Phase 2A disposable PostgreSQL contract: 1/1 passed, including the full Phase 1 admission fixture.
- Shared-types suite: 2 files / 14 tests passed.
- Shared-types typecheck: passed.
- Focused Phase 1/2A web regression: 14 files / 104 tests passed.
- `@buildos/agentic-chat-runtime`: 2 files / 4 tests passed; typecheck passed.
- `@buildos/web` Svelte check: 0 errors and 0 warnings.

## Deployment and rollback state

This migration has **not** been applied to hosted Supabase. Generated hosted database types have therefore intentionally not been refreshed. The unrelated existing timestamp-only change in `packages/shared-types/src/database.schema.ts` remains user-owned and untouched.

Read-only hosted checks confirm:

- remote migration history contains the Phase 1 admission migration `20260731150000`;
- the new Phase 2A migration `20260801010000` is not recorded remotely; and
- hosted RPC drift remains green at 195 aligned function names.

The remote migration ledger intentionally has many historical gaps relative to the local directory. Do **not** use a sweeping `supabase db push` for this slice. As in Phase 1, apply only the reviewed migration and record only its exact version. A schema-only catalog dump was not available on this machine because the current Supabase CLI requires Docker Desktop for `db dump`; therefore hosted catalog-grant verification remains a deployment-time SQL check, while the same permission contract is already executable in the disposable PostgreSQL fixture.

Deployment order:

1. review the migration and run the read-only production preflight;
2. apply the additive/permission migration with worker routing still disabled;
3. regenerate database types from the migrated hosted schema;
4. deploy compatible server code and rerun RPC/security drift plus legacy SSE regression; and
5. keep the worker flag disabled until every Phase 2 package exits.

Rollback avoids destructive schema removal. Disable any future worker flag, keep additive columns/table in place, and restore only the named authenticated policies/grants if the already-deployed Phase 1 server writers themselves must be rolled back.

## Next work

1. Complete the broader local regression/type/build pass for Slice 1.
2. Run a read-only hosted preflight for current role grants, policies, execution modes, duplicates, and migration prerequisites.
3. After migration review/authorization, deploy Slice 1, regenerate hosted types, and verify RPC/type drift.
4. Add the server-only input-artifact store/reader against generated types and prove it uses the shared verifier.
5. Continue Phase 2A in separate migrations: queue enum commit, queued-status/active-index replacement, stream/signal tables, and queue-function lockdown. Do not combine the irreversible enum change with this trust migration.

## Explicit non-goals of Slice 1

- no `queued` turn status;
- no `agentic_chat_turn` queue enum or job;
- no worker admission/claim/finalize/cancel/effect RPC;
- no transport lease endpoint;
- no Realtime policy or publisher;
- no client worker adapter; and
- no real asynchronous provider/model execution.
