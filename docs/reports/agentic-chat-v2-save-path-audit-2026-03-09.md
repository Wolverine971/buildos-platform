<!-- docs/reports/agentic-chat-v2-save-path-audit-2026-03-09.md -->

# Agentic Chat V2 Save Path Audit

Date: 2026-03-09

## Scope

This is a code-path audit of the current agentic chat save behavior.

It focuses on:

- which chat stack is currently active
- the client API call sequence
- the server-side persistence path
- the Supabase tables/functions touched
- the most likely latency bottlenecks

This is not a live production timing trace. No runtime latency measurements were collected here.

## Implementation Progress

Implemented on this branch:

- end-of-turn reconciliation now uses the OpenRouter v2 path when `OPENROUTER_V2_ENABLED=true`
- reconciliation no longer blocks the final `done` event
- `chat_sessions` metric updates now rely on database triggers only
- application code now only syncs session context/entity when needed
- `agent_metadata` writes now use a single merge RPC instead of a read-modify-write cycle
- project-context `load_fastchat_context` payloads are now limited inside Postgres for goals, milestones, plans, tasks, documents, and events
- project-context RPC payloads now include `entity_counts` so `context_meta` still reports full matching totals after SQL-side truncation
- global-context `load_fastchat_context` now omits project `doc_structure` and limits goals, milestones, plans, and recent activity per project
- global-context data now includes lightweight `context_meta.entity_limits_per_project` so the prompt can treat it as a compact portfolio summary

Still outstanding:

- prewarm is still disabled
- global `load_fastchat_context` still returns all project summaries on cache miss
- focused-entity linked-edge and linked-entity expansion inside project context is still unbounded
- assistant message persistence and tool execution persistence are still awaited before `done`
- message idempotency lookup still scans JSON metadata

## Current Runtime Summary

The active chat UI is using the v2 fastchat endpoint:

- `apps/web/src/lib/components/agent/AgentChatModal.svelte#L3111` posts to `POST /api/agent/v2/stream`

The currently relevant flags in `apps/web/.env` are:

- `AGENTIC_CHAT_TOOL_GATEWAY=false`
- `OPENROUTER_V2_ENABLED=true`

The main implications are:

- Main chat requests are going through the v2 stream route, not the legacy `/api/agent/stream` route.
- The main streaming LLM path uses `OpenRouterV2Service` when the flag is enabled:
    - `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2172`
- Tool gateway mode is off, so v2 is using the direct fastchat tool-selection path instead of gateway-only tools:
    - `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts#L90`

The current UI is not prewarming context:

- `apps/web/src/lib/components/agent/AgentChatModal.svelte#L123`
- `ENABLE_V2_PREWARM = false`

That means first-turn latency is paying full context-load cost inside the stream request.

## Model Path In Use

The main turn path is v2 plus OpenRouter v2:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2172`
- `apps/web/src/lib/services/openrouter-v2-service.ts#L456`

OpenRouter v2 chooses a lane based on whether tools are present:

- no tools: `text` lane
- tools present: `tool_calling` lane

Default lane model order comes from:

- `apps/web/src/lib/services/openrouter-v2/model-lanes.ts#L5`

Current defaults, since no lane overrides were found in env:

- text lane: `openai/gpt-4o-mini`, `x-ai/grok-4.1-fast`, `anthropic/claude-haiku-4.5`
- tool lane: `openai/gpt-4o-mini`, `x-ai/grok-4.1-fast`, `anthropic/claude-haiku-4.5`, `deepseek/deepseek-chat`

Reconciliation path status on this branch:

- the end-of-turn `agent_state` reconciliation now follows the OpenRouter v2 path when `OPENROUTER_V2_ENABLED=true`
- `SmartLLMService` remains the fallback only when that flag is off
- see `apps/web/src/lib/services/agentic-chat/state/agent-state-reconciliation-service.ts`

## Client API Call Sequence

### Normal send flow

For a normal turn, the current client-side flow is:

1. `POST /api/agent/v2/stream`
    - sent from `apps/web/src/lib/components/agent/AgentChatModal.svelte#L3111`
    - includes:
        - `message`
        - `session_id`
        - `context_type`
        - `entity_id`
        - `projectFocus`
        - `lastTurnContext`
        - `stream_run_id`
        - `client_turn_id`
        - optional `voiceNoteGroupId`

