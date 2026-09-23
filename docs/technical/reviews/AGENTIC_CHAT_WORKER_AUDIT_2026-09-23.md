<!-- docs/technical/reviews/AGENTIC_CHAT_WORKER_AUDIT_2026-09-23.md -->

# Agentic Chat worker audit (2026-09-23)

Status: audit complete, nothing changed in code. Findings verified against source on 2026-09-23; decisions pending DJ.

Scope: `apps/worker/src/workers/agentic-chat` (118 files, ~51K lines, 63K lines of tests), upstream web admission (`apps/web/src/routes/api/agent/v2/turns`, `apps/web/src/lib/services/agentic-chat-v2`), downstream delivery (`streamPublisher.ts` → Realtime → `apps/web/src/lib/components/agent`), and `packages/agentic-chat-runtime`. Method: import-graph script plus four read-only deep dives (hot-path performance, web↔worker seams, runtime-package boundaries, workflow/specialist layer). No tests, builds, or paid runs.

## Verdict

The safety core is strong: generation fences, fail-closed tool surfaces, a durable effect ledger, never-fatal side effects joined under a deadline, and a resumable Realtime delivery protocol. There are no runtime import cycles (two type-only cycles). The move off the web is clean at the execution layer: the web no longer runs turns and the worker imports nothing from the web.

What is weak is everything around that core:

| Area | Grade | Why |
| --- | --- | --- |
| Correctness and safety design | Strong | Fences, generations, effect ledger, fail-closed admission |
| User-visible speed | Weak | All model passes buffered (answer lands in one burst); worker in US East, database in US West; ~20–60 serial DB round trips per turn |
| Failure behavior at the seams | Weak | Queued turns never expire; crash mid-turn is 7–8 minutes of dead air |
| Organization | Weak | 54 files flat at the root; four 2.7K–4.4K line files; mixed naming |
| Duplication and dead code | Medium-weak | 12 copies of one UUID helper; 3 conflicting DB retry policies; ~1.6K dead lines in the runtime; ~12K lines of legacy executor still in web |
| Test signal | Mixed | Broad coverage, but the paid gate admits turns through a path production no longer uses |

## Tier 1: behavior and risk (fix first)

