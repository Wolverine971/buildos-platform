# BuildOS Tool System - Quick Reference

**Last Updated:** 2025-11-17

## Tool Count & Categories

Total: **31 tools**

| Category                     | Count | Token Cost | Usage              |
| ---------------------------- | ----- | ---------- | ------------------ |
| Search (list/search)         | 8     | 350        | Discovery phase    |
| Read (detail)                | 2     | 350        | Deep dives         |
| Write (create/update/delete) | 12    | 400        | Execution phase    |
| Utility/Knowledge            | 9     | 80-900     | Reference/guidance |

---

## All 31 Tools by Category

### Search Tools (8)

```
list_onto_projects
search_onto_projects
list_onto_tasks
search_onto_tasks
list_onto_plans
list_onto_goals
list_onto_templates
get_entity_relationships
```

### Read Tools (2)

```
get_onto_project_details
get_onto_task_details
```

### Write Tools (12)

Create:

- create_onto_project
- create_onto_task
- create_onto_goal
- create_onto_plan

Update:

- update_onto_project
- update_onto_task

Delete:

- delete_onto_task
- delete_onto_goal
- delete_onto_plan

Special:

- request_template_creation

### Utility/Knowledge Tools (8)

```
get_field_info
get_buildos_overview
get_buildos_usage_guide
```

---

## Tool Selection by Context

| Context              | Available Tools                          | Use Case               |
| -------------------- | ---------------------------------------- | ---------------------- |
| `global`             | Base (4) + Global (7)                    | Workspace discovery    |
| `project_create`     | Base (4) + Create (3)                    | Bootstrap new projects |
| `project`            | Base (4) + Global (7) + Project ops (12) | Project work           |
| `task`               | Base (4) + Global (7) + Project ops (12) | Task focus             |
| `calendar`           | Base (4) + Global (7)                    | Calendar planning      |
| `project_audit`      | Base (4) + Project (12)                  | Project review         |
| `project_forecast`   | Base (4) + Project (12)                  | Scenario planning      |
| `task_update`        | Base (4) + Project (12)                  | Task updates           |
| `daily_brief_update` | Base (4)                                 | Brief generation       |

---

## Core File Locations

| Purpose       | File                                                                         | Key Exports                                                 |
| ------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Definitions   | `apps/web/src/lib/chat/tool-definitions.ts`                                  | CHAT_TOOL_DEFINITIONS, TOOL_METADATA, ENTITY_FIELD_INFO     |
| Config        | `apps/web/src/lib/chat/tools.config.ts`                                      | getToolsForContextType, TOOL_CATEGORIES, estimateToolTokens |
| Executor      | `apps/web/src/lib/chat/tool-executor.ts`                                     | ChatToolExecutor class (50+ methods)                        |
| Service       | `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts` | ToolExecutionService (validation, telemetry)                |
| BuildOS Tools | `apps/web/src/lib/services/agentic-chat/tools/buildos/`                      | getBuildosOverviewDocument, getBuildosUsageGuide            |

---

## Most Common Tools

### For Discovery

1. `search_onto_projects` - Find projects by keyword
2. `list_onto_tasks` - Get tasks for a project
3. `list_onto_templates` - Find templates for new projects

### For Reading

1. `get_onto_project_details` - Full project with nested entities
2. `get_onto_task_details` - Complete task information

### For Creating

1. `create_onto_project` - Bootstrap complete project structure
2. `create_onto_task` - Add task to project
3. `request_template_creation` - Escalate for new template

### For Updating

1. `update_onto_task` - Change task state/priority
2. `update_onto_project` - Change project status

### For Reference

1. `get_field_info` - Schema information
2. `get_buildos_overview` - Platform overview
3. `get_buildos_usage_guide` - Usage playbook

---

## Entity State Values

### Projects

```
draft → active → paused → complete → archived
```

### Tasks

```
todo → in_progress → blocked → done
```

### Plans

```
draft → active → blocked → complete
```

---

## Entity Facets

### Context (where work fits)

- personal, client, commercial, internal
- open_source, community, academic, nonprofit, startup

### Scale (project size)

- micro, small, medium, large, epic

### Stage (project phase)

- discovery, planning, execution, launch, maintenance, complete

---

## API Endpoints

| Tool                     | Endpoint                    | Method |
| ------------------------ | --------------------------- | ------ |
| list_onto_projects       | `/api/onto/projects`        | GET    |
| search_onto_projects     | `/api/onto/projects/search` | POST   |
| list_onto_tasks          | `/api/onto/tasks`           | GET    |
| search_onto_tasks        | `/api/onto/tasks/search`    | POST   |
| get_onto_project_details | `/api/onto/projects/{id}`   | GET    |
| get_onto_task_details    | `/api/onto/tasks/{id}`      | GET    |
| create_onto_project      | `/api/onto/projects`        | POST   |
| create_onto_task         | `/api/onto/tasks`           | POST   |
| update_onto_task         | `/api/onto/tasks/{id}`      | PUT    |
| delete_onto_task         | `/api/onto/tasks/{id}`      | DELETE |

