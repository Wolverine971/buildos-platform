<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_1_HANDOFF_2026-07-31.md -->

# Agentic Chat Worker Migration: Phase 1 Implementation Handoff

**Prepared:** 2026-07-31

**Working branch:** Local `main`, per user instruction. The handoff was prepared after commit `6289b3f7f`.

**Status:** Ready for the next agent to orient and prepare the first Phase 1 slice. Code implementation remains gated on a recorded `PHASE 0 ACCEPTED` verdict or explicit user waiver.

## Start here

The goal of Phase 1 is to extract a transport-neutral runtime while production continues to use the existing HTTP/SSE path. It is not permission to build or expose the worker path.

The first authorized implementation slice is deliberately narrower than the whole phase:

> Replace split legacy turn/user-message admission with a service-only `admit_legacy_agentic_chat_turn(...)` transaction that captures fallback history before the current message, produces exactly one running turn and one user message under duplicates/races, and leaves the public endpoint and SSE execution behavior unchanged.

Do not begin that slice until the final independent Phase 0 verdict is recorded. The audit packet is `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_FINAL_REAUDIT_BRIEF_2026-07-31.md`. If acceptance is absent, the next agent may inspect, write a plan, and prepare tests, but must not change runtime or schema. If the user explicitly waives the gate, record the waiver in the Phase 0 checklist before implementation.

### Copy/paste kickoff prompt

```text
Work from the latest local main branch. Read
docs/plans/AGENTIC_CHAT_WORKER_PHASE_1_HANDOFF_2026-07-31.md completely,
then follow its required reading order. First verify that an independent
PHASE 0 ACCEPTED verdict or explicit waiver is recorded and that it resolves
the common admission-schema boundary identified in the handoff. If either is
missing, do not edit runtime or schema; report the exact blocker. If both are
present, implement only Phase 1 Slice 1A: the service-only atomic legacy
turn/user-message admission RPC, pre-message fallback-history snapshot,
typed web adapter, legacy SSE route integration, and required differential,
concurrency, rollback, and privilege tests. Preserve the endpoint and SSE
behavior. Do not add worker execution, queue jobs, Realtime transport, leases,
queued status, terminal CAS, or other Phase 2 work. Preserve all unrelated
working-tree changes and commit only the scoped Phase 1 files.
```

## Required reading order

1. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_FINAL_REAUDIT_BRIEF_2026-07-31.md`
2. The final independent acceptance/waiver record, once it exists.
3. `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md`, especially Phase 1 and Sections 7.4–7.6, 10, 12, 15, and 17.
4. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_CONTRACTS_2026-07-29.md`.
5. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_PARITY_LEDGER_2026-07-29.md`, especially P06–P13, P19–P22, P27–P31, and the security/write inventory.
6. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_BASELINE_2026-07-29.md` and the closure checklist.
7. `apps/web/AGENTS.md` before editing anything under `apps/web`.

Use the latest local `main` containing the acceptance record and this handoff. The primary checkout currently contains unrelated SMS, worker, content, schema, and strategy work. Preserve it. Do not reset, clean, stash, regenerate over, stage, or commit unrelated files. A clean worktree is strongly preferred for migrations and generated types.

## Current legacy control flow

The live route currently performs these steps separately:

```text
POST /api/agent/v2/stream
  -> authenticate and authorize scope
  -> resolve/create chat session
  -> emit session and start cancel watcher
  -> query/reclaim active turn, then INSERT chat_turn_runs
  -> prepare tools/context and consume prepared prompt
  -> load recent messages if prepared history does not win
  -> compose model-facing history
  -> asynchronously INSERT the current user message
  -> asynchronously link that message to the turn and persist attachments
  -> run the existing model/tool loop over SSE
```

That split creates the Phase 1 correctness gap: the turn insert, history read, message insert, and turn/message link do not share a transaction. A lost response or concurrent retry can observe mutable history or produce a mismatched turn/message relationship.

### Current code owners

