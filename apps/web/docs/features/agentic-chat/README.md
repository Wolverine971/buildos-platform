<!-- apps/web/docs/features/agentic-chat/README.md -->

# Agentic Chat System - Complete Architecture Documentation

> **Last Updated:** 2025-12-02
> **Status:** Comprehensive Technical Reference (Updated with accurate counts)
> **Maintainer:** BuildOS Platform Team

The BuildOS Agentic Chat System is a sophisticated multi-agent architecture that enables users to interact with the platform through natural language. It features a **planner-executor model**, **real-time SSE streaming**, and a **comprehensive tool system** for managing the ontology (projects, tasks, plans, goals, documents).

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Data Flow](#data-flow)
4. [Core Components](#core-components)
5. [Tool System](#tool-system)
6. [SSE Streaming Protocol](#sse-streaming-protocol)
7. [State Management](#state-management)
8. [API Reference](#api-reference)
9. [File Reference](#file-reference)
10. [Development Guide](#development-guide)
11. [Related Documentation](#related-documentation)

---

## Quick Start

### For Developers (15 minutes)

1. **Understand the Architecture**
    - Read this document's [Architecture Overview](#architecture-overview)
    - Review the [Data Flow](#data-flow) diagrams

2. **Explore Key Files**
    - Frontend: `src/lib/components/agent/AgentChatModal.svelte`
    - Backend: `src/routes/api/agent/stream/+server.ts`
    - Orchestrator: `src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`

3. **Learn the Tool System**
    - See [Tool System](#tool-system) section
    - Reference: [tool-system/QUICK_REFERENCE.md](./tool-system/QUICK_REFERENCE.md)

### For AI Agents

Before extending the agentic chat system:

1. **Read this document** - Understand the complete architecture
2. **Check Performance Docs** - [PERFORMANCE.md](./PERFORMANCE.md) for optimization patterns
3. **Review Tool Definitions** - `src/lib/services/agentic-chat/tools/core/tool-definitions.ts`

---

## Architecture Overview

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (SvelteKit)                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│  AgentChatModal.svelte (~2230 lines)                                             │
│  ├── Context Selection → ContextSelectionScreen.svelte                          │
│  ├── Message Display → AgentMessageList.svelte                                  │
│  ├── Input → AgentComposer.svelte (with voice support)                          │
│  ├── Project Focus → ProjectFocusSelector, ProjectActionSelector                │
│  └── Thinking Blocks → Collapsible activity visualization                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                        SSE STREAM (/api/agent/stream)                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                              BACKEND ORCHESTRATION                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│  AgentChatOrchestrator (~1048 lines)                                             │
│  ├── Context Building (AgentContextService ~1738 lines)                          │
│  ├── LLM Streaming (EnhancedLLMWrapper → SmartLLMService)                        │
│  ├── Tool Execution (ToolExecutionService → ChatToolExecutor ~2292 lines)        │
│  ├── Plan Orchestration (PlanOrchestrator ~1327 lines)                           │
│  └── Response Synthesis (ResponseSynthesizer ~600 lines)                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                              DATA LAYER                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│  Supabase Database (onto_* tables)                                               │
│  ├── onto_projects, onto_tasks, onto_plans, onto_goals                          │
│  ├── onto_documents, onto_outputs, onto_edges                                    │
│  └── chat_sessions, agent_agents, agent_plans                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Multi-Agent Model (Planner-Executor)

The system uses a hierarchical agent architecture:

| Agent Type              | Role                                                 | Token Budget | When Spawned             |
| ----------------------- | ---------------------------------------------------- | ------------ | ------------------------ |
| **Planner**             | Analyzes requests, creates plans, decides tool usage | ~5000 tokens | Every conversation turn  |
| **Executor**            | Carries out specific plan steps with focused tools   | ~1500 tokens | When plan step requires  |
| **Reviewer** (optional) | Critiques plans before execution                     | ~2000 tokens | When `agent_review` mode |

### Service Factory Pattern

Services are instantiated via `createAgentChatOrchestrator()` in `src/lib/services/agentic-chat/index.ts`:

```typescript
export function createAgentChatOrchestrator(
	supabase: SupabaseClient<Database>,
	options: AgenticChatFactoryOptions = {}
): AgentChatOrchestrator {
	// Creates: llmService, compressionService, contextService,
	//          persistenceService, toolExecutionService, executorService,
	//          executorCoordinator, planOrchestrator, responseSynthesizer
}
```

---

## Data Flow

### Complete Request Lifecycle

```
1. USER INPUT
   └── AgentChatModal.svelte sends POST to /api/agent/stream
       └── Payload: { message, session_id, context_type, entity_id, conversation_history, projectFocus }

2. API ENDPOINT (/api/agent/stream/+server.ts)
   └── Creates SSE stream via SSEProcessor.createSSEStream()
   └── Initializes AgentChatOrchestrator via createAgentChatOrchestrator()
   └── Calls orchestrator.streamConversation()

3. ORCHESTRATION (AgentChatOrchestrator.streamConversation)
   ├── 3a. Context Building
   │   └── AgentContextService.buildPlannerContext()
   │       ├── Loads ontology data (project, tasks, plans, goals)
   │       ├── Compresses conversation history if needed
   │       ├── Generates system prompt with tool descriptions
   │       └── Returns PlannerContext { systemPrompt, availableTools, conversationHistory }
   │
   ├── 3b. Planner Agent Record
   │   └── persistenceService.createAgent() → stores in agent_agents table
   │
   ├── 3c. Planner Loop (runPlannerLoop)
   │   ├── Streams LLM response via enhancedLLM.streamText()
   │   ├── Emits 'text' events for assistant content
   │   ├── Emits 'tool_call' events when LLM requests tools
   │   ├── Executes tools via ToolExecutionService.executeTool()
   │   ├── Emits 'tool_result' events with outcomes
   │   └── Loops until no more tool calls or limits reached
   │
   └── 3d. Plan Execution (if agent_create_plan tool called)
       ├── PlanOrchestrator.createPlanFromIntent()
       ├── Validates plan steps and dependencies
       ├── Executes steps (spawning Executor agents as needed)
       └── ResponseSynthesizer.synthesizeComplexResponse()

4. SSE EVENTS → Frontend
   └── SSEProcessor handles buffering, parsing, and dispatching
   └── AgentChatModal.handleSSEMessage() updates UI state

5. UI UPDATE
   └── Messages array updated → AgentMessageList re-renders
   └── Thinking blocks show tool activity
   └── Activity indicators show agent state
```

### SSE Event Types

| Event Type                             | Description                                 | Frontend Handler                        |
| -------------------------------------- | ------------------------------------------- | --------------------------------------- |
| `session`                              | Session hydration/creation                  | Updates `currentSession`                |
| `agent_state`                          | Planner state (thinking/executing/waiting)  | Updates `agentState`, `currentActivity` |
| `text`                                 | Streaming text content                      | `addOrUpdateAssistantMessage()`         |
| `tool_call`                            | Tool being invoked                          | Adds to thinking block activities       |
| `tool_result`                          | Tool execution result                       | Updates activity status                 |
| `plan_created`                         | Execution plan generated                    | Stores in `currentPlan`                 |
| `plan_ready_for_review`                | Plan awaiting user approval                 | Shows plan for review                   |
| `plan_review`                          | Review verdict (approved/changes_requested) | Updates plan state                      |
| `step_start` / `step_complete`         | Plan step progress                          | Updates plan visualization              |
| `executor_spawned` / `executor_result` | Executor agent lifecycle                    | Adds to thinking block                  |
| `context_shift`                        | Context changed by tool                     | Updates `selectedContextType`           |
| `context_usage`                        | Token usage statistics                      | Updates `contextUsage`                  |
| `focus_active` / `focus_changed`       | Project focus updates                       | Updates `projectFocus`                  |
| `clarifying_questions`                 | AI needs more info                          | `addClarifyingQuestionsMessage()`       |
| `template_*`                           | Template creation events                    | Activity logging                        |
| `done`                                 | Stream complete                             | Finalizes messages                      |
| `error`                                | Error occurred                              | Sets error state                        |

---

## Core Components

### Frontend Components

#### AgentChatModal.svelte

**Location:** `src/lib/components/agent/AgentChatModal.svelte`
**Lines:** ~2230
**Purpose:** Main chat interface container and orchestrator

**Key State (Svelte 5 Runes):**

```typescript
// Core conversation state
let messages = $state<UIMessage[]>([]);
let currentSession = $state<ChatSession | null>(null);
let isStreaming = $state(false);
let error = $state<string | null>(null);

// Agent state
let agentState = $state<AgentLoopState | null>(null);
let currentActivity = $state<string>('');
let currentPlan = $state<any>(null);

// Context state
let selectedContextType = $state<ChatContextType | null>(null);
let selectedEntityId = $state<string | undefined>(undefined);
let projectFocus = $state<ProjectFocus | null>(null);

// Thinking block tracking
let currentThinkingBlockId = $state<string | null>(null);
let currentAssistantMessageId = $state<string | null>(null);
```

**Key Functions:**
| Function | Purpose |
|----------|---------|
| `sendMessage()` | Initiates chat turn, creates SSE connection |
| `handleSSEMessage()` | Routes SSE events to handlers |
| `createThinkingBlock()` | Creates new thinking block for activities |
| `addActivityToThinkingBlock()` | Adds tool/step activity to current block |
| `handleContextSelect()` | Processes context selection |
| `resetConversation()` | Clears state for new conversation |

#### Supporting Components

| Component                       | Purpose                                     |
| ------------------------------- | ------------------------------------------- |
| `AgentMessageList.svelte`       | Renders messages and thinking blocks        |
| `AgentComposer.svelte`          | Input with voice support and send button    |
| `AgentChatHeader.svelte`        | Header with context info and navigation     |
| `ContextSelectionScreen.svelte` | Context/project selection UI                |
| `ProjectFocusSelector.svelte`   | Focused element selection within project    |
| `ProjectActionSelector.svelte`  | Action selection (workspace/audit/forecast) |

### Backend Services

#### AgentChatOrchestrator

**Location:** `src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
**Lines:** ~1048

**Dependencies:**

```typescript
interface AgentChatOrchestratorDependencies {
	planOrchestrator: PlanOrchestrator;
	toolExecutionService: ToolExecutionService;
	responseSynthesizer: ResponseSynthesizer;
	persistenceService: PersistenceOperations;
	contextService: AgentContextService;
	llmService: SmartLLMService;
	errorLogger: ErrorLoggerService;
}
```

**Key Methods:**
| Method | Purpose |
|--------|---------|
| `streamConversation()` | Main entry point, async generator |
| `runPlannerLoop()` | Core planner agent loop |
| `handlePlanToolCall()` | Processes `agent_create_plan` virtual tool |
| `handleAutoExecutePlan()` | Executes plan immediately |
| `handleDraftOnlyPlan()` | Creates plan for review |
| `executePlan()` | Runs plan steps with executor coordination |

**Limits:**

```typescript
const MAX_TOOL_CALLS_PER_TURN = 15;
const MAX_SESSION_DURATION_MS = 90_000; // 90 seconds
```

#### AgentContextService

**Location:** `src/lib/services/agent-context-service.ts`
**Lines:** ~1754

**Token Budgets:**

```typescript
PLANNER_TOKEN_BUDGET = 5000; // Main conversation context
EXECUTOR_TOKEN_BUDGET = 1500; // Focused task context
```

**Key Interfaces:**

```typescript
interface PlannerContext {
	systemPrompt: string;
	availableTools: ChatToolDefinition[];
	conversationHistory: LLMMessage[];
	locationContext: string;
	userProfile?: string;
	metadata: {
		compressionUsage?: ContextUsageSnapshot;
		plannerAgentId?: string;
	};
}

interface ExecutorContext {
	systemPrompt: string;
	task: ExecutorTask;
	availableTools: ChatToolDefinition[];
	contextSummary: string;
}
```

#### PlanOrchestrator

**Location:** `src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
**Lines:** ~1327

**Plan Structure:**

```typescript
interface AgentPlan {
	id: string;
	sessionId: string;
	userMessage: string;
	strategy: ChatStrategy;
	status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed';
	steps: PlanStep[];
	metadata: Record<string, any>;
}

interface PlanStep {
	stepNumber: number;
	description: string;
	tools: string[];
	executorRequired: boolean;
	dependsOn: number[]; // Step numbers this depends on
	status: 'pending' | 'executing' | 'completed' | 'failed';
	result?: any;
	error?: string;
}
```

**Execution Modes:**
| Mode | Behavior |
|------|----------|
| `auto_execute` | Create and run immediately (default) |
| `draft_only` | Create but wait for user approval |
| `agent_review` | Have reviewer agent critique before execution |

#### ToolExecutionService

**Location:** `src/lib/services/agentic-chat/execution/tool-execution-service.ts`
**Lines:** ~641

**Configuration:**

```typescript
DEFAULT_TIMEOUT = 30000; // 30 seconds per tool
DEFAULT_RETRY_COUNT = 0; // No automatic retries
DEFAULT_RETRY_DELAY = 1000; // 1 second between retries
MAX_FORMATTED_LENGTH = 4000; // Max result text length
```

**Key Methods:**
| Method | Purpose |
|--------|---------|
| `executeTool()` | Execute single tool with validation |
| `validateToolCall()` | Validate against tool schema |
| `executeWithRetry()` | Retry logic for transient failures |
| `batchExecuteTools()` | Concurrent execution (max 3 concurrent) |
| `extractEntitiesFromResult()` | Extract entity IDs from results |

#### ResponseSynthesizer

**Location:** `src/lib/services/agentic-chat/synthesis/response-synthesizer.ts`
**Lines:** ~600

**Key Methods:**
| Method | Purpose |
|--------|---------|
| `synthesizeSimpleResponse()` | Generate response from tool results |
| `synthesizeComplexResponse()` | Summarize plan execution |
| `synthesizeClarifyingQuestions()` | Format AI questions |
| `generateErrorResponse()` | User-friendly error messages |

---

## Tool System

### Tool Categories

**Total: 38 tools** across 5 categories

| Category     | Purpose              | Count | Examples                                               |
| ------------ | -------------------- | ----- | ------------------------------------------------------ |
| **Search**   | Find entities        | 12    | `list_onto_tasks`, `search_ontology`, `search_onto_*`  |
| **Read**     | Get full details     | 5     | `get_onto_project_details`, `get_onto_task_details`    |
| **Write**    | Create/Update/Delete | 15    | `create_onto_task`, `update_onto_project`, `delete_*`  |
| **Template** | Template management  | 2     | `request_template_creation`, `suggest_template`        |
| **Utility**  | Reference/Schema     | 4     | `get_field_info`, `web_search`, `get_buildos_overview` |

### Context-Aware Tool Selection

Tools are filtered based on context type:

```typescript
type ToolContextScope =
	| 'base' // Always available (web_search, get_field_info)
	| 'global' // Cross-project context
	| 'project_create' // Creating new projects
	| 'project' // Working in project
	| 'project_audit' // Audit mode
	| 'project_forecast'; // Forecast mode
```

### Complete Tool List

**Location:** `src/lib/services/agentic-chat/tools/core/tool-definitions.ts` (~2292 lines)

#### Search Tools (12)

| Tool                       | Description                     |
| -------------------------- | ------------------------------- |
| `list_onto_projects`       | Browse all projects             |
| `search_onto_projects`     | Search projects by name/keyword |
| `list_onto_tasks`          | Browse tasks with filters       |
| `search_onto_tasks`        | Keyword search for tasks        |
| `list_onto_plans`          | List execution plans            |
| `list_onto_goals`          | List project goals              |
| `list_onto_documents`      | List project documents          |
| `search_onto_documents`    | Search documents by title       |
| `list_onto_templates`      | Search templates                |
| `list_task_documents`      | Documents linked to task        |
| `search_ontology`          | Fuzzy search all entities       |
| `get_entity_relationships` | Graph edges for entity          |

#### Read Tools (5)

| Tool                        | Description                |
| --------------------------- | -------------------------- |
| `get_onto_project_details`  | Full project with entities |
| `get_onto_task_details`     | Complete task info         |
| `get_onto_goal_details`     | Full goal details          |
| `get_onto_plan_details`     | Full plan details          |
| `get_onto_document_details` | Full document with body    |

#### Write Tools - Create (6)

| Tool                   | Description             |
| ---------------------- | ----------------------- |
| `create_onto_project`  | Full project creation   |
| `create_onto_task`     | Add task to project     |
| `create_onto_goal`     | Add goal to project     |
| `create_onto_plan`     | Add plan to project     |
| `create_onto_document` | Add document to project |
| `create_task_document` | Attach document to task |

#### Write Tools - Update (5)

| Tool                   | Description     |
| ---------------------- | --------------- |
| `update_onto_project`  | Modify project  |
| `update_onto_task`     | Modify task     |
| `update_onto_goal`     | Modify goal     |
| `update_onto_plan`     | Modify plan     |
| `update_onto_document` | Modify document |

#### Write Tools - Delete (4)

| Tool                   | Description     |
| ---------------------- | --------------- |
| `delete_onto_task`     | Remove task     |
| `delete_onto_goal`     | Remove goal     |
| `delete_onto_plan`     | Remove plan     |
| `delete_onto_document` | Remove document |

#### Template Tools (2)

| Tool                        | Description                        |
| --------------------------- | ---------------------------------- |
| `request_template_creation` | Escalate for new template creation |
| `suggest_template`          | Suggest template for deferred use  |

#### Utility Tools (4)

| Tool                      | Description              |
| ------------------------- | ------------------------ |
| `get_field_info`          | Schema info for entities |
| `web_search`              | Tavily web search        |
| `get_buildos_overview`    | Platform overview        |
| `get_buildos_usage_guide` | Usage playbook           |

#### Virtual Tools (1)

| Tool                | Description                |
| ------------------- | -------------------------- |
| `agent_create_plan` | Generate and execute plans |

### Tool Execution Flow

```
1. LLM emits tool_call in response
   └── { id, function: { name, arguments } }

2. ToolExecutionService.executeTool() called
   ├── Check for virtual handler (e.g., agent_create_plan)
   ├── Validate against tool schema
   ├── Parse arguments (string → object)
   └── Execute with timeout (30s default)

3. ChatToolExecutor.execute() (for standard tools)
   ├── Lookup handler by tool name
   ├── Execute database operation
   └── Return result with entities accessed

4. Result formatted and returned to LLM context
   └── { success, data, toolName, toolCallId, entitiesAccessed? }
```

### Update Strategies

For update tools (`update_onto_*`), three strategies are available:

| Strategy    | Behavior                                  |
| ----------- | ----------------------------------------- |
| `replace`   | Replace existing value entirely (default) |
| `append`    | Append new content to existing            |
| `merge_llm` | Use LLM to intelligently merge content    |

### Task Creation Philosophy

The agent follows strict guidelines about when to create tasks vs. when to simply help the user directly.

**The Golden Rule:** Tasks should represent **FUTURE USER WORK**, not a log of what was discussed or what the agent helped with.

#### When to Create Tasks

| Create Task? | Scenario                                             | Reason                     |
| ------------ | ---------------------------------------------------- | -------------------------- |
| ✅ **Yes**   | User says "add a task to call the client"            | Explicit request           |
| ✅ **Yes**   | User says "I need to review the contract with legal" | Human action required      |
| ✅ **Yes**   | User says "remind me to follow up with Sarah"        | Future user action         |
| ✅ **Yes**   | User is building a project plan                      | Persistent tracking needed |

#### When NOT to Create Tasks

| Create Task? | Scenario                                       | Reason                     |
| ------------ | ---------------------------------------------- | -------------------------- |
| ❌ **No**    | User says "help me brainstorm marketing ideas" | Agent can help now         |
| ❌ **No**    | User says "what are my blockers?"              | Just analyze and respond   |
| ❌ **No**    | User says "let's outline the API endpoints"    | Collaborative work         |
| ❌ **No**    | Agent is about to perform the action           | Would create then complete |

#### Decision Framework

Before calling `create_onto_task`, the agent asks:

1. **Is this work the USER must do?** (human decision, phone call, meeting) → Create task
2. **Can I help with this RIGHT NOW?** (research, analysis, brainstorming) → Don't create, just help
3. **Did the user EXPLICITLY ask to track this?** → Create task
4. **Am I about to do this work myself?** → Don't create (pointless to create then complete)
5. **Am I creating just to appear helpful?** → Don't create

This philosophy is enforced at multiple levels:

- Tool definition (`create_onto_task` description)
- System prompts (Task Creation Philosophy section)
- Project creation prompts (selective task guidance)
- Plan orchestrator (project creation requirements)

---

## Project Creation Clarification Flow

When a user initiates project creation (`context_type: 'project_create'`), the system intelligently determines if there's enough information to proceed or if clarifying questions are needed.

### How It Works

```
User sends project creation request
    ↓
ProjectCreationAnalyzer.analyzeIntent()
    ├── Quick heuristic check for type/domain indicators
    └── LLM analysis if heuristics are inconclusive
    ↓
If sufficient context (confidence >= 0.6):
    → Proceed directly to template selection and creation
    ↓
If insufficient context:
    → Generate friendly clarifying questions
    → Emit text + clarifying_questions events
    → Store round metadata in session
    ↓
User responds with more context
    ↓
Re-analyze (round 2)
    → If still unclear, one more round OR proceed with inference
    ↓
Max 2 clarification rounds, then create with best inference
```

### Key Components

| Component                 | Location                                                         | Purpose                                               |
| ------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| `ProjectCreationAnalyzer` | `services/agentic-chat/analysis/project-creation-analyzer.ts`    | Analyzes intent, generates questions                  |
| `AgentChatOrchestrator`   | `services/agentic-chat/orchestration/agent-chat-orchestrator.ts` | Intercepts project_create, handles clarification flow |
| Session Metadata          | `chat_sessions.agent_metadata.projectClarification`              | Tracks round count, accumulated context, previous Q&A |

### Sufficiency Indicators

The analyzer looks for these signals to determine if there's enough context:

| Indicator        | Weight | Examples                                      |
| ---------------- | ------ | --------------------------------------------- |
| **Project Type** | High   | "app", "website", "book", "event", "research" |
| **Deliverable**  | Medium | "build", "create", "launch", "publish"        |
| **Goals**        | Medium | "want to", "need to", "goal is", "trying to"  |
| **Timeline**     | Low    | "by next month", "deadline", "urgent"         |
| **Scale**        | Low    | "small", "mvp", "comprehensive", "prototype"  |

### Session Metadata Structure

```typescript
interface ProjectClarificationMetadata {
	roundNumber: number; // Current round (0 = initial, max 2)
	accumulatedContext: string; // Combined user messages
	previousQuestions: string[]; // Questions already asked
	previousResponses: string[]; // User's responses
}
```

### SSE Events

| Event Type               | When Emitted                                   |
| ------------------------ | ---------------------------------------------- |
| `agent_state` (thinking) | When analyzing project intent                  |
| `text`                   | Friendly intro message before questions        |
| `clarifying_questions`   | Array of 1-2 questions to ask                  |
| `agent_state` (waiting)  | After emitting questions, waiting for response |
| `done`                   | Session complete (clarification returned)      |

### Example Interaction

**Round 1 - Vague request:**

```
User: "I want to start a new project"

System Analysis:
- hasProjectType: false
- hasDeliverable: false
- hasSufficientContext: false

Response:
"I'd be happy to help you create a new project! To make sure I set things up well,
could you help me understand a bit more?

What kind of project would you like to create? For example, is this a software app,
a writing project, a business initiative, or something else?"
```

**Round 2 - More context:**

```
User: "It's a mobile app for fitness tracking"

System Analysis:
- hasProjectType: true (app, mobile, fitness)
- hasDeliverable: true (implied)
- hasSufficientContext: true

Response: Proceeds to template selection and project creation
```

---

## SSE Streaming Protocol

### SSEProcessor Utility

**Location:** `src/lib/utils/sse-processor.ts`
**Lines:** ~305

**Client-side Usage:**

```typescript
const callbacks: StreamCallbacks = {
	onProgress: (data) => handleSSEMessage(data),
	onError: (err) => {
		error = err;
		isStreaming = false;
	},
	onComplete: () => {
		isStreaming = false;
		finalizeAssistantMessage();
	}
};

await SSEProcessor.processStream(response, callbacks, {
	timeout: 240000, // 4 minutes for complex conversations
	parseJSON: true,
	signal: abortController.signal
});
```

**Server-side Usage:**

```typescript
const { stream, writer } = SSEProcessor.createSSEStream();

// In async generator
for await (const event of orchestrator.streamConversation(request, callback)) {
	writer.write(event);
}
writer.close();

return new Response(stream, {
	headers: {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive'
	}
});
```

**Event Format:**

```
data: {"type":"text","content":"Hello"}

data: {"type":"tool_call","tool_call":{"id":"123","function":{"name":"list_onto_tasks"}}}

data: {"type":"done","usage":{"total_tokens":1234}}

data: [DONE]
```

---

## State Management

### UIMessage Types

```typescript
interface UIMessage {
	id: string;
	type:
		| 'user'
		| 'assistant'
		| 'activity'
		| 'thinking_block'
		| 'plan'
		| 'step'
		| 'executor'
		| 'clarification'
		| 'agent_peer';
	content: string;
	timestamp: Date;
	role?: ChatRole;
	data?: any;
	tool_calls?: any;
}

interface ThinkingBlockMessage extends UIMessage {
	type: 'thinking_block';
	activities: ActivityEntry[];
	status: 'active' | 'completed';
	agentState?: AgentLoopState;
	isCollapsed?: boolean;
}

interface ActivityEntry {
	id: string;
	content: string;
	timestamp: Date;
	activityType: ActivityType;
	status?: 'pending' | 'completed' | 'failed';
	toolCallId?: string;
	metadata?: Record<string, any>;
}
```

### Activity Types

```typescript
type ActivityType =
	| 'tool_call' // Tool being executed
	| 'tool_result' // Tool execution result
	| 'plan_created' // Execution plan generated
	| 'plan_review' // Plan review verdict
	| 'state_change' // Agent state change
	| 'step_start' // Plan step starting
	| 'step_complete' // Plan step finished
	| 'executor_spawned' // Executor agent started
	| 'executor_result' // Executor agent finished
	| 'context_shift' // Context changed
	| 'template_request' // Template creation escalation
	| 'template_status' // Template creation progress
	| 'template_suggestion' // Template suggestion
	| 'ontology_loaded' // Ontology context loaded
	| 'clarification' // Clarifying questions
	| 'general'; // Generic activity
```

### Agent States

```typescript
type AgentLoopState = 'thinking' | 'executing_plan' | 'waiting_on_user';

const AGENT_STATE_MESSAGES: Record<AgentLoopState, string> = {
	thinking: 'BuildOS is thinking...',
	executing_plan: 'BuildOS is executing...',
	waiting_on_user: 'Waiting on your direction...'
};
```

---

## API Reference

### POST /api/agent/stream

**Request Body:**

```typescript
interface AgentStreamRequest {
	message: string; // User message (required)
	session_id?: string; // Existing session ID
	context_type: ChatContextType; // 'global' | 'project' | 'project_audit' | etc.
	entity_id?: string; // Project/task ID for context
	conversation_history?: ChatMessage[];
	ontologyEntityType?: 'task' | 'plan' | 'goal' | 'document' | 'output';
	projectFocus?: ProjectFocus;
}
```

**Response:** SSE stream with typed events

### Key Event Schemas

```typescript
// Agent state change
{ type: 'agent_state', state: AgentLoopState, contextType: ChatContextType, details?: string }

// Streaming text
{ type: 'text', content: string }

// Tool invocation
{ type: 'tool_call', toolCall: ChatToolCall }

// Tool result
{ type: 'tool_result', result: ToolExecutionResult }

// Plan created
{ type: 'plan_created', plan: AgentPlan }

// Plan ready for review
{ type: 'plan_ready_for_review', plan: AgentPlan, summary: string }

// Context shift
{ type: 'context_shift', context_shift: { new_context, entity_id, entity_name, message } }

// Stream complete
{ type: 'done', usage?: { total_tokens: number } }

// Error
{ type: 'error', error: string }
```

---

## File Reference

### Frontend Files

| File                                                    | Lines | Purpose                      |
| ------------------------------------------------------- | ----- | ---------------------------- |
| `src/lib/components/agent/AgentChatModal.svelte`        | ~2230 | Main chat container          |
| `src/lib/components/agent/AgentMessageList.svelte`      | ~350  | Message list renderer        |
| `src/lib/components/agent/AgentComposer.svelte`         | ~200  | Input with voice support     |
| `src/lib/components/agent/AgentChatHeader.svelte`       | ~250  | Header with context/status   |
| `src/lib/components/agent/ProjectFocusSelector.svelte`  | ~300  | Entity focus selection modal |
| `src/lib/components/agent/ProjectActionSelector.svelte` | ~200  | Action selection (workspace) |
| `src/lib/components/agent/agent-chat.types.ts`          | ~120  | UI type definitions          |
| `src/lib/components/agent/agent-chat.constants.ts`      | ~100  | Context descriptors          |
| `src/lib/components/agent/agent-chat-formatters.ts`     | ~80   | Formatting utilities         |

### Backend Files

| File                                                                     | Lines | Purpose                 |
| ------------------------------------------------------------------------ | ----- | ----------------------- |
| `src/routes/api/agent/stream/+server.ts`                                 | ~500  | API endpoint            |
| `src/lib/services/agentic-chat/index.ts`                                 | ~133  | Factory and exports     |
| `src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts` | ~1048 | Main orchestrator       |
| `src/lib/services/agent-context-service.ts`                              | ~1738 | Context building        |
| `src/lib/services/agentic-chat/planning/plan-orchestrator.ts`            | ~1327 | Plan creation/execution |
| `src/lib/services/agentic-chat/execution/tool-execution-service.ts`      | ~641  | Tool execution          |
| `src/lib/services/agentic-chat/execution/executor-coordinator.ts`        | ~300  | Executor management     |
| `src/lib/services/agentic-chat/synthesis/response-synthesizer.ts`        | ~600  | Response generation     |
| `src/lib/services/agentic-chat/persistence/agent-persistence-service.ts` | ~400  | Database operations     |
| `src/lib/services/agentic-chat/tools/core/tool-definitions.ts`           | ~2292 | Tool schemas (38 tools) |
| `src/lib/services/agentic-chat/tools/core/tool-executor.ts`              | ~1500 | Tool implementations    |
| `src/lib/services/agentic-chat/analysis/strategy-analyzer.ts`            | ~400  | Strategy analysis       |
| `src/lib/services/agentic-chat/analysis/project-creation-analyzer.ts`    | ~300  | Project creation intent |
| `src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`     | ~600  | System prompt building  |
| `src/lib/utils/sse-processor.ts`                                         | ~305  | SSE utilities           |

### Configuration Files

| File                                                                    | Purpose               |
| ----------------------------------------------------------------------- | --------------------- |
| `src/lib/services/agentic-chat/config/model-selection-config.ts`        | LLM model profiles    |
| `src/lib/services/agentic-chat/config/enhanced-llm-wrapper.ts`          | Smart model selection |
| `src/lib/services/agentic-chat/config/error-handling-strategies.ts`     | Error handling        |
| `src/lib/services/agentic-chat/config/token-optimization-strategies.ts` | Token optimization    |

---

## Development Guide

### Adding a New Tool

1. **Define the tool** in `tool-definitions.ts`:

```typescript
{
  type: 'function',
  function: {
    name: 'my_new_tool',
    description: 'What the tool does',
    parameters: {
      type: 'object',
      properties: {
        required_param: { type: 'string', description: '...' },
        optional_param: { type: 'number', description: '...' }
      },
      required: ['required_param']
    }
  }
}
```

2. **Add metadata** in `TOOL_METADATA`:

```typescript
my_new_tool: {
  summary: 'Brief description',
  capabilities: ['Capability 1', 'Capability 2'],
  contexts: ['project', 'global'],
  category: 'write'
}
```

3. **Implement handler** in `tool-executor.ts`:

```typescript
case 'my_new_tool':
  return this.executeMyNewTool(args);

private async executeMyNewTool(args: { required_param: string; optional_param?: number }) {
  // Implementation
  return { success: true, data: result };
}
```

### Adding a New SSE Event Type

1. **Define in shared types** (`shared/types.ts`):

```typescript
export interface MyNewEvent extends StreamEvent {
	type: 'my_new_event';
	myData: SomeType;
}
```

2. **Emit from orchestrator** in appropriate location

3. **Handle in frontend** (`AgentChatModal.svelte`):

```typescript
case 'my_new_event':
  // Handle the event
  addActivityToThinkingBlock('Message', 'general', { data: event.myData });
  break;
```

### Testing

```bash
# Run all agentic chat tests
pnpm test src/lib/services/agentic-chat

# Run specific test file
pnpm test src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.test.ts

# Run with coverage
pnpm test:coverage -- src/lib/services/agentic-chat
```

### Debugging

**Enable verbose logging:**

```typescript
// In dev mode, console.log statements are active
if (dev) {
	console.log('[AgentChat] Tool call:', { toolName, toolCallId });
}
```

**Check SSE events:** Open browser DevTools → Network tab → Filter by `/api/agent/stream` → View EventStream tab

**Inspect database state:** Check `agent_agents` and `agent_plans` tables in Supabase

---

## Related Documentation

### Core Documentation (Active & Maintained)

| Document                                                               | Purpose                  | Status     |
| ---------------------------------------------------------------------- | ------------------------ | ---------- |
| [tool-system/QUICK_REFERENCE.md](./tool-system/QUICK_REFERENCE.md)     | Quick tool lookup        | ✅ Current |
| [tool-system/DOCUMENTATION.md](./tool-system/DOCUMENTATION.md)         | Complete tool reference  | ✅ Current |
| [PERFORMANCE.md](./PERFORMANCE.md)                                     | Caching and optimization | ✅ Current |
| [VISUAL_GUIDE.md](./VISUAL_GUIDE.md)                                   | Visual diagrams          | ✅ Current |
| [BACKEND_ARCHITECTURE_OVERVIEW.md](./BACKEND_ARCHITECTURE_OVERVIEW.md) | Backend service details  | ✅ Current |
| [FRONTEND_QUICK_REFERENCE.md](./FRONTEND_QUICK_REFERENCE.md)           | Frontend state/handlers  | ✅ Current |

### Cross-Feature Documentation

| Document                                                        | Purpose                |
| --------------------------------------------------------------- | ---------------------- |
| [Ontology System](../ontology/README.md)                        | Data model reference   |
| [Modal Components](../../technical/components/modals/README.md) | UI patterns            |
| [Database Schema](../../technical/database/schema.md)           | Table definitions      |
| [Chat API](../../technical/api/chat-api-documentation.md)       | API endpoint reference |

### Historical/Specification Documents (Reference Only)

These documents contain historical context, original specifications, or analysis that may be useful for understanding design decisions but are not actively maintained:

| Document                                  | Purpose                         |
| ----------------------------------------- | ------------------------------- |
| `AGENT_TOOL_SYSTEM_SPEC.md`               | Original tool system spec       |
| `PROJECT_CREATE_EXECUTION_PLAN.md`        | Project creation design         |
| `THINKING_BLOCK_*.md`                     | Thinking block UI specs         |
| `BUG_ANALYSIS_*.md`                       | Historical bug analysis         |
| `ARCHITECTURE_IMPROVEMENTS_2025-11-14.md` | Architecture improvements       |
| `*_SPEC.md` files                         | Original feature specifications |

---

## Quick Navigation

| I want to...                | Go to                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| Understand the architecture | [Architecture Overview](#architecture-overview)                    |
| Learn about tools           | [tool-system/QUICK_REFERENCE.md](./tool-system/QUICK_REFERENCE.md) |
| See the data flow           | [Data Flow](#data-flow)                                            |
| Add a new tool              | [Development Guide](#development-guide)                            |
| Debug SSE streaming         | [SSE Streaming Protocol](#sse-streaming-protocol)                  |
| Understand state management | [State Management](#state-management)                              |
| Check frontend code         | [FRONTEND_QUICK_REFERENCE.md](./FRONTEND_QUICK_REFERENCE.md)       |

---

**Last Updated:** 2025-12-02
**Status:** ✅ Production-ready with comprehensive coverage
