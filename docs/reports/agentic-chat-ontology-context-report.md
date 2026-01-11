<!-- docs/reports/agentic-chat-ontology-context-report.md -->

# Agentic Chat Ontology Context Loading Report

This report summarizes what ontology context is loaded and presented to the AI agent across the main chat context types: global, project workspace, and project workspace with an entity focus. It maps the server-side ontology loading to the LLM-visible prompt content.

## Sources (Code + Specs)

- `apps/web/src/routes/api/agent/stream/+server.ts`
- `apps/web/src/routes/api/agent/stream/services/ontology-cache.ts`
- `apps/web/src/lib/services/ontology-context-loader.ts`
- `apps/web/src/lib/services/context/context-formatters.ts`
- `apps/web/src/lib/services/agent-context-service.ts`
- `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
- `apps/web/src/lib/services/linked-entity-context-formatter.ts`
- `apps/web/src/lib/types/agent-chat-enhancement.ts`
- `apps/web/src/lib/types/linked-entity-context.types.ts`
- `docs/specs/PROJECT_CONTEXT_ENRICHMENT_SPEC.md`
- `docs/specs/AGENTIC_CHAT_PROJECT_CONTEXT_ENRICHMENT_SPEC.md`

## Context Selection Inputs (What the Server Receives)

The UI sends these fields to `/api/agent/stream`:

- `context_type`: primary chat mode (e.g., `global`, `project`, `project_audit`, `project_forecast`).
- `entity_id`: project ID for project contexts (or entity ID for element contexts).
- `projectFocus`: focus selector payload (project + optional focused entity).
- `ontologyEntityType`: the focused entity type when the focus selector is used (task, plan, goal, document, output, milestone, risk, decision, requirement).

These inputs determine which ontology context is loaded and how it is formatted for the LLM.

## Where Ontology Context Is Loaded

All ontology context is loaded in the API layer via `OntologyCacheService`:

- Session cache: 5 minute TTL stored in `chat_sessions.agent_metadata.ontologyCache`.
- Loader cache: 60 second in-memory TTL inside `OntologyContextLoader`.
- For project creation (`context_type === project_create`), no ontology context is loaded.

Once loaded, the ontology context is formatted into a text snapshot and included in the planner prompt stack as `## Context Snapshot`.

## Global Context (Ontology)

### What is loaded (server-side ontology data)

Loader: `OntologyContextLoader.loadGlobalContext()`

- Entities:
    - `entities.projects`: up to 50 recent `onto_projects` rows (light columns only).
- Project columns selected:
    - `id, name, state_key, type_key, description, next_step_short, next_step_long, start_at, end_at, facet_context, facet_scale, facet_stage, updated_at`
- Metadata:
    - `entity_count`: counts per ontology table (`onto_projects`, `onto_tasks`, etc.).
    - `total_projects`: total `onto_projects` count for the actor.
    - `available_entity_types`: list of ontology entity types.
    - `recent_project_ids`: IDs of the loaded projects.
    - `last_updated`: timestamp.
- Relationships: none for global context.

### What the AI agent sees (formatted context)

Formatter: `formatGlobalContext()` -> `## Context Snapshot`

- Total projects count.
- Available entity types list.
- Up to 5 recent projects with:
    - name + `state_key` + `type_key`
    - description snippet (150 chars)
    - `next_step_short`
    - date range (`start_at` → `end_at`)
    - `updated_at` date
- Entity distribution counts.
- Hints to use `list_onto_projects` or create new projects.

## Project Workspace Context (Ontology)

### What is loaded (server-side ontology data)

Loader: `OntologyContextLoader.loadProjectContext(projectId)`

1. Project graph data is loaded by `project_id` (no joins; edges are fetched separately):

- Project columns:
    - `id, name, description, type_key, state_key, facet_context, facet_scale, facet_stage, start_at, end_at, next_step_short, next_step_long, created_at, updated_at`
- Tasks:
    - `id, title, description, state_key, type_key, priority, start_at, due_at, completed_at, created_at, updated_at`
- Goals:
    - `id, name, goal, description, state_key, type_key, target_date, completed_at, created_at, updated_at`
- Plans:
    - `id, name, description, state_key, type_key, created_at, updated_at`
- Milestones:
    - `id, title, description, state_key, type_key, due_at, completed_at, created_at, updated_at`
- Risks:
    - `id, title, content, state_key, type_key, impact, probability, mitigated_at, created_at, updated_at`
- Documents:
    - `id, title, description, state_key, type_key, created_at, updated_at`
- Outputs:
    - `id, name, description, state_key, type_key, created_at, updated_at`
- Requirements:
    - `id, text, priority, type_key, created_at, updated_at`
- Decisions:
    - `id, title, description, outcome, rationale, state_key, decision_at, created_at, updated_at`
- Signals:
    - `id, channel, ts, payload, created_at`
- Insights:
    - `id, title, derived_from_signal_id, props, created_at`
- Edges:
    - `id, src_kind, src_id, rel, dst_kind, dst_id, project_id`

Most tables are filtered with `deleted_at IS NULL` to exclude soft-deletes.

2. Derived structures and metadata:

- Direct edge map computed from edges where the project is the source or destination.
- Context document resolved from `has_context_document` edge (document title resolved from loaded docs).
- `project_highlights` built from graph data:
    - Goals/documents/outputs include all rows by `project_id`, with `direct_edge` flags.
    - Other entities (risks, decisions, requirements, milestones, plans, signals, insights) are limited to direct edges.
    - Tasks include recent updates and upcoming windows, plus derived linkage counts (plans/goals/outputs) and dependency counts.
- `graph_snapshot` built via breadth-first traversal (depth 2) over explicit edges, capped to keep tokens small:
    - Max nodes: 60, max edges: 80, max nodes per kind: 10.
    - Includes node metadata (name, state, type, last updated, direct_edge flag).
    - Coverage counts for totals vs direct vs unlinked per entity type.
- `entity_count` totals per entity type (by `project_id`).
- Relationships list includes only direct project edges (max 50).

### What the AI agent sees (formatted context)

Formatter: `formatProjectContext()` -> `## Context Snapshot`

- Project header with:
    - ID, name, state, type
    - created/updated dates
    - timeline (`start_at` → `end_at`)
    - facets (`facet_context`, `facet_scale`, `facet_stage`)
    - description snippet (150 chars)
    - `next_step_short`, `next_step_long` (truncated)
    - context document title + ID (if present)
- Project context highlights with richer per-entity fields:
    - Goals: state/type, target/completed dates, progress percent + task counts, description, direct_edge.
    - Risks: state/type, impact/probability, mitigated date, content snippet.
    - Decisions: state, decision date, outcome/rationale/description snippets.
    - Requirements: priority/type, text snippet.
    - Documents: state/type, description snippet, direct_edge.
    - Milestones: state/type, due/completed dates, description.
    - Plans: state/type, task counts, description.
    - Outputs: state/type, linked goals/tasks counts, description, direct_edge.
    - Signals: channel + ts + payload summary.
    - Insights: derived signal + summary.
    - Tasks: state/type/priority, start/due/completed/updated, plan/goal/output counts, dependencies.
- Graph snapshot JSON block (light graph structure).
- Entity summary uses graph coverage (total/direct/unlinked per type).
- Relationship preview (direct project edges).
- Hints to use list/detail tools for full data.

## Project Workspace with Focused Entity (Ontology)

This applies when the user selects a specific entity in the focus selector while in a project workspace.

### What is loaded (server-side ontology data)

Loader: `OntologyContextLoader.loadCombinedProjectElementContext(projectId, elementType, elementId)`

Combined context merges:

1. **Project context** (same as above)
2. **Element context** via `loadElementContext()`:
    - Entities: focused element row (full `onto_*` row) plus its parent project if found.
    - Relationships: edges where the element is either source or destination (limit 20).
    - Relationship direction is annotated with `inverse_` when the element is the destination.
    - Metadata includes `hierarchy_level` and `last_updated`.

Combined output:

- Entities: both project and focused element.
- Relationships: merged edges from project + element.
- Metadata: merged project + element metadata.
- Scope: `projectId`, `projectName`, and `focus` (type/id/name).

### What the AI agent sees (formatted context)

Formatter: `formatCombinedContext()` -> `## Context Snapshot`

- Project header (same fields as project workspace context).
- Focus section with:
    - name, ID, state, due/target (if present)
    - type-specific details (type, priority, dates, impact/probability, decision outcomes, progress counts, source refs)
    - description snippet (up to 400 chars)
    - up to 5 `props` keys if present
- Relationship summary: direct edges from project + element (first 8).
- Graph snapshot JSON block (light graph structure).
- Focus directive: reminder to prioritize the focused entity while retaining project awareness.

### Linked entity context (extra focus-level context)

If `OntologyContext.scope.focus` is present, the system also loads linked entities and appends them to the system prompt:

Loader: `OntologyContextLoader.loadLinkedEntitiesContext()`

- Max 3 entities per type (tasks, plans, goals, milestones, documents, outputs, risks, decisions, requirements).
- Names, IDs, states, and relationship labels.
- Overflow counts when more links exist.
- Hint to use `get_linked_entities` for full details.

## What the LLM Receives (Prompt Stack)

When ontology context is available, the planner prompt stack includes:

1. System prompt with session guidance and progressive disclosure rules.
2. Optional user preferences prompt.
3. `## Context Snapshot` (formatted ontology context above).
4. Conversation history (compressed if needed).
5. Current user message.

Ontology context is summarized via the formatter into the snapshot text. When available, a lightweight graph snapshot is provided as a JSON block inside the snapshot.

## Progressive Disclosure Expectations

- The ontology snapshot is intentionally abbreviated and capped.
- The agent is expected to call ontology tools to retrieve full entity rows and full graph data.
- Graph coverage highlights where direct edges are missing so the agent can target fixes or expansion.
- Focus mode surfaces the most relevant fields for the selected entity to reduce immediate tool calls.

## Caching and Limits (Impact on Context Freshness)

- Session-level ontology cache: 5 minutes (`chat_sessions.agent_metadata.ontologyCache`).
- Loader-level cache: 60 seconds in-memory.
- Relationships are capped (project edges: 50; element edges: 20).
- Highlights and linked-entity lists are capped per type to keep context small.
- Graph snapshot caps: depth 2, max 60 nodes, max 80 edges, max 10 nodes per kind.

These limits define both the breadth of ontology data loaded and the size of the context provided to the LLM.