1. **Worker runs in US East; Supabase is US West.** Verified via `railway status --json`: `agentic-chat-worker` is `us-east4`, 4 replicas. Every serial DB call crosses the country (~70ms). A read turn makes ~22 serial calls on the critical path, a write turn 40–60, so this is roughly 1.5–4s per turn. Fix is a Railway region setting, no code. `daily-brief-worker` and `libri-worker` are also `us-east4`.
2. **Answers arrive in one burst.** Every acting, reviewer, and synthesis pass goes through `streamBufferedProviderPass` (`provider/turn-provider.ts:1532-1544`, `provider/provider-pass.ts:31`), which releases events only after the pass finishes. Time to first token equals time to last token. The buffering exists so a truncated pass can be discarded and retried, and prose is also held while disposition tools are mounted (`turn-provider.ts:1587-1603`).
3. **A worker outage strands turns, then runs stale writes.** Migration `20260825161846_agentic_chat_queue_first_admission.sql` removed the 300-second queued-turn cutoff (only 7-day artifact retention remains) and stopped reading `p_capacity_available`; web hard-codes it `true` (`worker-turn-preparation.server.ts:877`). The UI shows "Thinking…" indefinitely, each open tab reconciles every 5s, and when the worker returns it executes the old turns, including calendar and task writes.
4. **Crash or deploy mid-turn is 7–8 minutes of dead air.** Stall detection is 420s plus a 60s sweep (`consumer.ts:13-14`, `stalledRecovery.ts`). Stop on a running turn only inserts a signal a live worker would consume, so "Stopping…" hangs until recovery.
5. **The paid gate does not test the production admission path.** The e2e harness takes a lease from the legacy `/api/agent/v2/transport` route and pre-creates sessions (`apps/web/src/lib/tests/agentic-e2e/harness/worker-client.ts:128-147,221-240`); production resolves transport and session inline. The browser spec still asserts a lease token the current client cannot produce (`agent-chat-modal.spec.ts:1079`). Gate passes therefore do not cover the path users hit.
6. **Suggestion approve/undo runs through the legacy web executor.** `project-suggestion-actions.service.ts:289-330` replays operations through `ChatToolExecutor` (`tools/core`, ~9.6K lines), whose dispatcher can reach tools the worker deliberately disables (`delete_onto_project`, `call_corsair_mcp_tool`). Only generator allowlists stand in the way. The worker's auto-apply uses `runGatewayWriteOp` instead, so the same suggestion has two write engines.
7. **Three conflicting database retry policies.** `streamPublisher.ts:1880` retries `57014` (statement timeout); `workflow/workflow-runner.ts:279` fails on it but requeues `PGRST*`; `delegateTaskMutationAdapter.ts:226` treats PGRST202–204 as permanent. Two different classes are both named `AgenticChatWorkflowStoreProtocolError` (`workflow-store.ts:332`, `preparation-store.ts:153`), so `instanceof` against one never matches the other. Which errors requeue vs fail is a product decision.
8. **Regex classifies model prose on the hot path**, against the AGENTS.md rule. `classifyReceiptGroundedAssistantDisposition` (`packages/agentic-chat-runtime/src/loop/repair-instructions.ts:628-645`) pattern-matches the final answer and, on a hit, spends one or two more full model passes. `looksLikeConservativeStatedFuture` gates stated-future capture the same way. Replace with a structured signal from the acting model.
9. **The per-minute cron does nothing.** `/api/cron/agentic-chat-stale-turns` (every minute, `apps/web/vercel.json`) calls `reap_stale_legacy_agentic_chat_turns`, which only touches `execution_mode='legacy_sse'`, a mode nothing writes any more. 1,440 invocations and log rows a day. Repurpose it for item 3.

## Tier 2: speed without behavior change

- **Serial publishes on the tool path.** Each read awaits its own durable `tool_call` publish before running (`turn-executor.ts:1973-1997` then `2088`), so parallel reads start staggered. The publisher already preserves order; enqueue without awaiting. Fold `persistRead` + `tool_result`. Mutations run reserve → begin → adapter → reconcile → persist serially (merging pairs needs migrations).
- **Setup selects are serial.** `chat_turn_runs` and `chat_turn_input_artifacts` are independent but awaited in sequence (`executionInput.ts:170-172`).
- **Jev tool selection blocks the first pass** (0.3–0.5s p95, 1.5s cap; `provider/jev-tool-selector.ts`, `turn-provider.ts:1625`). Start it alongside `begin`. It also varies the tool list per turn, which likely defeats cross-turn prompt caching (unverified; check `cached_prompt_tokens` in `llm_usage_logs`).
- **Synthesis pass drops the tools array** (`provider/request-builders.ts:123-133`), likely a full prompt-cache miss. Keep tools and send `tool_choice: 'none'`.
- **Terminal tail is 8–10 serial round trips.** The research-capture evidence query runs on every project turn (`researchCapture.ts:103`) even though capture needs web-research calls; pre-filter in memory. Drop or fold the "finalizing" event; batch preterminal events with `done`.
- **Status events persist before the next pass starts** (context finder, reviewer passes). Start the pass iterator before yielding status.
- **Simple direct writes spend a separate synthesis pass** just to confirm (`turn-provider.ts:1452-1455, 1504-1516`) though `renderWriteReceiptFallback` exists. Deterministic "Done" copy would save 2–5s, at a tone cost.
- **Payloads grow quadratically and can fail a turn.** Each semantic event re-sends the whole projection including `tool_result` bodies (up to 512KB), and text writes re-send the full assistant text. Nothing trims the projection by size, so large reads can throw "Semantic projection exceeds the database bound" (`streamPublisher.ts:1851`). Check the web adapter before compacting.
- **Cancel polls every 2s** (`cancellationObserver.ts:20`). Use a Realtime cancel message with polling as fallback, like the wake listener.
- CPU is negligible. Hashing is on short strings; no `structuredClone` in the direct lane.

