<!-- thoughts/shared/ideas/chat-spec.md -->
## 📋 **Build OS Chat System - Complete Specification**

### **Core Requirements Summary**

- ✅ Hard token limit with auto-compression
- ✅ Free tool calling with visual feedback
- ✅ User intervention mid-process
- ✅ Auto-save every message
- ✅ LLM-generated chat titles
- ✅ Claude Sonnet 4 via OpenRouter

---

## 🏗️ **Architecture Overview**

```
┌─────────────────┐
│   Chat Modal    │ (Svelte Component)
│  - Message List │
│  - Input Field  │
│  - Tool Display │
│  - Stop Button  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API Routes     │ (SvelteKit)
│  /api/chat/*    │
│  - create       │
│  - message      │
│  - stream       │
│  - tools        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Chat Service   │ (Server-side)
│  - Context Mgmt │
│  - Token Track  │
│  - Compression  │
│  - Tool Exec    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│    OpenRouter + Tools       │
│  - Claude Sonnet 4          │
│  - Streaming                │
│  - Function Calling         │
└─────────────────────────────┘
```

---

## 💾 **Database Schema (Complete)**

```sql
-- src/lib/db/schema/chats.sql

-- Chat sessions
CREATE TABLE chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,

    -- Context info
    context_type TEXT CHECK (context_type IN ('project', 'task', 'calendar', 'global')) NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    calendar_date DATE,

    -- Metadata
    title TEXT DEFAULT 'New Chat',
    title_generated BOOLEAN DEFAULT FALSE,

    -- Context management
    conversation_summary TEXT,
    key_decisions JSONB DEFAULT '[]'::jsonb,
    created_entities JSONB DEFAULT '[]'::jsonb,

    -- Token tracking
    total_tokens_used INTEGER DEFAULT 0,
    token_limit INTEGER DEFAULT 10000,
    messages_archived INTEGER DEFAULT 0,
    last_compression_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE NOT NULL,

    role TEXT CHECK (role IN ('user', 'assistant', 'system', 'tool')) NOT NULL,
    content TEXT,

    -- Tool tracking
    tool_calls JSONB,
    tool_results JSONB,

    -- Context management
    is_archived BOOLEAN DEFAULT FALSE,
    is_in_summary BOOLEAN DEFAULT FALSE,
    token_count INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_chat_messages_chat_id (chat_id),
    INDEX idx_chat_messages_archived (chat_id, is_archived)
);

-- Tool call tracking
CREATE TABLE chat_tool_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE NOT NULL,
    message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE NOT NULL,

    tool_name TEXT NOT NULL,
    arguments JSONB NOT NULL,
    result JSONB,
    duration_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_tool_calls_chat (chat_id),
    INDEX idx_tool_calls_tool_name (tool_name)
);

-- Indexes for performance
CREATE INDEX idx_chats_user_id ON chats(user_id);
CREATE INDEX idx_chats_context ON chats(context_type, project_id, task_id);
CREATE INDEX idx_chats_last_message ON chats(user_id, last_message_at DESC);
```

---

## 🔧 **Implementation Code**

### **1. Core Types**

```typescript
// src/lib/types/chat.ts

export type ChatContextType = 'project' | 'task' | 'calendar' | 'global';

export interface Chat {
	id: string;
	user_id: string;
	context_type: ChatContextType;
	project_id?: string;
	task_id?: string;
	calendar_date?: Date;
	title: string;
	title_generated: boolean;
	conversation_summary?: string;
	key_decisions: string[];
	created_entities: Array<{ type: string; id: string }>;
	total_tokens_used: number;
	token_limit: number;
	messages_archived: number;
	last_compression_at?: Date;
	created_at: Date;
	updated_at: Date;
	last_message_at: Date;
}

export interface ChatMessage {
	id: string;
	chat_id: string;
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	tool_calls?: ToolCall[];
	tool_results?: ToolResult[];
	is_archived: boolean;
	is_in_summary: boolean;
	token_count: number;
	created_at: Date;
}

export interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, any>;
}

export interface ToolResult {
	tool_call_id: string;
	result: any;
	success: boolean;
	error?: string;
}

export interface StreamChunk {
	type: 'text' | 'tool_call_start' | 'tool_call_complete' | 'done' | 'error';
	content?: string;
	tool_call?: ToolCall;
	tool_result?: ToolResult;
	error?: string;
}
```

