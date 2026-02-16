<!-- apps/web/docs/technical/audits/FASTCHAT_V2_ONTOLOGY_SCOPING_AND_DOCUMENT_SNAPSHOT_AUDIT_2026-02-16.md -->

# FastChat V2 Ontology Scoping + Document Snapshot Audit

Date: 2026-02-16  
Scope: Agentic Chat V2 project-context ontology payloads, relevance scoping, completeness signaling, and document snapshot coverage.

## Executive Summary

The event-window improvement is implemented and working: project events are scoped to **past 7 days / next 14 days** and surfaced with `events_window` metadata.  
For all other core entities (goals, milestones, plans, tasks), FastChat V2 currently uses **soft-delete filtering + fixed cap**, but no explicit relevance ranking beyond `updated_at`, no completion/exhaustiveness signaling, and no model-visible indication of what was omitted.

Main gaps:

1. The model cannot reliably tell whether a list is complete or truncated.
2. Documents are only represented via `doc_structure`; there is no top-level `documents` snapshot list.
3. Current ranking favors recency (`updated_at`) over actionable relevance (state, due/target windows, unlinked docs, etc.).
4. Project context caching (2 minutes) is opaque to the model; snapshot freshness is not explicit.

## What Is Implemented Today

### Context loading path

- V2 stream handler loads prompt context with `loadFastChatPromptContext` and injects it into `<data><json>...</json></data>` in the master prompt.
- Context is cached in session metadata for 2 minutes.

References:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:57`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:1821`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:1887`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:1368`
- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts:140`

### Entity inclusion/filtering in project context

From `context-loader` + `load_fastchat_context`:

- `goals`: filtered by `deleted_at IS NULL`, then app-side cap/sort (`updated_at desc`) to 12.
- `milestones`: filtered by `deleted_at IS NULL`, cap/sort (`updated_at desc`) to 12.
- `plans`: filtered by `deleted_at IS NULL`, cap/sort (`updated_at desc`) to 12.
- `tasks`: filtered by `deleted_at IS NULL`, cap/sort (`updated_at desc`) to 18.
- `events`: filtered by window + `deleted_at IS NULL`, then cap/sort (`start_at asc`) to 16.
- `members`: included (`removed_at IS NULL`), role-ordered.
- `documents`: **not included as a top-level list**.
- `doc_structure`: included.

References:

- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:38`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:593`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:744`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:1002`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:1025`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:1075`
- `apps/web/src/lib/services/agentic-chat-v2/context-models.ts:135`

### Event window behavior

- Loader builds canonical UTC event window: `past_days = 7`, `future_days = 14`.
- SQL RPC also enforces the same event range.
- Prompt instructions explicitly tell model to use `cal.event.list(timeMin,timeMax)` for out-of-window events.

References:

- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:35`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:421`
- `supabase/migrations/20260424000007_timebox_fastchat_context_events.sql:188`
- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts:29`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.test.ts:170`

### Prompt-dump confirmation (runtime sample)

In the current prompt dump:

- `plans` include `state_key: "completed"` entries.
- `tasks` include older-start tasks (January) because ranking is by `updated_at`.
- `events_window` is present.
- no `documents` array is present in `data`.

References:

- `apps/web/.prompt-dumps/fastchat-2026-02-16T01-44-18-667Z.txt:143`
- `apps/web/.prompt-dumps/fastchat-2026-02-16T01-44-18-667Z.txt:147`
- `apps/web/.prompt-dumps/fastchat-2026-02-16T01-44-18-667Z.txt:181`
- `apps/web/.prompt-dumps/fastchat-2026-02-16T01-44-18-667Z.txt:423`

## Key Findings

### 1) Completeness is not represented

There is no payload contract saying whether each entity list is complete or truncated.  
The model receives arrays but not:

- total available count
- limit applied
- whether omitted entities exist
- filter/sort rationale used to select shown rows

Impact: the model cannot confidently answer “show all X” vs “this is a scoped snapshot”; it must guess.

### 2) Documents are under-specified for the use case

`doc_structure` is present, but there is no direct `documents` snapshot list.  
This creates blind spots for:

- unlinked documents not represented in structure
- recently created/updated docs not obvious from tree snapshot
- fast “what docs exist right now?” queries

Notable mismatch: downstream summarization already supports `record.documents` if it exists.

References:

- `apps/web/src/lib/services/agentic-chat-v2/context-models.ts:135`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:607`

### 3) Relevance ranking is too shallow for non-events

Current selection for tasks/goals/plans/milestones is primarily `updated_at`.  
This can prefer recently edited but low-importance items over currently actionable work (e.g., overdue or near-due items).

### 4) Completed entities are not excluded by default

The current loader/RPC does not exclude completed tasks/plans/goals.  
Only soft-deleted rows are excluded.

References:

- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:1003`
- `supabase/migrations/20260424000007_timebox_fastchat_context_events.sql:145`

### 5) Fetch-then-trim strategy is inefficient at scale

RPC returns full project arrays, then app code trims to limits.  
This is fine on small projects but inefficient for large projects and makes ranking logic harder to centralize.

References:

- `supabase/migrations/20260424000007_timebox_fastchat_context_events.sql:145`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:744`

### 6) Snapshot freshness is not explicit to the model

Context is cached for 2 minutes, but freshness/source metadata is not surfaced in prompt data.

References:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:57`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:1822`