Already good: wake listener with coalescing and 1s durable fallback; detached effects joined under a deadline; provider request overlaps the durable prelude; text publisher batches to 3KB and never awaits durability per delta; append-only continuations with per-session cache keys.

## Tier 3: structure and duplication

- **Dead runtime code (~1.6K lines).** `packages/agentic-chat-runtime/src/supervisor/` has no consumers since the web shims were deleted in 6660f80ce; only `source-entrypoints.mts` still lists it. Also unused: `src/ports.ts`, `src/loop/entity-kind-repair.ts`; `src/contracts.ts` is test-only. Both READMEs still describe a supervisor.
- **Worker/runtime split follows history, not a rule.** Since the web engine was deleted (35bbbd3c5, 2026-09-04), only `catalog/`, `context/`, `context-finder/`, `tools/`, `specialists/`, and `worker-tool-policy` are actually shared. Proposed rule: runtime holds what the web imports plus shared vocabulary (tool names, schemas, enums); the worker holds execution logic, pure or not. No bulk move.
- **Copy-paste helpers.** Hash-to-UUID formatter ×12, local `sha256` ×5 (33 `createHash` sites), `requireRecord` ×12, `canonicalUuid` ×14, `throwIfAborted` ×7, "settle within timeout" ×5, `['call_ref','after']` ×4, reviewer tool names defined 8+ times across worker, runtime, and web. Eight modules each define a near-identical `*RpcError`/`*ProtocolError` pair.
- **Pure provider modules import from an IO adapter.** Seven provider modules import reviewer tool-name constants from `tools/execution-adapter.ts`, which pulls in `SupabaseClient` and the embeddings client. Move the names to the runtime catalog.
- **God files with clean seams.**
  - `turn-executor.ts` (4,359): one 3,185-line class. `execute()` 627 lines, read runner 419, mutation runner 298, finalize 296. Types (117–333) and ~840 lines of pure helpers (3519–4360) split cleanly; the runners need a `TurnRun` context object first (they share an 8–10 argument positional list).
  - `provider/turn-provider.ts` (2,694): `prepareInvocation` is a class hidden in a closure (~40 `let`s, a 35-method state object). Review lanes (2112–2654) move out cleanly.
  - `provider/openrouter-client.ts` (2,717): already module-level functions; split into routing, usage, SSE parsing, watchdog, validation.
  - `mutation-argument-normalizers.ts` (1,249): three registries; split normalizers from receipt builders. `normalizeLegacyProjectState` duplicates the runtime alias table with a different unknown-value fallback.
- **Workflow layer.** Ordinary turns pay essentially nothing for it. But the v1 `/workflow` prototype still wraps every turn (`composition-root.ts:360`), the durable runner imports its rules from the prototype (`workflow-runner.ts:60`), and Workflow Lab plain reviews still run the prototype, so Lab evaluations measure a different context builder than users get. The specialist-selection shadow adds up to 2.5s to reviews and its Jev spend skips the usage ledger. Core modules import from `workflow/` (`executionControl.ts:15-18`, `stalledRecovery.ts:18-22`, `config.ts:19`). Five `djflow*.md` docs (2.1K lines) in `src` are stale.
- **Web leftovers.** ~11.8K lines of legacy tool executors (`tools/core` plus webvisit/websearch/corsair/buildos) are live only via suggestion replay (Tier 1 item 6). Dead in production: transport lease route and client (~600), `model-tiering.ts`, `limits.ts`, `stream-protocol.ts` (~530), SSE-era reconcile paths in the controller and modal (~150), lite shadow/preview and two admin routes (~1K). Two resume state machines run at once on session open.
- **Stream payload contract is typed only on the consuming side.** The worker publishes `JsonObject`; the web casts to `AgentSSEMessage`. The UI projection version and 128-event cap are defined three times.
- **Stale docs.** The worker README says Gmail and Calendar remain web paths; calendar writes moved to the worker on 2026-09-04.
- **Naming.** 328 of 832 exports carry a `V1` suffix; only the 85 in `packages/shared-types/src/agentic-chat-worker-contract.ts` and persisted shapes with a `version` field need it. Root files are camelCase; subfolders and the runtime are kebab-case. 211 exports are unused outside their file; there is no `index.ts`, so every export is effectively public.

