<!-- docs/technical/implementation/ADMIN_CHAT_USER_ANALYTICS_SPEC.md -->

# Admin Chat User Analytics - Implementation Specification

## Document Metadata

- **Version**: 0.1.0
- **Date**: 2026-07-02
- **Owner**: BuildOS admin / chat observability
- **Status**: Ready for implementation planning
- **Primary Route**: `/admin/chat/users`
- **Primary API Surface**: `/api/admin/chat/users`
- **Purpose**: Let admins evaluate BuildOS chat performance from the user's perspective without exposing raw user/assistant transcripts.

## Executive Brief

BuildOS already has useful chat analytics, session audit tooling, timing analytics, tool analytics, cost analytics, and user activity drilldowns. The missing layer is a user-centered explorer that answers:

- Who has been chatting with BuildOS recently?
- Which users experienced slow first responses, LLM failures, tool failures, validation failures, or long-running turns?
- Which users have the most sessions, longest threads, most requests/responses, most tool calls, and most chat-created project entities?
- What were users broadly working on, without exposing full message transcripts?
- Can an admin zoom from all users -> one user -> one session -> one redacted turn timeline?

This should be built as a new admin page above the current low-level session audit page. The current session audit should remain available for deep debugging, but the default user analytics view must use redacted, aggregate, and classifier-derived fields.

## Current State

### Existing Admin Chat Surfaces

- `apps/web/src/routes/admin/chat/+page.svelte`
    - Top-level Chat Monitoring dashboard.
    - Uses `/api/admin/chat/dashboard` and `/api/admin/chat/media`.
- `apps/web/src/routes/admin/chat/sessions/+page.svelte`
    - Full session audit UI.
    - Loads `/api/admin/chat/sessions` and `/api/admin/chat/sessions/[id]`.
    - Good for debugging, but too raw for a user-perspective performance page.
- `apps/web/src/routes/admin/chat/timing/+page.svelte`
    - Global timing dashboard.
    - Good aggregate TTFR/TTFE coverage, but not user-centered.
- `apps/web/src/routes/admin/chat/tools/+page.svelte`
    - Tool analytics by tool/category/op/help path.
    - Good tool behavior coverage, but not user-centered.
- `apps/web/src/routes/admin/users`
    - User directory and activity modal.
    - Has useful user-level activity patterns, but currently reads chat message content and returns recent message previews.

### Existing API/Data Anchors

- `apps/web/src/routes/api/admin/chat/sessions/+server.ts`
    - Lists chat sessions and aggregates `chat_messages`, `chat_tool_executions`, and `llm_usage_logs`.
    - Current sort fields are `created_at`, `updated_at`, and `last_message_at` only.
- `apps/web/src/routes/api/admin/chat/sessions/[id]/session-detail-payload.ts`
    - Builds rich session detail and timeline.
    - Includes raw `messages`, message `content`, turn `request_message`, tool arguments/results, and prompt snapshot metadata.
    - This must not be reused directly for the new privacy-safe page.
- `apps/web/src/routes/api/admin/chat/timing/timing-analytics.ts`
    - Computes TTFR, TTFE, p50/p95/p99, slow sessions, context performance, cache-source performance, and prepared prompt hit/miss metrics.
- `apps/web/src/routes/api/admin/chat/tools/+server.ts`
    - Uses `chat_tool_executions` as source of truth and enriches with `chat_turn_runs` and `chat_sessions`.
- `apps/worker/src/workers/chat/chatSessionClassifier.ts`
    - Generates `auto_title`, `chat_topics`, `summary`, and `extracted_entities`.
    - Reads raw messages internally, but admin UI can consume only the derived fields.
- `apps/worker/src/workers/chat/chatSessionActivityProcessor.ts`
    - Converts completed `chat_operations` into `onto_project_logs`.
    - Writes `change_source = 'chat'` and `chat_session_id`, which is the best source for chat-created project entities.
- `packages/shared-types/src/database.schema.ts`
    - Generated schema inventory for `chat_sessions`, `chat_messages`, `chat_turn_runs`, `chat_tool_executions`, `llm_usage_logs`, `timing_metrics`, `onto_project_logs`, and `onto_projects`.

## Product Goal

Create an admin page that opens with recent chat users and quickly shows how BuildOS is performing for them.

The page should support three zoom levels:

1. **All Users**
    - Leaderboards and sortable user rows.
    - Default view answers "where should I look first?"
2. **User Drilldown**
    - Per-user chat history, cadence, project/topic clusters, slow turns, errors, tool calls, and entity changes.
    - Default view answers "what has this user experienced?"
