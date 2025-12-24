<!-- docs/api/agent-chat-implementation.md -->

# BuildOS Agent Chat API Implementation - Complete Overview

## Architecture Overview

The agent chat system is a sophisticated multi-agent architecture with three main layers:

1. **Stream Endpoint** - HTTP SSE (Server-Sent Events) interface
2. **Orchestration Layer** - Planner service for strategy and coordination
3. **Execution Layer** - Executor services for focused task completion

---

## 1. Main API Endpoint: `/api/agent/stream`

**Directory:** `/apps/web/src/routes/api/agent/stream/`

> **Note:** This endpoint was refactored in December 2024 from a single ~1,344 line file into a modular structure. See `docs/plans/AGENT_STREAM_ENDPOINT_REFACTORING_PLAN.md` for details.

### File Structure

```
apps/web/src/routes/api/agent/stream/
├── +server.ts              # Main orchestrator (~290 lines)
├── types.ts                # Endpoint-specific types
├── constants.ts            # Configuration values
├── services/
│   ├── session-manager.ts  # Session CRUD for POST + GET
│   ├── ontology-cache.ts   # Wraps OntologyContextLoader with session cache
│   ├── message-persister.ts # Message persistence
│   └── stream-handler.ts   # SSE lifecycle with metadata consolidation
└── utils/
    ├── context-utils.ts    # Pure context normalization functions
    ├── rate-limiter.ts     # Pluggable rate limiting interface
    └── event-mapper.ts     # Data-driven event mapping
```

### Key Features

- **HTTP Methods:** POST (send message) and GET (fetch sessions)
- **Authentication:** Required via `safeGetSession()`
- **Rate Limiting:** 20 requests/minute, 30,000 tokens/minute per user (currently disabled)
- **Response Type:** Server-Sent Events (SSE) for real-time streaming
- **Ontology Caching:** Session-level cache with 5-minute TTL

### POST Handler Flow

```
1. Authentication Check (authenticateRequest)
   ↓
2. Rate Limiting Check (rateLimiter.checkLimit)
   ↓
3. Session Resolution (SessionManager.resolveSession)
   - Fetch existing or create new session
   - Load conversation history (up to 50 messages)
   ↓
4. Focus Resolution (SessionManager.resolveProjectFocus)
   ↓
5. Persist User Message (MessagePersister.persistUserMessage)
   ↓
6. Load Ontology Context (OntologyCacheService.loadWithSessionCache)
   ↓
7. Create Stream (StreamHandler.createStream)
   - Initialize AgentChatOrchestrator
   - Process events via streamConversation()
   - Handle context shifts, tool calls, etc.
   ↓
8. Finalize (in finally block)
   - Persist assistant message + tool results
   - Consolidate metadata (single DB write)
   - Close stream
```

### Request Format

```typescript
interface AgentStreamRequest extends ChatStreamRequest {
	message: string;
	session_id?: string;
	context_type?: ChatContextType; // 'global', 'project', 'calendar', 'project_create', etc. (entity focus via project_focus)
	entity_id?: string; // Project ID for project context
	project_focus?: ProjectFocus | null;
	conversationHistory?: ChatMessage[];
}
```

### Response Events (SSE)

```typescript
type AgentSSEMessage = {
	type:
		| 'session' // Session created/loaded
		| 'analysis' // Complexity analysis
		| 'plan_created' // Multi-step plan created
		| 'step_start' // Starting a plan step
		| 'step_complete' // Completed a step
		| 'executor_spawned' // Sub-agent created
		| 'executor_result' // Sub-agent result
		| 'text' // Assistant response text
		| 'tool_call' // Tool function call
		| 'tool_result' // Tool execution result
		| 'done' // Stream complete
		| 'error'; // Error occurred
};
```

### Key Implementation Details

After the December 2024 refactoring, the implementation is split across multiple files:

**`+server.ts`** - Main orchestrator (~290 lines)

- POST handler: Authentication, request parsing, service coordination
- GET handler: Session listing and retrieval

**`services/session-manager.ts`** - Session lifecycle

