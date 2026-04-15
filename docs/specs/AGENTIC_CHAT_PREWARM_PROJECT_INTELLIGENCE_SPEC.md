<!-- docs/specs/AGENTIC_CHAT_PREWARM_PROJECT_INTELLIGENCE_SPEC.md -->

# Agentic Chat Prewarm Project Intelligence Spec

Status: Proposed
Date: 2026-04-15
Owner: BuildOS Agentic Chat

Related:

- [Agentic Chat Operating Model](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-operating-model.md)
- [Agentic Chat Lightweight Harness Plan](/Users/djwayne/buildos-platform/docs/plans/AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_PLAN.md)
- [Initial Seed Context Gap Analysis](/Users/djwayne/buildos-platform/docs/reports/agentic-chat-initial-seed-context-gap-analysis-2026-04-14.md)
- [Context Packet Gap Analysis](/Users/djwayne/buildos-platform/docs/reports/agentic-chat-context-packet-gap-analysis-2026-04-14.md)
- [Agentic Chat Current Implementation](/Users/djwayne/buildos-platform/apps/web/docs/features/agentic-chat/README.md)

## Purpose

The `/api/agent/v2/prewarm` endpoint should be the canonical way to prepare
project intelligence for FastChat before a stream turn starts.

The frontend should not assemble or send homepage/dashboard context into the
agent. Prewarm should load, cache, and return the relevant backend-authenticated
context for the current chat scope. The stream endpoint should then consume the
fresh prewarmed cache without re-querying unless the cache is missing, stale, or
for the wrong scope.

## Problem

Prompt dumps for the lite seed can currently show:

```text
Overdue or due soon:
- No overdue or near-term due work is loaded.

Upcoming dated work:
- No upcoming dated work is loaded.

Recent project changes:
- No recent project changes are loaded.
```

That is misleading when context has already loaded project bundles with nested
`recent_activity`, goals, milestones, plans, and project metadata.

The current issue is partly a prompt summarization mismatch, but the broader
gap is architectural:

- global chat needs recent changes, overdue/due-soon work, and upcoming work
  across accessible projects
- project chat needs those same signals scoped to the selected project
- focused entity chat should keep project-scoped signals and add focus-entity
  context
- this should happen during prewarm, not by passing homepage analytics from the
  browser

## Decision

Use `/api/agent/v2/prewarm` as the only frontend entry point for agent seed
context warming.

Do not create a separate browser-owned project store as an agent data source.
Do not send dashboard analytics directly to `/api/agent/v2/stream`.

Instead:

1. Extend the FastChat context payload loaded by prewarm with a compact
   `project_intelligence` snapshot.
2. Update the existing `load_fastchat_context` path so it can efficiently return
   this snapshot for both global and project scopes.
3. Keep the existing short-lived `fastchat_context_cache` contract, but include
   the new snapshot inside cached context.
4. Update the lite prompt timeline builder to prefer `project_intelligence`, and
   to fall back to nested context bundles when needed.

## Goals

- Prewarm returns enough structured context for the first model pass to answer
  workspace/project status questions without immediate tool calls.
- Global context includes recent changes across accessible projects, not just
  the homepage's visible project cards.
- Project context includes recent changes for only that project.
- Overdue, due-soon, and upcoming work are computed server-side with consistent
  date windows and terminal-state rules.
- Stream startup is faster because `/api/agent/v2/stream` can reuse the
  prewarmed session cache.
- Prompt text becomes strategically useful: no false "nothing loaded" lines when
  the data exists.

## Non-Goals

- Do not make dashboard analytics the agent source of truth.
- Do not build a frontend cache that the backend trusts for permissions,
  freshness, or writes.
- Do not load full project graphs for global chat.
- Do not embed full document bodies or unbounded activity history.
- Do not replace overview tools. Tools remain available when the user needs
  more detail than the seed snapshot contains.

## Current Relevant Flow

```text
AgentChatModal.svelte
  -> prewarmAgentContext()
  -> POST /api/agent/v2/prewarm
  -> loadFastChatPromptContext()
  -> FastChat context cache entry
  -> chat_sessions.agent_metadata.fastchat_context_cache when a session exists

AgentChatModal.svelte
  -> POST /api/agent/v2/stream
  -> stream endpoint checks session cache / request prewarm / fresh load
  -> buildMasterPrompt() or buildLitePromptEnvelope()
```

Important files:

| Area                      | File                                                                      |
| ------------------------- | ------------------------------------------------------------------------- |
| Prewarm endpoint          | `apps/web/src/routes/api/agent/v2/prewarm/+server.ts`                     |
| Stream endpoint cache use | `apps/web/src/routes/api/agent/v2/stream/+server.ts`                      |
| Context loader            | `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`             |
| Context cache contract    | `apps/web/src/lib/services/agentic-chat-v2/context-cache.ts`              |
| Context types             | `apps/web/src/lib/services/agentic-chat-v2/context-models.ts`             |
| Lite prompt builder       | `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts` |
| FastChat RPC source       | `packages/shared-types/src/functions/load_fastchat_context.sql`           |

## Data Contract

Add this optional property to global, project, and focused-entity context
payloads:

```ts
type FastChatProjectIntelligence = {
	generated_at: string;
	scope: 'global' | 'project';
	project_id: string | null;
	project_name: string | null;
	timezone: 'UTC';
	windows: {
		due_soon_days: number;
		upcoming_days: number;
		recent_changes_days: number;
		recent_changes_max_lookback_days: number;
	};
	counts: {
		accessible_projects?: number;
		projects_returned?: number;
		overdue_total: number;
		due_soon_total: number;
		upcoming_total: number;
		recent_change_total: number;
	};
	overdue_or_due_soon: FastChatWorkSignal[];
	upcoming_work: FastChatWorkSignal[];
	recent_changes: FastChatRecentChange[];
	project_summaries: FastChatProjectSignalSummary[];
	limits: {
		overdue_or_due_soon: number;
		upcoming_work: number;
		recent_changes: number;
		project_summaries: number;
	};
	maybe_more: {
		overdue_or_due_soon: boolean;
		upcoming_work: boolean;
		recent_changes: boolean;
		project_summaries: boolean;
	};
	source: 'load_fastchat_context' | 'fallback';
};

type FastChatWorkSignal = {
	kind: 'task' | 'milestone' | 'goal' | 'event' | 'project';
	id: string;
	project_id: string;
	project_name: string | null;
	title: string;
	state_key: string | null;
	date_kind: 'due_at' | 'target_date' | 'start_at' | 'end_at';
	date: string;
	bucket: 'overdue' | 'due_soon' | 'upcoming';
	days_delta: number;
	priority?: number | null;
	updated_at?: string | null;
};

type FastChatRecentChange = {
	kind: string;
	id: string;
	project_id: string;
	project_name: string | null;
	title: string | null;
	action: 'created' | 'updated' | string;
	changed_at: string;
};

type FastChatProjectSignalSummary = {
	project_id: string;
	project_name: string;
	state_key: string | null;
	next_step_short: string | null;
	updated_at: string | null;
	counts: {
		overdue: number;
		due_soon: number;
		upcoming: number;
		recent_changes: number;
	};
};
```

The snapshot is intentionally summary-shaped. It is allowed to omit detail when
limits are reached, but it must expose counts and `maybe_more` so the model does
not overstate completeness.

## Scope Rules

### Global Context

Global prewarm should compute signals across all accessible projects for the
current actor, not only the top projects rendered on the homepage and not only
projects created by the user.

Required global data:

- recent changes across accessible projects
- overdue work across accessible projects
- due-soon work across accessible projects
- upcoming dated work across accessible projects
- compact project summaries for the projects most relevant to those signals

Global output should be bounded. The first version should use:

| List                  | Limit | Sort                                                                              |
| --------------------- | ----: | --------------------------------------------------------------------------------- |
| `overdue_or_due_soon` |    16 | overdue first, oldest due date first, then due-soon date ascending, then priority |
| `upcoming_work`       |    16 | date ascending                                                                    |
| `recent_changes`      |    16 | changed_at descending                                                             |
| `project_summaries`   |     8 | projects with attention signals first, then recent change, then updated_at        |

### Project Context

Project prewarm should compute signals only for the selected project.

Required project data:

- recent changes for the selected project
- overdue/due-soon work for the selected project
- upcoming dated work for the selected project
- compact counts for the selected project

Project output should be bounded. The first version should use:

| List                  | Limit | Sort                                                                              |
| --------------------- | ----: | --------------------------------------------------------------------------------- |
| `overdue_or_due_soon` |    12 | overdue first, oldest due date first, then due-soon date ascending, then priority |
| `upcoming_work`       |    12 | date ascending                                                                    |
| `recent_changes`      |    12 | changed_at descending                                                             |
| `project_summaries`   |     1 | selected project                                                                  |

