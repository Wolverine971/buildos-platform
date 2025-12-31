<!-- apps/web/docs/technical/LLM_USAGE_ADMIN_AUDIT.md -->

# Admin LLM Usage + Chat Monitoring Audit

## Scope

This audit reviews the admin pages that report LLM usage for chat and spend:

- `/admin/chat` and subroutes:
    - `/admin/chat` (dashboard)
    - `/admin/chat/sessions`
    - `/admin/chat/agents`
    - `/admin/chat/costs`
    - `/admin/chat/tools`
- `/admin/llm-usage`

Primary sources:

- UI routes: `apps/web/src/routes/admin/chat/*`, `apps/web/src/routes/admin/llm-usage/+page.svelte`
- API routes: `apps/web/src/routes/api/admin/chat/*`, `apps/web/src/routes/api/admin/llm-usage/stats/+server.ts`
- LLM usage logging: `apps/web/src/lib/services/smart-llm-service.ts`
- LLM usage schema: `apps/web/supabase/migrations/llm_usage_tracking.sql`

## Current Data Capture (What Each Page Is Actually Using)

### `/admin/chat` (dashboard)

API: `apps/web/src/routes/api/admin/chat/dashboard/+server.ts`

Tables used:

- `chat_sessions` (sessions, users, status, counts)
- `chat_messages` (total_tokens, error_message, activity feed)
- `agent_plans` (strategy, status, steps)
- `agents` (status for success rate)
- `agent_chat_messages` (tokens_used for agent chat tokens)
- `chat_tool_executions` (success rate)
- `chat_compressions` (token savings)

Metrics shown:

- Sessions, messages, unique users
- Agent performance (plans, success rate, plan complexity)
- Token usage and estimated cost (fixed $0.21/1M)
- Token trend vs previous period
- Compression effectiveness
- Tool success rate
- Error rate (sessions with message errors)
- Activity feed (from `chat_messages` only)
- Strategy distribution (direct vs complex)
- Top users (from `chat_sessions.total_tokens_used`)

Notes:

- `avgResponseTime` is a hard-coded placeholder (`1500ms`).
- `sessionsOverTime` and `tokensOverTime` are empty arrays.
- Activity feed type is derived from `chat_messages.role`, but UI expects richer event types.

### `/admin/chat/sessions`

API: `apps/web/src/routes/api/admin/chat/sessions/+server.ts`

Tables used:

- `chat_sessions` + `users`
- `agent_plans` (to flag agent plan presence)
- `chat_compressions` (to flag compressed)
- `chat_messages` (errors)

Session cost is derived from `chat_sessions.total_tokens_used` and fixed $0.21/1M.

### `/admin/chat/sessions/[id]`

API: `apps/web/src/routes/api/admin/chat/sessions/[id]/+server.ts`

Tables used:

- `chat_sessions`, `chat_messages`
- `agent_plans`, `agent_executions`, `agent_chat_messages`
- `chat_tool_executions`, `chat_compressions`

Cost shown is derived from `chat_sessions.total_tokens_used` and fixed $0.21/1M.

### `/admin/chat/agents`

API: `apps/web/src/routes/api/admin/chat/agents/+server.ts`

Tables used:

- `agents` (counts, status, duration)
- `agent_executions` (tokens_used, tool_calls, duration)
- `agent_plans` (strategy/status)
- `agent_chat_sessions` (conversation stats)

Tokens here come from `agent_executions.tokens_used`, not from actual LLM usage logs.

### `/admin/chat/costs`

API: `apps/web/src/routes/api/admin/chat/costs/+server.ts`

Tables used:

- `chat_messages` (prompt/completion/total tokens)
- `agent_chat_messages` (tokens_used, model_used)
- `chat_sessions` (total_tokens_used for top sessions/users)
- `chat_compressions` (token savings)

Pricing:

- Hard-coded to DeepSeek pricing (input $0.14 / output $0.28 per 1M tokens).
- Agent messages use average cost only (no input/output split).

Model breakdown:

- Only based on `agent_chat_messages.model_used`.
- No model info for `chat_messages` (user chat), so model-level spend is incomplete.

### `/admin/chat/tools`

API: `apps/web/src/routes/api/admin/chat/tools/+server.ts`

Table used:

- `chat_tool_executions` (tool usage, success, latency, tokens_consumed)

This page is isolated from LLM usage logs and costs.

### `/admin/llm-usage`

API: `apps/web/src/routes/api/admin/llm-usage/stats/+server.ts`

Tables/functions used:

- `llm_usage_logs` (per-request cost/tokens/status/latency/model)
- `llm_usage_summary` (daily aggregates)
- RPCs: `get_admin_model_breakdown`, `get_admin_operation_breakdown`, `get_admin_top_users`

Metrics shown:

- Total cost, requests, tokens, avg cost per request
- Success rate, avg response time
- Daily cost & requests charts
- Model breakdown (cost, tokens, requests, success rate)
- Operation breakdown
- Top users by cost
- Recent usage logs

Notes:

- `llm_usage_summary` is not auto-updated (trigger removed in `llm_usage_tracking_fix2.sql`), so daily charts can become stale unless updated by cron/manual job.
- `llm_usage_logs.operation_type` is an enum with fixed values in `llm_usage_tracking.sql`.

