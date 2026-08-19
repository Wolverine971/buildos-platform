<!-- tasker/51-worker-behavioral-parity-phase4.md -->

# 51 — Phase 4: full worker behavioral parity

**Created:** 2026-08-07  
**Status:** P0-P5 COMPLETE (2026-08-13); P6's deterministic matrix is complete, but the hosted quality exit remains closed. The latest authorized six-class x3, zero-retry battery on exact `33b4faec` improved to 11/18 scenario repetitions and 14/21 turn assertions at `$0.11939497`, but two organization turns still emitted deterministic provider errors. Production is independently restored OFF/empty and healthy. The bounded two-file follow-up adds one non-executing unavailable-`skill_search` repair beside `skill_load` and uses the existing buffered forced-synthesis retry after durable clarification. Proof is focused provider 60/60, full worker 1,059 passed plus one intentional skip, clean typecheck, and lint with zero errors. It shipped in aggregate revision `6c73357ae` and exact Railway deployment `2a3c25d5-6621-4445-bea3-cceebafeb9ca`; stale route-promotion tests were corrected in `00246a8fc`, with authoritative CI run `32282265304` green. The deterministic repair has not been paid-retested; any further paid gate requires fresh DJ authorization. **Current handoff: `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_CONTINUATION_HANDOFF_2026-08-18.md`.** Route remediation ledger: `tasker/54-calendar-route-size-guard.md`. Independent review handoff: `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_INDEPENDENT_EVALUATOR_HANDOFF_2026-08-13.md`. P5 plan: `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P5_TELEMETRY_BILLING_PLAN_2026-08-13.md`. Master plan: `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md` §Phase 4 (lines 857–886).
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

**Exit closure:** the code enforced the exact 38/20/18 partition at module load
and rejected adapter-capability/router drift. Focused mutation proof passes
187/187; full worker 913 passed with one intentional skip; runtime 183/183;
legacy route 42/42; PostgreSQL 13/13; typecheck/build/lint/Svelte gates are
green. The 18 deferred calendar/delete/contact/external/control writes remain
outside the worker catalog until their owning later packages supply exact
reconciliation contracts. See the P2 exit evidence packet above.

**Post-exit surface drift correction (2026-08-13):** the newly signed
`request_email_account_connection` tool returns a browser-only, user-clicked
OAuth action and has no worker client-action/reconciliation contract. The
fail-closed audit caught it on the full worker run. It is now explicitly
deferred as `browser_user_action_handoff`, making the current partition
39/20/19 without widening the provider or adapter surface.

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

**S3 complete (2026-08-12):** the immutable input artifact now carries only
bounded, normalized attachment references with exact storage/source metadata,
expiry, byte-size, media-type, and checksum evidence. Admission and the hosted
`20260812030000` SQL contract reject malformed, inaccessible, drifting, or
oversized references before execution. Legacy OCR/text behavior remains intact,
while durable prompt/history surfaces stay URL-free. Focused shared, web,
worker, and disposable-PostgreSQL proofs pass; production routing and provider
capabilities remain off.

**S4 + P3 complete (2026-08-12):** the worker resolves eligible image
references only after execution starts, rechecks actor access and frozen source
metadata, streams and verifies the raw object against the frozen size and
SHA-256, then creates a separate short-lived transformed provider URL. A
generation-scoped, redacted `provider_media_resolved` observation must persist
before the provider call; raw bytes, storage pointers, and signed URLs never
enter durable history, prompt snapshots, observations, or client events. The
hosted `20260812040000` receipt was applied in isolation (source/staged SHA-256
`d023535b938e0d82db102b845bf8b8d81fbbbc8f09552cfc38afb366bf9b1e89`), and
the post-apply dry run is empty. Full worker proof is 355/355, focused web and
PostgreSQL proof is 30/30, shared contracts are 27/27, both app typechecks are
clean, and Svelte reports 0 errors/0 warnings. The independent worker
live-vision gate defaults false; routing, provider, mutation, and cohort gates
remain off. P4 is the next distinct work package.

### P4 — Supervisor/checkpoint + research/forward-carry parity

`chat_turn_checkpoints` semantics, clarification flows, deterministic research capture, and the route-side quality safeguards the legacy path performs after streaming.

**S1 complete (2026-08-13):** the pure legacy supervisor semantic core has
moved to the new `@buildos/agentic-chat-runtime/supervisor` subpath with thin
web re-export shims. Runtime proof is 192/192 plus declarations; focused legacy
orchestration/checkpoint/finalization proof is 75/75; worker typecheck is clean.
The accidental full-web invocation also ran the intended supervisor suites
green but exposed two unrelated baseline failures in malformed artifact JSON
classification and MCP advertised scopes. No SQL, deployment, provider call,
routing change, or capability widening occurred. S2 must preserve legacy's
durable failed pre-execution result behavior when the supervisor blocks an
exact retry; a prompt-only repair is insufficient. See the P4 plan linked
above.

**S2a host bridge complete locally (2026-08-13):** the correctness audit fixed
the extracted core's constructor-time wall clock so the explicit
`turn_started` observation now owns the semantic epoch. The new worker bridge
uses only frozen execution input/context, validates claim scope and ordered
timestamps, starts exactly once after the future execution fence, and emits
replay-stable action records scoped by execution generation and sequence.
Focused proof is shared supervisor 10/10, worker bridge 7/7, runtime declaration
build, and worker typecheck. It is intentionally unmounted and has no flag:
S2b must coordinate provider emissions with executor-confirmed durable results
and apply every non-terminal action before an enablement path exists.