### Focused Entity Context

Focused entity context should remain project-scoped. The snapshot should be the
same as project context unless and until we add a focused-entity-specific
`related_work` list.

Do not narrow the whole snapshot only to linked entities, because the agent still
needs project-level timeline awareness when chatting about a task, document,
goal, plan, milestone, or risk.

## Date And State Rules

Use shared constants in TypeScript and SQL comments:

```text
DUE_SOON_DAYS = 7
UPCOMING_DAYS = 30
RECENT_CHANGES_DAYS = 7
RECENT_CHANGES_MAX_LOOKBACK_DAYS = 21
```

Terminal states should be treated consistently across entity kinds:

```text
done, completed, closed, archived, cancelled, canceled, abandoned
```

For risk-like states, `mitigated` may be terminal, but risk is not part of the
first work-signal list unless we explicitly add risk dates later.

Work signals:

| Entity    | Date field                                      | Included buckets            |
| --------- | ----------------------------------------------- | --------------------------- |
| task      | `due_at`, fallback `start_at` only for upcoming | overdue, due_soon, upcoming |
| milestone | `due_at`                                        | overdue, due_soon, upcoming |
| goal      | `target_date`                                   | overdue, due_soon, upcoming |
| event     | `start_at`                                      | upcoming only               |
| project   | `end_at`, fallback `start_at`                   | overdue, due_soon, upcoming |

Recent changes:

- Primary source: `onto_project_logs`
- Include actions: `created`, `updated`
- Title source: `after_data.title/name/text/summary/display_name`, then
  `before_data.title/name/text/summary/display_name`
- Filter to `RECENT_CHANGES_DAYS`
- If no changes are found in the recent window, allow fallback up to
  `RECENT_CHANGES_MAX_LOOKBACK_DAYS`, with metadata making the fallback window
  clear

## Backend Loading Strategy

Recommended implementation: update the existing `load_fastchat_context` RPC and
the `loadFastChatPromptContext` TypeScript mapper.

Why this is the right first move:

- Prewarm already calls `loadFastChatPromptContext`.
- Project context already uses `load_fastchat_context`.
- A single backend context loader avoids one path for prompt context and another
  path for "intelligence" context.
- One RPC can compute bounded lists with CTEs and return JSON in one round trip.
- Permissions stay backend-side and scope-specific.

### Required RPC Changes

Update `public.load_fastchat_context(...)` so:

1. Global context is membership-aware.

    It should use `current_actor_id()` and `get_onto_project_summaries_v1(...)`
    or an equivalent membership-safe accessible-project CTE. It must not rely
    only on `onto_projects.created_by = user_id`.

2. Global context can be loaded via RPC.

    `loadFastChatPromptContext` currently skips RPC for global context. After the
    RPC is membership-safe, global prewarm should use it first, with the existing
    TypeScript fallback as the recovery path.

3. The RPC returns `project_intelligence`.

    The property should be included for:
    - global payload
    - project payload
    - focused project payload, because focused context composes project context

4. The RPC keeps existing fields.

    Do not remove `projects`, `project`, `goals`, `milestones`, `plans`, `tasks`,
    `documents`, `events`, `members`, `project_logs`, `linked_entities`, or
    `entity_counts`. Existing prompt and tool behavior depends on those.

### CTE Shape

The SQL should follow this pattern:

```sql
WITH
project_summaries AS (...accessible projects...),
project_scope AS (
  SELECT *
  FROM project_summaries
  WHERE p_context_type = 'global'
     OR id = p_project_id
),
work_candidates AS (
  SELECT 'task' AS kind, ... FROM onto_tasks ...
  UNION ALL
  SELECT 'milestone' AS kind, ... FROM onto_milestones ...
  UNION ALL
  SELECT 'goal' AS kind, ... FROM onto_goals ...
  UNION ALL
  SELECT 'event' AS kind, ... FROM onto_events ...
  UNION ALL
  SELECT 'project' AS kind, ... FROM project_scope ...
),
bucketed_work AS (...bucket overdue/due_soon/upcoming...),
recent_changes AS (...onto_project_logs...),
project_signal_counts AS (...counts by project...),
project_intelligence AS (...jsonb_build_object...)
```

Important: global `work_candidates` should scan all accessible projects but only
return bounded output lists. This avoids missing an overdue item just because
its project was not in the first eight project bundles.