---

## Usage Pattern: Progressive Disclosure

1. **Initial Discovery** (small context)

    ```typescript
    list_onto_projects({ limit: 10 });
    // Returns: [{ id, name, state, type }, ...]
    ```

2. **User Asks for Details** (on demand)

    ```typescript
    get_onto_project_details({ project_id: 'uuid' });
    // Returns: Full project with tasks, plans, goals, documents
    ```

3. **User Wants to Modify**
    ```typescript
    create_onto_task({ project_id: 'uuid', title: '...', priority: 4 });
    // Creates and returns new task
    ```

---

## Tool Validation

All tools validate:

- Tool exists in available tools list
- Required parameters present
- Parameter types match schema

---

## Error Handling

| Error Type             | Handling                              |
| ---------------------- | ------------------------------------- |
| Template not found     | Suggests `request_template_creation`  |
| Authentication fail    | Adds "(authentication required)" hint |
| 404 Resource not found | Adds "(resource not found)" hint      |
| Timeout (30s)          | Retryable with exponential backoff    |

---

## Adding a New Tool

1. Define in `tool-definitions.ts`:
    - function name
    - description
    - parameters (type, properties, required)

2. Add metadata in `TOOL_METADATA`:
    - summary
    - capabilities
    - contexts
    - category (search/read/write/utility)

3. Implement in `tool-executor.ts`:
    - Add case in execute() switch
    - Implement private handler method

4. Register in `tools.config.ts`:
    - Add to TOOL_GROUPS if needed
    - Update context mapping if needed

---

## Token Cost Estimation

```typescript
import { estimateToolTokens } from '$lib/chat/tools.config';

const tokens = estimateToolTokens('list_onto_projects');
// Returns: 350 (average for ontology category)
```

---

## Get Tools for Context

```typescript
import { getToolsForContextType } from '$lib/chat/tools.config';

const tools = getToolsForContextType('project_create', {
	includeBase: true,
	includeWriteTools: true
});
// Returns: ChatToolDefinition[] for project creation
```

---

## Tool Result Format

```typescript
interface ToolExecutionResult {
	success: boolean;
	data?: any;
	error?: string;
	toolName: string;
	toolCallId: string;
	entitiesAccessed?: string[];
	streamEvents?: StreamEvent[];
}
```

---

## BuildOS Knowledge Tools

### get_buildos_overview

Returns sections:

1. Mission & Core Promise
2. Platform & Architecture
3. Feature Landscape
4. Ontology & Template System
5. Agentic Chat & Tooling
6. Conversation Modes & Project Focus
7. Experience & Design System

### get_buildos_usage_guide

Returns sections:

1. Onboard & Prime Workspace
2. Capture via Brain Dumps
3. Choose Conversation Mode
4. Use Agentic Chat
5. Structure with Ontology
6. Automate Scheduling
7. Iterate with Templates

---

## Special Features

### Project Creation Clarifications

```typescript
clarifications: [
	{
		key: 'target_audience',
		question: 'Who is the target audience?',
		required: true,
		choices: ['personal', 'professional', 'mixed'],
		help_text: 'Helps inform facet selection'
	}
];
```

### Context Document Auto-Generation

If not provided, automatically generates from:

- Project name/description
- Goals list
- Initial tasks
- Braindump metadata

### Props as Flexible Metadata

```typescript
props: {
  facets: { context, scale, stage },
  description: "...",
  custom_field: "...",
  braindump: "..."
}
```

---

## Best Practices

1. **Start with search tools** for discovery
2. **Use detail tools** only when needed
3. **Batch operations** with `batchExecuteTools()`
4. **Always validate** before modification
5. **Check entity relationships** with `get_entity_relationships()`
6. **Reference get_field_info** for schema questions
7. **Use BuildOS overview/guide** for education
8. **Provide context documents** for rich project context
9. **Set facets correctly** for discoverability
10. **Use props flexibly** for custom metadata

---

## Related Documentation

- Full Guide: `/Users/annawayne/buildos-platform/TOOL_SYSTEM_DOCUMENTATION.md`
- Tool System Spec: `/apps/web/docs/features/agentic-chat/AGENT_TOOL_SYSTEM_SPEC.md`
- Ontology System: `/apps/web/docs/features/ontology/README.md`
- API Reference: `/apps/web/docs/technical/api/`