**S2b unit 1 complete locally (2026-08-13):** an exhaustive reducer now maps
every actionable decision into typed worker effects: status semantic,
provider/recovery instruction, forced synthesis, legacy-compatible blocked
pre-execution result payload, eval flag, or explicit terminal request. It fails
closed on continue records, gaps, mixed generations, malformed blocks, and
conflicting terminals. Combined focused worker proof is 11/11; full worker is
939 passed with one intentional skip. Unit 2 must wire ordered observations and
durable effect application across executor/provider boundaries.

**S2b unit 2 + S2 complete locally (2026-08-13):** one prepared-invocation
coordinator starts at the execution stream fence and feeds ordered pass, text,
call, durable result, round, and final-candidate observations. Known failed
writes now cross the failed ledger/publication fence and return to the provider;
uncertain writes retain their effect-reconciliation stop. The real deterministic
bridge consequently reaches recovery and blocks an unchanged failed write retry.
That blocked call uses a distinct pre-execution failure step, invokes no adapter,
persists/publicizes the failure before continuation, and stays ordered in mixed
rounds. Status and forced synthesis integrate with the existing monotonic context
ladder; eval flags remain private stable-identity diagnostics. The application
port is now generically named `persistFailure`, while the already-hosted
validation-named RPC remains unchanged and needs no migration. A separate
`AGENTIC_CHAT_WORKER_SUPERVISOR_ENABLED` exact-boolean gate is wired default-off
and unset in production. Focused worker proof is 140/140, full worker 949 plus
one intentional skip, shared runtime 193/193 plus declarations, and worker
typecheck/diff checks pass. Next is S3 checkpointed clarification terminal.

**S3 complete and hosted (2026-08-13):** the real deterministic supervisor now
turns two repeated durable write-validation failures into a typed
`supervisor_question` without starting another provider pass. The executor
persists a stable checkpoint through a service-only turn/job/generation/token
fence before publishing `waiting_on_user`, emitting the question, or committing
the completed terminal. Checkpoint timeouts requeue idempotently without leaking
the question. Shared clarification and supervisor-checkpoint goldens are exact
on legacy and contract-exact on worker outside the existing timing/done split,
and both coverage trackers remain fail-closed. Migration `20260813010000` is
receipt-isolated, hosted, visible through the exact 13-argument service RPC,
and followed by an empty dry run; source/staged SHA-256 is
`47ae1d882d78973e4757c777bae41584aa68971bf8b44bee751d71e65bdcbbdc`.
Final proof: runtime 193/193, legacy route 43/43, full worker 959 passed plus one
intentional skip, worker typecheck, and disposable PostgreSQL 1/1. Supervisor,
routing, provider, mutation, and cohort gates remain off. Next is S4 immutable
resume claim/freeze/state-transition semantics.

**S4 complete and hosted (2026-08-13):** the web freezes the selected active
checkpoint and canonical resume prompt into the hashed v3 artifact; artifact
admission atomically verifies/claims that exact row, and the worker never reloads
mutable checkpoint state. Terminal truth consumes a completed resume or restores
a failed/cancelled one. The service-only recovery RPC expires/reconciles stale
state while preserving live queued/running claims, and the legacy route now uses
that RPC too. Migration `20260813020000` is hosted receipt-isolated with SHA-256
`067ee493c88139b6821d03f399b4f8432a408154c0659f2487eca37add157195`, an
empty post-apply dry run, live ACL probe, generated types, and 261-name RPC drift
alignment. A genuine two-connection admission race has one claimant. Final proof:
worker 960 plus one skip, runtime 193/193, shared 28/28, focused web/route/SQL
61/61, clean typechecks, and Svelte 0/0. All production gates remain off. Next
is S5 deterministic research capture from durable terminal tool evidence.

**S5 complete and hosted (2026-08-13):** exact legacy research qualification
and rendering are shared; the worker reads bounded generation-fenced durable
tool evidence and atomically commits one replay-safe terminal effect with the
live/archive Research Log mutation. Capture failure cannot invalidate the
answer. Migration `20260813030000` is hosted receipt-isolated with SHA-256
`208e51a9920e079edf0b518b66cad8c821358930658508eb5a1509e308cbd84c`, an empty
post-apply dry run, correct live ACL probes, and 265-name generated RPC parity.
Final gates: worker 964 plus one skip, runtime 195/195, shared 28/28, focused
web/route/SQL 78/78, typechecks/builds, and Svelte 0/0. All production gates
remain off. Next is S6 deterministic forward carry.

**S6 complete and hosted (2026-08-13):** raw admitted user text now drives the
conservative stated-future gate, while a bounded service-only SQL reader supplies
only durable tool fields consumed by the exact shared successful-write/no-new-
record predicate. Eligible turns create the legacy-shaped task through a stable
effect and the exact `stated_future_capture:<streamRunId>` downstream key, with
safe ambiguous retry, terminal coded failure, and generation/cancellation
fencing. Migration `20260813040000` is hosted receipt-isolated with SHA-256
`eb0bf83002dd36806f58a479383c173640ed64c3295abb15450bb5f4f9178452`, an empty
post-apply dry run, correct live ACL probes, and 266-name generated RPC parity.
Final gates are worker 970 plus one skip, runtime 197/197, shared 28/28, focused
legacy/shared/PostgreSQL 105/105, clean typechecks/builds, and Svelte 0/0. All
production gates remain off. Next is S7 finalization safeguards and package exit.

