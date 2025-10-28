# 📋 BuildOS Chat System - Tailored Implementation Specification

### ⚠️ Note: This is v1 - See Updated Version

- **Latest Specification:** `/thoughts/shared/ideas/chat-spec-improved-v2.md` - v2 with progressive disclosure
- **Implementation Index:** `/thoughts/shared/ideas/chat-implementation-index.md` - Complete navigation guide
- **Design Document:** `/thoughts/shared/ideas/chat-context-and-tools-design.md` - Detailed implementation

## Executive Summary

This specification has been tailored to the BuildOS codebase patterns after analyzing:

- ✅ Calendar Service integration (`calendar-service.ts`)
- ✅ Smart LLM Service extension (`smart-llm-service.ts`)
- ✅ Database type patterns (shared types package)
- ✅ API streaming patterns (SSE with existing utilities)
- ✅ Component architecture (Svelte 5 runes + Modal patterns)

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  ChatModal.svelte (extends Modal.svelte)                │
│  - Uses Svelte 5 runes ($state, $derived, $effect)      │
│  - Portal rendering with focus trap                     │
│  - Integrates with notification.store.ts                │
└────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  /api/chat/stream/+server.ts (SSE Endpoint)             │
│  - Uses SSEResponse utility                            │
│  - Rate limiting with RATE_LIMITS.API_AI               │
│  - Authentication with safeGetSession                  │
└────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  ChatService (New Service Layer)                        │
│  - Context management & token tracking                  │
│  - Tool execution coordination                          │
│  - Database operations                                  │
└────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  SmartLLMService (Extended)                             │
│  - New streamText() method for SSE                      │
│  - Existing model selection & cost tracking             │
│  - OpenRouter streaming integration                     │
└────────────────────────────────────────────────────────┘
```

---

## 💾 Database Schema (Following BuildOS Patterns)

```sql
-- Migration: /supabase/migrations/YYYYMMDDHHMMSS_create_chat_tables.sql

-- Chat sessions table
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

    -- Context (following project pattern)
    context_type TEXT CHECK (context_type IN ('project', 'task', 'calendar', 'global')) NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    calendar_date DATE,

    -- Metadata
    title TEXT DEFAULT 'New Chat',
    title_generated BOOLEAN DEFAULT FALSE,

    -- Context management (JSONB pattern from brain_dumps)
    conversation_summary TEXT,
    key_decisions JSONB DEFAULT '[]'::jsonb,
    created_entities JSONB DEFAULT '[]'::jsonb,

    -- Token tracking
    total_tokens_used INTEGER DEFAULT 0,
    token_limit INTEGER DEFAULT 10000,
    messages_archived INTEGER DEFAULT 0,
    last_compression_at TIMESTAMPTZ,

    -- Timestamps (standard pattern)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,

    role TEXT CHECK (role IN ('user', 'assistant', 'system', 'tool')) NOT NULL,
    content TEXT,

    -- Tool tracking (JSONB for flexibility)
    tool_calls JSONB,
    tool_results JSONB,

    -- Context management
    is_archived BOOLEAN DEFAULT FALSE,
    is_in_summary BOOLEAN DEFAULT FALSE,
    token_count INTEGER DEFAULT 0,

    -- Link to LLM usage tracking
    llm_usage_log_id UUID REFERENCES llm_usage_logs(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tool execution logs (for analytics)
CREATE TABLE chat_tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE NOT NULL,

    tool_name TEXT NOT NULL,
    tool_category TEXT CHECK (tool_category IN ('project', 'task', 'calendar', 'context')) NOT NULL,
    arguments JSONB NOT NULL,
    result JSONB,
    duration_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_context ON chat_sessions(context_type, project_id, task_id);
CREATE INDEX idx_chat_sessions_last_message ON chat_sessions(user_id, last_message_at DESC);
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_archived ON chat_messages(session_id, is_archived);
CREATE INDEX idx_tool_executions_session ON chat_tool_executions(session_id);

-- RLS Policies (following BuildOS patterns)
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_tool_executions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own chat sessions
CREATE POLICY "Users can manage own chat sessions"
  ON chat_sessions FOR ALL
  USING (auth.uid() = user_id);

-- Users can only access messages from their sessions
CREATE POLICY "Users can manage own chat messages"
  ON chat_messages FOR ALL
  USING (EXISTS (
    SELECT 1 FROM chat_sessions
    WHERE id = session_id AND user_id = auth.uid()
  ));

-- Users can only view their tool executions
CREATE POLICY "Users can view own tool executions"
  ON chat_tool_executions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM chat_sessions
    WHERE id = session_id AND user_id = auth.uid()
  ));