### **2. Tool Definitions**

```typescript
// src/lib/chat/tools.ts

export const CHAT_TOOLS = [
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
	{
		type: 'function',
		function: {
			name: 'search_projects',
			description: 'Search user projects by name, status, or tags',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Search query for project name or description'
					},
					status: {
						type: 'string',
						enum: ['active', 'paused', 'completed', 'archived'],
						description: 'Filter by project status'
					}
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_tasks',
			description: 'Get tasks with optional filters',
			parameters: {
				type: 'object',
				properties: {
					project_id: { type: 'string' },
					status: {
						type: 'array',
						items: {
							type: 'string',
							enum: ['backlog', 'in_progress', 'done', 'blocked']
						}
					},
					priority: {
						type: 'array',
						items: { type: 'string', enum: ['low', 'medium', 'high'] }
					},
					due_before: { type: 'string', format: 'date' },
					due_after: { type: 'string', format: 'date' }
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'create_task',
			description: 'Create a new task',
			parameters: {
				type: 'object',
				properties: {
					title: { type: 'string' },
					description: { type: 'string' },
					project_id: { type: 'string' },
					priority: { type: 'string', enum: ['low', 'medium', 'high'] },
					task_type: { type: 'string', enum: ['one_off', 'recurring'] },
					duration_minutes: { type: 'number' },
					start_date: { type: 'string', format: 'date' }
				},
				required: ['title', 'description']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_task',
			description: 'Update an existing task',
			parameters: {
				type: 'object',
				properties: {
					task_id: { type: 'string' },
					updates: {
						type: 'object',
						properties: {
							title: { type: 'string' },
							description: { type: 'string' },
							status: { type: 'string' },
							priority: { type: 'string' },
							start_date: { type: 'string' }
						}
					}
				},
				required: ['task_id', 'updates']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_calendar_events',
			description: 'Get Google Calendar events in a date range',
			parameters: {
				type: 'object',
				properties: {
					start_date: { type: 'string', format: 'date' },
					end_date: { type: 'string', format: 'date' }
				},
				required: ['start_date', 'end_date']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'find_available_slots',
			description: 'Find available time slots in calendar for scheduling',
			parameters: {
				type: 'object',
				properties: {
					duration_minutes: { type: 'number' },
					start_date: { type: 'string', format: 'date' },
					end_date: { type: 'string', format: 'date' },
					preferred_time: { type: 'string', enum: ['morning', 'afternoon', 'evening'] }
				},
				required: ['duration_minutes', 'start_date', 'end_date']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'schedule_task',
			description: 'Schedule a task to Google Calendar',
			parameters: {
				type: 'object',
				properties: {
					task_id: { type: 'string' },
					start_time: { type: 'string', format: 'date-time' },
					duration_minutes: { type: 'number' }
				},
				required: ['task_id', 'start_time']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_project_context',
			description: 'Add or update the markdown context for a project',
			parameters: {
				type: 'object',
				properties: {
					project_id: { type: 'string' },
					context_update: {
						type: 'string',
						description: 'New or updated context content'
					},
					merge_strategy: {
						type: 'string',
						enum: ['append', 'replace'],
						description: 'Whether to append to existing context or replace it'
					}
				},
				required: ['project_id', 'context_update']
			}
		}
	}
] as const;
```

### **3. Context Management Service**

```typescript
// src/lib/chat/context-manager.ts

import type { Chat, ChatMessage } from '$lib/types/chat';

const TOKEN_LIMIT = 10000;
const COMPRESSION_THRESHOLD = 0.8; // Compress at 80% of limit

export class ChatContextManager {
	async assembleContext(
		chatId: string,
		userId: string
	): Promise<{
		messages: any[];
		tokenCount: number;
		needsCompression: boolean;
	}> {
		const chat = await this.getChat(chatId);
		const locationContext = await this.getLocationContext(chat);
		const messages = await this.getActiveMessages(chatId);

		// Build context in tiers
		const context = {
			// Tier 1: Always included (system + location)
			always: await this.buildAlwaysContext(userId, locationContext),

			// Tier 2: Recent messages (last 10)
			recent: messages.slice(-10),

			// Tier 3: Conversation summary
			summary: chat.conversation_summary
				? [
						{
							role: 'system',
							content: `Previous conversation summary: ${chat.conversation_summary}`
						}
					]
				: []
		};

		const tokenCount = this.estimateTokens(context);
		const needsCompression = tokenCount > TOKEN_LIMIT * COMPRESSION_THRESHOLD;

		return {
			messages: [...context.always, ...context.summary, ...context.recent],
			tokenCount,
			needsCompression
		};
	}

	async buildAlwaysContext(userId: string, locationContext: any) {
		const systemPrompt = this.buildSystemPrompt(locationContext);
		const userProfile = await this.getUserProfile(userId);

		return [
			{
				role: 'system',
				content: systemPrompt
			},
			{
				role: 'system',
				content: `User Context:\n${JSON.stringify(userProfile, null, 2)}`
			},
			{
				role: 'system',
				content: `Available Tools: You have access to tools for querying projects, tasks, and calendar. Use them freely to help the user.`
			}
		];
	}

	buildSystemPrompt(locationContext: any): string {
		const basePrompt = `You are an AI assistant integrated into Build OS, a productivity system. Your role is to help users organize their projects, tasks, and schedule.