3. **Session Drilldown**
    - Privacy-safe session timeline by turns, timing, tools, failures, created/updated entities, and LLM stats.
    - Default view answers "what happened in this session without reading the conversation?"

## Route and Navigation

Add a new route:

```txt
/admin/chat/users
```

Recommended nav label:

```txt
User Performance
```

Add to `CHAT_ADMIN_NAV_ITEMS` in `apps/web/src/lib/components/admin/adminRoutes.ts`.

Add `/admin/chat/users` to `wideContentRoutePrefixes` in `apps/web/src/lib/components/admin/AdminShell.svelte`.

## UX Specification

### Page Header

Title:

```txt
Chat User Performance
```

Description:

```txt
Recent BuildOS chat usage, response timing, tool activity, and redacted per-user drilldowns.
```

Actions:

- Timeframe select: `24h`, `7d`, `30d`, `90d`
- Refresh button
- Auto-refresh checkbox
- Export CSV/JSON button, optional in phase 2

### KPI Strip

Show 8-10 compact stats:

- Active chat users
- Chat sessions
- User messages
- Assistant responses
- Turns
- p50 TTFR
- p95 TTFR
- Slow-response turns
- Error-impacted users
- Chat-created entities

Definitions:

- `active chat users`: unique `chat_sessions.user_id` or `chat_messages.user_id` in timeframe.
- `user messages`: `chat_messages.role = 'user'`.
- `assistant responses`: `chat_messages.role = 'assistant'`.
- `turns`: `chat_turn_runs` rows.
- `TTFR`: `timing_metrics.time_to_first_response_ms`.
- `slow-response turns`: timing rows where TTFR exceeds default threshold.
- `error-impacted users`: users with any message error, tool failure, LLM failure, failed turn, validation failure, or relevant `error_logs` row.
- `chat-created entities`: `onto_project_logs.change_source = 'chat'`, `onto_project_logs.action = 'created'`, and `chat_session_id IS NOT NULL`, with fallback to `chat_tool_executions.affected_entities` only when no project log row exists.

### Default Leaderboards

Each card should link into filtered table results.

1. **Most Chat Sessions**
    - User, session count, last activity.
2. **Slowest First Responses**
    - User, p95 TTFR, max TTFR, slow turn count.
3. **Most Tool Calls**
    - User, total tool calls, failure rate, top tool/op.
4. **Longest Threads**
    - Session title, user, turn count, message count, duration.
5. **Most Requests and Responses**
    - User/session, user message count, assistant message count, turn count.
6. **Most Project Entities Created**
    - User, created entity count, project count, top entity types.
7. **Most Error-Impacted**
    - User, error count, latest error category.

### Main User Table

Default sort:

```txt
last_activity_at desc
```

Columns:

- User
    - name, email, user id copy control.
- Last chat
    - last activity timestamp.
- Cadence
    - active days, sessions per day, consecutive-day streak.
- Sessions
    - total sessions, project sessions, global sessions.
- Messages
    - user messages, assistant responses, total messages.
- Turns
    - total, completed, failed/cancelled/running.
- First response
    - p50 TTFR, p95 TTFR, max TTFR, slow turn count.
- Tools
    - tool calls, failure count/rate, top op/tool.
- Errors
    - message errors, tool failures, LLM failures, validation failures.
- Project impact
    - created/updated entities, projects touched.
- Preview
    - topics, project names, classifier title/summary status, and cadence note.

Preview examples:

```txt
3 sessions across 2 days. Topics: launch video, landing page, YouTube. Project: BuildOS Demo Video Campaign. Created 1 project and 3 tasks.
```

```txt
5 sessions this week across 3 projects. Repeated slow first responses on project chats. Most tool calls were ontology reads.
```

Strict privacy fallback:

```txt
3 sessions across 2 days. Project context: 1 project. Topics: launch video, landing page. 1 project entity created.
```

### User Drilldown Drawer

Open when a user row is selected.

Sections:

1. **User Summary**
    - Chat activity window, last seen, active days, session count, message count, turn count.
    - Links: `/admin/users`, `/admin/errors?userId=...`, filtered `/admin/chat/sessions`.
2. **Performance**
    - p50/p95/max TTFR.
    - p50/p95 turn duration.
    - slow turn timeline.
    - cache-source/prepared-prompt distribution if available.
3. **Chat Cadence**
    - day-by-day activity bars.
    - multiple sessions per day.
    - consecutive-day streak.
