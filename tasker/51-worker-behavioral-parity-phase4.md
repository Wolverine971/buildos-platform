<!-- tasker/51-worker-behavioral-parity-phase4.md -->

# 51 — Phase 4: full worker behavioral parity

**Created:** 2026-08-07  
**Status:** P0 COMPLETE (2026-08-07). P1 COMPLETE (2026-08-09; live read gate 9/9). P2 COMPLETE (2026-08-11; 38 signed writes exhaustively partitioned into 20 reviewed worker adapters and 18 explicit deferrals; evidence `docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_P2_EXIT_EVIDENCE_2026-08-11.md`; production gates OFF). P3 S1-S2 COMPLETE (2026-08-11; prepared-history divergence and exact history/strategy/count evidence now fail closed in application, atomic artifact insertion, and worker execution; hosted receipts `20260812000000` + `20260812010000`). Phase 3 is exited; tasker/50's remaining operator gates continue to govern future live runs. Next: P3 S3 attachment-reference parity, then live vision parity; do not widen routing. Plan: `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P3_SESSION_HISTORY_ATTACHMENT_VISION_PLAN_2026-08-11.md`. Master plan: `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md` §Phase 4 (lines 857–886).
**Mission:** Make the worker path as capable as the legacy web path — full tool catalog, mutations behind effect reservations, attachments, supervisor, telemetry, billing — proven by differential tests that run legacy and worker against identical fixtures, so routing can eventually stay ON instead of flipping per canary. Internal-only throughout; cohort widening is Phase 6.

## Why this work exists

Canary 11 (turn `9e54c04b`, 2026-08-07) proved the execution _architecture_ end to end: admission, claim, fencing, provider, tool ledger, streaming, timing evidence, executor-written terminal. But the deployed worker provider is the Phase 3 bounded slice — exactly one read tool plus synthesis. Routing therefore cannot stay on: any real request ("update the start-here doc", "create tasks") exceeds what the worker can do. Phase 4 closes that gap. Until it does, every canary is a flip-test-flip exercise and the product benefit of the migration (turns that survive tab closes and run long agentic work) is not deliverable to anyone.

## Work packages (proposed slicing — refine per slice as the campaign did)

### P0 — Differential harness foundation (the required test mechanism) — ✅ COMPLETE 2026-08-07

The plan mandates it (lines 873–877). **Premise corrections found during execution (do not relearn):** the normalizer + differ + four goldens already existed from Phase 4 Slices 1–10 (`packages/agentic-chat-runtime/src/parity.ts` + `*-parity-fixture.ts`); `agentic_chat_prepared_history_divergence` never materialized — it is a name in the Phase 0/1 parity ledger only, and the staleness rule it names is an open P3 gap in `prepared-prompt-consumer.server.ts`; the read-only scenario is NOT at exact parity (done-event `failure_code`/`status` gap on all four goldens).

What P0 actually delivered (Slice 17): a shared scenario registry for all eight plan scenario classes (`packages/agentic-chat-runtime/src/parity-scenarios.ts`) with per-scenario deliberate-divergence prefixes (ratified async-timing split) and exact open-gap inventories (the in-code parity ledger — closing a gap must shrink the list, drift outside it fails the worker suite); shared evaluators replacing the duplicated partition logic in both adapter suites; provider-error tightened from structural to exact inventory; and cross-side coverage trackers so a newly registered scenario fails BOTH suites until each side exercises it. Gates: runtime 30/30, worker 772 + TS7 typecheck, web server.test 40/40 + svelte-check clean.

### P1 — Full read loop: prompt, gateway, skill, and direct-tool surface parity — ✅ COMPLETE 2026-08-09 (Slice 18)

Replace the Phase 3 single-tool `readOnlyProvider` with the real orchestration loop for the **read-only** catalog first. Mutations stay disabled. **Plan:** `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_READ_LOOP_PARITY_PLAN_2026-08-07.md`; **implementation handoff (start here):** `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P1_IMPLEMENTATION_HANDOFF_2026-08-07.md` — hybrid extraction (loop leaves into `agentic-chat-runtime/src/loop/*` with same-commit web shims; the extraction wall is a single `$app/environment` import), shared read-tool implementations behind an access port, and five sub-slices S1–S5 with exit gates. S1's N-round success ledger required no migration and the provider contract gained only `continueWithToolResults`; S4's audit later found that legacy also persists pre-execution validation failures, so the existing `read_tool` step gained an optional failure payload and a separate additive failure-ledger RPC is now required.

