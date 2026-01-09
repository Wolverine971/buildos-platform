<!-- apps/web/docs/features/agentic-chat/tool-system/DOCUMENTATION.md -->

# BuildOS Agentic Chat Tool System Documentation

**Last Updated:** 2026-01-03

This document provides a complete overview of the tool system used by the agentic chat in BuildOS. It covers tool definitions, categorization, registration, execution, and result formatting.

## Quick Navigation

- **Tool Definitions:** `/apps/web/src/lib/services/agentic-chat/tools/core/definitions/index.ts`
- **Tool Configuration:** `/apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`
- **Tool Execution:** `/apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts`
- **BuildOS-Specific Tools:** `/apps/web/src/lib/services/agentic-chat/tools/buildos/`
- **Execution Service:** `/apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`

## Overview: Tool System Architecture

The BuildOS tool system is designed around **progressive disclosure** and **context awareness**:

1. **Tool Definitions** - Raw schemas defining what tools exist (name, description, parameters)
2. **Tool Configuration** - Context-aware grouping and orchestration (which tools available in which contexts)
3. **Tool Execution** - Runtime execution with validation, error handling, and telemetry
4. **BuildOS Knowledge Tools** - Special tools that serve documentation and guidance

```
┌─────────────────────────────────────────────────────────────┐
│                    Chat Tool System Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. LLM Decides to Call Tool                                 │
│     ↓                                                         │
│  2. Tool Call Validation (ChatToolExecutor)                  │
│     ↓                                                         │
│  3. Parameter Normalization & Parsing                        │
│     ↓                                                         │
│  4. Tool Execution (with timeout & retry logic)              │
│     ↓                                                         │
│  5. Result Formatting & Entity Extraction                    │
│     ↓                                                         │
│  6. Return to LLM with Telemetry                             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 1: Tool Definitions

**File:** `/apps/web/src/lib/chat/tool-definitions.ts`

This file contains:

- Complete `CHAT_TOOL_DEFINITIONS` array with OpenAI-compatible function schemas
- `TOOL_METADATA` with capabilities and context scoping information
- `ENTITY_FIELD_INFO` providing authoritative information about ontology entity fields

### 1.1 Tool Categories & Count

The tool system contains **54 tools** organized into 4 categories:

#### 1.1.1 Search Tools (17 tools)

Tools for discovery and listing across the ontology:

| Tool Name                | Purpose                               | Parameters                                                                          |
| ------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------- |
| `list_onto_projects`     | List projects with filtering          | `state_key`, `type_key`, `limit`                                                    |
| `search_onto_projects`   | Keyword search for projects           | `search` (required), `state_key`, `type_key`, `limit`                               |
| `list_onto_tasks`        | List tasks with optional filtering    | `project_id`, `state_key`, `limit`                                                  |
| `search_onto_tasks`      | Keyword search for tasks              | `search` (required), `project_id`, `state_key`, `limit`                             |
| `list_onto_plans`        | List plans for a project              | `project_id`, `limit`                                                               |
| `list_onto_goals`        | List goals for a project              | `project_id`, `limit`                                                               |
| `list_onto_documents`    | List documents with filters           | `project_id`, `type_key`, `state_key`, `limit`                                      |
| `search_onto_documents`  | Keyword search for documents          | `search` (required), `project_id`, `type_key`, `state_key`                          |
| `list_onto_outputs`      | List outputs with status              | `project_id`, `state_key`, `limit`                                                  |
| `list_onto_milestones`   | List milestones with dates            | `project_id`, `state_key`, `limit`                                                  |
| `list_onto_risks`        | List risks with impact                | `project_id`, `state_key`, `impact`, `limit`                                        |
| `list_onto_decisions`    | List decisions                        | `project_id`, `limit`                                                               |
| `list_onto_requirements` | List requirements                     | `project_id`, `type_key`, `limit`                                                   |
| `list_task_documents`    | List documents linked to a task       | `task_id` (required)                                                                |
| `search_ontology`        | Fuzzy search across ontology entities | `query` (required), `project_id`, `types`, `limit`                                  |
| `web_search`             | Web research                          | `query` (required), `max_results`, `search_depth`                                   |
| `web_visit`              | Read a specific URL                   | `url` (required), `mode`, `max_chars`, `max_html_chars`, `output_format`, `persist` |

**Token Cost:** Low (350 tokens average per category)

#### 1.1.2 Read Tools (12 tools)

Tools for fetching detailed entity information:

| Tool Name                      | Purpose                               | Parameters                          |
| ------------------------------ | ------------------------------------- | ----------------------------------- |
| `get_onto_project_details`     | Get full project with nested entities | `project_id` (required)             |
| `get_onto_task_details`        | Get complete task information         | `task_id` (required)                |
| `get_onto_goal_details`        | Get complete goal information         | `goal_id` (required)                |
| `get_onto_plan_details`        | Get complete plan information         | `plan_id` (required)                |
| `get_onto_document_details`    | Get complete document information     | `document_id` (required)            |
| `get_onto_output_details`      | Get complete output information       | `output_id` (required)              |
| `get_onto_milestone_details`   | Get complete milestone information    | `milestone_id` (required)           |
| `get_onto_risk_details`        | Get complete risk information         | `risk_id` (required)                |
| `get_onto_decision_details`    | Get complete decision information     | `decision_id` (required)            |
| `get_onto_requirement_details` | Get complete requirement information  | `requirement_id` (required)         |
| `get_entity_relationships`     | Graph traversal of connections        | `entity_id` (required), `direction` |
| `get_linked_entities`          | Rich linked entity details            | `entity_id`, `entity_kind`          |

**Token Cost:** Medium (350 tokens average)

#### 1.1.3 Write/Action Tools (22 tools)

Tools for creating, updating, and deleting entities:

**Create Tools (6):**
| Tool Name | Purpose | Key Parameters |
|-----------|---------|-----------------|
| `create_onto_project` | Create new project with full structure | `project` (required), `entities` (required), `relationships` (required), `context_document` |
| `create_onto_task` | Create task within a project | `project_id` (required), `title` (required), `type_key`, `description`, `priority`, `plan_id`, `goal_id`, `supporting_milestone_id` |
| `create_onto_goal` | Create goal for a project | `project_id` (required), `name` (required) |
| `create_onto_plan` | Create plan for grouping tasks | `project_id` (required), `name` (required) |
| `create_onto_document` | Create document for a project | `project_id`, `title`, `type_key` |
| `create_task_document` | Create/attach document to a task | `task_id` (required) |

> **Task type_key Reference**: See [TYPE_KEY_TAXONOMY.md](../../ontology/TYPE_KEY_TAXONOMY.md#onto_tasks) for work mode taxonomy.
> **Project creation**: `create_onto_project` accepts **only** `entities` + `relationships`. Legacy
> arrays are rejected with a hard 400. `relationships` is required even if empty
> (use `[]` for a single unlinked entity). See
> `apps/web/docs/features/agentic-chat/PROJECT_CREATION_FLOW_UPDATE_PLAN.md`.
>
> **Structure Philosophy**: Start simple. Most new projects need just project + 1 goal.
> Add plans/milestones only when the user describes phases or checkpoints.
> The system auto-organizes containment; just express what connects to what.

**Link Tools (2):**
| Tool Name | Purpose | Key Parameters |
|-----------|---------|-----------------|
| `link_onto_entities` | Create a relationship edge | `src_kind`, `src_id`, `dst_kind`, `dst_id`, `rel` |
| `unlink_onto_edge` | Remove a relationship edge | `edge_id` (required) |

**Update Tools (10):**
| Tool Name | Purpose | Key Parameters |
|-----------|---------|-----------------|
| `update_onto_project` | Modify project details | `project_id` (required), `name`, `state_key`, `props` |
| `update_onto_task` | Modify task details | `task_id` (required), `type_key`, `state_key`, `priority`, `goal_id`, `supporting_milestone_id` |
| `update_onto_goal` | Modify goal details | `goal_id` (required), `name`, `state_key`, `props` |
| `update_onto_plan` | Modify plan details | `plan_id` (required), `name`, `state_key`, `props` |
| `update_onto_document` | Modify document details | `document_id` (required), `title`, `state_key`, `content` |
| `update_onto_output` | Modify output details | `output_id` (required), `name`, `state_key`, `props` |
| `update_onto_milestone` | Modify milestone details | `milestone_id` (required), `title`, `due_at`, `state_key` |
| `update_onto_risk` | Modify risk details | `risk_id` (required), `title`, `state_key`, `props` |
| `update_onto_decision` | Modify decision details | `decision_id` (required), `title`, `decision_at`, `props` |
| `update_onto_requirement` | Modify requirement details | `requirement_id` (required), `text`, `priority`, `props` |

**Delete Tools (4):**
| Tool Name | Purpose | Key Parameters |
|-----------|---------|-----------------|
| `delete_onto_task` | Remove a task | `task_id` (required) |
| `delete_onto_goal` | Remove a goal | `goal_id` (required) |
| `delete_onto_plan` | Remove a plan | `plan_id` (required) |
| `delete_onto_document` | Remove a document | `document_id` (required) |

**Token Cost:** Medium (400 tokens average)

#### 1.1.4 Utility/Knowledge Tools (3 tools)

Tools for schema info, documentation, and reference:

| Tool Name                 | Purpose                         | Parameters                                        | Returns                                                             |
| ------------------------- | ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| `get_field_info`          | Get authoritative field schemas | `entity_type` (required), `field_name` (optional) | Field types, enums, descriptions, examples                          |
| `get_buildos_overview`    | High-level platform reference   | None                                              | Sections on mission, architecture, features, ontology, agentic chat |
| `get_buildos_usage_guide` | Step-by-step usage playbook     | None                                              | Sections on onboarding, brain dumps, conversation modes, scheduling |

**Token Cost:** Low-Medium (80-900 tokens depending on tool)

### 1.2 Entity Field Information Schema

The `ENTITY_FIELD_INFO` object provides authoritative information about ontology entities:

```typescript
export interface FieldInfo {
	type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'enum';
	description: string;
	required?: boolean;
	enum_values?: string[];
	example?: string;
}
```

**Documented Entities:**

1. **ontology_project**
    - Fields: `name`, `type_key`, `state_key`, `description`, `facet_context`, `facet_scale`, `facet_stage`, `props`, `start_at`, `end_at`
    - State values: `['draft', 'active', 'paused', 'complete', 'archived']`
    - Facet context: `['personal', 'client', 'commercial', 'internal', 'open_source', 'community', 'academic', 'nonprofit', 'startup']`
    - Facet scale: `['micro', 'small', 'medium', 'large', 'epic']`
    - Facet stage: `['discovery', 'planning', 'execution', 'launch', 'maintenance', 'complete']`

2. **ontology_task**
    - Fields: `title`, `state_key`, `priority`, `due_at`, `plan_id`, `type_key`, `props`
    - State values: `['todo', 'in_progress', 'blocked', 'done']`
    - Priority: 1-5 (higher = more important)

3. **ontology_plan**
    - Fields: `name`, `type_key`, `state_key`, `props`
    - State values: `['draft', 'active', 'blocked', 'complete']`

4. **ontology_goal**
    - Fields: `name`, `type_key`, `props`

5. **ontology_template**
    - Fields: `scope`, `realm`, `type_key`, `description`
    - Scope values: `['project', 'plan', 'task', 'output', 'document', 'goal', 'requirement']`

---

## Part 2: Tool Configuration & Context Awareness

**File:** `/apps/web/src/lib/chat/tools.config.ts`

This file manages which tools are available in different conversation contexts and provides helper functions for tool selection.

### 2.1 Tool Categories Configuration

Tools are grouped by category for cost estimation and organization:

```typescript
TOOL_CATEGORIES = {
  ontology: {
    tools: [10 tools for listing/searching],
    averageTokens: 350,
    costTier: 'medium'
  },
  ontology_action: {
    tools: [10 tools for creating/updating/deleting],
    averageTokens: 400,
    costTier: 'medium'
  },
  utility: {
    tools: ['get_field_info'],
    averageTokens: 80,
    costTier: 'low'
  },
  buildos_docs: {
    tools: ['get_buildos_overview', 'get_buildos_usage_guide'],
    averageTokens: 900,
    costTier: 'medium'
  }
}
```

### 2.2 Context-Based Tool Groups

Tools are organized by `ToolContextScope` - defining which tools are available in different conversation contexts:

```typescript
type ToolContextScope =
	| 'base' // Shared utilities
	| 'global' // Cross-project discovery
	| 'project_create' // Creating new projects
	| 'project' // Project-focused operations
	| 'project_audit' // Project review/analysis
	| 'project_forecast'; // Scenario planning