| Concern                               | Current file / symbol                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| HTTP/auth/SSE lifecycle               | `apps/web/src/routes/api/agent/v2/stream/+server.ts` (`POST`)                           |
| Session resolution/creation           | `apps/web/src/lib/services/agentic-chat-v2/session-service.ts` (`resolveSession`)       |
| Fallback history projection           | `session-service.ts` (`loadRecentMessages`)                                             |
| Legacy active-turn guard/insert       | `apps/web/src/lib/services/agentic-chat-v2/turn-admission.ts` (`admitFastChatTurn`)     |
| User/assistant message writes         | `session-service.ts` (`persistMessage`)                                                 |
| Message attachment writes             | `session-service.ts` (`persistMessageAttachments`)                                      |
| History compression/continuity        | `apps/web/src/lib/services/agentic-chat-v2/history-composer.ts`                         |
| Prepared prompt validation/consume    | `prepared-prompt-consumer.ts`, `prepared-prompt-cache.ts`, `prepared-prompt-history.ts` |
| Canonical request hash                | `packages/shared-types/src/agentic-chat-worker-contract.ts`                             |
| Route request normalization           | `stream-request.ts`, `types.ts`, `stream-request-client.ts`                             |
| Service-role client used by the route | `createAdminSupabaseClient()` in the stream route (`internalSupabase`)                  |

The important route search anchors are `resolveSession`, `admitFastChatTurn`, `consumePreparedPrompt`, `loadRecentMessages`, and `const userMessagePromise = sessionService.persistMessage(...)`.

## First slice target flow

After this slice, the legacy route should behave as follows:

```text
authenticate/authorize and resolve the existing legacy session
  -> normalize the admission command and compute the gateway-owned hash
  -> call service-only admit_legacy_agentic_chat_turn(...)
       1. acquire the shared per-user advisory transaction lock
       2. resolve a matching duplicate before active-turn checks
       3. reject a semantic hash conflict without side effects
       4. validate session ownership and current active-turn state
       5. preserve the current stale-running-turn reclaim semantics
       6. select a bounded pre-message fallback-history snapshot
       7. insert/resolve the running legacy turn
       8. insert/resolve the current user message
       9. link user_message_id on the turn and return all identities/snapshot
  -> consume the prepared prompt only for a genuinely admitted new execution
  -> use prepared history when it wins; otherwise compose the returned fallback snapshot
  -> persist/link current-message attachments using the returned user_message_id
  -> run the unchanged model/tool loop over SSE
```

The route must remove the later detached user-message insert. The model-facing current input remains appended exactly once by the runtime; it must not appear in the fallback history returned by admission.

## RPC contract

The exact SQL signature can evolve during implementation, but the semantic input/output contract must remain explicit and typed.

### Inputs

- authenticated `user_id` established by the gateway;
- owned `session_id` already resolved by the legacy session service;
- pre-generated `turn_run_id` and `user_message_id` for a genuinely new command;
- `stream_run_id` and optional compatibility `client_turn_id`;
- gateway-computed `request_hash_v2` and its version;
- context type/entity/project, source, gateway flag, request message, start time;
- durable user-message content and bounded sanitized metadata;
- bounded history limit and the current stale-turn timing thresholds, or server-locked equivalents.

Do not trust a browser-supplied request hash. The web server computes it with `hashCanonicalAdmissionRequestV1`. Do not recompute canonical JSON in PostgreSQL; the contract explains why `jsonb` key ordering cannot reproduce the pinned TypeScript digest.

### Result

Return a discriminated result containing enough information for the route to avoid follow-up identity lookups:

- outcome: newly admitted, matching duplicate, active-turn conflict, or typed idempotency conflict;
- `turn_run_id`, `session_id`, `user_message_id`, `stream_run_id`, and `client_turn_id`;
- whether a new execution may start—matching duplicates must never start the model/tool loop twice;
- bounded pre-message fallback snapshot for a new admission;
- existing active-turn identity for conflict/reconciliation UX;
- any admission timing/diagnostic fields still required by the Phase 0 baseline.

