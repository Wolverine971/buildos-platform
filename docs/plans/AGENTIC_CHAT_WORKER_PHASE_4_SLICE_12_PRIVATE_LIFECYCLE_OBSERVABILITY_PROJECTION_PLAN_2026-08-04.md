<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_12_PRIVATE_LIFECYCLE_OBSERVABILITY_PROJECTION_PLAN_2026-08-04.md -->

# Agentic Chat Worker Phase 4 Slice 12 — Private Lifecycle Observability Projection

**Prepared:** 2026-08-04 EDT

**Status:** Implemented, locally proved, and hosted. Migration `20260804037000` was applied and its linked receipt/live access contract were verified on 2026-08-04 EDT.

**Authority:** The user asked to continue with the next implementation unit after the bounded production read round was audited and verified.

## Outcome

Slice 12 closes the remaining lifecycle-observability differential for all four pinned Phase 4 goldens without changing the public reconnect protocol or widening the worker tool surface.

The worker already stores the authoritative facts behind the legacy lifecycle records: admission context, prepared-cache outcome, public semantic events, terminal state, and the linked prompt snapshot. Migration `20260804037000_agentic_chat_worker_lifecycle_observations.sql` exposes a service-only, read-only projection over those facts as `public.agentic_chat_worker_lifecycle_observations`.

This is deliberately a projection, not another mutable event log. It creates no rows, allocates no public sequence numbers, and cannot introduce reconnect gaps or duplicate browser events.

## Exact projected contract

For each `worker_realtime` turn and current execution generation, the view assigns a private lifecycle sequence in the pinned legacy order:

1. `turn_intent_resolved` from the admitted turn;
2. `prepared_prompt_cache_checked` from immutable preparation/admission fields;
3. `tool_call_emitted` from an exact public `tool_call` row, when present;
4. `first_tool_call_planning_cue_emitted` from the exact first-step planning cue, when present;
5. `tool_result_received` from an exact public `tool_result` row, when present;
6. `turn_phase_changed` from the exact finalizing phase row, when present;
7. `turn_outcome_resolved` for completed or cancelled turns with a durable `done` row;
8. `orchestration_interventions` for those same successful/cancelled terminal outcomes;
9. `done_emitted` from the durable public `done` row; and
10. `prompt_snapshot_created` from the exact prompt snapshot linked to the turn.

Provider failures intentionally omit the success/cancellation outcome and intervention meanings. Their pinned lifecycle is admission, cache check, durable done, and prompt snapshot.

Each observation retains its authoritative `source_kind`, `source_id`, payload, and timestamp. Public-event sources are restricted to the turn's current execution generation. Prompt snapshots must match the turn, session, and user linkage.

The shared worker-turn CTE is explicitly `NOT MATERIALIZED`, allowing a turn/user predicate from an operational query to reach indexed base-table scans instead of forcing a scan of every historical worker turn.

## Visibility and stream safety

The view uses `security_invoker = true`. All access is revoked from `PUBLIC`, `anon`, and `authenticated`; only `service_role` receives `SELECT`.

The legacy `chat_turn_events` table and the worker public `chat_turn_events` stream have different roles. Writing hidden legacy metadata into the worker stream would alter public sequence allocation and reconciliation semantics. Slice 12 therefore keeps lifecycle evaluation/admin telemetry out of the browser transport while deriving it from the same durable sources of truth.

The production worker does not query this view during a turn. A projection read cannot affect claim authority, provider calls, tool execution, terminalization, publication, or queue reconciliation.

## Deterministic parity adapter

`projectAgenticChatWorkerLifecycleObservationsV1(...)` mirrors the database projection for fixture and differential evaluation. It accepts only admission evidence, durable public payloads, terminal status, and prompt-snapshot count.

The adapter fails closed on evidence outside the currently authorized production cardinality:

- more than one tool call;
- more than one first-step planning cue;
- more than one tool result;
- more than one finalizing phase;
- more than one `done` row;
- more than one prompt snapshot;
- a malformed raw or wrapped public-event payload; or
- a terminal `done.status` that conflicts with the turn status.

The real worker differential now has zero lifecycle paths for text success, one-read success, partial cancellation, and provider failure. The only pinned non-timing differences that remain for successful/cancelled runs are the worker's stronger public `done.status` and nullable `done.failure_code` compatibility fields; the provider-failure lifecycle has no metadata residual.

## Regression coverage and audit fixes

