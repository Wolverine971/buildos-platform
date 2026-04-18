<!-- apps/web/docs/features/agentic-chat/AUDIT_2026-04-17_OVERVIEW.md -->

# Agentic Chat — System Audit (Overview Pass)

> Date: 2026-04-17 (refreshed post-cleanup)
> Entry point: `apps/web/src/lib/components/agent/AgentChatModal.svelte`
> Purpose: Map the agentic chat surface (FE + BE) and scope two deeper audits.
> Companion deep dives (to follow):
>
> - `AUDIT_2026-04-17_FRONTEND.md` — modal, responsiveness, SSE handling, UX states
> - `AUDIT_2026-04-17_BACKEND.md` — `/api/agent/v2/stream`, context, tools, persistence

## Status log

- **2026-04-17 (initial audit)** — First pass completed. 12 frontend + 17 backend deep-dive prompts scoped.
- **2026-04-17 (cruft cleanup landed)** — §4.2 "three-implementation sprawl" and §4.4 dead-state items were actioned in a single cleanup pass. Net delta: **−1,718 LOC across 21 files**; 0 typecheck errors; 304/304 cleanup-adjacent tests green. Full spec + implementation log: `docs/specs/agentic-chat-cruft-removal-2026-04-17.md`.
- **2026-04-17 (this refresh)** — Doc rewritten against the post-cleanup code. All LOC figures, line anchors, and red flags below reflect the current state of the tree. Resolved items are dropped rather than annotated; see the cleanup spec for the deletion history.

**What the cleanup removed:**

- `PlanVisualization.svelte` (384 LOC) and `/test-plan-viz/+page.svelte` (204 LOC) — deleted.
- 8 dead SSE branches (`plan_created`, `plan_ready_for_review`, `step_start`, `executor_spawned`, `plan_review`, `entity_patch`, `executor_result`, `step_complete`) + `updatePlanStepStatus` + `addPlanStatusAssistantMessage` + `currentPlan` state + `'executing_plan'` agent-state variant — deleted from the modal, types, and shared types.
- `HIDDEN_THINKING_TOOLS` empty-Set + two dead guards — deleted.
- `tool-executor.ts` (10-LOC shim) overwritten by renaming `tool-executor-refactored.ts` → `tool-executor.ts`.
- `stream-orchestrator.ts` (2-LOC re-export shim) — deleted; barrel + test retargeted.
- `prompt_variant` request-side back-compat validator + FE helpers — deleted. Historical string constants (`lite_seed_v1`, `fastchat_prompt_v1`) kept for admin snapshot rendering.
- `MultiAgentStreamEvent` + `AgentPermission` + `AgentPlan*` + `ExecutorTaskDefinition` + related unused shared types — deleted from `packages/shared-types/src/agent.types.ts` (−388 LOC).

**What is still deferred** (captured in the cleanup spec §3A):

- Tree-level renames (`agentic-chat` / `-v2` / `-lite` → single `agent-chat/` with layer subdirs).
- Identifier renames (`FastChat*`, `Lite*` prefixes).

---

## 1. System map (at a glance)

