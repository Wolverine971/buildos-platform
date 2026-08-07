<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2B_SLICE_4_REMEDIATION_PLAN_2026-08-02.md -->

# Agentic Chat Worker Phase 2B Slice 4 Remediation Plan

**Date:** 2026-08-02  
**Status:** Implemented, locally green, hosted, and post-apply verified  
**Scope:** Harden the generation-scoped event identity and atomic cancellation/finalization package, then record its first hosted application.  
**Non-goals:** No worker consumer, provider/model execution, Realtime publisher, recovery loop, route enablement, commit, or push.

## Why this pass exists

The initial Slice 4 implementation proved the central concurrency model: one turn-first lock order, generation-fenced ownership, deterministic terminal events, atomic message/projection/event/turn finalization, queued cancellation, and both completion-versus-cancellation race orderings. A pre-application review then found three compatibility/control-boundary problems plus several validation and coverage gaps. The package must be corrected while it is still local-only.

## Required corrections

### 1. Preserve legacy event-writer compatibility through type regeneration

`chat_turn_events.event_id` becomes `NOT NULL`, but the existing legacy writer intentionally omits the new worker-only identity fields. A non-null column without a database default becomes required in generated Supabase insert types and would break the legacy writer after hosted regeneration even though the insert trigger can derive the value at runtime.

Decision:

- give `event_id` an insert-compatible sentinel default;
- backfill both null and sentinel values;
- make the validator derive the canonical identity for null/sentinel input and reject any other mismatched supplied identity;
- retain the exact `<turn_run_id>:<execution_generation>:<sequence_index>` shape constraint and both unique indexes;
- prove omission derives the identity and the sentinel never persists.

### 2. Reserve the worker chat-message idempotency namespace

Authenticated users currently retain direct `chat_messages` inserts for sessions they own. Worker admission/finalization use predictable `chat-turn:<turn-id>:user` and `chat-turn:<turn-id>:assistant` keys. Without a guard, an authenticated client can preempt one of those keys and permanently force the service-only worker transaction into a unique/conflict path.

Decision:

- add a dedicated migration before the event/terminal package that reserves only the exact worker namespace for trusted service-role writes;
- preserve legacy keys such as `turn:<client-turn-id>:assistant` and ordinary user message inserts;
- protect both insert and any future update into the reserved namespace;
- use signed request-role validation so a `SECURITY DEFINER` wrapper cannot bypass the guard;
- preflight for any existing reserved-key rows before enforcement;
- test ordinary authenticated inserts, reserved authenticated inserts, service-role worker inserts, and a definer-wrapper attempt.

### 3. Match the existing partial token-usage contract

Provider usage fields are independently optional. Terminal finalization must not reject a valid total-only or otherwise partial provider report.

Decision:

- validate every supplied counter as nonnegative;
- verify `total = prompt + completion` only when all three values exist;
- perform arithmetic as `bigint` to avoid integer-addition overflow;
- require all counters to be null when no assistant message is persisted;
- preserve exact usage values when resolving an existing idempotent message.

## RPC hardening

- Capture cancellation/finalization timestamps only after the governing turn and queue locks have been acquired and ownership/predecessor checks have passed.
- Explicitly reject null terminal status, cancellation reason, and cancellation source with the intended typed errors.
- When an assistant idempotency row already exists, require the authoritative worker metadata (`turn_run_id`, generation, terminal status, finished reason, interrupted/partial flags) in addition to scope, role, content, and usage parity.
- If an insert loses a unique race, reselect and validate the canonical row in the same RPC instead of returning a generic conflict before checking it.
- Preserve the existing rule that a completed turn always owns one assistant message, while failed/cancelled turns own a message only for nonempty partial text.
- Preserve running queue rows as `processing` after domain finalization; queued cancellation alone terminalizes the unstarted queue row and clears its processing token.

## Test expansion

The disposable PostgreSQL contract will add explicit cases for:

1. completed empty text still producing exactly one assistant message;
2. failed empty text producing no assistant message;
3. total-only and partial token usage, plus invalid complete arithmetic;
4. queued cancellation of an already-`processing` generic queue row with a live token;
5. running domain finalization leaving the queue row/token in `processing` for later generic completion or chat recovery;
6. null terminal/cancellation arguments returning their typed validation errors;
7. authenticated reserved-key preemption denial and ordinary-key compatibility;
8. exact existing-message adoption, malformed metadata conflict, and concurrent unique-winner adoption;
9. a genuine claim-versus-cancel race, supplementing the existing completion-versus-cancel races;
10. timestamps being assigned after lock acquisition in the contended paths where the fixture can assert it reliably.

The legacy session-service `23505` winner-adoption test will also cover and report a failed canonical lookup rather than hiding that secondary error behind the original unique violation.