**Two verified findings that reshape this package (2026-08-07):** (1) legacy read tools do NOT route through `shared-agent-ops` — the gateway is a parallel implementation with different payloads, so the Phase 3 worker's `get_project_overview` has been returning a **different payload than legacy in production canaries, unrefereed** (register in S1, close in S3); (2) `utility-executor.ts` reads that scope via `auth.uid()` fail OPEN under the worker's service role — every shared read must scope through `ensureActorId` + actor-visible projects before S3 exposes it.

**S2 COMPLETE + S3 COMPLETE + S4 COMPLETE (working tree + hosted gates, 2026-08-08).** S2 closed via S2b-1 catalog port (`1ea7b47dd`), S2c validation/round-analysis/context-ledger (`933f198de`), S2d repair-instructions/turn-intent/synthesis-context + skill-lookup port + injectable limits loaders (`e114416a4`); exit gate `pnpm pre-push` 35/35. **Libri REMOVED from the active chat tool system (`82a0d3705`, DJ-ratified; admin historical rendering kept).** S3: gateway payload diff came back DIVERGENT on both probe pairs → shared extraction; T1-T11 and access corrections are in `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_S3_EXTRACTION_MAP_2026-08-08.md`. The worker dispatches 34 reviewed shared reads, emits the LEGACY `get_project_overview` payload, and advertises only the signed surface ∩ allowlist. S4 keeps the provider lease across sequential rounds, compacts and wraps durable feedback, classifies canonical read ops, injects shared escalation, and allows at most two validation-repair passes. Audit corrected one premise: legacy durably/publicly records rejected calls. The worker now does too, behind the existing `read_tool` step and ledger-before-public fence, without invoking the read adapter; even the exhaustion attempt remains visible. The single two-sided golden pins valid read → validation failure → corrected read → success across four rounds and three distinct real tools. Local gates: worker 802 passed (1 skipped), runtime 180, legacy goldens 40, composed Postgres 9, typechecks clean, Svelte 0/0, lint/format clean. The receipt-isolated dry run named only `20260808130000_agentic_chat_tool_validation_failure_ledger.sql`; its staged/source SHA-256 matched (`c23e5b39a9560015413274c7ff745d2864bc0f14f16687368c7cfc0cf70439eb`), application succeeded, the linked receipt matches, and the post-apply dry run is empty. Live catalog/PostgREST checks verified the exact service-only contract and anonymous/client denial. No worker deploy, routing flip, or provider spend occurred. Next: S5 finalization semantics and the spend-gated battery.

**S5 IN PROGRESS — unit 1 complete; hosted schema subsequently verified (2026-08-08).** The shared runtime now owns legacy-compatible nested context-shift extraction; worker tool results emit the same stable `context_shift` event and feed the shifted scope into last-turn context. The four-round real-tool golden pins that event/lifecycle/context evidence on both adapters. Audit corrected `get_project_overview` bookkeeping to legacy `affected_entities = []` and null non-search telemetry. Migration `20260808140000_agentic_chat_true_tool_round_count.sql` keeps call count ledger-derived while validating the executor's true provider-round count, with a self-contained rollback proof. A later diagnostic found its body installed out of band without a receipt; the idempotence-hardened migration now has an 11/11 replay proof, matching hosted receipt, empty post-apply dry run, and independently verified body/grants/service boundary. No deploy/routing/provider spend occurred. The continuation document's read memo, context-gathering ledger, and applicable read-only finalization work is completed in the unit-2 entry below; its quality battery remains DJ-spend-gated.

**S5 unit 2 LOCAL + HOSTED SCHEMA COMPLETE; deployment/spend gate open (2026-08-08).** The worker production round bridge now memo-serves only exact successful pure reads within one invocation, but every repeat still gets a fresh provider identity and crosses the normal durable-ledger-before-public fence before continuation. One shared `ContextGatheringLedger` per invocation consumes actual durable feedback/model-payload evidence and emits monotonic narrowing/saturated/must-synthesize guidance. The terminal rank produces a real tool-free provider pass; its candidate stays buffered, tool-request/empty outcomes get one bounded retry, rejected text cannot leak publicly, and accepted text is sanitized once with aggregate usage and finish reason preserved. Audit found the worker's retry prompt had drifted from legacy; both paths now import the exact instructions from shared runtime, and a mixed partial-text-plus-tool-request test proves rejected text never leaks. Applicability audit deferred exact-option/anchor repair and length continuation because neither is proven by the P1 read-only referee and the current immediate stream cannot retract or safely merge partial text; mutation/supervisor/skill/research repairs remain out of reach. Local gates: focused worker 64/64, full worker 812 passed + 1 intentional skip, runtime 183/183 plus declarations, legacy 40/40, Postgres 11/11 including migration replay, typechecks, Svelte 0/0, lint baseline, and touched TypeScript files passing Prettier. Hosted diagnosis found the complete S5 body already installed without a receipt; the migration now accepts only that complete guarded shape. Receipt-isolated apply succeeded with source/isolated SHA-256 `ad7ef37205c6cbdf7128fc3d75794a93eb7c478219686759130d2de845d20d13`; receipt, empty post-apply dry run, unchanged body MD5 `18a6f5d0333bb72b9129019d34be6b21`, all guards, invoker/search-path settings, service-only ACL, and the 16-required-argument PostgREST route are verified. The prepared spend-gated quality battery is exactly two fully P1-reachable scenarios × three repetitions = nine turns; the matching Phase 0 rows were 9/9 complete/assertion-passing at `$0.01646978` aggregate provider cost. Revision `f98062d23` was subsequently pushed and deployed; the first live attempt exposed the harness defect recorded below rather than producing worker quality evidence.