```
┌───────────────────────── FRONTEND ─────────────────────────┐
│                                                            │
│  AgentChatModal.svelte  (4,254 LOC, 99 rune sites)         │
│  ├─ ContextSelectionScreen    ├─ ProjectFocusSelector      │
│  ├─ ProjectActionSelector     ├─ AgentChatHeader           │
│  ├─ AgentMessageList ─► ThinkingBlock                      │
│  ├─ AgentComposer (voice, TextareaWithVoice)               │
│  └─ AgentAutomationWizard (agent-to-agent bridge)          │
│                                                            │
│  Local helpers (colocated in /agent):                      │
│  agent-chat.types | .constants | -formatters |             │
│  -operation-activity | -session | -skill-activity |        │
│  project-entity-browser                                    │
│                                                            │
│  Transport: fetch POST → SSE via $lib/utils/sse-processor  │
└────────────────────────────┬───────────────────────────────┘
                             │ POST /api/agent/v2/stream
                             │ POST /api/agent/v2/prewarm
                             │ POST /api/agent/v2/stream/cancel
                             │ POST /api/agentic-chat/agent-message
                             │ GET  /api/chat/sessions/[id]
                             │ POST /api/chat/sessions/[id]/close
                             │ POST /api/chat/sessions/[id]/classify
                             ▼
┌───────────────────────── BACKEND ──────────────────────────┐
│                                                            │
│  /api/agent/v2/stream/+server.ts   (4,201 LOC — monolith)  │
│   auth → access check → session resolve → context load     │
│   → history compose → tool select → LLM stream loop        │
│   → SSE emit → persist msgs + tool execs → timing metrics  │
│   → agent_state reconciliation                             │
│                                                            │
│  services/agentic-chat-v2/  (live orchestration)           │
│   prompt-builder | context-loader (2,955) | context-cache  │
│   history-composer | tool-selector | session-service (484) │
│   stream-orchestrator/ (9 files, 5,603 LOC — tested)       │
│   cancel-reason-channel | entity-resolution                │
│   prompt-observability | prompt-eval-* (runner/comparison) │
│                                                            │
│  services/agentic-chat-lite/  (only active prompt path)    │
│   prompt/build-lite-prompt.ts (1,900)                      │
│   preview/ | shadow/                                       │
│                                                            │
│  services/agentic-chat/  (live — tools + execution)        │
│   tools/core/  definitions, executors,                     │
│                tool-executor.ts (681)                      │
│                tools.config.ts (576)                       │
│                gateway-surface.ts                          │
│   tools/registry/  tool-registry, tool-search, tool-schema │
│                    capability-catalog, gateway-op-aliases  │
│   tools/skills/    9 skill modules + 9 definition packs    │
│                    skill-load.ts (dynamic loader)          │
│   tools/buildos/ | tools/libri/ | tools/websearch/ |       │
│   tools/webvisit/                                          │
│   execution/tool-execution-service.ts (2,307)              │
│   state/agent-state-reconciliation-service.ts              │
│   shared/ (context-utils, timing-metrics, validation,      │
│            types.ts trimmed 782 → 538)                     │
│   agent-to-agent-service.ts                                │
│                                                            │
│  cross-cut: chat-compression-service.ts (733)              │
│                                                            │
│  DB: chat_sessions, chat_messages, chat_tool_executions,   │
│      chat_turn_runs, chat_turn_events, timing_metrics      │
│  LLM: OpenRouterV2Service (primary) via smart-llm          │
└────────────────────────────────────────────────────────────┘
```

All three service trees (`agentic-chat/`, `agentic-chat-v2/`, `agentic-chat-lite/`) are **live, not legacy**. The tree names still advertise versions/variants that no longer exist — a naming problem, not sprawl. Rename map is captured in `docs/specs/agentic-chat-cruft-removal-2026-04-17.md` §3A and deferred to a follow-up PR.

---

## 2. Surface inventory

### 2.1 Frontend (`apps/web/src/lib/components/agent/`)

