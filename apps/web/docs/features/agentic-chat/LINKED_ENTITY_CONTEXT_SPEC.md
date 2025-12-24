<!-- apps/web/docs/features/agentic-chat/LINKED_ENTITY_CONTEXT_SPEC.md -->

# Linked Entity Context for Agentic Chat

> **Status:** Implemented
> **Created:** 2025-12-09
> **Implemented:** 2025-12-09
> **Author:** AI Assistant
> **Related:** [LINKED_ENTITIES_COMPONENT.md](../ontology/LINKED_ENTITIES_COMPONENT.md)

## Overview

This spec describes how to properly load and format linked entity context (via `onto_edges`) when the agentic chat is focused on a specific entity. The goal is to give the AI agent awareness of an entity's relationships to other entities in the ontology graph.

### Scope: Focus Selector Context

**This feature applies specifically when a user has selected an entity in the focus selector.** The focus selector allows users to chat about a specific:

- **Task** - A specific task within a project
- **Plan** - A plan grouping related tasks
- **Goal** - A strategic goal
- **Document** - A project document

When an entity is selected in the focus selector:

1. The `OntologyContext.scope.focus` is populated with `{ type, id, name }`
2. The context type becomes `element` (single entity) or `combined` (project + entity)
3. **NEW:** Linked entities are loaded and included in the system prompt

**This does NOT apply to:**

- Global context (no focus selected)
- Project-only context (project selected but no specific entity)
- Calendar context

## Problem Statement

**Current State:**

- The `OntologyContextLoader` loads basic edge data (relation type, target kind, target ID) with limits of 50 for projects and 20 for elements
- Edge target names are NOT resolved by default (lazy resolution)
- The frontend `LinkedEntities` component fetches rich linked entity data via `/api/onto/edges/linked` endpoint
- **Gap:** The chat context lacks the rich relationship data that users see in the UI

**User Impact:**

- When chatting about a task, the AI doesn't know what plan it belongs to, what goals it supports, or what documents it references
- Users have to manually explain relationships that are already defined in the system
- The AI cannot help with relationship-aware queries like "what tasks support this goal?"

## Proposed Solution

Extend the `OntologyContextLoader` to fetch and format linked entity details when loading entity context, using the same data structures as the frontend `LinkedEntities` component.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Chat Session Start                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              AgentContextService.buildPlannerContext()          │
│                                                                 │
│  Determine focus type (project-wide, task, plan, goal, etc.)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│          OntologyContextLoader.loadEntityContext()              │
│                                                                 │
│  1. Load entity data (project/task/plan/goal/etc.)              │
│  2. Load linked entities via edges  ◄─────── NEW                │
│  3. Format for context consumption                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Linked Entity Context (NEW)                        │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Plans     │  │   Goals     │  │  Documents  │              │
│  │  (linked)   │  │  (linked)   │  │  (linked)   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Milestones  │  │   Outputs   │  │ Dep. Tasks  │              │
│  │  (linked)   │  │  (linked)   │  │  (linked)   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│         Format & Include in System Prompt (on chat open)        │
│                                                                 │
│  Abbreviated Mode (Included in System Prompt):                  │
│  - Top 3 linked entities per type with IDs                      │
│  - "... and X more" overflow indicator per type                 │
│  - Name, ID, state, relationship type for each                  │
│  - Hint to use get_linked_entities for full details             │
│                                                                 │
│  Full Mode (Via get_linked_entities Tool):                      │
│  - ALL linked entities with IDs                                 │
│  - Full descriptions (not truncated)                            │
│  - Relationship types and directions                            │
│  - Complete entity properties                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Model

### LinkedEntityContext

New type to represent linked entity context for chat:

