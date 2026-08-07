<!-- tasker/51-worker-behavioral-parity-phase4.md -->

# 51 — Phase 4: full worker behavioral parity

**Created:** 2026-08-07  
**Status:** P0 COMPLETE (2026-08-07, Slice 17 — `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_17_PARITY_SCENARIO_REGISTRY_EVIDENCE_2026-08-07.md`; all local gates green, no deploy required). Phase 3 is exited (`AGENTIC_CHAT_WORKER_PHASE_3_EXIT_GATE_PACKET_2026-08-07.md`, recommendation GO; carried partials: live queued-window Stop, live worker-restart-mid-turn). tasker/50's operator-gated items (follow-up canary, constraint-diff sweep, provider-budget overrun) remain open but were judged non-blocking for P0/P1 code work — they gate the next LIVE run, not local slices. Next: P1 (plan: `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_READ_LOOP_PARITY_PLAN_2026-08-07.md`). Master plan: `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md` §Phase 4 (lines 857–886).  
**Mission:** Make the worker path as capable as the legacy web path — full tool catalog, mutations behind effect reservations, attachments, supervisor, telemetry, billing — proven by differential tests that run legacy and worker against identical fixtures, so routing can eventually stay ON instead of flipping per canary. Internal-only throughout; cohort widening is Phase 6.

## Why this work exists

Canary 11 (turn `9e54c04b`, 2026-08-07) proved the execution _architecture_ end to end: admission, claim, fencing, provider, tool ledger, streaming, timing evidence, executor-written terminal. But the deployed worker provider is the Phase 3 bounded slice — exactly one read tool plus synthesis. Routing therefore cannot stay on: any real request ("update the start-here doc", "create tasks") exceeds what the worker can do. Phase 4 closes that gap. Until it does, every canary is a flip-test-flip exercise and the product benefit of the migration (turns that survive tab closes and run long agentic work) is not deliverable to anyone.

## Work packages (proposed slicing — refine per slice as the campaign did)

### P0 — Differential harness foundation (the required test mechanism) — ✅ COMPLETE 2026-08-07

The plan mandates it (lines 873–877). **Premise corrections found during execution (do not relearn):** the normalizer + differ + four goldens already existed from Phase 4 Slices 1–10 (`packages/agentic-chat-runtime/src/parity.ts` + `*-parity-fixture.ts`); `agentic_chat_prepared_history_divergence` never materialized — it is a name in the Phase 0/1 parity ledger only, and the staleness rule it names is an open P3 gap in `prepared-prompt-consumer.server.ts`; the read-only scenario is NOT at exact parity (done-event `failure_code`/`status` gap on all four goldens).

What P0 actually delivered (Slice 17): a shared scenario registry for all eight plan scenario classes (`packages/agentic-chat-runtime/src/parity-scenarios.ts`) with per-scenario deliberate-divergence prefixes (ratified async-timing split) and exact open-gap inventories (the in-code parity ledger — closing a gap must shrink the list, drift outside it fails the worker suite); shared evaluators replacing the duplicated partition logic in both adapter suites; provider-error tightened from structural to exact inventory; and cross-side coverage trackers so a newly registered scenario fails BOTH suites until each side exercises it. Gates: runtime 30/30, worker 772 + TS7 typecheck, web server.test 40/40 + svelte-check clean.

### P1 — Full read loop: prompt, gateway, skill, and direct-tool surface parity — PLAN RATIFIED (Slice 18)

Replace the Phase 3 single-tool `readOnlyProvider` with the real orchestration loop for the **read-only** catalog first. Mutations stay disabled. **Plan:** `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_READ_LOOP_PARITY_PLAN_2026-08-07.md`; **implementation handoff (start here):** `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P1_IMPLEMENTATION_HANDOFF_2026-08-07.md` — hybrid extraction (loop leaves into `agentic-chat-runtime/src/loop/*` with same-commit web shims; the extraction wall is a single `$app/environment` import), shared read-tool implementations behind an access port, provider contract gains only `continueWithToolResults` (no new step types, no migration — the ledger already supports N rounds), five sub-slices S1–S5 with exit gates.

**Two verified findings that reshape this package (2026-08-07):** (1) legacy read tools do NOT route through `shared-agent-ops` — the gateway is a parallel implementation with different payloads, so the Phase 3 worker's `get_project_overview` has been returning a **different payload than legacy in production canaries, unrefereed** (register in S1, close in S3); (2) `utility-executor.ts` reads that scope via `auth.uid()` fail OPEN under the worker's service role — every shared read must scope through `ensureActorId` + actor-visible projects before S3 exposes it.

