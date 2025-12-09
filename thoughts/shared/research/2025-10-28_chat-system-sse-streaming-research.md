---
title: 'BuildOS Chat System & SSE Streaming Infrastructure Research'
date: '2025-10-28'
author: 'Claude Code'
status: 'COMPLETED'
scope: 'Chat System Architecture'
path: thoughts/shared/research/2025-10-28_chat-system-sse-streaming-research.md
---

# BuildOS Chat System & SSE Streaming Infrastructure Research

## Executive Summary

This document provides a comprehensive analysis of the BuildOS chat system architecture, including:

- Chat session management and context handling
- Server-Sent Events (SSE) streaming implementation
- Tool execution framework and progressive disclosure pattern
- UI component architecture
- Opportunities for conversational agent extension

The chat system is production-ready with sophisticated context management, token budgeting, and tool integration patterns that provide an excellent foundation for building a conversational agent layer.

---

## 1. CHAT SYSTEM ARCHITECTURE OVERVIEW

### 1.1 Core Components

The BuildOS chat system consists of four main layers:

```
User Interface Layer
  ↓
Chat API Endpoints (SSE Streaming)
  ↓
Service Layer (Context, Compression, Tool Execution)
  ↓
Database & External Services
```

### 1.2 Key Files & Locations

| Component               | Location                                                | Purpose                                  |
| ----------------------- | ------------------------------------------------------- | ---------------------------------------- |
| Chat Types              | `packages/shared-types/src/chat.types.ts`               | Type definitions for all chat operations |
| Chat Context Service    | `apps/web/src/lib/services/chat-context-service.ts`     | Progressive disclosure context assembly  |
| Chat Streaming Endpoint | `apps/web/src/routes/api/chat/stream/+server.ts`        | Main SSE streaming API                   |
| Chat Modal UI           | `apps/web/src/lib/components/chat/ChatModal.svelte`     | Complete chat interface                  |
| Chat Messages UI        | `apps/web/src/lib/components/chat/ChatMessage.svelte`   | Individual message rendering             |
| Tool Executor           | `apps/web/src/lib/chat/tool-executor.ts`                | Tool invocation & execution              |
| Tool Definitions        | `apps/web/src/lib/chat/tools.config.ts`                 | Tool specifications (27 tools)           |
| SSE Response Utilities  | `apps/web/src/lib/utils/sse-response.ts`                | Low-level SSE operations                 |
| SSE Processor           | `apps/web/src/lib/utils/sse-processor.ts`               | Stream parsing & event dispatch          |
| Compression Service     | `apps/web/src/lib/services/chat-compression-service.ts` | Token budget management                  |

---

## 2. CHAT SESSIONS & CONTEXT TYPES

### 2.1 Chat Context Types

The system supports four context types:

```typescript
type ChatContextType = 'global' | 'project' | 'task' | 'calendar';
```

**Context Details:**

- **global**: No specific context; assistant operates across entire BuildOS
- **project**: Focused on a specific project with abbreviated project context
- **task**: Focused on a specific task with full task details
- **calendar**: Calendar-aware context for scheduling assistance

### 2.2 Chat Session Structure

```typescript
interface ChatSession {
	id: string;
	user_id: string;
	context_type: ChatContextType;
	entity_id?: string; // projectId, taskId, etc.
	title: string; // Auto-generated after 2 messages
	status: 'active' | 'archived' | 'compressed';
	message_count: number;
	tool_call_count: number;
	total_tokens_used: number;
	created_at: string;
	updated_at: string;
}
```

### 2.3 Chat Message Structure

```typescript
interface ChatMessage {
	id: string;
	session_id: string;
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	tool_calls?: ChatToolCall[]; // For assistant messages
	tool_call_id?: string; // For tool result messages
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
	created_at: string;
	metadata?: any;
	error_message?: string;
	error_code?: string;
}
```

---

## 3. PROGRESSIVE DISCLOSURE PATTERN

### 3.1 Overview

The chat system implements a sophisticated **progressive disclosure pattern** to optimize token usage:

- **Phase 1 (Abbreviated)**: Load abbreviated data (70% token reduction) on session start
- **Phase 2 (Detailed)**: Load full data only when user/AI explicitly requests details
- **Phase 3 (Drill Down)**: Use tool calls to access complete information

### 3.2 Context Layer Assembly