The runtime tests compare the projector directly with all four shared lifecycle goldens and exercise bounded-cardinality/terminal inconsistency rejection.

The worker executor tests construct lifecycle metadata through the shared projector from the actual Broadcast payloads and prompt-snapshot calls. They no longer hand-map only finalization or use empty lifecycle arrays.

The permanent disposable PostgreSQL regression covers:

- exact service-only view grants;
- the ten-event completed one-read order;
- the four-event provider-failure order;
- exclusion of success-only meanings from failures; and
- unchanged public event-row cardinality before and after a projection read.

An isolated PostgreSQL apply/probe independently confirmed the migration syntax, exact 10/4 projections, service-role access, authenticated/anonymous denial, and unchanged public event counts. `EXPLAIN` also confirmed that a turn-scoped query pushes the turn ID into primary-key/index scans across the projection branches. The disposable database was removed after verification.

The implementation review caught two fixture-level issues before handoff. Duplicate finalizing phases were not initially included in the projector's bounded-cardinality guard, and the SQL regression initially attempted to replace the seed's existing durable assistant prefix. The projector now rejects duplicate finalization and the regression preserves the exact prefix expected by the append-only stream contract. A final query-plan audit also removed an explicit all-turn materialization fence from the production view so scoped reads can use their predicates efficiently.

## Verification

- Agentic Chat runtime: 5 files / 19 tests, typecheck, and CJS/ESM/declaration build passing.
- Worker lifecycle differential focus: 32/32 tests passing.
- Full worker package: 93 passing files / 761 passing tests with one explicit opt-in skip.
- Real legacy stream route and all four shared golden dependencies: 39/39 tests passing.
- Worker typecheck: passing.
- Worker lint: zero errors; only pre-existing repository warnings remain.
- Isolated PostgreSQL migration/security/semantic/query-plan probe: passing; scoped index pushdown confirmed and disposable database removed.
- Linked hosted ledger: exact through `20260804037000`; post-apply isolated dry run is empty.
- Live PostgREST: service role HTTP 200 with all 13 exact view columns; anonymous HTTP 401 and no OpenAPI view exposure.
- Hosted type generation: 239 tables / 14 views; the generated database type adds only the new 13-column view contract.
- Shared types: 24/24 tests, typecheck, and CJS/ESM/declaration build passing.
- Schema tooling: 4/4 tests; hosted RPC drift remains aligned at 242 function names.
- Relevant Prettier and final whitespace checks: passing.

## Hosted application receipt

The linked preflight showed an exact hosted receipt chain through `20260804036000`, with only `20260804037000` pending. Because the main worktree intentionally contains older local-only migrations, application used a receipt-isolated directory containing the 72 exact hosted receipts plus this target. The source and staged migration SHA-256 both equal `e82d2de7e8f98a36bf0ba257e9452c81bb782c409a7d5be38bab4e76b3b9755d`.

The isolated dry run named only `20260804037000_agentic_chat_worker_lifecycle_observations.sql`. Application succeeded; the linked ledger now reports `{ local: 20260804037000, remote: 20260804037000 }`, and the post-apply dry run reports the remote database up to date.

Live service-role PostgREST returns HTTP 200 for a scoped view read. Its OpenAPI definition contains exactly `event_type`, `execution_generation`, `observation_key`, `observation_sequence_index`, `observed_at`, `payload`, `phase`, `session_id`, `source_id`, `source_kind`, `stream_run_id`, `turn_run_id`, and `user_id`. The configured anonymous key receives HTTP 401 and its OpenAPI document does not expose the view. The migration also explicitly revokes `authenticated`; that privilege boundary was proved in the disposable PostgreSQL contract without creating a live user session.

Generated database types were refreshed from the hosted contract and add only the new view definition. No runtime code depends on the view, so migration ordering did not affect worker execution.

## Next release gate

The Slice 11 internal project-status canary remains the production release gate for the newly active read round. Slice 12 neither substitutes for nor blocks that canary.

The release-readiness audit and fail-closed durable-evidence verifier are recorded in `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_13_READ_CANARY_READINESS_AND_EVIDENCE_GATE_PLAN_2026-08-04.md`. The current production deployment predates the local Slice 11 bounded-read files, so no canary has been claimed or executed against it.

After the live canary is verified, the current bounded worker path is at a natural stopping point. Parallel reads, additional read tools, multiple provider/tool rounds, mutations, attachments, supervisor actions, and billing are new capability slices and require their own deterministic goldens, durable recovery contracts, and explicit scope decisions.