### TypeScript Fallback

Update the existing fallback loaders in
`apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`:

- `loadGlobalContextData`
- `loadProjectContextData`
- `buildGlobalContextFromRpc`
- `buildProjectContextFromRpc`

The fallback path should build the same `project_intelligence` shape. It can use
multiple Supabase queries if the RPC fails, but the normalized returned context
must be identical.

## Prewarm Endpoint Contract

The prewarm request shape does not need a new required field.

The default behavior should be:

```text
POST /api/agent/v2/prewarm
  -> resolve user/session/context
  -> load FastChat prompt context with project_intelligence
  -> build fastchat_context_cache entry
  -> merge into chat_sessions.agent_metadata.fastchat_context_cache when a session exists
  -> return prewarmed_context
```

Response example:

```json
{
	"success": true,
	"data": {
		"warmed": true,
		"cache_source": "fresh_load",
		"session": { "...": "..." },
		"prewarmed_context": {
			"version": 2,
			"key": "v2|global|none|none|none",
			"created_at": "2026-04-15T14:00:00.000Z",
			"context": {
				"contextType": "global",
				"entityId": null,
				"projectId": null,
				"projectName": null,
				"data": {
					"projects": [],
					"project_intelligence": {}
				}
			}
		}
	}
}
```

Increment `FASTCHAT_CONTEXT_CACHE_VERSION` because the cached context shape is
changing materially.

## Stream Endpoint Contract

The stream endpoint should keep this priority order:

1. fresh matching session metadata cache
2. verified request prewarm cache
3. fresh context load fallback

For safety, request-provided `prewarmedContext` should be treated as a cache
transport artifact from prewarm, not as user-authored context.

Recommended hardening:

- Prefer session cache whenever a session exists.
- Reject request prewarm payloads with wrong version, wrong key, or stale
  `created_at`.
- Add an HMAC signature for request prewarm payloads before relying on
  no-session draft prewarm in production.
- Never use request prewarm context for permission decisions or writes.

This keeps `/api/agent/v2/prewarm` as the canonical data builder while avoiding
trust in arbitrary client-edited JSON.

## Prompt Integration

### Lite Prompt

Update `buildLitePromptEnvelope` so the timeline section uses
`project_intelligence` first:

```text
Project status:
- summarize project_summaries and counts

Overdue or due soon:
- render project_intelligence.overdue_or_due_soon

Upcoming dated work:
- render project_intelligence.upcoming_work

Recent project changes:
- render project_intelligence.recent_changes
```

Fallback behavior:

- If `project_intelligence` is missing, read nested `projects[].recent_activity`
  for global recent changes.
- If `project_intelligence` is missing, read top-level project context arrays
  for project upcoming/due/recent changes.
- Do not render "No recent project changes are loaded" when nested
  `recent_activity` exists.

### Master Prompt

The master prompt already serializes context data. It does not need a new
section in the first pass. The new `project_intelligence` JSON is enough.

If later prompt dumps show the model ignores the JSON, add a compact markdown
summary block to the master prompt as a separate change.

## Cache And Invalidation

Keep the short TTL. Current cache TTL is two minutes; that is reasonable for
prewarm because overdue/due-soon/recent-change context is operationally fresh
enough but not long-lived.

Invalidate or refresh context after:

- successful agent write tool result
- context shift
- dashboard manual refresh, only by causing a new prewarm, not by injecting
  dashboard data
- cache TTL expiry
- project selection change
- focused entity change

If the agent writes during a stream turn, the next turn should not reuse the old
project intelligence snapshot.

## Observability

Prompt snapshots and local prompt dumps should expose:

- `project_intelligence.counts`
- list lengths for overdue/due-soon, upcoming, recent changes
- `maybe_more` flags
- cache source: `session_cache`, `request_prewarm`, `fresh_load`
- cache age seconds
- whether the lite timeline section used `project_intelligence` or fallback
  nested context

This should make bad prompts obvious. A prompt dump should not require reading
the full raw JSON to know whether recent changes were loaded.

## Performance Requirements

Target budgets:

- Prewarm should perform one primary context RPC in the normal path.
- Global prewarm should not issue one query per project.
- `project_intelligence` should add bounded JSON only; target under 20 KB.
- Total prewarmed context should remain comfortably below existing prompt
  budgets.
- SQL should use project-scope CTEs and indexed filters, not unbounded table
  scans.

