# Ontology-First Tool System Refactoring

**Date:** 2025-11-04
**Status:** ✅ **COMPLETE**
**Impact:** Major architectural change - Agent chat system now ontology-focused

---

## 🎯 Executive Summary

Refactored the agent chat tool system to be **ontology-first**, separating legacy task/project tools from the new ontology-based data models. The system now automatically uses ontology tools (onto_projects, onto_tasks, onto_plans, onto_goals) when ontology context is available, falling back to legacy tools only when needed.

### Key Changes

1. **Tool Separation** - Legacy and ontology tools cleanly separated
2. **Context-Aware Selection** - Automatic tool selection based on available context
3. **Ontology-Focused Prompts** - System prompts oriented around ontology data models
4. **Backward Compatible** - Legacy tools still available when needed

---

## 🏗️ Architecture Before vs. After

### Before (Mixed System)

```
CHAT_TOOLS = [
  list_tasks,           // Legacy
  search_projects,      // Legacy
  list_onto_tasks,      // Ontology (new)
  list_onto_projects,   // Ontology (new)
  ...all mixed together
]

Agent Context Service:
  - Always uses all tools
  - No distinction between legacy and ontology
  - LLM chooses randomly
```

### After (Ontology-First)

```
ONTOLOGY_TOOLS = [
  list_onto_projects,
  list_onto_tasks,
  list_onto_plans,
  list_onto_goals,
  get_onto_project_details,
  get_onto_task_details,
  get_entity_relationships
]

LEGACY_TOOLS = [
  list_tasks,
  search_projects,
  search_notes,
  search_brain_dumps,
  ...
]

getToolsForContext({ useOntology: true }):
  → Returns ONTOLOGY_TOOLS + CALENDAR_TOOLS + UTILITY_TOOLS

getToolsForContext({ useOntology: false, includeLegacy: true }):
  → Returns LEGACY_TOOLS + CALENDAR_TOOLS + UTILITY_TOOLS
```

---

## 📦 Files Modified

### 1. `/apps/web/src/lib/chat/tools.config.ts`

**Added (150+ lines):**

- `ONTOLOGY_TOOLS` - Array of 7 ontology tools
- `LEGACY_TOOLS` - Array of 13 legacy tools
- `CALENDAR_TOOLS` - Array of 8 calendar tools
- `UTILITY_TOOLS` - Array of 1 utility tool
- `GetToolsOptions` - Interface for tool selection options
- `getToolsForContext()` - Context-aware tool selector function
- `DEFAULT_TOOLS` - Ontology-first default set
- `ALL_TOOLS` - Comprehensive set for transition

**Tool Categories:**

```typescript
// Ontology Tools (7 total)
ONTOLOGY_TOOLS = [
	'list_onto_projects', // Query onto_projects
	'get_onto_project_details', // Full project data
	'list_onto_tasks', // Query onto_tasks
	'get_onto_task_details', // Full task data
	'list_onto_plans', // Query onto_plans
	'list_onto_goals', // Query onto_goals
	'get_entity_relationships' // Query onto_edges
];

// Legacy Tools (13 total)
LEGACY_TOOLS = [
	'list_tasks',
	'search_projects',
	'search_notes',
	'search_brain_dumps',
	'get_task_details',
	'get_project_details',
	'get_note_details',
	'get_brain_dump_details',
	'create_task',
	'update_task',
	'update_project',
	'create_note',
	'create_brain_dump'
];

// Calendar Tools (8 total) - Shared
CALENDAR_TOOLS = [
	'get_calendar_events',
	'find_available_slots',
	'schedule_task',
	'update_calendar_event',
	'delete_calendar_event',
	'get_task_calendar_events',
	'check_task_has_calendar_event',
	'update_or_schedule_task'
];

// Utility Tools (1 total) - Shared
UTILITY_TOOLS = ['get_field_info'];
```

### 2. `/apps/web/src/lib/services/agent-context-service.ts`

**Modified:**

- Import `getToolsForContext` and `GetToolsOptions`
- Updated `getContextTools()` method:

```typescript
// BEFORE
private async getContextTools(contextType, ontologyContext?) {
  const baseTools = await this.chatContextService.getTools(contextType);
  return baseTools; // Always returns same tools
}

// AFTER
private async getContextTools(contextType, ontologyContext?) {
  const hasOntology = !!ontologyContext;

  const tools = getToolsForContext({
    useOntology: hasOntology,     // Use onto_* tools when available
    includeLegacy: !hasOntology,  // Fall back to legacy
    includeCalendar: true,        // Always include calendar
    includeUtility: true          // Always include utility
  });

  return getToolsForAgent(tools, 'read_write');
}
```