2. Optional cancel call if the user stops the turn:
    - `POST /api/agent/v2/stream/cancel`
    - called from `apps/web/src/lib/components/agent/AgentChatModal.svelte#L4010`

### Session resume flow

If an existing chat session is reopened, the UI separately calls:

1. `GET /api/chat/sessions/:id?includeVoiceNotes=1`
    - `apps/web/src/lib/components/agent/AgentChatModal.svelte#L1243`

That route then loads:

- `chat_sessions`
- `chat_messages`
- optional `voice_note_groups`
- optional `voice_notes`

### Close/finalize flow

When the chat modal is finalized, the UI sends:

1. `POST /api/chat/sessions/:id/close`
    - `apps/web/src/lib/components/agent/AgentChatModal.svelte#L2910`
2. Fallback `POST /api/chat/sessions/:id/classify`
    - `apps/web/src/lib/components/agent/AgentChatModal.svelte#L2902`

Those are not part of the per-turn save path, but they do add extra session-related writes after the user leaves the modal.

## Server Save Path For One Turn

The main per-turn server flow is in:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L1983`

### Step 1: access checks

Before the turn proceeds, the route may do context access checks:

- daily brief access check:
    - `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2030`
- project access check:
    - `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2070`

Likely Supabase calls here:

- project context:
    - `rpc('current_actor_has_project_access', ...)`
    - possible fallback `select` on `onto_projects`
- daily brief context:
    - `select` on `ontology_daily_briefs`

### Step 2: resolve or create session

The route resolves the session through:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2100`
- implementation in `apps/web/src/lib/services/agentic-chat-v2/session-service.ts#L144`

Possible Supabase calls:

- existing session load:
    - `chat_sessions.select('*').eq('id', sessionId).eq('user_id', userId)`
- existing session context update:
    - `chat_sessions.update(...).eq('id', session.id)`
- canonical daily brief session lookup:
    - `chat_sessions.select('*')...eq('context_type', 'daily_brief')...`
- session create:
    - `chat_sessions.insert(...).select('*').single()`

### Step 3: load recent history

The route loads recent chat history:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2112`
- implementation in `apps/web/src/lib/services/agentic-chat-v2/session-service.ts#L297`

Supabase call:

- `chat_messages.select('role, content, metadata, created_at')`
- ordered by `created_at desc`
- limited by `FASTCHAT_HISTORY_LOOKBACK_MESSAGES`

No env override was found for the fastchat history settings, so the active defaults are:

- history lookback: `10`
- compression threshold: `8`
- tail kept when compressed: `4`

See:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L66`

### Step 4: start user-message persistence early

The route starts user-message persistence before context loading and before the LLM call:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2162`

Implementation:

- `apps/web/src/lib/services/agentic-chat-v2/session-service.ts#L342`

Supabase calls:

1. optional idempotency lookup:
    - `chat_messages.select('*')`
    - filter includes `contains('metadata', { idempotency_key })`
2. user message insert:
    - `chat_messages.insert(...).select('*').single()`

This is already partially optimized for latency because it is kicked off early and only awaited later.

### Step 5: build prompt context

The route either reuses a short-lived session metadata cache or loads fresh context:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2275`
- cache TTL is currently 2 minutes:
    - `apps/web/src/routes/api/agent/v2/stream/+server.ts#L66`

If cache is missed, the route calls:

- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts#L1184`

#### Global/project context path

The preferred path is one Supabase RPC:

- `rpc('load_fastchat_context', ...)`

Inside Postgres, that RPC fans out across many tables.

For global context it reads:

- `onto_projects`
- `onto_goals`
- `onto_milestones`
- `onto_plans`
- `onto_project_logs`

See:

- `packages/shared-types/src/functions/load_fastchat_context.sql#L33`

On this branch, the global-context branch now trims the payload before returning it:

- project rows omit `doc_structure`
- goals: 4 per project
- milestones: 4 per project
- plans: 4 per project
- recent activity: 6 per project

The loader also annotates global context with compact summary metadata via `context_meta.entity_limits_per_project`.

For project context it reads:

- `onto_projects`
- `onto_goals`
- `onto_milestones`
- `onto_plans`
- `onto_tasks`
- `onto_documents`
- `onto_events`
- `onto_project_members`
- `onto_actors`

See:

- `packages/shared-types/src/functions/load_fastchat_context.sql#L126`