```

---

## 🔧 TypeScript Types (Following Shared Types Pattern)

### 1. Shared Types Package Addition

```typescript
// /packages/shared-types/src/chat.types.ts

import type { Database } from './database.types';

// Extract base types from database
export type ChatSession = Database['public']['Tables']['chat_sessions']['Row'];
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
export type ChatToolExecution = Database['public']['Tables']['chat_tool_executions']['Row'];

// Insert/Update types
export type ChatSessionInsert = Database['public']['Tables']['chat_sessions']['Insert'];
export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];

// Context types
export type ChatContextType = 'project' | 'task' | 'calendar' | 'global';
```

### 2. App-Specific Types

```typescript
// /apps/web/src/lib/types/chat.ts

import type { ChatSession, ChatMessage } from '@buildos/shared-types';
import type { Project, Task } from './index';

// Extended types with relations
export interface ChatSessionWithMessages extends ChatSession {
	messages: ChatMessage[];
	message_count: number;
	unread_count?: number;
}

// Tool system types (discriminated unions)
export type ChatTool = ProjectTool | TaskTool | CalendarTool | ContextTool;

interface BaseToolCall {
	id: string;
	name: string;
	category: 'project' | 'task' | 'calendar' | 'context';
}

interface ProjectTool extends BaseToolCall {
	category: 'project';
	name: 'get_project_details' | 'search_projects' | 'update_project_context';
	arguments: Record<string, any>;
}

interface TaskTool extends BaseToolCall {
	category: 'task';
	name: 'get_tasks' | 'create_task' | 'update_task';
	arguments: Record<string, any>;
}

interface CalendarTool extends BaseToolCall {
	category: 'calendar';
	name: 'get_calendar_events' | 'find_available_slots' | 'schedule_task';
	arguments: Record<string, any>;
}

// SSE Message types for chat streaming
export interface SSEChatChunk {
	type: 'chat_chunk';
	content: string;
	index: number;
}

export interface SSEChatToolStart {
	type: 'tool_start';
	tool: ChatTool;
	message?: string;
}

export interface SSEChatToolComplete {
	type: 'tool_complete';
	tool_call_id: string;
	result: any;
	success: boolean;
}

export interface SSEChatComplete {
	type: 'chat_complete';
	message: ChatMessage;
	usage: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
	model: string;
	cost: number;
}

export type ChatStreamMessage =
	| SSEChatChunk
	| SSEChatToolStart
	| SSEChatToolComplete
	| SSEChatComplete;

// Type guards (following pattern)
export function isChatChunk(msg: ChatStreamMessage): msg is SSEChatChunk {
	return msg.type === 'chat_chunk';
}

export function isChatToolStart(msg: ChatStreamMessage): msg is SSEChatToolStart {
	return msg.type === 'tool_start';
}
```

---

## 🛠️ Tool Definitions (Integrated with Calendar Service)

```typescript
// /apps/web/src/lib/chat/tools.config.ts

import type { CalendarService } from '$lib/services/calendar-service';