```typescript
// src/lib/types/chat-context.types.ts

export interface LinkedEntityContext {
	/** Entity type (task, plan, goal, milestone, document, output) */
	kind: OntologyEntityType;

	/** Entity ID */
	id: string;

	/** Display name (name or title) */
	name: string;

	/** Current state (active, draft, completed, etc.) */
	state: string | null;

	/** Template type key for categorization */
	typeKey: string | null;

	/** Relationship type (belongs_to_plan, supports_goal, etc.) */
	relation: string;

	/** Direction from source entity's perspective */
	direction: 'outgoing' | 'incoming';

	/** Edge ID for reference */
	edgeId: string;

	/** Optional description (truncated for abbreviated mode) */
	description?: string;

	/** Optional due date (for milestones) */
	dueAt?: string;
}

export interface EntityLinkedContext {
	/** Source entity being described */
	source: {
		kind: OntologyEntityType;
		id: string;
		name: string;
	};

	/** Linked entities grouped by type */
	linkedEntities: {
		plans: LinkedEntityContext[];
		goals: LinkedEntityContext[];
		tasks: LinkedEntityContext[];
		milestones: LinkedEntityContext[];
		documents: LinkedEntityContext[];
		outputs: LinkedEntityContext[];
	};

	/** Summary counts */
	counts: {
		plans: number;
		goals: number;
		tasks: number;
		milestones: number;
		documents: number;
		outputs: number;
		total: number;
	};

	/** Whether data was truncated */
	truncated: boolean;
}
```

### Relationship Direction Semantics

The relationship direction matters for context understanding:

| Source | Relation        | Target | Direction | Meaning                           |
| ------ | --------------- | ------ | --------- | --------------------------------- |
| task   | belongs_to_plan | plan   | outgoing  | "This task is part of plan X"     |
| plan   | has_task        | task   | incoming  | "This plan includes task X"       |
| task   | supports_goal   | goal   | outgoing  | "This task works toward goal X"   |
| goal   | requires        | task   | incoming  | "This goal needs task X"          |
| task   | depends_on      | task   | outgoing  | "This task requires task X first" |
| task   | depends_on      | task   | incoming  | "Task X requires this task first" |

## Implementation Plan

### Phase 1: Extend OntologyContextLoader

**File:** `src/lib/services/ontology-context-loader.ts`

Add new method to load linked entities for any entity:

```typescript
/**
 * Load linked entities for a given entity
 * Uses the same query pattern as the LinkedEntities component
 */
async loadLinkedEntitiesContext(
  entityId: string,
  entityKind: OntologyEntityType,
  projectId: string,
  options?: {
    maxPerType?: number;      // Default: 10 for abbreviated, 50 for full
    includeDescriptions?: boolean;  // Default: false for abbreviated
  }
): Promise<EntityLinkedContext>
```

**Implementation Steps:**

1. Query `onto_edges` where `src_id = entityId` OR `dst_id = entityId`
2. Group edges by target entity kind
3. Batch fetch entity details from respective tables
4. Format into `EntityLinkedContext` structure
5. Apply limits and truncation as needed

### Phase 2: Integrate into System Prompt (Initial Context)

**File:** `src/lib/services/agent-context-service.ts`

The linked entities context should be loaded and included in the system prompt when:

1. User opens chat with an entity selected in the focus selector
2. The `focus?.type && focus?.id` condition is met
3. Context type is `element` or `combined`

```typescript
// In buildPlannerContext() or buildOntologyContext()
if (focus?.type && focus?.id) {
	// Load abbreviated linked entities for system prompt
	const linkedContext = await this.ontologyLoader.loadLinkedEntitiesContext(
		focus.id,
		focus.type,
		projectId,
		{
			maxPerType: 3, // Show first 3 per type
			includeDescriptions: false // No descriptions in abbreviated mode
		}
	);

	// Format for system prompt inclusion
	const linkedEntitiesPrompt = this.formatLinkedEntitiesForSystemPrompt(linkedContext);

	// Append to system prompt
	systemPrompt += '\n\n' + linkedEntitiesPrompt;
}
```

**When this loads:**

