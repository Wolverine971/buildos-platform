<!-- apps/web/docs/features/agentic-chat/AUDIT_2026-04-17_OVERVIEW.md -->

# Agentic Chat — System Audit (Overview Pass)

> Date: 2026-04-17
> Entry point: `apps/web/src/lib/components/agent/AgentChatModal.svelte`
> Purpose: Map the whole agentic chat surface (FE + BE) and scope two deeper audits — one for the UI, one for the backend.
> Companion deep dives (to follow):
>
> - `AUDIT_2026-04-17_FRONTEND.md` — modal, responsiveness, SSE handling, UX states
> - `AUDIT_2026-04-17_BACKEND.md` — `/api/agent/v2/stream`, context, tools, persistence

## Status log

- **2026-04-17** — §4.2 "Three-implementation sprawl" items were actioned in a standalone cleanup pass. See `docs/specs/agentic-chat-cruft-removal-2026-04-17.md` for the full removal spec + implementation log. Net delta: −1,718 LOC across 21 files; 0 typecheck errors; all cleanup-adjacent tests green. The LOC figures elsewhere in this doc (e.g. §4.1 god-component sizes, §9 scoreboard) still reflect the **pre-cleanup** snapshot unless annotated otherwise. Remaining §4.2 items are **naming / directory renames**, which were deliberately deferred to a follow-up PR (see the spec §3A).

---

## 1. System map (at a glance)

```
┌───────────────────────── FRONTEND ─────────────────────────┐
│                                                            │
│  AgentChatModal.svelte  (4,532 LOC, ~220 rune calls)       │
│  ├─ ContextSelectionScreen    ├─ ProjectFocusSelector      │
│  ├─ ProjectActionSelector     ├─ AgentChatHeader           │
│  ├─ AgentMessageList ─► ThinkingBlock ─► PlanVisualization │
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
│  /api/agent/v2/stream/+server.ts   (4,212 LOC — monolith)  │
│   auth → access check → session resolve → context load     │
│   → history compose → tool select → LLM stream loop        │
│   → SSE emit → persist msgs + tool execs → timing metrics  │
│   → agent_state reconciliation                             │
│                                                            │
│  services/agentic-chat-v2/  (~11k LOC across 18 modules)   │
│   prompt-builder | context-loader (2,955) | context-cache  │
│   history-composer | tool-selector | session-service (484) │
│   stream-orchestrator/ (9 files, 5,603 LOC)                │
│   cancel-reason-channel | entity-resolution                │
│   prompt-observability | prompt-eval-* (runner/comparison) │
│                                                            │
│  services/agentic-chat-lite/  (ONLY active prompt path)    │
│   prompt/build-lite-prompt.ts (1,900)                      │
│   preview/ | shadow/                                       │
│                                                            │
│  services/agentic-chat/  (older tree, still live for tools)│
│   tools/core/  definitions, executors,                     │
│                tool-executor-refactored.ts (681)           │
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
│   shared/ (context-utils, timing-metrics, validation, ...) │
│   agent-to-agent-service.ts                                │
│                                                            │
│  cross-cut: chat-compression-service.ts (733)              │
│                                                            │
│  DB: chat_sessions, chat_messages, chat_tool_executions,   │
│      chat_turn_runs, chat_turn_events, timing_metrics      │
│  LLM: OpenRouterV2Service (primary) via smart-llm          │
└────────────────────────────────────────────────────────────┘
```

---

## 2. Surface inventory

### 2.1 Frontend (`apps/web/src/lib/components/agent/`)

