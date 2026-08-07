<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_9_PROVIDER_ERROR_PARITY_PLAN_2026-08-04.md -->

# Agentic Chat Worker Phase 4 Slice 9 — Provider Error Parity

**Prepared:** 2026-08-04 EDT
**Status:** Implemented, proved, and hosted. Migration `20260804034000` was applied and its exact linked receipt was verified on 2026-08-04 EDT.
**Authority:** The user asked to continue into the next unit after the partial-cancellation migration, audit, verification, and documentation were complete.

## Product contract and persistence decision

Failure parity crosses three contracts that should not be changed from memory:

- the legacy public SSE product shape;
- the Phase 2 worker recovery/finalization safety rules; and
- reconnect/history semantics for response text emitted before a provider failure.

The exact legacy route and worker executor now run against one canned provider that emits `Discarded partial.` and then fails permanently. The evidence exposed that the old worker behavior was not merely stronger durability: because worker admission loaded every assistant row, a failed partial could be fed into the next model prompt as trusted assistant history.

Slice 9 therefore adopts exact legacy conversation-history semantics while retaining the worker's reconnect guarantee:

- durable failed text remains in `chat_turn_stream_state.assistant_text` for same-turn reconciliation;
- failed turns never create or link a `chat_messages` assistant row;
- reload or a later admission cannot treat the failed prefix as valid conversation history; and
- terminal public order is `error -> timing -> done`, following any text already delivered.

Cancelled partials remain different: they still create the intentionally interrupted assistant row introduced by Slice 8 and can contribute the established interrupted-history/tool ledger.

## Exact legacy golden

The legacy route produces this normalized order:

1. acknowledged `turn_phase`;
2. `session`;
3. `context_usage`;
4. the partial `assistant_text` already sent to the client;
5. a generic public `error` event;
6. synchronous `timing` with `finished_reason: error` and `assistant_persisted_at: null`; and
7. `done` with `finished_reason: error` and `{ total_tokens: 0 }`.

It persists only the user message. The failed turn has no linked assistant message, records `status: failed` / `finished_reason: error`, creates one prompt snapshot after the first response text, and retains four normalized lifecycle observations (`turn_intent_resolved`, prepared-prompt check, `done_emitted`, and `prompt_snapshot_created`).

This behavior is now frozen in `AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1` and proven through the real legacy `POST` route harness under a deterministic clock.

## Implemented terminal path

Migration `20260804034000_agentic_chat_provider_failure_terminal_events.sql` adds a service-only `finalize_agentic_chat_turn_with_failure_events(...)` wrapper. Under the existing turn/queue/generation fences, one transaction now:

- persists a generic public `error` event;
- persists database-checked asynchronous `timing` with `assistant_persisted_at: null`;
- terminalizes `failed` with `done` and compatibility usage `{ total_tokens: 0 }`;
- retains the exact failed prefix in reconnect stream state; and
- leaves `assistant_message_id` null and inserts no assistant-history row.

The executor selects this wrapper only after provider authority when a trustworthy runtime-timing draft exists. If timing instrumentation itself is unavailable, the already-safe base terminal CAS remains the fail-closed fallback and still keeps failed text out of assistant history.

## Audit fix: append-only event timestamps

The composed database proof found a pre-existing Slice 6 defect: the terminal timing wrapper inserted `done` and then attempted to update its `created_at`. The event-identity trigger correctly rejects every update because `chat_turn_events` is append-only.

Slice 9 repairs timestamp ownership at the source:

- the base terminal CAS uses `transaction_timestamp()` as the one commit-time fact;
- assistant messages receive that timestamp explicitly at insert;
- terminal `done` receives the same timestamp at insert; and
- completion/cancellation/failure wrappers verify those timestamps without mutating an event.

The regression is now part of the permanent composed PostgreSQL harness that installs the real append-only trigger before exercising completion, partial cancellation, and provider failure.

## Timeout and recovery matrix

The executor tests now pin the product-relevant timeout rows:

- `timeout_pre_start`: one bounded safe retry, no input/provider invocation, finalization, or public terminal output;
- `provider_throttle` before start: retry without provider invocation or terminalization;
- `timeout_post_start` without text: failed terminal truth, no assistant row, `error -> timing -> done`;
- `timeout_post_start` after durable text: same terminal order, reconnect text retained, no assistant row;
- permanent provider error after text: the exact shared provider-error fixture behavior above; and
- stalled post-start recovery: base failed finalization keeps its durable snapshot prefix out of assistant history even when a trustworthy timing prefix cannot be reconstructed.

The recovery SQL continues to permit retries only before provider authority and only under its attempts/residence/effect fences. Post-start timeout, permanent provider failure, publisher overload, and unknown failures converge to failed terminal truth unless effect uncertainty requires manual reconciliation.

## Verification

- Exact legacy provider-error golden: real route harness, including one user row and no assistant row.
- Worker provider-error and timeout matrix: 30 executor tests; focused execution-control/executor/stalled recovery total is 52/52. The full worker package passes 91 files / 745 tests with one explicit opt-in skip.
- Execution-control adapter: strict `error -> timing` receipt parsing, null assistant persistence timestamp, deterministic identities, and failure-wrapper selection.
- Composed disposable PostgreSQL: 6/6 harness assertions, including Slice 6 timing, Slice 8 cancellation, Slice 9 failure, replay, service-only grants, forced second-prefix-write rollback, reconnect-only failed text, no assistant row, and the real append-only event trigger.
- Latest composed load sample remains below its fixture ceilings at 4,521.68 WAL bytes/turn, 20.69 ms flush, and 34.87 ms total.

### Hosted receipt and generated-contract audit

The linked migration workflow was run from an isolated directory containing the exact hosted receipt chain plus only the Slice 9 target. The target source and staged copy had the same SHA-256:

`01b743b51e60df77d53140c1f7bbb74fec634784e07cfe6ce806321878b830af`

The pre-apply dry run named only `20260804034000_agentic_chat_provider_failure_terminal_events.sql`; the apply succeeded; the post-apply dry run reported the remote database up to date; and the linked ledger then showed exact local/remote receipt `20260804034000`.

Live PostgREST exposes `finalize_agentic_chat_turn_with_failure_events` to the service role with the exact 20-property required argument contract. An anonymous request is rejected and does not expose the RPC. The post-apply audit also caught that generated TypeScript types had not yet incorporated the new hosted RPC; `pnpm run gen:types` repaired that drift, after which the live RPC audit reported all 241 function names aligned. Schema-tool coverage and shared-types tests/typecheck/build are green.

## Current boundary and next slice

Migration `20260804034000` is hosted and verified. The deterministic read-only tool unit described here has started and is recorded in `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_10_READ_ONLY_TOOL_PARITY_PLAN_2026-08-04.md`.

Do not treat the text-only/provider-error lane—or the Slice 10 deterministic seam—as authorization for mutation, attachment, supervisor, billing, or broad live-tool parity.
