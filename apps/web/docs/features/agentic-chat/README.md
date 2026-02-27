<!-- apps/web/docs/features/agentic-chat/README.md -->

# Agentic Chat (Current Implementation)

> Last updated: 2026-02-27  
> Scope: Runtime behavior in `apps/web` (UI + APIs + tools + persistence)

This is the canonical documentation for the chat system currently running in the web app.

## 1. What Is Live

Primary production path:

- UI: `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- Stream API: `POST /api/agent/v2/stream`
- Cancel API: `POST /api/agent/v2/stream/cancel`

Legacy path kept in codebase:

- `POST /api/agent/stream` (planner/executor orchestration stack)
- `GET /api/agent/stream` (legacy session list/fetch)

The modal currently posts turns to `/api/agent/v2/stream`.

## 2. Code Map

| Layer                | Primary file(s)                                                                 | Responsibility                                                            |
| -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Chat UI              | `apps/web/src/lib/components/agent/AgentChatModal.svelte`                       | Sends requests, processes SSE, renders thinking/tool activity             |
| V2 API               | `apps/web/src/routes/api/agent/v2/stream/+server.ts`                            | Auth, access checks, session lifecycle, context loading, SSE, persistence |
| V2 cancel channel    | `apps/web/src/routes/api/agent/v2/stream/cancel/+server.ts`                     | Records stop/supersede reason keyed by `stream_run_id`                    |
| V2 context           | `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`                   | Loads global/project/entity/daily brief prompt context                    |
| V2 history           | `apps/web/src/lib/services/agentic-chat-v2/history-composer.ts`                 | Last-N history + compression strategy                                     |
| V2 streaming loop    | `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`              | LLM streaming + tool loop + limits                                        |
| Tool dispatch        | `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts` | Maps tool names to domain executors                                       |
| Gateway execution    | `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`    | Executes `tool_help`/`tool_exec` in gateway mode                          |
| Session service (V2) | `apps/web/src/lib/services/agentic-chat-v2/session-service.ts`                  | Resolve/create session, load/persist messages, update stats               |

Related APIs used by the modal:

- `POST /api/agentic-chat/agent-message` (agent-to-agent suggestion bridge)
- `GET /api/chat/sessions/[id]` (resume existing session)
- `POST /api/chat/sessions/[id]/close` (session finalize + classification trigger)
- `POST /api/chat/sessions/[id]/classify` (fallback classification queue)
- `POST /api/agent/prewarm` (implemented, currently disabled in modal by `ENABLE_V2_PREWARM = false`)

## 3. V2 Request/Response Contract

### 3.1 `POST /api/agent/v2/stream`

Request body (current fields):

- `message` (required)
- `session_id`
- `context_type`
- `entity_id`
- `projectFocus`
- `lastTurnContext` or `last_turn_context`
- `stream_run_id`
- `client_turn_id`
- `voiceNoteGroupId` or `voice_note_group_id`

Behavior notes:

- Sends `agent_state: thinking` immediately.
- Validates access for project and daily brief contexts before doing heavy work.
- Creates or resolves `chat_sessions`.
- Loads recent `chat_messages` (last N, default 10) and composes compressed history when needed.
- Streams text/tool events over SSE.
- Persists user + assistant messages (idempotent by `client_turn_id` keys).

### 3.2 `POST /api/agent/v2/stream/cancel`

Request body:

- `stream_run_id` (required)
- `reason` (`user_cancelled` or `superseded`)
- `session_id` (optional)
- `client_turn_id` (optional)

Behavior:

- Writes a transient cancel hint (`user + stream_run_id`).
- Optionally persists hint in `chat_sessions.agent_metadata.fastchat_cancel_hints_v1`.
- Stream route consumes this hint to persist accurate `interrupted_reason`.

## 4. End-to-End Runtime Flow (V2)

1. Modal appends user message locally and starts streaming request.
2. V2 route authenticates and resolves session.
3. V2 route loads prompt context:
    - tries RPC `load_fastchat_context`
    - falls back to direct queries when needed
4. V2 route composes model inputs:
    - master prompt
    - compressed/recent history
    - continuity hint from last turn
5. Stream orchestrator runs LLM loop and optional tool rounds.
6. Route emits SSE deltas/events to UI.
7. Route persists assistant output and session stats.
8. Route emits `last_turn_context` and terminal `done`.
9. In parallel/with timeout guard, route reconciles `agent_state` and stores it in session metadata.

## 5. SSE Events (V2)

Events sent by `/api/agent/v2/stream`:

| Event               | Emitted by             | Notes                                                     |
| ------------------- | ---------------------- | --------------------------------------------------------- |
| `agent_state`       | V2 route               | Initial `thinking` state emitted immediately              |
| `session`           | V2 route               | Authoritative resolved/created session                    |
| `context_usage`     | V2 route               | Estimated token usage snapshot                            |
| `text_delta`        | V2 stream orchestrator | Incremental assistant tokens                              |
| `tool_call`         | V2 stream orchestrator | Tool invocation                                           |
| `tool_result`       | V2 stream orchestrator | Tool result payload                                       |
| `context_shift`     | V2 route               | Emitted when tool result includes context shift           |
| `last_turn_context` | V2 route               | Turn continuity snapshot                                  |
| `error`             | V2 route               | Terminal error path                                       |
| `done`              | V2 route               | Terminal event (`finished_reason` included in V2 payload) |

Notes:

- UI still handles additional event types (`operation`, `entity_patch`, planner/plan events) for compatibility with legacy path.
- Current V2 route defines operation helpers but does not actively emit `operation` events.

## 6. Context, Caching, and History

### 6.1 Context types handled in V2

- `global`
- `project`, `project_audit`, `project_forecast`
- `daily_brief`
- `ontology` (project-backed when `projectFocus.projectId` exists)
- fallback to `null` data for unsupported/under-specified context

### 6.2 Context loading

- Primary: RPC `load_fastchat_context`
- Fallback: direct Supabase queries
- Project event window in context payload:
    - past: 7 days
    - future: 14 days

### 6.3 Session metadata caches

V2 route uses `chat_sessions.agent_metadata` for:

- `fastchat_context_cache` (TTL 2 minutes)
- `fastchat_last_context_shift` (used to bypass stale cache after shift)
- `fastchat_cancel_hints_v1` (cancel reason fallback)
- `agent_state` (post-turn reconciled state)

### 6.4 History composition

Defaults in `history-composer.ts`:

- compression threshold: 8 messages
- compressed tail kept: 4 messages
- summary cap: 420 chars
- per-message cap when compressed: 1200 chars

## 7. Tooling Runtime

Tool selection in V2 (`tool-selector.ts`):

- If `AGENTIC_CHAT_TOOL_GATEWAY` is enabled:
    - returns gateway tools only: `tool_help`, `tool_exec`
- If disabled:
    - returns context tool set from `tools.config.ts` (write tools included)
    - calendar tools are filtered by context/message heuristics

Tool execution paths:

- Gateway mode: `ToolExecutionService` executes canonical ops via registry.
- Direct mode: `ChatToolExecutor` dispatches named tools to domain executors.

Provider selection:

- `OPENROUTER_V2_ENABLED=true` -> `OpenRouterV2Service`
- otherwise -> `SmartLLMService`

## 8. Persistence Model

Primary tables written/read in the active path:

- `chat_sessions`
- `chat_messages`
- `chat_tool_executions`

Common message metadata written by V2:

- `client_turn_id`
- `stream_run_id`
- interruption fields on cancelled turns:
    - `interrupted`
    - `interrupted_reason` (`user_cancelled` | `superseded` | `disconnect` | `cancelled`)
    - `finished_reason: cancelled`
    - `partial_tokens`
- optional `fastchat_tool_trace_v1` + `fastchat_tool_trace_summary`

Session finalization from modal close:

- `POST /api/chat/sessions/[id]/close` updates context/entity + queues classification when needed.

## 9. Legacy `/api/agent/stream` Status

`/api/agent/stream` remains implemented with the older planner/executor stack (`StreamHandler` + `AgentChatOrchestrator`).

It still provides:

- planner/plan/executor lifecycle events
- legacy GET session listing/fetch
- prewarm integration utilities used by that path

Current modal turn streaming is on `/api/agent/v2/stream`, not this legacy route.

## 10. Folder Structure (Consolidated)

This folder is intentionally reduced to two active docs:

- `README.md` (this file): current architecture + runtime behavior
- `TOOL_API_MAPPING.md`: canonical tool -> backend mapping