export const CHAT_TOOLS = [
	// PROJECT TOOLS
	{
		type: 'function',
		function: {
			name: 'get_project_details',
			description:
				'Get full details about a specific project including context, tasks, and phases',
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'The UUID of the project'
					}
				},
				required: ['project_id']
			}
		}
	},

	// TASK TOOLS
	{
		type: 'function',
		function: {
			name: 'create_task',
			description: 'Create a new task with optional project assignment',
			parameters: {
				type: 'object',
				properties: {
					title: { type: 'string' },
					description: { type: 'string' },
					project_id: { type: 'string' },
					priority: {
						type: 'string',
						enum: ['low', 'medium', 'high'],
						default: 'medium'
					},
					task_type: {
						type: 'string',
						enum: ['one_off', 'recurring'],
						default: 'one_off'
					},
					duration_minutes: {
						type: 'number',
						default: 60
					},
					start_date: {
						type: 'string',
						format: 'date',
						description: 'ISO date string (YYYY-MM-DD)'
					}
				},
				required: ['title']
			}
		}
	},

	// CALENDAR TOOLS (matching calendar-service.ts exactly)
	{
		type: 'function',
		function: {
			name: 'get_calendar_events',
			description: 'Get Google Calendar events using CalendarService.getCalendarEvents',
			parameters: {
				type: 'object',
				properties: {
					timeMin: {
						type: 'string',
						format: 'date-time',
						description: 'Start time (ISO 8601). Defaults to now'
					},
					timeMax: {
						type: 'string',
						format: 'date-time',
						description: 'End time (ISO 8601). Defaults to 7 days from now'
					},
					q: {
						type: 'string',
						description: 'Search query for events'
					},
					calendarId: {
						type: 'string',
						default: 'primary',
						description: 'Google Calendar ID'
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'find_available_slots',
			description: 'Find available time slots using CalendarService.findAvailableSlots',
			parameters: {
				type: 'object',
				properties: {
					timeMin: {
						type: 'string',
						format: 'date-time',
						description: 'Start of search range (required)'
					},
					timeMax: {
						type: 'string',
						format: 'date-time',
						description: 'End of search range (required)'
					},
					duration_minutes: {
						type: 'number',
						default: 60,
						description: 'Duration needed in minutes'
					},
					preferred_hours: {
						type: 'array',
						items: { type: 'number' },
						description:
							'Preferred hours (0-23). E.g., [9,10,11,14,15,16] for work hours'
					}
				},
				required: ['timeMin', 'timeMax']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'schedule_task',
			description: 'Schedule a task to Google Calendar using CalendarService.scheduleTask',
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'BuildOS task ID to schedule'
					},
					start_time: {
						type: 'string',
						format: 'date-time',
						description: 'When to schedule the task (ISO 8601)'
					},
					duration_minutes: {
						type: 'number',
						description: 'Override task duration (optional)'
					},
					recurrence_pattern: {
						type: 'string',
						enum: [
							'daily',
							'weekdays',
							'weekly',
							'biweekly',
							'monthly',
							'quarterly',
							'yearly'
						],
						description: 'Make it recurring (optional)'
					},
					recurrence_ends: {
						type: 'string',
						format: 'date',
						description: 'When recurrence ends (optional)'
					}
				},
				required: ['task_id', 'start_time']
			}
		}
	}
] as const;
```

---

## 📡 Extended SmartLLMService with Streaming

```typescript
// /apps/web/src/lib/services/smart-llm-service.ts (additions)

export class SmartLLMService {
	// ... existing methods ...

	/**
	 * Stream text response with SSE support for chat
	 * Follows existing patterns from generateText() with streaming additions
	 */
	async streamText(
		options: TextGenerationOptions & { tools?: any[] },
		onChunk: (chunk: string, index: number) => void,
		onToolCall?: (tool: any) => void,
		onComplete?: (result: { fullText: string; model: string; usage: any; cost: number }) => void
	): Promise<void> {
		const requestStartedAt = new Date();
		const startTime = performance.now();
		const profile = options.profile || 'speed'; // Fast models for chat

		// Use existing model selection logic
		const estimatedLength = this.estimateResponseLength(options.prompt);
		const preferredModels = this.selectTextModels(
			profile,
			estimatedLength,
			options.requirements
		);
		const providerPrefs = this.getProviderPreferences(profile);

		try {
			// Prepare messages with tool support
			const messages = [
				{
					role: 'system',
					content: options.systemPrompt || 'You are a helpful assistant.'
				},
				{ role: 'user', content: options.prompt }
			];

			// Make OpenRouter API call with streaming
			const response = await fetch(this.apiUrl, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': this.httpReferer,
					'X-Title': this.appName
				},
				body: JSON.stringify({
					model: preferredModels[0],
					models: preferredModels, // Fallback models
					messages,
					temperature: options.temperature || 0.7,
					max_tokens: options.maxTokens || 2048,
					stream: true,
					tools: options.tools,
					tool_choice: options.tools ? 'auto' : undefined,
					route: 'fallback',
					provider: providerPrefs,
					transforms: ['middle-out'] // Compression
				}),
				signal: AbortSignal.timeout(120000) // 2 minute timeout
			});

			if (!response.ok) {
				throw new Error(`OpenRouter API error: ${response.status}`);
			}

			// Consume SSE stream
			const reader = response.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let fullText = '';
			let chunkIndex = 0;
			let actualModel = preferredModels[0];
			let usage: any = null;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				buffer += chunk;