You have access to tools that let you:
- Query and update projects and tasks
- Access Google Calendar
- Schedule tasks automatically
- Update project context

When the user asks questions or needs help, freely use these tools to provide accurate, helpful responses. Always explain what you're doing when you call tools.

Current Context: ${locationContext.type}`;

		if (locationContext.type === 'project' && locationContext.data) {
			return `${basePrompt}

You are currently in the context of project: "${locationContext.data.name}"
Project ID: ${locationContext.data.id}
Status: ${locationContext.data.status}

Project Context:
${locationContext.data.context || 'No context yet'}`;
		}

		return basePrompt;
	}

	async getLocationContext(chat: Chat) {
		switch (chat.context_type) {
			case 'project':
				if (chat.project_id) {
					const project = await this.getProject(chat.project_id);
					return { type: 'project', data: project };
				}
				break;
			case 'task':
				if (chat.task_id) {
					const task = await this.getTask(chat.task_id);
					return { type: 'task', data: task };
				}
				break;
			case 'calendar':
				return { type: 'calendar', data: { date: chat.calendar_date } };
			default:
				return { type: 'global', data: null };
		}
		return { type: chat.context_type, data: null };
	}

	estimateTokens(context: any): number {
		// Rough estimation: 1 token ≈ 4 characters
		const text = JSON.stringify(context);
		return Math.ceil(text.length / 4);
	}

	async compressConversation(chatId: string): Promise<void> {
		// Implementation for compression
		// Will be handled separately
	}

	// DB helper methods
	private async getChat(chatId: string): Promise<Chat> {
		// Supabase query
		throw new Error('Not implemented');
	}

	private async getActiveMessages(chatId: string): Promise<ChatMessage[]> {
		// Supabase query for non-archived messages
		throw new Error('Not implemented');
	}

	private async getUserProfile(userId: string): Promise<any> {
		// Get user's "Who I Am" / "How I Work" context
		throw new Error('Not implemented');
	}

	private async getProject(projectId: string): Promise<any> {
		throw new Error('Not implemented');
	}

	private async getTask(taskId: string): Promise<any> {
		throw new Error('Not implemented');
	}
}
```

### **4. Tool Executor**