Index review required before implementation:

- `onto_tasks(project_id, due_at)` with `deleted_at IS NULL`
- `onto_milestones(project_id, due_at)` with `deleted_at IS NULL`
- `onto_goals(project_id, target_date)` with `deleted_at IS NULL`
- `onto_events(project_id, start_at)` with `deleted_at IS NULL`
- `onto_project_logs(project_id, created_at DESC)`

If any are missing, add targeted indexes in the same migration or a prerequisite
migration.

## Implementation Plan

### Phase 1: Types And Prompt Fallback

1. Add `FastChatProjectIntelligence` types to `context-models.ts`.
2. Extend `GlobalContextData` and `ProjectContextData` with optional
   `project_intelligence`.
3. Update lite prompt timeline logic to consume `project_intelligence`.
4. Add fallback logic for nested `projects[].recent_activity`.
5. Add tests proving the prompt no longer shows false empty lines when global
   nested activity exists.

This phase can ship before SQL changes because it fixes the current prompt dump
bug.

### Phase 2: RPC And Loader

1. Update `load_fastchat_context.sql`.
2. Add a Supabase migration replacing `public.load_fastchat_context(...)`.
3. Make global context use the RPC first in `loadFastChatPromptContext`.
4. Update RPC mappers and TypeScript fallback builders to normalize
   `project_intelligence`.
5. Increment `FASTCHAT_CONTEXT_CACHE_VERSION`.

### Phase 3: Prewarm/Stream Hardening

1. Ensure prewarm stores the new context in session metadata whenever a session
   exists.
2. Ensure stream prefers session cache.
3. Add version/key/staleness tests for request prewarm payloads.
4. Optionally add an HMAC signature to request prewarm payloads before relying
   on no-session draft prewarm for this richer context.

### Phase 4: Observability

1. Add project intelligence summary fields to prompt snapshot sections.
2. Add prompt dump lines showing list lengths and `maybe_more`.
3. Add timing metric tags for project intelligence source and list sizes.

## Test Plan

Unit tests:

- `buildLitePromptEnvelope` renders global `projects[].recent_activity` as
  recent project changes when `project_intelligence` is absent.
- `buildLitePromptEnvelope` renders `project_intelligence.overdue_or_due_soon`.
- `buildLitePromptEnvelope` renders `project_intelligence.upcoming_work`.
- `buildLitePromptEnvelope` renders `project_intelligence.recent_changes`.
- Context cache version mismatch causes fresh load.

Loader tests:

- Global RPC payload maps `project_intelligence` into `GlobalContextData`.
- Project RPC payload maps `project_intelligence` into `ProjectContextData`.
- Fallback global loader builds the same shape.
- Fallback project loader builds the same shape.

API tests:

- `/api/agent/v2/prewarm` global response includes `project_intelligence`.
- `/api/agent/v2/prewarm` project response includes project-scoped
  `project_intelligence`.
- Prewarm writes the enriched context cache into session metadata.
- Stream uses fresh matching session cache and does not call the context loader.
- Stream rejects stale or mismatched request prewarm context.

SQL tests/manual verification:

- Global scope includes shared/member projects, not only owned projects.
- Global overdue/due-soon list includes items from projects outside the visible
  top project bundle when those items are more urgent.
- Project scope excludes changes/work from other projects.
- Counts remain accurate when output lists are limited.

## Acceptance Criteria

- A global lite prompt dump with loaded recent activity no longer says "No
  recent project changes are loaded."
- Global prewarm returns recent changes across accessible projects.
- Global prewarm returns overdue/due-soon work across accessible projects.
- Global prewarm returns upcoming dated work across accessible projects.
- Project prewarm returns only selected-project recent changes, overdue/due-soon
  work, and upcoming dated work.
- The stream endpoint can use the enriched prewarmed session cache without an
  extra context load.
- Prompt snapshots show enough project intelligence metadata to debug missing or
  empty sections quickly.

## Open Questions

- Should upcoming work include future tasks without `due_at` but with
  `start_at`, or should `start_at` be limited to events and explicit scheduled
  tasks only?
- Should recent changes include deletes/archive events in addition to created
  and updated? First pass should not, but the log shape can support it later.
- Should due-soon be seven days everywhere, or should user preference/timezone
  eventually control the window?
- Should request prewarm HMAC be implemented in the same phase as the richer
  snapshot, or immediately after?
