<!-- docs/specs/AGENTIC_CHAT_TIMING_METRICS_ADMIN_SPEC.md -->

# Agentic Chat Timing Metrics - Admin UI Spec (2026-01-31)

## Objective
Expose end-to-end timing breakdowns for agentic chat so admins can quickly identify latency bottlenecks. The UI should surface both session-level detail (per chat) and aggregate overview metrics across chats.

## Scope
- Add timing metrics visualization to:
  - `/admin/chat` (overview / analytics)
  - `/admin/chat/sessions` (session list)
  - `/admin/chat/sessions/:id` (session detail)

## Data Sources
Primary:
- `timing_metrics` table

Related (join for context):
- `agent_chat_sessions` (session status/context)
- `agent_chat_messages` (optional: first assistant message timestamp)
- `agent_plans` (plan status/steps)
- `agents` (planner/executor metadata)

## Timing Fields (Raw)
`timing_metrics` columns:
- `message_received_at`
- `first_event_at`
- `first_response_at`
- `time_to_first_event_ms`
- `time_to_first_response_ms`
- `context_build_ms`
- `tool_selection_ms`
- `clarification_ms`
- `plan_created_at`
- `plan_creation_ms`
- `plan_step_count`
- `plan_execution_started_at`
- `plan_completed_at`
- `plan_execution_ms`
- `plan_status`
- `context_type`
- `message_length`
- `metadata` (JSON for extra fields like `stream_run_id`)

## Derived Metrics
Session-level:
- `pre_stream_ms` = `time_to_first_event_ms` (proxy for pre-stream orchestration)
- `planning_overhead_ms` = `context_build_ms + tool_selection_ms + clarification_ms`
- `plan_total_ms` = `plan_execution_ms`
- `plan_latency_share` = `plan_execution_ms / time_to_first_response_ms` (if plan overlaps response)
- `ttfr_ms` = `time_to_first_response_ms`
- `ttfe_ms` = `time_to_first_event_ms`

Overview-level (aggregates):
- p50/p95/p99 for `ttfr_ms`, `ttfe_ms`, `context_build_ms`, `tool_selection_ms`, `plan_creation_ms`, `plan_execution_ms`
- % of chats invoking plans (`agent_plan_id` not null)
- % of chats with clarifications (`clarification_ms` not null and > 0)
- Longest 10 sessions by `ttfr_ms`
- Top contexts by median TTFR (`context_type`)

## Admin UI: `/admin/chat` (Overview)
### Layout
1) **Summary KPIs** (top row)
   - p50 / p95 TTFR
   - p50 / p95 TTFE
   - % Plan Invoked
   - % Clarification Required

2) **Latency Breakdown (Stacked Bar / Waterfall)**
   - Show median breakdown for:
     - `context_build_ms`
     - `tool_selection_ms`
     - `clarification_ms`
     - `plan_creation_ms`
     - `plan_execution_ms`
   - For chats without plan, show plan components as 0.

3) **Distributions**
   - Histograms or percentile line charts for TTFR + TTFE

4) **Slow Sessions Table**
   - Columns: session id, user id, context type, TTFR, plan status, plan steps, created at
   - Sort by TTFR desc

### Filters
- Date range (default: last 7 days)
- Context type
- Plan status (none / completed / failed / in_progress)
- Clarification used (yes/no)

## Admin UI: `/admin/chat/sessions` (Session List)
### Columns
- Session ID
- User ID
- Context Type
- TTFR
- TTFE
- Context Build
- Tool Selection
- Plan Created (ms)
- Plan Exec (ms)
- Plan Steps
- Plan Status
- Created At

### Sorting
- Default sort: `created_at` desc
- Alternate: TTFR desc

### Row Expander (optional)
- Sparkline breakdown
- Link to session detail

## Admin UI: `/admin/chat/sessions/:id` (Session Detail)
### Timing Timeline (Primary)
- Horizontal timeline (relative ms)
- Markers:
  - message_received_at
  - first_event_at (TTFE)
  - first_response_at (TTFR)
  - plan_created_at
  - plan_execution_started_at
  - plan_completed_at

### Breakdown Panel
- Show raw values and derived metrics

### Plan Summary
- Steps count, status
- Link to plan details

### LLM Usage Summary (if available)
- Tokens, model(s), tool calls count

## API / Query Requirements
Provide a simple query layer for:
- `timing_metrics` by date range, optionally joined to sessions
- `timing_metrics` by session id

Suggested queries:
- Overview aggregate query per day or per range
- Session list query with joins to `agent_chat_sessions` and `agent_plans`

## Telemetry Completeness Rules
- A timing row should exist for every streamed request.
- Missing fields should render as `-` (not 0) unless the field is expected to be 0.
- If `first_response_at` is missing but TTFR is present, display TTFR and flag missing timestamp.

## UX Notes
- Prefer milliseconds with `ms` suffix and formatted seconds for large values.
- Use warning badges for:
  - TTFR > p95
  - Tool selection > 2s
  - Plan execution > 10s

## Open Questions
- Should admin views allow filtering by `stream_run_id` (if present)?
- Should we add a per-step timing table in the plan execution view later?
- Should we display executor timings (from `agent_executions`) alongside plan execution?

## Non-Goals (for this iteration)
- Real-time streaming of timing metrics
- Deep per-tool latency breakdown in UI (can add later)