On this branch, the project-context branch now ranks and limits the largest arrays inside Postgres before returning JSON:

- goals: 12
- milestones: 12
- plans: 12
- tasks: 18
- documents: 20
- events: 16

It also returns `entity_counts` so the app can keep accurate `context_meta.entity_scopes.total_matching` values even when the SQL payload is already truncated.

If the user is focused on a specific entity, it also reads:

- one focused entity table, depending on entity type
- `onto_edges`
- linked entities from additional entity tables

See:

- `packages/shared-types/src/functions/load_fastchat_context.sql#L222`

#### Daily brief context path

Daily brief context is not using that RPC. It does separate queries:

- root brief row from `ontology_daily_briefs`
- project briefs from `ontology_project_briefs`
- mentioned entities from `ontology_brief_entities`

See:

- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts#L1612`

### Step 6: metadata cache write

After fresh context is loaded, the route writes session metadata cache in a fire-and-forget call:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2307`

Implementation:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L851`

Supabase calls inside `updateAgentMetadata`:

1. `rpc('merge_chat_session_agent_metadata', ...)`

After this optimization pass, metadata patching is now a single atomic merge RPC.

### Step 7: stream the main LLM response

The main LLM stream runs through:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2388`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`

Possible extra activity here:

- tool calls
- tool execution queries/mutations depending on selected tools
- additional session metadata writes if a context shift is detected

### Step 8: finish persistence after the stream

After the main stream completes, the route does the rest of persistence synchronously before final `done`.

#### 8a. await user message write and attach voice notes

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2606`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2619`

Supabase calls:

- wait for earlier user message insert promise
- optional `voice_note_groups.update(...)`
- optional fallback `voice_note_groups.insert(...)`

#### 8b. persist assistant message

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2735`

Supabase calls:

1. optional assistant idempotency lookup in `chat_messages`
2. assistant insert into `chat_messages`

#### 8c. persist tool execution rows

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2773`

Supabase call:

- bulk insert into `chat_tool_executions`

#### 8d. sync session context when needed

- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- implementation in `apps/web/src/lib/services/agentic-chat-v2/session-service.ts`

Supabase call:

- `chat_sessions.update(...)`

After this optimization pass, this update is no longer used for counters.

It now only updates:

- optional `context_type`
- optional `entity_id`
- `updated_at`

Counter ownership is now left to the existing database triggers on:

- `chat_messages`
- `chat_tool_executions`

#### 8e. run agent-state reconciliation

After message and tool persistence, the route runs a second LLM pass:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts`

Implementation:

- `apps/web/src/lib/services/agentic-chat/state/agent-state-reconciliation-service.ts`

That service:

- constructs a summarizer prompt
- now prefers `OpenRouterV2Service` when `OPENROUTER_V2_ENABLED=true`
- applies the delta
- writes the updated `agent_state` back into `chat_sessions.agent_metadata`

After this optimization pass, the route no longer waits on reconciliation before sending final `done`.

It now starts reconciliation asynchronously and lets the turn finish immediately from the UI perspective.

## Hidden Or Secondary Writes

There are additional writes that are easy to miss when reading only the endpoint code.

### Database triggers

The database also has triggers that update `chat_sessions` when rows are inserted into:

- `chat_messages`
- `chat_tool_executions`

See:

- `packages/shared-types/src/functions/index.md#L369`
- `packages/shared-types/src/functions/function-defs.md#L8503`
- `packages/shared-types/src/functions/function-defs.md#L8913`

After this optimization pass, the intended metric ownership is:

- database triggers only for `message_count`, `total_tokens_used`, `tool_call_count`, and `last_message_at`
- application code only for context/entity sync when the effective context changes

### LLM usage logging

The shared SmartLLM package also logs usage rows into `llm_usage_logs`.

See:

- `packages/smart-llm/src/usage-logger.ts#L55`

Those inserts appear to be non-blocking from the main request path, but they still add Supabase write volume.

## Bottleneck Ranking

### 1. Context loading is likely the largest first-token bottleneck

Why:

- prewarm is disabled
- cache is only session metadata based and short-lived
- cache miss goes into a still-wide context build
- global context still returns all project summaries on cache miss
- focused-entity project context can still fan out into `onto_edges` plus linked entity tables

Resolved on this branch:

- plain project-context RPC payloads are now trimmed inside Postgres before they cross the network boundary
- global context no longer ships per-project doc trees and no longer returns uncapped goals, milestones, and plans

Impact:

- time to first useful model token

Primary files:

- `apps/web/src/lib/components/agent/AgentChatModal.svelte#L123`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2285`
- `packages/shared-types/src/functions/load_fastchat_context.sql#L126`

### 2. Final completion is blocked by too much post-stream work

Why:

- assistant message persistence is awaited
- tool execution persistence is awaited
- optional session context sync is awaited when context changes

Resolved on this branch:

- reconciliation is no longer waited on before `done`
- the old synchronous session counter update is gone

Impact:

- the user sees the text stream, but the turn still feels "not finished" for longer than necessary

Primary files:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2735`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2773`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2794`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L2885`

### 3. Session metrics were being written twice

Why:

- application code updates `chat_sessions`
- database triggers also update `chat_sessions`

Status:

- addressed on this branch by removing the explicit counter update path
- database triggers are now the intended single source of truth

Impact:

- extra row updates on the hottest chat table
- unnecessary contention
- more chances for racey last-write-wins behavior

Primary files:

- `apps/web/src/lib/services/agentic-chat-v2/session-service.ts`
- `packages/shared-types/src/functions/index.md#L369`

### 4. `agent_metadata` updates were expensive and race-prone

Why:

- previously, each metadata update was `select agent_metadata` then `update`
- there are multiple metadata updates per turn
- some are fire-and-forget and can overlap

Status:

- addressed on this branch by switching to a merge RPC
- new function: `merge_chat_session_agent_metadata`

Impact:

- extra round trips
- possible lost patches if concurrent writes race

Primary files:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts#L851`
- `supabase/migrations/20260428000005_add_chat_session_agent_metadata_merge_rpc.sql`

### 5. Message idempotency lookup is heavier than necessary

Why:

- it searches `chat_messages.metadata` with JSON containment
- there is no dedicated idempotency column or dedicated index for that key

Impact:

- extra read on every persisted turn message
- can degrade further on long sessions

Primary files:

- `apps/web/src/lib/services/agentic-chat-v2/session-service.ts#L355`

## What Looks Reasonably Fine

- User-message persistence is already kicked off early rather than being fully serialized behind context loading.
- History fetch is small by default.
- The context cache exists and will help on repeated turns within the same session when it stays fresh.
- LLM usage logging appears to be non-blocking.

## Highest-Value First Optimizations

If the goal is to make the current save behavior feel faster without a full redesign, the likely best first moves are:

1. Keep database triggers as the single source of truth for session metrics and avoid reintroducing app-side counter writes.
2. Keep reconciliation off the synchronous `done` path and move it to a proper background queue if stronger delivery guarantees are needed.
3. Keep metadata writes on the merge RPC path and use the same pattern for any future `agent_metadata` patches.
4. Enable or redesign prewarm so the first turn does not pay full context-build cost on demand.
5. Trim the remaining `load_fastchat_context` hot paths, especially focused-entity linked-entity expansion and, if needed, the number of projects included in global summaries.
6. Replace JSON metadata idempotency lookups with a dedicated indexed idempotency field.

## Bottom Line

The active stack is agentic chat v2 plus OpenRouter v2 for the main turn path.

On this branch, the first optimization batch is now in place:

- reconciliation uses the OpenRouter v2 path
- reconciliation no longer blocks `done`
- session counters are no longer double-written
- metadata patches now go through a single merge RPC

The next optimization batch now has a concrete change in place too:

- project-context `load_fastchat_context` now limits the biggest arrays in SQL before returning them
- the loader preserves accurate scope totals by reading RPC-provided `entity_counts`
- global-context `load_fastchat_context` now omits project doc trees and caps per-project goals, milestones, plans, and activity
- the loader exposes `context_meta.entity_limits_per_project` so the prompt can treat global context as a compact summary

The save path itself is not just "insert a message." A single turn can involve:

- access checks
- session load/create
- history read
- early user-message persistence
- a heavy context RPC or daily-brief query bundle
- streamed LLM/tool execution
- assistant-message persistence
- tool-execution persistence
- optional session context sync
- a second post-turn LLM reconciliation pass

The biggest speed issues are:

- context loading before the stream starts
- remaining awaited work after the stream ends, especially assistant/tool persistence
- context payload size and query cost
