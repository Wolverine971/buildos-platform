# BuildOS Agentic Chat Tool System - Summary

## Overview

The BuildOS tool system provides a comprehensive, context-aware toolkit for LLMs to interact with the ontology system. It consists of 31 well-designed tools organized into 4 categories, with intelligent context-switching, progressive disclosure, and comprehensive error handling.

## Key Facts

- **Total Tools:** 31
- **Categories:** 4 (Search, Read, Write, Utility)
- **Contexts:** 9 different conversation modes with specific tool sets
- **Token Management:** Progressive disclosure to keep context window efficient
- **Special Features:** BuildOS knowledge tools for platform documentation

## Tool Locations (Absolute Paths)

1. **Tool Definitions**
    - Path: `/Users/annawayne/buildos-platform/apps/web/src/lib/chat/tool-definitions.ts`
    - Contains: CHAT_TOOL_DEFINITIONS (31 tools), TOOL_METADATA, ENTITY_FIELD_INFO
    - Lines: 1,453 lines

2. **Tool Configuration**
    - Path: `/Users/annawayne/buildos-platform/apps/web/src/lib/chat/tools.config.ts`
    - Contains: Context mapping, tool grouping, helper functions
    - Lines: 256 lines

3. **Tool Executor (Runtime)**
    - Path: `/Users/annawayne/buildos-platform/apps/web/src/lib/chat/tool-executor.ts`
    - Contains: ChatToolExecutor class with 50+ handler methods
    - Lines: ~1,000+ lines

