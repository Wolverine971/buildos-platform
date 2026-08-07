<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_5_TERMINAL_LAST_TURN_CONTEXT_PLAN_2026-08-04.md -->

# Agentic Chat Worker Phase 4 Slice 5 — Terminal Last-Turn Context

**Prepared:** 2026-08-04 EDT
**Status:** Implemented, reviewed, and validated. Migrations `20260804000100` and hardening follow-up `20260804000110` were applied to the hosted database. Their receipts, installed function body, invoker security, service-only grants, and rolling original-finalizer compatibility were verified on 2026-08-04 EDT.
**Authority:** The user asked to double-check the previous slice, update the plans, and continue with the next parity work.

## Outcome

Successful worker turns now commit one real `last_turn_context` product event immediately before terminal `done`. The event uses the same legacy context builder, the final durable assistant text, admitted user request and context, latest context shift, and ordered read/mutation tool results. Its timestamp is the exact `chat_messages.created_at` value committed for the assistant message, not a worker wall clock.

The browser can therefore receive or reconcile this durable order:

1. all prior text and semantic events;
2. `last_turn_context` at sequence N; and
3. `done` at sequence N + 1.

## Portable legacy semantics

The former web-only builder now lives in `@buildos/agentic-chat-runtime`. The web module is a compatibility re-export, so existing callers and tests keep the legacy behavior while the worker consumes the same implementation. A new draft helper intentionally omits `timestamp`; only the terminal database transaction may add that field.

The move preserved:

- explicit entity chips and named UUID references from user and assistant text;
- exact entity discovery from tool results while excluding discovery/schema tools that do not prove entity access;
- context-shift entity/name/description handling;
- project fallback from the admitted context; and
- legacy entity-id compatibility fields and continuity-hint sanitization.

The worker retains successful tool executions only after their durable `tool_result` semantic write succeeds. Failed/cancelled recovery paths do not fabricate last-turn context.

## Atomic terminal boundary

Migration `20260804000100_agentic_chat_terminal_last_turn_context.sql` adds the service-only `finalize_agentic_chat_turn_with_last_context(...)` RPC. The original `finalize_agentic_chat_turn(...)` signature and behavior remain intact for rolling old-worker compatibility.

For a newly completed running generation, the wrapper:

1. locks the turn using the established control-plane lock order;
2. validates the timestamp-free context draft and bounded UI projection;
3. pins one transaction timestamp and constructs the full projection event;
4. calls the existing generation-fenced semantic persistence RPC;
5. delegates message/terminal persistence to the established terminal CAS;
6. aligns the newly inserted assistant `created_at` to the pinned timestamp inside the same transaction; and
7. returns the terminal receipt plus the committed `preterminal_event` receipt.

Any failure in terminal validation or persistence rolls back the preceding semantic write. Lost-response replay resolves from existing terminal truth and cannot create a duplicate event. Stale generation, cancellation, already-terminal, and non-running outcomes delegate to the old terminal decision path without publishing context.

The wrapper is `SECURITY INVOKER`, executable only by `service_role`, and repeats the signed-request role fence so a `SECURITY DEFINER` trampoline cannot turn an authenticated caller into a writer.

The final SQL review replaced nullable `<>` JSON-type comparisons with `IS DISTINCT FROM`. This makes omitted `entities`, `data_accessed`, or projection `semantic_events` fail closed under PostgreSQL three-valued boolean logic. A negative disposable test covers the omission, and the corrected hosted function definition was verified directly.

A subsequent maintainability pass found one integer-boundary defect: this wrapper owns two consecutive sequence indexes, but the first version relied on the semantic and terminal RPCs to reject exhaustion independently. At `2147483647` the wrapper could overflow while computing the first index, and at `2147483646` only one slot remained. Follow-up migration `20260804000110_agentic_chat_terminal_sequence_capacity.sql` now rejects any turn above `2147483645` with the stable `agentic_chat_last_context_finalize_sequence_exhausted` error before addition or persistence. A focused disposable PostgreSQL proof covers the boundary and partial-write absence; the installed hosted function and migration receipt were verified.