| User Action                   | Focus Selector State | Linked Entities Loaded?                 |
| ----------------------------- | -------------------- | --------------------------------------- |
| Opens chat, no selection      | Empty                | **No**                                  |
| Opens chat, project selected  | Project only         | **No** (project-level, no entity focus) |
| Opens chat, task selected     | Task focused         | **Yes** - task's linked entities        |
| Opens chat, plan selected     | Plan focused         | **Yes** - plan's linked entities        |
| Opens chat, goal selected     | Goal focused         | **Yes** - goal's linked entities        |
| Opens chat, document selected | Document focused     | **Yes** - document's linked entities    |

### Phase 3: Context Formatting

**File:** `src/lib/services/chat-context-service.ts`

Add formatter for linked entity context:

```typescript
formatLinkedEntitiesContext(
  linked: EntityLinkedContext,
  mode: 'abbreviated' | 'full'
): string
```

**Abbreviated Format (included in system prompt on chat open):**

When the user opens a chat with an entity selected in the focus selector, this abbreviated linked entity context is automatically included in the system prompt:

```markdown
## Linked Entities

This task has the following relationships:

### Plans (2 linked)

- **Q4 Marketing Plan** [plan-uuid-123] (active) - belongs_to_plan
- **Product Launch Plan** [plan-uuid-456] (draft) - belongs_to_plan

### Goals (1 linked)

- **Increase User Retention** [goal-uuid-789] (active) - supports_goal

### Documents (5 linked, showing first 3)

- **Requirements Doc** [doc-uuid-001] - references
- **Design Spec** [doc-uuid-002] - references
- **Meeting Notes** [doc-uuid-003] - references
- ... and 2 more documents

### Dependent Tasks (4 linked, showing first 3)

- **Set up CI/CD pipeline** [task-uuid-101] (in_progress) - depends_on
- **Write unit tests** [task-uuid-102] (todo) - depends_on
- **Configure database** [task-uuid-103] (done) - depends_on
- ... and 1 more task

_Use `get_linked_entities` tool to see full details including descriptions._
```

**Key points:**

- **IDs included:** Each entity shows its UUID in brackets so the agent can query it directly
- **Overflow indicator:** When more than 3 entities exist for a type, shows "... and X more"
- **Loaded on chat open:** This is part of the initial system prompt, not loaded on demand

**Full Format (via `get_linked_entities` tool):**

When the agent needs more details, it can call the `get_linked_entities` tool to get complete information including descriptions:

```markdown
## Linked Entities for: Implement OAuth Login [task-uuid-999]

### Plans (2 total)

#### Q4 Marketing Plan [plan-uuid-123]

- **State:** active
- **Type:** plan.marketing.campaign
- **Relationship:** belongs_to_plan (outgoing)
- **Description:** Comprehensive marketing strategy for Q4 product launches including social media campaigns, influencer partnerships, and paid advertising across multiple channels.

#### Product Launch Plan [plan-uuid-456]

- **State:** draft
- **Type:** plan.product.launch
- **Relationship:** belongs_to_plan (outgoing)
- **Description:** Step-by-step plan for launching the new authentication feature, covering development, testing, documentation, and rollout phases.

### Goals (1 total)

#### Increase User Retention [goal-uuid-789]

- **State:** active
- **Type:** goal.metric.retention
- **Relationship:** supports_goal (outgoing)
- **Description:** Target 20% improvement in 30-day user retention by simplifying the login experience and reducing friction in the authentication flow.

### Documents (5 total)

#### Requirements Doc [doc-uuid-001]

- **State:** published
- **Type:** document.spec.requirements
- **Relationship:** references (outgoing)
- **Description:** Complete requirements specification for OAuth integration including supported providers, security requirements, and UX flows.

#### Design Spec [doc-uuid-002]

- **State:** draft
- **Type:** document.spec.design
- **Relationship:** references (outgoing)
- **Description:** Technical design document covering architecture decisions, API contracts, and database schema changes.

[... continues for all linked entities ...]
```

