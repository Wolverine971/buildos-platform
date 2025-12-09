<!-- thoughts/shared/ideas/chat-spec-improved-v2.md -->
# 📋 BuildOS Chat System - Implementation Specification v2

## With Progressive Disclosure Pattern

### 📁 Related Documentation

- **Implementation Index:** `/thoughts/shared/ideas/chat-implementation-index.md` - Navigation guide
- **Context & Tools Design:** `/thoughts/shared/ideas/chat-context-and-tools-design.md` - Deep dive into implementation
- **Previous Version:** `/thoughts/shared/ideas/chat-spec-improved.md` - v1 with initial BuildOS integration
- **Original Spec:** `/thoughts/shared/ideas/chat-spec.md` - Initial requirements

### Version History

- v1: Initial specification tailored to BuildOS
- v2: Added progressive disclosure pattern for efficient context management

---

## 🎯 Executive Summary

This specification implements a **progressive disclosure pattern** for the BuildOS chat system, optimizing token usage by loading abbreviated context initially and drilling down only when needed. The system uses a two-tier data access pattern:

1. **List/Search operations** return abbreviated summaries
2. **Detail operations** fetch complete information

This reduces initial context by ~70% while maintaining full access to detailed information through intelligent tool use.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Progressive Context Loading                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Abbreviated  │→ │   LLM w/     │→ │   Detailed   │  │
│  │   Context    │  │    Tools     │  │     Data     │  │
│  │  (~1K tokens)│  │              │  │  (as needed) │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Tool Calling Flow                                       │
│  1. list_tasks() → abbreviated results                   │
│  2. User asks about specific task                        │
│  3. get_task_details(id) → full details                  │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Progressive Disclosure Data Models

### Abbreviated Data Structures

```typescript
// /apps/web/src/lib/types/chat-context.ts

// Abbreviated structures for initial context and list operations
export interface AbbreviatedTask {
	id: string;
	title: string;
	status: 'backlog' | 'in_progress' | 'done' | 'blocked';
	priority: 'low' | 'medium' | 'high';
	start_date: string | null;
	duration_minutes: number | null;

	// Preview fields (truncated)
	description_preview: string; // First 100 chars
	details_preview: string | null; // First 100 chars

	// Metadata hints
	has_subtasks: boolean;
	has_dependencies: boolean;
	is_recurring: boolean;
	project_name?: string;

	// Computed
	is_overdue?: boolean;
}

export interface AbbreviatedProject {
	id: string;
	name: string;
	slug: string;
	status: 'active' | 'paused' | 'completed' | 'archived';

	// Dates
	start_date: string | null;
	end_date: string | null;

	// Full fields (already concise)
	description: string | null; // Usually <200 chars
	executive_summary: string | null; // Usually <500 chars
	tags: string[] | null;

	// Preview field
	context_preview: string | null; // First 500 chars of context

	// Statistics
	task_count: number;
	active_task_count: number;
	completed_task_count: number;
	completion_percentage: number;

	// Hints for drilling down
	has_phases: boolean;
	has_notes: boolean;
	has_brain_dumps: boolean;
}

export interface AbbreviatedNote {
	id: string;
	title: string | null;
	category: string | null;
	content_preview: string; // First 200 chars
	tags: string[] | null;
	created_at: string;
	project_name?: string;
}

export interface AbbreviatedBrainDump {
	id: string;
	title: string | null;
	ai_summary: string | null; // Full summary (already concise)
	status: string;
	created_at: string;
	project_name?: string;
	operation_count?: number;
}

export interface AbbreviatedCalendarEvent {
	id: string;
	summary: string;
	start: string;
	end: string;
	is_all_day: boolean;
	has_description: boolean;
	has_attendees: boolean;
	linked_task_id?: string;
}
```

---

## 🛠️ Tool Definitions with Progressive Disclosure

### Tool Categories

1. **List/Search Tools** - Return abbreviated data
2. **Detail Tools** - Return complete data
3. **Action Tools** - Perform mutations
4. **Calendar Tools** - Integrated with CalendarService