				// Parse SSE events
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim() || !line.startsWith('data: ')) continue;

					const data = line.slice(6).trim();
					if (data === '[DONE]') continue;

					try {
						const parsed = JSON.parse(data);

						// Track actual model used
						if (parsed.model) {
							actualModel = parsed.model;
						}

						// Handle tool calls
						if (parsed.choices?.[0]?.delta?.tool_calls) {
							const toolCall = parsed.choices[0].delta.tool_calls[0];
							if (onToolCall) {
								onToolCall(toolCall);
							}
						}

						// Extract content chunk
						const content = parsed.choices?.[0]?.delta?.content;
						if (content) {
							fullText += content;
							onChunk(content, chunkIndex++);
						}

						// Extract usage (last message)
						if (parsed.usage) {
							usage = parsed.usage;
						}
					} catch (err) {
						console.error('Failed to parse SSE chunk:', err);
					}
				}
			}

			// Calculate costs and track usage (reuse existing logic)
			const duration = performance.now() - startTime;
			const modelConfig = TEXT_MODELS[actualModel];
			const totalCost = this.calculateCost(usage, modelConfig);

			// Track in existing systems
			this.trackPerformance(actualModel, duration);
			this.trackCost(actualModel, usage);

			// Log to database using existing method
			await this.logUsageToDatabase({
				userId: options.userId,
				operationType: 'chat',
				modelRequested: preferredModels[0],
				modelUsed: actualModel,
				// ... rest of existing logging
				streaming: true,
				metadata: {
					hasTools: !!options.tools,
					toolCount: options.tools?.length || 0
				}
			});

			// Call completion callback
			if (onComplete) {
				onComplete({
					fullText,
					model: actualModel,
					usage,
					cost: totalCost
				});
			}
		} catch (error) {
			// Use existing error handling
			await this.handleStreamError(error, options);
			throw error;
		}
	}
}
```

---

## 🔧 Tool Executor Service (Integrated with CalendarService)

```typescript
// /apps/web/src/lib/chat/tool-executor.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatTool } from '$lib/types/chat';
import { CalendarService } from '$lib/services/calendar-service';
import { cleanDataForTable, validateRequiredFields } from '$lib/utils/data-cleaner';

export class ChatToolExecutor {
	private calendarService: CalendarService;

	constructor(
		private supabase: SupabaseClient,
		private userId: string
	) {
		// Initialize calendar service
		this.calendarService = new CalendarService(supabase);
	}

	async execute(toolCall: ChatTool): Promise<any> {
		const startTime = Date.now();

		try {
			let result: any;

			switch (toolCall.name) {
				// PROJECT TOOLS
				case 'get_project_details':
					result = await this.getProjectDetails(toolCall.arguments.project_id);
					break;

				case 'search_projects':
					result = await this.searchProjects(toolCall.arguments);
					break;

				case 'update_project_context':
					result = await this.updateProjectContext(toolCall.arguments);
					break;

				// TASK TOOLS
				case 'get_tasks':
					result = await this.getTasks(toolCall.arguments);
					break;

				case 'create_task':
					result = await this.createTask(toolCall.arguments);
					break;

				case 'update_task':
					result = await this.updateTask(toolCall.arguments);
					break;

				// CALENDAR TOOLS (using CalendarService)
				case 'get_calendar_events':
					result = await this.calendarService.getCalendarEvents(this.userId, {
						timeMin: toolCall.arguments.timeMin,
						timeMax: toolCall.arguments.timeMax,
						q: toolCall.arguments.q,
						calendarId: toolCall.arguments.calendarId || 'primary'
					});
					break;

				case 'find_available_slots':
					result = await this.calendarService.findAvailableSlots(this.userId, {
						timeMin: toolCall.arguments.timeMin,
						timeMax: toolCall.arguments.timeMax,
						duration_minutes: toolCall.arguments.duration_minutes || 60,
						preferred_hours: toolCall.arguments.preferred_hours,
						calendarId: toolCall.arguments.calendarId || 'primary'
					});
					break;

				case 'schedule_task':
					result = await this.calendarService.scheduleTask(this.userId, {
						task_id: toolCall.arguments.task_id,
						start_time: toolCall.arguments.start_time,
						duration_minutes: toolCall.arguments.duration_minutes,
						calendar_id: toolCall.arguments.calendar_id || 'primary',
						recurrence_pattern: toolCall.arguments.recurrence_pattern,
						recurrence_ends: toolCall.arguments.recurrence_ends
					});
					break;

				default:
					throw new Error(`Unknown tool: ${toolCall.name}`);
			}

			const duration = Date.now() - startTime;

			// Log tool execution
			await this.logToolExecution(toolCall, result, duration, true);

			return {
				tool_call_id: toolCall.id,
				result,
				success: true
			};
		} catch (error) {
			const duration = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			// Check if it's a calendar connection error
			if (error.message?.includes('requires reconnection')) {
				return {
					tool_call_id: toolCall.id,
					result: null,
					success: false,
					error: 'Calendar connection required. Please reconnect your Google Calendar.',
					requiresReconnection: true
				};
			}

			await this.logToolExecution(toolCall, null, duration, false, errorMessage);

			return {
				tool_call_id: toolCall.id,
				result: null,
				success: false,
				error: errorMessage
			};
		}
	}