**Key points:**

- **IDs in headers:** Each entity header includes UUID for easy reference
- **Full descriptions:** Complete description text (not truncated)
- **All entities shown:** No limit, shows every linked entity
- **Relationship direction:** Indicates outgoing vs incoming relationship

### Phase 4: Add Linked Entities Tool

**File:** `src/lib/services/agentic-chat/tools/ontology/get-linked-entities.tool.ts`

New tool for fetching full linked entity details:

```typescript
export const getLinkedEntitiesTool: ChatToolDefinition = {
	name: 'get_linked_entities',
	description: `Get detailed information about entities linked to a specific entity via relationships.
Use this tool when you need to:
- Understand what plans a task belongs to
- Find all tasks that support a goal
- See documents referenced by an entity
- Explore task dependencies`,

	parameters: {
		type: 'object',
		properties: {
			entity_id: {
				type: 'string',
				description: 'UUID of the entity to get linked entities for'
			},
			entity_kind: {
				type: 'string',
				enum: ['task', 'plan', 'goal', 'milestone', 'document', 'output'],
				description: 'Type of the source entity'
			},
			filter_kind: {
				type: 'string',
				enum: ['task', 'plan', 'goal', 'milestone', 'document', 'output', 'all'],
				description: 'Filter to specific entity type, or "all" for everything',
				default: 'all'
			}
		},
		required: ['entity_id', 'entity_kind']
	},

	tier: 2, // Detail tool (use after list tools)
	contextTypes: ['project', 'global', 'ontology'],
	group: 'ontology_read'
};
```

### Phase 5: Update System Prompts

**File:** `src/lib/services/agentic-chat/prompts/system-prompts.ts`

Add linked entities awareness to agent system prompts:

```markdown
## Entity Relationships

Entities in BuildOS are connected via relationships (edges). When working with an entity,
check its linked entities to understand:

- **Plans:** What plans does this task belong to?
- **Goals:** What goals does this task support?
- **Documents:** What documents does this entity reference?
- **Dependencies:** What tasks must complete before this one?
- **Milestones:** What milestones is this targeting?
- **Outputs:** What deliverables does this produce?

The initial context shows a summary of linked entities. Use `get_linked_entities`
tool to see full details including descriptions and properties.

### Relationship Direction

- **Outgoing:** This entity points TO another (e.g., task → plan)
- **Incoming:** Another entity points TO this one (e.g., goal → task)

Understanding direction helps interpret the relationship meaning:

- "Task A belongs_to_plan Plan B" (outgoing from task)
- "Goal X requires Task A" (incoming to task)
```

## Token Budget Considerations

### Current Allocation

From the research, the current token budget is:

- System prompt: ~800 tokens (never truncated)
- Location context: ~1000 tokens
- Related data: ~500 tokens
- User profile: ~300 tokens
- Conversation: ~2500 tokens

### Linked Entity Token Estimate

| Mode        | Per Entity  | Max Entities                               | Total                   |
| ----------- | ----------- | ------------------------------------------ | ----------------------- |
| Abbreviated | ~40 tokens  | 18 (3 per type × 6 types) + overflow lines | ~500 tokens             |
| Full        | ~150 tokens | 50                                         | ~7500 tokens (via tool) |

**Abbreviated token breakdown per entity:**

- Entity name: ~5-10 tokens
- Entity ID (UUID): ~15 tokens
- State: ~3 tokens
- Relationship type: ~5 tokens
- Formatting: ~5 tokens
- **Total: ~35-40 tokens per entity**

**Plus per-type overhead:**

- Section header: ~10 tokens
- Overflow indicator ("... and X more"): ~8 tokens when applicable

**Recommendation:**

- Include abbreviated linked entities in the ~500 token "Related data" budget
- Full linked entities loaded via tool (no budget impact on initial context)

### Truncation Strategy