- `resolveSession()` - Fetch or create session
- `resolveProjectFocus()` - Handle focus changes
- `getSessionWithMessages()` / `listUserSessions()` - GET operations

**`services/stream-handler.ts`** - SSE lifecycle

- `createStream()` - Initialize and run orchestration
- `runOrchestration()` - Event processing with guarantees:
    - `done` event always sent (success or error)
    - `error` event precedes `done` on errors
    - Metadata consolidated in single DB write (finally block)

**`services/ontology-cache.ts`** - Context caching

- Session-level cache with 5-minute TTL
- Wraps existing `OntologyContextLoader`

**`utils/context-utils.ts`** - Shared utilities

- `normalizeContextType()` - Handles 'general' → 'global' mapping
- `buildContextShiftLastTurnContext()` - Context shift handling

---

## 2. Agent Context Service

**File:** `/apps/web/src/lib/services/agent-context-service.ts`

### Purpose

Builds minimal, role-specific contexts for different agent types with intelligent token budgeting.

### Core Concepts

**Token Budget Strategy:**

```
PLANNER AGENT:
  - System Prompt: 800 tokens
  - Conversation: 2,500 tokens
  - Location Context: 1,000 tokens
  - User Profile: 300 tokens
  - Buffer: 400 tokens
  Total: ~5,000 tokens

EXECUTOR AGENT:
  - System Prompt: 300 tokens
  - Task Description: 200 tokens
  - Tools: 400 tokens
  - Context Data: 400 tokens
  - Buffer: 200 tokens
  Total: ~1,500 tokens
```

### Key Classes

#### 1. `PlannerContext` Interface (Lines 37-50)

```typescript
interface PlannerContext {
	systemPrompt: string;
	conversationHistory: LLMMessage[];
	locationContext: string;
	locationMetadata?: LocationContext['metadata'];
	userProfile?: string;
	availableTools: ChatToolDefinition[];
	metadata: {
		sessionId: string;
		contextType: ChatContextType;
		entityId?: string;
		totalTokens: number;
	};
}
```

#### 2. `ExecutorContext` Interface (Lines 68-79)

```typescript
interface ExecutorContext {
	systemPrompt: string;
	task: ExecutorTask;
	tools: ChatToolDefinition[];
	relevantData?: any;
	metadata: {
		executorId: string;
		sessionId: string;
		planId?: string;
		totalTokens: number;
	};
}
```

#### 3. `ExecutorTask` Interface (Lines 56-62)

```typescript
interface ExecutorTask {
	id: string;
	description: string;
	goal: string;
	constraints?: string[];
	contextData?: any;
}
```

### Main Methods

**`buildPlannerContext()` (Lines 154-216)**
Assembles full context for planning agent:

1. Load location context (abbreviated)
2. Load user profile
3. Build system prompt
4. Compress conversation history
5. Get all tools available
6. Calculate token usage

**`buildExecutorContext()` (Lines 680-718)**
Builds minimal, focused context for executor:

1. Build task-specific system prompt
2. Extract minimal relevant data
3. Calculate token usage

**`compressConversationForPlanner()` (Lines 432-489)**

- Uses ChatCompressionService if available
- Falls back to simple truncation (last 10 messages)
- Ensures conversation fits within token budget

**`loadLocationContextForPlanner()` (Lines 500-518)**
Loads context based on entity type:

- Project context (abbreviated: 500 chars)
- Task context (abbreviated)
- Calendar context
- Global context

### System Prompt Templates

**Planner Base Instructions (Lines 255-310)**

- Role: Intelligent orchestration
- Three-tier decision framework:
    1. Direct Query - Use tools directly
    2. Complex Multi-Step - Create plan, spawn executors
    3. Tool Delegation Strategy

**Context-Specific Modes (Lines 312-610)**

- Project Creation: Dimension-based questionnaire
- Project Update: Efficient change operations
- Project Audit: Critical analysis (read-only)
- Project Forecast: Scenario generation
- Task Update: Quick task modifications
- Daily Brief Update: Settings management

---

## 3. Chat Context Service

**File:** `/apps/web/src/lib/services/chat-context-service.ts`

### Purpose