## Migration order

1. Reserved worker `chat_messages` idempotency namespace guard.
2. Event identity columns, backfill, validator, and staged checks.
3. Concurrent generation-sequence unique index.
4. Concurrent deterministic event-id unique index.
5. Index/check validation and `NOT NULL` promotion.
6. Legacy turn-wide event sequence constraint removal.
7. Cancellation and terminal finalizer RPCs.

Every migration receipt/hash in the handoff documents must be recalculated after the final edits. The pre-application rule was to keep hosted database types at Slice 3B until all corrected Slice 4 migrations succeeded remotely; hosted types were regenerated only after the full package applied.

## Validation and deployment gate (completed)

Before hosted application:

- run the complete cumulative legacy/Phase 2A/Phase 2B disposable PostgreSQL suite;
- run the focused terminal-control runner repeatedly enough to cover both real lock orderings;
- run shared worker-contract tests, shared-types typecheck/build, session-service tests, web `svelte-check`, and `git diff --check`;
- perform a read-only hosted preflight for existing reserved keys, current event row count, invalid legacy event scope/sequence rows, active worker rows/events, relevant grants/policies, and conflicting/invalid indexes;
- retain the preflight output and exact local migration hashes in the handoff;
- apply each hosted migration in receipt-isolated order, verify the receipt and live catalog after each step, then regenerate database types once from the fully applied schema;
- prove the regenerated `chat_turn_events.Insert.event_id` remains optional and re-run web/shared checks.

The worker rollout flag remains disabled throughout this package.

## Completion criteria

The local remediation was complete when all required corrections and coverage cases were green, the handoff accurately described the corrected behavior and proof, and the package was ready for a separate explicit hosted-application step. No local-only schema was represented in generated database types before that application.

## Local implementation result

The local implementation pass completed on 2026-08-02 without applying hosted migrations or regenerating types from the then-local-only schema:

- added the dedicated reserved-key migration and signed-role trigger guard;
- made event identity insert-compatible with the live legacy writer and future type regeneration;
- aligned terminal token validation with independently optional provider usage;
- moved cancellation/finalization clocks after their governing locks;
- added explicit null command validation and authoritative/concurrent message-winner adoption;
- improved both daily-brief session and message `23505` secondary-error observability;
- expanded the disposable proof with reserved-key, empty/partial output, partial usage, processing-queue cancellation, queue-preservation, malformed/exact/concurrent message, claim/cancel, and post-lock timestamp cases.

Final local validation:

- complete PostgreSQL migration gate: 10 runners / 14 tests;
- complete `agentic-chat-v2` suite: 82 files / 734 tests;
- session service: 9/9 tests;
- shared types: 2 files / 16 tests, typecheck, and build;
- OpenAPI generator: 3/3 tests;
- web `svelte-check`: 0 errors / 0 warnings;
- formatting and `git diff --check`: clean.

## Hosted application result

The hosted follow-up completed on 2026-08-02 from a receipt-isolated migration workdir. The read-only preflight found 10,324 legacy event rows, zero invalid scopes, zero duplicate turn/sequence groups, zero reserved worker-message keys, zero worker-mode turns/events, and no target-column/index conflicts. The isolated dry run named exactly `20260802029900`–`20260802030500`; all seven migrations applied in order; the post-apply dry run was empty; and the migration ledger shows local/remote parity through `20260802030500`.

Post-apply verification proved all 10,324 events have valid generation-zero identities, both replacement indexes are ready/valid/unique, both staged checks are validated, the legacy turn-wide sequence constraint is absent, and both trigger guards are installed. Live OpenAPI exposes `finalize_agentic_chat_turn` and `request_agentic_chat_turn_cancel` to `service_role` and neither to `anon`. Hosted types/schema were regenerated at 240 tables / 13 views and 210 RPC names, with `chat_turn_events.Insert.event_id` and `execution_generation` still optional.

Applied migration SHA-256 values, in order: `3daba0c48023d3d977ea5fecf284389c207882f584cd2b64363c734588dd7e0f`, `5c97127ea9d70b21441a6e2c0ceeeef73a7ed94646d6aad5cf2c5d6903b9ea0d`, `9dfc871bec0afeca791b4e0abd912690df9e6d063775e704d8f74675cdae2ceb`, `e8d876d1fd99d0737f48865c6483fadd2b62cca2de349c7e8bf20e1d8cfedc05`, `b26610977f88b0b1d0bb38f085f3a2cf32ab1c746fcb8743cfd025eb7d266b1b`, `8b09f06c99429784f7386e3a0439f69f0fe7622217b0b0ec4659d3a1ea03493b`, and `198280b157de39f8e44b18d96e675867801e532ae2847a40dae40b026834e3ea`.
