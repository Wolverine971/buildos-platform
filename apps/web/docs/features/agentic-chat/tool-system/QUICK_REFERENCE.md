<!-- apps/web/docs/features/agentic-chat/tool-system/QUICK_REFERENCE.md -->

# BuildOS Tool System - Quick Reference

**Last Updated:** 2026-01-03

> **Task Schema Reference**: See [TYPE_KEY_TAXONOMY.md](../../ontology/TYPE_KEY_TAXONOMY.md#onto_tasks) for task work mode taxonomy.

## Tool Count & Categories

Total: **53 tools** (+ 1 virtual tool)

| Category                     | Count | Token Cost | Usage              |
| ---------------------------- | ----- | ---------- | ------------------ |
| Search (list/search)         | 16    | 350        | Discovery phase    |
| Read (detail/relations)      | 12    | 350        | Deep dives         |
| Write (create/update/delete) | 22    | 400        | Execution phase    |
| Utility/Knowledge            | 3     | 80-900     | Reference/guidance |

---

## All 53 Tools by Category

### Search Tools (16)

```
list_onto_projects
search_onto_projects
list_onto_tasks
search_onto_tasks
list_onto_plans
list_onto_goals
list_onto_documents
search_onto_documents
list_onto_outputs
list_onto_milestones
list_onto_risks
list_onto_decisions
list_onto_requirements
list_task_documents
search_ontology
web_search
```

### Read Tools (12)

```
get_onto_project_details
get_onto_task_details
get_onto_goal_details
get_onto_plan_details
get_onto_document_details
get_onto_output_details
get_onto_milestone_details
get_onto_risk_details
get_onto_decision_details
get_onto_requirement_details
get_entity_relationships
get_linked_entities
```

### Write Tools (22)

Create (6):

- create_onto_project
- create_onto_task
- create_onto_goal
- create_onto_plan
- create_onto_document
- create_task_document
  Link (2):

- link_onto_entities
- unlink_onto_edge

Update (10):

- update_onto_project
- update_onto_task
- update_onto_goal
- update_onto_plan
- update_onto_document
- update_onto_output
- update_onto_milestone
- update_onto_risk
- update_onto_decision
- update_onto_requirement

Delete (4):

- delete_onto_task
- delete_onto_goal
- delete_onto_plan
- delete_onto_document

### Utility/Knowledge Tools (3)

```
get_field_info
get_buildos_overview
get_buildos_usage_guide
```

### Virtual Tools (1)

```
agent_create_plan  (handled by orchestrator, not a real API tool)
```

---

## Tool Selection by Context

| Context              | Available Tools                   | Use Case               |
| -------------------- | --------------------------------- | ---------------------- |
| `global`             | Base + Global                     | Workspace discovery    |
| `project_create`     | Base + Project Create             | Bootstrap new projects |
| `project`            | Base + Project                    | Project work           |
| `calendar`           | Base + Global                     | Calendar planning      |
| `project_audit`      | Base + Project + Project Audit    | Project review         |
| `project_forecast`   | Base + Project + Project Forecast | Scenario planning      |
| `daily_brief_update` | Base                              | Brief generation       |

**Note:** Focused task/goal/plan/document conversations use `project` context with `project_focus` set.

---

## Project Creation Clarification Flow

For `project_create` context, the system first checks if there's sufficient information:

```
User message → ProjectCreationAnalyzer → Sufficient? → Yes → Proceed to creation
                                              ↓
                                             No → Ask clarifying questions (max 2 rounds)
```

**Sufficiency indicators:** project type keywords (app, book, etc.), deliverable verbs (build, create), goals, timeline, scale.

**Session tracking:** `chat_sessions.agent_metadata.projectClarification` stores round count and accumulated context.

**Key file:** `services/agentic-chat/analysis/project-creation-analyzer.ts`

---

## Core File Locations

| Purpose       | File                                                                            | Key Exports                                                 |
| ------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Definitions   | `apps/web/src/lib/services/agentic-chat/tools/core/definitions/index.ts`        | CHAT_TOOL_DEFINITIONS, TOOL_METADATA, ENTITY_FIELD_INFO     |
| Config        | `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`             | getToolsForContextType, TOOL_CATEGORIES, estimateToolTokens |
| Executor      | `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts` | ChatToolExecutor                                            |
| Service       | `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`    | ToolExecutionService (validation, telemetry)                |
| BuildOS Tools | `apps/web/src/lib/services/agentic-chat/tools/buildos/`                         | getBuildosOverviewDocument, getBuildosUsageGuide            |

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
2. `create_onto_task` - Add task to project ⚠️ **See Task Creation Philosophy below**
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

**State:**

```
todo → in_progress → blocked → done
```

**type_key Work Modes:** `task.execute` (default), `task.create`, `task.refine`, `task.research`, `task.review`, `task.coordinate`, `task.admin`, `task.plan`

**Specializations:** `task.coordinate.meeting`, `task.coordinate.standup`, `task.execute.deploy`, `task.execute.checklist`

### Plans

**State:**

```
draft → active → blocked → complete
```

**type_key Families:** Format: `plan.{family}[.{variant}]`

| Family   | Examples                                       |
| -------- | ---------------------------------------------- |
| timebox  | `plan.timebox.sprint`, `plan.timebox.weekly`   |
| pipeline | `plan.pipeline.sales`, `plan.pipeline.content` |
| campaign | `plan.campaign.marketing`                      |
| roadmap  | `plan.roadmap.product`                         |
| process  | `plan.process.client_onboarding`               |
| phase    | `plan.phase.project` (default)                 |

### Goals

**type_key Families:** Format: `goal.{family}[.{variant}]`

| Family   | Examples                                         |
| -------- | ------------------------------------------------ |
| outcome  | `goal.outcome.project`, `goal.outcome.milestone` |
| metric   | `goal.metric.revenue`, `goal.metric.usage`       |
| behavior | `goal.behavior.cadence`, `goal.behavior.routine` |
| learning | `goal.learning.skill`, `goal.learning.domain`    |

### Documents

**type_key Families:** Format: `document.{family}[.{variant}]`

| Family    | Examples                                                       |
| --------- | -------------------------------------------------------------- |
| context   | `document.context.project`, `document.context.brief`           |
| knowledge | `document.knowledge.research`, `document.knowledge.brain_dump` |
| decision  | `document.decision.meeting_notes`, `document.decision.rfc`     |
| spec      | `document.spec.product`, `document.spec.technical`             |
| reference | `document.reference.handbook`, `document.reference.sop`        |
| intake    | `document.intake.client`, `document.intake.project`            |

### Outputs

**type_key Families:** Format: `output.{family}[.{variant}]`

| Family      | Examples                                                   |
| ----------- | ---------------------------------------------------------- |
| written     | `output.written.article`, `output.written.blog_post`       |
| media       | `output.media.slide_deck`, `output.media.video`            |
| software    | `output.software.feature`, `output.software.release`       |
| operational | `output.operational.report`, `output.operational.contract` |

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

## Task Creation Philosophy ⚠️

**The Golden Rule:** Tasks should represent **FUTURE USER WORK**, not a log of what was discussed.

### When to Create Tasks

| ✅ Create                | Example                         | Why               |
| ------------------------ | ------------------------------- | ----------------- |
| User explicitly requests | "Add a task to call the client" | Explicit request  |
| Human action required    | "I need to review the design"   | User must do this |
| Future user action       | "Remind me to follow up"        | Tracking needed   |

### When NOT to Create Tasks

| ❌ Don't Create         | Example                    | Why                         |
| ----------------------- | -------------------------- | --------------------------- |
| Agent can help now      | "Help me brainstorm ideas" | Just help them              |
| Analysis/research       | "What are my blockers?"    | Analyze and respond         |
| About to do it yourself | Agent doing research       | Would create then complete  |
| To appear helpful       | Creating structure         | Only if user needs tracking |

### Decision Questions

1. Is this work the USER must do? → Create
2. Can I help RIGHT NOW? → Don't create, just help
3. Did user EXPLICITLY ask? → Create
4. Am I about to do this myself? → Don't create

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