```

#### 2.2.1 Base Tools (4 tools)

Available in every context:

- `get_field_info` - Schema lookup
- `get_entity_relationships` - Relationship graph traversal
- `get_buildos_overview` - Platform overview
- `get_buildos_usage_guide` - Usage guide

#### 2.2.2 Global Tools (7 tools)

For workspace-wide discovery:

- `list_onto_projects`, `search_onto_projects`
- `list_onto_tasks`, `search_onto_tasks`
- `list_onto_goals`, `list_onto_plans`
- `list_onto_templates`

#### 2.2.3 Project Create Tools (3 tools)

For bootstrapping new projects:

- `list_onto_templates`
- `request_template_creation`
- `create_onto_project`

#### 2.2.4 Project Tools (12 tools)

For operations within a specific project:

- All listing/search tools from global
- Detail retrieval tools (`get_onto_project_details`, `get_onto_task_details`)
- All action tools (create, update, delete)

#### 2.2.5 Project Audit & Forecast Tools

Currently mirrors project tools (TODO for specialized tooling)

### 2.3 ChatContextType to Tool Mapping

Different conversation modes get different tool sets:

```typescript
CONTEXT_TO_TOOL_GROUPS: Record<PlannerContextType, ToolContextScope[]> = {
	global: ['base', 'global'],
	project_create: ['base', 'project_create'],
	project: ['base', 'project'],
	calendar: ['base', 'global'],
	project_audit: ['base', 'project', 'project_audit'],
	project_forecast: ['base', 'project', 'project_forecast'],
	daily_brief_update: ['base']
};
```

Focused task/goal/plan/document conversations are handled via `project` context with `project_focus` set.

### 2.4 Helper Functions

The configuration exports several utility functions:

```typescript
// Get tools for a specific context
getToolsForContextType(contextType: PlannerContextType, options?: GetToolsOptions): ChatToolDefinition[]