```typescript
// /apps/web/src/lib/chat/tools.config.ts

export const CHAT_TOOLS = [
	// ============================================
	// LIST/SEARCH TOOLS (Abbreviated Results)
	// ============================================

	{
		type: 'function',
		function: {
			name: 'list_tasks',
			description: `Get abbreviated list of tasks. Returns task summaries with first 100 chars of descriptions.
                    Use get_task_details for complete information about specific tasks.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Filter by specific project'
					},
					status: {
						type: 'array',
						items: {
							type: 'string',
							enum: ['backlog', 'in_progress', 'done', 'blocked']
						},
						description: 'Filter by status (multiple allowed)'
					},
					priority: {
						type: 'array',
						items: {
							type: 'string',
							enum: ['low', 'medium', 'high']
						},
						description: 'Filter by priority (multiple allowed)'
					},
					has_date: {
						type: 'boolean',
						description: 'Only tasks with start_date'
					},
					limit: {
						type: 'number',
						default: 20,
						maximum: 50,
						description: 'Maximum tasks to return'
					},
					sort_by: {
						type: 'string',
						enum: ['priority', 'start_date', 'created_at'],
						default: 'priority'
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_projects',
			description: `Search projects returning abbreviated info with 500 char context preview.
                    Use get_project_details for full context and detailed information.`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Search in name, description, tags'
					},
					status: {
						type: 'string',
						enum: ['active', 'paused', 'completed', 'archived']
					},
					has_active_tasks: {
						type: 'boolean',
						description: 'Only projects with active tasks'
					},
					limit: {
						type: 'number',
						default: 10,
						maximum: 20
					}
				}
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'search_notes',
			description: `Search notes returning abbreviated content (200 char preview).
                    Use get_note_details for full content.`,
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Search in title and content'
					},
					project_id: {
						type: 'string',
						description: 'Filter by project'
					},
					category: {
						type: 'string',
						description: 'Filter by category'
					},
					limit: {
						type: 'number',
						default: 10
					}
				}
			}
		}
	},

	// ============================================
	// DETAIL TOOLS (Complete Information)
	// ============================================

	{
		type: 'function',
		function: {
			name: 'get_task_details',
			description: `Get COMPLETE details for a specific task including full descriptions,
                    all subtasks, dependencies, and parent project context.`,
			parameters: {
				type: 'object',
				properties: {
					task_id: {
						type: 'string',
						description: 'Task ID from list_tasks'
					},
					include_subtasks: {
						type: 'boolean',
						default: true,
						description: 'Include full subtask details'
					},
					include_project_context: {
						type: 'boolean',
						default: false,
						description: 'Include parent project context'
					}
				},
				required: ['task_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_project_details',
			description: `Get COMPLETE project details including full context, core dimensions,
                    all phases, and optionally tasks and notes.`,
			parameters: {
				type: 'object',
				properties: {
					project_id: {
						type: 'string',
						description: 'Project ID from search_projects'
					},
					include_tasks: {
						type: 'boolean',
						default: false,
						description: 'Include abbreviated task list'
					},
					include_phases: {
						type: 'boolean',
						default: true,
						description: 'Include project phases'
					},
					include_notes: {
						type: 'boolean',
						default: false,
						description: 'Include recent notes (abbreviated)'
					},
					include_brain_dumps: {
						type: 'boolean',
						default: false,
						description: 'Include recent brain dumps'
					}
				},
				required: ['project_id']
			}
		}
	},

	{
		type: 'function',
		function: {
			name: 'get_note_details',
			description: 'Get complete note content',
			parameters: {
				type: 'object',
				properties: {
					note_id: {
						type: 'string',
						description: 'Note ID from search_notes'
					}
				},
				required: ['note_id']
			}
		}
	},

	// ============================================
	// ACTION TOOLS (Mutations)
	// ============================================

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
						format: 'date'
					},
					parent_task_id: {
						type: 'string',
						description: 'Create as subtask of another task'
					}
				},
				required: ['title']
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
							details: { type: 'string' },
							status: {
								type: 'string',
								enum: ['backlog', 'in_progress', 'done', 'blocked']
							},
							priority: {
								type: 'string',
								enum: ['low', 'medium', 'high']
							},
							start_date: { type: 'string', format: 'date' },
							duration_minutes: { type: 'number' }
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
			name: 'update_project_context',
			description: 'Update or append to project context',
			parameters: {
				type: 'object',
				properties: {
					project_id: { type: 'string' },
					context_update: {
						type: 'string',
						description: 'New context or addition'
					},
					merge_strategy: {
						type: 'string',
						enum: ['replace', 'append', 'prepend'],
						default: 'append'
					}
				},
				required: ['project_id', 'context_update']
			}
		}
	},

	// ============================================
	// CALENDAR TOOLS (CalendarService Integration)
	// ============================================

	{
		type: 'function',
		function: {
			name: 'get_calendar_events',
			description: 'Get calendar events (abbreviated) using CalendarService',
			parameters: {
				type: 'object',
				properties: {
					timeMin: {
						type: 'string',
						format: 'date-time',
						description: 'Start time (defaults to now)'
					},
					timeMax: {
						type: 'string',
						format: 'date-time',
						description: 'End time (defaults to 7 days)'
					},
					limit: {
						type: 'number',
						default: 20,
						description: 'Max events to return'
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
					timeMin: { type: 'string', format: 'date-time' },
					timeMax: { type: 'string', format: 'date-time' },
					duration_minutes: {
						type: 'number',
						default: 60
					},
					preferred_hours: {
						type: 'array',
						items: { type: 'number' },
						description: 'Hours 0-23, e.g. [9,10,11,14,15,16]'
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
			description: 'Schedule task to calendar using CalendarService.scheduleTask',
			parameters: {
				type: 'object',
				properties: {
					task_id: { type: 'string' },
					start_time: { type: 'string', format: 'date-time' },
					duration_minutes: { type: 'number' },
					recurrence_pattern: {
						type: 'string',
						enum: ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly']
					}
				},
				required: ['task_id', 'start_time']
			}
		}
	}
] as const;
```

---

## 🧠 Context Management System

### Token Budget Architecture

```typescript
// /apps/web/src/lib/services/chat-context-service.ts

export class ChatContextService {
	// Token allocation strategy
	private readonly TOKEN_BUDGETS = {
		HARD_LIMIT: 10000, // OpenRouter limit

		// Initial context (abbreviated)
		SYSTEM_PROMPT: 500, // Instructions + tool descriptions
		USER_PROFILE: 300, // Work style preferences
		LOCATION_CONTEXT: 1000, // Current project/task (abbreviated)
		RELATED_DATA: 500, // Related items (abbreviated)

		// Conversation
		HISTORY: 4000, // Previous messages

		// Response buffer
		RESPONSE: 2000, // LLM response space
		TOOL_RESULTS: 1700 // Space for tool call results
	};

	async buildInitialContext(
		sessionId: string,
		contextType: ChatContextType,
		entityId?: string
	): Promise<ContextBundle> {
		const layers: ContextLayer[] = [];

		// Layer 1: System instructions (always included)
		layers.push({
			priority: 1,
			type: 'system',
			content: this.getSystemPrompt(),
			tokens: this.TOKEN_BUDGETS.SYSTEM_PROMPT,
			truncatable: false
		});

		// Layer 2: User profile (abbreviated)
		const userProfile = await this.loadUserProfile(session.user_id);
		layers.push({
			priority: 2,
			type: 'user',
			content: userProfile,
			tokens: this.estimateTokens(userProfile),
			truncatable: true
		});

		// Layer 3: Location context (ABBREVIATED)
		const locationContext = await this.loadLocationContext(
			contextType,
			entityId,
			true // abbreviated = true
		);
		layers.push({
			priority: 3,
			type: 'location',
			content: locationContext.content,
			tokens: locationContext.tokens,
			metadata: locationContext.metadata,
			truncatable: false // Core context
		});

		// Layer 4: Related data (ABBREVIATED)
		const relatedData = await this.loadRelatedData(
			contextType,
			entityId,
			true // abbreviated = true
		);
		layers.push({
			priority: 4,
			type: 'related',
			content: relatedData.content,
			tokens: relatedData.tokens,
			truncatable: true
		});

		return this.assembleContext(layers);
	}

	private getSystemPrompt(): string {
		return `You are an AI assistant integrated into BuildOS, a productivity system for ADHD minds.
Current date: ${new Date().toISOString().split('T')[0]}

## Progressive Information Access

You have tools that follow a progressive disclosure pattern:

1. LIST/SEARCH tools return abbreviated data:
   - list_tasks: Task summaries (100 char previews)
   - search_projects: Project summaries (500 char context preview)
   - search_notes: Note previews (200 chars)

2. DETAIL tools return complete information:
   - get_task_details: Full task with all descriptions
   - get_project_details: Complete project context
   - get_note_details: Full note content

3. ACTION tools modify data:
   - create_task, update_task, update_project_context

4. CALENDAR tools for scheduling:
   - get_calendar_events, find_available_slots, schedule_task

## Tool Usage Pattern

ALWAYS follow this pattern:
1. Use LIST/SEARCH tools first to find relevant items
2. Show abbreviated results to user
3. Only call DETAIL tools for items the user asks about
4. Don't fetch details unless specifically needed

Example:
- User: "What are my high priority tasks?"
- You: Call list_tasks({priority: ['high']})
- Show abbreviated list
- User: "Tell me more about the landing page task"
- You: NOW call get_task_details('task_id')

## Response Guidelines

- Be concise but helpful
- Show abbreviated lists with key information
- Only drill down when user shows interest
- Explain what you're doing when calling tools
- If calendar isn't connected, explain how to connect it`;
	}

	private async loadLocationContext(
		contextType: ChatContextType,
		entityId?: string,
		abbreviated = true
	): Promise<LocationContext> {
		switch (contextType) {
			case 'project':
				return this.loadProjectContext(entityId!, abbreviated);
			case 'task':
				return this.loadTaskContext(entityId!, abbreviated);
			case 'calendar':
				return this.loadCalendarContext(abbreviated);
			case 'global':
				return this.loadGlobalContext(abbreviated);
		}
	}

	private async loadProjectContext(
		projectId: string,
		abbreviated: boolean
	): Promise<LocationContext> {
		if (abbreviated) {
			const project = await this.getAbbreviatedProject(projectId);
			const tasks = await this.getAbbreviatedTasks(projectId, 5);

			const content = `
## Current Project: ${project.name}
- Status: ${project.status} | ${project.completion_percentage}% complete
- Period: ${project.start_date || 'Not set'} to ${project.end_date || 'Not set'}
- Tasks: ${project.active_task_count} active, ${project.completed_task_count} done, ${project.task_count} total

### Executive Summary
${project.executive_summary || 'No summary generated yet'}

### Description
${project.description || 'No description'}

### Context Preview (500 chars)
${project.context_preview || 'No context captured'}
${project.context_preview?.length === 500 ? '... [use get_project_details for full context]' : ''}

### Top Active Tasks
${tasks.map((t) => `- [${t.priority}] ${t.title} ${t.start_date ? `(${t.start_date})` : ''}`).join('\n')}

Use tools to explore more details.`;

			return {
				content,
				tokens: this.estimateTokens(content),
				metadata: {
					projectId,
					abbreviated: true,
					taskCount: project.task_count,
					hasPhases: project.has_phases,
					hasNotes: project.has_notes
				}
			};
		} else {
			// Full context (only loaded via tool)
			return this.loadFullProjectContext(projectId);
		}
	}

	private async loadTaskContext(taskId: string, abbreviated: boolean): Promise<LocationContext> {
		const { data: task } = await this.supabase
			.from('tasks')
			.select(
				`
        id, title, status, priority, start_date, duration_minutes,
        description, details, task_type, recurrence_pattern,
        project:projects!inner(id, name, status),
        subtasks:tasks!parent_task_id(id)
      `
			)
			.eq('id', taskId)
			.single();

		if (abbreviated) {
			const content = `
## Current Task: ${task.title}
- Status: ${task.status} | Priority: ${task.priority}
- Project: ${task.project?.name || 'No project'}
- Schedule: ${task.start_date || 'Not scheduled'} (${task.duration_minutes || 60} min)
${task.recurrence_pattern ? `- Recurring: ${task.recurrence_pattern}` : ''}

### Description Preview (100 chars)
${task.description?.substring(0, 100) || 'No description'}${task.description?.length > 100 ? '...' : ''}

### Details Preview (100 chars)
${task.details?.substring(0, 100) || 'No details'}${task.details?.length > 100 ? '...' : ''}

${task.subtasks?.length > 0 ? `Has ${task.subtasks.length} subtasks` : 'No subtasks'}

Use get_task_details('${taskId}') for complete information.`;

			return {
				content,
				tokens: this.estimateTokens(content),
				metadata: {
					taskId,
					projectId: task.project?.id,
					abbreviated: true
				}
			};
		} else {
			// Full task context
			return this.loadFullTaskContext(taskId);
		}
	}

	private async getAbbreviatedProject(projectId: string): Promise<AbbreviatedProject> {
		const { data } = await this.supabase
			.from('projects')
			.select(
				`
        id, name, slug, status, start_date, end_date,
        description, executive_summary, tags, context,
        tasks!inner(id, status),
        phases(id),
        notes(id),
        brain_dumps(id)
      `
			)
			.eq('id', projectId)
			.single();

		const taskStats = this.calculateTaskStats(data.tasks || []);

		return {
			id: data.id,
			name: data.name,
			slug: data.slug,
			status: data.status,
			start_date: data.start_date,
			end_date: data.end_date,
			description: data.description,
			executive_summary: data.executive_summary,
			tags: data.tags,
			context_preview: data.context?.substring(0, 500) || null,
			task_count: taskStats.total,
			active_task_count: taskStats.active,
			completed_task_count: taskStats.completed,
			completion_percentage: taskStats.percentage,
			has_phases: data.phases?.length > 0,
			has_notes: data.notes?.length > 0,
			has_brain_dumps: data.brain_dumps?.length > 0
		};
	}

	private async getAbbreviatedTasks(projectId: string, limit = 10): Promise<AbbreviatedTask[]> {
		const { data: tasks } = await this.supabase
			.from('tasks')
			.select(
				`
        id, title, status, priority, start_date, duration_minutes,
        description, details, task_type, recurrence_pattern,
        subtasks:tasks!parent_task_id(id),
        dependencies
      `
			)
			.eq('project_id', projectId)
			.in('status', ['in_progress', 'backlog', 'blocked'])
			.order('priority', { ascending: false })
			.order('start_date', { ascending: true })
			.limit(limit);

		return tasks.map((t) => ({
			id: t.id,
			title: t.title,
			status: t.status,
			priority: t.priority,
			start_date: t.start_date,
			duration_minutes: t.duration_minutes,
			description_preview: t.description?.substring(0, 100) || '',
			details_preview: t.details?.substring(0, 100) || null,
			has_subtasks: t.subtasks?.length > 0,
			has_dependencies: t.dependencies?.length > 0,
			is_recurring: !!t.recurrence_pattern,
			is_overdue: this.isOverdue(t.start_date, t.status)
		}));
	}

	private estimateTokens(text: string): number {
		// Conservative estimate: ~4 chars per token
		return Math.ceil(text.length / 4);
	}
}
```

---

## 📡 Tool Executor with Progressive Disclosure

```typescript
// /apps/web/src/lib/chat/tool-executor.ts

export class ChatToolExecutor {
	private calendarService: CalendarService;

	constructor(
		private supabase: SupabaseClient,
		private userId: string
	) {
		this.calendarService = new CalendarService(supabase);
	}

	async execute(toolCall: ChatTool): Promise<ToolResult> {
		const startTime = Date.now();

		try {
			let result: any;

			switch (toolCall.name) {
				// LIST/SEARCH OPERATIONS (Abbreviated)
				case 'list_tasks':
					result = await this.listTasksAbbreviated(toolCall.arguments);
					break;

				case 'search_projects':
					result = await this.searchProjectsAbbreviated(toolCall.arguments);
					break;

				case 'search_notes':
					result = await this.searchNotesAbbreviated(toolCall.arguments);
					break;

				// DETAIL OPERATIONS (Complete)
				case 'get_task_details':
					result = await this.getTaskComplete(toolCall.arguments);
					break;

				case 'get_project_details':
					result = await this.getProjectComplete(toolCall.arguments);
					break;

				case 'get_note_details':
					result = await this.getNoteComplete(toolCall.arguments);
					break;

				// ACTION OPERATIONS
				case 'create_task':
					result = await this.createTask(toolCall.arguments);
					break;

				case 'update_task':
					result = await this.updateTask(toolCall.arguments);
					break;

				case 'update_project_context':
					result = await this.updateProjectContext(toolCall.arguments);
					break;

				// CALENDAR OPERATIONS
				case 'get_calendar_events':
					result = await this.getCalendarEventsAbbreviated(toolCall.arguments);
					break;

				case 'find_available_slots':
					result = await this.calendarService.findAvailableSlots(
						this.userId,
						toolCall.arguments
					);
					break;

				case 'schedule_task':
					result = await this.calendarService.scheduleTask(
						this.userId,
						toolCall.arguments
					);
					break;

				default:
					throw new Error(`Unknown tool: ${toolCall.name}`);
			}

			const duration = Date.now() - startTime;

			// Log execution
			await this.logToolExecution(toolCall, result, duration, true);

			return {
				tool_call_id: toolCall.id,
				result,
				success: true,
				duration_ms: duration
			};
		} catch (error) {
			const duration = Date.now() - startTime;

			// Special handling for calendar disconnection
			if (error.message?.includes('requires reconnection')) {
				return {
					tool_call_id: toolCall.id,
					result: null,
					success: false,
					error: 'Calendar connection required. Please reconnect Google Calendar.',
					requires_user_action: true
				};
			}

			await this.logToolExecution(toolCall, null, duration, false, error.message);

			return {
				tool_call_id: toolCall.id,
				result: null,
				success: false,
				error: error.message
			};
		}
	}

	// ========================================
	// LIST/SEARCH OPERATIONS (Abbreviated)
	// ========================================

	private async listTasksAbbreviated(args: any): Promise<{
		tasks: AbbreviatedTask[];
		total: number;
		has_more: boolean;
		message: string;
	}> {
		let query = this.supabase
			.from('tasks')
			.select(
				`
        id, title, status, priority, start_date, duration_minutes,
        description, details, task_type, recurrence_pattern,
        project:projects!inner(name),
        subtasks:tasks!parent_task_id(id),
        dependencies
      `,
				{ count: 'exact' }
			)
			.eq('user_id', this.userId)
			.is('deleted_at', null);

		// Apply filters
		if (args.project_id) {
			query = query.eq('project_id', args.project_id);
		}
		if (args.status) {
			query = query.in('status', args.status);
		}
		if (args.priority) {
			query = query.in('priority', args.priority);
		}
		if (args.has_date === true) {
			query = query.not('start_date', 'is', null);
		}

		// Sorting
		const sortBy = args.sort_by || 'priority';
		if (sortBy === 'priority') {
			query = query
				.order('priority', { ascending: false })
				.order('created_at', { ascending: false });
		} else if (sortBy === 'start_date') {
			query = query.order('start_date', { ascending: true });
		} else {
			query = query.order('created_at', { ascending: false });
		}

		const limit = Math.min(args.limit || 20, 50);
		const { data: tasks, count } = await query.limit(limit);

		// Transform to abbreviated format
		const abbreviated = tasks.map((t) => ({
			id: t.id,
			title: t.title,
			status: t.status,
			priority: t.priority,
			start_date: t.start_date,
			duration_minutes: t.duration_minutes,
			description_preview: t.description?.substring(0, 100) || '',
			details_preview: t.details?.substring(0, 100) || null,
			has_subtasks: t.subtasks?.length > 0,
			has_dependencies: t.dependencies?.length > 0,
			is_recurring: !!t.recurrence_pattern,
			project_name: t.project?.name,
			is_overdue: this.isTaskOverdue(t)
		}));

		return {
			tasks: abbreviated,
			total: count || 0,
			has_more: count > limit,
			message: `Showing ${abbreviated.length} of ${count} tasks. Use get_task_details(task_id) for full information.`
		};
	}

	private async searchProjectsAbbreviated(args: any): Promise<{
		projects: AbbreviatedProject[];
		total: number;
		message: string;
	}> {
		let query = this.supabase
			.from('projects')
			.select(
				`
        id, name, slug, status, start_date, end_date,
        description, executive_summary, tags, context,
        tasks!inner(id, status),
        phases(id),
        notes(id),
        brain_dumps(id)
      `,
				{ count: 'exact' }
			)
			.eq('user_id', this.userId);

		// Apply search
		if (args.query) {
			const search = args.query.replace(/[\\%_]/g, '\\$&');
			query = query.or(
				`name.ilike.%${search}%,description.ilike.%${search}%,tags.cs.{${search}}`
			);
		}

		if (args.status) {
			query = query.eq('status', args.status);
		}

		if (args.has_active_tasks) {
			query = query.gt('tasks.length', 0);
		}

		const limit = Math.min(args.limit || 10, 20);
		const { data: projects, count } = await query
			.order('updated_at', { ascending: false })
			.limit(limit);

		// Transform to abbreviated
		const abbreviated = projects.map((p) => {
			const taskStats = this.calculateTaskStats(p.tasks || []);
			return {
				id: p.id,
				name: p.name,
				slug: p.slug,
				status: p.status,
				start_date: p.start_date,
				end_date: p.end_date,
				description: p.description,
				executive_summary: p.executive_summary,
				tags: p.tags,
				context_preview: p.context?.substring(0, 500) || null,
				task_count: taskStats.total,
				active_task_count: taskStats.active,
				completed_task_count: taskStats.completed,
				completion_percentage: taskStats.percentage,
				has_phases: p.phases?.length > 0,
				has_notes: p.notes?.length > 0,
				has_brain_dumps: p.brain_dumps?.length > 0
			};
		});

		return {
			projects: abbreviated,
			total: count || 0,
			message: `Found ${count} projects. Use get_project_details(project_id) for full context.`
		};
	}

	// ========================================
	// DETAIL OPERATIONS (Complete Data)
	// ========================================

	private async getTaskComplete(args: any): Promise<{
		task: any;
		message: string;
	}> {
		const { data: task } = await this.supabase
			.from('tasks')
			.select(
				`
        *,
        project:projects!inner(
          id, name, slug, status, context, executive_summary
        ),
        subtasks:tasks!parent_task_id(*),
        parent_task:tasks!parent_task_id(
          id, title, status
        )
      `
			)
			.eq('id', args.task_id)
			.eq('user_id', this.userId)
			.single();

		if (!task) {
			throw new Error('Task not found');
		}

		// Include project context if requested
		let projectContext = null;
		if (args.include_project_context && task.project) {
			projectContext = {
				context: task.project.context,
				executive_summary: task.project.executive_summary
			};
		}

		return {
			task: {
				...task,
				project_context: projectContext,
				_complete: true
			},
			message: 'Complete task details loaded including full descriptions and relationships.'
		};
	}

	private async getProjectComplete(args: any): Promise<{
		project: any;
		message: string;
	}> {
		// Base project query
		const { data: project } = await this.supabase
			.from('projects')
			.select('*')
			.eq('id', args.project_id)
			.eq('user_id', this.userId)
			.single();

		if (!project) {
			throw new Error('Project not found');
		}

		// Optionally load related data
		let tasks = null;
		let phases = null;
		let notes = null;
		let brainDumps = null;

		if (args.include_tasks) {
			const { data } = await this.supabase
				.from('tasks')
				.select('id, title, status, priority, start_date, description')
				.eq('project_id', args.project_id)
				.order('priority', { ascending: false })
				.limit(20);

			// Return abbreviated task list even in detail view
			tasks = data?.map((t) => ({
				id: t.id,
				title: t.title,
				status: t.status,
				priority: t.priority,
				start_date: t.start_date,
				description_preview: t.description?.substring(0, 100) || ''
			}));
		}

		if (args.include_phases !== false) {
			const { data } = await this.supabase
				.from('phases')
				.select('*')
				.eq('project_id', args.project_id)
				.order('order');
			phases = data;
		}

		if (args.include_notes) {
			const { data } = await this.supabase
				.from('notes')
				.select('id, title, category, content, created_at')
				.eq('project_id', args.project_id)
				.order('created_at', { ascending: false })
				.limit(10);

			// Return abbreviated notes
			notes = data?.map((n) => ({
				id: n.id,
				title: n.title,
				category: n.category,
				content_preview: n.content?.substring(0, 200) || '',
				created_at: n.created_at
			}));
		}

		if (args.include_brain_dumps) {
			const { data } = await this.supabase
				.from('brain_dumps')
				.select('id, title, ai_summary, created_at')
				.eq('project_id', args.project_id)
				.order('created_at', { ascending: false })
				.limit(5);
			brainDumps = data;
		}

		return {
			project: {
				...project,
				tasks,
				phases,
				notes,
				brain_dumps: brainDumps,
				_complete: true,
				_context_length: project.context?.length || 0
			},
			message: `Complete project details loaded${tasks ? ` with ${tasks.length} tasks` : ''}${phases ? ` and ${phases.length} phases` : ''}.`
		};
	}

	// ========================================
	// CALENDAR OPERATIONS
	// ========================================

	private async getCalendarEventsAbbreviated(args: any): Promise<{
		events: AbbreviatedCalendarEvent[];
		total: number;
		time_range: any;
		message: string;
	}> {
		const result = await this.calendarService.getCalendarEvents(this.userId, {
			timeMin: args.timeMin || new Date().toISOString(),
			timeMax: args.timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
			maxResults: args.limit || 20
		});

		// Transform to abbreviated format
		const abbreviated = result.events.map((e) => ({
			id: e.id,
			summary: e.summary || 'No title',
			start: e.start?.dateTime || e.start?.date,
			end: e.end?.dateTime || e.end?.date,
			is_all_day: !e.start?.dateTime,
			has_description: !!e.description,
			has_attendees: e.attendees?.length > 0,
			linked_task_id: this.extractTaskId(e.description)
		}));

		return {
			events: abbreviated,
			total: result.event_count,
			time_range: result.time_range,
			message: 'Calendar events loaded. Full event details available in Google Calendar.'
		};
	}

	// ========================================
	// HELPER METHODS
	// ========================================

	private calculateTaskStats(tasks: any[]): {
		total: number;
		active: number;
		completed: number;
		percentage: number;
	} {
		const total = tasks.length;
		const completed = tasks.filter((t) => t.status === 'done').length;
		const active = tasks.filter((t) => t.status === 'in_progress').length;
		const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

		return { total, active, completed, percentage };
	}

	private isTaskOverdue(task: any): boolean {
		if (!task.start_date || task.status === 'done') return false;
		return new Date(task.start_date) < new Date();
	}

	private extractTaskId(description?: string): string | undefined {
		if (!description) return undefined;
		const match = description.match(/\[BuildOS Task #([\w-]+)\]/);
		return match?.[1];
	}
}
```

---

## 🚀 Complete Implementation Plan

### Phase 1: Database & Types (Day 1)

1. ✅ Create migration with chat tables
2. ✅ Define abbreviated data types
3. ✅ Run type generation
4. ✅ Add progressive disclosure types

### Phase 2: Context Service (Day 1-2)

1. ✅ Build ChatContextService with token budgeting
2. ✅ Implement abbreviated loaders for each entity type
3. ✅ Create context assembly with priorities
4. ✅ Add token estimation and truncation

### Phase 3: Tool System (Day 2)

1. ✅ Define tools with list/detail separation
2. ✅ Build ChatToolExecutor with progressive methods
3. ✅ Integrate CalendarService properly
4. ✅ Add execution logging

### Phase 4: LLM Integration (Day 2-3)

1. ✅ Extend SmartLLMService with streaming
2. ✅ Add tool calling support
3. ✅ Update system prompts for progressive pattern
4. ✅ Test with OpenRouter

### Phase 5: API Endpoint (Day 3)

1. ✅ Create /api/chat/stream endpoint
2. ✅ Implement SSE streaming
3. ✅ Add rate limiting and auth
4. ✅ Wire up context and tools

### Phase 6: UI Components (Day 3-4)

1. ✅ Build ChatModal with Svelte 5
2. ✅ Add message components
3. ✅ Implement tool visualization
4. ✅ Handle streaming states

### Phase 7: Testing & Optimization (Day 4-5)

1. ✅ Test progressive disclosure flow
2. ✅ Measure token usage
3. ✅ Optimize context assembly
4. ✅ Performance testing

### Phase 8: Polish (Day 5)

1. ✅ Auto-title generation
2. ✅ Conversation compression
3. ✅ Chat history management
4. ✅ Documentation

---

## 📊 Success Metrics

### Performance

- Initial context < 1500 tokens (vs 4000+ without progressive)
- Time to first token < 1.5s
- Tool execution < 2s per call
- 70% reduction in token usage

### User Experience

- Clear abbreviated → detailed flow
- Visual tool execution feedback
- Responsive on mobile
- Helpful error messages

### Cost

- Average session < $0.03
- Use speed tier models (Gemini Flash)
- Smart context pruning
- Efficient tool calling

---

## 🔑 Key Design Decisions

1. **Two-Tier Tools**: Separate list/search from detail operations
2. **Abbreviated First**: Always load summaries initially
3. **Smart Truncation**: Preview fields at specific character limits
4. **Token Budgeting**: Strict allocation per context layer
5. **Explicit Prompting**: Teach LLM the progressive pattern
6. **Metadata Hints**: Include has_subtasks, has_notes flags
7. **Preservation**: Keep full fields that are already concise

This progressive disclosure pattern reduces initial token usage by ~70% while maintaining full access to detailed information through intelligent tool use.
