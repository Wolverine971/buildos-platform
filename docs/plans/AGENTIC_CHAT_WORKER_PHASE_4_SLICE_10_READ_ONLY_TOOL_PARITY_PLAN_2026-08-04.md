<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_10_READ_ONLY_TOOL_PARITY_PLAN_2026-08-04.md -->

# Agentic Chat Worker Phase 4 Slice 10 — Read-Only Tool Parity

**Prepared:** 2026-08-04 EDT
**Status:** Implemented, locally proved, and hosted. Migrations `20260804035100` and `20260804036000` were applied and their exact linked receipts/live contracts were verified on 2026-08-04 EDT.
**Authority:** After applying and verifying Slice 9, the user asked for a bug audit and the next implementation unit.

## Outcome

Slice 10 establishes the first exact one-read tool contract without enabling a live worker tool surface.

The shared fixture now freezes one global-context request, one `fixture_project_read` call, its exact arguments/result/telemetry, a final model answer, and terminal usage. The real legacy `POST /api/agent/v2/stream` harness produces the golden. The worker fixture executor consumes the same input and exposes only the remaining intentional differences.

The slice also closes the dangerous persistence gap found by that differential: a worker may not publish a successful `tool_result` until its completed read has been stored under the current turn, queue processing token, and execution generation.

## Exact legacy golden

`AGENTIC_CHAT_READ_ONLY_TOOL_GOLDEN_V1` freezes this public order:

1. acknowledged `turn_phase`;
2. immutable `session` snapshot;
3. immutable `context_usage` snapshot;
4. first-tool planning `agent_state`;
5. `tool_call`;
6. successful `tool_result`, including `affected_entities`, `duration_ms`, and `tokens_consumed`;
7. final assistant text;
8. finalizing `turn_phase`;
9. `last_turn_context` with the read tool in `data_accessed`;
10. `timing`; and
11. `done`.

The normalized durable product state contains one user message, one linked assistant message, one linked successful `chat_tool_executions` row, one tool round, one tool call, 16 total tokens, one prompt snapshot, and the ten legacy lifecycle observations associated with this fixture.

The fixture lives in `packages/agentic-chat-runtime/src/read-only-tool-parity-fixture.ts` and is exported by the runtime package. The legacy route proof uses deterministic clocks and its actual persistence callbacks; it does not hand-construct the normalized result.

## Worker execution seam

`AgenticChatFixtureReadToolPortV1` now returns a structured completed read:

- canonical result object;
- execution time and token telemetry;
- affected entity objects;
- optional category;
- internally consistent result-count/zero-result evidence; and
- optional user-action evidence.

Before emitting the public result, `AgenticChatFixtureTurnExecutor`:

1. validates the structured execution;
2. derives a stable UUID from `(turn_run_id, sequence_index)`;
3. calls the tool-execution persistence port with the queue processing token and current generation;
4. stops on stale, cancellation, terminal, protocol, or database failure; and
5. only then publishes the legacy-shaped `tool_result` and adds the execution to terminal last-turn context.

Terminal metadata now carries tool round/call counts for the fixture differential. The database does not trust those values: Slice 10 derives both authoritative counters from durable execution rows in the terminal transaction and overwrites caller metadata.

Production remains closed. `readOnlyProvider.ts` still builds `toolChoice: 'none'`, `openRouterReadOnlyClient.ts` rejects any other choice, and `phase3Assembly.ts` still injects `disabledToolPort('read_tools_disabled')`. This slice creates the safe persistence seam required by a later constrained live loop; it does not activate that loop.

## Durable identity and migrations

The shared worktree contained concurrent legacy tool-persistence hardening while this slice was being built. The overlap was reconciled rather than creating competing identities:

- `20260804035100_chat_tool_execution_provider_call_identity.sql` adds canonical `provider_tool_call_id` and unique `(turn_run_id, provider_tool_call_id)` correlation for legacy incremental/final rows and PostgREST upsert inference.
- `20260804036000_agentic_chat_read_tool_execution_ledger.sql` consumes that identity and adds the service-only worker RPC `persist_agentic_chat_read_tool_execution(...)`.

The worker RPC locks the turn first and then enforces:

- service-role-only access;
- exact turn/user/queue relationship;
- `worker_realtime`, running, provider-started state;
- current execution generation;
- no accepted cancellation;
- current processing token and canonical queue metadata;
- canonical bounded arguments/result/telemetry;
- affected-entity objects only;
- consistent `result_count` / `zero_result`; and
- exact replay by deterministic row ID or provider call ID.

A lost successful response returns `already_persisted` only when every stored field matches. Reusing either identity with different content rolls the transaction back. Successful insert also advances `last_progress_at` under a running-generation compare-and-set.