// Get tools with flexible options
getToolsForContext(options?: GetToolsOptions & { contextType?: PlannerContextType }): ChatToolDefinition[]

// Extract specific tools by name
extractTools(names: string[]): ChatToolDefinition[]

// Get tool category (ontology, ontology_action, utility, buildos_docs)
getToolCategory(toolName: string): keyof typeof TOOL_CATEGORIES | null

// Estimate tokens for a tool (for cost calculation)
estimateToolTokens(toolName: string): number

// Format tool summaries for LLM prompts
formatToolSummaries(tools: ChatToolDefinition[]): string
getToolSummaryLines(tools: ChatToolDefinition[]): string[]
```

---

## Part 3: Tool Execution

**File:** `/apps/web/src/lib/chat/tool-executor.ts`

The `ChatToolExecutor` class handles the actual execution of tool calls.

### 3.1 Execution Flow

1. **Validate Tool Call** - Check tool exists and arguments match schema
2. **Parse Arguments** - Normalize JSON arguments to object
3. **Delegate to Handler** - Route to appropriate method (50+ methods)
4. **API Call** - Make authenticated HTTP request to backend endpoint
5. **Format Result** - Extract data and stream events
6. **Log Execution** - Record telemetry and audit trail

### 3.2 Tool Implementation Pattern

Each tool follows a handler pattern:

```typescript
private async listOntoProjects(args: ListOntoProjectsArgs): Promise<any> {
  // 1. Validate arguments
  // 2. Call API endpoint
  // 3. Format result for LLM consumption
  return data;
}
```

### 3.3 API Endpoint Integration

Tools call backend API endpoints:

```typescript
private async apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T>
```

**Key API Endpoints:**

| Tool                   | Endpoint                         | Method |
| ---------------------- | -------------------------------- | ------ |
| `list_onto_projects`   | `/api/onto/projects`             | GET    |
| `search_onto_projects` | `/api/onto/projects/search`      | POST   |
| `list_onto_tasks`      | `/api/onto/tasks`                | GET    |
| `create_onto_project`  | `/api/onto/projects/instantiate` | POST   |
| `update_onto_task`     | `/api/onto/tasks/:id`            | PUT    |
| `delete_onto_task`     | `/api/onto/tasks/:id`            | DELETE |

### 3.4 Error Handling & Special Cases

The executor includes specialized error handling:

```typescript
private normalizeExecutionError(
  error: unknown,
  toolName: string,
  args: Record<string, any>
): string
```

Special handling for:

- **Template not found** - Provides helpful guidance to call `request_template_creation`
- **Authentication** - Adds "(authentication required)" hint
- **404 errors** - Adds "(resource not found)" hint

### 3.5 Stream Events Extraction

Some tool results can include stream events for progressive UI updates:

```typescript
private extractStreamEvents(result: any): { payload: any, streamEvents?: any[] }
```

Tools can return `_stream_events` which are extracted and passed to the client.

### 3.6 Telemetry & Logging

Each tool execution is logged with:

- Tool name
- Execution duration (ms)
- Success/failure status
- Error message if failed

```typescript
private async logToolExecution(
  toolCall: ChatToolCall,
  payload: any,
  duration: number,
  success: boolean,
  errorMessage?: string
): Promise<void>
```

---

## Part 4: Tool Execution Service (Advanced)

**File:** `/apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`

A higher-level abstraction over the raw executor providing:

### 4.1 Key Features

1. **Timeout Support** - Default 30 seconds with configurable override
2. **Retry Logic** - Optional exponential backoff retries
3. **Validation** - Parameter type checking before execution
4. **Entity Extraction** - Automatic extraction of entity IDs from results
5. **Telemetry Hooks** - Pluggable telemetry callbacks
6. **Virtual Handlers** - Override real execution with custom handlers (for testing)

### 4.2 Validation

Before executing, the service validates:

- Tool exists in available tools list
- All required parameters are present
- Parameter types match schema (string, number, boolean, array)

```typescript
validateToolCall(
  toolCallOrName: ChatToolCall | string,
  availableToolsOrArgs?: ChatToolDefinition[] | undefined | Record<string, any>,
  availableTools?: ChatToolDefinition[] | undefined
): ToolValidation
```

### 4.3 Entity Extraction

Automatically extracts entity IDs from tool results for tracking:

```typescript
private extractEntitiesFromResult(result: any): string[]
```

Looks for:

- Direct `id` fields
- Fields ending in `_id` or `Id`
- Special `_entities_accessed` array

### 4.4 Batch Execution with Concurrency Control

Execute multiple tools with concurrency limits:

```typescript
async batchExecuteTools(
  toolCalls: ChatToolCall[],
  context: ServiceContext,
  availableTools: ChatToolDefinition[],
  maxConcurrency = 3,
  options: ToolExecutionOptions = {}
): Promise<ToolExecutionResult[]>
```

### 4.5 Telemetry Data

Telemetry includes:

```typescript
interface ToolExecutionTelemetry {
	toolName: string;
	durationMs: number;
	virtual: boolean;
}
```

Custom hooks can be provided:

```typescript
type ToolExecutionTelemetryHook = (
	result: ToolExecutionResult,
	telemetry: ToolExecutionTelemetry
) => void | Promise<void>;
```

---

## Part 5: BuildOS-Specific Knowledge Tools

**Location:** `/apps/web/src/lib/services/agentic-chat/tools/buildos/`

Special tools that serve BuildOS documentation and guidance rather than query/modify data.

### 5.1 Tool: `get_buildos_overview`

**Purpose:** Return the canonical BuildOS platform overview

**Returns:** Structured document with sections:

1. Mission & Core Promise
2. Platform & Architecture Overview
3. Feature Landscape
4. Ontology & Template System
5. Agentic Chat & Tooling
6. Conversation Modes & Project Focus
7. Experience & Design System

**Metadata:**

- Document title: "BuildOS Platform Overview"
- Last reviewed: 2025-11-14
- Recommended for: "What is BuildOS?", "What workflows does BuildOS support?"

### 5.2 Tool: `get_buildos_usage_guide`

**Purpose:** Return hands-on BuildOS usage playbook

**Returns:** Structured document with sections:

1. Onboard & Prime the Workspace
2. Capture Thoughts via Brain Dumps
3. Choose the Right Conversation Mode
4. Use Agentic Chat to Reason & Plan
5. Structure Work with the Ontology
6. Automate Scheduling & Reviews
7. Iterate with Templates & AI Agents

**Metadata:**

- Document title: "BuildOS Usage Guide"
- Last reviewed: 2025-11-14
- Recommended for: "How do I use BuildOS?", "Walk me through a workflow"

### 5.3 Response Format

Both knowledge tools return:

```typescript
interface BuildosDocPayload {
	documentTitle: string;
	lastReviewed: string;
	summary: string;
	sections: BuildosDocSection[];
	recommendedQuestions: string[];
	followUpActions: string[];
	notes?: string[];
}