1. **Per-type limit:** Max 3 entities per type in abbreviated mode (system prompt)
2. **Overflow indicator:** When more than 3 exist, show "... and X more [type]"
3. **Priority ordering:** Active/in-progress entities first, then by created_at desc
4. **No description in abbreviated:** Descriptions only shown via tool (full mode)
5. **IDs always included:** Every entity shows its UUID for agent to query directly
6. **Exclude scratch:** Filter out scratch/workspace documents (same as frontend)

## API Endpoint Reuse

The implementation should reuse the existing `/api/onto/edges/linked` endpoint logic rather than duplicating queries:

```typescript
// In ontology-context-loader.ts

private async fetchLinkedEntities(
  entityId: string,
  entityKind: OntologyEntityType,
  projectId: string
): Promise<LinkedEntitiesApiResponse> {
  // Reuse the same fetch function from linked-entities.service.ts
  // Or call the API endpoint directly if server-side

  const url = `/api/onto/edges/linked?sourceId=${entityId}&sourceKind=${entityKind}&projectId=${projectId}`;
  const response = await fetch(url);
  return response.json();
}
```

## Database Query Optimization

The linked entities API already uses optimized queries:

1. **Indexed queries:** Separate queries on `(src_kind, src_id)` and `(dst_kind, dst_id)` indexes
2. **Batch fetching:** Group entity IDs by type, then batch fetch from each table
3. **Parallel execution:** Fetch different entity types in parallel
4. **Result limits:** 100 per type for available, configurable for linked

For chat context, we can reduce limits further:

- Max 10 linked entities per type (vs 100 available)
- Skip "available" entities (not needed for context)

## Caching Strategy

Extend the existing 1-minute TTL cache:

```typescript
// Cache key format
const cacheKey = `linked:${entityId}:${entityKind}`;

// Cache entry
{
  data: EntityLinkedContext,
  timestamp: number  // For TTL check
}

// TTL: 60 seconds (same as ontology context)
```

**Cache invalidation scenarios:**

