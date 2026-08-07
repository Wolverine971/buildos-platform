<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_8_PARTIAL_CANCELLATION_PARITY_PLAN_2026-08-04.md -->

# Agentic Chat Worker Phase 4 Slice 8 — Partial Cancellation Parity

**Prepared:** 2026-08-04 EDT
**Status:** Implemented, clean-database verified, and hosted. The linked ledger records matching local/remote receipt `20260804033000`.
**Authority:** The user asked to apply the pending migration, audit the implementation for bugs and quality, update the handoff, and continue into the next Phase 4 unit.

**Follow-on:** The first provider-error audit increment is pinned in `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_9_PROVIDER_ERROR_PARITY_PLAN_2026-08-04.md`.

## Outcome

A cancelled turn with durable response text now preserves the legacy user-visible terminal shape:

1. the exact durable partial assistant message, with interruption metadata and null usage;
2. `last_turn_context` derived from that exact partial text;
3. an honest `agentic_chat_async_v1` timing event; and
4. the authoritative cancelled `done` event.

The context, timing, assistant message, done event, and cancelled turn state commit in one transaction. A cancellation before any durable response text continues to use the smaller base terminal CAS and creates no synthetic partial message or semantic prefix.

## Deterministic dual-adapter fixture

`@buildos/agentic-chat-runtime` now owns one transport-neutral partial-cancellation fixture and exact legacy golden. The real legacy route test streams one canned text prefix and then returns `cancelled`; the worker fixture streams the same prefix, aborts with a typed cancellation signal, and proves later provider output is neither persisted nor Broadcast.

Both adapters normalize events, user/assistant messages, outcome, admission evidence, lifecycle metadata, and prompt-snapshot count through the shared parity projector. The worker no longer has whole-event gaps for `last_turn_context` or `timing`.

The remaining public differential is explicit and intentional:

- asynchronous timing fields differ from the legacy synchronous HTTP timing model and are isolated below `/events/5/payload/timing/*`;
- worker `done` retains authoritative `status` and `failure_code` additions; and
- six legacy-only internal lifecycle observations remain absent until they have a separately reviewed private observability store/visibility contract.

## Partial-message contract

Cancelled durable partial messages now carry:

- `interrupted: true`;
- the observed cancellation signal reason as `interrupted_reason`, falling back to `cancelled` only when no typed reason exists;
- `finished_reason: cancelled`; and
- the legacy-compatible approximate `partial_tokens = ceil(text.length / 4)`.

The cancelled `done` payload carries `usage: null`. Provider text observed after the abort boundary is excluded from the terminal assistant text and public stream.

## Atomic cancellation exception

The general semantic writer must reject every post-cancel write. That invariant remains unchanged.

The existing terminal-events wrapper already holds the turn lock and owns the atomic `last_turn_context -> timing -> done` transaction. For a validated cancelled partial only, migration `20260804033000_agentic_chat_partial_cancellation_terminal_events.sql` temporarily masks the two turn cancellation columns while the wrapper invokes the already-hardened semantic writer twice, then restores the exact timestamp/reason before calling the authoritative cancelled terminal CAS.

No concurrent transaction can observe that transaction-local state. Any validation, transition, persistence, or finalization error rolls back the mask and both semantic writes together. The exception is unavailable to ordinary semantic-write calls, which continue returning `cancel_requested`.

The wrapper accepts this path only when all of the following are true:

- the current generation is still running and has an accepted cancellation;
- status, failure code, message identity, and nonempty partial text are coherent;
- both stable transition ids are present;
- context and timing drafts pass the existing strict size/shape/source/evidence checks; and
- three consecutive sequence slots remain available.

Completed turns retain their existing behavior. Stale, already-terminal, conflicting completion, and lost-response paths still resolve through the base terminal CAS before optional payload validation.

## Fail-safe worker behavior

The worker supplies the pair only for a post-start typed cancellation with nonempty durable text. It records the cancellation boundary as provider finish, then builds timing immediately before the terminal call.

The rolling context-only RPC remains completion-specific. If cancellation timing is unavailable or becomes untrustworthy, the executor drops both optional drafts and safely uses the established base cancelled finalizer; it never attempts a cancellation context-only call. Failed/provider-error terminalization remains unchanged in this slice.

## Verification

- The real legacy route suite passes 37/37, including the exact partial-cancellation golden.
- The focused worker execution-control, executor, timing, timing-payload, and publisher gate passes 5 files / 57 tests.
- The transport-neutral runtime passes 15 tests, typecheck, and CJS/ESM/declaration build.
- The complete worker gate passes 91 files / 739 tests with one explicit opt-in test skipped. Worker typecheck, touched-source ESLint, formatting, and the HTTP module-size guard pass.
- A clean disposable PostgreSQL database first reruns the complete Slice 6 terminal-timing proof, then applies Slice 8 and finishes with `phase4_slice8_partial_cancellation_terminal_events_ok`.
- SQL coverage proves ordered cancelled persistence, exact cancellation-evidence restoration, interruption metadata/null usage, lost-response replay, rollback after a forced second-prefix-write collision, and continued ordinary-writer cancellation fencing.
- The linked dry run named only `20260804033000_agentic_chat_partial_cancellation_terminal_events.sql`; application succeeded; and the post-apply ledger reports `{ local: 20260804033000, remote: 20260804033000 }`.

## Current boundary

Slice 8 closes the deterministic partial-cancellation public event/message shape. It does not claim all of Phase 4 workstream 8 is complete.

The exact provider-error legacy golden and first worker differential now exist in Slice 9. Continue there with the timeout matrix and explicit failed-partial persistence decision. Do not generalize the cancelled-partial exception to failed turns without that evidence.
