<!-- tasker/51-worker-behavioral-parity-phase4.md -->

# 51 — Phase 4: full worker behavioral parity

**Created:** 2026-08-07  
**Status:** P0 COMPLETE (2026-08-07, Slice 17 — `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_17_PARITY_SCENARIO_REGISTRY_EVIDENCE_2026-08-07.md`; all local gates green, no deploy required). Phase 3 is exited (`AGENTIC_CHAT_WORKER_PHASE_3_EXIT_GATE_PACKET_2026-08-07.md`, recommendation GO; carried partials: live queued-window Stop, live worker-restart-mid-turn). tasker/50's operator-gated items (follow-up canary, constraint-diff sweep, provider-budget overrun) remain open but were judged non-blocking for P0/P1 code work — they gate the next LIVE run, not local slices. Next: P1 (plan: `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_READ_LOOP_PARITY_PLAN_2026-08-07.md`). Master plan: `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md` §Phase 4 (lines 857–886).  
**Mission:** Make the worker path as capable as the legacy web path — full tool catalog, mutations behind effect reservations, attachments, supervisor, telemetry, billing — proven by differential tests that run legacy and worker against identical fixtures, so routing can eventually stay ON instead of flipping per canary. Internal-only throughout; cohort widening is Phase 6.

## Why this work exists

Canary 11 (turn `9e54c04b`, 2026-08-07) proved the execution *architecture* end to end: admission, claim, fencing, provider, tool ledger, streaming, timing evidence, executor-written terminal. But the deployed worker provider is the Phase 3 bounded slice — exactly one read tool plus synthesis. Routing therefore cannot stay on: any real request ("update the start-here doc", "create tasks") exceeds what the worker can do. Phase 4 closes that gap. Until it does, every canary is a flip-test-flip exercise and the product benefit of the migration (turns that survive tab closes and run long agentic work) is not deliverable to anyone.

## Work packages (proposed slicing — refine per slice as the campaign did)

### P0 — Differential harness foundation (the required test mechanism) — ✅ COMPLETE 2026-08-07

The plan mandates it (lines 873–877). **Premise corrections found during execution (do not relearn):** the normalizer + differ + four goldens already existed from Phase 4 Slices 1–10 (`packages/agentic-chat-runtime/src/parity.ts` + `*-parity-fixture.ts`); `agentic_chat_prepared_history_divergence` never materialized — it is a name in the Phase 0/1 parity ledger only, and the staleness rule it names is an open P3 gap in `prepared-prompt-consumer.server.ts`; the read-only scenario is NOT at exact parity (done-event `failure_code`/`status` gap on all four goldens).

What P0 actually delivered (Slice 17): a shared scenario registry for all eight plan scenario classes (`packages/agentic-chat-runtime/src/parity-scenarios.ts`) with per-scenario deliberate-divergence prefixes (ratified async-timing split) and exact open-gap inventories (the in-code parity ledger — closing a gap must shrink the list, drift outside it fails the worker suite); shared evaluators replacing the duplicated partition logic in both adapter suites; provider-error tightened from structural to exact inventory; and cross-side coverage trackers so a newly registered scenario fails BOTH suites until each side exercises it. Gates: runtime 30/30, worker 772 + TS7 typecheck, web server.test 40/40 + svelte-check clean.

### P1 — Full read loop: prompt, gateway, skill, and direct-tool surface parity

Replace the Phase 3 single-tool `readOnlyProvider` with the shared runtime's real orchestration loop for the **read-only** catalog first: tool selection, multi-round tool calls, validation, affected-entity capture, context shifts, skill routing. This is the big architectural slice — the moment the worker stops being a demo. Mutations stay disabled.

### P2 — Mutating tools behind effect reservations

Adapter-by-adapter enablement through the Phase 2B effect ledger (`reserve → begin → receipt`). Every reachable mutating adapter must accept the reserved `effect_id`; adapters without downstream idempotency get classified no-retry/uncertain with reconciliation coverage (plan line 883). Includes the cancellation boundaries around reservation from §7.8.

### P3 — Session, prewarm, context, history, attachment, and vision parity

Prepared-prompt consumption beyond the canary shape, history strategies (compression, cutoffs), attachment references and live vision through the immutable input artifact.

### P4 — Supervisor/checkpoint + research/forward-carry parity

`chat_turn_checkpoints` semantics, clarification flows, deterministic research capture, and the route-side quality safeguards the legacy path performs after streaming.

### P5 — Telemetry, cost, and billing parity

Prompt snapshots, timing (already live), cost accounting, session metadata, and the consumption-billing gate: frozen-account rejection at admission and gate re-evaluation at terminal finalization so worker-mode spend is measured no later than legacy-mode spend (plan line 871).

### P6 — Cancellation/error/finalization differentials + quality battery

Differential coverage for success, clarification, read-only tools, mutating tools, supervisor checkpoint, cancellation, timeout, and provider error (the plan's eight scenario classes), then the agentic E2E quality battery against the Phase 0 baseline (24/24 scenario gate from `agentic_chat_worker_phase0_gate_2026-07-31_0f63e47bb.json`).

## Standing rules carried from the canary campaign (do not relearn these)

- **Prod-vs-disposable constraint diff before any new write path goes live.** Three shipped bugs came from prod-only constraints/assumptions local schemas lacked (`tool_category` allowlist, `text_delta` evidence source, µs-vs-ms arithmetic). Before each slice's live run, diff `pg_constraint`/function prosrc for every table/RPC the slice touches (Management API: keyring token → `POST /v1/projects/iwifjtlebphefldmwbkh/database/query`).
- **Verified deployment before every live run.** A flag/env change requires a NEW Vercel deployment confirmed Ready (`vercel ls` prints to stderr — capture with `2>&1`). Worker changes require a Railway restart signature in `/health`.
- **Audit the instrument first.** Verifier/harness contract updates must be traced to a deliberate contract change, never loosened to make a run pass.
- **Diagnosis order:** durable tables → `agentic_chat_execution_observations` → Supabase edge/postgres logs (`logs.all`) → Railway boundary logs. The first three are queryable in seconds.
- **Bare catches are defects.** Any new control-path catch must log through a port and have a bounded fallback (the D2a precedent).

## Exit gate (from the plan, lines 879–885)

- [ ] Parity ledger complete across all nine workstreams.
- [ ] Differential tests pass for the eight scenario classes.
- [ ] Every reachable mutating adapter accepts the reserved `effect_id`; unsupported idempotency classified and reconciliation-tested.
- [ ] Agentic E2E quality meets or exceeds the Phase 0 baseline.
- [ ] Feature remains internal-only; routing stays off between sessions until Phase 6.

## Dependencies / open items inherited

- Phase 3 exit-gate packet: **complete, GO** (2026-08-07). Carried residuals for the Phase 4/5 hardening ledger: live queued-window Stop (1.3 s window unhittable through the UI; disposable claim-fencing proof stands), live worker-restart-mid-turn (needs Railway access; sweeper suites + three real prod recoveries stand).
- tasker/50 follow-up: canary the deployed client reconcile-throttling/thinking-state fixes; the two authorized production gates (constraint diff sweep, deliberate provider-budget overrun); dangling-turn reconcile-runaway root cause (instrumented via `reason=` query param).