## Key Gaps & Inconsistencies

### 1) Cost accuracy diverges between pages

- `/admin/chat/costs` uses fixed DeepSeek pricing and estimates cost from token counts.
- `/admin/llm-usage` uses actual per-request `total_cost_usd` from `llm_usage_logs`.
- If multiple models/providers are in use (OpenRouter routing, Claude, Gemini, etc.), `/admin/chat/costs` is inaccurate.

### 2) Model-level spend is incomplete for chat

- `chat_messages` do not store `model_used`, so user chat spend can’t be broken down by model.
- `/admin/chat/costs` model breakdown only includes `agent_chat_messages`.
- `/admin/llm-usage` has accurate model breakdown, but it is not linked back to chat sessions.

### 3) Chat usage may be missing from `llm_usage_logs`

- `SmartLLMService.streamText` logs operation types like `chat_stream_${contextType}`.
- `llm_usage_logs.operation_type` is an enum and **does not** include `chat_stream_*` values.
- Result: chat streaming usage likely fails insertion or is forced into an invalid value path (missing in analytics).
- This makes `/admin/llm-usage` potentially blind to chat traffic unless the enum was manually extended outside migrations.

References:

- Logging code: `apps/web/src/lib/services/smart-llm-service.ts`
- Enum definition: `apps/web/supabase/migrations/llm_usage_tracking.sql`

### 4) No join path between chat sessions and LLM usage logs

- `llm_usage_logs` has no `chat_session_id` / `agent_session_id` columns.
- `SmartLLMService.streamText` puts `sessionId` in `metadata`, but admin queries do not read metadata.
- Result: `/admin/llm-usage` cannot drill into session-level chat analytics or agent execution context.

### 5) `/admin/chat` dashboard has placeholders and missing time-series

- `avgResponseTime` is hard-coded.
- `sessionsOverTime` / `tokensOverTime` are empty placeholders.
- Activity feed only uses `chat_messages` and cannot show agent plans, tools, or compression events.

### 6) Export is still legacy

- `/api/admin/chat/export` exports `chat_sessions` + `chat_messages`, not agent chat sessions/executions.
- The ontology migration plan explicitly calls this out as outdated.

## Which Page Is More Up To Date?

- **Spend / model analytics:** `/admin/llm-usage` is the most current _if_ logs are written correctly. It stores real costs per model and request, but may be missing chat data due to `operation_type` enum mismatch.
- **Agentic chat flow visibility:** `/admin/chat` is the most complete view of session-level and multi-agent behavior, but its cost data is estimated and not model-accurate.

In short:

- `/admin/llm-usage` is the authoritative spend source.
- `/admin/chat` is the authoritative agentic-chat behavior source.
- They are currently disconnected.

## Improvements Needed (Prioritized)

1. **Fix chat logging into `llm_usage_logs`**
    - Either extend `llm_operation_type` enum to include `chat_stream_*` values OR switch `operation_type` to text.
    - Ensure chat + agentic LLM calls are inserted successfully and consistently.

2. **Add explicit linkage between LLM usage and chat sessions**
    - Add columns: `chat_session_id`, `agent_session_id`, `agent_execution_id`, `agent_plan_id`.
    - Index those columns for analytics joins.
    - Update `SmartLLMService` logging to populate them (using sessionId/metadata already available).

3. **Replace `/admin/chat/costs` estimates with real costs**
    - Use `llm_usage_logs` for cost/tokens by model and by session.
    - Add “chat-only” filtering on `llm_usage_logs` once operation types are reliable.

4. **Backfill/refresh `llm_usage_summary`**
    - Either re-enable the trigger or schedule a cron job.
    - Alternatively build daily charts from `llm_usage_logs` directly.

5. **Upgrade `/admin/chat` dashboard metrics**
    - Compute response time from `llm_usage_logs`.
    - Populate `sessionsOverTime`/`tokensOverTime`.
    - Add activity feed entries for agent plans, tool executions, compressions.

6. **Update export to include agent chat tables**
    - Export `agent_chat_sessions`, `agent_chat_messages`, `agent_executions`, `agent_plans`.
    - Keep legacy `chat_sessions` only if still needed for the user-facing chat.

## Consolidation Options

### Option A: Keep both pages, link + unify data sources (lowest risk)

- `/admin/llm-usage` remains the global spend dashboard.
- `/admin/chat/costs` becomes a “Chat-only spend” view powered by `llm_usage_logs`.
- Add cross-links between chat sessions and usage logs (session drill-down).

### Option B: Merge spend into `/admin/chat` (best for “agentic chat” focus)

- Add a “Spend & Models” tab under `/admin/chat` using `llm_usage_logs`.
- Keep `/admin/llm-usage` for platform-wide ops (non-chat) or deprecate if not needed.

### Option C: Create a unified “LLM Analytics” hub

- Single entry point with filters:
    - Scope: chat-only vs platform-wide
    - Dimension: session, model, operation, user
    - Agentic overlay: plans, executions, tool usage

## Recommended Direction

If the goal is a holistic view of agentic chat + spend:

- **Adopt Option B**, and make `/admin/chat` the primary analytics hub.
- Power the cost/model sections off `llm_usage_logs`, and keep `/admin/llm-usage` as a fallback/global view.
- Invest first in logging fixes + linkage so all metrics align.