The same review simplified the executor's terminal path from a ten-argument positional method to a named input object, removed non-null assertions from terminal receipt validation, and removed a needless async publisher wrapper. These are behavior-preserving changes backed by the existing control, publisher, and executor suites.

## Replay-safe publication

The publisher now accepts a semantic receipt already committed by the terminal transaction. It requires a drained per-turn slot, checks exact scope and sequence, Broadcasts only when the receipt grants first-publication authority, and acknowledges the exact context sequence before terminal publication proceeds.

If context Broadcast or acknowledgement degrades, durable database truth remains authoritative and reconnect reconciliation is the fallback. The executor never publishes `done` after a context delivery that was blocked, already-persisted, or reconcile-only without having sent the context in this process.

## Executable parity result

Slice 4 had 11 visible text-only differences. Slice 5 removes the real missing `last_turn_context` event. The deterministic differential now has exactly 10 visible differences:

1. missing `timing`;
2. the worker's intentional authoritative `status` addition on `done`;
3. the worker's intentional authoritative `failure_code` addition on `done`;
4. six missing legacy observability lifecycle rows; and
5. one missing prompt snapshot.

The fixture golden now derives the context timestamp from its pinned committed-message clock rather than an unrelated stale literal. A tool-bearing worker fixture separately proves that exact project identity/name and tool access survive through the portable builder into terminal input.

## Validation

- Portable runtime: 4 files / 15 tests, typecheck, and CJS/ESM/declaration build passed. The final audit added an explicit legacy UUID version/variant regression.
- Focused worker control/publisher/executor: 3 files / 40 tests passed.
- Complete worker package after the final hardening and timing-baseline review: 88 files / 718 tests passed, with one explicit opt-in file/test skipped.
- Worker and shared-types typechecks passed; shared types rebuilt successfully.
- Disposable PostgreSQL stream/terminal contract: the existing 1 file / 3 tests passed, including service-role fencing, signed-definer denial, timestamp equality, replay idempotency, and terminal-failure rollback. The final review also passed a focused local sequence-capacity proof against the hardening migration.
- Existing web legacy builder tests continue through the compatibility re-export (3/3); whole-web Svelte check passed with 0 errors and 0 warnings.
- Agentic Chat touched-file diff whitespace checks passed. A repository-wide cached check still reports pre-existing trailing whitespace in the unrelated staged feedback audit document.

## Rollout boundary

The database-first rollout step is complete. Hosted verification proves:

- receipts `20260804000100` and `20260804000110` exist;
- the exact 18-argument wrapper exists and is `SECURITY INVOKER`;
- the installed wrapper reserves both context and done sequence slots before writing;
- `service_role` can execute it while `anon` and `authenticated` cannot; and
- the original 16-argument finalizer still exists for rolling old workers.

The web compatibility re-export is independently safe. Old workers continue using the original terminal RPC; new successful workers may now deploy against the hosted wrapper.

This slice does not change transport negotiation, cohorts, capacity, provider choice, tool permissions, mutation semantics, attachment handling, billing, or cancellation policy. Rolling v2 artifact reading remains required.

## Exact next slice

Implement the terminal `timing` event as a distinct ownership slice. First inventory every legacy timing field and classify it as:

- directly measured by the worker runtime;
- derived from immutable admission/preparation timestamps;
- committed database timestamp;
- intentionally unavailable or semantically obsolete in the asynchronous architecture.

Do not copy the legacy timing object with zeros or worker-local guesses. Persist any product-visible replacement before `done`, give it stable transition identity, and remove only the exact timing differential proven by the deterministic golden. The six observability lifecycle rows, prompt snapshot, and authoritative `done` additions remain separate decisions.

**Started:** The field-ownership audit and implementation boundary are recorded in `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_6_ASYNC_TIMING_OWNERSHIP_PLAN_2026-08-04.md`. No timing event is emitted yet.
