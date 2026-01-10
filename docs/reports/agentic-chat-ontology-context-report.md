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
- For project creation (`context_type === project_create`), **no ontology context** is loaded.

Once loaded, the ontology context is formatted into a text snapshot and included in the planner prompt stack as `## Context Snapshot`.

## Global Context (Ontology)

### What is loaded (server-side ontology data)

Loader: `OntologyContextLoader.loadGlobalContext()`

- Entities:
  - `entities.projects`: up to 50 recent `onto_projects` rows (full rows).
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
- Up to 5 recent projects, shown as name + `state_key` + `type_key`.
- Entity distribution counts.
- Hints to use `list_onto_projects` or create new projects.

<!-- My comments: 
We need to focus the data for each project that we load into it. Lets trim this. Make sure we are loading the project descriptions for each project. Cap the project descriptions at a resasonable length like 150 characters, and load next_step_short part. Then load the date info. And look at the data model and make sure we are only loading in important details.

-->

## Project Workspace Context (Ontology)

### What is loaded (server-side ontology data)

Loader: `OntologyContextLoader.loadProjectContext(projectId)`

- Entities:
  - `entities.project`: full `onto_projects` row (includes `props` and any additional fields).
- Relationships:
  - Outgoing edges from `onto_edges` where `src_id = projectId` (limit 50).
  - `entity_count` is derived from the edge target kinds.
- Metadata:
  - `context_document_id`: from `has_context_document` edge.
  - `facets`: extracted from `project.props.facets`.
  - `project_highlights`: summarized slices of connected ontology entities:
    - Goals (limit 5)
    - Risks (limit 5, excludes mitigated/closed)
    - Decisions (limit 5, truncates rationale)
    - Requirements (limit 5, truncates text)
    - Documents (limit 5, truncates description)
    - Milestones (limit 5)
    - Plans (limit 5)
    - Outputs (limit 5)
    - Signals (limit 5, truncates payload)
    - Insights (limit 5)
    - Tasks (recent: limit 10; upcoming: limit 5)
  - `last_updated`
- Scope:
  - `scope.projectId`, `scope.projectName`

### What the AI agent sees (formatted context)

Formatter: `formatProjectContext()` -> `## Context Snapshot`

- Project info: ID, name, description, state, type, created timestamp.
- Project context highlights (limited lists per type with truncation).
- Entity summary counts (from edges).
- Relationship preview: first 5 edges with relation + target kind + target id.
- Hints to use list/detail tools and relationship tools.

<!-- My comments: 

OK we need to make sure that we arent thinking of this in a flat structure but in a graph structure. The connected entities tell a semantic story. This is important.
I would like to construct a light weight version of the complete ontology graph for the ai agent. We should do this in json. 

For the actual data I need to see all the entity data that we show for each ontology entity. I need to see the summarized slices for each piece.

So we should show all goals and note the ones that have direct edges to the project.
We should show all documents and outputs.
Then we should show all other entities that have a direct edge to the project.
What I am trying to do is surface the most important entities that are connected to the project.
 
-->

## Project Workspace with Focused Entity (Ontology)

This applies when the user selects a specific entity in the focus selector while in a project workspace.

### What is loaded (server-side ontology data)

Loader: `OntologyContextLoader.loadCombinedProjectElementContext(projectId, elementType, elementId)`

Combined context merges:

1) **Project context** (same as above)  
2) **Element context** via `loadElementContext()`:
   - Entities: focused element row (`onto_tasks`, `onto_goals`, etc.) plus its parent project if found.
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

- Project header: ID, state, type.
- Focus section: name, ID, state, due (if present), and a ~400-char description snippet.
- Focus metadata: up to 5 `props` keys from the focused entity.
- Relationship summary: first 8 edges with relation and target identity.
- Focus directive: reminder to prioritize the focused entity while retaining project awareness.

### Linked entity context (extra focus-level context)

If `OntologyContext.scope.focus` is present, the system also loads **linked entities** and appends them to the system prompt:

Loader: `OntologyContextLoader.loadLinkedEntitiesContext()`

- Max 3 entities per type (tasks, plans, goals, milestones, documents, outputs, risks, decisions, requirements).
- Names, IDs, states, and relationship labels.
- Overflow counts when more links exist.
- Hint to use `get_linked_entities` for full details.

<!-- My comments: 
We need surface for project info if we arent. You said "**Project context** (same as above)" and also said "Project header: ID, state, type." so i am a bit confused. What exact data do we surface about the main project?

For the focus section we need to surface all imporant data for that entity. We need to show more than "name, ID, state, due (if present), and a ~400-char description snippet."

-->

## What the LLM Receives (Prompt Stack)

When ontology context is available, the planner prompt stack includes:

1) System prompt with session guidance and progressive disclosure rules.
2) Optional user preferences prompt.
3) `## Context Snapshot` (formatted ontology context above).
4) Conversation history (compressed if needed).
5) Current user message.

Ontology context is **not passed as raw JSON** to the LLM; it is summarized via the formatter into the snapshot text. Linked entity context is appended to the system prompt for focus mode.

## Progressive Disclosure Expectations

- The ontology snapshot is intentionally abbreviated.
- The prompt instructs the agent to start with list/search tools, then use detail tools as needed.
- Focused entity context surfaces the minimal props/relationships needed to decide what to expand.
- The agent is expected to call ontology tools to retrieve full details.

## Caching and Limits (Impact on Context Freshness)

- Session-level ontology cache: 5 minutes (`chat_sessions.agent_metadata.ontologyCache`).
- Loader-level cache: 60 seconds in-memory.
- Relationships are capped (project edges: 50; element edges: 20).
- Highlights and linked-entity lists are capped per type to keep context small.

These limits define both the breadth of ontology data loaded and the size of the context provided to the LLM. 
