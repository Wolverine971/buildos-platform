<!-- docs/specs/AGENTIC_CHAT_PROJECT_CONTEXT_ENRICHMENT_SPEC.md -->

# Agentic Chat Project Context Enrichment (Complementary Spec)

## Status

| Attribute | Value |
| --- | --- |
| Status | Draft |
| Created | 2026-01-XX |
| Owner | BuildOS |
| Scope | Agentic chat ontology context |
| Complementary To | `docs/specs/PROJECT_CONTEXT_ENRICHMENT_SPEC.md` |

## Summary

This spec expands agentic chat context to surface richer, entity-specific summaries and a lightweight project graph snapshot. It aligns agentic chat context with daily brief enrichment patterns and ontology data models, while preserving progressive disclosure and token discipline. Each entity now has a "data light" and "data full" representation.

## References

- `docs/specs/PROJECT_CONTEXT_ENRICHMENT_SPEC.md`
- `docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md`
- `apps/web/docs/features/ontology/DATA_MODELS.md`
- `docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md`
- `docs/specs/PROJECT_GRAPH_ENHANCEMENTS_SPEC.md`
- `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts`
- `apps/worker/src/workers/brief/ontologyPrompts.ts`
- `apps/web/src/lib/services/ontology-context-loader.ts`
- `apps/web/src/lib/services/context/context-formatters.ts`

## Problem Statement

The current agentic chat project context uses a flat, minimal snapshot that omits important entity fields and graph structure. This leads to weaker grounding and forces the agent to overuse detail tools for common questions. Daily brief enrichment already selects higher-signal columns; agentic chat should align with those data choices and expand them per entity.

## Goals

- Provide richer, entity-specific summaries without overwhelming tokens.
- Expose a lightweight, JSON-friendly project graph snapshot for semantic grounding.
- Distinguish "connected by direct edge" from "project_id membership".
- Provide "data light" and "data full" versions per entity type.
- Align with daily brief data selection and ontology data models.

## Non-Goals

- Replace existing detail tools (get_onto_*_details).
- Send raw full JSON rows to the LLM by default.
- Remove progressive disclosure; this spec preserves it.

## Baseline: Daily Brief Data Surfaced Today

Daily brief loads a minimal column set per entity and then formats only a subset in prompts.

### Daily Brief Loader Column Set (Current)

- Projects: `id, name, state_key, type_key, description, next_step_short, next_step_long, updated_at, created_by`
- Tasks: `id, title, project_id, state_key, type_key, priority, due_at, start_at, updated_at, created_at`
- Goals: `id, name, project_id, state_key, created_at, target_date`
- Plans: `id, project_id, state_key`
- Milestones: `id, project_id, title, due_at, state_key, created_at`
- Risks: `id, project_id, title, impact, state_key, created_at`
- Documents: `id, project_id, updated_at`
- Outputs: `id, project_id, name, state_key, updated_at, created_at`
- Requirements: `id, project_id, text, created_at`
- Decisions: `id, project_id, title, decision_at, created_at`
- Edges: `id, project_id, src_id, dst_id, src_kind, dst_kind, rel`

### Daily Brief Prompt Usage (Current)

- Goals: name + progress percent + status + target summary.
- Outputs: name + state + linked goals + updated_at.
- Tasks: title + priority + work mode (from type_key).
- Risks: title + impact.
- Requirements: text.
- Decisions: title.
- Project details: facet stage/scale/context + next steps + counts.

## Required Changes (From Comments and New Requirements)

1. Project header must include richer fields (description snippet, next steps, timeline, facets).
2. Project highlights must surface more columns per entity (not just title and dates).
3. All goals, documents, and outputs should be included by project_id and marked if directly linked by edges.
4. Other entities should be edge-driven (direct edges), with visibility into unlinked counts.
5. Provide a lightweight graph JSON snapshot for agentic chat context.
6. Define "data light" and "data full" for every ontology entity.

## Context Payloads by Chat Context Type