interface BuildosDocSection {
	title: string;
	summary: string;
	highlights: string[];
	references: BuildosDocReference[];
}

interface BuildosDocReference {
	title: string;
	summary: string;
}
```

### 5.4 Key References Included

Knowledge tools reference these canonical topics:

- Agentic Workflow Design Context
- Web App Documentation Overview
- Features Documentation Index
- Ontology System Documentation
- Template Inheritance Notes
- Chat System Architecture
- Calendar Integration Feature
- Onboarding Feature Overview
- Style Guide
- Chat Conversation Modes & Project Focus

---

## Part 6: Tool Result Formatting

### 6.1 ToolExecutionResult Structure

All tools return a standardized result:

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

### 6.2 Result Formatting for LLM

The `ToolExecutionService` formats results for LLM consumption:

```typescript
formatToolResult(result: ToolExecutionResult): string
```

Output example:

```
Tool: list_onto_projects
Result:
{
  "projects": [
    {
      "id": "uuid",
      "name": "Project Name",
      "state_key": "active"
    }
  ]
}
Entities accessed: uuid1, uuid2
```

Results are truncated if over 4000 characters to manage token usage.

### 6.3 Abbreviation Pattern

For search/list tools, results use abbreviation to minimize tokens:

- Task: `{ id, title, state, type }`
- Project: `{ id, name, state, type, updated_at }`
- Plan: `{ id, name, state }`

Detail tools return complete entity information.

---

## Part 7: Tool Metadata & Categorization

**Defined in:** `/apps/web/src/lib/chat/tool-definitions.ts` - `TOOL_METADATA` object

Each tool has metadata describing:

```typescript
interface ToolMetadata {
	summary: string;
	capabilities: string[];
	contexts: ToolContextScope[];
	category: 'search' | 'read' | 'write' | 'utility';
}
```

### 7.1 Example Tool Metadata

```typescript
TOOL_METADATA['create_onto_project'] = {
	summary: 'End-to-end project creation using entities + relationships.',
	capabilities: ['Supports relationship-driven containment', 'Captures clarifications'],
	contexts: ['project_create', 'project'],
	category: 'write'
};

