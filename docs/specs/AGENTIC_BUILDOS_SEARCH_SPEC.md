<!-- docs/specs/AGENTIC_BUILDOS_SEARCH_SPEC.md -->

# Agentic BuildOS Search Spec

## Status

| Attribute | Value                                                                           |
| --------- | ------------------------------------------------------------------------------- |
| Status    | Draft                                                                           |
| Created   | 2026-03-27                                                                      |
| Owner     | Platform                                                                        |
| Scope     | Agent-first BuildOS retrieval, ontology search, tool surface, indexing, ranking |

---

## Summary

This spec defines an agent-first search system for BuildOS.

The primary requirement is simple:

- AI agents need a very small, very understandable search surface.
- Search must be fast in both cross-project and single-project flows.
- Search must reliably find BuildOS entities without forcing the agent to guess which low-level tool to use.

The primary agent-facing search tools in this spec are:

1. `search_buildos`: broad search across accessible projects
2. `search_project`: scoped search within a single project

Everything else in this spec exists to make those two tools good:

- canonical result shape
- broader entity coverage
- hybrid ranking
- denormalized indexing
- document/content chunking
- relationship-aware hints
- migration away from fragmented legacy search paths

---

## References

- `apps/web/docs/features/agentic-chat/README.md`
- `apps/web/docs/features/agentic-chat/TOOL_API_MAPPING.md`
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts`
- `apps/web/src/routes/api/onto/search/+server.ts`
- `packages/shared-types/src/functions/onto_search_entities.sql`
- `packages/shared-types/src/functions/load_fastchat_context.sql`
- `docs/technical/web-search-tooling.md`

---

## Problem

BuildOS currently has the raw ingredients for agentic retrieval, but not a clean agentic search system.

Current issues:

- Search is fragmented between legacy tables and ontology tables.
- The current "global fuzzy" ontology search is not actually global enough.
- Projects are not part of the same cross-entity search path as tasks, goals, plans, and documents.
- Several search tools are simple `ILIKE` wrappers and do not search enough content.
- Result shapes differ across tools, which makes agent reasoning and follow-up actions more complex than necessary.
- Fast context snapshots are intentionally partial, so the agent must rely on search often. That fallback needs to be excellent.

The result is that the agent can sometimes find things quickly, but not reliably enough across multiple projects or within a large project.

---

## Goals

1. Give the agent two simple primary search tools.
2. Make project-scoped and cross-project search fast enough to use constantly.
3. Cover all core BuildOS entities needed for agent workflows.
4. Return a stable, typed result envelope that is easy for an LLM to use.
5. Support progressive disclosure: search first, then fetch details only for shortlisted results.
6. Keep the tool definition simple while allowing richer indexing and ranking behind the scenes.
7. Reduce the number of search-related tool choices the agent must reason about.
8. Make the agent's default retrieval behavior obvious and promptable.

---

## Non-Goals (Phase 1)

- Replacing detail tools such as `get_onto_*_details`
- Replacing external web search (`web_search`, `web_visit`)
- Building a human-first advanced filter UI before the agentic API is settled
- Solving every knowledge retrieval use case in one release
- Cross-user or org-wide federated search beyond current access rules
- Full natural-language analytics queries ("what trends are emerging across all work this quarter?")

---

## Design Principles

1. Two-tool primary surface
2. Stable result contract
3. Search first, detail second
4. Same backend for workspace and project search
5. Fast defaults, richer expansion only when needed
6. Type-aware and project-aware results
7. Hybrid ranking hidden behind a simple tool interface
8. Canonical search service, not many bespoke search paths
9. Compatibility during migration, simplicity at the end state

---

## Primary Agent Tool Surface

These are the two tools agents should learn first and use most of the time.

### 1) `search_buildos`

Broad search across all accessible projects.

Use when:

- the user did not specify a project
- the current chat context is global
- the agent needs to find where something lives
- the user asks a cross-project question

Parameters:

- `query: string` required
- `limit: number` optional, default `10`, max `25`
- `types: string[]` optional

Allowed `types` in phase 1:

- `project`
- `task`
- `goal`
- `plan`
- `milestone`
- `document`
- `risk`
- `requirement`
- `image`

### 2) `search_project`

Scoped search inside one project.

Use when:

- the current chat already has a `project_id`
- the user is clearly working inside one project
- the agent needs faster, narrower retrieval

Parameters:

- `project_id: string` required
- `query: string` required
- `limit: number` optional, default `10`, max `25`
- `types: string[]` optional

Allowed `types` are the same as `search_buildos`.

### Tool Simplicity Rule

The default agent prompt should treat these as the primary search tools.

The agent should not need to choose among:

- `search_onto_tasks`
- `search_onto_projects`
- `search_onto_documents`
- `search_ontology`
- additional entity-specific search variants

Those can remain as compatibility or secondary tools, but the main mental model for the agent should be:

1. broad search across BuildOS
2. scoped search within a project

### Minimal Tool Definitions (MVP)

`search_buildos`

```json
{
	"name": "search_buildos",
	"parameters": {
		"type": "object",
		"properties": {
			"query": { "type": "string" },
			"limit": { "type": "number" },
			"types": {
				"type": "array",
				"items": { "type": "string" }
			}
		},
		"required": ["query"]
	}
}
```

`search_project`

```json
{
	"name": "search_project",
	"parameters": {
		"type": "object",
		"properties": {
			"project_id": { "type": "string" },
			"query": { "type": "string" },
			"limit": { "type": "number" },
			"types": {
				"type": "array",
				"items": { "type": "string" }
			}
		},
		"required": ["project_id", "query"]
	}
}
```

These should stay minimal. Extra knobs such as archived filters, recency windows, relation filters, and ranking modes should remain backend concerns or secondary tools unless proven necessary.

---

## Canonical Result Contract

Both primary tools must return the same shape.

```json
{
	"query": "onboarding flow",
	"search_scope": "workspace",
	"project_id": null,
	"total_returned": 5,
	"maybe_more": true,
	"results": [
		{
			"type": "document",
			"id": "uuid",
			"project_id": "uuid",
			"project_name": "Marketing Site Refresh",
			"title": "Onboarding Flow Spec",
			"snippet": "Defines the first-run experience, welcome sequence, and setup handoff...",
			"state_key": "draft",
			"type_key": "document.spec.product",
			"path": "Product > Onboarding > Onboarding Flow Spec",
			"matched_fields": ["title", "content", "heading"],
			"why_matched": "Matched document title and body content",
			"score": 0.91,
			"updated_at": "2026-03-27T11:24:00Z"
		}
	]
}
```

### Required Result Fields

- `type`
- `id`
- `project_id`
- `project_name`
- `title`
- `snippet`
- `score`
- `updated_at`

### Strongly Recommended Result Fields

- `state_key`
- `type_key`
- `path`
- `matched_fields`
- `why_matched`

### Result Contract Rules

- Every result must be typed.
- Every result must identify the owning project when applicable.
- Every result must give the agent enough information to choose the next detail tool.
- Snippets must be short and citation-like, not full bodies.
- `path` is especially important for documents.
- `why_matched` should be short and machine-usable, not verbose prose.

---

## Entity Coverage

### Phase 1 Required Coverage

- `project`
- `task`
- `goal`
- `plan`
- `milestone`
- `document`
- `risk`
- `requirement`
- `image`

### Phase 2 Expansion Targets

- `decision`
- `source`
- `comment`
- `event`
- `metric`
- `insight`
- `signal`

### Coverage Rule

If an entity can materially affect planning or execution, the agent should be able to discover it through the primary search surface.

---

## Search Modes

### Workspace Search

Workspace search is broad by default.

Expected behavior:

- search across all accessible projects
- include projects themselves as first-class hits
- return mixed entity types
- preserve relevance while preventing one type from crowding out everything else

Typical queries:

- "find the onboarding plan"
- "which project has the API migration work?"
- "search for the launch checklist"
- "find goals about retention"

### Project Search

Project search is the same engine with a hard `project_id` scope.

Expected behavior:

- search all indexed material within a single project
- outperform workspace search on latency and precision
- boost entities closely related to the current project context

Typical queries:

- "find the auth document"
- "search for payment bugs"
- "find the milestone about beta launch"

---

## Secondary Follow-Up Tools

The primary search tools should hand off to detail and expansion tools.

Existing follow-up tools that remain valuable:

- `get_onto_project_details`
- `get_onto_task_details`
- `get_onto_goal_details`
- `get_onto_plan_details`
- `get_onto_document_details`
- `get_onto_milestone_details`
- `get_onto_risk_details`
- `get_document_tree`
- `get_document_path`
- `get_linked_entities`

Recommended additions:

- `batch_get_entities`
- `expand_related_entities`

Search should shortlist. Detail tools should explain.

---

## Recommended Internal Architecture

### Canonical Search Backend

Build one canonical backend service for BuildOS search.

Suggested internal entry point:

- service or RPC name: `onto_search_v2`

Primary tools become thin wrappers:

- `search_buildos` -> `onto_search_v2(project_id = null, ...)`
- `search_project` -> `onto_search_v2(project_id = <uuid>, ...)`

### Compatibility Layer

Existing tools can remain temporarily:

- `search_ontology`
- `search_onto_projects`
- `search_onto_tasks`
- `search_onto_goals`
- `search_onto_plans`
- `search_onto_documents`
- `search_onto_milestones`
- `search_onto_risks`

But they should either:

- call the canonical backend internally, or
- be demoted from primary prompt guidance

End state:

- agents mainly learn `search_buildos`
- agents mainly learn `search_project`

### Gateway Alignment

Direct mode should expose:

- `search_buildos`
- `search_project`

Gateway mode should expose either:

- `onto.search.workspace`
- `onto.search.project`

or one internal op:

- `onto.search`

If one internal op is used, prompt-facing discovery should still present two simple search actions to the agent:

- search across BuildOS
- search within this project

---

## Ranking Model

The tool surface is simple. The ranking model does not need to be.

### Hybrid Ranking Components

Suggested blended score:

- lexical full-text rank: `0.45`
- fuzzy title/alias similarity: `0.20`
- embedding similarity: `0.20`
- structural relevance: `0.10`
- recency: `0.05`

### Structural Relevance Signals

- same project as current scope
- exact entity type match when `types` filter is present
- entity is active or in-progress
- entity is linked to the project's context document
- entity is linked to the focused task/goal/plan when such context exists
- document appears in `doc_structure`

### Diversity Rule

When no explicit `types` filter is present:

- avoid returning 10 documents if 3 high-quality tasks and 2 projects are also relevant
- apply soft per-type caps in the top results

This improves agent decision-making.

---

## Indexing Strategy

### Phase 1

Use the existing ontology tables and `search_vector` fields where available, while fixing coverage gaps and normalizing behavior.

Required immediate changes:

- add project indexing equivalent to `search_vector`
- include projects in canonical search
- include risks and requirements in canonical search
- expose images consistently
- stop relying on title-only `ILIKE` search for high-value entities

### Phase 2

Introduce a denormalized search index optimized for agentic retrieval.

Suggested tables:

1. `onto_search_index`
2. `onto_search_chunks`

### `onto_search_index`

One row per searchable entity.

Suggested fields:

- `entity_id`
- `entity_type`
- `project_id`
- `project_name`
- `title`
- `summary`
- `search_text`
- `search_vector`
- `embedding`
- `state_key`
- `type_key`
- `path`
- `aliases`
- `metadata`
- `updated_at`

### `onto_search_chunks`

Chunked search rows for large content-bearing entities.

Use for:

- document bodies
- OCR text from images
- long risk content
- long requirement text
- future comments, decisions, sources

Suggested fields:

- `entity_id`
- `entity_type`
- `project_id`
- `chunk_index`
- `heading_path`
- `chunk_text`
- `search_vector`
- `embedding`
- `updated_at`

### Chunking Rule

Large content should not be searched only as one giant row.

Documents should be indexed by:

- title
- description
- markdown headings
- path in `doc_structure`
- content chunks

---

## Search Source Fields by Entity

### Projects

Search on:

- `name`
- `description`
- `next_step_short`
- `next_step_long`
- `props`
- linked context document title
- linked context document summary or chunks
- top goal/plan/task names if denormalized

### Tasks

Search on:

- `title`
- `description`
- `props`
- linked plan name
- linked goal name
- linked milestone title
- linked document titles

### Goals

Search on:

- `name`
- `description`
- `goal`
- `props`

### Plans

Search on:

- `name`
- `description`
- `plan`
- `props`

### Milestones

Search on:

- `title`
- `description`
- `milestone`
- `props`

### Documents

Search on:

- `title`
- `description`
- headings
- body chunks
- document path
- `type_key`
- linked task/goal/plan names

### Risks

Search on:

- `title`
- `content`
- `impact`
- `props`

### Requirements

Search on:

- `text`
- `type_key`
- `props`

### Images

Search on:

- `caption`
- `alt_text`
- `original_filename`
- `extraction_summary`
- `extracted_text`

---

## Query Processing Flow

1. Receive `search_buildos` or `search_project`
2. Normalize the query
3. Resolve scope and access
4. Query canonical search backend
5. Blend lexical, fuzzy, semantic, and structural scores
6. Apply result diversity rules
7. Build short snippets and `why_matched`
8. Return the stable result envelope
9. Let the agent call detail tools only for top candidates

---

## Agent Guidance

### Default Search Behavior

The agent should follow this sequence:

1. If `project_id` is known and the user is talking about one project, call `search_project`.
2. Otherwise call `search_buildos`.
3. If one result is clearly the target, fetch details.
4. If several results are plausible, present the best few or expand with batch detail reads.
5. Only after the target is resolved should the agent mutate anything.

### Prompt Guidance

Prompt guidance should explicitly prefer:

- `search_project` in project context
- `search_buildos` in global context

Prompt guidance should stop treating many specialized search tools as the normal entry point.

---

## Performance Targets

### Latency Targets

- `search_project`: p50 under `150ms`, p95 under `400ms`
- `search_buildos`: p50 under `250ms`, p95 under `700ms`

### Agent Workflow Targets

- one search call should usually be enough to resolve the next detail call
- common "find the thing" turns should take 1 search + 1 detail call
- prompt/tool selection should get simpler, not more complex

---

## Success Metrics

- higher top-3 precision for known-entity queries
- fewer follow-up search calls per agent turn
- lower rate of wrong-entity writes after fuzzy lookup
- lower tool-count per successful retrieval task
- improved cross-project discovery success
- improved project-scoped retrieval latency

Suggested tracked metrics:

- search latency
- search result click-through or follow-up detail fetch rate
- entity resolution success rate
- top result correctness on benchmark queries
- average search tool calls per agent task

---

## Rollout Plan

### Phase 1: Agent-First MVP

- introduce `search_buildos`
- introduce `search_project`
- unify canonical result shape
- extend coverage to `project`, `risk`, `requirement`, and `image`
- add project indexing
- route current search tools through one backend where feasible
- update prompt guidance to make these two tools primary

### Phase 2: Search Quality Upgrade

- add denormalized search index
- add chunk-level indexing
- add embeddings to ontology search
- improve `why_matched`, `path`, and structural boosts

### Phase 3: Expansion and Optimization

- add decisions, sources, comments, events, metrics, insights, signals
- add `batch_get_entities`
- add `expand_related_entities`
- add benchmark suite and search quality dashboards

---

## Migration Notes

The system should move toward:

- two primary agent search tools
- one canonical BuildOS search backend

The system should move away from:

- fragmented legacy search paths
- title-only search for high-value entities
- multiple inconsistent search result envelopes

Backward compatibility can be preserved temporarily, but prompt and runtime guidance should already bias toward the new primary tools.

---

## Open Questions

1. Should `decision`, `source`, and `comment` be phase 1 or phase 2?
2. Should `include_archived` remain hidden in phase 1 for tool simplicity?
3. Do we want a separate `resolve_entity` tool, or should search results be strong enough to make that unnecessary for most turns?
4. Should search return grouped counts by entity type in the initial response?
5. Should project search boost the currently focused entity neighborhood when a focus entity is loaded?

---

## Recommendation

Start with the smallest agent-facing change and the biggest backend payoff:

1. define `search_buildos`
2. define `search_project`
3. make them the preferred search tools in prompts
4. unify the backend so both run on the same search engine
5. expand coverage to all phase 1 entity types

That gets agentic search simple first, then powerful.
