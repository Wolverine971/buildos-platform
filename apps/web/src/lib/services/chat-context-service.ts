// apps/web/src/lib/services/chat-context-service.ts
/**
 * Chat Context Service - Progressive Disclosure Pattern
 *
 * This service manages context assembly for chat sessions using a progressive
 * disclosure pattern. It loads abbreviated data initially (reducing tokens by 70%)
 * and provides methods for drilling down into detailed data when needed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Database,
	ChatContextType,
	ContextLayer,
	LocationContext,
	ContextBundle,
	AssembledContext,
	TokenBudget,
	AbbreviatedProject,
	AbbreviatedTask,
	AbbreviatedNote,
	AbbreviatedBrainDump,
	AbbreviatedCalendarEvent,
	ChatSession
} from '@buildos/shared-types';

export class ChatContextService {
	// Token allocation strategy
	private readonly TOKEN_BUDGETS: TokenBudget = {
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

	// Character limits for previews
	private readonly PREVIEW_LIMITS = {
		TASK_DESCRIPTION: 100, // chars
		TASK_DETAILS: 100, // chars
		PROJECT_CONTEXT: 500, // chars
		NOTE_CONTENT: 200, // chars
		BRAIN_DUMP_SUMMARY: null, // Full summary (already concise)
		EXECUTIVE_SUMMARY: null // Full summary (already concise)
	};

	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Build initial context for a chat session
	 * Returns abbreviated context to minimize token usage
	 */
	async buildInitialContext(
		sessionId: string,
		contextType: ChatContextType,
		entityId?: string
	): Promise<AssembledContext> {
		// Get session details
		const { data: session } = await this.supabase
			.from('chat_sessions')
			.select('*')
			.eq('id', sessionId)
			.single();

		if (!session) {
			throw new Error('Chat session not found');
		}

		const layers: ContextLayer[] = [];

		// Layer 1: System instructions (always included)
		const systemPrompt = this.getSystemPrompt(contextType);
		layers.push({
			priority: 1,
			type: 'system',
			content: systemPrompt,
			tokens: this.estimateTokens(systemPrompt),
			truncatable: false
		});

		// Layer 2: User profile (abbreviated)
		const userProfile = await this.loadUserProfile(session.user_id);
		if (userProfile) {
			layers.push({
				priority: 2,
				type: 'user',
				content: userProfile,
				tokens: this.estimateTokens(userProfile),
				truncatable: true
			});
		}

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
		if (relatedData) {
			layers.push({
				priority: 4,
				type: 'related',
				content: relatedData.content,
				tokens: relatedData.tokens,
				truncatable: true
			});
		}

		// Assemble within budget
		const assembled = this.assembleContext(layers);

		return {
			...assembled,
			systemPrompt,
			userContext: userProfile,
			locationContext: locationContext.content,
			relatedData: relatedData?.content
		};
	}

	/**
	 * Get system prompt with progressive disclosure instructions
	 */
	private getSystemPrompt(contextType: ChatContextType): string {
		const basePrompt = `You are an AI assistant integrated into BuildOS, a productivity system designed for ADHD minds.
Current date: ${new Date().toISOString().split('T')[0]}

## Critical: Progressive Information Access Pattern

You have tools that follow a STRICT progressive disclosure pattern to optimize token usage:

### Tier 1: LIST/SEARCH Tools (Use First)
These return abbreviated summaries with preview fields:
- list_tasks → Task titles + 100 char description previews
- search_projects → Project summaries + 500 char context previews
- search_notes → Note titles + 200 char content previews
- get_calendar_events → Event times and titles only

### Tier 2: DETAIL Tools (Use Only When Needed)
These return complete information and should ONLY be called when:
- User explicitly asks for more details about a specific item
- You need complete information to answer a specific question
- User wants to modify something (need full context first)

Tools:
- get_task_details → Complete task with full descriptions
- get_project_details → Full project context and dimensions
- get_note_details → Complete note content

### Required Flow Pattern

1. **Always start with LIST/SEARCH tools**
   - Even if user mentions a specific item, search for it first
   - This confirms it exists and gets current status

2. **Show abbreviated results to user**
   - Present the summary information clearly
   - Indicate more details are available if needed

3. **Only drill down when necessary**
   - User asks a question requiring full details
   - User explicitly requests more information
   - You need to perform an action on the item

## Response Guidelines

- Be concise but helpful
- Show abbreviated lists with key information
- Only drill down when user shows interest
- Explain what you're doing when calling tools
- If calendar isn't connected, explain how to connect it`;

		// Add context-specific instructions
		const contextAdditions: Record<ChatContextType, string> = {
			project: `

## Current Context: Project
You're focused on a specific project. The abbreviated project context has been loaded.
Prioritize project-related tasks and information in your responses.`,

			task: `

## Current Context: Task
You're focused on a specific task. The abbreviated task context has been loaded.
Consider subtasks, dependencies, and parent project context when relevant.`,

			calendar: `

## Current Context: Calendar
You're in calendar mode. Focus on scheduling, time management, and calendar events.
Use calendar tools to help with scheduling tasks and finding available time slots.`,

			global: `

## Current Context: Global
You're in general assistant mode. Help with any BuildOS-related questions or tasks.
You can search across all projects, tasks, and notes as needed.`
		};

		return basePrompt + contextAdditions[contextType];
	}

	/**
	 * Load user profile (abbreviated version)
	 */
	private async loadUserProfile(userId: string): Promise<string | null> {
		const { data: user } = await this.supabase
			.from('users')
			.select(
				`
        email,
        timezone,
        work_style_preferences,
        notification_preferences
      `
			)
			.eq('id', userId)
			.single();

		if (!user) return null;

		const preferences = user.work_style_preferences || {};

		return `## User Profile
- Timezone: ${user.timezone || 'America/New_York'}
- Work Style: ${preferences.work_style || 'flexible'}
- Focus Hours: ${preferences.focus_hours || '9am-5pm'}
- Task Batching: ${preferences.prefers_batching ? 'Yes' : 'No'}
- Calendar Connected: ${preferences.calendar_connected ? 'Yes' : 'No'}`;
	}

	/**
	 * Load location-specific context (abbreviated or full)
	 */
	private async loadLocationContext(
		contextType: ChatContextType,
		entityId?: string,
		abbreviated = true
	): Promise<LocationContext> {
		switch (contextType) {
			case 'project':
				if (!entityId) throw new Error('Project ID required for project context');
				return this.loadProjectContext(entityId, abbreviated);

			case 'task':
				if (!entityId) throw new Error('Task ID required for task context');
				return this.loadTaskContext(entityId, abbreviated);

			case 'calendar':
				return this.loadCalendarContext(abbreviated);

			case 'global':
			default:
				return this.loadGlobalContext(abbreviated);
		}
	}

	/**
	 * Load project context (abbreviated or full)
	 */
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

	/**
	 * Load task context (abbreviated or full)
	 */
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

		if (!task) throw new Error('Task not found');

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

	/**
	 * Load calendar context (abbreviated)
	 */
	private async loadCalendarContext(abbreviated: boolean): Promise<LocationContext> {
		const today = new Date();
		const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

		const { data: events } = await this.supabase
			.from('calendar_events')
			.select('id, summary, start_time, end_time, is_all_day')
			.gte('start_time', today.toISOString())
			.lte('start_time', nextWeek.toISOString())
			.order('start_time')
			.limit(10);

		const content = `
## Calendar Context
- Today: ${today.toDateString()}
- Showing next 7 days

### Upcoming Events (${events?.length || 0})
${
	events
		?.map((e) => {
			const start = new Date(e.start_time);
			return `- ${start.toLocaleDateString()} ${e.is_all_day ? 'All day' : start.toLocaleTimeString()}: ${e.summary}`;
		})
		.join('\n') || 'No upcoming events'
}

Use calendar tools to find available time slots or schedule tasks.`;

		return {
			content,
			tokens: this.estimateTokens(content),
			metadata: {
				abbreviated: true
			}
		};
	}

	/**
	 * Load global context (abbreviated)
	 */
	private async loadGlobalContext(abbreviated: boolean): Promise<LocationContext> {
		// Get user's active projects and recent tasks
		const { data: projects } = await this.supabase
			.from('projects')
			.select('id, name, status, active_task_count')
			.eq('status', 'active')
			.order('updated_at', { ascending: false })
			.limit(3);

		const { data: tasks } = await this.supabase
			.from('tasks')
			.select('id, title, priority, start_date')
			.in('status', ['in_progress', 'blocked'])
			.order('priority', { ascending: false })
			.limit(5);

		const content = `
## BuildOS Overview

### Active Projects (${projects?.length || 0})
${projects?.map((p) => `- ${p.name} (${p.active_task_count} active tasks)`).join('\n') || 'No active projects'}

### Current Tasks (${tasks?.length || 0})
${tasks?.map((t) => `- [${t.priority}] ${t.title}`).join('\n') || 'No active tasks'}

Use search tools to explore projects, tasks, notes, and calendar events.`;

		return {
			content,
			tokens: this.estimateTokens(content),
			metadata: {
				abbreviated: true
			}
		};
	}

	/**
	 * Load related data for additional context
	 */
	private async loadRelatedData(
		contextType: ChatContextType,
		entityId?: string,
		abbreviated = true
	): Promise<LocationContext | null> {
		let content = '## Related Information\n';
		let hasContent = false;

		if (contextType === 'project' && entityId) {
			// Get recent notes and brain dumps for the project
			const { data: notes } = await this.supabase
				.from('notes')
				.select('id, title, content')
				.eq('project_id', entityId)
				.order('created_at', { ascending: false })
				.limit(3);

			if (notes && notes.length > 0) {
				hasContent = true;
				content += '\n### Recent Notes\n';
				content += notes
					.map((n) => {
						const preview =
							n.content?.substring(0, this.PREVIEW_LIMITS.NOTE_CONTENT) || '';
						return `- ${n.title || 'Untitled'}: ${preview}${n.content?.length > this.PREVIEW_LIMITS.NOTE_CONTENT ? '...' : ''}`;
					})
					.join('\n');
			}
		}

		if (contextType === 'task' && entityId) {
			// Get parent task and sibling tasks
			const { data: task } = await this.supabase
				.from('tasks')
				.select('parent_task_id, project_id')
				.eq('id', entityId)
				.single();

			if (task?.parent_task_id) {
				const { data: parentTask } = await this.supabase
					.from('tasks')
					.select('id, title, status')
					.eq('id', task.parent_task_id)
					.single();

				if (parentTask) {
					hasContent = true;
					content += `\n### Parent Task\n- ${parentTask.title} (${parentTask.status})\n`;
				}

				// Get sibling tasks
				const { data: siblings } = await this.supabase
					.from('tasks')
					.select('id, title, status, priority')
					.eq('parent_task_id', task.parent_task_id)
					.neq('id', entityId)
					.limit(5);

				if (siblings && siblings.length > 0) {
					hasContent = true;
					content += '\n### Sibling Tasks\n';
					content += siblings
						.map((s) => `- [${s.priority}] ${s.title} (${s.status})`)
						.join('\n');
				}
			}
		}

		if (!hasContent) return null;

		return {
			content,
			tokens: this.estimateTokens(content),
			metadata: {
				abbreviated: true
			}
		};
	}

	/**
	 * Get abbreviated project data
	 */
	private async getAbbreviatedProject(projectId: string): Promise<AbbreviatedProject> {
		const { data } = await this.supabase
			.from('projects')
			.select(
				`
        id, name, slug, status, start_date, end_date,
        description, executive_summary, tags, context,
        tasks!inner(id, status),
        phases:project_phases(id),
        notes(id),
        brain_dumps(id)
      `
			)
			.eq('id', projectId)
			.single();

		if (!data) throw new Error('Project not found');

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
			context_preview:
				data.context?.substring(0, this.PREVIEW_LIMITS.PROJECT_CONTEXT) || null,
			task_count: taskStats.total,
			active_task_count: taskStats.active,
			completed_task_count: taskStats.completed,
			completion_percentage: taskStats.percentage,
			has_phases: data.phases?.length > 0,
			has_notes: data.notes?.length > 0,
			has_brain_dumps: data.brain_dumps?.length > 0
		};
	}

	/**
	 * Get abbreviated tasks for a project
	 */
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

		if (!tasks) return [];

		return tasks.map((t) => ({
			id: t.id,
			title: t.title,
			status: t.status,
			priority: t.priority,
			start_date: t.start_date,
			duration_minutes: t.duration_minutes,
			description_preview:
				t.description?.substring(0, this.PREVIEW_LIMITS.TASK_DESCRIPTION) || '',
			details_preview: t.details?.substring(0, this.PREVIEW_LIMITS.TASK_DETAILS) || null,
			has_subtasks: t.subtasks?.length > 0,
			has_dependencies: t.dependencies?.length > 0,
			is_recurring: !!t.recurrence_pattern,
			is_overdue: this.isOverdue(t.start_date, t.status)
		}));
	}

	/**
	 * Load full project context (called via tool)
	 */
	private async loadFullProjectContext(projectId: string): Promise<LocationContext> {
		const { data: project } = await this.supabase
			.from('projects')
			.select(
				`
        *,
        tasks(*),
        phases:project_phases(*),
        notes(*),
        brain_dumps(*)
      `
			)
			.eq('id', projectId)
			.single();

		if (!project) throw new Error('Project not found');

		// Build comprehensive context
		let content = `## Project: ${project.name} (Full Context)\n\n`;
		content += `### Overview\n`;
		content += `- Status: ${project.status}\n`;
		content += `- Period: ${project.start_date || 'Not set'} to ${project.end_date || 'Not set'}\n`;
		content += `- Tags: ${project.tags?.join(', ') || 'None'}\n\n`;

		if (project.description) {
			content += `### Description\n${project.description}\n\n`;
		}

		if (project.executive_summary) {
			content += `### Executive Summary\n${project.executive_summary}\n\n`;
		}

		if (project.context) {
			content += `### Full Context\n${project.context}\n\n`;
		}

		if (project.core_problem) {
			content += `### Core Problem\n${project.core_problem}\n\n`;
		}

		if (project.target_audience) {
			content += `### Target Audience\n${project.target_audience}\n\n`;
		}

		if (project.success_metrics) {
			content += `### Success Metrics\n${project.success_metrics}\n\n`;
		}

		// Include phases
		if (project.phases && project.phases.length > 0) {
			content += `### Phases\n`;
			project.phases.forEach((phase) => {
				content += `\n#### ${phase.name}\n`;
				content += `- Status: ${phase.status}\n`;
				content += `- Period: ${phase.start_date || 'TBD'} to ${phase.end_date || 'TBD'}\n`;
				if (phase.description) content += `- ${phase.description}\n`;
			});
			content += '\n';
		}

		return {
			content,
			tokens: this.estimateTokens(content),
			metadata: {
				projectId,
				abbreviated: false,
				taskCount: project.tasks?.length || 0,
				hasPhases: project.phases?.length > 0,
				hasNotes: project.notes?.length > 0
			}
		};
	}

	/**
	 * Load full task context (called via tool)
	 */
	private async loadFullTaskContext(taskId: string): Promise<LocationContext> {
		const { data: task } = await this.supabase
			.from('tasks')
			.select(
				`
        *,
        project:projects(*),
        subtasks:tasks!parent_task_id(*)
      `
			)
			.eq('id', taskId)
			.single();

		if (!task) throw new Error('Task not found');

		// Fetch parent task separately if needed
		let parentTask = null;
		if (task.parent_task_id) {
			const { data } = await this.supabase
				.from('tasks')
				.select('id, title, status')
				.eq('id', task.parent_task_id)
				.single();
			parentTask = data;
		}

		let content = `## Task: ${task.title} (Full Details)\n\n`;
		content += `### Status & Priority\n`;
		content += `- Status: ${task.status}\n`;
		content += `- Priority: ${task.priority}\n`;
		content += `- Type: ${task.task_type || 'one_off'}\n`;
		if (task.recurrence_pattern) content += `- Recurring: ${task.recurrence_pattern}\n`;
		if (parentTask) content += `- Parent Task: ${parentTask.title} (${parentTask.status})\n`;
		content += '\n';

		if (task.description) {
			content += `### Description\n${task.description}\n\n`;
		}

		if (task.details) {
			content += `### Details\n${task.details}\n\n`;
		}

		if (task.acceptance_criteria) {
			content += `### Acceptance Criteria\n${task.acceptance_criteria}\n\n`;
		}

		if (task.technical_notes) {
			content += `### Technical Notes\n${task.technical_notes}\n\n`;
		}

		// Include subtasks
		if (task.subtasks && task.subtasks.length > 0) {
			content += `### Subtasks (${task.subtasks.length})\n`;
			task.subtasks.forEach((st: any) => {
				content += `- [${st.status}] ${st.title}\n`;
				if (st.description)
					content += `  ${st.description.substring(0, 100)}${st.description.length > 100 ? '...' : ''}\n`;
			});
			content += '\n';
		}

		return {
			content,
			tokens: this.estimateTokens(content),
			metadata: {
				taskId,
				projectId: task.project_id,
				abbreviated: false
			}
		};
	}

	/**
	 * Assemble context layers within token budget
	 */
	private assembleContext(layers: ContextLayer[]): ContextBundle {
		let totalTokens = 0;
		const included: ContextLayer[] = [];
		const truncated: ContextLayer[] = [];

		// Sort by priority
		layers.sort((a, b) => a.priority - b.priority);

		// Calculate budget for context (excluding conversation and response)
		const contextBudget =
			this.TOKEN_BUDGETS.SYSTEM_PROMPT +
			this.TOKEN_BUDGETS.USER_PROFILE +
			this.TOKEN_BUDGETS.LOCATION_CONTEXT +
			this.TOKEN_BUDGETS.RELATED_DATA;

		for (const layer of layers) {
			if (totalTokens + layer.tokens <= contextBudget) {
				// Layer fits completely
				included.push(layer);
				totalTokens += layer.tokens;
			} else if (layer.truncatable) {
				// Try to fit truncated version
				const remainingTokens = contextBudget - totalTokens;
				if (remainingTokens > 100) {
					// Minimum useful size
					const truncatedLayer = this.truncateLayer(layer, remainingTokens);
					included.push(truncatedLayer);
					truncated.push(layer);
					totalTokens += truncatedLayer.tokens;
				}
			}
			// Non-truncatable layers that don't fit are skipped
		}

		return {
			layers: included,
			totalTokens,
			truncatedLayers: truncated,
			utilization: totalTokens / contextBudget
		};
	}

	/**
	 * Truncate a context layer to fit within token limit
	 */
	private truncateLayer(layer: ContextLayer, maxTokens: number): ContextLayer {
		const maxChars = maxTokens * 4; // Approximate 4 chars per token
		const truncatedContent = layer.content.substring(0, maxChars) + '\n... [truncated]';

		return {
			...layer,
			content: truncatedContent,
			tokens: this.estimateTokens(truncatedContent)
		};
	}

	/**
	 * Calculate task statistics for a project
	 */
	private calculateTaskStats(tasks: any[]): {
		total: number;
		active: number;
		completed: number;
		percentage: number;
	} {
		const total = tasks.length;
		const completed = tasks.filter((t) => t.status === 'done').length;
		const active = tasks.filter((t) =>
			['in_progress', 'backlog', 'blocked'].includes(t.status)
		).length;
		const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

		return { total, active, completed, percentage };
	}

	/**
	 * Check if a task is overdue
	 */
	private isOverdue(startDate: string | null, status: string): boolean {
		if (!startDate || status === 'done') return false;
		const taskDate = new Date(startDate);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return taskDate < today && status !== 'done';
	}

	/**
	 * Estimate token count for text
	 * Conservative estimate: ~4 characters per token
	 */
	private estimateTokens(text: string): number {
		return Math.ceil(text.length / 4);
	}

	/**
	 * Cache abbreviated context for quick retrieval
	 */
	async cacheContext(
		userId: string,
		contextType: ChatContextType,
		entityId: string | undefined,
		context: AssembledContext
	): Promise<void> {
		const cacheKey = `${contextType}:${entityId || 'null'}`;

		const cacheData = {
			user_id: userId,
			cache_key: cacheKey,
			context_type: contextType,
			entity_id: entityId,
			abbreviated_context: {
				layers: context.layers,
				metadata: {
					totalTokens: context.totalTokens,
					utilization: context.utilization
				}
			},
			abbreviated_tokens: context.totalTokens,
			full_context_available: true,
			expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
		};

		await this.supabase.from('chat_context_cache').upsert(cacheData, {
			onConflict: 'user_id,cache_key'
		});
	}

	/**
	 * Get cached context if available
	 */
	async getCachedContext(
		userId: string,
		contextType: ChatContextType,
		entityId?: string
	): Promise<AssembledContext | null> {
		const cacheKey = `${contextType}:${entityId || 'null'}`;

		const { data } = await this.supabase
			.from('chat_context_cache')
			.select('*')
			.eq('user_id', userId)
			.eq('cache_key', cacheKey)
			.gt('expires_at', new Date().toISOString())
			.single();

		if (!data) return null;

		// Update access tracking
		await this.supabase
			.from('chat_context_cache')
			.update({
				accessed_at: new Date().toISOString(),
				access_count: data.access_count + 1
			})
			.eq('id', data.id);

		const cachedData = data.abbreviated_context as any;
		return {
			layers: cachedData.layers,
			totalTokens: cachedData.metadata.totalTokens,
			truncatedLayers: [],
			utilization: cachedData.metadata.utilization,
			systemPrompt: cachedData.layers.find((l: any) => l.type === 'system')?.content || '',
			userContext: cachedData.layers.find((l: any) => l.type === 'user')?.content,
			locationContext:
				cachedData.layers.find((l: any) => l.type === 'location')?.content || '',
			relatedData: cachedData.layers.find((l: any) => l.type === 'related')?.content
		};
	}

	/**
	 * Clean expired context cache entries
	 */
	async cleanExpiredCache(): Promise<void> {
		await this.supabase
			.from('chat_context_cache')
			.delete()
			.lt('expires_at', new Date().toISOString());
	}
}