TOOL_METADATA['list_onto_tasks'] = {
	summary: 'Browse recent ontology tasks with status and owning project context.',
	capabilities: ['Filter by project or state', 'Returns abbreviated summaries for fast scans'],
	contexts: ['global', 'project', 'project_audit', 'project_forecast'],
	category: 'search'
};
```

---

## Part 8: Progressive Disclosure Strategy

The tool system implements progressive disclosure to manage context window:

### 8.1 Abbreviation in Search/List Operations

**First call:** Load abbreviated data (~200-400 tokens)

```json
{
	"id": "uuid",
	"name": "Project Name",
	"state": "active",
	"type": "writer.book"
}
```

**Follow-up call:** Request detailed data on demand

```typescript
// User asks: "Tell me more about this project"
// Agent calls: get_onto_project_details({ project_id: "uuid" })
```

**Second call returns:** Complete project with all nested entities (~800 tokens)

```json
{
  "project": { ... full details ... },
  "tasks": [ ... nested tasks ... ],
  "plans": [ ... nested plans ... ],
  "goals": [ ... nested goals ... ],
  "documents": [ ... nested documents ... ]
}
```

### 8.2 Tool Selection Strategy

Agents should prefer:

1. **Search/list tools first** for discovery
2. **Detail tools on demand** for deep dives
3. **Write tools only when ready** to commit changes

This keeps context small and responses fast.

---

## Part 9: Chat Tool Executor Integration

**File:** `/apps/web/src/lib/chat/tool-executor.ts`

The `ChatToolExecutor` is instantiated in chat routes:

```typescript
const executor = new ChatToolExecutor(supabase, userId, sessionId, fetchFn);