4. **Projects and Topics**
    - projects touched.
    - topic chips from `chat_topics`.
    - context type distribution.
5. **Errors**
    - grouped by source:
        - message errors
        - tool failures
        - LLM failures
        - failed/cancelled turns
        - validation failures
        - app error logs
    - latest examples should show error text, not message content.
6. **Tools**
    - top tool names, gateway ops, help paths, failure rates, p95 duration.
7. **Entity Changes**
    - created/updated/deleted counts by entity type.
    - project-level grouping.
8. **Recent Sessions**
    - redacted session cards with title/topic/project/timing/tool/error summary.

### Session Drilldown

Open from a session row/card.

This should be a new redacted payload, not the existing raw audit payload.

Header:

- session title / auto title
- user
- context type
- project(s)
- created/last message timestamps
- status
- classification freshness

Metrics:

- turns
- user messages
- assistant responses
- total messages
- tool calls
- LLM calls
- token/cost totals
- p50/max TTFR for session
- total wall-clock duration
- created/updated/deleted entity counts

Redacted turn timeline:

- Turn index
- Started/finished
- Status/finished reason
- TTFR/TTFE
- Tool calls/rounds
- LLM passes
- First lane
- First skill path
- First canonical op
- Cache source/prepared prompt hit
- Validation failure count
- Tool failures and error messages
- Created/updated/deleted entity refs

The timeline must not show:

- raw user message text
- raw assistant response text
- `request_message`
- prompt snapshots
- tool arguments
- tool results

Add a secondary link to the existing full audit modal for trusted debugging:

```txt
Open full session audit
```

The full audit should remain intentionally separate because it exposes raw content.

## Filters and Search

### Time Filters

- `24h`
- `7d`
- `30d`
- `90d`
- custom date range, optional phase 2

### Scope Filters

- all users
- selected user
- selected project
- context type: `global`, `project`, `task`, `daily_brief`, etc.
- topic
- session status
- classification state:
    - classified
    - missing classification
    - stale classification

### Performance Filters

- slow TTFR threshold:
    - default: `10000ms`
    - options: `5s`, `10s`, `20s`, `30s`, custom
- high tool-call sessions
- failed tool sessions
- high LLM pass turns
- failed/cancelled/running turns
- validation failures
- long sessions

### Entity Filters

- created project entities
- updated project entities
- deleted project entities
- entity type: project, task, document, goal, milestone, risk, plan, requirement, source, edge

### Search Semantics

Global search should match:

- user email/name
- session id
- session title / auto title
- session summary, if privacy policy allows derived summary search
- topic
- project name
- tool name
- gateway op
- help path
- error message
- entity title/name

Specific user search should reuse the same search grammar but scope to one `user_id`.

Recommended behavior:

- `user:djwayne` or user picker scopes user.
- `tool:create_onto_project` filters tool calls.
- `op:onto.project.create` filters canonical op.
- `topic:calendar` filters chat topics.
- `error:true` filters error-impacted sessions/users.
- `slow:true` filters turns above TTFR threshold.

Full grammar can wait; phase 1 can use structured controls and one text search box.

## Sorts

Support these user table sorts:

- `last_activity_at`
- `session_count`
- `turn_count`
- `message_count`
- `user_message_count`
- `assistant_message_count`
- `tool_call_count`
- `tool_failure_count`
- `tool_failure_rate`
- `llm_failure_count`
- `validation_failure_count`
- `p95_ttfr_ms`
- `max_ttfr_ms`
- `slow_turn_count`
- `longest_session_turns`
- `longest_session_messages`
- `created_entity_count`
- `updated_entity_count`
- `total_tokens`
- `total_cost_usd`

Support these session table sorts:

- `last_activity_at`
- `created_at`
- `turn_count`
- `message_count`
- `user_message_count`
- `assistant_message_count`
- `tool_call_count`
- `tool_failure_count`
- `llm_call_count`
- `llm_failure_count`
- `max_ttfr_ms`
- `p95_ttfr_ms`
- `duration_ms`
- `created_entity_count`
- `total_tokens`
- `total_cost_usd`

## Data Model

### Primary Sources

`chat_sessions`

- session identity
- user id
- title / auto title
- summary / chat topics
- context type and entity id
- message count
- tool call count
- total tokens
- created/updated/last message timestamps
- classification freshness via `last_classified_at`

`chat_messages`

- message counts by role
- message errors
- token fields
- message timestamps
- do not return `content`

`chat_turn_runs`