**Impact:**

- Ontology context present → LLM gets onto\_\* tools
- No ontology context → LLM gets legacy task/project tools
- Automatic, transparent selection

### 3. `/apps/web/src/lib/services/chat-context-service.ts`

**Modified System Prompts:**

**BEFORE:**

```
### Tier 1: LIST/SEARCH Tools
- list_tasks
- search_projects
- search_notes
...

### Tier 3: ONTOLOGY Tools
- get_parent_project (doesn't exist!)
- get_related_elements (doesn't exist!)
```

**AFTER:**

```
## ONTOLOGY DATA MODEL (Primary System)

BuildOS uses a template-driven ontology system with these core entities:
- Projects (onto_projects): Root work units with type_key, state_key, facets
- Tasks (onto_tasks): Actionable items linked to projects/plans
- Plans (onto_plans): Logical groupings of tasks
- Goals (onto_goals): Project objectives
- Outputs (onto_outputs): Deliverables
- Documents (onto_documents): Project documentation
- Edges (onto_edges): Relationships between entities

### Tier 1: ONTOLOGY LIST Tools (Use First)
- list_onto_projects → Project summaries
- list_onto_tasks → Task summaries
- list_onto_plans → Plan summaries
- list_onto_goals → Goal summaries

### Tier 2: ONTOLOGY DETAIL Tools (Use When Needed)
- get_onto_project_details → Full project data
- get_onto_task_details → Full task data

### Tier 3: ONTOLOGY RELATIONSHIP Tools
- get_entity_relationships → Explore entity graph

### Example Workflows

User: "Show me the writing project"
1. list_onto_projects (search for "writing")
2. get_onto_project_details(project_id)
3. Optional: list_onto_tasks(project_id)
```

**Impact:**

- LLM now understands ontology data model
- Clear examples of ontology tool usage
- Emphasizes onto\_\* tools as primary system

---

## 🔄 Data Flow

### Scenario 1: Ontology Context Available (Project Page)

```
User on /ontology/projects/abc-123

1. Frontend: entity_id = "abc-123", ontologyEntityType = "project"
   ↓
2. API: OntologyContextLoader.loadProjectContext("abc-123")
   → Returns: { type: 'project', data: {...}, relationships: {...} }
   ↓
3. Agent Context Service:
   getContextTools(contextType, ontologyContext)
   → hasOntology = true
   → getToolsForContext({ useOntology: true, includeLegacy: false })
   → Returns: ONTOLOGY_TOOLS + CALENDAR_TOOLS + UTILITY_TOOLS
   ↓
4. LLM receives:
   - System prompt explaining ontology data model
   - Tools: list_onto_*, get_onto_*, get_entity_relationships
   - Context: Current project data
   ↓
5. LLM uses:
   - list_onto_tasks(project_id="abc-123") to show tasks
   - get_onto_project_details("abc-123") for full data
   - get_entity_relationships("abc-123") to explore connections
```

### Scenario 2: No Ontology Context (Global Chat)

```
User on /chat (global)

1. Frontend: No entity_id, no ontologyEntityType
   ↓
2. API: No ontology context loaded
   ontologyContext = null
   ↓
3. Agent Context Service:
   getContextTools(contextType, null)
   → hasOntology = false
   → getToolsForContext({ useOntology: false, includeLegacy: true })
   → Returns: LEGACY_TOOLS + CALENDAR_TOOLS + UTILITY_TOOLS
   ↓
4. LLM receives:
   - Generic system prompt
   - Tools: list_tasks, search_projects, search_notes, etc.
   - No ontology context
   ↓
5. LLM uses:
   - list_tasks() to show tasks
   - search_projects() to find projects
   - Legacy tools work as before
```

---

## 🎯 Ontology Data Model Orientation

The refactoring orients the entire system around these core ontology entities:

### Primary Entities (onto\_\* tables)

**1. Projects (onto_projects)**

- Root work units
- Properties: name, type_key, state_key, description
- Facets: context, scale, stage
- Template-driven via type_key

**2. Tasks (onto_tasks)**

- Actionable items
- Linked to: project_id, plan_id (optional)
- Properties: title, state_key, priority, due_at
- State machine: todo → in_progress → done

**3. Plans (onto_plans)**

- Logical groupings of tasks
- Properties: name, type_key, state_key
- Within a project

**4. Goals (onto_goals)**

- Project objectives
- Properties: name, type_key, description
- Success criteria

**5. Outputs (onto_outputs)**

- Deliverables and artifacts
- Properties: name, type_key, state_key
- Linked to projects