### Global Context (Light)

Project list entries should include:

- `id`
- `name`
- `state_key`
- `type_key`
- `description` (truncate to 150 chars)
- `next_step_short`
- `start_at`, `end_at`
- `updated_at`
- `facet_context`, `facet_scale`, `facet_stage`

### Project Workspace Context (Light)

1) Project header (light)  
2) Project graph (light JSON)  
3) Entity slices (light)  
4) Edge coverage diagnostics  

### Project Workspace with Focused Entity (Light)

1) Project header (light)  
2) Focused entity (light)  
3) Focused entity relationships (light)  
4) Linked entities (light)  
5) Optional graph snapshot (light JSON)

### Full Context (On Demand)

Full context is the complete entity row (including props, description/content) plus full graph data. It should be accessed via tools or on-demand expansion:

- `get_onto_*_details` for entity rows.
- `get_entity_relationships` for edges.
- Optional "get_project_graph_full" (new tool) to return serialized project graph.

## Project Header Fields (Light)

Project header should include the following fields in agentic chat:

- `id`
- `name`
- `description` (truncate 150 chars)
- `state_key`
- `type_key`
- `facet_context`, `facet_scale`, `facet_stage`
- `start_at`, `end_at`
- `next_step_short`
- `next_step_long` (truncate 200 chars, optional)
- `updated_at`, `created_at`
- `context_document_id` (if present)
- `context_document_title` (if available from document lookup)
- `entity_counts` (tasks, goals, outputs, risks, decisions, requirements)

## Project Graph Snapshot (Light JSON)

The LLM should receive a lightweight graph representation to convey structure. Use a small JSON block with capped nodes and edges.

### Graph Light Schema

```json
{
  "project_id": "uuid",
  "nodes": [
    {
      "id": "uuid",
      "kind": "goal",
      "name": "Increase retention",
      "state_key": "active",
      "type_key": "goal.metric.target",
      "direct_edge": true,
      "last_updated": "2026-01-01"
    }
  ],
  "edges": [
    {
      "id": "uuid",
      "src_id": "uuid",
      "src_kind": "project",
      "dst_id": "uuid",
      "dst_kind": "goal",
      "rel": "has_goal"
    }
  ],
  "coverage": {
    "goals": { "total": 8, "direct": 6 },
    "documents": { "total": 12, "direct": 4 },
    "outputs": { "total": 5, "direct": 5 }
  }
}
```

### Graph Light Rules

- Include all nodes that appear in slices (see selection rules below).
- Mark `direct_edge: true` when an edge connects the project to the node.
- Cap edges at 50 and nodes at 80 by default.
- Include coverage counts for goals/documents/outputs (and optionally tasks).

## Entity Selection Rules

### Always Include by project_id (even if no direct edge)

- Goals
- Documents
- Outputs

These must be marked with a `direct_edge` flag so missing edges are visible.

### Include Only Direct Edges to Project

- Risks
- Decisions
- Requirements
- Milestones
- Plans
- Tasks
- Signals
- Insights

If there are project_id entities with no direct edge, include an "unlinked count" metric in coverage.

## Entity Field Specifications

Each entity has a light and full representation. Light is used in context snapshots and graph nodes; full is used in detail tool responses.

### Projects

Light:
- `id`, `name`, `state_key`, `type_key`
- `description` (150 chars)
- `next_step_short`
- `start_at`, `end_at`
- `facet_context`, `facet_scale`, `facet_stage`
- `updated_at`, `created_at`

Full:
- All `onto_projects` columns
- Full `props`
- Full `next_step_*` set

### Tasks

Light:
- `id`, `title`
- `state_key`, `priority`, `type_key`
- `start_at`, `due_at`, `updated_at`, `created_at`, `completed_at`
- `description` (120 chars)
- `plan_ids`, `goal_ids`, `output_ids` (derived via edges)
- `dependency_count`, `dependent_count`

Full:
- All `onto_tasks` columns
- Full `description`, `props`, `facet_scale`
- Full dependency and relationship lists