- one row per user request/turn
- status, finished reason
- tool rounds/calls
- validation failures
- LLM pass count
- first lane / skill / canonical op
- cache/prepared-prompt fields
- started/finished timestamps
- do not return `request_message`

`timing_metrics`

- `time_to_first_response_ms`
- `time_to_first_event_ms`
- context build/tool selection timings
- plan timings
- turn/session/user linkage
- cache/prepared-prompt metadata fallback

`chat_tool_executions`

- tool name/category
- gateway op/help path
- success/error
- execution time
- tokens consumed
- result count / zero result
- affected entities
- do not return raw `arguments` or `result`

`llm_usage_logs`

- model/provider/profile
- status/error message
- response time
- prompt/completion/total tokens
- cost fields
- cache status
- turn/session/user linkage

`onto_project_logs`

- `chat_session_id`
- action
- entity type/id
- project id
- change source
- created timestamp
- changed by
- do not return raw before/after blobs unless a redacted entity label extractor is used

`error_logs`

- user-level app errors
- endpoint/error type/severity/message/resolution state
- use only in user drilldown or error summary

### Secondary Sources

`users`

- name/email.

`chat_sessions_projects`

- project linkage beyond direct `context_type = 'project'`.

`onto_projects`

- project names for previews and grouping.

`queue_jobs`

- classification job status for sessions missing or waiting on classification.

## Derived Metrics

### User Metrics

```ts
type AdminChatUserMetric = {
	user_id: string;
	email: string;
	name: string | null;
	first_chat_at: string | null;
	last_activity_at: string | null;
	active_day_count: number;
	consecutive_day_streak: number;
	session_count: number;
	project_session_count: number;
	global_session_count: number;
	turn_count: number;
	completed_turn_count: number;
	failed_turn_count: number;
	cancelled_turn_count: number;
	running_turn_count: number;
	message_count: number;
	user_message_count: number;
	assistant_message_count: number;
	message_error_count: number;
	tool_call_count: number;
	tool_failure_count: number;
	tool_failure_rate: number;
	llm_call_count: number;
	llm_failure_count: number;
	validation_failure_count: number;
	ttfr_p50_ms: number | null;
	ttfr_p95_ms: number | null;
	ttfr_max_ms: number | null;
	slow_turn_count: number;
	total_tokens: number;
	total_cost_usd: number;
	created_entity_count: number;
	updated_entity_count: number;
	deleted_entity_count: number;
	project_count: number;
	top_topics: Array<{ topic: string; count: number }>;
	top_projects: Array<{ project_id: string; name: string | null; count: number }>;
	top_tools: Array<{ tool_name: string; count: number; failures: number }>;
	preview: string;
};
```

### Session Metrics

```ts
type AdminChatClassificationJobSummary = {
	job_id: string;
	queue_job_id: string | null;
	status: string;
	error_message: string | null;
	queued_at: string | null;
	started_at: string | null;
	completed_at: string | null;
	updated_at: string | null;
};

type AdminChatSessionMetric = {
	session_id: string;
	user_id: string;
	title: string;
	context_type: string;
	entity_id: string | null;
	project_ids: string[];
	project_names: string[];
	status: string;
	created_at: string;
	last_activity_at: string | null;
	last_classified_at: string | null;
	classification_state: 'classified' | 'missing' | 'stale';
	classification_job: AdminChatClassificationJobSummary | null;
	topics: string[];
	summary_preview: string | null;
	turn_count: number;
	message_count: number;
	user_message_count: number;
	assistant_message_count: number;
	tool_call_count: number;
	tool_failure_count: number;
	llm_call_count: number;
	llm_failure_count: number;
	validation_failure_count: number;
	ttfr_p50_ms: number | null;
	ttfr_p95_ms: number | null;
	ttfr_max_ms: number | null;
	duration_ms: number | null;
	total_tokens: number;
	total_cost_usd: number;
	created_entity_count: number;
	updated_entity_count: number;
	deleted_entity_count: number;
	has_errors: boolean;
	has_slow_response: boolean;
};
```

### Redacted Turn Metrics