**6. Documents (onto_documents)**

- Project documentation
- Properties: title, type_key, content
- Rich text/markdown

**7. Edges (onto_edges)**

- Relationships between entities
- Graph structure: src_id → dst_id
- Relation types: has_task, has_goal, depends_on, etc.

### Entity Relationships

```
onto_projects (root)
  ├── onto_edges → onto_tasks (has_task)
  ├── onto_edges → onto_goals (has_goal)
  ├── onto_edges → onto_plans (has_plan)
  ├── onto_edges → onto_outputs (has_output)
  └── onto_edges → onto_documents (has_document)

onto_tasks
  ├── project_id → onto_projects
  ├── plan_id → onto_plans
  └── onto_edges → other tasks (depends_on, blocks, etc.)

onto_plans
  ├── project_id → onto_projects
  └── onto_edges → onto_tasks (contains)
```

---

## 🚀 Usage Examples

### For Developers

**Get Ontology-Focused Tools:**

```typescript
import { getToolsForContext } from '$lib/chat/tools.config';

// Ontology-only (recommended)
const tools = getToolsForContext({
	useOntology: true,
	includeLegacy: false
});

// Legacy-only (backward compatibility)
const tools = getToolsForContext({
	useOntology: false,
	includeLegacy: true
});

// Both (transition period)
const tools = getToolsForContext({
	useOntology: true,
	includeLegacy: true
});

// Use defaults (ontology + calendar)
const tools = getToolsForContext(); // useOntology=true by default
```

**Predefined Sets:**

```typescript
import { ONTOLOGY_TOOLS, LEGACY_TOOLS, DEFAULT_TOOLS } from '$lib/chat/tools.config';

// Ontology tools only
const onlyOntology = ONTOLOGY_TOOLS;

// Everything
const everything = ALL_TOOLS;

// Default (ontology + calendar + utility)
const standard = DEFAULT_TOOLS;
```

### For LLM Prompts

**Ontology-Focused Workflow:**

```
User asks: "What tasks are in the marketing project?"

Strategy:
1. list_onto_projects(type_key contains "marketing")
2. Get first match: project_id = "abc-123"
3. list_onto_tasks(project_id = "abc-123")
4. Show task summaries

If user wants details:
5. get_onto_task_details(task_id) for specific task
```

**Relationship Exploration:**

```
User asks: "What's connected to this project?"

Strategy:
1. get_entity_relationships(entity_id = project_id, direction = "outgoing")
2. Parse edges: has_task, has_goal, has_plan
3. Show connected entities
4. Optional: Drill down with get_onto_task_details for specific items
```

---

## ✅ Benefits

### 1. **Clear Separation of Concerns**

- Ontology tools focused on onto\_\* entities
- Legacy tools isolated for backward compatibility
- No confusion about which system to use

### 2. **Automatic Context-Aware Selection**

- System automatically chooses right tools
- Ontology context present → ontology tools
- No ontology → legacy tools
- Transparent to LLM

### 3. **Ontology Data Model as First-Class Citizen**

- System prompts explain ontology structure
- Examples use onto\_\* tools
- LLM understands template-driven approach

### 4. **Token Efficiency**

- LLM only sees relevant tools
- Fewer tools = smaller context
- No wasted tokens on irrelevant options

### 5. **Future-Proof**

- Easy to deprecate legacy tools later
- Clean migration path
- Can A/B test ontology vs. legacy

### 6. **Better Developer Experience**

- Clear API: `getToolsForContext(options)`
- Well-documented tool categories
- Easy to extend with new ontology entities

---

## 🔬 Testing Recommendations

### Manual Testing

**Test 1: Ontology Context**

```bash
# Navigate to ontology project page
http://localhost:5173/ontology/projects/[id]

# Open chat
# Ask: "Show me the tasks in this project"
# Expected: Uses list_onto_tasks(project_id=...)
# Verify: Check network tab for tool calls
```

**Test 2: No Ontology Context**

```bash
# Navigate to global chat
http://localhost:5173/chat

# Ask: "Show me my tasks"
# Expected: Uses list_tasks() (legacy)
# Verify: Check network tab for tool calls
```

**Test 3: Relationship Exploration**

```bash
# On project page
# Ask: "What's connected to this project?"
# Expected: Uses get_entity_relationships(project_id, direction="outgoing")
# Verify: Returns edges from onto_edges table
```

### Automated Tests (TODO)