const result = await executor.execute(toolCall);
```

### 9.1 Executor Methods

The executor implements 50+ methods, each handling one tool:

```typescript
async execute(toolCall: ChatToolCall): Promise<ChatToolResult>
```

Internal methods:

- `listOntoProjects()`, `searchOntoProjects()`
- `listOntoTasks()`, `searchOntoTasks()`
- `listOntoPlans()`, `listOntoGoals()`
- `getOntoProjectDetails()`, `getOntoTaskDetails()`
- `getEntityRelationships()`
- `createOntoProject()`, `createOntoTask()`, etc.
- `updateOntoProject()`, `updateOntoTask()`
- `deleteOntoTask()`, `deleteOntoGoal()`, `deleteOntoPlan()`
- `listOntoTemplates()`, `requestTemplateCreation()`
- `getFieldInfo()`, `getBuildosOverviewDocument()`, `getBuildosUsageGuide()`

### 9.2 Context Document Auto-Generation

When creating projects, the executor automatically generates context documents:

```typescript
private buildContextDocumentSpec(args: CreateOntoProjectArgs): CreateOntoProjectArgs['context_document']
```

If no context document provided, it generates one from:

- Project name and description
- Goals/tasks from entities (kind === goal/task)
- Braindump metadata (if present)

---

## Part 10: Special Features & Patterns

### 10.1 Clarifications in Project Creation

The `create_onto_project` tool supports asking clarification questions:

```typescript
{
  clarifications?: Array<{
    key: string;           // Unique identifier
    question: string;       // The question to ask user
    required: boolean;      // Whether answer is required
    choices?: string[];     // Optional predefined choices
    help_text?: string;     // Help text for user
  }>
}
```

### 10.2 Template Inheritance

Projects can inherit from templates:

```typescript
// Template provides defaults
type_key: "writer.book"

