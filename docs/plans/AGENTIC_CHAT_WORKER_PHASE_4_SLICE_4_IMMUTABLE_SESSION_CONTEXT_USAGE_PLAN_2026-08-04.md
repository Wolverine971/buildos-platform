<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_4_IMMUTABLE_SESSION_CONTEXT_USAGE_PLAN_2026-08-04.md -->

# Agentic Chat Worker Phase 4 Slice 4 — Immutable Session and Context Usage

**Prepared:** 2026-08-04 EDT  
**Status:** Implemented and validated. Migration `20260804000000` was applied to the hosted database and its exact receipt, constraint, enabled trigger, invoker security, and denied client-role privileges were verified on 2026-08-04 EDT.  
**Authority:** The user asked to double-check the preceding lifecycle work and continue with the next parity slice.

**Follow-on:** The exact next slice below is now implemented in `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_5_TERMINAL_LAST_TURN_CONTEXT_PLAN_2026-08-04.md`.

## Outcome

New worker admissions now freeze the two remaining pre-provider public snapshots inside `agentic_chat_input_v3`, and the worker durably emits them in legacy order:

1. acknowledged `turn_phase`;
2. `session`;
3. `context_usage`; and
4. provider stream creation.

Both snapshot events use the existing generation-fenced semantic persistence, UI projection, Broadcast, delivery-acknowledgement, and reconciliation path. They have stable executor-owned transition UUIDs and cannot be duplicated by same-generation response-loss replay.

## Immutable artifact contract

The shared artifact contract is now a discriminated rolling union:

- `agentic_chat_input_v2` remains readable and preserves its exact historical canonical hash behavior;
- `agentic_chat_input_v3` requires a canonical `sessionSnapshot` and `contextUsageSnapshot` inside the already-hashed `prepared` object.

The v3 session snapshot may not contain `id`. Existing sessions freeze the trusted row returned during preparation with only `id` removed. For inline-created sessions, preparation freezes the deterministic event-relevant fields available before the admission transaction (`summary: null` and trusted `agent_metadata`). The worker injects only the database-fenced `claim.sessionId`; it never guesses a generated database identity.

The context-usage snapshot uses the same legacy calculator and the same admission-time inputs: frozen system prompt, frozen model history, the model-facing admitted message, and the UI token budget. Its integer bounds and status enum are validated in shared TypeScript and at the database insert boundary.

## Rolling migration design

The existing atomic admission RPC intentionally keeps its deployed signature and still inserts the literal v2 version. The new insert trigger examines the already-hashed prepared JSON:

- both valid lifecycle snapshots present: upgrade that row to v3;
- neither present: preserve the legacy v2 row;
- only one snapshot, malformed numeric/status fields, a session `id`, or an explicit v3 row without snapshots: reject the insert.

The table check constraint permits v2 and v3 during the rolling window. This avoids a coordinated RPC signature cutover: the migration can land first, old web instances continue producing executable v2 rows, and new web instances produce v3 hashes plus snapshots. The worker accepts both versions and deliberately emits no fabricated session/context events for v2 rows.

The trigger function is not callable by public, anonymous, or authenticated roles. The disposable PostgreSQL test proves the constraint, trigger, v2 preservation, v3 upgrade, and negative validation cases.

## Durable event identity and replay behavior

The stable transition seed namespace now includes `session` and `context_usage`. Exact UUID outputs are pinned alongside acknowledged/finalizing identities.

Snapshot publication occurs only after the execution-start fence grants provider authority. Each event must either persist successfully or reconcile as already persisted before the next boundary is crossed. A cancellation or publisher failure between the two snapshots cannot cause provider invocation to begin, and later reconciliation uses the same authoritative durable projection.

## Executable parity result

Slice 3 ended with 13 visible differences. Slice 4 removes exactly the two public events now backed by immutable artifact data and real semantic writes:

- historical `/events/1` session gap;
- historical `/events/2` context-usage gap.

The deterministic text-only differential now has exactly 11 visible differences:

1. missing `last_turn_context`;
2. missing `timing`;
3. the worker's intentional authoritative `status` addition on `done`;
4. the worker's intentional authoritative `failure_code` addition on `done`;
5. six missing legacy observability lifecycle rows; and
6. one missing prompt snapshot.

## Review fixes

The hardening pass added three protections beyond the happy path:

- exact v2 hash pinning, so introducing the v3 union cannot silently alter retained v2 artifacts;
- a v2 executor regression, proving rolling artifacts remain executable without invented snapshots; and
- database safe-integer ceilings matching JavaScript's canonical numeric range.

A typecheck-only fixture narrowing issue was also corrected after the runtime suite passed, demonstrating that the union is checked by both the compiler and runtime validator.

## Validation

- Shared types: 2 files / 24 tests, typecheck, and CJS/ESM/declaration build passed.
- Runtime parity: 3 files / 13 tests, typecheck, and CJS/ESM/declaration build passed.
- Complete worker package: 88 files / 713 tests passed, with one explicit opt-in file/test skipped.
- Worker typecheck and production build passed.
- Worker lint completed with 0 errors; existing unrelated repository warnings remain.
- Focused web admission/artifact/legacy parity: 3 files / 50 tests passed.
- New disposable PostgreSQL migration contract: 1 file / 1 test passed with localhost permission.
- Whole-web Svelte check: 0 errors and 0 warnings.
- Tracked diff whitespace check passed.

One package-wide web run also exposed the known sandbox localhost restriction for the older PostgreSQL suites and one unrelated admin chat replay assertion (`Arguments`) outside this slice. All 50 affected web assertions passed in isolation, and the new PostgreSQL test passed when rerun with its required localhost permission.

## Hosted migration receipt and safety boundary

The required first rollout step is complete:

1. hosted receipt `20260804000000` exists;
2. `chk_chat_turn_input_artifacts_version` permits exactly v2 and v3;
3. `trg_chat_turn_input_artifacts_version` exists and is enabled;
4. the validator is `SECURITY INVOKER`; and
5. `anon` and `authenticated` cannot execute it.

The web producer and worker consumer may now deploy in either order while v2 reading remains enabled. Preserve v2 compatibility until the old-web admission window is conclusively drained.

This work did not call a live provider, change routing/cohorts/capacity/environment state, or add a new tool, mutation, supervisor, attachment, or billing claim.

## Exact next slice

Implement the terminal `last_turn_context` product event as its own slice:

1. move or expose the pure legacy context builder at a web/worker-portable boundary rather than creating a worker-only approximation;
2. preserve the admitted user message, final persisted assistant text, context type/entity, context-shift outcome, and ordered tool execution results needed by that builder;
3. extend terminal finalization to return the committed assistant-message timestamp and use that value rather than an unfenced worker wall clock;
4. persist and publish one stable, generation-fenced `last_turn_context` event before `done`; and
5. remove only its exact public differential when the text-only golden and tool-bearing fixtures prove it.

Timing, the six remaining observability lifecycle rows, prompt-snapshot parity, and the authoritative worker-only `done` fields remain separate ownership decisions.