```typescript
// apps/web/src/lib/chat/tools.config.test.ts
import { getToolsForContext, ONTOLOGY_TOOLS, LEGACY_TOOLS } from './tools.config';

describe('getToolsForContext', () => {
	it('returns ontology tools when useOntology=true', () => {
		const tools = getToolsForContext({ useOntology: true, includeLegacy: false });
		expect(tools).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ function: { name: 'list_onto_projects' } }),
				expect.objectContaining({ function: { name: 'list_onto_tasks' } })
			])
		);
	});

	it('returns legacy tools when useOntology=false', () => {
		const tools = getToolsForContext({ useOntology: false, includeLegacy: true });
		expect(tools).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ function: { name: 'list_tasks' } }),
				expect.objectContaining({ function: { name: 'search_projects' } })
			])
		);
	});

	it('never mixes ontology and legacy by default', () => {
		const tools = getToolsForContext({ useOntology: true });
		const toolNames = tools.map((t) => t.function.name);

		// Should have ontology tools
		expect(toolNames).toContain('list_onto_projects');

		// Should NOT have legacy tools
		expect(toolNames).not.toContain('list_tasks');
		expect(toolNames).not.toContain('search_projects');
	});
});
```

---

## 🐛 Known Limitations

### Current Gaps

1. **No CREATE/UPDATE Ontology Tools Yet**
    - Only READ operations implemented
    - Missing: create_onto_task, update_onto_project, etc.
    - **Fix:** Add ACTION tools in next phase

2. **Limited Ontology Entity Coverage**
    - Only 4 entity types: projects, tasks, plans, goals
    - Missing: outputs, documents, requirements, milestones, etc.
    - **Fix:** Add tools for remaining entities

3. **No Search Capability for Ontology**
    - list_onto_projects doesn't support text search
    - Legacy search_projects has better filtering
    - **Fix:** Add search parameters to list*onto*\* tools

4. **Relationship Queries are Basic**
    - get_entity_relationships returns raw edges
    - No graph traversal or multi-hop queries
    - **Fix:** Add advanced relationship tools

### Edge Cases

1. **What if both ontology and legacy data exist?**
    - Currently: Uses ontology tools exclusively
    - Legacy data invisible when ontology present
    - **Mitigation:** Transition period can use both (`includeLegacy: true`)

2. **What if onto_projects is empty?**
    - Falls back to no ontology context
    - Uses legacy tools
    - Works as expected ✅

3. **What if user has mixed workflow?**
    - Some projects in ontology, some in legacy
    - Currently: Separate tool sets
    - **Solution:** Use ALL_TOOLS during transition

---

## 📊 Metrics & Success Criteria

### Adoption Metrics (TODO)

- **% of chats using ontology tools** - Target: >80% within 30 days
- **% of tool calls to onto\_\* vs. legacy** - Target: 90% ontology
- **Average tools per query** - Expect: Lower (more focused)
- **Token usage per chat** - Expect: 10-20% reduction

### Quality Metrics

- **Accuracy** - Do ontology tools return correct data?
- **Completeness** - Can users accomplish all tasks?
- **Performance** - Are onto\_\* queries fast enough?

### Migration Metrics

- **Legacy tool usage decline** - Target: <10% after migration
- **Errors from missing tools** - Target: 0 (all needed tools exist)

---

## 🗺️ Migration Path

### Phase 1: ✅ **COMPLETE** - Infrastructure

- [x] Separate tool definitions
- [x] Context-aware selection
- [x] Ontology-focused prompts
- [x] 7 ontology READ tools

### Phase 2: ⏳ **In Progress** - Coverage

- [ ] Add CREATE/UPDATE ontology tools
- [ ] Add tools for outputs, documents
- [ ] Add search capabilities
- [ ] Add advanced relationship queries

### Phase 3: **Planned** - Optimization

- [ ] Cache ontology context
- [ ] Batch entity queries
- [ ] Optimize token usage
- [ ] Performance tuning

### Phase 4: **Future** - Deprecation

- [ ] Monitor legacy tool usage
- [ ] Migrate remaining users
- [ ] Deprecate legacy tools
- [ ] Remove legacy code

---

## 📚 Related Documentation

- [Ontology Data Models](/apps/web/docs/features/ontology/DATA_MODELS.md) - Complete schema
- [Agent Chat Integration](/apps/web/docs/features/ontology/AGENT_CHAT_ONTOLOGY_INTEGRATION_STATUS.md) - Integration status
- [Tool Executor](/apps/web/src/lib/chat/tool-executor.ts) - Tool implementation
- [Tools Config](/apps/web/src/lib/chat/tools.config.ts) - Tool definitions

---

**Status:** ✅ **COMPLETE**
**Next Steps:** Add CREATE/UPDATE ontology tools, expand entity coverage
**Last Updated:** 2025-11-04