| File                           |       LOC | Responsibility                                                                                                                                           |
| ------------------------------ | --------: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentChatModal.svelte`        | **4,532** | God component: modal shell, session lifecycle, SSE handler, stream timing, activity upsert, tool formatting, voice, prewarm, agent-to-agent, admin audit |
| `AgentMessageList.svelte`      |       481 | Renders messages, thinking blocks, voice panels, user-message collapse                                                                                   |
| `ProjectActionSelector.svelte` |       473 | Project-level action picker                                                                                                                              |
| `PlanVisualization.svelte`     |       384 | Legacy planner/executor step UI                                                                                                                          |
| `ThinkingBlock.svelte`         |       359 | Activity log terminal with icons per `ActivityType`                                                                                                      |
| `ProjectFocusSelector.svelte`  |       311 | Pick project-wide vs entity focus                                                                                                                        |
| `AgentChatHeader.svelte`       |       276 | Header, context label, admin debug, context usage pill                                                                                                   |
| `AgentAutomationWizard.svelte` |       240 | Agent-to-agent setup flow                                                                                                                                |
| `AgentComposer.svelte`         |       154 | Textarea + voice + send/stop                                                                                                                             |
| `ProjectFocusIndicator.svelte` |        89 | Compact focus badge                                                                                                                                      |

Plus 7 TS helper modules (~1,300 LOC of typed logic + tests) and `agent-chat-session.ts` (prewarm, snapshot load).

Transport util: `apps/web/src/lib/utils/sse-processor.ts` (336) — shared SSE parser.

### 2.2 Backend API routes

| Route                                   |       LOC | Purpose                                                                                       |
| --------------------------------------- | --------: | --------------------------------------------------------------------------------------------- |
| `POST /api/agent/v2/stream`             | **4,212** | Main turn handler: auth, session, context, history, tools, LLM loop, SSE, persistence, timing |
| `POST /api/agent/v2/prewarm`            |       206 | Warm context cache, optionally ensure session pre-stream                                      |
| `POST /api/agent/v2/stream/cancel`      |   (short) | Write cancel hint (`user_cancelled` / `superseded`) keyed by `stream_run_id`                  |
| `POST /api/agentic-chat/agent-message`  |       346 | Agent-to-agent bridge turn (Actionable Insight)                                               |
| `GET /api/chat/sessions/[id]`           |       219 | Resume session snapshot                                                                       |
| `POST /api/chat/sessions/[id]/close`    |       166 | Finalize + queue classification                                                               |
| `POST /api/chat/sessions/[id]/classify` |        39 | Fallback classify queue                                                                       |
| `POST /api/chat/compress`               |         — | Conversation summarization                                                                    |
| `POST /api/chat/generate-title`         |         — | Auto-title                                                                                    |

### 2.3 Backend services (sizes flagged as red flags in §4)

- `agentic-chat-v2/` — 18 modules. Big ones: `context-loader.ts` (2,955), `stream-orchestrator/index.ts` (1,082 + 8 helpers totalling **5,603**), `session-service.ts` (484), `context-models.ts` (380), `prompt-observability.ts` (494), `prompt-eval-comparison.ts` (523).
- `agentic-chat-lite/prompt/build-lite-prompt.ts` — **1,900**. Sole active prompt builder; the `v2` stream rejects any non-lite `prompt_variant`.
- `agentic-chat/` tree — still live for tools, executors, registry, skills, execution, state, shared utils. Notable: `execution/tool-execution-service.ts` (**2,307**), `tools/core/tool-executor-refactored.ts` (681), `tools/core/tools.config.ts` (576).

---

## 3. End-to-end send → receive (current path)

1. **User sends** (`AgentChatModal.sendMessage`, line 2918).
    - Mints `clientTurnId` + `transportStreamRunId` (both UUIDs). Increments numeric `activeStreamRunId` used as the stale-stream guard.
    - If a stream is active, calls `handleStopGeneration('superseded', { awaitCancelHint: true })` first.
    - Ensures a session via `ensureSessionReady` (uses prewarm with `ensure_session: true` when missing).
    - Appends optimistic user message, creates a thinking block, sets `agent_state = thinking`.
2. **POST `/api/agent/v2/stream`** with `{message, session_id, context_type, entity_id, projectFocus, lastTurnContext, stream_run_id, client_turn_id, voiceNoteGroupId, prewarmedContext}`.
3. **Server route** (`+server.ts`):
    - `safeGetSession` → auth. Parse + validate body (rejects non-lite `prompt_variant`).
    - Access checks for project / daily_brief contexts.
    - Emits `agent_state: thinking` immediately.
    - Resolves/creates `chat_sessions`; hydrates cache via `prewarmedContext` or RPC `load_fastchat_context` (with direct-query fallback).
    - Composes history through `composeFastChatHistory` (last-N, compress above threshold).
    - Picks tools via `selectFastChatTools` (returns `skill_load`, `tool_search`, `tool_schema` + context-specific direct tools).
    - Builds system prompt via `buildLitePromptEnvelope` (agentic-chat-lite).
    - Runs `streamFastChat` (stream-orchestrator) as an LLM+tool loop with gateway recovery, repair instructions, autonomous recovery, repetition/round limits.
    - Tool calls run through `ChatToolExecutor` → `ToolExecutionService` → domain executors (ontology, calendar, utility, external).
    - Per-event persistence: tool executions into `chat_tool_executions`; turn events/runs into `chat_turn_runs` / `chat_turn_events` (detached fire-and-forget).
    - Emits SSE events: `session`, `context_usage`, `agent_state`, `text_delta`, `tool_call`, `tool_result`, `operation`, `skill_activity`, `context_shift`, `timing`, `last_turn_context`, `done`, `error`.
    - Persists user + assistant `chat_messages` idempotently by `client_turn_id`.
    - Queues `timing_metrics` row with full latency breakdown.
    - Reconciles `agent_state` and writes to `chat_sessions.agent_metadata`.
4. **Client SSE loop** (`handleSSEMessage`, line 3207).
    - Routes events into thinking-block activity upserts, tool status updates, streaming text buffer, context usage pill, focus indicators, plan steps (legacy), cancellation flags, and `last_turn_context` storage.
    - `done` finalizes thinking block + assistant message, flushes text buffer, closes timing state.
5. **Modal close** → `POST /api/chat/sessions/[id]/close` (queues classification) + optional mutation summary returned via `onClose`.

---

## 4. First-pass red flags

These are the things that jump out without going deeper. Each is a prompt for the follow-up audits.

### 4.1 God components / god files

- **`AgentChatModal.svelte` is 4,532 lines** with ~80 `$state` variables, ~12 `$effect` blocks, a ~500-line SSE `switch`, a ~260-line per-tool display formatter map, plus calendar-date formatting, entity-name caching, mutation tracking, voice orchestration, admin audit, and agent-to-agent wizard inline. Almost every UI concern and a significant amount of domain logic live here.
- **`/api/agent/v2/stream/+server.ts` is 4,212 lines** in a single handler. It mixes auth, access, session, context caching, history, tool selection, streaming, persistence, timing, and cancel-reason reconciliation. Only ~89 lines of tests against it.
- **`context-loader.ts` (2,955)**, **`tool-execution-service.ts` (2,307)**, **`build-lite-prompt.ts` (1,900)** — each one is a single-file giant that should be decomposed.

### 4.2 Three-implementation sprawl

> **Status (2026-04-17):** Resolved below except for identifier/directory renames. Tracked in `docs/specs/agentic-chat-cruft-removal-2026-04-17.md` (see §8 implementation log).

- **`agentic-chat/`**, **`agentic-chat-v2/`**, and **`agentic-chat-lite/`** all coexist under `services/`.
    - `-v2` is the only route callers use, but composes prompts from `-lite` and delegates tools to `-` (v1). _Remains — intentional layering, not sprawl. Confirmed by import mapping: all three trees are live._
    - ✅ **Resolved** Per spec `agentic-chat-lite-prompt-consolidation-2026-04-16.md`, "lite is now the only prompt path" — but the name still advertises it as a variant, and the v2 handler _still_ accepts `prompt_variant` with back-compat branching. _The request-side `prompt_variant` validator + FE helpers are removed. The `fastchat_prompt_v1` / `lite_seed_v1` **string constants** stay because they are written to historical `chat_turn_runs.prompt_snapshot.prompt_variant` and read by admin audit tooling._
    - ✅ **Resolved** Two tool executors: `tool-executor.ts` (older) and `tool-executor-refactored.ts` (per README, the active dispatch). Unclear which is dead. _The old shim was deleted and `-refactored.ts` was renamed to `tool-executor.ts` as the canonical name._
    - ✅ **Resolved** `stream-orchestrator.ts` is a 2-line re-export shim onto the new `stream-orchestrator/index.ts`. _Shim deleted; barrel + test retargeted to `./stream-orchestrator/index` directly._
    - ⏭️ **Deferred (follow-up PR)** Tree-level naming (`agentic-chat` / `-v2` / `-lite` → `agent-chat/{prompt,context,stream,tools,execution,...}`) and identifier renames (`FastChat*`, `Lite*` prefixes). Rename map is documented in §3A of the cleanup spec.
- ✅ **Resolved** **Legacy planner/executor events persist in the UI.** README says the planner/executor route was removed, yet the modal still handles `plan_created`, `plan_ready_for_review`, `plan_review`, `step_start`, `step_complete`, `executor_spawned`, `executor_result`, `entity_patch`, and the `ActivityType` enum still enumerates them. These branches are unreachable from `/api/agent/v2/stream` but still contribute ~200 LOC and state. _All 8 SSE branches, the `ActivityType` variants, the `UIMessage.type` variants, the `currentPlan` state, `updatePlanStepStatus`, `addPlanStatusAssistantMessage`, the `'executing_plan'` loop state, `HIDDEN_THINKING_TOOLS`, and the same dead variants on `AgentSSEMessage` in `@buildos/shared-types` were deleted. Confirmed via grep: zero emitters across server + worker._
- ✅ **Resolved** **`PlanVisualization.svelte` (384 LOC)** is rendered only from those dead plan events. _Deleted. The `/test-plan-viz` dev route (204 LOC) that hand-wrote sample plans for it was deleted too._

### 4.3 Streaming lifecycle complexity

- Three identity keys per turn: numeric `activeStreamRunId` (stale guard), UUID `activeTransportStreamRunId`, UUID `activeClientTurnId`. Keeping them in sync across `onProgress / onComplete / onError / abort / supersede` is subtle.
- `handleStopGeneration('superseded', { awaitCancelHint: true })` awaits the cancel hint before starting the next turn — adds latency on rapid sends. Worth checking how long that wait is in practice.
- Session hydration still runs on superseded streams (modal explicitly reads `data.session` even when `runId !== activeStreamRunId`, lines 3086–3088). Intentional but easy to regress.
- `done` handler flips `isStreaming = false`, but `onComplete` does it too — ensure ordering doesn't cause a flicker (composer disable/enable) near the end of a turn.
- Two overlapping client cancellation paths: `sessionLoadController` (for session load) and `sessionBootstrapController` (for ensure-session). Reentrancy worth tracing.

### 4.4 Effect and reactive-state risk

- Prewarm split across three effects: an orchestrator (~70 LOC, lines 1121–1189), a freshness invalidator (~10 LOC, 1191–1201), and session/focus-change effects. Keys built via `buildFastChatContextCacheKey` in three places; drift would break cache hits silently.
- Module-scope `entityNameCache` Map (line 1455) is shared across modal instances; not scoped to user or session. Low risk in a logged-in tab but a cleanup opportunity.
- ~~`HIDDEN_THINKING_TOOLS` is declared as an empty Set (line 1674) — dead guard code.~~ ✅ **Resolved 2026-04-17** (deleted in the §4.2 cleanup pass; see `docs/specs/agentic-chat-cruft-removal-2026-04-17.md`).
- `DATA_MUTATION_TOOLS` and `MUTATION_TRACKED_TOOLS` are two near-overlapping hardcoded sets for mutation tracking and toasting; should be one catalog.

### 4.5 Formatting / display overhead inline

- `TOOL_DISPLAY_FORMATTERS` (lines 1887–2148) hand-rolls a per-tool formatter map — duplicated tool-by-tool logic, calendar date formatting, entity name resolution, operation verb tables (`OPERATION_VERBS`, `TOOL_ACTION_PAST_TENSE`, `TOOL_ACTION_BASE_FORM`), currently ~400 LOC of formatting inside the modal. Candidate for extraction into a presenter module.
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
- `/api/agent/v2/stream/server.test.ts` is ~89 lines against a 4,212-line handler — thin coverage of auth failures, context selection, cancel flows.

---

## 5. Deep-dive #1 — Frontend audit scope

**Target researcher:** `AUDIT_2026-04-17_FRONTEND.md`.

Primary questions:

1. **God-component decomposition.** Propose a split of `AgentChatModal.svelte` into (a) session/stream controller (hook/store), (b) SSE event reducer (pure), (c) tool display presenter, (d) focus/context bootstrap, (e) voice adapter. Estimate LOC + risk per slice.
2. **Dead planner/executor surface.** Confirm what still emits `plan_*` / `step_*` / `executor_*` events (should be nothing from `/api/agent/v2`). List every UI branch, component, and type that can be deleted. Call out `PlanVisualization.svelte` explicitly.
3. **SSE event reducer.** Extract the 500-line `switch` into a pure reducer. Build the canonical list of events the modal actually receives today (cross-reference against README §5 SSE events). Flag redundant `text` vs `text_delta` handling and any never-fired branches.
4. **State machine.** Draw the implicit state machine spanning `isOpen / isStreaming / isLoadingSession / isPreparingSession / showContextSelection / showProjectActionSelector / agentToAgentMode`. Find illegal states (e.g., `isStreaming && isLoadingSession`, stream superseded while session loading).
5. **Stream lifecycle.** Verify correctness of the three-ID guard (`activeStreamRunId`, `activeTransportStreamRunId`, `activeClientTurnId`) under: supersede mid-stream, network drop, `done` arriving after abort, tab backgrounding. Flag races.
6. **Prewarm logic.** Audit the three effects that orchestrate prewarm (1040–1202). Verify keys are consistent, invalidation fires on focus/context change, and there's no duplicate warm-up on first keystroke (the `shouldPrewarmDraftContext` branch).
7. **Responsiveness + mobile.** Test: composer resize with keyboard, scroll-to-bottom behavior during streaming, long-assistant-message collapse, voice recording state transitions, modal vs embedded mode parity. Confirm keyboard-avoiding works on iOS Safari.
8. **Accessibility (WCAG 2.2 AA).** Focus trap in modal, live-region announcements for thinking-block activity, contrast on status colors (emerald/amber/red), keyboard nav through context selectors, screen-reader semantics for `ActivityEntry` list.
9. **Tool formatting surface.** Extract `TOOL_DISPLAY_FORMATTERS` + verb tables to a presenter module. Propose a declarative tool descriptor that collapses `formatToolMessage`, `showToolResultToast`, and `normalizeToolDisplayPayload` into one definition per tool.
10. **Entity name cache.** Decide: per-session scoping vs module-global; memory bound; invalidation on context shift.
11. **Error surfaces.** Classify every user-visible error string (stream error, session load error, "no response returned", tool validation). Ensure recoverability (retry, resume) and consistent copy.
12. **Cleanup / memory leaks.** Confirm every `setTimeout`, animation-frame, AbortController, and event listener is cleaned on `onDestroy` and on `isOpen` transitions. The `pendingTimeouts` Set is a good start but verify coverage (`keyboardAvoidingCleanup`, `pendingAssistantTextFlushHandle`, RAF handles).

---

## 6. Deep-dive #2 — Backend audit scope

**Target researcher:** `AUDIT_2026-04-17_BACKEND.md`.

Primary questions:

1. **`/api/agent/v2/stream` decomposition.** Propose a split of the 4,212-line handler into named phases: auth/access, session resolve, context load, history compose, tool select, stream loop, persistence, telemetry, finalize. Identify what's pure vs. what holds request-scoped mutable state.
2. **Service sprawl.** Map every import across `agentic-chat/`, `agentic-chat-v2/`, `agentic-chat-lite/`. Are all three still reachable? Candidate dead code: `agentic-chat/tools/core/tool-executor.ts` vs `tool-executor-refactored.ts`; anything tagged `v1` in tools/config; `stream-orchestrator.ts` re-export shim.
3. **Prompt pipeline.** Verify `buildLitePromptEnvelope` is the only prompt builder exercised in prod. Document `prompt_variant` back-compat semantics and recommend retirement timeline. Flag `prompt-eval-*` and `prompt-replay-*` — dev tooling or hot paths?
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
16. **Agent-to-agent bridge.** `POST /api/agentic-chat/agent-message` + `agent-to-agent-service.ts`. Is the bridge production-live or experimental? What's the shared context surface between Actionable Insight and the main agent?
17. **Timing + observability.** `timing_metrics` + `chat_turn_runs` schema: what queries back the admin dashboard (`AGENTIC_CHAT_TIMING_METRICS_ADMIN_SPEC.md`)? Are there slow-turn alerts or regressions visible today?

---

## 7. Cross-cutting open questions

- **Skill system lifecycle.** `tools/skills/` has 9 skill modules and 9 definition packs. Which skills are live, shadow, or deprecated? `skill-load.ts` dynamic loading — is it triggered by the LLM or by `tool-selector`?
- **Libri integration.** `tools/libri/` client + `libri.skill.ts` — status, auth model, cost.
- **External tools.** `tools/websearch/` (Tavily) and `tools/webvisit/` — rate limits, PII posture, caching.
- **Classification.** Classify is queued on close; its results surface where in the UI?
- **Consumption billing interaction.** Does the chat consume billing credits? `hooks.server.ts` guards block mutations for frozen accounts — does a streaming turn short-circuit at start or mid-stream?
- ~~**Retired paths to delete.** Collate a single "delete list" once the FE and BE deep dives complete: planner/executor UI + types, `prompt_variant` back-compat, `tool-executor.ts` (if unused), legacy event types in `agent-chat.types.ts`.~~ ✅ **Resolved 2026-04-17** without waiting for the deep dives — all four items were narrow enough to land on their own (see `docs/specs/agentic-chat-cruft-removal-2026-04-17.md`). Tree/identifier **renames** are deferred to a follow-up PR.

---

## 8. Suggested research-agent briefs (ready to dispatch)

### 8.1 Frontend deep-dive agent

> Audit `apps/web/src/lib/components/agent/AgentChatModal.svelte` and its siblings as a cohesive UI system. Produce `AUDIT_2026-04-17_FRONTEND.md`. Work through §5 of `AUDIT_2026-04-17_OVERVIEW.md` item-by-item. For each finding, cite `file:line`. Prioritize: (1) god-component decomposition plan, (2) dead planner/executor surface deletion list, (3) SSE reducer extraction, (4) stream-lifecycle race analysis, (5) mobile responsiveness + WCAG pass. Don't rewrite yet — deliver findings + sequenced remediation plan.

### 8.2 Backend deep-dive agent

> Audit `apps/web/src/routes/api/agent/v2/stream/+server.ts` and the `agentic-chat/`, `agentic-chat-v2/`, `agentic-chat-lite/` service trees as a cohesive backend system. Produce `AUDIT_2026-04-17_BACKEND.md`. Work through §6 of `AUDIT_2026-04-17_OVERVIEW.md` item-by-item. For each finding, cite `file:line`. Prioritize: (1) 4,212-line handler decomposition, (2) three-service-tree consolidation map with dead-code candidates, (3) `chat_sessions.agent_metadata` write-amplification and turn-event telemetry cost, (4) stream-orchestrator repair-loop safety, (5) tool dispatch path from LLM tool_call to persisted `chat_tool_executions`.

---

## 9. Initial LOC / risk scoreboard

> LOC values reflect the **post-cleanup** state as of 2026-04-17. Items in _italics_ shifted because of the §4.2 cleanup; the rest are unchanged.

| File                                                                                   |   LOC | Risk            |
| -------------------------------------------------------------------------------------- | ----: | --------------- |
| _`apps/web/src/lib/components/agent/AgentChatModal.svelte`_                            | _4,254_ (was 4,532) | 🔴 HIGH |
| `apps/web/src/routes/api/agent/v2/stream/+server.ts`                                   | 4,212 | 🔴 HIGH         |
| `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`                          | 2,955 | 🟠 MED-HIGH     |
| `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`           | 2,307 | 🟠 MED-HIGH     |
| `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`              | 1,900 | 🟠 MED-HIGH     |
| `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`               | 1,082 | 🟡 MED (tested) |
| `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts` |   856 | 🟡 MED          |
| _`apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.ts`_ (renamed)       |   681 | 🟡 MED          |
| `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`                    |   576 | 🟡 MED          |
| `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-arguments.ts`      |   581 | 🟡 MED (tested) |

Everything else is under 500 LOC.

**Removed from scoreboard (2026-04-17 cleanup):**

- `PlanVisualization.svelte` (384 LOC) — deleted.
- `apps/web/src/routes/test-plan-viz/+page.svelte` (204 LOC) — deleted.
- `tool-executor-refactored.ts` (681 LOC) — renamed to `tool-executor.ts` (see above). The old 10-LOC `tool-executor.ts` shim was overwritten by the rename.
- `agentic-chat-v2/stream-orchestrator.ts` (2 LOC shim) — deleted.
- `agentic-chat/shared/types.ts` — trimmed from 782 → 538 LOC (dropped dead planner/executor scaffolding).
- `packages/shared-types/src/agent.types.ts` — trimmed by ~388 LOC (dropped the multi-agent / planner-executor type model that nothing imported).