For a non-null client turn id, a matching `(user_id, client_turn_id)` plus hash returns the existing record. A hash mismatch returns a typed conflict and creates nothing. Preserve a compatibility path for legacy callers that omit `client_turn_id`; do not claim full lost-response idempotency for that null-key path.

### Transaction and security rules

- Use `pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0))`, matching the locked future worker admission domain.
- Duplicate lookup happens before the active-turn guard.
- Validate `chat_sessions.user_id = p_user_id` in the transaction.
- Preserve the current `last_progress_at`/started-at stale-reclaim behavior and unique running-turn guard; do not silently remove it while replacing `admitFastChatTurn`.
- Select fallback history before inserting the current user message.
- Use `chat-turn:<turn_run_id>:user` as the new deterministic message idempotency key. Do not continue creating new messages under `turn:<client_turn_id>:user` for this path.
- Turn and user message either commit together or neither commits. A user-message/link failure must roll back the turn.
- Define the RPC as `SECURITY DEFINER` with a pinned `search_path`; revoke `PUBLIC`/`authenticated` execution and grant only the service role. The authenticated user client must not call it directly.
- The route must call it through the existing authenticated-after-auth service client, not through browser/user-scoped DML.

## Required Phase 0 acceptance clarification

There is one phase-boundary inconsistency the next agent must not guess around:

- Phase 1 requires legacy duplicate-first hash comparison and says the turn is persisted with `execution_mode='legacy_sse'`.
- The current `chat_turn_runs` schema has neither `request_hash`/version nor `execution_mode`, and has no unique `(user_id, client_turn_id)` or `(session_id, client_turn_id)` key.
- The migration plan currently lists those common columns/indexes under Phase 2 even though the Phase 1 RPC relies on them.

The final independent acceptance or a short plan addendum must choose the boundary before runtime implementation. The recommended resolution is to pull forward only the transport-neutral admission foundation needed by both modes:

- nullable/additive request-hash and hash-version columns;
- an additive `execution_mode` column with a legacy-safe default/backfill;
- partial unique user/client-turn and session/client-turn indexes after rerunning the duplicate preflight;
- no `queued` status, queue job, input artifact, generation fence, Realtime table, worker lease, worker RPC, or other worker-control-plane schema in Phase 1.

Phase 2 can then harden immutability, add worker values/constraints, and add the rest of the durable control plane. If the independent verdict chooses a different boundary, follow it. Do not ship a hashless “duplicate” implementation merely to avoid the schema decision.

Prepared-prompt lineage is adjacent to the same decision. Admission currently occurs before `consumePreparedPrompt`, correctly preventing a lost active-turn race from consuming the prompt. If `request_hash_v2` includes accepted prepared lineage, use a trusted non-consuming inspection or move claim/validation into the transaction; never consume before admission and never trust the client key as accepted content. Record the chosen behavior in tests and the contract addendum.

## Preserving fallback-history parity

`loadRecentMessages` is more than a `chat_messages` query. It currently reconstructs:

- allowed-role messages in chronological order from a newest-first bounded query;
- durable image attachment context from `chat_message_attachments`/`onto_assets`;
- temporary attachment metadata;
- interrupted assistant tool summaries from `chat_tool_executions`;
- previously loaded-skill summaries;
- later compression, continuity hints, and session summary through `composeFastChatHistory`.

The RPC/snapshot must provide all bounded raw rows needed to reproduce that projection, not only role/content. Prefer extracting a pure TypeScript projector that accepts the transaction-returned message, attachment, and tool-execution rows. Keep `composeFastChatHistory` unchanged initially and differential-test the old query path against the snapshot path.

Prepared history still wins under the existing rules. The RPC may capture fallback history on every new admission, but the route uses it only when the prepared prompt misses or is rejected. Preserve the Phase 0 divergence rule: a prepared history tail older than the latest persisted session message must not hide that newer message.