	// Project methods
	private async getProjectDetails(projectId: string) {
		const { data, error } = await this.supabase
			.from('projects')
			.select(
				`
        *,
        tasks!tasks_project_id_fkey (
          id, title, status, priority, start_date
        ),
        phases!phases_project_id_fkey (
          id, name, order, start_date, end_date
        )
      `
			)
			.eq('id', projectId)
			.eq('user_id', this.userId)
			.single();

		if (error) throw error;
		return data;
	}

	private async createTask(taskData: any) {
		// Clean and validate data using existing utility
		const cleanedData = cleanDataForTable('tasks', {
			...taskData,
			user_id: this.userId,
			status: 'backlog'
		});

		const validation = validateRequiredFields('tasks', cleanedData, 'create');
		if (!validation.isValid) {
			throw new Error(`Missing required fields: ${validation.missingFields.join(', ')}`);
		}

		const { data, error } = await this.supabase
			.from('tasks')
			.insert(cleanedData)
			.select()
			.single();

		if (error) throw error;
		return data;
	}

	// ... other tool implementations ...

	private async logToolExecution(
		tool: ChatTool,
		result: any,
		duration: number,
		success: boolean,
		error?: string
	) {
		// Log to chat_tool_executions table
		await this.supabase.from('chat_tool_executions').insert({
			session_id: tool.session_id, // Will need to pass this
			message_id: tool.message_id, // Will need to pass this
			tool_name: tool.name,
			tool_category: tool.category,
			arguments: tool.arguments,
			result: success ? result : null,
			duration_ms: duration,
			success,
			error_message: error
		});
	}
}
```

---

## 📡 Chat API Endpoint (Following API Patterns)

```typescript
// /apps/web/src/routes/api/chat/stream/+server.ts

import type { RequestHandler } from './$types';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { ChatService } from '$lib/services/chat-service';
import { ChatToolExecutor } from '$lib/chat/tool-executor';
import { SSEResponse } from '$lib/utils/sse-response';
import { rateLimiter, RATE_LIMITS } from '$lib/utils/rate-limiter';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';
import { CHAT_TOOLS } from '$lib/chat/tools.config';

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		// 1. Authentication (standard pattern)
		const { user } = await safeGetSession();
		if (!user) {
			return SSEResponse.unauthorized();
		}

		// 2. Rate limiting
		const rateLimitResult = rateLimiter.check(user.id, RATE_LIMITS.API_AI);
		if (!rateLimitResult.allowed) {
			const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);
			return new Response(
				JSON.stringify({
					error: 'Rate limit exceeded',
					retryAfter,
					resetTime: new Date(rateLimitResult.resetTime).toISOString()
				}),
				{
					status: 429,
					headers: {
						'Content-Type': 'application/json',
						'Retry-After': retryAfter.toString(),
						'X-RateLimit-Limit': RATE_LIMITS.API_AI.requests.toString(),
						'X-RateLimit-Remaining': '0',
						'X-RateLimit-Reset': Math.ceil(rateLimitResult.resetTime / 1000).toString()
					}
				}
			);
		}

		// 3. Parse and validate request
		const data = await parseRequestBody<{
			message: string;
			sessionId?: string;
			contextType?: string;
			projectId?: string;
			taskId?: string;
		}>(request);

		if (!data?.message || data.message.length > 10000) {
			return SSEResponse.badRequest('Invalid message. Must be 1-10000 characters.');
		}

		// 4. Create SSE stream (following brain dump pattern)
		const { response, writer, encoder } = SSEResponse.createStream();

		// 5. Start streaming in background
		streamChatResponse({
			user,
			message: data.message,
			sessionId: data.sessionId,
			contextType: data.contextType,
			projectId: data.projectId,
			taskId: data.taskId,
			writer,
			encoder,
			supabase
		});

		return response;
	} catch (error) {
		return SSEResponse.internalError(error, 'Failed to start chat stream');
	}
};