```ts
type AdminChatRedactedTurn = {
	turn_run_id: string;
	session_id: string;
	turn_index: number;
	status: string;
	finished_reason: string | null;
	started_at: string;
	finished_at: string | null;
	duration_ms: number | null;
	ttfr_ms: number | null;
	ttfe_ms: number | null;
	tool_round_count: number;
	tool_call_count: number;
	tool_failure_count: number;
	validation_failure_count: number;
	llm_pass_count: number;
	first_lane: string | null;
	first_skill_path: string | null;
	first_canonical_op: string | null;
	cache_source: string | null;
	prepared_prompt_hit: boolean | null;
	error_summaries: Array<{
		source: 'message' | 'tool' | 'llm' | 'turn' | 'validation';
		message: string;
	}>;
	entity_changes: Array<{
		action: string;
		entity_type: string;
		entity_id: string;
		entity_title: string | null;
		project_id: string | null;
	}>;
};
```

## API Contract

### `GET /api/admin/chat/users`

Query params:

```txt
timeframe=7d
page=1
limit=50
sort_by=last_activity_at
sort_order=desc
search=
user_id=
project_id=
context_type=all
topic=
slow_threshold_ms=10000
errors=all|only|none
tool_bucket=all|none|some|heavy
entity_action=all|created|updated|deleted
classification=all|classified|missing|stale
```

Response:

```ts
type AdminChatUsersResponse = {
	kpis: {
		active_users: number;
		sessions: number;
		turns: number;
		user_messages: number;
		assistant_responses: number;
		ttfr_p50_ms: number | null;
		ttfr_p95_ms: number | null;
		slow_turns: number;
		error_impacted_users: number;
		chat_created_entities: number;
	};
	leaderboards: {
		most_sessions: AdminChatUserMetric[];
		slowest_first_responses: AdminChatUserMetric[];
		most_tool_calls: AdminChatUserMetric[];
		longest_threads: AdminChatSessionMetric[];
		most_requests_responses: AdminChatUserMetric[];
		most_created_entities: AdminChatUserMetric[];
		most_error_impacted: AdminChatUserMetric[];
	};
	users: AdminChatUserMetric[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		total_pages: number;
	};
	filter_options: {
		context_types: string[];
		topics: string[];
		tools: string[];
		gateway_ops: string[];
		projects: Array<{ project_id: string; name: string | null }>;
	};
	data_health: {
		truncated: Record<string, boolean>;
		classification_missing_sessions: number;
		classification_stale_sessions: number;
		raw_message_content_returned: false;
	};
};
```

### `GET /api/admin/chat/users/[userId]`

Query params:

```txt
timeframe=30d
session_page=1
session_limit=25
session_sort_by=last_activity_at
session_sort_order=desc
search=
slow_threshold_ms=10000
```

Response:

```ts
type AdminChatUserDetailResponse = {
	user: {
		id: string;
		email: string;
		name: string | null;
	};
	summary: AdminChatUserMetric;
	timeline: Array<{
		date: string;
		session_count: number;
		turn_count: number;
		message_count: number;
		slow_turn_count: number;
		error_count: number;
		created_entity_count: number;
		top_topics: string[];
		project_names: string[];
	}>;
	sessions: AdminChatSessionMetric[];
	errors: Array<{
		source: 'message' | 'tool' | 'llm' | 'turn' | 'validation' | 'app';
		session_id: string | null;
		turn_run_id: string | null;
		error_message: string;
		severity: string | null;
		created_at: string;
	}>;
	tools: Array<{
		tool_name: string;
		gateway_op: string | null;
		count: number;
		failures: number;
		p95_execution_time_ms: number | null;
	}>;
	entities: Array<{
		project_id: string;
		project_name: string | null;
		entity_type: string;
		action: string;
		count: number;
	}>;
	entity_changes: Array<{
		session_id: string;
		project_id: string | null;
		project_name: string | null;
		entity_type: string;
		entity_id: string | null;
		entity_title: string | null;
		action: string;
		source: string | null;
		created_at: string;
	}>;
};
```

### `GET /api/admin/chat/users/[userId]/sessions/[sessionId]`

Response:

```ts
type AdminChatRedactedSessionResponse = {
	session: AdminChatSessionMetric;
	turns: AdminChatRedactedTurn[];
	timeline: Array<{
		id: string;
		timestamp: string;
		type:
			| 'session'
			| 'turn'
			| 'timing'
			| 'tool'
			| 'llm'
			| 'entity_change'
			| 'error'
			| 'context_shift';
		severity: 'info' | 'success' | 'warning' | 'error';
		turn_index: number | null;
		title: string;
		summary: string;
	}>;
	privacy: {
		raw_message_content_returned: false;
		raw_assistant_content_returned: false;
		raw_request_message_returned: false;
		raw_tool_arguments_returned: false;
		raw_tool_results_returned: false;
		prompt_snapshot_returned: false;
	};
};
```

## Privacy and Redaction Rules

