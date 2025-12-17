<!-- apps/web/docs/features/agentic-chat/README.md -->

# Agentic Chat System - Architecture Documentation

> **Last Updated:** 2025-12-17
> **Status:** Comprehensive Technical Reference (Post-Refactor)
> **Maintainer:** BuildOS Platform Team

The BuildOS Agentic Chat System is a sophisticated multi-agent architecture that enables users to interact with the platform through natural language. It features a **planner-executor model**, **real-time SSE streaming**, and a **comprehensive tool system** for managing the ontology (projects, tasks, plans, goals, documents).

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Complete Data Flow](#complete-data-flow)
4. [Core Components](#core-components)
5. [SSE Event System](#sse-event-system)
6. [Tool System](#tool-system)
7. [State Management](#state-management)
8. [Known Issues & Improvements](#known-issues--improvements)
9. [API Reference](#api-reference)
10. [File Reference](#file-reference)
11. [Development Guide](#development-guide)

---

## Quick Start

### Key Entry Points

| Layer        | Primary File                                                             | Purpose                        |
| ------------ | ------------------------------------------------------------------------ | ------------------------------ |
| **Frontend** | `src/lib/components/agent/AgentChatModal.svelte`                         | Main chat interface (~2500 ln) |
| **API**      | `src/routes/api/agent/stream/+server.ts`                                 | SSE endpoint orchestrator      |
| **Backend**  | `src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts` | Core orchestration logic       |

### Backend Modular Structure

```
src/routes/api/agent/stream/
├── +server.ts           # Main endpoint (~150 lines)
├── types.ts             # Endpoint-specific types
├── services/
│   ├── session-manager.ts      # Session CRUD, focus resolution
│   ├── stream-handler.ts       # SSE lifecycle management
│   └── ontology-cache.ts       # Session-level caching
└── utils/
    ├── context-utils.ts        # Context type normalization
    ├── event-mapper.ts         # StreamEvent → AgentSSEMessage
    └── rate-limiter.ts         # Request throttling
```

---

## Architecture Overview

### High-Level System Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (SvelteKit + Svelte 5)                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│  AgentChatModal.svelte                                                           │
│  ├── Context Selection → ContextSelectionScreen.svelte                          │
│  ├── Message Display → AgentMessageList.svelte                                  │
│  ├── Input → AgentComposer.svelte (with voice support)                          │
│  ├── Project Focus → ProjectFocusSelector, ProjectActionSelector                │
│  ├── Thinking Blocks → Collapsible activity visualization                        │
│  └── SSE Processing → SSEProcessor utility class                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                        SSE STREAM (POST /api/agent/stream)                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│  API Endpoint Layer                                                              │
│  ├── Authentication (locals.supabase → user)                                    │
│  ├── SessionManager.resolveSession() → Create/fetch chat session                │
│  ├── OntologyCacheService.loadWithSessionCache() → Context loading              │
│  └── StreamHandler.createAgentStream() → SSE lifecycle                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                              ORCHESTRATION LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│  AgentChatOrchestrator                                                           │
│  ├── AgentContextService.buildPlannerContext() → System prompt + tools          │
│  ├── ProjectCreationAnalyzer → Clarification flow for project_create            │
│  ├── EnhancedLLMWrapper.streamText() → LLM streaming with tool calls            │
│  ├── ToolExecutionService.executeTool() → Tool dispatch and execution           │
│  ├── PlanOrchestrator → Multi-step plan creation and execution                  │
│  └── ResponseSynthesizer → Natural language response generation                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                              DATA LAYER                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│  Supabase Database (onto_* tables)                                               │
│  ├── onto_projects, onto_tasks, onto_plans, onto_goals                          │
│  ├── onto_documents, onto_outputs, onto_edges                                    │
│  └── chat_sessions, agent_agents, agent_plans                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Service Factory Pattern

Services are instantiated via `createAgentChatOrchestrator()` in `src/lib/services/agentic-chat/index.ts`:

```typescript
export function createAgentChatOrchestrator(
	supabase: SupabaseClient<Database>,
	options: AgenticChatFactoryOptions = {}
): AgentChatOrchestrator {
	// Creates dependency graph:
	// llmService → compressionService → contextService
	// persistenceService, toolExecutionService
	// executorService → executorCoordinator → planOrchestrator
	// responseSynthesizer, errorLogger
}
```

### Multi-Agent Model (Planner-Executor)

| Agent Type   | Role                                                 | Token Budget | Trigger                 |
| ------------ | ---------------------------------------------------- | ------------ | ----------------------- |
| **Planner**  | Analyzes requests, creates plans, decides tool usage | ~5000 tokens | Every conversation turn |
| **Executor** | Carries out specific plan steps with focused tools   | ~1500 tokens | When plan step requires |
| **Reviewer** | Critiques plans before execution (optional)          | ~2000 tokens | `agent_review` mode     |

---

## Complete Data Flow

### 1. Frontend → API Request

```typescript
// AgentChatModal.svelte: sendMessage()
const response = await fetch('/api/agent/stream', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	signal: streamController.signal,
	body: JSON.stringify({
		message: trimmed, // User input
		session_id: currentSession?.id, // Existing session or undefined
		context_type: selectedContextType, // 'global' | 'project' | 'project_create' | etc.
		entity_id: selectedEntityId, // Project/task ID
		conversation_history: conversationHistory,
		ontologyEntityType: ontologyEntityType,
		projectFocus: resolvedProjectFocus,
		lastTurnContext: lastTurnContext // Previous turn's context snapshot
	})
});
```

### 2. API Endpoint Processing

```typescript
// +server.ts: POST handler
1. Authenticate user via locals.supabase
2. Parse and validate request body → StreamRequest
3. SessionManager.resolveSession()
   - Create new session OR fetch existing
   - Load session metadata (focus, ontologyCache)
   - Load conversation history (last 50 messages)
4. OntologyCacheService.loadWithSessionCache()
   - Check session-level cache (5min TTL)
   - Load ontology context based on context_type + focus
   - Cache result in session metadata
5. SessionManager.resolveProjectFocus()
   - Resolve focus from request OR session metadata
   - Persist focus changes to database
6. StreamHandler.createAgentStream() → SSE Response
```

### 3. Stream Handler → Orchestrator

```typescript
// stream-handler.ts: createAgentStream()
1. Create SSE response stream
2. Send initial events (session, focus_active)
3. Create AgentChatOrchestrator via factory
4. Iterate orchestrator.streamConversation()
5. Map each StreamEvent → AgentSSEMessage via event-mapper
6. Write to SSE stream
7. Handle errors (emit error + done)
8. Persist assistant message on completion
```

### 4. Orchestrator Processing

```typescript
// agent-chat-orchestrator.ts: streamConversation()
1. Build PlannerContext
   - System prompt with ontology awareness
   - Compressed conversation history
   - Location context (project/task details)
   - Available tools for context

2. Create Planner Agent record in database

3. Emit initial events:
   - debug_context (if debug mode)
   - session
   - last_turn_context
   - context_usage

4. Project Creation Check (if context_type === 'project_create')
   - ProjectCreationAnalyzer.analyzeIntent()
   - If insufficient context → emit clarifying_questions, return
   - Max 2 clarification rounds

5. Run Planner Loop (runPlannerLoop)
   ┌─────────────────────────────────────────────────┐
   │  while (continueLoop) {                         │
   │    a. Emit agent_state: 'thinking'              │
   │    b. Stream LLM response with tools            │
   │    c. Collect text chunks → emit 'text'         │
   │    d. Collect tool_calls → emit 'tool_call'     │
   │    e. If no tool calls:                         │
   │       - Emit done, return                       │
   │    f. For each tool call:                       │
   │       - Execute via ToolExecutionService        │
   │       - Emit 'tool_result'                      │
   │       - Handle context_shift if present         │
   │       - Emit stream events from tool            │
   │       - Push tool result to messages            │
   │    g. Check limits (15 tools, 90s timeout)      │
   │  }                                              │
   └─────────────────────────────────────────────────┘

6. Virtual Tool Handler (agent_create_plan)
   - Parse plan arguments
   - Determine execution mode
   - Create plan via PlanOrchestrator
   - Execute or draft for review
```

### 5. Plan Execution Flow

```typescript
// plan-orchestrator.ts
1. Create plan with steps from LLM
2. Persist plan to database
3. Emit plan_created OR plan_ready_for_review

4. For each step (if auto_execute):
   - Emit step_start
   - Check dependencies resolved
   - If executorRequired:
     - Spawn executor via ExecutorCoordinator
     - Emit executor_spawned
     - Wait for result
     - Emit executor_result
   - Else:
     - Execute tool directly
   - Emit step_complete

5. Synthesize final response via ResponseSynthesizer
```

### 6. Frontend SSE Processing

```typescript
// AgentChatModal.svelte: handleSSEMessage()
switch (event.type) {
  case 'session':           → Update currentSession, context labels
  case 'last_turn_context': → Store for next request
  case 'context_usage':     → Update contextUsage display
  case 'focus_active':      → Update projectFocus
  case 'focus_changed':     → Update projectFocus + log activity
  case 'agent_state':       → Update agentState, currentActivity
  case 'clarifying_questions': → Add clarification message
  case 'plan_created':      → Store currentPlan, update thinking block
  case 'plan_ready_for_review': → Store plan, wait for user approval
  case 'step_start':        → Update plan step status
  case 'step_complete':     → Update plan step status
  case 'executor_spawned':  → Add to thinking block
  case 'executor_result':   → Update thinking block
  case 'plan_review':       → Log review verdict
  case 'text':              → Append to assistant message
  case 'tool_call':         → Add activity to thinking block
  case 'tool_result':       → Update activity status
  case 'context_shift':     → Update context type, entity, focus
  case 'done':              → Finalize messages, clear streaming state
  case 'error':             → Set error state
}
```

---

## Core Components

### Frontend Components

#### AgentChatModal.svelte

**Location:** `src/lib/components/agent/AgentChatModal.svelte`
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
let lastTurnContext = $state<LastTurnContext | null>(null);

// Thinking block tracking
let currentThinkingBlockId = $state<string | null>(null);
let currentAssistantMessageId = $state<string | null>(null);
```

**Key Functions:**

| Function                       | Purpose                                   |
| ------------------------------ | ----------------------------------------- |
| `sendMessage()`                | Initiates chat turn, creates SSE stream   |
| `handleSSEMessage()`           | Routes SSE events to appropriate handlers |
| `createThinkingBlock()`        | Creates new thinking block for activities |
| `addActivityToThinkingBlock()` | Adds tool/step activity to current block  |
| `updateActivityStatus()`       | Updates tool call completion status       |
| `handleContextSelect()`        | Processes context selection               |
| `handleClose()`                | Cleanup and classification trigger        |

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

| Method                                | Purpose                                    |
| ------------------------------------- | ------------------------------------------ |
| `streamConversation()`                | Main entry point, async generator          |
| `runPlannerLoop()`                    | Core planner agent loop                    |
| `handlePlanToolCall()`                | Processes `agent_create_plan` virtual tool |
| `checkProjectCreationClarification()` | Handles clarification flow                 |
| `buildPlannerMessages()`              | Constructs LLM message array               |
| `ensureWithinLimits()`                | Enforces time and tool call limits         |

**Limits:**

```typescript
const MAX_TOOL_CALLS_PER_TURN = 15;
const MAX_SESSION_DURATION_MS = 90_000; // 90 seconds
```

#### Stream Handler Services

**SessionManager** (`services/session-manager.ts`):

- `resolveSession()` - Create or fetch existing session
- `resolveProjectFocus()` - Handle focus changes with persistence
- `updateSessionMetadata()` - Persist metadata changes

**StreamHandler** (`services/stream-handler.ts`):

- `createAgentStream()` - Main SSE stream creation
- Event mapping via `mapPlannerEventToSSE()`
- Error handling with error + done sequence
- Message persistence on completion

**OntologyCacheService** (`services/ontology-cache.ts`):

- Session-level caching (5min TTL)
- Cache key based on context + focus
- Invalidation on focus change

---

## SSE Event System

### Event Types (StreamEvent → AgentSSEMessage)

| Internal Event Type     | SSE Message Type        | Data                                   |
| ----------------------- | ----------------------- | -------------------------------------- |
| `session`               | `session`               | `{ session: ChatSession }`             |
| `ontology_loaded`       | `ontology_loaded`       | `{ summary: string }`                  |
| `last_turn_context`     | `last_turn_context`     | `{ context: LastTurnContext }`         |
| `context_usage`         | `context_usage`         | `{ usage: ContextUsageSnapshot }`      |
| `agent_state`           | `agent_state`           | `{ state, contextType, details? }`     |
| `clarifying_questions`  | `clarifying_questions`  | `{ questions: string[] }`              |
| `plan_created`          | `plan_created`          | `{ plan: AgentPlan }`                  |
| `plan_ready_for_review` | `plan_ready_for_review` | `{ plan, summary?, recommendations? }` |
| `step_start`            | `step_start`            | `{ step: PlanStep }`                   |
| `step_complete`         | `step_complete`         | `{ step: PlanStep }`                   |
| `executor_spawned`      | `executor_spawned`      | `{ executorId, task }`                 |
| `executor_result`       | `executor_result`       | `{ executorId, result }`               |
| `plan_review`           | `plan_review`           | `{ plan, verdict, notes?, reviewer? }` |
| `text`                  | `text`                  | `{ content: string }`                  |
| `tool_call`             | `tool_call`             | `{ tool_call: ChatToolCall }`          |
| `tool_result`           | `tool_result`           | `{ result: ToolExecutionResult }`      |
| `done`                  | `done`                  | `{ usage?: { total_tokens } }`         |
| `error`                 | `error`                 | `{ error: string }`                    |

### SSE-Only Events (Passthrough)

These events bypass the mapper and are sent directly:

- `focus_active` - Current project focus
- `focus_changed` - Focus changed during session
- `context_shift` - Context changed by tool execution

### Event Mapping (`event-mapper.ts`)

```typescript
// Data-driven mapping approach
const EVENT_MAPPERS: Record<string, (event) => AgentSSEMessage | null> = {
	session: (e) => ({ type: 'session', session: e.session }),
	text: (e) => ({ type: 'text', content: e.content }),
	tool_call: (e) => ({ type: 'tool_call', tool_call: e.toolCall })
	// ... etc
};

export function mapPlannerEventToSSE(event): AgentSSEMessage | null {
	// Passthrough SSE-only types
	if (['focus_active', 'focus_changed', 'context_shift'].includes(event.type)) {
		return event;
	}
	// Look up mapper
	const mapper = EVENT_MAPPERS[event.type];
	return mapper ? mapper(event) : null;
}
```

---

## Tool System

### Tool Categories

**Total: 38 tools** across 5 categories

| Category     | Count | Examples                                               |
| ------------ | ----- | ------------------------------------------------------ |
| **Search**   | 12    | `list_onto_tasks`, `search_ontology`, `search_onto_*`  |
| **Read**     | 5     | `get_onto_project_details`, `get_onto_task_details`    |
| **Write**    | 15    | `create_onto_task`, `update_onto_project`, `delete_*`  |
| **Template** | 2     | `request_template_creation`, `suggest_template`        |
| **Utility**  | 4     | `get_field_info`, `web_search`, `get_buildos_overview` |

### Virtual Tools

| Tool                | Handler Location      | Purpose                    |
| ------------------- | --------------------- | -------------------------- |
| `agent_create_plan` | AgentChatOrchestrator | Generate and execute plans |

### Context-Aware Tool Selection

Tools are filtered based on context type via `getToolsForContextType()`:

```typescript
type ToolContextScope =
	| 'base' // Always available
	| 'global' // Cross-project context
	| 'project_create' // Creating new projects
	| 'project' // Working in project
	| 'project_audit' // Audit mode
	| 'project_forecast'; // Forecast mode
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
```

### Activity Types

```typescript
type ActivityType =
	| 'tool_call'
	| 'tool_result'
	| 'plan_created'
	| 'plan_review'
	| 'state_change'
	| 'step_start'
	| 'step_complete'
	| 'executor_spawned'
	| 'executor_result'
	| 'context_shift'
	| 'template_request'
	| 'template_status'
	| 'template_suggestion'
	| 'ontology_loaded'
	| 'clarification'
	| 'general';
```

### Agent States

```typescript
type AgentLoopState = 'thinking' | 'executing_plan' | 'waiting_on_user';
```

---

## Known Issues & Improvements

### Remediation Status (2025-12-17 Audit)

| Issue                                      | Status          | Notes                                                                                       |
| ------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------- |
| StreamEvent → AgentSSEMessage typing       | ✅ **Fixed**    | Uses `Extract<>` type guards + `normalizePlan()` helper for camelCase→snake_case conversion |
| Drop unused `ontology_loaded` SSE emission | ✅ **Fixed**    | Event emission commented out in orchestrator; type still exists for backward compat         |
| tool_result → tool_call matching           | ⚠️ **Deferred** | Warning still present in dev mode; no race condition observed—warning is diagnostic only    |
| `normalizeContextType` consolidation       | ✅ **Fixed**    | Single canonical source at `utils/context-utils.ts`; all imports point there                |
| `error` → `done` sequencing                | ✅ **Fixed**    | StreamHandler guarantees sequence; orchestrator tracks `doneEmitted` flag                   |

### Resolved Issues

#### 1. Type-Safe Event Mapper ✅

**Location:** `src/routes/api/agent/stream/utils/event-mapper.ts`

The event mapper now uses proper TypeScript patterns:

```typescript
// Uses Extract<> for type-safe narrowing instead of `as any`
plan_created: (event) => {
  const e = event as Extract<StreamEvent, { type: 'plan_created' }>;
  return {
    type: 'plan_created',
    plan: normalizePlan(e.plan)  // Safe conversion camelCase → snake_case
  };
},
```

The `normalizePlan()` helper handles the AgentPlan shape differences between internal (camelCase) and SSE (snake_case) formats.

#### 2. Ontology Loaded Event Removed ✅

**Location:** `agent-chat-orchestrator.ts:229-236`

The `ontology_loaded` event emission is commented out. The event type remains in `StreamEvent` for backward compatibility but is never emitted. Frontend handler was already disabled.

#### 3. Context Normalization Consolidated ✅

**Canonical Location:** `src/routes/api/agent/stream/utils/context-utils.ts`

All usages now import from this single source:

- `agent-chat-orchestrator.ts` → imports from `context-utils.ts`
- `agent-context-service.ts` → imports from `context-utils.ts`
- `executor-context-builder.ts` → imports from `context-utils.ts`
- `stream-handler.ts` → imports via `../utils` barrel
- `ontology-cache.ts` → imports via `../utils` barrel

#### 4. Error→Done Sequence Guaranteed ✅

**StreamHandler** (`stream-handler.ts:347-379`):

```typescript
catch (streamError) {
  // CRITICAL: Send error event, then done event
  await agentStream.sendMessage({ type: 'error', error: ... });

  // Ensure done is sent even when errors occur
  if (!state.completionSent) {
    state.completionSent = true;
    await agentStream.sendMessage({ type: 'done', ... });
  }
}
```

**Orchestrator** (`agent-chat-orchestrator.ts:161,275,299`):

```typescript
let doneEmitted = false;
// ... tracked at clarification return and planner loop completion
if (event.type === 'done') {
	doneEmitted = true;
}
```

### Remaining Items (Low Priority)

#### Tool Result Warning in Dev Mode

**Location:** `AgentChatModal.svelte:1584-1596`

The warning remains as a **diagnostic aid** during development. Investigation confirmed:

- Events are delivered in order (tool_call before tool_result)
- Warning typically fires when thinking block state is stale or tool_call_id lookup fails
- Does not affect production behavior

**Recommendation:** Keep warning for debugging; consider adding retry logic or fuzzy matching if issues persist.

**Test Coverage:** `stream-handler.test.ts` verifies error → done sequence.

### Improvements Recommended

#### 1. Add Missing Event Type Definitions

Add `focus_active` and `focus_changed` to `StreamEvent` union type for type safety.

#### 2. Improve Error Recovery

Add retry logic for transient LLM failures in the planner loop.

#### 3. Add Telemetry Events

Add metrics for:

- Plan execution duration
- Tool call latency
- Context loading time
- Error rates by category

#### 4. Consolidate Type Definitions

Create single source of truth for SSE event types shared between frontend and backend.

---

## API Reference

### POST /api/agent/stream

**Request Body:**

```typescript
interface AgentStreamRequest {
	message: string; // User message (required)
	session_id?: string; // Existing session ID
	context_type: ChatContextType; // 'global' | 'project' | etc.
	entity_id?: string; // Project/task ID for context
	conversation_history?: ChatMessage[];
	ontologyEntityType?: 'task' | 'plan' | 'goal' | 'document' | 'output';
	projectFocus?: ProjectFocus;
	lastTurnContext?: LastTurnContext;
}
```

**Response:** SSE stream with `AgentSSEMessage` events

**Headers:**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Rate Limits:**

- 20 requests/minute per user
- 30,000 tokens/minute per user

---

## File Reference

### Frontend Files

| File                                               | Purpose                    |
| -------------------------------------------------- | -------------------------- |
| `src/lib/components/agent/AgentChatModal.svelte`   | Main chat container        |
| `src/lib/components/agent/AgentMessageList.svelte` | Message list renderer      |
| `src/lib/components/agent/AgentComposer.svelte`    | Input with voice support   |
| `src/lib/components/agent/agent-chat.types.ts`     | UI type definitions        |
| `src/lib/components/agent/agent-chat.constants.ts` | Context descriptors        |
| `src/lib/utils/sse-processor.ts`                   | SSE utilities (~305 lines) |

### Backend Files

| File                                                                     | Purpose                 |
| ------------------------------------------------------------------------ | ----------------------- |
| `src/routes/api/agent/stream/+server.ts`                                 | API endpoint            |
| `src/routes/api/agent/stream/types.ts`                                   | Endpoint types          |
| `src/routes/api/agent/stream/services/session-manager.ts`                | Session CRUD            |
| `src/routes/api/agent/stream/services/stream-handler.ts`                 | SSE lifecycle           |
| `src/routes/api/agent/stream/services/ontology-cache.ts`                 | Session caching         |
| `src/routes/api/agent/stream/utils/event-mapper.ts`                      | Event mapping           |
| `src/routes/api/agent/stream/utils/context-utils.ts`                     | Context normalization   |
| `src/lib/services/agentic-chat/index.ts`                                 | Factory and exports     |
| `src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts` | Main orchestrator       |
| `src/lib/services/agentic-chat/shared/types.ts`                          | Shared type definitions |
| `src/lib/services/agent-context-service.ts`                              | Context building        |
| `src/lib/services/agentic-chat/planning/plan-orchestrator.ts`            | Plan creation/execution |
| `src/lib/services/agentic-chat/execution/tool-execution-service.ts`      | Tool execution          |
| `src/lib/services/agentic-chat/execution/executor-coordinator.ts`        | Executor management     |
| `src/lib/services/agentic-chat/synthesis/response-synthesizer.ts`        | Response generation     |
| `src/lib/services/agentic-chat/persistence/agent-persistence-service.ts` | Database operations     |
| `src/lib/services/agentic-chat/tools/core/tool-definitions.ts`           | Tool schemas (38 tools) |
| `src/lib/services/agentic-chat/tools/core/tool-executor.ts`              | Tool implementations    |
| `src/lib/services/agentic-chat/analysis/project-creation-analyzer.ts`    | Project creation intent |
| `src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`     | System prompt building  |

---

## Development Guide

### Adding a New SSE Event

1. **Define in shared types** (`shared/types.ts`):

```typescript
// Add to StreamEvent union
| { type: 'my_new_event'; myData: SomeType }
```

2. **Add mapper** (`event-mapper.ts`):

```typescript
my_new_event: (event) => ({
  type: 'my_new_event',
  myData: (event as Extract<StreamEvent, { type: 'my_new_event' }>).myData
}),
```

3. **Handle in frontend** (`AgentChatModal.svelte`):

```typescript
case 'my_new_event':
  addActivityToThinkingBlock('Message', 'general', { data: event.myData });
  break;
```

### Testing

```bash
# Run all agentic chat tests
pnpm test src/lib/services/agentic-chat
pnpm test src/routes/api/agent/stream

# Run specific test file
pnpm test src/routes/api/agent/stream/services/session-manager.test.ts

# Run with coverage
pnpm test:coverage -- src/lib/services/agentic-chat
```

### Debugging

**Enable verbose logging:**

```typescript
if (dev) {
	console.log('[AgentChat] Tool call:', { toolName, toolCallId });
}
```

**Check SSE events:** Browser DevTools → Network → Filter `/api/agent/stream` → EventStream tab

**Debug mode:** Set `AGENT_CHAT_DEBUG=true` to emit `debug_context` events with full prompt/context info.

---

## Related Documentation

| Document                                                               | Purpose                  |
| ---------------------------------------------------------------------- | ------------------------ |
| [tool-system/QUICK_REFERENCE.md](./tool-system/QUICK_REFERENCE.md)     | Quick tool lookup        |
| [tool-system/DOCUMENTATION.md](./tool-system/DOCUMENTATION.md)         | Complete tool reference  |
| [PERFORMANCE.md](./PERFORMANCE.md)                                     | Caching and optimization |
| [FRONTEND_QUICK_REFERENCE.md](./FRONTEND_QUICK_REFERENCE.md)           | Frontend state/handlers  |
| [BACKEND_ARCHITECTURE_OVERVIEW.md](./BACKEND_ARCHITECTURE_OVERVIEW.md) | Backend details          |
| [Ontology System](../ontology/README.md)                               | Data model reference     |

---

**Last Updated:** 2025-12-17
**Status:** Post-refactor audit complete — 4/5 remediation items resolved