## Proposed layout

Group by responsibility; kebab-case on move; no rename-only churn elsewhere.

```
agentic-chat/
  README.md          map of folders, boundary rules, flags
  host/              process + queue: bootstrap, composition-root, config, consumer,
                     consumer-runtime, concurrency-bounds, capacity, provider-capacity,
                     queue-wake-listener, delivery-health, stalled-recovery, recovery-snapshot
  turn/              executor (split: executor, contracts, read-runner, mutation-runner,
                     terminal, helpers), execution-input, execution-control, lifecycle-identity,
                     write-fence, cancellation-observer (+ supabase adapter), session-handoff,
                     terminal-text-integrity, reviewed-turn-contract, live-vision
  stream/            stream-publisher, supabase adapters, runtime-timing, timing-payload
  effects/           executor-effects, pending-effects, effect-control, effect-identity,
                     execution-observation, persistence-trace, prompt-snapshot, prompt-dump,
                     research-capture, stated-future-capture, consumption-billing,
                     read-planning-telemetry
  mutations/         executor, catalog, normalizers, receipt-builders, adapter-boundary,
                     adapter-router, table-adapter, create-onto-project, delegate-task
  tools/             (existing) + tool-execution, execution-graph, execution-policy,
                     read-tool-fence, read-tool-identity, worker-access-adapter
  provider/          (existing) turn-provider split into coordinator + turn-state + review lanes;
                     openrouter/ subfolder for the client split
  workflow/          durable lane only (prototype + shadow deleted); README
  shared/            identity-hash, rpc-decoding, postgres-failure, deadline helpers
```

Boundary rules, enforced with `no-restricted-imports`: `provider/` never imports `host/`, `stream/`, or IO adapters; nothing outside `workflow/` imports from it except through a small `workflow/contracts.ts`; runtime-owned vocabulary is imported from `@buildos/agentic-chat-runtime/catalog`.

Blast radius of the move: 118 source files, 114 test files, 108 path-header comments, ~656 doc path references across 86 docs. All scriptable (move map + import rewrite + header rewrite + doc rewrite), verified by worker typecheck and the agentic-chat vitest files. The folder had 55 commits in the three weeks before this audit and other sessions hold uncommitted edits in it, so the move must run when no other session is editing these files, as one commit.

## Suggested order

1. Railway region move (no code). Measure `agentic_chat_runtime_timing` before and after.
2. Queued-turn deadline reaper via the existing per-minute cron, plus "taking longer than usual" copy.
3. Point the gate harness at inline admission; then delete the transport lease path.
4. Free speed wins from Tier 2 that do not change behavior.
5. Delete dead code: runtime supervisor/ports, workflow prototype and shadow, web dead modules, djflow docs to `docs/archive/`.
6. Consolidate helpers (golden test first so hash and UUID outputs stay identical) and the retry policy (after DJ decides it).
7. Folder reorganization and god-file splits, in a quiet window, one commit.
8. Suggestion replay through the gateway with an allowlist; then delete the legacy web executor stack.

Anything that changes chat behavior needs a paid `pnpm agentic:gate` run with DJ's explicit approval, and step 3 should land first so the gate covers the production path.