// Project specifies facets
props: {
  facets: {
    context: "personal",   // personal|client|commercial|etc
    scale: "medium",       // micro|small|medium|large|epic
    stage: "planning"      // discovery|planning|execution|launch|etc
  }
}
```

### 10.3 Props as Flexible Metadata

Many entities store custom data in `props` (JSON object):

```typescript
props: {
  description: "...",           // Narrative details
  facets: { ... },               // Classification
  custom_field: "custom_value"   // User-defined fields
}
```

---

## Part 11: Related Files & References

### Core Files

- **Tool Definitions:** `/apps/web/src/lib/chat/tool-definitions.ts`
- **Tool Config:** `/apps/web/src/lib/chat/tools.config.ts`
- **Tool Executor:** `/apps/web/src/lib/chat/tool-executor.ts`
- **Execution Service:** `/apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
- **BuildOS Tools:** `/apps/web/src/lib/services/agentic-chat/tools/buildos/`

### API Endpoints

- **Onto Projects:** `/apps/web/src/routes/api/onto/projects/`
- **Onto Tasks:** `/apps/web/src/routes/api/onto/tasks/`
- **Onto Plans:** `/apps/web/src/routes/api/onto/plans/`
- **Onto Goals:** `/apps/web/src/routes/api/onto/goals/`