The system builds context in layers with token budgeting:

```
Layer 1: System Prompt (500 tokens)
  ├─ Instructions for progressive disclosure
  ├─ Tool descriptions
  └─ Context-specific guidance

Layer 2: User Profile (300 tokens)
  ├─ Timezone
  ├─ Work style preferences
  └─ Calendar status

Layer 3: Location Context (1000 tokens) - ABBREVIATED
  ├─ Current project/task (if applicable)
  └─ Key metadata & preview content

Layer 4: Related Data (500 tokens) - ABBREVIATED
  ├─ Recent notes
  ├─ Parent/sibling tasks
  └─ Project relationships

Layer 5: Conversation History (4000 tokens)
  ├─ Last 10 messages (or compressed version)
  └─ Tool results from execution

Response Buffer (2000 tokens) - Reserved for LLM output
Tool Results Buffer (1700 tokens) - For tool execution responses

TOTAL HARD LIMIT: 10,000 tokens
```

### 3.3 Abbreviated Data Structures

**AbbreviatedTask:**

```typescript
{
  id, title, status, priority, start_date, duration_minutes,
  description_preview (100 chars),        // Truncated
  details_preview (100 chars),            // Truncated
  has_subtasks, has_dependencies,
  is_recurring, is_overdue,
  project_name
}
```

**AbbreviatedProject:**

```typescript
{
  id, name, slug, status, start_date, end_date,
  description, executive_summary, tags,
  context_preview (500 chars),            // Truncated
  task_count, active_task_count,
  completion_percentage,
  has_phases, has_notes, has_brain_dumps
}
```

**AbbreviatedNote:**

```typescript
{
  id, title, category,
  content_preview (200 chars),            // Truncated
  tags, created_at, project_name
}
```

### 3.4 Progressive Disclosure in Action

**User Query**: "What's the status of the API migration project?"

1. **Auto-loaded** (Abbreviated): Project name, status, 70% of project data, task counts
2. **If user asks "Tell me more"**: Drill down with `get_project_details()` tool
3. **If user needs specifics**: Access full context, notes, brain dumps via individual tools

---

## 4. SSE STREAMING IMPLEMENTATION

### 4.1 SSE Architecture

**SSE Message Types:**

```typescript
type ChatSSEMessage =
	| { type: 'session'; session: ChatSession } // Initial hydration
	| { type: 'text'; content: string } // Streaming text
	| { type: 'tool_call'; tool_call: ChatToolCall } // Tool invocation
	| { type: 'tool_result'; tool_result: ChatToolResult } // Tool output
	| { type: 'error'; error: string } // Error notification
	| { type: 'done'; usage?: TokenUsage; finished_reason?: string };
```

### 4.2 Streaming Endpoint: POST /api/chat/stream

**Request:**

```typescript
interface ChatStreamRequest {
	message: string;
	session_id?: string; // Omit for new session
	context_type?: ChatContextType;
	entity_id?: string; // projectId, taskId, etc.
}
```

**Flow:**

1. ✓ Authentication check
2. ✓ Rate limiting (30 req/min, 50k tokens/min)
3. ✓ Session management (create or retrieve)
4. ✓ Context assembly (progressive disclosure)
5. ✓ Conversation history loading + compression if needed
6. ✓ LLM streaming with tool execution
7. ✓ SSE event dispatch to client

### 4.3 Server-Side Streaming Flow (Simplified)

```
Client sends message
  ↓
POST /api/chat/stream
  ↓
Validate & rate limit
  ↓
Create/get session + build context
  ↓
Load & compress conversation history
  ↓
Send 'session' event (hydrate client)
  ↓
Stream LLM response
  ├─ For each text chunk: send 'text' event
  ├─ If tool call detected:
  │  ├─ Send 'tool_call' event
  │  ├─ Execute tool (ChatToolExecutor)
  │  ├─ Send 'tool_result' event
  │  └─ Resume streaming with result
  └─ On completion: send 'done' event
  ↓
Save conversation (async)
  ↓
Close stream
```

### 4.4 SSE Response Utilities

**SSEResponse class** provides:

```typescript
// Create SSE stream
static createChatStream() {
  return {
    response: Response,           // HTTP response object
    sendMessage: async (data),    // Send SSE event
    close: async ()               // Gracefully close
  }
}

// Send individual messages
static async sendMessage(writer, encoder, data, event?)

// Error responses
static error(message, status, code?)
static unauthorized()
static badRequest(message)
static internalError(error, message)
static notFound(resource)
```