**S7 COMPLETE LOCALLY; P4 PACKAGE EXIT GREEN (2026-08-13).** The legacy
finalization guard is now a shared runtime policy with a thin web shim. The
worker applies shared mutation-outcome integrity and finalization guarding from
the raw admitted message and durable generation-fenced ledger before its
terminal CAS; correction text becomes durable before provider authority is
marked finished, terminal/last-turn state uses only corrected text, and
supervisor questions are untouched. Checkpoint cleanup is already S4-owned and
the deterministic research/forward-carry floors are S5/S6-owned. Model repair
for project-create/general mutations, skill-load, and organization plus pending-
intent session metadata are explicitly deferred until the immutable artifact
contains their structured intent/skill/commission state and the worker has the
required reviewed compound-effect or session-metadata transaction. Prompt-text
reconstruction is not accepted as parity. No S7 SQL was needed. Exit gates:
runtime 212/212 plus declarations, worker 976/976 with one intentional live-eval
skip, legacy supervisor/finalization/route 124/124, shared types 28/28, clean
typechecks, Svelte 0/0, and `git diff --check`. The live provider quality battery
remains DJ-spend-gated and was not run; every production gate remains off. Next
is P5 cost/accounting, session metadata, and terminal consumption billing.

### P5 — Telemetry, cost, and billing parity

Prompt snapshots, timing (already live), cost accounting, session metadata, and the consumption-billing gate: frozen-account rejection at admission and gate re-evaluation at terminal finalization so worker-mode spend is measured no later than legacy-mode spend (plan line 871).

**S1 COMPLETE LOCALLY (2026-08-13); no migration required.** The worker now
shares web's consumption limits and exact default-off gate, strictly validates
the existing gate RPC, and re-evaluates every post-start turn before terminal
CAS/recovery. The provider usage observation attempt is awaited before terminal output;
billing failures are bounded and observable but cannot strand terminal truth.
Pre-start/cohort-rejection paths are proven not to evaluate. Focused proof is
112/112 plus clean shared/worker typechecks, shared declarations, and Svelte
0/0. No deployment, spend, or gate change occurred. Next is S2's
prompt/timing/cost differential audit; authoritative plan:
`docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_P5_TELEMETRY_BILLING_PLAN_2026-08-13.md`.

**S2 COMPLETE AND HOSTED (2026-08-13).** The worker's first-response prompt
snapshot now records the exact canonical provider tool definitions and their
independent hash. The rollout-safe service-only v2 RPC preserves all v1
identity/status/ownership checks, validates artifact tool-surface membership,
supports an older v1 worker followed by v2 backfill, and rejects drift
atomically. Hosted migration `20260813050000` has matching source/staged
SHA-256
`9d8b095b28ab8e981db243860f3fc820b3d9b5278d37caf2deb9b6bad111e8bd`,
an empty post-apply dry run, correct live ACL/OpenAPI probes, and regenerated
shared types. Provider usage rows now use stable
turn/generation/logical-round/route identities with replay-safe strict upsert;
they retain exact upstream input/output cost when available and use the legacy
provider-total/catalog fallback otherwise. Async timing is exact for DB-owned
lifecycle evidence, while `done_emitted_at=null` is a deliberate client-delivery
boundary. Full proof: worker 986 plus one intentional skip, smart-LLM 72/72,
shared 28/28, PostgreSQL 1/1, clean typechecks/builds, worker check with zero
errors, Svelte 0/0, and clean diffs. Usage persistence remains bounded during a
DB outage so terminal truth cannot be stranded; no unowned delayed retry is
claimed. No paid provider battery or production gate change occurred. Next is
S3's immutable turn intent and ownership/generation-fenced session-metadata
transaction; detached model reconciliation remains deferred.

**S3 UNIT 1 COMPLETE AND HOSTED (2026-08-13).** New v3 artifacts freeze the
canonical structured turn intent and independently derived ordered write-tool
expectations, while the optional field keeps already-queued rolling artifacts
compatible. Shared and database validators reject malformed, inconsistent,
duplicate, or derivation-drifted snapshots. A completed-worker status trigger
then derives fulfillment only from immutable intent and durable successful
write rows and shallow-merges `fastchat_pending_turn_intent` in the same
transaction as terminal message/event/turn truth. Unfulfilled writes retain a
legacy-compatible 24-hour continuation; fulfilled and explicit-clear turns
store JSON null without disturbing unrelated metadata. The worker's terminal
assistant metadata uses the shared legacy outcome resolver. Receipt-isolated
migration `20260813060000` has matching source/staged SHA-256
`822ba7ee6536fd2987949b27bb2358560770177aad5849b01778985a1e42c7f6`,
linked receipt, empty post-apply dry run, exact service result, anon denial,
regenerated types, and aligned 268-function RPC drift. Proof: worker 987 plus
one intentional skip, runtime 212/212, shared 29/29, focused web 52/52,
composed PostgreSQL 14/14, clean typechecks/builds, worker check zero errors,
Svelte 0/0, and clean diffs. No paid provider run, application deployment,
routing/capability widening, or flag change occurred. Next is S3 unit 2:
inventory and freeze only deterministic admission-known used-domain and
loaded-skill inputs before extending the same terminal transaction; prompt
reconstruction is forbidden. Detached reconciliation remains deferred to an
owned durable job/receipt contract.