async function streamChatResponse({
	user,
	message,
	sessionId,
	contextType = 'global',
	projectId,
	taskId,
	writer,
	encoder,
	supabase
}: any) {
	try {
		// Initialize services
		const llmService = new SmartLLMService({
			httpReferer: 'https://buildos.app',
			appName: 'BuildOS Chat',
			supabase
		});

		const chatService = new ChatService(supabase, user.id);
		const toolExecutor = new ChatToolExecutor(supabase, user.id);

		// Send initial status
		await SSEResponse.sendMessage(writer, encoder, {
			type: 'status',
			message: 'Initializing chat...'
		});

		// Get or create session
		const session = sessionId
			? await chatService.getSession(sessionId)
			: await chatService.createSession({
					contextType,
					projectId,
					taskId
				});

		// Build context (with token management)
		const context = await chatService.buildContext(session.id, {
			includeProjectContext: !!projectId,
			includeUserContext: true,
			maxTokens: 4000 // Reserve 4K for context
		});

		// Prepare system prompt
		const systemPrompt = chatService.buildSystemPrompt(context);

		// Get conversation history (last 10 messages or 4K tokens)
		const history = await chatService.getConversationHistory(session.id, {
			maxMessages: 10,
			maxTokens: 4000
		});

		// Combine into messages for LLM
		const messages = [
			{ role: 'system', content: systemPrompt },
			...history,
			{ role: 'user', content: message }
		];

		let fullResponse = '';
		let toolCalls: any[] = [];

		// Stream LLM response with tools
		await llmService.streamText(
			{
				prompt: message,
				userId: user.id,
				systemPrompt,
				profile: 'speed', // Fast models for chat
				temperature: 0.7,
				maxTokens: 2048,
				tools: CHAT_TOOLS,
				operationType: 'chat',
				projectId,
				taskId
			},
			// On text chunk
			async (chunk, index) => {
				fullResponse += chunk;
				await SSEResponse.sendMessage(writer, encoder, {
					type: 'chat_chunk',
					content: chunk,
					index
				});
			},
			// On tool call
			async (toolCall) => {
				toolCalls.push(toolCall);
				await SSEResponse.sendMessage(writer, encoder, {
					type: 'tool_start',
					tool: toolCall,
					message: `Calling ${toolCall.function.name}...`
				});

				// Execute tool
				const result = await toolExecutor.execute({
					id: toolCall.id,
					name: toolCall.function.name,
					arguments: JSON.parse(toolCall.function.arguments),
					category: getToolCategory(toolCall.function.name),
					session_id: session.id,
					message_id: null // Will be set when saving
				});

				await SSEResponse.sendMessage(writer, encoder, {
					type: 'tool_complete',
					tool_call_id: toolCall.id,
					result: result.result,
					success: result.success
				});
			},
			// On complete
			async (result) => {
				// Save messages to database
				const userMessage = await chatService.saveMessage({
					session_id: session.id,
					role: 'user',
					content: message
				});

				const assistantMessage = await chatService.saveMessage({
					session_id: session.id,
					role: 'assistant',
					content: fullResponse,
					tool_calls: toolCalls.length > 0 ? toolCalls : null,
					llm_usage_log_id: result.usage_log_id // From LLM service
				});

				// Update session
				await chatService.updateSession(session.id, {
					last_message_at: new Date(),
					total_tokens_used: session.total_tokens_used + (result.usage?.total_tokens || 0)
				});

				// Generate title if needed (first exchange)
				if (!session.title_generated) {
					chatService.generateTitle(session.id); // Fire and forget
				}

				// Send completion
				await SSEResponse.sendMessage(writer, encoder, {
					type: 'chat_complete',
					message: assistantMessage,
					usage: result.usage,
					model: result.model,
					cost: result.cost
				});
			}
		);
	} catch (error) {
		console.error('Chat stream error:', error);
		await SSEResponse.sendMessage(writer, encoder, {
			type: 'error',
			error: error.message,
			recoverable: true
		});
	} finally {
		await SSEResponse.close(writer);
	}
}