- Edge created/deleted (handled by UI component's `onLinksChanged` callback)
- For chat, stale data is acceptable (1 minute) since edges don't change frequently

## Testing Plan

### Unit Tests

1. **`ontology-context-loader.test.ts`**
    - `loadLinkedEntitiesContext()` returns correct structure
    - Handles entities with no links
    - Respects maxPerType limits
    - Correctly identifies incoming vs outgoing edges

2. **`chat-context-service.test.ts`**
    - `formatLinkedEntitiesContext()` produces correct markdown
    - Abbreviated mode respects character limits
    - Full mode includes all details

3. **`get-linked-entities.tool.test.ts`**
    - Tool execution returns formatted context
    - Filter by kind works correctly
    - Handles missing/invalid entity IDs

### Integration Tests

1. **Context building with linked entities**
    - Task context includes linked plans, goals, documents
    - Project context includes linked goals, plans
    - Global context doesn't include linked entities (no focus entity)

2. **Tool execution in chat**
    - `get_linked_entities` tool returns expected data
    - Multiple calls work (no cache issues)

### Manual QA

1. Start chat focused on a task with multiple linked entities
2. Verify abbreviated context shows linked entity summary
3. Ask AI "what plan does this task belong to?" - should answer from context
4. Ask AI "tell me more about the linked documents" - should use tool
5. Verify tool output includes full details

## Migration Notes

### Backward Compatibility

- No breaking changes to existing context structure
- `linkedEntities` is an optional field in `OntologyContext`
- Existing chats without linked entity context continue to work

### Rollout Plan

1. **Phase 1:** Add linked entity loading (behind feature flag)
2. **Phase 2:** Add tool for full details
3. **Phase 3:** Update system prompts
4. **Phase 4:** Enable by default, remove flag

## Success Metrics

| Metric                                   | Target            |
| ---------------------------------------- | ----------------- |
| Context load time increase               | < 100ms           |
| Token usage increase (abbreviated)       | < 500 tokens      |
| User satisfaction (relationship queries) | Improved accuracy |
| Tool usage (get_linked_entities)         | Used when needed  |

## Open Questions

1. **How deep should we traverse? Just direct links or 2nd-degree connections?**
    - Recommendation: Direct links only (1 hop) to avoid context explosion

2. **Should the tool support creating/removing links or just reading?**
    - Recommendation: Read-only for now, create/remove via existing CRUD tools

3. **How to handle circular references (A → B → A)?**
    - Recommendation: Already handled by edge uniqueness constraint, show both directions

4. **Should we show the project context document as a linked entity?**
    - The project already has a context document edge - should this be shown separately?
    - Recommendation: Yes, include it in the documents section with special marker

## Appendix: Relationship Type Reference

Full list of valid relationship types:

```typescript
const RELATIONSHIP_TYPES = {
	// Task relationships
	belongs_to_plan: 'Task belongs to a plan',
	supports_goal: 'Task supports achieving a goal',
	depends_on: 'Task depends on another task',
	targets_milestone: 'Task targets a milestone',
	references: 'Entity references a document',
	produces: 'Task produces an output',

	// Plan relationships
	has_task: 'Plan contains a task',

	// Goal relationships
	requires: 'Goal requires a task',
	achieved_by: 'Goal is achieved by a plan',

	// Document relationships
	referenced_by: 'Document is referenced by another entity',

	// Milestone relationships
	contains: 'Milestone contains tasks/plans',

	// Output relationships
	produced_by: 'Output is produced by a task',

	// Generic
	relates_to: 'Generic relationship (fallback)'
};
```

## Implementation Checklist

- [x] **Phase 1: Data Layer**
    - [x] Add `LinkedEntityContext` and `EntityLinkedContext` types (`src/lib/types/linked-entity-context.types.ts`)
    - [x] Add `loadLinkedEntitiesContext()` to `OntologyContextLoader` (`src/lib/services/ontology-context-loader.ts`)
    - [ ] Add unit tests for new method

- [x] **Phase 2: Context Integration**
    - [x] Modify `buildPlannerContext()` to include linked entities (`src/lib/services/agent-context-service.ts`)
    - [x] Add `formatLinkedEntitiesForSystemPrompt()` formatter (`src/lib/services/linked-entity-context-formatter.ts`)
    - [x] Include linked entities in system prompt when focus entity exists

- [x] **Phase 3: Tool Implementation**
    - [x] Add `get_linked_entities` tool definition (`src/lib/services/agentic-chat/tools/core/tool-definitions.ts`)
    - [x] Add tool executor method (`src/lib/services/agentic-chat/tools/core/tool-executor.ts`)
    - [x] Register tool in `tools.config.ts` (base group and ontology category)

- [x] **Phase 4: Prompt Updates**
    - [x] Linked entities context automatically included in system prompt when focus exists
    - [x] Tool description includes guidance on when to use it

- [ ] **Phase 5: Testing & Rollout**
    - [ ] Complete unit test suite
    - [ ] Integration tests
    - [ ] Manual QA checklist
    - [x] Enabled by default (no feature flag)

## Files Created/Modified

### New Files

- `src/lib/types/linked-entity-context.types.ts` - TypeScript types for linked entity context
- `src/lib/services/linked-entity-context-formatter.ts` - Formatters for system prompt and tool output

### Modified Files

- `src/lib/services/ontology-context-loader.ts` - Added `loadLinkedEntitiesContext()` method
- `src/lib/services/agent-context-service.ts` - Integrated linked entities loading into `buildPlannerContext()`
- `src/lib/services/agentic-chat/tools/core/tool-definitions.ts` - Added `get_linked_entities` tool definition
- `src/lib/services/agentic-chat/tools/core/tool-executor.ts` - Added tool executor method
- `src/lib/services/agentic-chat/tools/core/tools.config.ts` - Registered tool in base group and ontology category

---

_Last updated: 2025-12-09_