### 4.5 Client-Side SSE Processing

**SSEProcessor class** handles:

```typescript
// Process stream with callbacks
static async processStream(
  response: Response,
  callbacks: StreamCallbacks,
  options?: SSEProcessorOptions
)

// Callbacks available:
interface StreamCallbacks {
  onProgress?: (data: ChatSSEMessage) => void
  onComplete?: (result: any) => void
  onError?: (error: Error) => void
  onStatus?: (status: string) => void
}

// Options:
interface SSEProcessorOptions {
  timeout?: number              // Default: 60s
  parseJSON?: boolean           // Default: true
  onParseError?: (error, chunk) => void
}
```

---

## 5. CHAT TOOLS SYSTEM

### 5.1 Tool Organization (27 Tools Total)

Tools are organized into 4 categories with progressive disclosure strategy:

#### **Category 1: LIST/SEARCH Tools** (Abbreviated Results)

- `list_tasks` - Filter tasks (status, priority, dates)
- `search_projects` - Search by name, description, tags
- `search_notes` - Full-text search on notes
- `search_brain_dumps` - Search brain dump summaries

**Result Pattern**: Returns 10-20 abbreviated items with previews

#### **Category 2: DETAIL Tools** (Complete Information)

- `get_task_details` - Full task with subtasks, dependencies, calendar events
- `get_project_details` - Complete project context, phases, tasks, notes
- `get_note_details` - Full note content
- `get_brain_dump_details` - Complete dump with all extracted operations

**Result Pattern**: Returns 1 item with all available data

#### **Category 3: ACTION Tools** (Mutations)

- `create_task` - Create new task (with optional subtask parent)
- `update_task` - Update task fields, schedule changes
- `update_project_context` - Append/prepend/replace project context
- `create_note` - Create new note with tags
- `create_brain_dump` - Queue brain dump for processing

**Result Pattern**: Returns created/updated object with confirmation

#### **Category 4: CALENDAR Tools** (8 tools)

**Calendar Queries:**

- `get_calendar_events` - Get events in date range
- `find_available_slots` - Find free time blocks
- `get_task_calendar_events` - Get calendar events linked to a task
- `check_task_has_calendar_event` - Quick check if task is scheduled

**Calendar Mutations:**

- `schedule_task` - Create calendar event for task
- `update_or_schedule_task` - Smart scheduling (create or update)
- `update_calendar_event` - Modify event details
- `delete_calendar_event` - Remove calendar event

### 5.2 Tool Definition Structure

Each tool follows OpenAI function-calling format:

```typescript
interface ChatToolDefinition {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: {
			type: 'object';
			properties: Record<string, any>;
			required?: string[];
		};
	};
}
```

**Example: `list_tasks`**

```typescript
{
  name: 'list_tasks',
  description: 'Get abbreviated list of tasks. Returns summaries with first 100 chars...',
  parameters: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: '...' },
      status: { type: 'array', enum: ['backlog', 'in_progress', 'done', 'blocked'] },
      priority: { type: 'array', enum: ['low', 'medium', 'high'] },
      has_date: { type: 'boolean' },
      limit: { type: 'number', default: 20, maximum: 50 },
      sort_by: { type: 'string', enum: ['priority', 'start_date', 'created_at'] }
    }
  }
}
```

### 5.3 Tool Execution Flow

**ChatToolExecutor class** (`apps/web/src/lib/chat/tool-executor.ts`):

```
Tool Call Received
  ↓
Parse arguments from JSON string
  ↓
Switch on tool name
  ├─ LIST/SEARCH: Query with filters, abbreviate results
  ├─ DETAIL: Full query, include all relationships
  ├─ ACTION: Via API endpoints (consistency & side effects)
  └─ CALENDAR: Via CalendarService (manages Google integration)
  ↓
Measure execution time
  ↓
Log execution to chat_tool_executions table (analytics)
  ↓
Return result or error
```

**Tool Execution Caching:**

- Tool results are stored in conversation messages
- Subsequent LLM turns have full context of previous results
- No re-fetching of previously executed tools

### 5.4 Tool Categories for Analytics