Manages progressive disclosure pattern - abbreviated context initially, drill-down details as needed.

### Token Budget Allocation

```
HARD_LIMIT: 10,000 tokens

Context Assembly:
- System Prompt: 500
- User Profile: 300
- Location Context: 1,000
- Related Data: 500
- Conversation History: 4,000
- Response Buffer: 2,000
- Tool Results: 1,700
```

### Key Methods

**`loadLocationContext()` (Lines 487-518)**
Loads context based on ChatContextType:

- `project` - Project overview + abbreviated data (focus entity via project_focus)
- `calendar` - Next 7 days of events
- `global` - User's active projects and tasks
- `project_create` - Framework for project creation

**`getSystemPrompt()` (Lines 149-151)**
Returns full system prompt with context-specific additions.

**Context Levels:**

1. **ABBREVIATED (Token-Efficient)**
    - Project: Name, status, 500-char context, top 5 tasks
    - Focused entity: Title, status, 100-char description, linked entities
    - Calendar: Next 7 days in preview format
    - Data loss: ~70% reduction in tokens

2. **FULL (Detailed)**
    - Complete project with all dimensions and phases
    - Focused entity with linked details and full description
    - All related notes and brain dumps
    - Used only when user needs full details

### Tool Management

**`getTools()` (Lines 1329-1963)**
Returns context-appropriate tool subset:

```
REACTIVE MODES (global, project, task, calendar):
  - list_tasks
  - get_task_details
  - search_projects
  - get_project_details
  - search_notes
  - get_note_details
  - get_calendar_events
  - find_available_slots
  - get_field_info

PROACTIVE MODES (project_create, project_update, etc.):
  - create_project
  - update_project
  - create_task
  - update_task
  - schedule_task
  - create_note
  - create_brain_dump

UTILITY TOOLS:
  - get_field_info (schema reference)
```

---

## 4. Chat Compression Service

**File:** `/apps/web/src/lib/services/chat-compression-service.ts`

### Purpose

Compresses conversation history to maintain token budgets while preserving critical information.

### Key Methods

**`compressConversation()` (Lines 96-243)**

- Skips if already under target tokens
- Separates old and recent messages (keeps last 4 uncompressed)
- Uses LLM to summarize older messages
- Saves compression record to database
- Returns compressed message list with metadata

**`smartCompress()` (Lines 278-360)**

- Preserves tool calls and interactions
- Groups messages by context/time
- Compresses non-tool messages
- Maintains chronological order
- Returns metrics (compression ratio, tokens saved)

**`generateTitle()` (Lines 24-91)**

- Generates concise chat session titles (max 50 chars)
- Based on first 3-5 messages
- Updates session in database

---

## 5. Agent Planner Service

**File:** `/apps/web/src/lib/services/agent-planner-service.ts`

### Purpose

Orchestration layer - decides strategy and coordinates multi-agent execution.

### Key Concepts

**Complexity Analysis (Lines 49-55)**

```typescript
interface ComplexityAnalysis {
	strategy: PlanningStrategy; // 'simple' | 'tool' | 'complex'
	reasoning: string;
	estimatedOperations: number;
	requiresTools: boolean;
	requiresExecutors: boolean;
}
```

**Planning Strategies:**

1. **Simple** - Direct conversational response
2. **Tool** - Single tool call or simple operation
3. **Complex** - Multi-step plan requiring sub-agents

**Agent Plan (Lines 75-85)**

```typescript
interface AgentPlan {
	id: string;
	sessionId: string;
	userId: string;
	userMessage: string;
	strategy: PlanningStrategy;
	steps: PlanStep[];
	status: 'pending' | 'executing' | 'completed' | 'failed';
}
```

**Plan Step (Lines 60-70)**

```typescript
interface PlanStep {
	stepNumber: number;
	type: string; // 'search_project', etc.
	description: string;
	executorRequired: boolean;
	tools: string[];
	dependsOn?: number[]; // Step dependencies
	status: 'pending' | 'executing' | 'completed' | 'failed';
}
```

### Main Method: `processUserMessage()` (Stream Generator)

Entry point for all user messages:

1. Analyze message complexity
2. Decide strategy (simple/tool/complex)
3. Route to appropriate handler
4. Stream events through SSE

---

## 6. Agent Executor Service

**File:** `/apps/web/src/lib/services/agent-executor-service.ts`

### Purpose

Task execution layer - focused, stateless execution of specific tasks.

### Execution Model

```typescript
interface ExecuteTaskParams {
	executorId: string;
	sessionId: string;
	userId: string;
	task: ExecutorTask;
	tools: ChatToolDefinition[];
	planId?: string;
	contextType?: string;
	entityId?: string;
}

interface ExecutorResult {
	executorId: string;
	success: boolean;
	data?: any;
	error?: string;
	toolCallsMade: number;
	tokensUsed: number;
	durationMs: number;
}
```

### Safety Limits

```typescript
const LIMITS = {
	MAX_TOOL_CALLS: 10, // Prevent infinite loops
	MAX_EXECUTION_TIME_MS: 60000, // 60 seconds
	MAX_RETRIES: 2 // Retries per tool call
};
```

### Executor Event Stream

```typescript
type ExecutorEvent =
	| { type: 'start'; executorId: string; task: ExecutorTask }
	| { type: 'thinking'; content: string }
	| { type: 'tool_call'; toolCall: ChatToolCall }
	| { type: 'tool_result'; result: ChatToolResult }
	| { type: 'result'; data: Json }
	| { type: 'done'; result: ExecutorResult }
	| { type: 'error'; error: string };
```

---

## 7. Chat Tool Executor

**File:** `/apps/web/src/lib/chat/tool-executor.ts`

### Purpose

Executes tool calls via authenticated API endpoints (not direct DB access).

### Key Design Pattern

- Uses existing API endpoints for consistency
- Ensures business logic and validation are applied
- Handles side effects (especially calendar operations)
- Maintains RLS (Row-Level Security) policies

### Supported Tools

**Read Tools:**

- `list_tasks` - Abbreviated task lists
- `get_task_details` - Full task information
- `search_projects` - Project search with previews
- `get_project_details` - Full project context
- `search_notes` - Note search
- `get_note_details` - Full note content
- `get_calendar_events` - Calendar query
- `find_available_slots` - Schedule availability
- `search_brain_dumps` - Brain dump search
- `get_brain_dump_details` - Full brain dump

**Write Tools:**

- `create_project` - New project creation
- `update_project` - Project modifications
- `create_task` - New task creation
- `update_task` - Task modifications
- `schedule_task` - Calendar scheduling
- `create_note` - New notes
- `create_brain_dump` - New brain dumps

**Utility Tools:**

- `get_field_info` - Schema information reference

### Updatable Project Fields Whitelist

```typescript
const UPDATABLE_PROJECT_FIELDS = new Set([
	'name',
	'description',
	'executive_summary',
	'context',
	'status',
	'start_date',
	'end_date',
	'tags',
	'calendar_color_id',
	'calendar_sync_enabled',
	'core_goals_momentum',
	'core_harmony_integration',
	'core_integrity_ideals',
	'core_meaning_identity',
	'core_opportunity_freedom',
	'core_people_bonds',
	'core_power_resources',
	'core_reality_understanding',
	'core_trust_safeguards'
]);
```

---

## 8. Tool Configuration

**File:** `/apps/web/src/lib/chat/tools.config.ts`

### Tool Organization

**Progressive Disclosure Pattern:**

```
Tier 1: LIST/SEARCH Tools
  ↓ Return abbreviated summaries
  ↓ Reduce tokens by ~70%

Tier 2: DETAIL Tools
  ↓ Return complete information
  ↓ Only called when explicitly needed
```

### Entity Field Information

Provides authoritative schema information for:

- Projects (status values, field types, constraints)
- Tasks (priority, status, recurrence patterns)
- Notes (categories, tags)
- Brain Dumps (processing status)

Example:

```typescript
export const ENTITY_FIELD_INFO: Record<string, Record<string, FieldInfo>> = {
	project: {
		status: {
			type: 'enum',
			enum_values: ['active', 'paused', 'completed', 'archived'],
			description: 'Project lifecycle status...'
		},
		name: {
			type: 'string',
			description: 'Project name or title',
			required: true
		}
		// ... more fields
	},
	task: {
		status: {
			type: 'enum',
			enum_values: ['backlog', 'in_progress', 'done', 'blocked']
		},
		priority: {
			type: 'enum',
			enum_values: ['low', 'medium', 'high']
		}
		// ... more fields
	}
};
```

---

## 9. Request/Response Flow Diagram

```
USER → API Endpoint
       ↓
   [Authentication & Rate Limit Check]
       ↓
   [Get/Create Session]
       ↓
   [Load Conversation History]
       ↓
   [Initialize Services]
       ↓
   [Planner Service]
       ├─ Analyze Complexity
       ├─ Decide Strategy
       └─ Route to Handler
           ├─ Simple: Direct response
           ├─ Tool: Execute tools
           └─ Complex: Create plan & spawn executors
                      ↓
                   [Executor Service]
                   ├─ Build Task Context
                   ├─ Execute Tools
                   └─ Return Results
       ↓
   [Compress Conversation if needed]
       ↓
   [Save to Database]
       ├─ User message
       ├─ Assistant response
       └─ Tool calls/results
       ↓
   [Stream SSE Events to Client]
       ↓
   CLIENT ← SSE Response
```

---

## 10. Database Operations

### Chat Session Management

```sql
chat_sessions:
  - id (uuid)
  - user_id (uuid)
  - context_type (enum)
  - entity_id (uuid, optional)
  - status (active/archived)
  - title (auto-generated)
  - message_count
  - total_tokens_used
  - agent_metadata (JSON)
  - created_at / updated_at

chat_messages:
  - session_id (uuid)
  - user_id (uuid)
  - role (user/assistant/tool)
  - content (text)
  - tool_calls (JSON, optional)
  - tool_call_id (uuid, optional)
  - tool_name (text, optional)
  - tool_result (JSON, optional)
  - created_at

chat_compressions:
  - session_id (uuid)
  - original_messages (JSON[])
  - compressed_summary (text)
  - tokens_before (number)
  - tokens_after (number)
  - compression_ratio (number)
  - created_at

agents:
  - id (uuid)
  - session_id (uuid)
  - executor_id (text)
  - plan_id (uuid)
  - status (executing/completed/failed)
  - created_at / completed_at

agent_plans:
  - id (uuid)
  - session_id (uuid)
  - strategy (simple/tool/complex)
  - steps (JSON[])
  - status (pending/executing/completed/failed)

agent_executions:
  - id (uuid)
  - plan_id (uuid)
  - executor_id (text)
  - task (JSON)
  - status (executing/completed/failed)
  - result (JSON)
  - tokens_used (number)
  - execution_time_ms (number)
```

---

## 11. Key Implementation Patterns

### 1. **Streaming Response Pattern**

```typescript
// SSE response with background processing
const agentStream = SSEResponse.createChatStream();

(async () => {
  try {
    for await (const event of plannerService.processUserMessage(...)) {
      await agentStream.sendMessage(mapPlannerEventToSSE(event));
    }
    await agentStream.sendMessage({ type: 'done', ... });
  } catch (error) {
    await agentStream.sendMessage({ type: 'error', error: ... });
  } finally {
    await agentStream.close();
  }
})();

return agentStream.response;
```

### 2. **Progressive Context Disclosure**

```typescript
// Initial load: abbreviated
const abbreviated = await contextService.loadLocationContext(
	contextType,
	entityId,
	true, // abbreviated = true
	userId
);

// User drills down: full context via tool
const full = await contextService.loadLocationContext(
	contextType,
	entityId,
	false, // abbreviated = false
	userId
);
```

### 3. **Token Management Strategy**

```typescript
// 1. Estimate tokens
const estimatedTokens = Math.ceil(text.length / 4);

// 2. Check if within budget
if (estimatedTokens > tokenBudget) {
	// 3. Compress if needed
	const compressed = await compressionService.compressConversation(
		sessionId,
		messages,
		tokenBudget
	);
}
```

### 4. **Tool Execution via API**