### Goals

Light:
- `id`, `name`, `state_key`, `type_key`
- `target_date`, `completed_at`
- `created_at`, `updated_at`
- `description` (120 chars)
- `progress_percent`, `completed_tasks`, `total_tasks` (derived)
- `direct_edge` flag

Full:
- All `onto_goals` columns
- Full `goal` and `description`
- Full `props`

### Plans

Light:
- `id`, `name`, `state_key`, `type_key`
- `created_at`, `updated_at`
- `description` (120 chars)
- `task_count`, `completed_task_count` (derived)

Full:
- All `onto_plans` columns
- Full `plan` and `description`
- Full `props`

### Milestones

Light:
- `id`, `title`, `state_key`, `type_key`
- `due_at`, `completed_at`
- `created_at`, `updated_at`
- `description` (120 chars)

Full:
- All `onto_milestones` columns
- Full `milestone` and `description`
- Full `props`

### Risks

Light:
- `id`, `title`, `state_key`, `type_key`
- `impact`, `probability`
- `created_at`, `updated_at`, `mitigated_at`
- `content` (120 chars)

Full:
- All `onto_risks` columns
- Full `content`
- Full `props`

### Decisions

Light:
- `id`, `title`, `state_key`
- `decision_at`, `created_at`, `updated_at`
- `outcome` (120 chars)
- `rationale` (180 chars)
- `description` (120 chars)

Full:
- All `onto_decisions` columns
- Full `outcome`, `rationale`, `description`
- Full `props`

### Requirements

Light:
- `id`, `text`, `priority`
- `created_at`, `updated_at`
- `type_key` (if present)

Full:
- All `onto_requirements` columns
- Full `props`

### Documents

Light:
- `id`, `title`, `state_key`, `type_key`
- `created_at`, `updated_at`
- `description` (180 chars)
- `content` (first 200 chars, optional)
- `direct_edge` flag

Full:
- All `onto_documents` columns
- Full `content`, `description`, `props`

### Outputs

Light:
- `id`, `name`, `state_key`, `type_key`
- `created_at`, `updated_at`
- `description` (160 chars)
- `linked_goal_ids`, `linked_task_ids` (derived)
- `direct_edge` flag

Full:
- All `onto_outputs` columns
- Full `description`, `props`
- Full relationship lists

### Signals

Light:
- `id`, `channel`, `ts`, `created_at`
- `payload_summary` (160 chars)

Full:
- All `onto_signals` columns
- Full payload

### Insights

Light:
- `id`, `title`, `created_at`
- `derived_from_signal_id`
- `props.summary` (160 chars, if present)

Full:
- All `onto_insights` columns
- Full `props`

## Formatting and Truncation Rules

- Reuse truncation lengths from `PROJECT_CONTEXT_ENRICHMENT_SPEC.md` unless overridden above.
- All list entries must include the entity `id`.
- Dates should be formatted `YYYY-MM-DD`.
- Include `updated_at` only if it differs from `created_at`.
- Use overflow indicators when caps are reached.

## Implementation Plan (High Level)

1. Update `OntologyContextLoader.loadProjectContext` to fetch additional columns and compute light fields.
2. Add graph snapshot generation using `ProjectGraphData` or edge-derived nodes.
3. Update `formatProjectContext` and `formatCombinedContext` to render:
   - Project header light fields
   - Graph JSON block (capped)
   - Expanded per-entity slices with new columns
4. Add optional "full context" tool or reuse `get_onto_*_details` for per-entity expansion.
5. Add tests for:
   - Graph coverage metrics
   - Direct edge flags
   - Field presence per entity

## Recommendations

1. Prefer "light + drill-down" over full rows in the prompt.
2. Use an allowlist for `props` keys when surfacing props in light mode.
3. Add coverage metrics for edge completeness to surface missing relationships.
4. Keep graph JSON in a single block so it can be parsed easily by the LLM.
5. Align selection caps with daily brief defaults for consistency.