function getToolCategory(toolName: string): string {
	if (toolName.includes('project')) return 'project';
	if (toolName.includes('task')) return 'task';
	if (toolName.includes('calendar') || toolName.includes('schedule')) return 'calendar';
	return 'context';
}
```

---

## 🎨 Chat Modal Component (Svelte 5)

```typescript
<!-- /apps/web/src/lib/components/chat/ChatModal.svelte -->
<script lang="ts">
  import { Modal } from '$lib/components/ui/Modal.svelte';
  import { SSEProcessor } from '$lib/utils/sse-processor';
  import { notificationStore } from '$lib/stores/notification.store';
  import { untrack } from 'svelte';
  import type { ChatMessage, ChatStreamMessage } from '$lib/types/chat';

  // Props (Svelte 5 pattern)
  let {
    isOpen = false,
    onClose,
    contextType = 'global',
    projectId = null,
    taskId = null,
    title = 'Chat Assistant'
  } = $props();

  // State (using $state rune)
  let messages = $state<ChatMessage[]>([]);
  let input = $state('');
  let isStreaming = $state(false);
  let currentChunk = $state('');
  let currentTools = $state<any[]>([]);
  let sessionId = $state<string | null>(null);
  let messagesContainer: HTMLDivElement;

  // Derived state
  let canSend = $derived(!isStreaming && input.trim().length > 0);

  // Effects
  $effect(() => {
    // Auto-scroll to bottom on new messages
    if (messagesContainer && messages.length > 0) {
      untrack(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      });
    }
  });

  // Send message
  async function sendMessage() {
    if (!canSend) return;

    // Add user message optimistically
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      created_at: new Date().toISOString()
    };
    messages = [...messages, userMessage];

    const messageText = input;
    input = '';
    isStreaming = true;
    currentChunk = '';
    currentTools = [];

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          sessionId,
          contextType,
          projectId,
          taskId
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      // Process SSE stream (following brain dump pattern)
      await SSEProcessor.processStream(
        response,
        {
          onProgress: (data: ChatStreamMessage) => {
            if (data.type === 'chat_chunk') {
              currentChunk += data.content;
            } else if (data.type === 'tool_start') {
              currentTools = [...currentTools, data.tool];
            } else if (data.type === 'tool_complete') {
              // Update tool status
              currentTools = currentTools.map(t =>
                t.id === data.tool_call_id
                  ? { ...t, complete: true, success: data.success }
                  : t
              );
            }
          },
          onComplete: (result: any) => {
            if (result.type === 'chat_complete') {
              // Add assistant message
              messages = [...messages, {
                ...result.message,
                content: currentChunk
              }];

              // Store session ID for future messages
              if (!sessionId && result.message.session_id) {
                sessionId = result.message.session_id;
              }

              currentChunk = '';
              currentTools = [];
              isStreaming = false;
            }
          },
          onError: (error) => {
            console.error('Chat error:', error);
            notificationStore.showError('Chat error: ' + error.message);
            isStreaming = false;
            currentChunk = '';
            currentTools = [];
          }
        },
        { timeout: 120000 } // 2 minute timeout
      );

    } catch (error) {
      console.error('Send message error:', error);
      notificationStore.showError('Failed to send message');
      isStreaming = false;
    }
  }

  // Handle Enter key
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
</script>

<Modal
  {isOpen}
  {onClose}
  {title}
  size="lg"
  persistent={isStreaming}
  customClasses="chat-modal"