This page exists specifically to inspect performance and behavior without reading full conversations.

### Never Return

- `chat_messages.content`
- assistant response text
- `chat_turn_runs.request_message`
- `chat_prompt_snapshots.system_prompt`
- `chat_prompt_snapshots.model_messages`
- `chat_prompt_snapshots.rendered_dump_text`
- `chat_tool_executions.arguments`
- `chat_tool_executions.result`
- `chat_operations.data`
- `chat_operations.result`
- `onto_project_logs.before_data`
- `onto_project_logs.after_data`

### Allowed

- user identity for admins
- session title / auto title
- topics
- classifier-generated summary if approved
- counts
- statuses
- timestamps
- tool names
- gateway ops
- help paths
- error messages
- entity type/id/title
- project names
- timing values
- token/cost values

### Privacy Decision for First Slice

The user requested "a short preview" and "different things they said" while also saying "I won't see their chat messages versus BuildOS responses."

Recommended interpretation:

- Use derived classifier outputs (`auto_title`, `chat_topics`, `summary`) for the preview.
- Do not show literal messages or assistant responses.
- Add a "strict preview mode" option that hides `summary` and shows only topics/project/entity/cadence.

First-slice default:

- Ship strict preview mode as the default.
- Return `summary_preview: null` unless the API explicitly opts into derived summaries later.
- Still store and search classifier topics, titles, project names, entity labels, tool names, and error messages.
- Treat classifier `summary` as a phase-2 preview enhancement that requires a deliberate review.

## Query and Performance Strategy

Phase 1 can use a TypeScript service that pages and aggregates bounded rows, following existing admin chat analytics patterns.

However, this view is cross-user and can grow quickly. Prefer a Postgres RPC once the metric shape stabilizes.

Recommended phase 1 row limits:

- sessions: 50,000 max in timeframe
- messages: aggregate only, avoid content
- turn runs: 50,000 max
- timing metrics: 50,000 max
- tool executions: 50,000 max
- LLM usage logs: 50,000 max
- project logs: 50,000 max

If any source truncates, set `data_health.truncated[source] = true`.

### Phase 1 Backend Data Flow

The first implementation should keep the service explicit and easy to test:

1. Authorize admin using the same convention as the existing admin chat routes.
2. Parse filters and normalize:
    - timeframe to `{ startDate, endDate }`
    - sort fields to an allowlist
    - search to a sanitized `ilike` value
    - slow threshold to a bounded integer
3. Load base sessions for the timeframe:
    - select only identity, ownership, context, title/classifier, counters, status, and timestamps
    - do not select message transcript fields
    - apply user/project/context/search filters where possible
4. Load project links from `chat_sessions_projects` for those session ids.
5. Load messages by session id/user id:
    - select `id`, `session_id`, `user_id`, `role`, error/status fields, token fields, and timestamps
    - do not select `content`
    - aggregate by role in code, or move to database grouping later
6. Load turn runs:
    - select status, finish reason, counts, first lane/skill/op, cache/prepared-prompt metadata, and timestamps
    - do not select `request_message`
7. Load timing metrics:
    - join by `session_id`, `turn_run_id`, and `user_id`
    - calculate percentiles from valid numeric TTFR values only
8. Load tool executions:
    - select tool/category/op/help-path/status/error/timing/entity-impact fields
    - do not select `arguments` or `result`
9. Load LLM usage:
    - select model/provider/profile/status/error/timing/tokens/costs/cache fields
    - aggregate by session and user
10. Load project logs:

- require `chat_session_id IS NOT NULL`
- prefer `change_source = 'chat'`
- select action/entity/project/user/timestamp fields
- do not select `before_data` or `after_data`

11. Build maps:

- `sessionId -> session metric`
- `userId -> user metric`
- `sessionId -> project ids`
- `turnRunId -> timing/tool/LLM/error summaries`

12. Run a final redaction assertion over outgoing payloads before returning JSON.

The redaction assertion should recursively fail in tests if forbidden keys or known fixture values are present. This is the protection that keeps the new user-facing admin view separate from the raw session audit payload.

### Indexes to Verify

Existing migrations already add several chat and admin dashboard indexes. Verify or add:

```sql
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_last_activity
	ON public.chat_sessions(user_id, last_message_at DESC, updated_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_session_created_role
	ON public.chat_messages(user_id, session_id, created_at DESC, role);

CREATE INDEX IF NOT EXISTS idx_chat_turn_runs_user_started
	ON public.chat_turn_runs(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_timing_metrics_user_created_turn
	ON public.timing_metrics(user_id, created_at DESC, turn_run_id);

CREATE INDEX IF NOT EXISTS idx_chat_tool_executions_session_created
	ON public.chat_tool_executions(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_user_chat_session_created
	ON public.llm_usage_logs(user_id, chat_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onto_project_logs_chat_session_action_created
	ON public.onto_project_logs(chat_session_id, action, created_at DESC)
	WHERE chat_session_id IS NOT NULL;
```

Do not add these blindly if equivalent indexes already exist. Check current schema first.

## Implementation Plan

### Phase 1 - Backend Foundations

1. Create `apps/web/src/lib/server/admin-chat-user-analytics.ts`.
2. Implement typed row loaders with bounded pagination and truncation flags.
3. Implement metric builders:
    - user rollups
    - session rollups
    - timing percentiles
    - tool summaries
    - error summaries
    - entity-change summaries
    - cadence/streak summaries
4. Add redaction helpers and payload tests.
5. Create `apps/web/src/routes/api/admin/chat/users/+server.ts`.
6. Create `apps/web/src/routes/api/admin/chat/users/[userId]/+server.ts`.
7. Create `apps/web/src/routes/api/admin/chat/users/[userId]/sessions/[sessionId]/+server.ts`.

### Phase 2 - Frontend

1. Add nav item in `adminRoutes.ts`.
2. Add wide-content route in `AdminShell.svelte`.
3. Create `apps/web/src/routes/admin/chat/users/+page.svelte`.
4. Reuse existing UI components:
    - `AdminPageHeader`
    - `Button`
    - `Select`
    - `TextInput`
    - existing admin card/table patterns
5. Build:
    - KPI strip
    - leaderboards
    - filter bar
    - sortable user table
    - user detail drawer
    - redacted session drawer

### Phase 3 - Refinement

1. Add export.
2. Add saved URL state for filters/sorts.
3. Add compare mode:
    - selected user vs all users
    - selected timeframe vs prior timeframe
4. Move heavy aggregation into an RPC if app-level aggregation becomes slow.
5. Add deeper project/entity drill links.

### Phase 4 - Optional Enhancements

1. Alert badges:
    - users with repeated slow first response
    - users with repeated failed tool calls
    - sessions with high LLM pass count
    - sessions with stale running turns
2. Issue clusters:
    - group repeated tool errors by normalized message
    - group slow turns by first canonical op or context type
3. Classification queue controls:
    - queue classification for missing/stale sessions
    - show queue job status
4. Internal notes:
    - admin annotations on user/session performance observations

## Acceptance Criteria

### Product

- Admin can open `/admin/chat/users` and immediately see recent chat users.
- Admin can identify:
    - most active chat users
    - users with slow first responses
    - users with tool-heavy chats
    - longest sessions
    - sessions with most requests/responses
    - users whose chats created the most project entities
- Admin can search all users and scope search to one user.
- Admin can drill into a user and then a session.
- Admin can sort by every high-value metric listed above.

### Privacy

- The user analytics list endpoint does not return raw message content.
- The user detail endpoint does not return raw message content.
- The redacted session endpoint does not return raw message content.
- The redacted session endpoint does not return `request_message`.
- The redacted session endpoint does not return raw tool arguments/results.
- The redacted session endpoint does not return prompt snapshots.
- Tests assert these forbidden keys/values are absent.

### Engineering

- Endpoints use existing admin auth conventions.
- Aggregation handles empty datasets.
- Aggregation handles missing optional tables/columns where existing APIs already tolerate optional data.
- Pagination works.
- Truncation flags are exposed.
- Sorts are deterministic.
- Unit tests cover rollup math, redaction, and classification freshness.
- API route tests cover unauthorized, non-admin, success, and privacy assertions.

## Testing Plan

### Unit Tests

Create tests for `admin-chat-user-analytics.ts`:

- computes user rollups from sessions/messages/turns
- computes TTFR p50/p95/max
- computes slow turn counts by threshold
- groups tool failures
- groups LLM failures
- groups entity changes by action/entity type/project
- computes active days and consecutive streak
- builds strict preview without raw content
- marks classification as missing/stale/classified
- sets truncation flags

### API Tests

Create tests for:

- `GET /api/admin/chat/users`
- `GET /api/admin/chat/users/[userId]`
- `GET /api/admin/chat/users/[userId]/sessions/[sessionId]`

Cases:

- unauthenticated -> 401
- non-admin -> 403
- admin success -> 200
- no rows -> valid empty payload
- raw message content fixture is not returned
- raw request message fixture is not returned
- raw tool args/result fixture is not returned
- prompt snapshot fixture is not returned

### UI Tests

Add Svelte/Vitest coverage where practical:

- renders KPI strip
- updates query params on filter changes
- sorts table rows
- opens user drawer
- opens redacted session drawer
- shows strict preview when summary hidden
- displays data-health truncation warning

### Manual QA

Use a local admin account with at least:

- one recent no-tool chat
- one tool-heavy project chat
- one chat with failed tool execution
- one chat with slow TTFR
- one chat that created project entities
- one missing-classification session
- one stale-classification session

Verify:

- no raw transcript text appears on `/admin/chat/users`
- links to `/admin/chat/sessions?chat_session_id=...` work
- search and filters combine predictably
- mobile layout remains usable, though this is primarily an admin desktop tool

## Known Risks

1. **Classifier summary may be considered content exposure**
    - Mitigation: strict preview mode; hide summary by default if needed.
2. **Project entity attribution may be incomplete**
    - Primary source should be `onto_project_logs.chat_session_id`.
    - Fallback to `chat_tool_executions.affected_entities`.
    - Display attribution confidence if needed.
3. **Timing rows may not exist for every turn**
    - Show `unknown` timing state and calculate from available rows only.
4. **Tool execution rows may miss turn correlation**
    - Group by session first, then turn when `turn_run_id` exists.
5. **Cross-user aggregation may be expensive**
    - Start bounded.
    - Add RPC/materialized summaries if this becomes hot.
6. **Current session audit payload is raw**
    - Do not reuse it for the redacted page.
    - Create a separate redacted builder.

## Ready-To-Build Checklist

- [x] First-slice preview default: strict preview, no classifier summary text in list/detail payloads.
- [x] Default slow threshold: `10000ms`.
- [x] Route label: `User Performance`.
- [x] Build backend rollup service.
- [x] Build redacted payload tests first.
- [x] Add API endpoints.
- [x] Add frontend page and nav.
- [x] Run focused unit/API tests.
- [ ] Manually inspect page with real admin data.

Progress note, 2026-07-05:

- Backend rollups, list/detail endpoints, redacted session endpoint, admin nav, wide admin route, and the `/admin/chat/users` page are implemented.
- Focused unit tests cover rollup math, classification freshness, strict preview redaction, redacted session payload privacy, and safe entity-change drilldown records.
- Current-page CSV/JSON export and safe user-drilldown JSON export are implemented in the admin UI.
- Filter, sort, pagination, search, and slow-threshold state now hydrate from and sync to URL query params.
- Scoped compare mode now compares the selected user against the currently loaded result set in the drawer. All-matching-user and prior-timeframe comparison still need backend support before they can be represented accurately.
- API route tests now cover unauthenticated, non-admin, success, bad-param, not-found, and redaction-assertion failure paths for the list, user drilldown, and redacted session endpoints.
- Deeper project/entity drill links are now available from recent session project chips, entity aggregate groups, individual entity-change rows, and redacted turn entity chips when safe project/entity IDs are present.
- Alert badges now flag slow responses, tool failures, error load, running turns, stale/missing classifications, and session-level LLM/validation issues from safe aggregate fields.
- Issue clusters now group repeated safe error summaries by source and normalized message in the user drawer, with redacted timeline drill links when a session ID is available.
- Classification queue controls now let admins queue visible missing/stale sessions from the user drawer through an admin endpoint that verifies selected-user ownership and reuses the existing chat classification queue service.
- Latest classification queue job status is now surfaced on recent-session cards through a redacted `classification_job` summary loaded from `queue_jobs`.
- SvelteKit route type sync and filtered `svelte-check` have passed for the admin chat user analytics slice.
- Remaining verification gap: manual browser QA against live admin data.

## Recommended First Implementation Slice

Ship a useful first version with:

- [x] `/admin/chat/users`
- [x] `/api/admin/chat/users`
- [x] user table
- [x] KPI strip
- [x] leaderboards
- [x] user drawer with recent sessions
- [x] redacted session drilldown
- [x] strict preview mode

Then add:

- [x] entity-change drilldown
- [x] export
- [x] current-result compare mode
- [x] deeper project/entity drill links
- [x] alert badges
- [x] issue clusters
- [x] classification queue controls for visible missing/stale sessions
- [x] classification queue job status for recent sessions
- RPC optimization

This order gets the admin value quickly while keeping the privacy boundary testable from the first PR.