Current-message attachments may remain a separate idempotent write in this first slice if the accepted scope says so, but they must use the RPC-returned `user_message_id`, must not trigger another user-message insert, and must complete early enough to preserve current history/linkage behavior. Do not expand the first transaction to unrelated attachment/storage redesign without a reviewed reason.

## Required tests for Slice 1A

### Database/transaction tests

Add a timestamped SQL test beside `supabase/tests` and cover:

1. New admission returns the prior bounded history and inserts one running turn plus one user message.
2. The returned fallback history excludes the newly admitted message.
3. Same user/client/hash returns the original identities and inserts nothing.
4. Same user/client with a different hash returns the typed conflict and inserts/consumes nothing.
5. Concurrent matching admissions produce one turn and one user message.
6. A current running turn blocks admission without a message insert.
7. Stale-turn reclaim matches today's heartbeat/age semantics.
8. Any message/link failure rolls the turn insert back.
9. Session/user mismatch is rejected inside the function.
10. The function is not executable by `anon` or `authenticated`.
11. The null-client-turn compatibility path preserves current behavior without claiming keyed idempotency.
12. Partial unique indexes are preceded by repeatable duplicate probes and fail closed if a new hazard appears.

Use two real database connections for the concurrency case; a mocked Supabase query builder cannot prove transaction locking.

### TypeScript/service tests

- RPC input normalization and result discrimination.
- Exact `request_hash_v2` fixture use; excluded `sessionId`/`lastTurnContext`/`projectFocus` rules remain unchanged.
- Snapshot projector parity with `loadRecentMessages`, including attachments, interrupted tools, loaded skills, ordering, compression inputs, and empty history.
- Message metadata and the `chat-turn:<turn_run_id>:user` key.
- Typed mapping for duplicate, active-turn conflict, idempotency conflict, and database failure.

### Route tests

Extend `apps/web/src/routes/api/agent/v2/stream/server.test.ts` to prove:

- auth/access still precede durable admission;
- admission still precedes prepared-prompt consumption;
- rejected/duplicate admission cannot invoke the model/tool loop again;
- a prepared hit wins over the returned fallback snapshot;
- a prepared miss uses the transaction-returned fallback snapshot;
- the detached `persistMessage` call is gone for the admitted user message;
- `user_message_id` is already linked on the returned turn;
- current input appears exactly once in the model messages;
- attachment-only durable display text/model input and attachment linkage remain intact;
- endpoint, request body, session event, SSE event order, cancel behavior, timing, and error UX remain compatible.

Keep and extend these focused suites:

- `turn-admission.test.ts`
- `session-service.test.ts`
- `history-composer.test.ts`
- `prepared-prompt-consumer.test.ts`
- `prepared-prompt-history.test.ts`
- `stream-request.test.ts`
- `stream-request-client.test.ts`
- `routes/api/agent/v2/stream/server.test.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.test.ts`

## Implementation sequence

1. Confirm/record Phase 0 acceptance and the common-schema boundary above.
2. Start from latest `main`; inspect and preserve unrelated work. Prefer a clean worktree before generation or database tests.
3. Add failing transaction/concurrency/security tests first.
4. Add the smallest additive migration and service-only RPC. Include comments stating deploy/rollback order.
5. Regenerate database types in a clean worktree and review every generated change. `pnpm gen:all` can touch many files; never run it over the user's dirty primary checkout.
6. Add a typed web adapter for the RPC. Keep SQL result parsing outside the giant route.
7. Extract the pure fallback-snapshot projector and differential tests.
8. Switch only legacy admission in the route; remove the detached admitted-user-message write.
9. Run focused tests, full web check, shared-types checks, and database transaction tests.
10. Run the registered Phase 0 hosted parity cohort only after local proof is green and with explicit awareness that it spends provider/judge money and writes hosted fixtures.
11. Update baseline/parity status with measured results. Do not mark all of Phase 1 complete after only Slice 1A.

## Validation commands

At minimum:

```bash
pnpm --filter @buildos/shared-types exec vitest run
pnpm --filter @buildos/shared-types typecheck

pnpm --filter @buildos/web exec vitest run \
  src/lib/services/agentic-chat-v2/turn-admission.test.ts \
  src/lib/services/agentic-chat-v2/session-service.test.ts \
  src/lib/services/agentic-chat-v2/history-composer.test.ts \
  src/lib/services/agentic-chat-v2/prepared-prompt-consumer.test.ts \
  src/lib/services/agentic-chat-v2/prepared-prompt-history.test.ts \
  src/lib/services/agentic-chat-v2/stream-request.test.ts \
  src/lib/services/agentic-chat-v2/stream-request-client.test.ts \
  src/routes/api/agent/v2/stream/server.test.ts

pnpm --filter @buildos/web check
pnpm check:supabase-rpc-drift
```

Run the new SQL tests against a disposable/local database with the relevant migrations applied. Do not treat mocked unit tests as proof of advisory locking, rollback, uniqueness, privilege revocation, or concurrent duplicate behavior.

The paid hosted command remains:

```bash
AGENTIC_E2E_BASE_URL=http://127.0.0.1:5199 \
AGENTIC_PHASE0_OUTPUT_PATH=<new-reviewed-output-path> \
pnpm --filter @buildos/web test:agentic:phase0-evidence
```

Use a clean exact tree and a matching server checkout. Do not overwrite the retained Phase 0 artifact.

## Slice 1A definition of done

- Phase 0 acceptance/waiver and the schema-boundary clarification are recorded.
- One additive migration and service-only legacy admission RPC are reviewable and rollback-safe.
- Duplicate-first, hash conflict, active-turn guard, stale reclaim, pre-message history, turn insert, and user-message insert are one transaction.
- Same-command retries cannot start a second execution or create a second turn/message.
- The legacy route no longer performs a detached admitted-user-message insert.
- Prepared history/fallback history and current-input exact-once behavior are differential-tested.
- Existing SSE endpoint, request schema, event handling, cancellation, and model/tool behavior remain compatible.
- SQL concurrency/security tests, focused web tests, shared-types tests/typecheck, web check, and RPC-drift check pass.
- Generated types match the migration without unrelated generated churn.
- Hosted parity has no hard regression when the paid gate is intentionally run.
- The change contains no worker queue, Realtime transport, worker execution, terminal CAS, effect ledger, or canary routing.

## Explicit non-goals for the first slice

- Do not create `packages/agentic-chat-runtime` and move the entire orchestrator in the same change.
- Do not add the worker queue job, `queued` status, worker claim/generation fields, or worker processor.
- Do not introduce Realtime subscriptions, transport leases, `/turns`, reconcile, or worker cancel endpoints.
- Do not revoke all existing authenticated turn/prepared-prompt policies yet; Phase 1 must first migrate every live writer/reader that depends on them.
- Do not redesign tools, prompts, model routing, context loading, history compression, or finalization semantics while moving admission.
- Do not include `book-writing-journey` in the enforceable bar until its separately reviewed implementation lands.
- Do not alter unrelated SMS/worker/content/schema work in the current checkout.

## What follows Slice 1A

After the atomic legacy admission slice lands and proves parity, continue Phase 1 in bounded changes:

1. Create `packages/agentic-chat-runtime` contracts/ports without changing transport.
2. Introduce a transport-neutral event sink and wrap legacy SSE.
3. Prove the current `AgentSSEMessage` union is exhaustively representable by `AgentStreamEvent`.
4. Introduce transport-neutral `TurnHandle`/cancel-result abstractions while the server still always selects legacy SSE.
5. Move remaining turn/event/checkpoint and prompt-snapshot writes behind controlled server writers/RPCs.
6. Move prepared-prompt content creation/read/consume/cleanup behind server-only boundaries.
7. Run normalized event-log/persistence differential tests and the Phase 0 quality bar.

Only after the complete Phase 1 exit gate is met should Phase 2 durable worker-control-plane schema begin.
