<!-- research-library/research/research-fastchat-context-and-tool-limits.md -->

# FastChat tool-call limit + context audit (2026-02-07)

## Scope

- Investigated the FastChat tool-call limit error from 2026-02-06.
- Audited the FastChat (Agentic Chat V2) context pipeline, prompt construction, and caching.

## Key findings

### Tool-call limit source

- The tool-call cap is enforced in `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`.
- Defaults before the fix were `maxToolRounds = 4` and `maxToolCalls = 10`, and `/api/agent/v2/stream` did not override them.
- When the model emits more than 10 tool calls in a single FastChat stream, the orchestrator throws: `FastChat exceeded tool call limit`.

### FastChat context pipeline (what the model actually sees)

- Entry point: `apps/web/src/routes/api/agent/v2/stream/+server.ts`.
- Steps per request:
    1. Resolve session + load recent history (`loadRecentMessages(session.id, 10)`), so only the most recent 10 messages are provided.
    2. Select tool pool via `selectFastChatTools({ contextType, message })` (gated by web/calendar intent patterns).
    3. Load prompt context via `loadFastChatPromptContext` (or use cached context for 2 minutes).
    4. Inject `agent_state` and `conversation_summary` into the prompt context.
    5. Build system prompt via `buildMasterPrompt(promptContext)` and stream the request with tools.

### Context contents by mode

- **Global context** (`loadGlobalContextData` in `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`):
    - All projects for the user, with doc_structure truncated to depth 2.
    - Per-project goals, milestones, plans, and recent activity.
    - Tasks and events are **not** included globally (by design to keep context lighter).
- **Project context** (`loadProjectContextData`):
    - Project metadata + full doc_structure.
    - All goals, milestones, plans, tasks, events, and documents for the project (no explicit caps or ordering).
- **Focus entity context** (`loadEntityContextData`):
    - All project context data above.
    - Full focus entity record.
    - Linked entities and linked edges for the focus entity.
- **Ontology context** uses project context when a `projectFocus` is provided.

### Prompt construction details

- System prompt is `buildMasterPrompt`, not the “fast” prompt from `prompt-builder.ts`.
- The master prompt includes:
    - A structured instructions block (identity + guidelines).
    - A `context` block with IDs/names + `agent_state` + `conversation_summary`.
    - A `data` block containing JSON-serialized context data.
- If `loadFastChatPromptContext` fails, the system prompt falls back to a minimal context (only contextType/entityId). This makes tool calls more likely.

### Caching behavior

- Context is cached in `chat_sessions.agent_metadata.fastchat_context_cache` for 2 minutes (`FASTCHAT_CONTEXT_CACHE_TTL_MS`).
- Cached payload includes `data`, so the server can skip DB lookups on short-turn bursts. (This does **not** prevent LLM tool calls; it only saves DB work.)

## Changes applied

- Added FastChat limit defaults and env overrides in `apps/web/src/lib/services/agentic-chat-v2/limits.ts`.
    - `FASTCHAT_MAX_TOOL_CALLS` (default 40)
    - `FASTCHAT_MAX_TOOL_ROUNDS` (default 8)
- Updated `stream-orchestrator.ts` to use the new defaults.

## Observations / risks

- **Unbounded project arrays:** project context pulls _all_ tasks, events, and documents. Large projects can bloat the prompt and push history out of context. There is no trimming or ordering.
- **Global context gaps:** global mode omits tasks/events, so task-specific questions will require tool calls (expected, but worth noting if tool usage spikes in global mode).
- **Tool result persistence:** tool results are not persisted into chat history; they’re summarized into agent_state asynchronously. If reconciliation fails or lags, the model may repeat tool calls on subsequent turns.

## Update: Document tree tool + round limit (2026-02-07)

### Tool definition check

- `get_document_tree` is defined with `project_id` as a required parameter in `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts`.
- The executor (`apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts`) throws if `project_id` is missing, so the tool definition itself is accurate.

### Likely cause of missing `project_id`

- FastChat does **not** currently enrich tool args with project context (unlike the planner path).
- If the model omits `project_id`, the executor throws `project_id is required for get_document_tree`.
- When this happens repeatedly, the assistant may retry the tool call and hit the tool round limit (`FastChat exceeded tool round limit`).

### Mitigation applied

- Added a lightweight FastChat-side arg injection that supplies `project_id` for tools that **require** it when FastChat is running in a project context.
- This happens in `apps/web/src/routes/api/agent/v2/stream/+server.ts` before execution and before emitting tool events, keeping the UI consistent.

## Update: relative fetch failures (2026-02-07)

### Symptom

- Tool errors like:
    - `Cannot use relative URL (/api/onto/projects/.../doc-tree...) with global fetch — use event.fetch instead`
    - Affected tools include `get_document_tree` and `create_onto_document`.

### Root cause

- In FastChat, the `ChatToolExecutor` was constructed with the global `fetch`.
- SvelteKit requires `event.fetch` for relative URLs in server handlers, otherwise relative requests fail.

### Mitigation applied

- Updated FastChat’s `/api/agent/v2/stream` handler to pass `event.fetch` into `ChatToolExecutor`.

## Recommendations (optional follow-ups)

1. Add caps or ordering (e.g., most recent N) for project tasks/events/documents to keep the prompt stable as projects grow.
2. Consider a lightweight relationship summary in project context (counts or top edges) to reduce graph tool calls.
3. Monitor reconciliation failures; if frequent, add a fallback summary or persist tool results for the next turn.
4. Adjust `FASTCHAT_MAX_TOOL_CALLS` / `FASTCHAT_MAX_TOOL_ROUNDS` via env if sessions still hit limits.