### Documentation

- **Tool System Spec:** `/apps/web/docs/features/agentic-chat/AGENT_TOOL_SYSTEM_SPEC.md`
- **Chat Architecture:** `/apps/web/docs/features/agentic-chat/ARCHITECTURE_IMPROVEMENTS_2025-11-14.md`
- **Ontology System:** `/apps/web/docs/features/ontology/README.md`

---

## Part 12: Development Patterns

### 12.1 Adding a New Tool

1. **Define in tool-definitions.ts:**

```typescript
{
  type: 'function',
  function: {
    name: 'my_new_tool',
    description: 'What it does',
    parameters: {
      type: 'object',
      properties: { ... },
      required: ['param1']
    }
  }
}
```

2. **Add metadata:**

```typescript
TOOL_METADATA['my_new_tool'] = {
  summary: '...',
  capabilities: [...],
  contexts: ['global', 'project'],
  category: 'search' | 'read' | 'write' | 'utility'
}
```

3. **Implement in tool-executor.ts:**

```typescript
case 'my_new_tool':
  result = await this.myNewTool(args);
  break;

private async myNewTool(args: MyNewToolArgs): Promise<any> {
  return await this.apiRequest('/api/my-endpoint', {
    method: 'GET'
  });
}
```

4. **Add to tool groups in tools.config.ts if needed:**

```typescript
TOOL_GROUPS['global'].push('my_new_tool');
```

### 12.2 Testing Tool Execution

```typescript
const executor = new ChatToolExecutor(supabase, userId);
const result = await executor.execute({
	id: 'call_123',
	type: 'function',
	function: {
		name: 'list_onto_projects',
		arguments: JSON.stringify({ limit: 10 })
	}
});

expect(result.success).toBe(true);
expect(result.data.projects).toBeDefined();
```

---

## Summary

The BuildOS tool system provides:

✓ **31 well-defined tools** across 4 categories (search, read, write, utility)
✓ **Context-aware tool selection** for different conversation modes
✓ **Progressive disclosure** to manage context window
✓ **Comprehensive error handling** with helpful guidance
✓ **Telemetry & logging** for observability
✓ **Knowledge tools** for documentation and guidance
✓ **Flexible entity metadata** via props and facets
✓ **Token cost estimation** for LLM planning

The design prioritizes **clarity**, **efficiency**, and **user guidance** while maintaining flexibility for future expansion.
