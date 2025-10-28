// apps/web/src/lib/chat/tool-executor.ts
/**
 * Chat Tool Executor - API-Based Pattern
 *
 * This module executes tool calls for the chat system using existing API endpoints
 * instead of direct database access. This ensures consistent business logic,
 * validation, and side effects (especially for calendar operations).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ChatToolCall,
	ChatToolResult,
	AbbreviatedTask,
	AbbreviatedProject,
	AbbreviatedNote,
	AbbreviatedBrainDump,
	AbbreviatedCalendarEvent,
	ListTasksArgs,
	SearchProjectsArgs,
	SearchNotesArgs,
	SearchBrainDumpsArgs,
	GetTaskDetailsArgs,
	GetProjectDetailsArgs,
	GetNoteDetailsArgs,
	GetBrainDumpDetailsArgs,
	CreateTaskArgs,
	UpdateTaskArgs,
	UpdateProjectContextArgs,
	CreateNoteArgs,
	CreateBrainDumpArgs,
	GetCalendarEventsArgs,
	FindAvailableSlotsArgs,
	ScheduleTaskArgs,
	UpdateCalendarEventArgs,
	DeleteCalendarEventArgs,
	GetTaskCalendarEventsArgs,
	CheckTaskHasCalendarEventArgs,
	UpdateOrScheduleTaskArgs
} from '@buildos/shared-types';
import { CalendarService } from '$lib/services/calendar-service';
import { getToolCategory } from './tools.config';

export class ChatToolExecutor {
	private calendarService: CalendarService;
	private baseUrl: string = ''; // Will be set based on environment

	constructor(
		private supabase: SupabaseClient,
		private userId: string
	) {
		this.calendarService = new CalendarService(supabase);
		// In browser context, we can use relative URLs
		if (typeof window !== 'undefined') {
			this.baseUrl = window.location.origin;
		}
	}

	/**
	 * Get authentication headers for API requests
	 */
	private async getAuthHeaders(): Promise<HeadersInit> {
		const {
			data: { session }
		} = await this.supabase.auth.getSession();

		return {
			'Content-Type': 'application/json',
			Authorization: session?.access_token ? `Bearer ${session.access_token}` : ''
		};
	}

	/**
	 * Make authenticated API request
	 */
	private async apiRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
		const headers = await this.getAuthHeaders();

		const response = await fetch(`${this.baseUrl}${path}`, {
			...options,
			headers: {
				...headers,
				...(options.headers || {})
			}
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`API request failed: ${response.statusText} - ${error}`);
		}

		return response.json();
	}

	/**
	 * Execute a tool call and return the result
	 */
	async execute(toolCall: ChatToolCall): Promise<ChatToolResult> {
		const startTime = Date.now();

		try {
			// Parse arguments from JSON string
			const args = JSON.parse(toolCall.function.arguments);
			let result: any;

			// Execute based on tool name
			switch (toolCall.function.name) {
				// ========================================
				// LIST/SEARCH OPERATIONS (Abbreviated)
				// ========================================

				case 'list_tasks':
					result = await this.listTasksAbbreviated(args as ListTasksArgs);
					break;

				case 'search_projects':
					result = await this.searchProjectsAbbreviated(args as SearchProjectsArgs);
					break;

				case 'search_notes':
					result = await this.searchNotesAbbreviated(args as SearchNotesArgs);
					break;

				case 'search_brain_dumps':
					result = await this.searchBrainDumpsAbbreviated(args as SearchBrainDumpsArgs);
					break;

				// ========================================
				// DETAIL OPERATIONS (Complete)
				// ========================================

				case 'get_task_details':
					result = await this.getTaskComplete(args as GetTaskDetailsArgs);
					break;

				case 'get_project_details':
					result = await this.getProjectComplete(args as GetProjectDetailsArgs);
					break;

				case 'get_note_details':
					result = await this.getNoteComplete(args as GetNoteDetailsArgs);
					break;

				case 'get_brain_dump_details':
					result = await this.getBrainDumpComplete(args as GetBrainDumpDetailsArgs);
					break;

				// ========================================
				// ACTION OPERATIONS (Mutations via API)
				// ========================================

				case 'create_task':
					result = await this.createTaskViaAPI(args as CreateTaskArgs);
					break;

				case 'update_task':
					result = await this.updateTaskViaAPI(args as UpdateTaskArgs);
					break;

				case 'update_project_context':
					result = await this.updateProjectContext(args as UpdateProjectContextArgs);
					break;

				case 'create_note':
					result = await this.createNoteViaAPI(args as CreateNoteArgs);
					break;

				case 'create_brain_dump':
					result = await this.createBrainDump(args as CreateBrainDumpArgs);
					break;

				// ========================================
				// CALENDAR OPERATIONS
				// ========================================

				case 'get_calendar_events':
					result = await this.getCalendarEventsAbbreviated(args as GetCalendarEventsArgs);
					break;

				case 'find_available_slots':
					result = await this.findAvailableSlots(args as FindAvailableSlotsArgs);
					break;

				case 'schedule_task':
					result = await this.scheduleTask(args as ScheduleTaskArgs);
					break;

				case 'update_calendar_event':
					result = await this.updateCalendarEvent(args as UpdateCalendarEventArgs);
					break;

				case 'delete_calendar_event':
					result = await this.deleteCalendarEvent(args as DeleteCalendarEventArgs);
					break;

				// ========================================
				// TASK-CALENDAR MANAGEMENT OPERATIONS
				// ========================================

				case 'get_task_calendar_events':
					result = await this.getTaskCalendarEvents(args as GetTaskCalendarEventsArgs);
					break;

				case 'check_task_has_calendar_event':
					result = await this.checkTaskHasCalendarEvent(
						args as CheckTaskHasCalendarEventArgs
					);
					break;

				case 'update_or_schedule_task':
					result = await this.updateOrScheduleTask(args as UpdateOrScheduleTaskArgs);
					break;

				default:
					throw new Error(`Unknown tool: ${toolCall.function.name}`);
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
		} catch (error: any) {
			const duration = Date.now() - startTime;

			// Special handling for calendar disconnection
			if (
				error.message?.includes('requires reconnection') ||
				error.code === 'GOOGLE_AUTH_EXPIRED'
			) {
				return {
					tool_call_id: toolCall.id,
					result: null,
					success: false,
					error: 'Calendar connection required. Please reconnect your Google Calendar in settings.',
					requires_user_action: true
				};
			}

			// Log failed execution
			await this.logToolExecution(toolCall, null, duration, false, error.message);

			return {
				tool_call_id: toolCall.id,
				result: null,
				success: false,
				error: error.message || 'Tool execution failed'
			};
		}
	}

	// ========================================
	// LIST/SEARCH OPERATIONS (Keep existing DB queries for now)
	// ========================================

	private async listTasksAbbreviated(args: ListTasksArgs): Promise<{
		tasks: AbbreviatedTask[];
		total: number;
		has_more: boolean;
		message: string;
	}> {
		let query = this.supabase.from('tasks').select(
			`
				id, title, status, priority, start_date, duration_minutes,
				description, details, task_type, recurrence_pattern,
				project:projects!inner(name),
				subtasks:tasks!parent_task_id(id),
				dependencies
			`,
			{ count: 'exact' }
		);

		// Apply filters
		if (args.project_id) {
			query = query.eq('project_id', args.project_id);
		}

		if (args.status && args.status.length > 0) {
			query = query.in('status', args.status);
		}

		if (args.priority && args.priority.length > 0) {
			query = query.in('priority', args.priority);
		}

		if (args.has_date === true) {
			query = query.not('start_date', 'is', null);
		}

		// Sort
		const sortBy = args.sort_by || 'priority';
		if (sortBy === 'priority') {
			query = query.order('priority', { ascending: false });
			query = query.order('start_date', { ascending: true });
		} else if (sortBy === 'start_date') {
			query = query.order('start_date', { ascending: true });
			query = query.order('priority', { ascending: false });
		} else {
			query = query.order('created_at', { ascending: false });
		}

		// Limit
		const limit = Math.min(args.limit || 20, 50);
		query = query.limit(limit);

		const { data: tasks, count, error } = await query;

		if (error) throw error;

		// Convert to abbreviated format
		const abbreviatedTasks: AbbreviatedTask[] = (tasks || []).map((t) => ({
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
			project_name: (t.project as any)?.name,
			is_overdue: this.isOverdue(t.start_date, t.status)
		}));

		const total = count || 0;
		const hasMore = total > limit;

		return {
			tasks: abbreviatedTasks,
			total,
			has_more: hasMore,
			message: `Showing ${abbreviatedTasks.length} of ${total} tasks. Use get_task_details(task_id) for full information.`
		};
	}

	private async searchProjectsAbbreviated(args: SearchProjectsArgs): Promise<{
		projects: AbbreviatedProject[];
		total: number;
		message: string;
	}> {
		let query = this.supabase.from('projects').select(
			`
				id, name, slug, status, start_date, end_date,
				description, executive_summary, tags, context,
				tasks!inner(id, status),
				phases:project_phases(id),
				notes(id),
				brain_dumps(id)
			`,
			{ count: 'exact' }
		);

		// Apply search
		if (args.query) {
			query = query.or(
				`name.ilike.%${args.query}%,description.ilike.%${args.query}%,tags.cs.{${args.query}}`
			);
		}

		// Apply status filter
		if (args.status) {
			query = query.eq('status', args.status);
		}

		// Apply active tasks filter
		if (args.has_active_tasks) {
			query = query.in('tasks.status', ['in_progress', 'backlog', 'blocked']);
		}

		// Limit
		const limit = Math.min(args.limit || 10, 20);
		query = query.limit(limit);

		const { data: projects, count, error } = await query;

		if (error) throw error;

		// Convert to abbreviated format
		const abbreviatedProjects: AbbreviatedProject[] = (projects || []).map((p) => {
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
			projects: abbreviatedProjects,
			total: count || 0,
			message: `Found ${abbreviatedProjects.length} projects. Use get_project_details(project_id) for full context.`
		};
	}

	private async searchNotesAbbreviated(args: SearchNotesArgs): Promise<{
		notes: AbbreviatedNote[];
		total: number;
		message: string;
	}> {
		let query = this.supabase.from('notes').select(
			`
				id, title, content, category, tags, created_at,
				project:projects(name)
			`,
			{ count: 'exact' }
		);

		// Apply search
		if (args.query) {
			query = query.or(`title.ilike.%${args.query}%,content.ilike.%${args.query}%`);
		}

		// Apply filters
		if (args.project_id) {
			query = query.eq('project_id', args.project_id);
		}

		if (args.category) {
			query = query.eq('category', args.category);
		}

		// Order by recency
		query = query.order('created_at', { ascending: false });

		// Limit
		const limit = Math.min(args.limit || 10, 20);
		query = query.limit(limit);

		const { data: notes, count, error } = await query;

		if (error) throw error;

		// Convert to abbreviated format
		const abbreviatedNotes: AbbreviatedNote[] = (notes || []).map((n) => ({
			id: n.id,
			title: n.title,
			category: n.category,
			content_preview: n.content?.substring(0, 200) || '',
			tags: n.tags,
			created_at: n.created_at,
			project_name: n.project?.name
		}));

		return {
			notes: abbreviatedNotes,
			total: count || 0,
			message: `Found ${abbreviatedNotes.length} notes. Use get_note_details(note_id) for full content.`
		};
	}

	private async searchBrainDumpsAbbreviated(args: SearchBrainDumpsArgs): Promise<{
		brain_dumps: AbbreviatedBrainDump[];
		total: number;
		message: string;
	}> {
		let query = this.supabase.from('brain_dumps').select(
			`
				id, title, ai_summary, status, created_at,
				project:projects(name),
				operations:brain_dump_operations(id)
			`,
			{ count: 'exact' }
		);

		// Apply search
		if (args.query) {
			query = query.or(`content.ilike.%${args.query}%,ai_summary.ilike.%${args.query}%`);
		}

		// Apply filters
		if (args.project_id) {
			query = query.eq('project_id', args.project_id);
		}

		if (args.status) {
			query = query.eq('status', args.status);
		}

		// Order by recency
		query = query.order('created_at', { ascending: false });

		// Limit
		const limit = Math.min(args.limit || 10, 20);
		query = query.limit(limit);

		const { data: dumps, count, error } = await query;

		if (error) throw error;

		// Convert to abbreviated format
		const abbreviatedDumps: AbbreviatedBrainDump[] = (dumps || []).map((d) => ({
			id: d.id,
			title: d.title,
			ai_summary: d.ai_summary,
			status: d.status,
			created_at: d.created_at,
			project_name: d.project?.name,
			operation_count: d.operations?.length || 0
		}));

		return {
			brain_dumps: abbreviatedDumps,
			total: count || 0,
			message: `Found ${abbreviatedDumps.length} brain dumps. Use get_brain_dump_details(brain_dump_id) for full content.`
		};
	}

	// ========================================
	// DETAIL OPERATIONS (Complete)
	// ========================================

	private async getTaskComplete(args: GetTaskDetailsArgs): Promise<{
		task: any;
		message: string;
	}> {
		let query = this.supabase
			.from('tasks')
			.select(
				`
				*,
				project:projects(*),
				parent:tasks!parent_task_id(id, title, status),
				task_calendar_events(*)
			`
			)
			.eq('id', args.task_id)
			.single();

		const { data: task, error } = await query;

		if (error) throw error;
		if (!task) throw new Error('Task not found');

		// Get subtasks if requested
		let subtasks = [];
		if (args.include_subtasks) {
			const { data } = await this.supabase
				.from('tasks')
				.select('*')
				.eq('parent_task_id', args.task_id)
				.order('order', { ascending: true });

			subtasks = data || [];
		}

		// Get project context if requested
		let projectContext = null;
		if (args.include_project_context && task.project_id) {
			const { data: project } = await this.supabase
				.from('projects')
				.select(
					'context, executive_summary, core_problem, target_audience, success_metrics'
				)
				.eq('id', task.project_id)
				.single();

			projectContext = project;
		}

		return {
			task: {
				...task,
				subtasks,
				project_context: projectContext
			},
			message: 'Complete task details loaded including all relationships and full content.'
		};
	}

	private async getProjectComplete(args: GetProjectDetailsArgs): Promise<{
		project: any;
		message: string;
	}> {
		const { data: project, error } = await this.supabase
			.from('projects')
			.select('*')
			.eq('id', args.project_id)
			.single();

		if (error) throw error;
		if (!project) throw new Error('Project not found');

		// Get phases if requested
		let phases: any[] = [];
		if (args.include_phases) {
			const { data } = await this.supabase
				.from('project_phases')
				.select('*')
				.eq('project_id', args.project_id)
				.order('order', { ascending: true });

			phases = data || [];
		}

		// Get tasks if requested (abbreviated)
		let tasks: any[] = [];
		if (args.include_tasks) {
			const { data } = await this.supabase
				.from('tasks')
				.select(
					`
					id, title, status, priority, start_date,
					description, phase_id
				`
				)
				.eq('project_id', args.project_id)
				.order('priority', { ascending: false })
				.limit(50);

			tasks = (data || []).map((t) => ({
				...t,
				description_preview: t.description?.substring(0, 100) || ''
			}));
		}

		// Get notes if requested (abbreviated)
		let notes: any[] = [];
		if (args.include_notes) {
			const { data } = await this.supabase
				.from('notes')
				.select('id, title, content, category, created_at')
				.eq('project_id', args.project_id)
				.order('created_at', { ascending: false })
				.limit(10);

			notes = (data || []).map((n) => ({
				...n,
				content_preview: n.content?.substring(0, 200) || ''
			}));
		}

		// Get brain dumps if requested
		let brainDumps: any[] = [];
		if (args.include_brain_dumps) {
			const { data } = await this.supabase
				.from('brain_dumps')
				.select('id, title, ai_summary, status, created_at')
				.eq('project_id', args.project_id)
				.order('created_at', { ascending: false })
				.limit(10);

			brainDumps = data || [];
		}

		return {
			project: {
				...project,
				phases,
				tasks,
				notes,
				brain_dumps: brainDumps
			},
			message: 'Complete project details loaded with all requested relationships.'
		};
	}

	private async getNoteComplete(args: GetNoteDetailsArgs): Promise<{
		note: any;
		message: string;
	}> {
		const { data: note, error } = await this.supabase
			.from('notes')
			.select(
				`
				*,
				project:projects(id, name, slug)
			`
			)
			.eq('id', args.note_id)
			.single();

		if (error) throw error;
		if (!note) throw new Error('Note not found');

		return {
			note,
			message: 'Complete note content loaded.'
		};
	}

	private async getBrainDumpComplete(args: GetBrainDumpDetailsArgs): Promise<{
		brain_dump: any;
		message: string;
	}> {
		const { data: dump, error } = await this.supabase
			.from('brain_dumps')
			.select(
				`
				*,
				project:projects(id, name, slug),
				operations:brain_dump_operations(*)
			`
			)
			.eq('id', args.brain_dump_id)
			.single();

		if (error) throw error;
		if (!dump) throw new Error('Brain dump not found');

		return {
			brain_dump: dump,
			message: 'Complete brain dump loaded with all extracted operations.'
		};
	}

	// ========================================
	// ACTION OPERATIONS (Using API Endpoints)
	// ========================================

	private async createTaskViaAPI(args: CreateTaskArgs): Promise<{
		task: any;
		message: string;
	}> {
		// Get the project_id (required for API endpoint)
		if (!args.project_id) {
			throw new Error('Project ID is required to create a task');
		}

		const taskData = {
			title: args.title,
			description: args.description || null,
			priority: args.priority || 'medium',
			task_type: args.task_type || 'one_off',
			duration_minutes: args.duration_minutes || 60,
			start_date: args.start_date || null,
			parent_task_id: args.parent_task_id || null
		};

		// Call API endpoint
		const result = await this.apiRequest(`/api/projects/${args.project_id}/tasks`, {
			method: 'POST',
			body: JSON.stringify(taskData)
		});

		return {
			task: result.task,
			message: `Created task "${result.task.title}"${result.task.project ? ` in project ${result.task.project.name}` : ''}`
		};
	}

	private async updateTaskViaAPI(args: UpdateTaskArgs): Promise<{
		task: any;
		message: string;
	}> {
		// First get the task to find its project_id
		const { data: existingTask, error: fetchError } = await this.supabase
			.from('tasks')
			.select('project_id, title')
			.eq('id', args.task_id)
			.single();

		if (fetchError || !existingTask) {
			throw new Error('Task not found');
		}

		// Prepare update payload
		const updates: any = { ...args.updates };

		// Add calendar sync flag if updating start_date
		if (args.updates.start_date) {
			updates.addTaskToCalendar = true;
		}

		// Call API endpoint
		const result = await this.apiRequest(
			`/api/projects/${existingTask.project_id}/tasks/${args.task_id}`,
			{
				method: 'PATCH',
				body: JSON.stringify(updates)
			}
		);

		return {
			task: result.task,
			message: `Updated task "${result.task.title}"`
		};
	}

	private async updateProjectContext(args: UpdateProjectContextArgs): Promise<{
		project: any;
		message: string;
	}> {
		// Get current project context
		const { data: project, error: fetchError } = await this.supabase
			.from('projects')
			.select('context')
			.eq('id', args.project_id)
			.eq('user_id', this.userId)
			.single();

		if (fetchError) throw fetchError;
		if (!project) throw new Error('Project not found or unauthorized');

		// Merge context based on strategy
		let newContext: string;
		const currentContext = project.context || '';
		const strategy = args.merge_strategy || 'append';

		switch (strategy) {
			case 'replace':
				newContext = args.context_update;
				break;
			case 'append':
				newContext = currentContext
					? `${currentContext}\n\n${args.context_update}`
					: args.context_update;
				break;
			case 'prepend':
				newContext = currentContext
					? `${args.context_update}\n\n${currentContext}`
					: args.context_update;
				break;
			default:
				newContext = args.context_update;
		}

		// Update project via API endpoint
		const result = await this.apiRequest(`/api/projects/${args.project_id}`, {
			method: 'PATCH',
			body: JSON.stringify({ context: newContext })
		});

		return {
			project: result.project,
			message: `Updated project context using ${strategy} strategy`
		};
	}

	private async createNoteViaAPI(args: CreateNoteArgs): Promise<{
		note: any;
		message: string;
	}> {
		const noteData = {
			title: args.title || null,
			content: args.content,
			project_id: args.project_id || null,
			category: args.category || null,
			tags: args.tags || null
		};

		// Call API endpoint
		const result = await this.apiRequest('/api/notes', {
			method: 'POST',
			body: JSON.stringify(noteData)
		});

		return {
			note: result.note,
			message: `Created note${result.note.title ? ` "${result.note.title}"` : ''}${result.note.project ? ` in project ${result.note.project.name}` : ''}`
		};
	}

	private async createBrainDump(args: CreateBrainDumpArgs): Promise<{
		brain_dump: any;
		message: string;
	}> {
		const dumpData = {
			content: args.content,
			project_id: args.project_id || null,
			status: 'pending',
			user_id: this.userId
		};

		const { data: dump, error } = await this.supabase
			.from('brain_dumps')
			.insert(dumpData)
			.select('id, created_at')
			.single();

		if (error) throw error;

		// Note: Brain dump will be processed asynchronously
		return {
			brain_dump: dump,
			message:
				'Brain dump created and queued for processing. It will be analyzed and converted to tasks shortly.'
		};
	}

	// ========================================
	// CALENDAR OPERATIONS
	// ========================================

	private async getCalendarEventsAbbreviated(args: GetCalendarEventsArgs): Promise<{
		events: AbbreviatedCalendarEvent[];
		total: number;
		message: string;
	}> {
		try {
			// Set defaults
			const timeMin = args.timeMin || new Date().toISOString();
			const timeMax =
				args.timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
			const limit = Math.min(args.limit || 20, 50);

			// Get events from CalendarService
			const response = await this.calendarService.getCalendarEvents(this.userId, {
				timeMin,
				timeMax,
				maxResults: limit
			});

			// Convert to abbreviated format
			const abbreviatedEvents: AbbreviatedCalendarEvent[] = response.events.map((e: any) => ({
				id: e.id,
				summary: e.summary || 'Untitled Event',
				start: e.start?.dateTime || e.start?.date || '',
				end: e.end?.dateTime || e.end?.date || '',
				is_all_day: !e.start?.dateTime,
				has_description: !!e.description,
				has_attendees: e.attendees && e.attendees.length > 0,
				linked_task_id: this.extractTaskIdFromEvent(e)
			}));

			return {
				events: abbreviatedEvents,
				total: abbreviatedEvents.length,
				message: `Showing ${abbreviatedEvents.length} events from ${new Date(timeMin).toLocaleDateString()} to ${new Date(timeMax).toLocaleDateString()}`
			};
		} catch (error: any) {
			if (error.code === 'GOOGLE_AUTH_EXPIRED') {
				throw new Error('Calendar requires reconnection');
			}
			throw error;
		}
	}

	private async findAvailableSlots(args: FindAvailableSlotsArgs): Promise<{
		slots: any[];
		message: string;
	}> {
		try {
			const response = await this.calendarService.findAvailableSlots(this.userId, {
				timeMin: args.timeMin,
				timeMax: args.timeMax,
				duration_minutes: args.duration_minutes || 60,
				preferred_hours: args.preferred_hours
			});

			return {
				slots: response.available_slots,
				message: `Found ${response.available_slots.length} available time slots for ${args.duration_minutes || 60} minute blocks`
			};
		} catch (error: any) {
			if (error.code === 'GOOGLE_AUTH_EXPIRED') {
				throw new Error('Calendar requires reconnection');
			}
			throw error;
		}
	}

	private async scheduleTask(args: ScheduleTaskArgs): Promise<{
		event: any;
		task: any;
		message: string;
	}> {
		try {
			// Get task details
			const { data: task, error: taskError } = await this.supabase
				.from('tasks')
				.select('*, project:projects(name)')
				.eq('id', args.task_id)
				.eq('user_id', this.userId)
				.single();

			if (taskError) throw taskError;
			if (!task) throw new Error('Task not found');

			// Schedule using CalendarService
			const result = await this.calendarService.scheduleTask(this.userId, {
				task_id: args.task_id,
				start_time: args.start_time,
				duration_minutes: args.duration_minutes || task.duration_minutes || 60,
				recurrence_pattern: args.recurrence_pattern
			});

			return {
				event: result,
				task: task,
				message: `Scheduled task "${task.title}" on ${new Date(args.start_time).toLocaleString()}`
			};
		} catch (error: any) {
			if (error.code === 'GOOGLE_AUTH_EXPIRED') {
				throw new Error('Calendar requires reconnection');
			}
			throw error;
		}
	}

	private async updateCalendarEvent(args: UpdateCalendarEventArgs): Promise<{
		event: any;
		message: string;
	}> {
		try {
			const result = await this.calendarService.updateCalendarEvent(this.userId, {
				event_id: args.event_id,
				calendar_id: args.calendar_id || 'primary',
				start_time: args.start_time,
				end_time: args.end_time,
				summary: args.summary,
				description: args.description,
				timeZone: args.timeZone
			});

			return {
				event: result,
				message: 'Calendar event updated successfully'
			};
		} catch (error: any) {
			if (error.code === 'GOOGLE_AUTH_EXPIRED') {
				throw new Error('Calendar requires reconnection');
			}
			throw error;
		}
	}

	private async deleteCalendarEvent(args: DeleteCalendarEventArgs): Promise<{
		success: boolean;
		message: string;
	}> {
		try {
			await this.calendarService.deleteCalendarEvent(this.userId, {
				event_id: args.event_id,
				calendar_id: args.calendar_id || 'primary'
			});

			return {
				success: true,
				message: 'Calendar event deleted successfully'
			};
		} catch (error: any) {
			if (error.code === 'GOOGLE_AUTH_EXPIRED') {
				throw new Error('Calendar requires reconnection');
			}
			throw error;
		}
	}

	// ========================================
	// TASK-CALENDAR MANAGEMENT OPERATIONS
	// ========================================

	private async getTaskCalendarEvents(args: GetTaskCalendarEventsArgs): Promise<{
		events: any[];
		has_events: boolean;
		message: string;
	}> {
		let query = this.supabase
			.from('task_calendar_events')
			.select('*')
			.eq('task_id', args.task_id)
			.eq('user_id', this.userId);

		if (!args.include_deleted) {
			query = query.neq('sync_status', 'deleted');
		}

		const { data: events, error } = await query;

		if (error) throw error;

		return {
			events: events || [],
			has_events: (events?.length || 0) > 0,
			message: events?.length
				? `Task has ${events.length} calendar event(s)`
				: 'Task has no calendar events'
		};
	}

	private async checkTaskHasCalendarEvent(args: CheckTaskHasCalendarEventArgs): Promise<{
		has_event: boolean;
		event?: any;
		message: string;
	}> {
		const { data: event, error } = await this.supabase
			.from('task_calendar_events')
			.select('*')
			.eq('task_id', args.task_id)
			.eq('user_id', this.userId)
			.eq('sync_status', 'synced')
			.single();

		if (error && error.code !== 'PGRST116') {
			// PGRST116 = no rows returned
			throw error;
		}

		return {
			has_event: !!event,
			event: event || undefined,
			message: event
				? `Task is scheduled on calendar (${event.event_start})`
				: 'Task is not scheduled on calendar'
		};
	}

	private async updateOrScheduleTask(args: UpdateOrScheduleTaskArgs): Promise<{
		task: any;
		calendar_event?: any;
		message: string;
	}> {
		const {
			project_id,
			task_id,
			start_time,
			duration_minutes,
			force_recreate,
			recurrence_pattern,
			recurrence_ends,
			timeZone
		} = args;

		// First, check if task has existing calendar events
		const { data: taskEvents } = await this.supabase
			.from('task_calendar_events')
			.select('*')
			.eq('task_id', task_id)
			.eq('sync_status', 'synced')
			.eq('user_id', this.userId);

		// If force_recreate and has events, delete them first
		if (force_recreate && taskEvents?.length) {
			// Delete each event
			for (const event of taskEvents) {
				try {
					await this.calendarService.deleteCalendarEvent(this.userId, {
						event_id: event.calendar_event_id,
						calendar_id: event.calendar_id || 'primary'
					});
				} catch (error) {
					console.error('Failed to delete calendar event:', error);
				}
			}
		}

		// Prepare update payload
		const updates: any = {
			start_date: start_time,
			addTaskToCalendar: true, // This triggers calendar sync
			timeZone
		};

		if (duration_minutes) {
			updates.duration_minutes = duration_minutes;
		}

		if (recurrence_pattern) {
			updates.task_type = 'recurring';
			updates.recurrence_pattern = recurrence_pattern;
			updates.recurrence_ends = recurrence_ends;
		}

		// Update task via API endpoint - handles all calendar logic
		const result = await this.apiRequest(`/api/projects/${project_id}/tasks/${task_id}`, {
			method: 'PATCH',
			body: JSON.stringify(updates)
		});

		return {
			task: result.task,
			calendar_event: result.task?.task_calendar_events?.[0],
			message:
				taskEvents?.length > 0
					? `Updated task schedule and calendar event`
					: `Scheduled task to calendar`
		};
	}

	// ========================================
	// HELPER METHODS
	// ========================================

	/**
	 * Log tool execution for analytics
	 */
	private async logToolExecution(
		toolCall: ChatToolCall,
		result: any,
		duration: number,
		success: boolean,
		errorMessage?: string
	): Promise<void> {
		const category = getToolCategory(toolCall.function.name);

		try {
			await this.supabase.from('chat_tool_executions').insert({
				tool_name: toolCall.function.name,
				tool_category: category,
				arguments: JSON.parse(toolCall.function.arguments),
				result: success ? result : null,
				execution_time_ms: duration,
				success,
				error_message: errorMessage || null,
				user_id: this.userId
			});
		} catch (error) {
			// Log error but don't fail the tool execution
			console.error('Failed to log tool execution:', error);
		}
	}

	/**
	 * Calculate task statistics
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
		return taskDate < today;
	}

	/**
	 * Extract task ID from calendar event description
	 */
	private extractTaskIdFromEvent(event: any): string | undefined {
		if (!event.description) return undefined;
		// Look for BuildOS Task ID in description
		const match = event.description.match(/\[BuildOS Task #([a-f0-9-]+)\]/);
		return match ? match[1] : undefined;
	}
}