```typescript
TOOL_CATEGORIES = {
  list: {
    tools: ['list_tasks', 'search_projects', 'search_notes', 'search_brain_dumps'],
    averageTokens: 200,
    costTier: 'low'
  },
  detail: {
    tools: ['get_task_details', 'get_project_details', 'get_note_details', 'get_brain_dump_details'],
    averageTokens: 800,
    costTier: 'medium'
  },
  action: {
    tools: ['create_task', 'update_task', 'update_project_context', 'create_note', 'create_brain_dump'],
    averageTokens: 150,
    costTier: 'low'
  },
  calendar: {
    tools: ['get_calendar_events', 'find_available_slots', 'schedule_task', ...],
    averageTokens: 300,
    costTier: 'medium'
  }
}
```

---

## 6. CONTEXT SERVICE: ChatContextService

### 6.1 Core Methods

```typescript
class ChatContextService {
  // Build initial abbreviated context for new session
  async buildInitialContext(
    sessionId: string,
    contextType: ChatContextType,
    entityId?: string
  ): Promise<AssembledContext>

  // Load full context layers (progressively)
  private async loadLocationContext(...)
  private async loadRelatedData(...)

  // Project context methods
  private async loadProjectContext(projectId, abbreviated)
  private async loadFullProjectContext(projectId)

  // Task context methods
  private async loadTaskContext(taskId, abbreviated)
  private async loadFullTaskContext(taskId)

  // Calendar context
  private async loadCalendarContext(abbreviated)

  // Global context (no specific entity)
  private async loadGlobalContext(abbreviated)

  // Context caching
  async cacheContext(userId, contextType, entityId, context)
  async getCachedContext(userId, contextType, entityId)
  async cleanExpiredCache()
}
```

### 6.2 Token Budgeting Algorithm

```typescript
assembleContext(layers: ContextLayer[]): ContextBundle {
  1. Sort layers by priority (1=highest)
  2. Calculate total budget: 3300 tokens (context only)
  3. For each layer:
     - If fits completely: include full
     - If truncatable & partial fit: include truncated
     - Otherwise: skip
  4. Return { layers, totalTokens, utilization% }
}
```

### 6.3 System Prompt Template

The system prompt dynamically includes:

- Current date
- Progressive disclosure instructions
- Tier 1 (LIST/SEARCH) vs Tier 2 (DETAIL) tools breakdown
- Context-specific guidance (project/task/calendar/global)
- Examples of tool usage patterns

---

## 7. UI COMPONENT ARCHITECTURE

### 7.1 ChatModal.svelte - Main Interface

**Key Features:**

- Split layout: Messages (main) + Session history (sidebar)
- Streaming message rendering
- Tool visualization
- Voice input support
- Session management (rename, delete)
- Session persistence & prefetching

**State Management (Svelte 5 runes):**

```typescript
let messages = $state<ChatMessage[]>([]);
let currentSession = $state<ChatSession | null>(null);
let isStreaming = $state(false);
let currentStreamingMessage = $state('');
let currentToolCalls = $state<ChatToolCall[]>([]);
let currentToolResults = $state<ChatToolResult[]>([]);

// Derived state
let isSendDisabled = $derived(!inputValue.trim() || isStreaming || isRecording);
```

**Key Functions:**

- `sendMessage()` - POST to /api/chat/stream, handle SSE
- `handleSessionHydration()` - Update state from session event
- `finalizeAssistantMessage()` - Save to database
- `generateSessionTitle()` - Auto-generate after 2 exchanges
- `loadSession(id)` - Restore session from database
- `loadRecentSessions()` - Prefetch chat history

**Voice Features:**

- Microphone access + permission handling
- Live transcription support (Deepgram-based)
- Recording duration display
- Audio file submission

**Session Management:**

- Session list with context badges
- Session rename dialog
- Session delete with history preservation
- Auto-select next session on delete

### 7.2 ChatMessage.svelte - Message Rendering

**Supports:**

- User messages (plain text, right-aligned)
- Assistant messages (Markdown rendering)
- System messages (code styling)
- Tool messages (code block formatting)
- Error states with retry button
- Token usage display (debug)

**Markdown Rendering:**

- Safe HTML rendering via `renderSafeMarkdown()`
- Prose classes for styling
- Code block support
- List formatting

### 7.3 ToolVisualization.svelte - Tool Call Display