```typescript
// Instead of direct DB access:
// ❌ WRONG: const data = await supabase.from('tasks').select()

// ✅ CORRECT: Use API endpoint
const response = await apiRequest('/api/tasks/list', {
  method: 'GET',
  body: JSON.stringify({ project_id: ... })
});
```

### 5. **Multi-Agent Coordination**

```typescript
// Planner analyzes and decides
const analysis = await plannerService.analyzeComplexity(message);

if (analysis.requiresExecutors) {
  // Spawn executors for each task
  for (const task of plan.steps) {
    const executor = new AgentExecutorService(...);
    const result = await executor.executeTask(task);

    yield { type: 'executor_result', result };
  }
}
```

---

## 12. Critical Design Decisions

1. **SSE for Streaming**
    - Real-time event updates to client
    - Handles long-running operations
    - Proper error handling and cleanup

2. **Progressive Disclosure**
    - Abbreviated context by default (~70% token reduction)
    - Tools for drilling down to full details
    - Client-driven information access

3. **Tool API Pattern**
    - All tools execute via API endpoints
    - Ensures business logic and validation
    - Maintains RLS and security policies
    - Enables consistent side effects

4. **Token Budgeting**
    - Precise allocation per agent type
    - Conversation compression when needed
    - Context truncation as fallback
    - Metadata tracking for optimization

5. **Multi-Agent Architecture**
    - Planner for strategy and coordination
    - Executors for focused task execution
    - Clear separation of concerns
    - Scalable to many concurrent tasks

6. **Chat History Management**
    - Compression for long conversations
    - Tool call preservation
    - Auto-title generation
    - Compression history tracking

---

## 13. Error Handling

### Rate Limiting

```typescript
if (userRateLimit.requests >= MAX_REQUESTS_PER_MINUTE) {
	return ApiResponse.error(
		'Too many requests. Agent system is more resource-intensive. Please wait before sending another message.',
		429,
		'RATE_LIMITED'
	);
}
```

### Session Management

```typescript
if (!existingSession) {
	return ApiResponse.notFound('Session');
}
```

### Database Operations

```typescript
if (sessionError) {
	console.error('Failed to create session:', sessionError);
	return ApiResponse.internalError(sessionError, 'Failed to create chat session');
}
```

### Streaming Errors

```typescript
try {
	// ... streaming logic
} catch (streamError) {
	console.error('Agent streaming error:', streamError);
	await agentStream.sendMessage({
		type: 'error',
		error: streamError instanceof Error ? streamError.message : 'Failed to generate response'
	});
} finally {
	await agentStream.close();
}
```

---

## 14. Performance Optimizations

1. **Token Estimation**
    - Simple formula: ~4 characters per token
    - Fast calculation, conservative estimate

2. **Message Limiting**
    - Load only recent 50 messages from DB
    - Prevents memory bloat
    - Falls back to compression if needed

3. **Lazy Service Initialization**
    - Only create services when needed
    - Services initialize their dependencies
    - Minimize startup overhead

4. **Context Caching**
    - Chat context cache with 1-hour TTL
    - Access tracking for analytics
    - Automatic expiration cleanup

5. **Abbreviated Data**
    - 70% reduction in context tokens
    - Truncated descriptions (100-500 chars)
    - Preview-first approach

---

## 15. Related Files Summary

### Configuration & Utilities

- `ChatContextService` - Context assembly with progressive disclosure
- `AgentContextService` - Token-efficient context building
- `ChatCompressionService` - Conversation compression
- `ChatToolExecutor` - Tool execution via API
- `tools.config.ts` - Tool definitions and field schemas

### Services

- `SmartLLMService` - LLM operations (streaming, completion)
- `CalendarService` - Google Calendar integration
- `PromptTemplateService` - System prompt templates

### Database Types

- `Database` schema in `database.schema.ts`
- `ChatSession`, `ChatMessage`, `ChatCompression` types
- Agent-related tables: `agents`, `agent_plans`, `agent_executions`

### API Response Wrapper

- `ApiResponse` utility for consistent endpoint responses
- `SSEResponse` utility for streaming responses