>
  <div class="flex flex-col h-[600px] sm:h-[500px]">
    <!-- Messages area -->
    <div
      bind:this={messagesContainer}
      class="flex-1 overflow-y-auto p-4 space-y-4"
    >
      {#each messages as message (message.id)}
        <div class="message message-{message.role}">
          <div class="content prose prose-sm max-w-none">
            {@html marked(message.content)}
          </div>
          {#if message.created_at}
            <div class="timestamp">
              {formatTime(message.created_at)}
            </div>
          {/if}
        </div>
      {/each}

      {#if isStreaming && currentChunk}
        <div class="message message-assistant streaming">
          <div class="content prose prose-sm max-w-none">
            {@html marked(currentChunk)}
            <span class="typing-cursor">|</span>
          </div>
        </div>
      {/if}

      {#if currentTools.length > 0}
        <div class="tools-container">
          {#each currentTools as tool}
            <div class="tool-call" class:complete={tool.complete}>
              <span class="tool-icon">🔧</span>
              <span class="tool-name">{tool.name}</span>
              {#if tool.complete}
                <span class="tool-status {tool.success ? 'success' : 'error'}">
                  {tool.success ? '✓' : '✗'}
                </span>
              {:else}
                <span class="tool-loading">⋯</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Input area -->
    <div class="border-t bg-gray-50 dark:bg-gray-800 p-4">
      <div class="flex gap-2">
        <textarea
          bind:value={input}
          onkeydown={handleKeydown}
          placeholder="Type your message..."
          disabled={isStreaming}
          class="flex-1 min-h-[60px] max-h-[120px] p-3
                 border rounded-lg resize-none
                 disabled:opacity-50 disabled:cursor-not-allowed"
          rows="2"
        />
        <button
          onclick={sendMessage}
          disabled={!canSend}
          class="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-500
                 text-white rounded-lg font-medium
                 disabled:opacity-50 disabled:cursor-not-allowed
                 hover:shadow-lg transition-shadow"
        >
          {isStreaming ? 'Sending...' : 'Send'}
        </button>
      </div>

      {#if contextType !== 'global'}
        <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Context: {contextType}
          {#if projectId}(Project){/if}
          {#if taskId}(Task){/if}
        </div>
      {/if}
    </div>
  </div>
</Modal>

<style>
  .message {
    @apply p-3 rounded-lg;
  }

  .message-user {
    @apply ml-auto bg-blue-100 dark:bg-blue-900 max-w-[80%];
  }

  .message-assistant {
    @apply mr-auto bg-gray-100 dark:bg-gray-800 max-w-[80%];
  }

  .message.streaming {
    @apply opacity-90;
  }

  .typing-cursor {
    @apply inline-block w-2 h-4 bg-gray-600 dark:bg-gray-400;
    animation: blink 1s infinite;
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }

  .tools-container {
    @apply flex flex-wrap gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg;
  }

  .tool-call {
    @apply flex items-center gap-2 px-3 py-1 bg-white dark:bg-gray-800
           rounded-full text-sm border;
  }

  .tool-call.complete {
    @apply border-green-500;
  }

  .tool-loading {
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }
</style>
```

---

## 🚀 Implementation Plan

### Phase 1: Database & Types (Day 1)

1. ✅ Create migration file for chat tables
2. ✅ Run type generation (`pnpm run generate:types`)
3. ✅ Add chat types to shared-types package
4. ✅ Create app-specific chat types

### Phase 2: Extend SmartLLMService (Day 1-2)

1. ✅ Add `streamText()` method with tool support
2. ✅ Test streaming with OpenRouter
3. ✅ Verify cost tracking and usage logging
4. ✅ Add error recovery for streaming

### Phase 3: Build ChatService (Day 2)

1. ✅ Create ChatService class
2. ✅ Implement context management
3. ✅ Add conversation history handling
4. ✅ Implement token counting and pruning

### Phase 4: Tool Executor (Day 2-3)

1. ✅ Create ChatToolExecutor class
2. ✅ Integrate with CalendarService
3. ✅ Add project/task operations
4. ✅ Implement tool execution logging

### Phase 5: API Endpoint (Day 3)

1. ✅ Create `/api/chat/stream/+server.ts`
2. ✅ Implement SSE streaming
3. ✅ Add rate limiting
4. ✅ Test with Postman/curl

### Phase 6: UI Components (Day 3-4)

1. ✅ Create ChatModal component
2. ✅ Add message components
3. ✅ Implement SSE client
4. ✅ Add to notification system

### Phase 7: Integration & Testing (Day 4-5)

1. ✅ Add chat button to project pages
2. ✅ Test context loading
3. ✅ Test tool execution
4. ✅ Performance testing
5. ✅ Cost monitoring

### Phase 8: Polish (Day 5)

1. ✅ Auto-title generation
2. ✅ Message compression
3. ✅ Chat history view
4. ✅ Mobile optimization
5. ✅ Documentation

---

## 📊 Success Metrics

1. **Performance:**
    - Time to first token < 2s
    - Streaming smooth without stuttering
    - Tool execution < 3s per call

2. **Cost:**
    - Average chat session < $0.05
    - Use free tier models when possible
    - Token usage tracking accurate

3. **UX:**
    - Chat loads context instantly
    - Tools provide visual feedback
    - Error messages are helpful
    - Mobile experience is smooth

4. **Integration:**
    - Calendar operations work reliably
    - Project/task CRUD seamless
    - Context is always relevant
    - Rate limiting prevents abuse

---

## 🔒 Security Considerations

1. **Authentication:** Every request validated
2. **Rate Limiting:** 20 requests/minute for AI
3. **Input Validation:** 10K character limit
4. **RLS Policies:** Database-level security
5. **Tool Permissions:** Users can only modify own data
6. **Cost Controls:** Token limits per session
7. **Error Handling:** Never expose internal errors

---

This specification is now fully tailored to the BuildOS codebase, properly integrating with existing services, following established patterns, and leveraging the platform's infrastructure.