```typescript
// src/lib/chat/tool-executor.ts

import type { ToolCall, ToolResult } from '$lib/types/chat';
import type { SupabaseClient } from '@supabase/supabase-js';

export class ToolExecutor {
	constructor(
		private supabase: SupabaseClient,
		private userId: string
	) {}

	async execute(toolCall: ToolCall): Promise<ToolResult> {
		const startTime = Date.now();

		try {
			let result: any;

			switch (toolCall.name) {
				case 'get_project_details':
					result = await this.getProjectDetails(toolCall.arguments.project_id);
					break;

				case 'search_projects':
					result = await this.searchProjects(toolCall.arguments);
					break;

				case 'get_tasks':
					result = await this.getTasks(toolCall.arguments);
					break;

				case 'create_task':
					result = await this.createTask(toolCall.arguments);
					break;

				case 'update_task':
					result = await this.updateTask(toolCall.arguments);
					break;

				case 'get_calendar_events':
					result = await this.getCalendarEvents(toolCall.arguments);
					break;

				case 'find_available_slots':
					result = await this.findAvailableSlots(toolCall.arguments);
					break;

				case 'schedule_task':
					result = await this.scheduleTask(toolCall.arguments);
					break;

				case 'update_project_context':
					result = await this.updateProjectContext(toolCall.arguments);
					break;

				default:
					throw new Error(`Unknown tool: ${toolCall.name}`);
			}

			const duration = Date.now() - startTime;

			// Log tool call
			await this.logToolCall(toolCall, result, duration, true);

			return {
				tool_call_id: toolCall.id,
				result,
				success: true
			};
		} catch (error) {
			const duration = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			await this.logToolCall(toolCall, null, duration, false, errorMessage);

			return {
				tool_call_id: toolCall.id,
				result: null,
				success: false,
				error: errorMessage
			};
		}
	}

	private async getProjectDetails(projectId: string) {
		const { data, error } = await this.supabase
			.from('projects')
			.select('*, tasks(*), phases(*)')
			.eq('id', projectId)
			.eq('user_id', this.userId)
			.single();

		if (error) throw error;
		return data;
	}

	private async searchProjects(args: { query?: string; status?: string }) {
		let query = this.supabase.from('projects').select('*').eq('user_id', this.userId);

		if (args.status) {
			query = query.eq('status', args.status);
		}

		if (args.query) {
			query = query.or(`name.ilike.%${args.query}%,description.ilike.%${args.query}%`);
		}

		const { data, error } = await query;
		if (error) throw error;
		return data;
	}

	private async getTasks(filters: any) {
		let query = this.supabase.from('tasks').select('*').eq('user_id', this.userId);

		if (filters.project_id) query = query.eq('project_id', filters.project_id);
		if (filters.status) query = query.in('status', filters.status);
		if (filters.priority) query = query.in('priority', filters.priority);
		if (filters.due_before) query = query.lte('start_date', filters.due_before);
		if (filters.due_after) query = query.gte('start_date', filters.due_after);

		const { data, error } = await query;
		if (error) throw error;
		return data;
	}

	private async createTask(taskData: any) {
		const { data, error } = await this.supabase
			.from('tasks')
			.insert({
				...taskData,
				user_id: this.userId
			})
			.select()
			.single();

		if (error) throw error;
		return data;
	}

	private async updateTask(args: { task_id: string; updates: any }) {
		const { data, error } = await this.supabase
			.from('tasks')
			.update(args.updates)
			.eq('id', args.task_id)
			.eq('user_id', this.userId)
			.select()
			.single();

		if (error) throw error;
		return data;
	}

	private async getCalendarEvents(args: { start_date: string; end_date: string }) {
		// Call your existing calendar service
		// Return calendar events
		throw new Error('Calendar integration not implemented yet');
	}

	private async findAvailableSlots(args: any) {
		// Call your existing calendar service
		throw new Error('Calendar integration not implemented yet');
	}

	private async scheduleTask(args: any) {
		// Call your existing calendar service
		throw new Error('Calendar integration not implemented yet');
	}

	private async updateProjectContext(args: {
		project_id: string;
		context_update: string;
		merge_strategy?: string;
	}) {
		const { data: project } = await this.supabase
			.from('projects')
			.select('context')
			.eq('id', args.project_id)
			.eq('user_id', this.userId)
			.single();

		let newContext = args.context_update;

		if (args.merge_strategy === 'append' && project?.context) {
			newContext = `${project.context}\n\n${args.context_update}`;
		}

		const { data, error } = await this.supabase
			.from('projects')
			.update({ context: newContext })
			.eq('id', args.project_id)
			.eq('user_id', this.userId)
			.select()
			.single();

		if (error) throw error;
		return data;
	}

	private async logToolCall(
		toolCall: ToolCall,
		result: any,
		duration: number,
		success: boolean,
		errorMessage?: string
	) {
		// Log to chat_tool_calls table for analytics
		await this.supabase.from('chat_tool_calls').insert({
			chat_id: toolCall.id, // You'll need to pass chat_id properly
			tool_name: toolCall.name,
			arguments: toolCall.arguments,
			result,
			duration_ms: duration,
			success,
			error_message: errorMessage
		});
	}
}
```

---

## 🎯 **Next Steps**

We need to create the following items as well which adds more complexity:

1. **API Routes** - SvelteKit endpoints for chat operations
2. **OpenRouter Integration** - Streaming with function calling
3. **Frontend Components** - Chat modal with tool display
4. **Compression Logic** - Automatic conversation summarization
5. **Chat Title Generation** - LLM-powered naming