**Shows:**

- Tool name & icon
- Input arguments
- Execution status (pending/executing/done)
- Tool results (formatted JSON or text)
- Error messages

---

## 8. CONVERSATION HISTORY & COMPRESSION

### 8.1 History Management

**On Each Request:**

1. Load all previous messages for session
2. Check if compression needed (>20 messages or high token count)
3. If yes: compress conversation, save compressed version
4. Include history in LLM context (last 10 messages or compressed)

### 8.2 Chat Compression Service

```typescript
class ChatCompressionService {
	// Generate title for session (first 5 messages)
	async generateTitle(sessionId, messages, userId);

	// Compress conversation to reduce tokens
	async compressConversation(
		sessionId,
		messages,
		targetTokens = 2000,
		userId
	): Promise<{
		compressedMessages: LLMMessage[];
		compressionId: string;
		tokensSaved: number;
	}>;

	// Check if compression is needed
	async shouldCompress(messages, threshold);
}
```

**Compression Strategy:**

1. Estimate current tokens (1 token ≈ 4 chars)
2. If below target: return original messages
3. If above target: summarize conversation with LLM
4. Return compressed LLM messages for context inclusion

---

## 9. LLM SERVICE INTEGRATION

### 9.1 SmartLLMService

**Key capabilities:**

- Multiple model selection (30+ models via OpenRouter)
- Profile-based selection (speed, balanced, quality, creative)
- Streaming text generation
- JSON mode with structured output
- Function calling support (tools)
- Token tracking & cost estimation

**Profiles Available:**

| Profile  | Use Case          | Speed           | Quality         |
| -------- | ----------------- | --------------- | --------------- |
| speed    | Chat responses    | Fast (4+ speed) | Good            |
| balanced | General purpose   | 3-4 speed       | Very Good       |
| quality  | Complex reasoning | 2-3 speed       | Excellent       |
| creative | Brainstorming     | 3+ speed        | High creativity |

**Model Selection Logic:**

- Default: Fast models (Grok, Gemini Flash, GPT-4o-mini)
- For complex tasks: Mid-tier (Claude 3.5, DeepSeek)
- For maximum quality: Premium models (Claude Opus, GPT-4 Turbo)

### 9.2 Streaming Configuration

```typescript
llmService.streamText({
  messages: LLMMessage[],           // Message history
  tools: ChatToolDefinition[],       // Available tools
  tool_choice: 'auto',               // Auto-invoke when needed
  userId: string,
  profile: 'speed',                  // Model profile
  temperature: 0.7,                  // Creativity level
  maxTokens: 2000,
  sessionId: string,
  messageId: string
})

// Yields chunks:
type StreamChunk =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; tool_call: ChatToolCall }
  | { type: 'done'; usage: TokenUsage }
  | { type: 'error'; error: string }
```

---

## 10. DATABASE SCHEMA (Chat Tables)

### 10.1 Core Tables

```sql
-- Chat Sessions
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  context_type TEXT,              -- 'global', 'project', 'task', 'calendar'
  entity_id UUID,                 -- projectId, taskId, etc.
  title TEXT DEFAULT 'Untitled Chat',
  status TEXT DEFAULT 'active',   -- 'active', 'archived', 'compressed'
  message_count INTEGER DEFAULT 0,
  tool_call_count INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
)

-- Chat Messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  role TEXT,                      -- 'user', 'assistant', 'system', 'tool'
  content TEXT,
  tool_calls JSONB,               -- Array of tool calls made
  tool_call_id TEXT,              -- Reference to tool call (for tool results)
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  created_at TIMESTAMP,
  metadata JSONB,
  error_code TEXT,
  error_message TEXT,
  FOREIGN KEY(session_id) REFERENCES chat_sessions(id)
)

-- Tool Execution Tracking
CREATE TABLE chat_tool_executions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  tool_name TEXT,
  tool_category TEXT,             -- 'list', 'detail', 'action', 'calendar'
  arguments JSONB,
  result JSONB,
  success BOOLEAN,
  execution_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP
)

-- Context Caching
CREATE TABLE chat_context_cache (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  cache_key TEXT,                 -- "{contextType}:{entityId}"
  context_type TEXT,
  entity_id UUID,
  abbreviated_context JSONB,      -- Cached context layers
  abbreviated_tokens INTEGER,
  full_context_available BOOLEAN,
  access_count INTEGER DEFAULT 0,
  accessed_at TIMESTAMP,
  expires_at TIMESTAMP,           -- 1 hour TTL
  UNIQUE(user_id, cache_key)
)

-- Conversation Compression
CREATE TABLE chat_compressions (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  original_tokens INTEGER,
  compressed_tokens INTEGER,
  tokens_saved INTEGER,
  compression_ratio FLOAT,
  compressed_content JSONB,
  created_at TIMESTAMP
)
```