**S3 UNIT 2 COMPLETE AND HOSTED (2026-08-13).** New v3 artifacts freeze the
exact post-sensing legacy domain state plus bounded sorted
skill/outcome-card-to-domain maps, while older queued artifacts remain valid.
The terminal status transaction shallow-merges only `fastchat_domain_state`:
sensing survives all terminal outcomes and completed/cancelled turns project
only successful durable domain, skill, resource, outcome-card, and
work-capability loads. Used signals, gaps, and research backlog entries are
deduplicated, stable, bounded, and scope-fenced. Successful `skill_load` rows
already provide loaded-skill continuity to later admission history, so no
duplicate session field was added. Receipt-isolated migration `20260813070000`
has matching source/staged SHA-256
`ba0fdbb76ef1d5446912749c33ad2a133e77c9ea90fe3fd57a4a6c2b7a485aca`,
linked receipt, empty post-apply dry run, correct service helper results, anon
denial, regenerated types, and aligned 273-function RPC drift. Proof: worker
987 plus one intentional skip, runtime 212/212, smart-LLM 72/72, shared 30/30,
focused web 52/52, composed PostgreSQL 15/15, clean typechecks/builds, worker
check zero errors, Svelte 0/0, and clean diffs before documentation/type
regeneration. No paid provider run, application deployment, routing/capability
widening, or flag change occurred. Next is P5 S4 package exit; detached model
reconciliation remains deferred to an owned durable job/receipt contract.

A concurrent post-deploy edit added only the migration's leading file-path
comment. Its current source hash is
`348feeca79d47e6987b87fabe23a37c95f51fdc6e4b830eeced86e74d6e0b643`;
without that comment it is byte-identical to the deployed `ba0f...` copy, so
there is no executable SQL drift or follow-up deployment.

**P5 S4 COMPLETE (2026-08-13).** The post-generation package exit passed
worker 987 plus one intentional skip, runtime 212/212, smart-LLM 72/72, shared
30/30, focused web 52/52, composed PostgreSQL 15/15, worker check with zero
errors, Svelte 0/0, aligned 273-function RPC drift, and clean diffs. Production
examples still default the worker, routing, live vision, supervisor, billing,
and cohort gates off. P5 exits without an application deployment, provider
spend, route/capability change, or billing flag change.

### P6 — Cancellation/error/finalization differentials + quality battery

