# Chat System Architecture

## System Design

The BuildOS Chat System implements a sophisticated Progressive Disclosure Pattern that dramatically reduces token usage while maintaining rich, contextual AI interactions.

## Architecture Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        UI[Chat UI Components]
        SSE[SSE Processor]
    end

    subgraph "API Layer"
        API[/api/chat/stream]
        COMPRESS[/api/chat/compress]
        TITLE[/api/chat/generate-title]
    end

    subgraph "Service Layer"
        CONTEXT[ChatContextService]
        LLM[SmartLLMService]
        TOOLS[ToolExecutor]
        COMP[CompressionService]
    end

    subgraph "Data Layer"
        DB[(Supabase)]
        CACHE[Context Cache]
    end

    UI --> API
    API --> CONTEXT
    API --> LLM
    LLM --> TOOLS
    CONTEXT --> CACHE
    CONTEXT --> DB
    TOOLS --> DB
    COMP --> LLM

    SSE -.->|Stream| UI
    API -.->|SSE| SSE
```

## Core Components

### 1. Progressive Disclosure Engine

The heart of the system, managing two-tier data access:

```typescript
// Abbreviated data structure
interface AbbreviatedTask {
	id: string;
	title: string;
	status: string;
	description_preview: string; // 100 chars
	has_subtasks: boolean;
}

// Full data structure (loaded on demand)
interface DetailedTask extends AbbreviatedTask {
	full_description: string;
	details: string;
	task_steps: string;
	subtasks: Task[];
	metadata: Record<string, any>;
}
```

### 2. Context Assembly Pipeline

```typescript
class ChatContextService {
	async assembleContext(type: ChatContextType, entityId?: string) {
		// Stage 1: Load abbreviated data (400 tokens)
		const abbreviated = await this.loadAbbreviated(type, entityId);

		// Stage 2: Token budget check
		const tokenCount = this.estimateTokens(abbreviated);

		// Stage 3: Compression if needed
		if (tokenCount > BUDGET_LIMIT) {
			return this.compress(abbreviated);
		}

		return abbreviated;
	}
}
```

### 3. Tool Execution Framework

```typescript
class ToolExecutor {
	// Two-tier tool system
	listTools = ['list_tasks', 'search_projects']; // Abbreviated
	detailTools = ['get_task_details', 'get_project_details']; // Full

	async execute(tool: ChatToolCall) {
		// Route to appropriate handler
		if (this.listTools.includes(tool.name)) {
			return this.executeListTool(tool);
		} else if (this.detailTools.includes(tool.name)) {
			return this.executeDetailTool(tool);
		}
		return this.executeActionTool(tool);
	}
}
```

### 4. Streaming Architecture

```typescript
// Server-Sent Events for real-time responses
class SSEStreamHandler {
	async stream(response: ReadableStream) {
		const reader = response.getReader();
		const decoder = new TextDecoder();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value);
			await this.processChunk(chunk);
		}
	}
}
```

## Data Flow

### 1. Initial Request Flow

```
User Input → Context Assembly → LLM Processing → Response Stream
     ↓             ↓                  ↓              ↓
  Message     Abbreviated       Tool Calls      SSE Events
             Context (400t)    (if needed)
```

### 2. Progressive Disclosure Flow

```
List Request → Abbreviated Results → User Asks Details → Full Data Load
     ↓              ↓                       ↓                ↓
"Show tasks"    5 summaries          "Tell me about #3"   Complete task
              (200 tokens)                              (800 tokens)
```

### 3. Tool Execution Flow

```
Tool Request → Validation → Execution → Result Processing → Response
      ↓           ↓            ↓              ↓               ↓
  Function    Permission   Database      Format          Stream
   Call         Check       Query        Result         to User
```

## Token Management

### Budget Allocation Strategy

```typescript
const TOKEN_BUDGET = {
	TOTAL: 10000,
	CONTEXT: 4000, // System + user context
	CONVERSATION: 4000, // Message history
	RESPONSE: 2000, // LLM response

	// Sub-allocations
	ABBREVIATED_CONTEXT: 1500,
	DETAILED_CONTEXT: 3000,
	TOOL_RESULTS: 1000
};
```

### Compression Algorithm

```typescript
class CompressionService {
	compress(messages: ChatMessage[]): CompressedConversation {
		// Keep recent messages intact
		const recent = messages.slice(-3);

		// Summarize older messages
		const older = messages.slice(0, -3);
		const summary = this.summarize(older);

		return {
			summary,
			recent,
			tokenSavings: '60-70%'
		};
	}
}
```

## Database Schema

### Core Tables

```sql
-- Chat sessions
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  title TEXT,
  context_type TEXT,
  entity_id TEXT,
  status TEXT,
  created_at TIMESTAMP
);