---

## 11. RATE LIMITING & RELIABILITY

### 11.1 Rate Limiting

```typescript
const RATE_LIMIT = {
	MAX_REQUESTS_PER_MINUTE: 30,
	MAX_TOKENS_PER_MINUTE: 50000
};

// Per-user tracking
rateLimiter = Map<
	userId,
	{
		requests: number;
		tokens: number;
		resetAt: number;
	}
>;
```

### 11.2 Error Handling

**Graceful degradation:**

- Calendar disconnection detection (requires reconnection)
- Missing context fallback (global context)
- Tool execution timeout (return error, continue conversation)
- SSE stream timeout (60 second default)

---

## 12. EXISTING CONVERSATIONAL PATTERNS

### 12.1 Brain Dump Integration

The system already has conversational flows in:

- **Brain Dump Processing** - Multi-stage conversation with AI
- **Brain Dump Questions** - Clarifying questions flow
- **DailyBrief Generation** - Streaming narrative generation

These demonstrate successful multi-turn patterns with context awareness.

### 12.2 Potential Agent Extension Points

1. **Conversation Layer**
    - Extend ChatModal for agentic decision-making
    - Add planning/reasoning phases before tool execution
    - Multi-step goal decomposition

2. **Tool System**
    - Already supports 27 tools
    - Can be extended for agentic workflows
    - Tool composition (tool A → tool B chains)

3. **Context Enhancement**
    - Progressive disclosure supports iterative refinement
    - Can add "working context" for agent planning
    - Support for agent state persistence

4. **Execution Patterns**
    - Current streaming supports real-time feedback
    - Can add execution checkpoints
    - Supports human-in-the-loop for critical decisions

---

## 13. KEY INSIGHTS FOR AGENT DEVELOPMENT

### 13.1 Strengths of Current System

1. **Progressive Disclosure**: Excellent for agents that refine context over multiple turns
2. **Token Budgeting**: Critical for long-running agents
3. **Tool Ecosystem**: 27 well-designed tools ready for agentic use
4. **Streaming Infrastructure**: Real-time feedback capabilities built-in
5. **Context Management**: Supports session-level state & memory

### 13.2 Ready-to-Use Capabilities

- Session persistence across multiple requests
- Automatic context assembly based on user profile
- Tool execution with full error handling
- Real-time streaming to frontend
- Compression for long conversations
- Analytics on tool usage

### 13.3 Extension Opportunities

**For a Conversational Agent:**

1. Add agent reasoning/planning layer
2. Implement multi-turn goal decomposition
3. Support for tool chaining & composition
4. Agent-specific metrics (steps taken, decisions made)
5. Rollback/checkpoint system for exploration

---

## 14. TECHNICAL SPECIFICATIONS

### 14.1 Performance Characteristics

| Metric                   | Value         | Notes                 |
| ------------------------ | ------------- | --------------------- |
| SSE Stream Timeout       | 60 seconds    | Default, configurable |
| Token Budget (Context)   | 3,300 tokens  | Session start         |
| Token Budget (LLM)       | 10,000 tokens | Hard limit            |
| Average Tool Latency     | 100-500ms     | Variable by tool      |
| Session Title Generation | < 5 seconds   | Async background job  |
| Message Save Latency     | < 1 second    | Async                 |

### 14.2 Authentication & Security

- Supabase Auth integration
- User ID from auth context
- Row-level security (RLS) on database
- Rate limiting per authenticated user
- Token validation on all endpoints

### 14.3 Scalability Notes

- Rate limiting prevents abuse
- Message compression prevents history bloat
- Context caching (1-hour TTL) reduces DB load
- Tool execution logging for analytics
- Async background processing for titles

---

## 15. WORKFLOW EXAMPLES

### 15.1 Simple Query Flow