**S5 LIVE-GATE HARNESS DEFECT FOUND; ROUTING RESTORED OFF (2026-08-08).** DJ pushed `f98062d23`; web and worker reached production, the exact one-user cohort was temporarily enabled, and a bounded nine-turn attempt ran. It is invalid as worker evidence because the harness called legacy `/api/agent/v2/stream` directly instead of negotiation → worker admission → private Realtime. Two successful `update_onto_task` calls prove legacy execution because P1 worker has no mutating surface. The invalid artifact is 9/9 completed, 7/9 assertion-passing, `$0.01729275`, with one capture gap; none of those outcomes grade S5. Production is back to exact routing `false` on Ready deployment `build-dhlz7w05q`. The local harness now has an explicit fail-closed `worker_realtime` mode, product Realtime + reconciliation consumption, exact per-turn execution-mode/contract assertions, and evidence attribution; a routing-OFF live preflight authenticated/subscribed and stopped before model spend when negotiation returned legacy. Focused tests 4/4, touched ESLint clean, Svelte 0/0. Next: commit the harness hardening, repeat the clean route-on nine-turn gate, and restore routing OFF unconditionally.

**S5 + P1 COMPLETE; ROUTING RESTORED OFF (2026-08-09).** The first worker-aware run exposed two real adapter defects in sequence: narrated text before a read call was incorrectly terminal, then valid same-round parallel reads were rejected at provider index 1. Commits `fe338af7` and `8f22819fc` repair those contracts; `8f22819fc` executes provider calls sequentially in emission order behind the existing durable-ledger-before-public fence and replays all ordered results together. Railway deployment `cf6e3753-f4d4-4c22-aa0d-64978a60bc58` is healthy. A routing-OFF preflight failed before model spend, the formerly failing cold catch-up passed a one-turn diagnostic with five calls across three rounds, and the exact authorized battery then passed 9/9 completed + 9/9 assertions with zero stream/capture errors. All rows are exact `worker_realtime/agentic_chat_worker_v1`; the three catch-ups recorded `4/2`, `5/2`, and `5/2` call/round counts. Cost was `$0.00643681`, 60.9% below the matching Phase 0 subset's `$0.01646978`. The checksum-backed packet is `docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_18_S5_LIVE_GATE_2026-08-09.md`. The EXIT trap and independent post-run check both confirm `build-os.com` is back on routing-OFF Ready deployment `build-dhlz7w05q`. Next: plan P2 mutation/effect-reservation parity; do not widen routing.

**S2a COMPLETE (2026-08-08).** The `@buildos/agentic-chat-runtime/loop` subpath exists (tsup entry + `exports` map — landmine 5 handled — plus `/loop` vitest aliases in BOTH apps and the portability guard made recursive). The 13 registry-independent modules moved via `git mv` with their tests unchanged — including both hot prompt-text files (`tool-payload-compaction` 57KB; `tool-arguments`) and `tool-metadata` (+ its definition types) — with web originals now explicit named re-export shims; `gateway-op-aliases`/`update-value-validation` imports go straight to `@buildos/shared-agent-ops` (cycle-free, verified by install+build). Gates: package 120 tests + typecheck, web FULL suite 3615 + svelte-check 0/0 + goldens 40/40, worker 776 + TS7. **S2b remaining:** injected catalog port for the registry-dependent leaves (`getToolRegistry()` lives inside nested classification helpers → port must be an installed provider, and the registry build pulls the web-only definitions closure), `repair-instructions` (78KB, needs turn-intent/tool-selector closure), `limits.ts`/`context-usage.ts` env-read conversion, the three runners, and the lint-rule/`pre-push` full exit gate.