The patched base finalizer attaches every durable tool row to the winning assistant message in the same terminal transaction. It derives `tool_call_count` from those rows and derives the currently constrained `tool_round_count` as zero or one, overwriting caller-supplied counts on both the message and turn.

### Hosted application receipt

The linked preflight found the remote ledger exact through `20260804034000` with only `20260804035100` and `20260804036000` pending. A receipt-isolated workdir contained the 70 exact hosted receipts plus only those two targets. Final source/staging hashes matched byte-for-byte:

- `20260804035100`: `15df1e8d1a095379fedcbbb8961f9be5c62b6ca931d6eaa9ddaa85c15ddfcab9`
- `20260804036000`: `5c9a5f7268a453277629b8aa77053c650889730b2cfa98e81b747a0e5e330da2`

The isolated dry run named exactly those two migrations in order. Application succeeded, the post-apply dry run reported the remote database up to date, and the linked ledger now shows exact local/remote receipts for both versions.

Live service-role PostgREST exposes `provider_tool_call_id` and `persist_agentic_chat_read_tool_execution` with exactly 18 request properties, all required. A service probe reaches the RPC's fail-closed identity validation with HTTP 400; the configured anonymous key is rejected with HTTP 401 and does not expose or invoke the RPC. The linked index catalog contains `uq_chat_tool_executions_turn_provider_call` on `(turn_run_id, provider_tool_call_id)`. Hosted type regeneration added exactly the new column/RPC contract; schema extraction reports 239 tables / 13 views, and live RPC drift is aligned at 242 function names.

## Differential result

The worker now matches the golden for the ordered tool call/result payload, telemetry, durable tool row, message linkage projection, terminal tool counters, last-turn context data access, assistant text, usage, and prompt-snapshot count.

The exact pinned residual is limited to:

- the known legacy-versus-worker asynchronous timing values;
- worker terminal `done` carrying the stronger `status` and nullable `failure_code` compatibility fields; and
- legacy lifecycle observability rows that are not yet represented by the worker's current durable lifecycle stream (only finalizing currently aligns in this normalization).

The differential must remain non-truncated and must contain exactly those non-timing paths. Any reappearance of a tool payload, ledger, linkage, or counter difference fails the fixture test.

## Audit fixes made during implementation

The composed proof caught an invalid finalization fixture: its seeded reconnect prefix was `fixture answer`, but the test attempted to replace it with unrelated text. The existing append-only prefix trigger correctly rejected it. The proof now keeps the terminal answer consistent with the seeded stream and does not weaken the production invariant.

A second audit found a local migration-version/schema collision. The work was renumbered and aligned with the shared canonical `provider_tool_call_id`, eliminating duplicate migration versions and competing identity columns.

Input hardening added during the audit rejects:

- null arguments/result/entity collections;
- scalar entries in `affected_entities`;
- negative numeric telemetry;
- mismatched `result_count` / `zero_result` evidence;
- noncanonical tool/provider IDs; and
- a tool execution UUID that is not the stable turn/sequence identity.

## Verification

- Runtime parity package: 15/15 tests, typecheck, and CJS/ESM/declaration build.
- Real legacy stream route: 39/39 tests, including the exact one-read golden.
- Worker package: 92 passing files / 750 passing tests with one explicit opt-in skip; typecheck passes.
- Worker lint: zero errors; touched Agentic Chat sources have zero warnings. Repository-wide pre-existing warnings remain unchanged.
- Tool adapter/executor/assembly focus: 38/38 tests.
- Shared types: 24/24 tests, typecheck, and build.
- Schema tooling: 4/4 tests.
- Live hosted RPC drift after Slice 10: aligned at 242 function names.
- Composed disposable PostgreSQL: 7/7 harness assertions, including service-only grants, stale-generation and accepted-cancellation no-write fences, exact insert, lost-response replay, provider-ID conflict rollback, invalid-payload rollback, terminal message attachment, and database-derived `1/1` counters overriding forged `0/0` metadata.
- Whole web workspace: `svelte-check` reports 0 errors and 0 warnings.
- Relevant Prettier check and final `git diff --check`: clean.

## Follow-on status

The bounded provider read round described below was implemented in `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_11_BOUNDED_PRODUCTION_READ_ROUND_PLAN_2026-08-04.md`:

- an explicit allowlist containing only proven read tools;
- at most one tool round and a bounded number of calls;
- no mutation/effect adapters;
- exact provider tool-call ID preservation;
- generation/cancellation checks before and after each read;
- ledger persistence before public result;
- synthesis from the durable read result; and
- the shared one-read golden as the release gate.

Deployment and one internal live project-status canary are now the release gate. Lifecycle-observability parity can close the pinned residual independently after that gate. Do not broaden into parallel reads, multiple rounds, mutations, attachments, supervisor actions, or billing until their own deterministic goldens and recovery matrices exist.