| File                           |       LOC | Responsibility                                                                                                                                           |
| ------------------------------ | --------: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentChatModal.svelte`        | **4,254** | God component: modal shell, session lifecycle, SSE handler, stream timing, activity upsert, tool formatting, voice, prewarm, agent-to-agent, admin audit |
| `ProjectActionSelector.svelte` |       473 | Project-level action picker                                                                                                                              |
| `AgentMessageList.svelte`      |       441 | Renders messages, thinking blocks, voice panels, user-message collapse                                                                                   |
| `ProjectFocusSelector.svelte`  |       311 | Pick project-wide vs entity focus                                                                                                                        |
| `ThinkingBlock.svelte`         |       308 | Activity log terminal with icons per `ActivityType`                                                                                                      |
| `AgentChatHeader.svelte`       |       276 | Header, context label, admin debug, context usage pill                                                                                                   |
| `AgentAutomationWizard.svelte` |       240 | Agent-to-agent setup flow                                                                                                                                |
| `AgentComposer.svelte`         |       154 | Textarea + voice + send/stop                                                                                                                             |
| `ProjectFocusIndicator.svelte` |        89 | Compact focus badge                                                                                                                                      |

Plus 7 TS helper modules (~1,300 LOC of typed logic + tests) and `agent-chat-session.ts` (prewarm, snapshot load). `agent-chat.types.ts` trimmed to 96 LOC.

Transport util: `apps/web/src/lib/utils/sse-processor.ts` (336) — shared SSE parser.

### 2.2 Backend API routes

| Route                                   |       LOC | Purpose                                                                                       |
| --------------------------------------- | --------: | --------------------------------------------------------------------------------------------- |
| `POST /api/agent/v2/stream`             | **4,201** | Main turn handler: auth, session, context, history, tools, LLM loop, SSE, persistence, timing |
| `POST /api/agent/v2/prewarm`            |       206 | Warm context cache, optionally ensure session pre-stream                                      |
| `POST /api/agent/v2/stream/cancel`      |   (short) | Write cancel hint (`user_cancelled` / `superseded`) keyed by `stream_run_id`                  |
| `POST /api/agentic-chat/agent-message`  |       346 | Agent-to-agent bridge turn (Actionable Insight)                                               |
| `GET /api/chat/sessions/[id]`           |       219 | Resume session snapshot                                                                       |
| `POST /api/chat/sessions/[id]/close`    |       166 | Finalize + queue classification                                                               |
| `POST /api/chat/sessions/[id]/classify` |        39 | Fallback classify queue                                                                       |
| `POST /api/chat/compress`               |         — | Conversation summarization                                                                    |
| `POST /api/chat/generate-title`         |         — | Auto-title                                                                                    |

### 2.3 Backend services (sizes flagged as red flags in §4)

- `agentic-chat-v2/` — live orchestration. Big ones: `context-loader.ts` (2,955), `stream-orchestrator/index.ts` (1,082 + 8 helpers totalling **5,603**), `session-service.ts` (484), `context-models.ts` (380), `prompt-observability.ts` (494), `prompt-eval-comparison.ts` (523).
- `agentic-chat-lite/prompt/build-lite-prompt.ts` — **1,900**. Sole active prompt builder.
- `agentic-chat/` — live tools/execution. Notable: `execution/tool-execution-service.ts` (**2,307**), `tools/core/tool-executor.ts` (681), `tools/core/tools.config.ts` (576), `shared/types.ts` (538).

---

## 3. End-to-end send → receive (current path)

1. **User sends** (`AgentChatModal.sendMessage`, line 2849).
    - Mints `clientTurnId` + `transportStreamRunId` (both UUIDs). Increments numeric `activeStreamRunId` used as the stale-stream guard.
    - If a stream is active, calls `handleStopGeneration('superseded', { awaitCancelHint: true })` first.
    - Ensures a session via `ensureSessionReady` (uses prewarm with `ensure_session: true` when missing).
    - Appends optimistic user message, creates a thinking block, sets `agent_state = thinking`.
2. **POST `/api/agent/v2/stream`** with `{message, session_id, context_type, entity_id, projectFocus, lastTurnContext, stream_run_id, client_turn_id, voiceNoteGroupId, prewarmedContext}`.
3. **Server route** (`+server.ts`):
    - `safeGetSession` → auth. Parse body.
    - Access checks for project / daily_brief contexts.
    - Emits `agent_state: thinking` immediately.
    - Resolves/creates `chat_sessions`; hydrates cache via `prewarmedContext` or RPC `load_fastchat_context` (with direct-query fallback).
    - Composes history through `composeFastChatHistory` (last-N, compress above threshold).
    - Picks tools via `selectFastChatTools` (returns `skill_load`, `tool_search`, `tool_schema` + context-specific direct tools).
    - Builds system prompt via `buildLitePromptEnvelope` (agentic-chat-lite).
    - Runs `streamFastChat` (stream-orchestrator) as an LLM+tool loop with gateway recovery, repair instructions, autonomous recovery, repetition/round limits.
    - Tool calls run through `ChatToolExecutor` → `ToolExecutionService` → domain executors (ontology, calendar, utility, external).
    - Per-event persistence: tool executions into `chat_tool_executions`; turn events/runs into `chat_turn_runs` / `chat_turn_events` (detached fire-and-forget).
    - Emits SSE events: `session`, `context_usage`, `agent_state`, `text_delta`, `tool_call`, `tool_result`, `operation`, `skill_activity`, `context_shift`, `timing`, `last_turn_context`, `done`, `error`. (No planner/executor/step events — those emitters and their client-side branches were removed in the cleanup pass.)
    - Persists user + assistant `chat_messages` idempotently by `client_turn_id`.
    - Queues `timing_metrics` row with full latency breakdown.
    - Reconciles `agent_state` and writes to `chat_sessions.agent_metadata`.
4. **Client SSE loop** (`handleSSEMessage`, line 3137).
    - 17-case `switch` over the event types above; routes events into thinking-block activity upserts, tool status updates, streaming text buffer, context usage pill, focus indicators, cancellation flags, and `last_turn_context` storage.
    - `done` finalizes thinking block + assistant message, flushes text buffer, closes timing state.
5. **Modal close** → `POST /api/chat/sessions/[id]/close` (queues classification) + optional mutation summary returned via `onClose`.

---

## 4. Red flags

These are the things that still jump out. Each is a prompt for the deep dives.

### 4.1 God components / god files

- **`AgentChatModal.svelte` is 4,254 lines** with ~80 `$state` variables, ~12 `$effect` blocks (99 rune sites total), a ~350-line SSE `switch`, a ~260-line per-tool display formatter map, plus calendar-date formatting, entity-name caching, mutation tracking, voice orchestration, admin audit, and agent-to-agent wizard inline. The cleanup shaved 278 LOC off the modal; the architectural shape is unchanged. Still the #1 FE refactor target.
- **`/api/agent/v2/stream/+server.ts` is 4,201 lines** in a single handler. It mixes auth, access, session, context caching, history, tool selection, streaming, persistence, timing, and cancel-reason reconciliation. Only ~89 lines of tests against it.
- **`context-loader.ts` (2,955)**, **`tool-execution-service.ts` (2,307)**, **`build-lite-prompt.ts` (1,900)** — each one is a single-file giant that should be decomposed.

### 4.2 Naming (deferred — resolved below what mattered)

The "three-tree sprawl" flag is **closed**. `agentic-chat/`, `agentic-chat-v2/`, and `agentic-chat-lite/` all live and none duplicate the other's role (v2 = orchestration, lite = prompt, v1 = tools/execution). The only remaining work is cosmetic:

- **Tree-level renames** (`agentic-chat` / `-v2` / `-lite` → unified `agent-chat/{prompt,context,stream,tools,execution,...}`) are captured in cleanup-spec §3A.2.
- **Identifier renames** (`FastChat*`, `Lite*` prefixes → neutral names) are captured in cleanup-spec §3A.3.
- Both are **intentionally deferred** to a follow-up PR because they touch ~50 importers. Not urgent; don't bundle with behavior changes.

### 4.3 Streaming lifecycle complexity

- Three identity keys per turn: numeric `activeStreamRunId` (stale guard), UUID `activeTransportStreamRunId`, UUID `activeClientTurnId`. Keeping them in sync across `onProgress / onComplete / onError / abort / supersede` is subtle.
- `handleStopGeneration('superseded', { awaitCancelHint: true })` awaits the cancel hint before starting the next turn — adds latency on rapid sends. Worth checking how long that wait is in practice.
- Session hydration still runs on superseded streams (modal explicitly reads `data.session` even when `runId !== activeStreamRunId`, lines 3016–3018). Intentional but easy to regress.
- `done` handler flips `isStreaming = false`, but `onComplete` does it too — ensure ordering doesn't cause a composer flicker near the end of a turn.
- Two overlapping client cancellation paths: `sessionLoadController` (for session load) and `sessionBootstrapController` (for ensure-session). Reentrancy worth tracing.

### 4.4 Effect and reactive-state risk

- Prewarm split across three effects: an orchestrator (~70 LOC, lines 1116–1184), a freshness invalidator (~10 LOC, 1186–1196), and session/focus-change effects. Keys built via `buildFastChatContextCacheKey` in three places; drift would break cache hits silently.
- Module-scope `entityNameCache` Map (line 1450) is shared across modal instances; not scoped to user or session. Low risk in a logged-in tab but a cleanup opportunity.
- `DATA_MUTATION_TOOLS` (line 2451) and `MUTATION_TRACKED_TOOLS` (line 2474) are two near-overlapping hardcoded sets for mutation tracking and toasting; `MUTATION_TRACKED_TOOLS` already spreads `DATA_MUTATION_TOOLS` but adds its own extras. Should be one catalog.

### 4.5 Formatting / display overhead inline

- `TOOL_DISPLAY_FORMATTERS` (line 1871) hand-rolls a per-tool formatter map — duplicated tool-by-tool logic, calendar date formatting, entity name resolution, operation verb tables (`OPERATION_VERBS`, `TOOL_ACTION_PAST_TENSE`, `TOOL_ACTION_BASE_FORM`), currently ~400 LOC of formatting inside the modal. Candidate for extraction into a presenter module.
- `normalizeToolDisplayPayload`, `formatToolMessage`, `showToolResultToast` all consume overlapping information — three places to update when a new tool lands.

### 4.6 Backend coupling and write amplification

- Turn-event and turn-run telemetry writes happen inline via `detachTimingTask` fire-and-forget promises. No global cap → a long turn can queue tens of detached writes against `chat_turn_events` and `chat_sessions.agent_metadata`.
- `chat_sessions.agent_metadata` (JSONB) is written multiple times per turn (context cache, cancel hints, agent_state reconciliation, focus metadata). Possible hotspot for row contention and history bloat.
- `maybeInjectProjectId` silently fixes up tool call args server-side — hides prompt correctness bugs.
- `sanitizeUuidStringArray`, `sanitizeAgentStateForPrompt`, `consumeTransientFastChatCancelHint` + `readFastChatCancelReasonFromMetadata` — defensive scaffolding suggests past data-hygiene incidents worth reading the git log on.

### 4.7 Accessibility / responsiveness quick observations

- Enter-to-send disabled on touch devices ✓ (line 193).
- Manual scroll anchoring: `overflow-anchor: none` with bespoke `scrollToBottomIfNeeded` + `userHasScrolled` flag. Works but fragile; needs a targeted test on iOS/Android and a streaming-reply regression check.
- Keyboard avoidance via `initKeyboardAvoiding` util + custom CSS var `--keyboard-height`.
- Admin-only debug actions gated by `$page.data?.user?.is_admin` ✓.
- Empty-state copy, focus indicator, thinking-block collapse — look OK but worth a WCAG pass on ARIA roles, focus trap, live-region semantics.

### 4.8 Testing gaps

- `stream-orchestrator` is well-covered (46+ focused tests, 112+ for v2 overall) ✓.
- `AgentChatModal.svelte` has **no test file**. Only its helper modules are tested (`agent-chat-session`, `agent-chat-formatters`, `agent-chat-operation-activity`, `agent-chat-skill-activity`).
- `/api/agent/v2/stream/server.test.ts` is ~89 lines against a 4,201-line handler — thin coverage of auth failures, context selection, cancel flows.

---

## 5. Deep-dive #1 — Frontend audit scope

**Target researcher:** `AUDIT_2026-04-17_FRONTEND.md`.

The dead planner/executor surface is already removed. The frontend audit can skip dead-code hunting and focus on structure, lifecycle correctness, and UX.

1. **God-component decomposition.** Propose a split of `AgentChatModal.svelte` into (a) session/stream controller (hook/store), (b) SSE event reducer (pure), (c) tool display presenter, (d) focus/context bootstrap, (e) voice adapter. Estimate LOC + risk per slice. The cleanup shaved 278 LOC; the component is still 4,254 LOC and needs structural work. **Status (2026-04-18):** full slice plan delivered in `PROPOSAL_2026-04-18_GOD-COMPONENT-DECOMPOSITION.md` (recommended order C→B→E→D→A, low→high risk). **Items §5.2 and §5.8 below are sub-slices of this item** (SSE reducer = slice B, tool display presenter = slice C) — tracked as sub-slices in the proposal rather than standalone audit items.
2. **SSE event reducer.** Extract the `handleSSEMessage` switch (line 3137, ~350 LOC, 17 cases) into a pure reducer. Cross-reference every branch against the events emitted by `/api/agent/v2/stream/+server.ts` (see README §5). Flag any redundant handling — e.g. `text` vs `text_delta` both routed to `bufferAssistantText`, does v2 emit both? Confirm no case is unreachable now that the legacy branches are gone.
3. **State machine.** Draw the implicit state machine spanning `isOpen / isStreaming / isLoadingSession / isPreparingSession / showContextSelection / showProjectActionSelector / agentToAgentMode`. Find illegal states (e.g., `isStreaming && isLoadingSession`, stream superseded while session loading).
4. **Stream lifecycle.** Verify correctness of the three-ID guard (`activeStreamRunId`, `activeTransportStreamRunId`, `activeClientTurnId`) under: supersede mid-stream, network drop, `done` arriving after abort, tab backgrounding. Quantify the latency added by `awaitCancelHint` on rapid sends. Flag races.
5. **Prewarm logic.** Audit the three effects that orchestrate prewarm (modal lines 1035–1196). Verify keys are consistent, invalidation fires on focus/context change, and there's no duplicate warm-up on first keystroke (the `shouldPrewarmDraftContext` branch).
6. **Responsiveness + mobile.** Test: composer resize with keyboard, scroll-to-bottom behavior during streaming, long-assistant-message collapse, voice recording state transitions, modal vs embedded mode parity. Confirm keyboard-avoiding works on iOS Safari.
7. **Accessibility (WCAG 2.2 AA).** Focus trap in modal, live-region announcements for thinking-block activity, contrast on status colors (emerald/amber/red), keyboard nav through context selectors, screen-reader semantics for `ActivityEntry` list.
8. **Tool formatting surface.** Extract `TOOL_DISPLAY_FORMATTERS` (line 1871) + verb tables to a presenter module. Propose a declarative tool descriptor that collapses `formatToolMessage`, `showToolResultToast`, and `normalizeToolDisplayPayload` into one definition per tool. Consolidate `DATA_MUTATION_TOOLS` and `MUTATION_TRACKED_TOOLS` into a single catalog (§4.4).
9. **Entity name cache.** Decide: per-session scoping vs module-global (line 1450); memory bound; invalidation on context shift.
10. **Error surfaces.** Classify every user-visible error string (stream error, session load error, "no response returned", tool validation). Ensure recoverability (retry, resume) and consistent copy.
11. **Cleanup / memory leaks.** Confirm every `setTimeout`, animation-frame, AbortController, and event listener is cleaned on `onDestroy` and on `isOpen` transitions. The `pendingTimeouts` Set is a good start but verify coverage (`keyboardAvoidingCleanup`, `pendingAssistantTextFlushHandle`, RAF handles).

---

## 6. Deep-dive #2 — Backend audit scope

**Target researcher:** `AUDIT_2026-04-17_BACKEND.md`.

Dead code in the service tree (shim tool-executor, stream-orchestrator re-export, `prompt_variant` request validator, planner/executor shared types) is already removed. The backend audit focuses on structure, safety, and write cost.

1. **`/api/agent/v2/stream` decomposition.** Propose a split of the 4,201-line handler into named phases: auth/access, session resolve, context load, history compose, tool select, stream loop, persistence, telemetry, finalize. Identify what's pure vs. what holds request-scoped mutable state.
2. **Service-tree shape.** Confirm imports still follow the three-role layering (v2 = orchestration, lite = prompt, v1 = tools/execution). Flag any back-edges (e.g., lite importing from v1 tool surface, or v1 importing from v2). This feeds the deferred rename in cleanup-spec §3A.
3. **Prompt pipeline.** `buildLitePromptEnvelope` is the only prompt path. Map every flag/variant it still branches on and recommend collapsing. Verify `prompt-eval-*` and `prompt-replay-*` are dev tooling only (not hot-path).
4. **Context loader audit.** Walk through `context-loader.ts` (2,955 LOC). RPC vs direct-query fallback — under what conditions does fallback fire? Are the per-context token budgets (projects=8, goals=2, tasks=18, etc.) enforced consistently? What's `PROJECT_INTELLIGENCE_*` vs `GLOBAL_CONTEXT_*` vs `PROJECT_CONTEXT_*`?
5. **Session metadata write amplification.** Count writes per turn to `chat_sessions.agent_metadata`: `fastchat_context_cache`, `fastchat_last_context_shift`, `fastchat_cancel_hints_v1`, `agent_state`, focus metadata. Propose consolidation or write batching.
6. **Telemetry cost.** `chat_turn_events` insert per SSE emission — measure realistic events/turn and assess DB cost. Consider buffering to a single insert or pushing to a sidecar queue.
7. **Cancel channel.** Read `cancel-reason-channel.ts` + `consumeTransientFastChatCancelHint`. Identify what happens when the cancel POST races the stream close. Verify `interrupted_reason` is always persisted accurately (cases: user_cancelled, superseded, disconnect, cancelled).
8. **Tool loop safety.** In `stream-orchestrator/index.ts`: walk through every repair path (`read_loop`, `gateway_required_field`, `gateway_create_field_no_progress`, `gateway_mutation_no_execution`, `project_create_no_execution`, `doc_organization_recovery`). Are limits (`MAX_TOOL_CALLS=40`, `MAX_TOOL_ROUNDS=12`, repetition=3–4) appropriate? What's observable when a limit trips?
9. **Autonomous recovery.** `FASTCHAT_ENABLE_AUTONOMOUS_RECOVERY` defaults to `false`. Confirm it's still off in prod. If on, document the behavior that fires synthetic tool calls (`executeSyntheticDirectTool`) and the user-visible effect.
10. **Tool dispatch.** Trace one tool end-to-end (e.g., `create_onto_task`): from LLM tool_call → `normalizeToolCallDefaults` → `ChatToolExecutor` → `ToolExecutionService` → `ontology-write-executor` → response shape → SSE `tool_result`. Identify arg normalization, project_id injection, validation repair, and result compaction.
11. **Gateway vs direct tools.** When does `tool-selector.ts` return `skill_load / tool_search / tool_schema` (gateway) vs context-specific direct tools? Confirm `gateway-op-aliases` coverage. Identify skills that never fire.
12. **Persistence idempotency.** Verify `chat_messages` upsert by `client_turn_id` across retries and supersede scenarios. Confirm `chat_tool_executions` rows don't duplicate on repair-retry.
13. **Access checks.** `checkProjectAccess` + `checkProjectAccessFallback` + `checkDailyBriefAccess` — when does fallback fire? RLS coverage assumed or belt-and-braces?
14. **OpenRouter integration.** `OpenRouterV2Service` as primary; confirm fallback posture (OpenAI/Anthropic). What model profile does `profile: 'balanced'` resolve to? Cost per turn?
15. **Chat compression pipeline.** `chat-compression-service.ts` (733 LOC) + `POST /api/chat/compress` + `history-composer.ts` compression. Who triggers compression, on what schedule, with what side effects?
16. **Agent-to-agent bridge.** `POST /api/agentic-chat/agent-message` + `agent-to-agent-service.ts`. Is the bridge production-live or experimental? What's the shared context surface between Actionable Insight and the main agent? If dead, it's the next cleanup candidate.
17. **Timing + observability.** `timing_metrics` + `chat_turn_runs` schema: what queries back the admin dashboard (`AGENTIC_CHAT_TIMING_METRICS_ADMIN_SPEC.md`)? Are there slow-turn alerts or regressions visible today?

---

## 7. Cross-cutting open questions

- **Skill system lifecycle.** `tools/skills/` has 9 skill modules and 9 definition packs. Which skills are live, shadow, or deprecated? `skill-load.ts` dynamic loading — is it triggered by the LLM or by `tool-selector`?
- **Libri integration.** `tools/libri/` client + `libri.skill.ts` — status, auth model, cost.
- **External tools.** `tools/websearch/` (Tavily) and `tools/webvisit/` — rate limits, PII posture, caching.
- **Classification.** Classify is queued on close; its results surface where in the UI?
- **Consumption billing interaction.** Does the chat consume billing credits? `hooks.server.ts` guards block mutations for frozen accounts — does a streaming turn short-circuit at start or mid-stream?
- **Agent-to-agent bridge reachability.** Called out in §6.16. Confirm it's not the next block of dead code before investing in the rename PR.

---

## 8. Suggested research-agent briefs (ready to dispatch)

### 8.1 Frontend deep-dive agent

> Audit `apps/web/src/lib/components/agent/AgentChatModal.svelte` and its siblings as a cohesive UI system. Produce `AUDIT_2026-04-17_FRONTEND.md`. Work through §5 of `AUDIT_2026-04-17_OVERVIEW.md` item-by-item. For each finding, cite `file:line`. Prioritize: (1) god-component decomposition plan, (2) SSE reducer extraction, (3) stream-lifecycle race analysis, (4) mobile responsiveness + WCAG pass, (5) tool formatting / mutation-catalog consolidation. Don't rewrite yet — deliver findings + sequenced remediation plan. Context: the legacy planner/executor UI surface was already removed on 2026-04-17 (see `docs/specs/agentic-chat-cruft-removal-2026-04-17.md`); skip dead-code hunting and focus on the items in §5.

### 8.2 Backend deep-dive agent

> Audit `apps/web/src/routes/api/agent/v2/stream/+server.ts` and the `agentic-chat/`, `agentic-chat-v2/`, `agentic-chat-lite/` service trees as a cohesive backend system. Produce `AUDIT_2026-04-17_BACKEND.md`. Work through §6 of `AUDIT_2026-04-17_OVERVIEW.md` item-by-item. For each finding, cite `file:line`. Prioritize: (1) 4,201-line handler decomposition, (2) `chat_sessions.agent_metadata` write-amplification and turn-event telemetry cost, (3) stream-orchestrator repair-loop safety, (4) tool dispatch path from LLM tool_call to persisted `chat_tool_executions`, (5) agent-to-agent bridge reachability. Context: dead shims, the `prompt_variant` request validator, and the shared-types planner/executor scaffolding were already removed on 2026-04-17 (see `docs/specs/agentic-chat-cruft-removal-2026-04-17.md`); skip dead-code hunting in those areas and focus on the items in §6.

---

## 9. LOC / risk scoreboard (post-cleanup)

| File                                                                                   |   LOC | Risk            |
| -------------------------------------------------------------------------------------- | ----: | --------------- |
| `apps/web/src/lib/components/agent/AgentChatModal.svelte`                              | 4,254 | 🔴 HIGH         |
| `apps/web/src/routes/api/agent/v2/stream/+server.ts`                                   | 4,201 | 🔴 HIGH         |
| `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`                          | 2,955 | 🟠 MED-HIGH     |
| `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`           | 2,307 | 🟠 MED-HIGH     |
| `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`              | 1,900 | 🟠 MED-HIGH     |
| `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`               | 1,082 | 🟡 MED (tested) |
| `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts` |   856 | 🟡 MED          |
| `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.ts`                   |   681 | 🟡 MED          |
| `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-arguments.ts`      |   581 | 🟡 MED (tested) |
| `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`                    |   576 | 🟡 MED          |
| `apps/web/src/lib/services/agentic-chat/shared/types.ts`                               |   538 | 🟡 MED          |

Everything else is under 500 LOC. Net cleanup delta: **−1,718 LOC across 21 files** (full breakdown: `docs/specs/agentic-chat-cruft-removal-2026-04-17.md` §8.3).