**S1 COMPLETE (2026-08-08).** Multi-round fence with the existing single tool: `continueWithToolResults` on the provider contract (`synthesize` retained as the deprecated Phase 3 alias, fence byte-identical without the new method), executor-owned budgets `maxProviderRounds`/`maxToolCalls` (defaults 16/40, envs `CHAT_MAX_TOOL_ROUNDS`/`CHAT_MAX_TOOL_CALLS` via `loadAgenticChatPhase3Config`, specific failure codes `provider_round_budget_exceeded`/`provider_tool_call_budget_exceeded`), real `tool_round_count` in the executor's finalize metadata, `read_only_tools` golden extended to two rounds on BOTH sides (worker diff still exactly the registered done-event inventory; other three goldens byte-unchanged), lifecycle projection widened to N tool pairs, two-row disposable-Postgres ledger proof. Known live divergences registered durably in the Slice 18 plan §Known live divergences: the `get_project_overview` payload gap (close in S3) plus a NEW S1 finding — `finalize_agentic_chat_turn` derives durable `tool_round_count` capped at 1 (ledger rows carry no round attribution), owned by S5. Next: S2 (loop-leaf extraction to `agentic-chat-runtime/src/loop/*`).

### P2 — Mutating tools behind effect reservations — ✅ COMPLETE 2026-08-11

Adapter-by-adapter enablement through the Phase 2B effect ledger (`reserve → begin → receipt`). Every reachable mutating adapter must accept the reserved `effect_id`; adapters without downstream idempotency get classified no-retry/uncertain with reconciliation coverage (plan line 883). Includes the cancellation boundaries around reservation from §7.8.

**Checkpoint 2026-08-11:** S1-S4 are complete and hosted. S5 has 20 reviewed,
independently gated mutation tools; production bootstrap still supplies no
provider or adapter capabilities. The current inventory and recovery
classifications live in
`docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P2_S5_MUTATION_ADAPTER_INVENTORY_2026-08-10.md`.
The latest unit (`962625b25`) extracts notification-only `tag_onto_entity` to a
shared web/worker service and requires exact user UUIDs plus explicit
`mode: "ping"`; content tagging and handle resolution remain web-owned. No SQL
was required. A subsequent correctness audit found that the effect-scope
trigger could force authenticated legacy null-effect end-of-turn telemetry to
query the service-only effect ledger. The guarded trigger correction
`20260811230000` is now hosted: disposable PostgreSQL passes 13/13, the
receipt-isolated apply named only that migration, the post-apply dry run is
empty, and hosted catalog checks retain exact effect-linked scope validation
plus the invoker/search-path/access boundary. Remaining ontology graph rewrite
and delete tools are blocked on partial-change/tombstone reconciliation
evidence, while calendar mutations must not be developed on top of the
concurrent calendar refactor without first re-auditing its settled boundary.
Routing, deployment, provider spend, and live model writes remain OFF.

**Exit closure:** the code now enforces the exact 38/20/18 partition at module
load and rejects adapter-capability/router drift. Focused mutation proof passes
187/187; full worker 913 passed with one intentional skip; runtime 183/183;
legacy route 42/42; PostgreSQL 13/13; typecheck/build/lint/Svelte gates are
green. The 18 deferred calendar/delete/contact/external/control writes remain
outside the worker catalog until their owning later packages supply exact
reconciliation contracts. See the P2 exit evidence packet above.

### P3 — Session, prewarm, context, history, attachment, and vision parity

Prepared-prompt consumption beyond the canary shape, history strategies (compression, cutoffs), attachment references and live vision through the immutable input artifact.

**S1 complete (2026-08-11):** the aspirational
`agentic_chat_prepared_history_divergence` rule is now real. Worker inspection
rejects a prepared snapshot older than the latest persisted session message;
legacy consumption skips its just-admitted user row and applies the same rule
to the prior tail; lookup errors fail closed. Migration `20260812000000` repeats
the check at immutable artifact insertion after the admission lock and is
hosted through a receipt-isolated apply. App proof is 55/55 and the disposable
database proof covers current/stale/cross-scope/security cases. Next is S2:
exact prepared-row-to-artifact history validation plus trusted strategy,
compression, cutoff, and count evidence; its closure is recorded below. See the
P3 plan linked in Status.

**S2 complete (2026-08-11):** prepared history validation is strict and
fail-closed, preserves tool-call evidence, and defers attachment-bearing
prepared snapshots to S3 rather than dropping attachment state. New artifacts
hash exact `historyState` strategy/compression/count evidence. Hosted migration
`20260812010000` proves the frozen prepared history against the locked prepared
row and copies all four values onto the parent turn transactionally; worker
execution compares them back before provider work. The receipt-isolated apply
named only S2, the post-apply dry run is empty, and hosted catalog checks prove
the trigger body/security boundary. Local gates: shared 25/25, focused web
67/67, worker input 9/9, disposable PostgreSQL 11/11, and typechecks/Svelte
clean. Next is S3 attachment-reference parity; routing and capability gates
remain off.

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