## Recommended Data Contract Upgrade

Add a `context_meta` block inside prompt `data` for every project context.

Suggested shape:

```json
{
	"context_meta": {
		"generated_at": "2026-02-16T01:44:18.667Z",
		"source": "rpc",
		"cache_age_seconds": 0,
		"entity_scopes": {
			"tasks": {
				"returned": 18,
				"total_matching": 64,
				"limit": 18,
				"is_complete": false,
				"selection_strategy": "task_priority_v1",
				"filters": {
					"deleted": "excluded",
					"states": "all",
					"window": null
				}
			},
			"events": {
				"returned": 4,
				"total_matching": 4,
				"limit": 16,
				"is_complete": true,
				"selection_strategy": "start_at_asc",
				"filters": {
					"deleted": "excluded",
					"start_at_window": {
						"start_at": "2026-02-09T01:43:06.219Z",
						"end_at": "2026-03-02T01:43:06.219Z",
						"past_days": 7,
						"future_days": 14
					}
				}
			},
			"documents": {
				"returned": 20,
				"total_matching": 27,
				"limit": 20,
				"is_complete": false,
				"unlinked_total": 4
			}
		}
	}
}
```

Result: the model can explicitly say “this is partial” and decide when to call tools.

## Recommended Priority System (V1)

Use a score-based selection instead of pure `updated_at` for project snapshot lists.

### Tasks

Priority signals:

- state (`in_progress`, `blocked`, `todo`, `done`)
- overdue / due soon / no due date
- explicit `priority`
- recent updates
- recently completed (small keepalive slice)

Suggested behavior:

- default include: open tasks + recently completed (last 7 days)
- hard cap still applied (e.g. 18 or 24)
- tie-break with `updated_at desc`

### Plans

Priority signals:

- non-completed first
- plans with active child tasks first
- recent updates as tie-breaker

### Goals

Priority signals:

- non-completed first
- target date proximity
- recent updates

### Milestones

Priority signals:

- overdue/upcoming due dates first
- non-completed first
- recent updates

### Events

Keep current window and ordering (already solid).

## Recommended Document Snapshot Addition

Add top-level `documents` in project context data (in addition to `doc_structure`).

Suggested lightweight fields:

- `id`
- `title`
- `state_key`
- `created_at`
- `updated_at`
- `in_doc_structure` (boolean)
- `is_unlinked` (boolean)

Selection strategy:

- rank unlinked docs first
- then recently updated/created
- cap list (e.g. 20)
- include counts in `context_meta.entity_scopes.documents`

Implementation note: `collectDocStructureIds` already exists and can classify linked vs unlinked docs.

Reference:

- `apps/web/src/lib/services/agentic-chat-v2/context-models.ts:187`

## Prompt Contract Updates Needed

Add instruction language telling the model to:

1. Read `context_meta.entity_scopes` before assuming completeness.
2. If `is_complete=false`, state that context is partial and fetch additional data via tools when user asks for “all” or full history.
3. Continue current event-window escape hatch (`cal.event.list` with `timeMin/timeMax`).

Current prompt only documents event window scope, not non-event scope/completeness semantics.

Reference:

- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts:29`

## Concrete File-Level Change Plan

### Phase 1: Data shape + loader logic

1. Update `ProjectContextData` types:
    - Add `documents: LightDocument[]`
    - Add `context_meta` + per-entity scope metadata.
2. Update `context-loader.ts`:
    - Build per-entity scope metadata (`returned`, `total_matching`, `limit`, `is_complete`, strategy, filters).
    - Add `mapDocument` and document snapshot ranking.
3. Update RPC response handling to include documents in payload.
4. Update fallback query path to load documents and compute unlinked counts.

Target files:

- `apps/web/src/lib/services/agentic-chat-v2/context-models.ts`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`

### Phase 2: SQL RPC alignment

1. Extend `load_fastchat_context` to return `documents` (and optionally counts to avoid extra queries).
2. Keep app-side guardrails, but push ranking/limit logic to SQL when stable.
3. Update shared SQL snapshot file.

Target files:

- `supabase/migrations/<new_migration>.sql`
- `packages/shared-types/src/functions/load_fastchat_context.sql`

### Phase 3: Prompt and summarizer alignment

1. Update master prompt instructions for completeness behavior.
2. Ensure context summary includes scope/completeness.

Target files:

- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts`

## Test Plan

Add/extend tests for:

1. `context-loader`:
    - documents snapshot included
    - unlinked docs surfaced
    - scope metadata marks truncated vs complete
    - priority ordering rules (task/plan/goal/milestone/document)
2. prompt builder:
    - completeness instruction text present
3. integration prompt dump:
    - `documents` present
    - `context_meta.entity_scopes.*` present
    - `events_window` preserved

Base test file:

- `apps/web/src/lib/services/agentic-chat-v2/context-loader.test.ts`

## Priority Order for Implementation

1. Add completeness metadata (`context_meta`) first.
2. Add documents snapshot second.
3. Introduce scoring-based relevance ranking third.
4. Move ranking/limits deeper into RPC for performance fourth.

This sequencing gives immediate model-behavior gains with low regression risk.

## Final Assessment

The V2 event scoping change is correct and valuable.  
The next high-impact improvements are:

1. explicit completeness/snapshot metadata for each entity list, and
2. explicit document snapshot data (including unlinked/recent docs),

followed by a relevance scoring system for non-event entities.