Differential coverage for success, clarification, read-only tools, mutating tools, supervisor checkpoint, cancellation, timeout, and provider error (the plan's eight scenario classes), then the agentic E2E quality battery against the Phase 0 baseline (24/24 scenario gate from `agentic_chat_worker_phase0_gate_2026-07-31_0f63e47bb.json`).

**DETERMINISTIC MATRIX COMPLETE (2026-08-13); HOSTED QUALITY BATTERY
REMAINS SPEND-GATED.** A provider-deadline fixture now captures a timeout before
any provider response on both the legacy route and real worker executor using
the actual typed `timed_out` terminal error. The worker matches terminal status,
public error/event order, the private `stream_terminal_failure` lifecycle row,
and message persistence. Its timeout-only ratified differences are narrower and
more truthful than legacy: async timing ownership, unknown token usage remains
`null` instead of fabricated zero, and no first-response prompt snapshot is
claimed when no response occurred. The worker-only done status/failure code is
the same explicit payload gap already tracked for all scenario classes. Both
coverage trackers now exercise all eight registered classes with none blocked.
Focused proof: legacy route 44/44, worker fixture 61/61, runtime 212/212, and
the spend-free agentic E2E instrument suite 44/44. The next action is the full
hosted 24/24 quality battery, which requires explicit provider-spend and
application-deployment authorization; no production gate was changed.

**HOSTED QUALITY BATTERY RAN; NO-GO REMEDIATION IN PROGRESS (2026-08-15).** The
authorized exact-revision, zero-retry 8×3 battery passed 12/24 repetitions and
was not rerun. It exposed three shared causes: impossible create-target
semantics (including organization folder creation), provider SSE bodies not
reliably obeying the 90-second request timeout after headers, and a harness
deadline that combined worker execution with assertions/judging/capture.
Subsequent revisions committed and deployed the initial remediation and timeout
cleanup with focused runtime, worker provider/client, E2E harness, typecheck,
and Svelte proof. Production gates were restored off/empty; see the
focused-retest entry below for the current boundary.

**TWO FOCUSED RETESTS RAN; RESEARCH GATE STILL RED (2026-08-16).** Revision
`cab842a83` passed `project-organize` and `task-complete-cold-reference`, closing
the immediate create-target/harness failures, but both research scenarios ended
in `provider_stream_error`; the passing organization turn also took 267.7
seconds. Revision `e995c1c2` then added abort-aware cleanup for the losing
provider promise. Its exact two-scenario research canary still passed 0/2: one
turn failed because `minimum_successful_effects: 0` bypassed shallow validation,
and the other completed three read tools before a final provider attempt was
observed for 140.5 seconds and surfaced the configured 90-second timeout. The
important cleanup proof is green: the worker process did not restart and no
unhandled rejection was logged. A four-file patch routes invalid contracts
through the existing validation-repair loop and asks OpenRouter to sort
providers by throughput without a chat-level hard cutoff. Proof is runtime
243/243, worker 1,047 passed plus one intentional skip, focused web 68/68, clean
typechecks/build, and worker lint with zero errors. The user committed and pushed
that patch in `fd5b84ed`; exact Vercel/Railway deployment is verified healthy,
but its production canary has not run. The latest evidence is
`docs/plans/evidence/agentic_chat_worker_phase4_timeout_cleanup_retest_2026-08-15_e995c1c2.json`.
Production routing is exact false and mutation capabilities are empty. Continue
from
`docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_CONTINUATION_HANDOFF_2026-08-16.md`;
do not fund another full 8×3 battery until the narrow research gate is clean.

**THIRD FOCUSED RETEST RAN; TIMEOUT-RACE AND SNAPSHOT REMEDIATION READY LOCALLY
(2026-08-17).** The exact `731505dc` two-scenario, one-repetition, zero-retry
research canary passed 0/2 and cost `$0.03047566`. Contract validation and
throughput routing behaved directionally correctly, but final provider attempts
were observed for about 117.6 and 160.5 seconds against a 90-second deadline.
Both turns durably failed, prompt snapshots were rejected with
`agentic_chat_prompt_snapshot_messages_mismatch`, and Railway recorded an
unhandled timeout rejection followed by a queue restart after the second
terminal. Production routing/capabilities were restored off/empty and verified
healthy; the full battery remains blocked. A local regression test now
reproduces the exact timeout-while-yielded race and proves the read-thunk fix.
A private provider-attempt timing receipt now distinguishes header time, timer
overshoot, and post-timeout cleanup without changing the public stream or
provider deadline policy.

A rollout-safe prompt-snapshot v3 wrapper preserves the established v2 fences,
persists deterministic system-only runtime augmentation, and rejects role/scope
drift. Proof is full worker 1,049 passed plus one intentional skip, focused
worker 142/142, worker typecheck, exact rerun 27/27, shared types 30/30 plus
typecheck, disposable PostgreSQL 1/1, and clean scoped diffs. No commit, push,
migration, deployment, flag change, or further spend has occurred. Evidence:
`docs/plans/evidence/agentic_chat_worker_phase4_research_retest_2026-08-17_731505dc.json`.
The hosted drift check currently reports only the expected generated-local
`persist_agentic_chat_prompt_snapshot_v3`; apply that migration before the
worker rollout, then require zero drift.

Continue from the 2026-08-17 addendum in the handoff and do not run another
canary until the migration and exact application revision are deliberately
approved, rolled out, and verified.

**FOURTH FOCUSED RETEST STOPPED AT WORKER-LEASE PREFLIGHT; NEGOTIATION-BUDGET
FIX READY LOCALLY (2026-08-17).** The user deployed the preceding remediation
as exact revision `526ead631`. Hosted RPC drift, exact Vercel/Railway revision,
health, and the narrow routing/`createOntoTask` gates were verified before the
authorized two-scenario zero-retry run. The harness stopped before either
scenario because negotiation returned no worker lease. Its retained artifact
has zero turns, zero model/tool calls, and `$0` provider cost. The cohort UUID
was correct and the worker capacity endpoint was open; a later lease-only probe
selected `worker_realtime/agentic_chat_worker_v1` with an open attempt-1
capacity observation. Inspection found that the client aborts negotiation at 3
seconds even though the server's bounded observation contract permits 5 seconds
plus one 2.5-second fresh attempt. A local two-file fix raises the client budget
to 10 seconds and adds an abort-aware 7.501-second lease regression. Focused
transport/capacity proof is 19/19 and scoped diff checking is clean. Production
was restored and independently verified with routing exact false, both
capability lists empty, healthy exact-`526ead631` deployments, and HTTP 200.
Evidence:
`docs/plans/evidence/agentic_chat_worker_phase4_research_retest_2026-08-17_526ead631.json`.
No commit, push, redeployment, or further paid run has occurred for this
follow-up; the full battery remains blocked.

**FIFTH FOCUSED GATE PASSED; FULL EXIT BATTERY IS NOW JUSTIFIED
(2026-08-17).** Commit `897e16465` added deterministic pre-tool narration and
an external market-research evidence floor. Its split canary showed one
remaining production defect: the failed research turn's frozen tool artifact
contained neither `web_search` nor `web_visit`. Commit `ba6cac3e7` fixed the
root cause by forwarding the latest user message into fast-chat tool selection
and pinned the exact production prompt in regression coverage.

The exact `ba6cac3e7` zero-retry retest passed 2/2 scenarios and all 3 turn
assertions. All terminals completed, attribution was exact
`worker_realtime/agentic_chat_worker_v1`, stream/capture errors were zero, and
each turn retained one prompt snapshot. The research turn completed two
`web_search` and three `web_visit` calls, then its cold follow-up read the
persisted result. Total cost was `$0.0184428`. Evidence:
`docs/plans/evidence/agentic_chat_worker_phase4_research_admission_retest_2026-08-17_ba6cac3e7.json`
(SHA-256
`15945e43a74f410c0c8848d3b8d40b97f420505c0d4c7d4ec7b380251d3afba2`).

No restart or unhandled rejection occurred. A non-blocking legacy activity-log
foreign-key error remains because mutation adapters place a chat-session UUID
in `agent_call_session_id`; the actual writes and every gate assertion still
succeeded. Track that context-linkage issue for reliability hardening rather
than changing the now-green behavior gate. Restoration was independently
verified: Vercel `dpl_H2EgKqUwzoV7nsbc8Nh8hFTCCNSE`, Railway
`5068ae4a-cb04-4ea3-9c37-1682c4371389`, routing exact false, both mutation
capability strings exact empty, site 200, and healthy queues with zero claim
failures. Proceed to the full 8x3 battery, then restore the same safe state
unconditionally.

**2026-08-18 COURSE CORRECTION IN PROGRESS; LEGACY COMPARATOR PINNED.** The
preceding instruction to run a full 8x3 battery is retired by the current
handoff. The 08-17 research/narration coercion and its regression guard are now
deployed in `31a89acd6`; this continuation did not create that commit. The
four-run Phase 0 comparator is now derived and retained at
`docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_COMPARATOR_2026-08-18.md`.
Across 12 attempts per scenario, the six Phase 4 exit bars are:
`project-catchup-cold` 12/12, `project-organize` 10/12,
`restraint-noop-and-ambiguity` 12/12, `task-complete-cold-reference` 11/12,
`task-multi-update` 12/12, and `task-reschedule-cold-reference` 9/12. The two
Phase 5 research rows are retained in the same packet for completeness.

The route split and coercion removal landed in DJ's aggregate commit
`31a89acd68d475b436582e806cbd7130fc826241`. Exact deployment is verified:
Vercel `dpl_4A7ZYnA1LvT6c4wemvmryX7b9iN6` is Ready and aliased to `build-os.com`;
Railway `833de648-4eab-489f-a1d5-7fd9f8d6ac8d` reports SUCCESS for that SHA; the
site returns HTTP 200. DJ then pushed the six older CI-contract remediations in
`ae3a241bd9fc8e847048f5e28e26ac9400ccd0fb`. CI run `32164236966` proved
typecheck, schema tooling, and full lint green, then exposed one unrelated Twilio
clock race. The four-file deterministic follow-up pins that clock, replaces an
expired PostgreSQL checkpoint fixture with transaction-relative time, and fixes
two loaded coverage-test timeout budgets without changing production behavior.
Focused proof is Twilio 9/9, disposable PostgreSQL 1/1, and loaded web 12/12.
Exact `pnpm turbo test:coverage` passes 17/17 tasks, including all 593 web files
and 3,786 web tests. The fixes landed in aggregate commit
`091300faf4a254762ce02219e108cff4c56d8582`; authoritative CI run
[`32174155571`](https://github.com/Wolverine971/buildos-platform/actions/runs/32174155571)
passed typecheck, schema tooling, lint, coverage, deep-research database
integration, and artifact upload. Exact-SHA Vercel and Railway statuses succeeded,
and `build-os.com` returned HTTP 200. No production flag change, live smoke,
canary, or provider spend occurred. `main` is green. Next: obtain fresh DJ
authorization for the single six-class x3 worker battery with exact mutation
capabilities and unconditional production restoration.

**SIX-CLASS EXIT BATTERY EXECUTED; NO EXIT; PRODUCTION RESTORED (2026-08-18).**
DJ authorized one six-scenario x3, zero-retry production battery against clean exact revision
`091300faf4a254762ce02219e108cff4c56d8582`. The initial readback found undocumented drift
(routing stored true and both worker capability lists holding five mutations), so production was
first normalized to off/empty and independently verified. A first zero-spend preflight then failed
during clean-worktree module collection because workspace packages had not been built; it ran zero
tests and zero model turns, and production was restored before retrying. After dependency builds and
SvelteKit sync, the repaired no-spend worker lease preflight passed 1/1. The authorized battery ran
on Vercel `dpl_AGWKeak8AWeKPJDMNVuCgYhpyPSy` and Railway
`b4f308cb-cd27-44eb-8aeb-d350a4c327de`, with routing limited to the existing one-user cohort and
both capability lists exact `updateOntoTask,moveDocumentInTree`.

Result: **8/18 scenario repetitions and 11/21 turn assertions passed; Phase 4 does not exit.**
`project-catchup-cold` and `restraint-noop-and-ambiguity` met their legacy comparator rows;
`project-organize`, `task-complete-cold-reference`, `task-multi-update`, and
`task-reschedule-cold-reference` missed. Four turns failed closed with
`provider_tool_not_allowlisted`: `project-organize` twice emitted `create_onto_document`, proving
the two-capability staging inventory was incomplete for a legitimate parent-creation organization
strategy; one reschedule and one multi-update emitted unavailable `skill_load`. Six additional
stream-clean attempts requested clarification instead of executing the commissioned mutation. All
21 turns reached retained terminal evidence, capture errors were zero, cost was `$0.08247295`,
client total p50/p95/max was `49.261s/91.107s/94.434s`, and the artifact SHA-256 is
`a588e6751c90fb6ee990e34dd0a120a3e261147b857c654ad41e8a3bc86f6aec`.

The EXIT trap restored production immediately. Independent checks verify Vercel
`dpl_2269rqUemoWW6KYdVv1NnLYSDyJA` Ready and aliased with routing exact false, Railway
`4bac57e3-c56a-4919-98ff-25385ec7e8d6` SUCCESS on exact `091300faf`, both capability lists empty,
worker healthy/idle with zero claim failures, the cohort unchanged, and `build-os.com` HTTP 200.
The checksum-backed packet is
`docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_SIX_CLASS_EXIT_BATTERY_2026-08-18.md`; the JSON is
`docs/plans/evidence/agentic_chat_worker_phase4_six_class_exit_2026-08-18_091300faf.json`.
Next: correct the capability inventory, add a bounded absent-skill contract remediation, and
tighten semantic disposition guidance for uniquely resolved conversational mutations without
reintroducing output coercion. Prove locally. Any paid retest requires fresh DJ authorization.

**LOCAL POST-BATTERY REMEDIATION COMPLETE; NOT HOSTED (2026-08-18).**
`readOnlyProvider.ts` now gives an unavailable `skill_load` exactly one non-executing repair pass
through the existing semantic disposition gate when a reviewed mutation surface is present. The
provider never receives `skill_load`; a repeated attempt and every other unadvertised tool still
terminate through the permanent allowlist error. The same gate now explicitly recognizes uniquely
matched past-tense completion reports, direct reschedules/prioritizations, multi-change utterances,
and delegated organization including reasonable parent creation, while retaining clarification for
real multi-target ambiguity. The corresponding provider tests cover the repair and its bounded
failure behavior. Proof: focused provider 59/59, full worker 1,058 passed plus one intentional skip,
worker typecheck clean, worker lint/HTTP guard zero errors, and Prettier clean. The future authorized
battery must recheck and then stage exactly
`createOntoDocument,updateOntoTask,moveDocumentInTree` in both capability lists. No commit, push,
deployment, production flag/capability change, or further provider spend occurred. Fresh DJ
authorization is required for both committing this shared-worktree patch and any hosted retest.

**FIRST REMEDIATION RETEST EXECUTED; STILL NO EXIT; PRODUCTION RESTORED
(2026-08-19).** The worker repair landed in aggregate revision `f5f9917e`; the loaded document
interaction test's lazy-import CI stabilization landed as `870c3feef`. Authoritative CI run
[`32212816674`](https://github.com/Wolverine971/buildos-platform/actions/runs/32212816674)
passed typecheck, schema tooling, lint, coverage, deep-research database integration, and artifact
upload. Exact local coverage passed 17/17 tasks, 595/595 web files, and 3,800/3,800 web tests.

The clean exact-`870c3feef` zero-spend worker-lease preflight passed 1/1. The authorized six-class
x3, zero-retry production battery then passed **8/18 scenario repetitions and 11/21 turn
assertions**, exactly the same aggregate scenario count as the prior battery. Per class: catch-up
3/3, reschedule 2/3, restraint 2/3, multi-update 1/3, completion 0/3, organization 0/3. All 21 turns
retained completed terminal evidence; stream-error turns fell from four to one; capture errors
remained zero; provider cost was `$0.10674149`.

The typed Railway failure named `create_onto_document` even though `createOntoDocument` was staged.
The unavailable-`skill_load` repair had retained a transient semantic-gate subset, dropping the
stable admitted mutation surface. Nine more attempts missed semantically: seven over-clarified
commissioned or delegated actions, one ambiguous email reference mutated, and one
completion-forward-carry result scored 2/5 despite the task completion.
The checksum-backed artifact is
`docs/plans/evidence/agentic_chat_worker_phase4_six_class_remediation_exit_2026-08-19_870c3feef.json`
(SHA-256 `4480352b27ab9b82d4008b544f4d729e04b0f2d95ec60f225c1d8c5ab43f0fb5`).

The guarded restore is verified: Vercel `dpl_DvmkNiQ5ibkCUJyd63YSgCeoUj8C` Ready and aliased with
routing exact false; Railway `8e251601-efe3-4029-9409-a25be0d61a11` SUCCESS on exact `f5f9917e`;
both capability strings empty; cohort unchanged; worker healthy; site HTTP 200.

**SECOND FOLLOW-UP COMMITTED AND DEPLOYED; PAID RETEST NOT RUN (2026-08-19).** The provider now restores
the stable admitted surface after one non-executing unavailable-skill retry, applies the
pre-mutation withholding gate to continuation passes, and feeds one shared commission-guidance set
to the acting disposition gate plus both independent semantic-review prompts. Repeated
`skill_load`, every other unadvertised tool, and genuine multi-target ambiguity remain fail-closed.
Proof: focused provider 59/59, full worker 1,058 plus one intentional skip,
worker lint/HTTP guard and typecheck green, Prettier and scoped diff checks clean. The next exact
capability inventory is
`createOntoDocument,createOntoTask,updateOntoTask,moveDocumentInTree` in both provider and adapter
lists after a fresh surface recheck. Commit `33b4faec0` is on `origin/main`; CI run `32218882941`
passed every required job; Railway `e2eab557-0ab1-488a-b778-d3afe10b48fc` is SUCCESS and healthy on
the exact commit with both capability lists empty. Vercel `dpl_AiKGEXaz645PQjMxj5dkT7C3CUJo` is
Ready with routing false, the cohort unchanged, and public HTTP 200. No paid retest,
routing/capability change, or provider spend occurred. Any hosted retest requires explicit
authorization and unconditional restoration.

**SECOND REMEDIATION RETEST EXECUTED; IMPROVED TO 11/18; STILL NO EXIT; PRODUCTION RESTORED
(2026-08-19).** The run used a clean detached exact-`33b4faec` worktree, Railway deployment
`7d3dc9df-f8d6-4a1a-b630-a29806cbdee1`, Vercel deployment
`dpl_fWcknFAHtGvDkJCsZZM8kTqFoFU8`, the same exact one-user cohort, and both capability lists exact
`createOntoDocument,createOntoTask,updateOntoTask,moveDocumentInTree`. The zero-spend worker lease
preflight passed 1/1 in 7.823 seconds. The single six-class x3, zero-retry paid battery then passed
**11/18 scenario repetitions and 14/21 turn assertions**: catch-up 3/3, reschedule 3/3, restraint
2/3, multi-update 2/3, completion 1/3, and organization 0/3. Cost was `$0.11939497`; all 21 turns
retained completed terminal evidence; two turns emitted stream errors; capture errors were zero.

Both deterministic misses were organization runs. Railway typed diagnostics show one unavailable
`skill_search` rejected as `provider_tool_not_allowlisted` with no execution; the other reached
durable `request_turn_clarification`, then a tool-free synthesis pass attempted another tool and
failed as `provider_tool_call_disabled`. Five stream-clean misses were judgment outcomes: one
delegated organization over-clarification, two task-completion over-clarifications, one ambiguous
over-mutation, and one multi-update over-clarification. The checksum-backed artifact is
`docs/plans/evidence/agentic_chat_worker_phase4_six_class_second_remediation_exit_2026-08-19_33b4faec.json`
(SHA-256 `7b01ae2dce6d023d2861f5a6fde1feb801e0c20ef14b72ab0ca194d442738438`).

The guarded EXIT path restored production. Final receipts are Vercel
`dpl_HiFX44rvVcJE15DmK1B6LnuxCLpF` Ready and aliased with routing exact false, and Railway
`59ab22eb-b4cf-4c88-8de1-1b0bffea462f` SUCCESS on exact `33b4faec` with both capability lists
empty. The cohort is unchanged; worker and public site are healthy/HTTP 200.

**POST-SECOND-RETEST FOLLOW-UP SHIPPED; NOT PAID-RETESTED (2026-08-19).** The unavailable-skill
repair now recognizes exact `skill_load` and `skill_search`, never executes either rejected call,
restores the admitted surface for one bounded retry, and preserves permanent fail-closed behavior
for repetition or any other unknown tool. Post-clarification prose now uses the already-bounded
forced-synthesis path: one stray tool attempt is buffered/discarded and retried tool-free instead
of failing the turn. Focused provider proof is 60/60; full worker is 1,059 passed plus one
intentional skip; worker lint/HTTP guard/typecheck and Prettier are green. The follow-up landed in
aggregate revision `6c73357aed37d6b50062fa2fd896082157bdedf6`; Railway deployment
`2a3c25d5-6621-4445-bea3-cceebafeb9ca` is SUCCESS on that exact worker revision. The aggregate's
four stale project-route tests were corrected in `00246a8fc05dac93914274625dc111a0e18a615a`;
authoritative CI run `32282265304` passed every required job in 12m26s. Vercel
`dpl_C2CYjyvoq8gLb52MMMkivpVdwJqS` is Ready, routing is exact false, the cohort is unchanged, both
capability lists are empty, and worker/site health is green. Any later paid retest requires fresh
explicit authorization and unconditional off/empty restoration.

## Standing rules carried from the canary campaign (do not relearn these)

- **Prod-vs-disposable constraint diff before any new write path goes live.** Three shipped bugs came from prod-only constraints/assumptions local schemas lacked (`tool_category` allowlist, `text_delta` evidence source, µs-vs-ms arithmetic). Before each slice's live run, diff `pg_constraint`/function prosrc for every table/RPC the slice touches (Management API: keyring token → `POST /v1/projects/iwifjtlebphefldmwbkh/database/query`).
- **Verified deployment before every live run.** A flag/env change requires a NEW Vercel deployment confirmed Ready (`vercel ls` prints to stderr — capture with `2>&1`). Worker changes require a Railway restart signature in `/health`.
- **Audit the instrument first.** Verifier/harness contract updates must be traced to a deliberate contract change, never loosened to make a run pass.
- **Diagnosis order:** durable tables → `agentic_chat_execution_observations` → Supabase edge/postgres logs (`logs.all`) → Railway boundary logs. The first three are queryable in seconds.
- **Bare catches are defects.** Any new control-path catch must log through a port and have a bounded fallback (the D2a precedent).

## Exit gate (from the plan, lines 879–885)

- [x] Parity ledger complete across all nine workstreams, including explicit reviewed deferrals.
- [x] Differential tests pass for the eight scenario classes.
- [x] Every reachable mutating adapter accepts the reserved `effect_id`; unsupported idempotency classified and reconciliation-tested.
- [ ] Agentic E2E quality meets or exceeds the Phase 0 baseline.
- [x] Feature remains internal-only; routing stays off between sessions until Phase 6.

## Dependencies / open items inherited

- Phase 3 exit-gate packet: **complete, GO** (2026-08-07). Carried residuals for the Phase 4/5 hardening ledger: live queued-window Stop (1.3 s window unhittable through the UI; disposable claim-fencing proof stands), live worker-restart-mid-turn (needs Railway access; sweeper suites + three real prod recoveries stand).
- tasker/50 follow-up: canary the deployed client reconcile-throttling/thinking-state fixes; the two authorized production gates (constraint diff sweep, deliberate provider-budget overrun); dangling-turn reconcile-runaway root cause (instrumented via `reason=` query param).