-- Messages with token tracking
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES chat_sessions(id),
  role TEXT,
  content TEXT,
  tool_calls JSONB,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER
);

-- Tool execution history
CREATE TABLE chat_tool_executions (
  id UUID PRIMARY KEY,
  message_id UUID REFERENCES chat_messages(id),
  tool_name TEXT,
  arguments JSONB,
  result JSONB,
  duration_ms INTEGER,
  success BOOLEAN
);
```

### Indexes for Performance

```sql
-- Optimized for session queries
CREATE INDEX idx_sessions_user_status
  ON chat_sessions(user_id, status);

-- Optimized for message retrieval
CREATE INDEX idx_messages_session
  ON chat_messages(session_id, created_at);

-- Tool execution analytics
CREATE INDEX idx_tools_name_success
  ON chat_tool_executions(tool_name, success);
```

## Security Architecture

### 1. Input Validation

```typescript
// All user inputs validated
const validateMessage = (input: string): boolean => {
	return (
		input.length > 0 && input.length < MAX_MESSAGE_LENGTH && !containsMaliciousPatterns(input)
	);
};
```

### 2. Markdown Sanitization

```typescript
// Centralized safe rendering
import { renderMarkdown } from '$lib/utils/markdown';

// Sanitizes HTML, prevents XSS
const safeHtml = renderMarkdown(userContent);
```

### 3. Row-Level Security

```sql
-- Users can only access their own sessions
CREATE POLICY "Users can view own sessions" ON chat_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Prevent unauthorized modifications
CREATE POLICY "Users can update own sessions" ON chat_sessions
  FOR UPDATE USING (auth.uid() = user_id);
```

## Performance Optimizations

### 1. Caching Strategy

```typescript
class ContextCache {
	private cache = new Map<string, CachedContext>();

	get(key: string): CachedContext | null {
		const cached = this.cache.get(key);
		if (cached && !this.isExpired(cached)) {
			return cached;
		}
		return null;
	}

	set(key: string, context: any): void {
		this.cache.set(key, {
			data: context,
			timestamp: Date.now(),
			ttl: 5 * 60 * 1000 // 5 minutes
		});
	}
}
```

### 2. Streaming Optimizations

- Chunked responses for faster time-to-first-token
- Progressive rendering of tool results
- Debounced UI updates for smooth experience

### 3. Database Query Optimizations

- Abbreviated queries use specific column selection
- Pagination for large result sets
- Connection pooling for concurrent requests

## Error Handling

### Graceful Degradation

```typescript
try {
	const result = await toolExecutor.execute(toolCall);
	return { success: true, result };
} catch (error) {
	// Fallback to direct response
	return {
		success: false,
		error: 'Tool temporarily unavailable',
		fallback: await generateDirectResponse(query)
	};
}
```

### Retry Logic

```typescript
const retryWithBackoff = async (fn: Function, retries = 3) => {
	for (let i = 0; i < retries; i++) {
		try {
			return await fn();
		} catch (error) {
			if (i === retries - 1) throw error;
			await sleep(Math.pow(2, i) * 1000);
		}
	}
};
```

## Monitoring & Analytics

### Key Metrics Tracked

- Token usage per session
- Tool execution frequency
- Response latency
- Error rates
- User satisfaction (implicit from usage patterns)

### Analytics Pipeline

```typescript
class ChatAnalytics {
	track(event: AnalyticsEvent) {
		// Async tracking to not block main flow
		queueMicrotask(() => {
			this.sendToAnalytics({
				...event,
				timestamp: Date.now(),
				sessionId: this.sessionId,
				userId: this.userId
			});
		});
	}
}
```

## Scalability Considerations

### Horizontal Scaling

- Stateless API design enables multiple instances
- Session affinity not required
- Database connection pooling

### Vertical Scaling

- Efficient token usage reduces API costs
- Caching reduces database load
- Streaming reduces memory footprint

### Future Scaling Plans

- Redis for distributed caching
- Message queue for async tool execution
- CDN for static chat assets
- Regional deployments for latency

---

**Architecture Version**: 1.0.0
**Last Updated**: October 2025