**S2 COMPLETE + S3 COMPLETE (working-tree implementation + hosted gate, 2026-08-08).** S2 closed via S2b-1 catalog port (`1ea7b47dd`), S2c validation/round-analysis/context-ledger (`933f198de`), S2d repair-instructions/turn-intent/synthesis-context + skill-lookup port + injectable limits loaders (`e114416a4`); exit gate `pnpm pre-push` 35/35. **Libri REMOVED from the active chat tool system (`82a0d3705`, DJ-ratified; admin historical rendering kept).** S3: gateway payload diff came back DIVERGENT on both probe pairs → shared-extraction path; map + corrections in `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_S3_EXTRACTION_MAP_2026-08-08.md` (key: the membership RPC fails CLOSED under service role; the real fail-open surface is unpredicated selects; `actor_has_project_member_access` is the port primitive, no migration). Landed previously: T1 pure builders (`02f444dc1`), T3 access port + web adapter (`67590adc3`), T4 the 18 direct reads incl. the doc-body-before-check security fix (`e2bd6b32e`), T5 overviews/field-info (`906dc3d02`), worker access adapter + 21-tool shared dispatch — `get_project_overview` emits the LEGACY payload (`9289fcd9e`). The working-tree exit closes the remaining local gates: provider advertising is now the ordered signed-artifact definitions ∩ the 21-tool allowlist; the differential golden uses three real tools with three durable rounds; web/worker read categories single-source shared `TOOL_METADATA`; and migration `20260808010000_agentic_chat_read_tool_categories.sql` safely widens the existing check with `read`/`search`. Gates: worker 793, runtime 155, focused web 65, Postgres 8, canary 7; all typechecks clean. **Hosted gate complete:** an isolated dry run named only `20260808010000`; apply succeeded; the remote receipt is present; and a Management API query verified the constraint is validated with all legacy values plus `read`/`search`. The expression already contained one equivalent read/search branch before this receipt, so the additive second branch is redundant but harmless. Next: T6-T11 web hop collapses + `get_entity_relationships` fail-open fix, S4 round bridge, S5 finalization + spend-gated battery.

**S2a COMPLETE (2026-08-08).** The `@buildos/agentic-chat-runtime/loop` subpath exists (tsup entry + `exports` map — landmine 5 handled — plus `/loop` vitest aliases in BOTH apps and the portability guard made recursive). The 13 registry-independent modules moved via `git mv` with their tests unchanged — including both hot prompt-text files (`tool-payload-compaction` 57KB; `tool-arguments`) and `tool-metadata` (+ its definition types) — with web originals now explicit named re-export shims; `gateway-op-aliases`/`update-value-validation` imports go straight to `@buildos/shared-agent-ops` (cycle-free, verified by install+build). Gates: package 120 tests + typecheck, web FULL suite 3615 + svelte-check 0/0 + goldens 40/40, worker 776 + TS7. **S2b remaining:** injected catalog port for the registry-dependent leaves (`getToolRegistry()` lives inside nested classification helpers → port must be an installed provider, and the registry build pulls the web-only definitions closure), `repair-instructions` (78KB, needs turn-intent/tool-selector closure), `limits.ts`/`context-usage.ts` env-read conversion, the three runners, and the lint-rule/`pre-push` full exit gate.

**S1 COMPLETE (2026-08-08).** Multi-round fence with the existing single tool: `continueWithToolResults` on the provider contract (`synthesize` retained as the deprecated Phase 3 alias, fence byte-identical without the new method), executor-owned budgets `maxProviderRounds`/`maxToolCalls` (defaults 16/40, envs `CHAT_MAX_TOOL_ROUNDS`/`CHAT_MAX_TOOL_CALLS` via `loadAgenticChatPhase3Config`, specific failure codes `provider_round_budget_exceeded`/`provider_tool_call_budget_exceeded`), real `tool_round_count` in the executor's finalize metadata, `read_only_tools` golden extended to two rounds on BOTH sides (worker diff still exactly the registered done-event inventory; other three goldens byte-unchanged), lifecycle projection widened to N tool pairs, two-row disposable-Postgres ledger proof. Known live divergences registered durably in the Slice 18 plan §Known live divergences: the `get_project_overview` payload gap (close in S3) plus a NEW S1 finding — `finalize_agentic_chat_turn` derives durable `tool_round_count` capped at 1 (ledger rows carry no round attribution), owned by S5. Next: S2 (loop-leaf extraction to `agentic-chat-runtime/src/loop/*`).

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