4. **Execution Service**
    - Path: `/Users/annawayne/buildos-platform/apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
    - Contains: ToolExecutionService with validation, telemetry, retry logic
    - Lines: 641 lines

5. **BuildOS Knowledge Tools**
    - Path: `/Users/annawayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/buildos/`
    - Contains: overview.ts, usage-guide.ts, references.ts, types.ts
    - Special tools for platform documentation

## Tool Inventory

### 1. Search Tools (8)

Enable discovery and querying across the ontology:

- `list_onto_projects` - List projects
- `search_onto_projects` - Keyword search projects
- `list_onto_tasks` - List tasks
- `search_onto_tasks` - Keyword search tasks
- `list_onto_plans` - List plans
- `list_onto_goals` - List goals
- `list_onto_templates` - Discover templates
- `get_entity_relationships` - Graph traversal

### 2. Read Tools (2)

Fetch detailed information on demand:

- `get_onto_project_details` - Full project with nested entities
- `get_onto_task_details` - Complete task information

### 3. Write Tools (12)

Perform create, update, delete operations:

**Create (4):**

- `create_onto_project`
- `create_onto_task`
- `create_onto_goal`
- `create_onto_plan`

**Update (2):**

- `update_onto_project`
- `update_onto_task`

**Delete (3):**

- `delete_onto_task`
- `delete_onto_goal`
- `delete_onto_plan`

**Special (1):**

- `request_template_creation`

### 4. Utility/Knowledge Tools (9)

Reference and documentation:

- `get_field_info` - Schema information
- `get_buildos_overview` - Platform overview documentation
- `get_buildos_usage_guide` - Step-by-step usage playbook

## Context-Based Tool Selection

The system uses 9 different conversation contexts, each with tailored tool sets:

| Context              | Tools Included              | Purpose                  |
| -------------------- | --------------------------- | ------------------------ |
| `global`             | Base + Global               | Workspace-wide discovery |
| `project_create`     | Base + Create               | Bootstrap new projects   |
| `project`            | Base + Global + Project ops | Project work             |
| `task`               | Base + Global + Project ops | Task-focused work        |
| `calendar`           | Base + Global               | Calendar planning        |
| `project_audit`      | Base + Project              | Project review           |
| `project_forecast`   | Base + Project              | Scenario planning        |
| `task_update`        | Base + Project              | Task updates             |
| `daily_brief_update` | Base only                   | Brief generation         |

## Progressive Disclosure Pattern

The system manages context window through a 3-step pattern:

1. **Initial Load** (small) - List/search returns abbreviated data (~200-400 tokens)
2. **On Demand** - User asks for more details
3. **Full Fetch** - Detail tool returns complete entity graph (~800 tokens)

This keeps initial responses fast and allows users to drill deeper as needed.

## Special BuildOS Tools

### get_buildos_overview

Returns structured platform documentation covering:

- Mission & core promise
- Architecture overview
- Feature landscape
- Ontology system
- Agentic chat
- Conversation modes
- Design system

### get_buildos_usage_guide

Returns hands-on playbook with sections:

- Onboarding
- Brain dump capture
- Conversation modes
- Agentic chat usage
- Ontology structuring
- Scheduling & automation
- Template iteration

## How Tools Execute

### Execution Flow

1. LLM calls a tool
2. ChatToolExecutor validates the call
3. Arguments are parsed and normalized
4. Appropriate handler method is invoked
5. HTTP request to backend API endpoint
6. Result is formatted and returned to LLM
7. Telemetry recorded

### Error Handling

The system provides helpful error messages:

- Template not found → Suggests `request_template_creation`
- Authentication fail → Adds "(authentication required)"
- Not found (404) → Adds "(resource not found)"
- Timeout (30s) → Supports retries with exponential backoff

## Entity Metadata

### State Machines

**Projects:**

```
draft → active → paused → complete → archived
```

**Tasks:**

```
todo → in_progress → blocked → done
```

**Plans:**

```
draft → active → blocked → complete
```

### Facet Classification

Projects use three facets for classification:

1. **Context** - Where work fits (personal, client, commercial, etc.)
2. **Scale** - Project size (micro, small, medium, large, epic)
3. **Stage** - Work phase (discovery, planning, execution, launch, maintenance, complete)

### Flexible Props

All entities can store custom metadata in a `props` JSON object:

```typescript
props: {
  facets: { context, scale, stage },
  description: "...",
  custom_field: "...",
  braindump: "..."
}
```

## Development Patterns

### Adding a New Tool

1. Define in `tool-definitions.ts` (schema)
2. Add metadata in `TOOL_METADATA` (description, capabilities, contexts)
3. Implement in `tool-executor.ts` (handler method)
4. Register in `tools.config.ts` (context mapping)

### Testing

```typescript
const executor = new ChatToolExecutor(supabase, userId);
const result = await executor.execute(toolCall);
expect(result.success).toBe(true);
```

### Token Cost Estimation

```typescript
import { estimateToolTokens } from '$lib/chat/tools.config';
const tokens = estimateToolTokens('list_onto_projects');
```

## Related Documentation

**In Repository:**

- Tool System Spec: `/apps/web/docs/features/agentic-chat/AGENT_TOOL_SYSTEM_SPEC.md`
- Ontology System: `/apps/web/docs/features/ontology/README.md`
- Chat Architecture: `/apps/web/docs/features/agentic-chat/ARCHITECTURE_IMPROVEMENTS_2025-11-14.md`

**Generated (This Session):**

- Comprehensive Guide: `/Users/annawayne/buildos-platform/TOOL_SYSTEM_DOCUMENTATION.md`
- Quick Reference: `/Users/annawayne/buildos-platform/TOOL_SYSTEM_QUICK_REFERENCE.md`
- This Summary: `/Users/annawayne/buildos-platform/TOOL_SYSTEM_SUMMARY.md`

## Design Principles

1. **Progressive Disclosure** - Start small, fetch details on demand
2. **Context Awareness** - Different contexts get different tools
3. **Clear Semantics** - Tool names clearly indicate their purpose
4. **Safe Operations** - Validation before execution
5. **Observable** - Telemetry and logging for all operations
6. **Helpful Errors** - Errors suggest next steps
7. **Flexible Metadata** - Props for custom data without schema changes
8. **Token Efficiency** - Abbreviation for searches, details on demand

## Key Statistics

- **Supported Entity Types:** 5 (projects, tasks, plans, goals, templates)
- **Search/List Tools:** 8 (optimized for discovery)
- **Detail Tools:** 2 (for deep dives)
- **Write Tools:** 12 (CRUD operations)
- **Field Properties Documented:** 40+ across entities
- **State Transitions:** 3 different state machines
- **Facet Dimensions:** 3 (context, scale, stage)
- **Facet Values:** 19 total options
- **Conversation Contexts:** 9 modes

## Next Steps

The system is currently feature-complete with opportunities for:

1. **Project Audit Tools** - Dedicated diagnostics and analysis tools
2. **Project Forecast Tools** - Scenario planning and simulation
3. **Semantic Search** - Full-text search across all entities
4. **Advanced Analytics** - Risk scoring, timeline analysis

## Contact & Questions

For questions about the tool system, refer to:

- AGENT_TOOL_SYSTEM_SPEC.md for architectural decisions
- Individual tool documentation in TOOL_SYSTEM_DOCUMENTATION.md
- Quick reference in TOOL_SYSTEM_QUICK_REFERENCE.md

---

**Documentation Generated:** 2025-11-17
**Tool System Version:** 1.0 (31 tools, 9 contexts)
