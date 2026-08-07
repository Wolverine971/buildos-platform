<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_3_DURABLE_LIFECYCLE_PARITY_PLAN_2026-08-04.md -->

# Agentic Chat Worker Phase 4 Slice 3 — Durable Lifecycle Parity

**Prepared:** 2026-08-04 EDT  
**Status:** Implemented and validated locally. The worker remains internal-only; no routing, cohort, provider, admission, schema, startup, or production environment state changed.  
**Authority:** The user asked to check the preceding work, implement the next slice, and update the related plans.

**Follow-on:** The exact next slice below is now implemented in `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_4_IMMUTABLE_SESSION_CONTEXT_USAGE_PLAN_2026-08-04.md`.

## Outcome

The worker now durably emits the two executor-owned lifecycle boundaries present in the text-only legacy golden:

1. `acknowledged` after the database execution-start fence grants provider invocation and before the provider network stream is created; and
2. `finalizing` after provider completion and text-prefix flush, but before terminal finalization.

Both events use the existing semantic persistence transaction, UI projection, Broadcast, delivery acknowledgement, and reconciliation path. This slice adds no parallel event store or best-effort-only lifecycle channel.

## Stable transition identity

Each lifecycle stage has a deterministic UUID derived only from the canonical turn-run UUID, the lifecycle identity version, and the stage. Execution generation, provider identifiers, random UUIDs, and call order are deliberately excluded.

The generated UUIDs are pinned by test so an accidental seed change cannot silently break replay identity. The existing database fence remains generation-scoped on `(turn_run_id, execution_generation, worker_transition_id)`: a same-generation response-loss replay returns `already_persisted`, receives no live-event Broadcast authority, and moves the publisher to reconciliation-only delivery. A later execution generation reuses the logical transition identity inside its separately fenced event stream.

No migration was needed. Slice 3 consumes the semantic-event RPC and concurrent transition index already delivered in Phase 2C.

## Lifecycle payloads and ordering

The durable public payloads are exact legacy-semantic equivalents:

- acknowledged: `Request received. Preparing the workspace context...`;
- finalizing: `Finalizing the response...`.

They are stored as `turn_phase` rows in `chat_turn_events`, included in the durable UI projection, and delivered as realtime `agent-stream-event` messages. The composed parity adapter maps the worker's finalizing row to the legacy `turn_phase_changed` observability meaning; legacy did not create a separate internal acknowledgement lifecycle row.

The executor still fails closed:

- a start-denied turn cannot publish acknowledgement or invoke the provider;
- lifecycle persistence must succeed, or reconcile as an already-persisted write, before execution crosses the next boundary;
- terminal publication still requires a fully drained per-turn write slot.

## Review fixes

The re-audit found and fixed a projection snapshot alias. Earlier semantic persistence inputs held the live `semanticEvents` array, allowing a later lifecycle append to mutate an earlier in-memory snapshot. `toProjectionJson(...)` now copies the array at the persistence boundary, so adapter timing cannot change the historical projection handed to it.

The publisher-overload regression fixture also now uses a realistic byte ceiling. Its former five-byte limit was smaller than one valid lifecycle event and therefore failed before the provider ran. The revised fixture lets acknowledgement drain, then proves an intentionally oversized provider delta still fails closed while preserving the complete assistant prefix.

## Executable parity result

The Slice 2 differential had 16 visible differences. Slice 3 removes only the three backed by real writes:

1. acknowledged public `turn_phase`;
2. finalizing public `turn_phase`; and
3. the finalizing lifecycle observability equivalent.

The composed differential now has exactly 13 visible differences.

Remaining public legacy events:

1. `session`;
2. `context_usage`;
3. `last_turn_context`; and
4. `timing`.

Remaining persistence and metadata differences:

- six legacy lifecycle rows: `turn_intent_resolved`, `prepared_prompt_cache_checked`, `turn_outcome_resolved`, `orchestration_interventions`, `done_emitted`, and `prompt_snapshot_created`;
- one prompt snapshot; and
- the worker's intentional authoritative `status` and `failure_code` additions on `done`.

Lifecycle metadata is now aligned by `(event_type, phase)` before structural comparison. This prevents a missing earlier row from creating an index-shift cascade while keeping every matched payload and all other metadata exact.

## Validation

- Runtime package: 13 tests passed, typecheck passed, and CJS/ESM/declaration build passed.
- Focused worker lifecycle identity, publisher, and executor suites: 3 files / 32 tests passed.
- Complete worker package: 88 files / 711 tests passed, with one explicit opt-in file/test skipped.
- Worker typecheck and production build passed.
- Complete legacy route suite: 35 tests passed.
- Worker UI adapter, reconciliation, and realtime inbox suites: 3 files / 24 tests passed.
- Whole-web Svelte check: 0 errors and 0 warnings.
- Worker source lint passed with no errors. The only warning introduced by this slice was corrected; unrelated existing repository warnings remain.
- Touched files pass Prettier verification and the tracked diff passes whitespace checks.

## Safety boundary

- No live provider call.
- No hosted database mutation or migration.
- No routing, cohort, kill-epoch, capacity, or environment change.
- No new tool, attachment, mutation, supervisor, or billing claim.
- The worker does not claim complete legacy parity while the differential is non-empty.

## Exact next slice

Add the immutable data required for the remaining pre-response lifecycle pair, then emit only those two events:

1. version the worker input artifact to freeze the public session snapshot and context-usage snapshot after trusted session, prompt, and history resolution;
2. update the database artifact-version constraint and atomic-admission validation as a separately reviewed migration;
3. publish durable `session` and `context_usage` semantic events after acknowledgement and before provider invocation, using stable executor-owned transition identities and no mutable worker-side session reload; and
4. remove only `/events/1` and `/events/2` from the composed differential when the real artifact and writes prove them.

The context-usage calculation can be derived from the frozen system prompt, frozen model history, current admitted message, and the admission-time UI token budget. Freezing its result avoids web/worker environment drift. The session event additionally needs the resolved public session fields already available during web worker-turn preparation but absent from `agentic_chat_input_v2`.

`last_turn_context`, timing, the remaining lifecycle rows, and prompt-snapshot parity stay outside that slice because they require distinct terminal or observability ownership decisions.