```
User: "What's in my backlog?"
  ↓
Request: { message: "...", context_type: 'global' }
  ↓
Session created, abbreviated context loaded
  ↓
LLM receives: system prompt + user profile + global context + message
  ↓
LLM decides: call list_tasks(status: ['backlog'])
  ↓
Tool executes: returns 15 tasks (abbreviated)
  ↓
LLM generates response: "You have 15 backlog items. Here are the top priorities..."
  ↓
Response streamed to user as: text events + done
```

### 15.2 Complex Workflow with Tool Chain

```
User: "Help me schedule the API migration. What's free tomorrow and who's involved?"
  ↓
LLM calls: find_available_slots(tomorrow)
  ↓
Streams tool_call, executes, returns: [9-10am, 2-3pm, 4-5pm]
  ↓
LLM calls: get_project_details(project_id: 'api-migration')
  ↓
Streams tool_call, executes, returns: full project with team info
  ↓
LLM calls: schedule_task(task_id, start_time: '2pm tomorrow')
  ↓
Streams tool_call, executes, returns: calendar event created
  ↓
LLM generates: "Scheduled the migration kick-off for 2pm tomorrow. Added [names] to the meeting..."
  ↓
All streamed to user in real-time
```

### 15.3 Conversation with History

```
Turn 1: User asks about project X
  → Session created, context_type='project', entity_id='proj_x_id'
  → Message saved to database

Turn 2: User asks follow-up: "What about the subtasks?"
  → Previous message loaded from database
  → New context built with project X context
  → LLM has full conversation history
  → Responds with focused answer

Turn 3: (20 messages later) Compression triggered
  → Conversation summarized with LLM
  → Compressed messages replace history in context
  → Token usage reduced 50-70%
```

---

## 16. DEPLOYMENT CONSIDERATIONS

### 16.1 Required Environment Variables

```bash
# LLM Service
PRIVATE_OPENROUTER_API_KEY=sk_...

# Supabase (chat tables created via migrations)
PUBLIC_SUPABASE_URL=https://...
PUBLIC_SUPABASE_ANON_KEY=eyJ...
PRIVATE_SUPABASE_SERVICE_KEY=eyJ...

# Google Calendar (for calendar tools)
PUBLIC_GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### 16.2 Database Migrations Required

All chat tables are already in place:

- `chat_sessions`
- `chat_messages`
- `chat_tool_executions`
- `chat_context_cache`
- `chat_compressions`

No additional migrations needed for core functionality.

---

## 17. TESTING & VALIDATION

### 17.1 Unit Tests Exist For

- Progressive disclosure pattern token budgeting
- Context assembly logic
- Tool execution
- Token estimation algorithms

**Test Location**: `apps/web/src/lib/tests/chat/`

### 17.2 Testing Strategy for Extensions

1. Unit tests for new agent reasoning layer
2. Integration tests with tool execution
3. E2E tests for streaming + UI
4. Load tests for rate limiting verification
5. Token budget validation tests

---

## 18. REFERENCES & RELATED CODE

### 18.1 Key Files (Absolute Paths)

- Chat types: `/apps/web/src/lib/services/chat-context-service.ts`
- Stream endpoint: `/apps/web/src/routes/api/chat/stream/+server.ts`
- Tool executor: `/apps/web/src/lib/chat/tool-executor.ts`
- UI component: `/apps/web/src/lib/components/chat/ChatModal.svelte`
- Type definitions: `/packages/shared-types/src/chat.types.ts`

### 18.2 Related Documentation

- Brain Dump System: `/apps/web/docs/features/brain-dump/`
- Project Management: `/apps/web/docs/features/projects/`
- Calendar Integration: `/apps/web/docs/features/calendar-integration/`

---

## CONCLUSION

The BuildOS chat system provides a **robust, well-architected foundation** for building conversational agents. The progressive disclosure pattern, comprehensive tool ecosystem, and sophisticated streaming infrastructure are production-ready and battle-tested.

Key strengths:

- Scalable token budgeting
- Real-time streaming with full error handling
- 27 well-designed tools
- Session persistence
- User context awareness

The system is designed to extend naturally into agent workflows, with existing patterns already supporting complex, multi-turn conversations.

---

**Document Status**: Complete
**Last Updated**: 2025-10-28 22:45 UTC
**Author**: Claude Code Research
