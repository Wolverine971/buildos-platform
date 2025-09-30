// src/lib/services/calendar-analysis.service.ts
import { ApiService, type ServiceResponse } from './base/api-service';
import { CalendarService } from './calendar-service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { OperationsExecutor } from '$lib/utils/operations/operations-executor';
import type { ParsedOperation, ExecutionResult } from '$lib/types/brain-dump';
import dayjs from 'dayjs';
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorLoggerService } from './errorLogger.service';
import { generateSlug } from '$lib/utils/operations/validation-utils';
import {
	getProjectModel,
	getTaskModel,
	generateProjectContextFramework,
	generateDateParsing
} from './prompts/core/prompt-components';

type CalendarAnalysis = Database['public']['Tables']['calendar_analyses']['Row'];
type CalendarProjectSuggestion =
	Database['public']['Tables']['calendar_project_suggestions']['Row'];
type CalendarAnalysisEvent = Database['public']['Tables']['calendar_analysis_events']['Row'];
type CalendarAnalysisPreferences =
	Database['public']['Tables']['calendar_analysis_preferences']['Row'];

interface AnalysisResult {
	analysisId: string;
	suggestions: CalendarProjectSuggestion[];
	eventsAnalyzed: number;
}

interface CalendarEvent {
	id?: string; // Make id optional to match CalendarService type
	summary?: string;
	description?: string;
	start?: {
		dateTime?: string;
		date?: string;
	};
	end?: {
		dateTime?: string;
		date?: string;
	};
	attendees?: Array<{
		email: string;
		self?: boolean;
		organizer?: boolean;
		responseStatus?: string;
	}>;
	organizer?: {
		email: string;
		self?: boolean;
	};
	recurringEventId?: string;
	status?: string;
	location?: string;
}

interface ProjectSuggestion {
	// Project fields matching BuildOS data model
	name: string; // Required project name
	slug: string; // Required slug generated from name
	description: string; // Project description
	context: string; // Rich markdown context following BuildOS framework
	executive_summary: string; // Executive summary <500 chars
	status: 'active' | 'paused' | 'completed' | 'archived';
	start_date: string; // YYYY-MM-DD format
	end_date?: string; // YYYY-MM-DD format (optional)
	tags: string[];

	// Calendar analysis specific fields
	event_ids: string[];
	confidence: number;
	reasoning: string;
	keywords: string[];

	// Suggested tasks following BuildOS task model
	suggested_tasks?: Array<{
		title: string; // Required, max 255 chars
		description: string;
		details?: string; // Comprehensive specifics
		status: 'backlog' | 'in_progress' | 'done' | 'blocked';
		priority: 'low' | 'medium' | 'high';
		task_type: 'one_off' | 'recurring';
		duration_minutes?: number;
		start_date?: string; // YYYY-MM-DDTHH:MM:SS for scheduling
		recurrence_pattern?:
			| 'daily'
			| 'weekdays'
			| 'weekly'
			| 'biweekly'
			| 'monthly'
			| 'quarterly'
			| 'yearly';
		recurrence_ends?: string; // YYYY-MM-DD
		event_id?: string; // Link to calendar event
		tags?: string[];
	}>;
}

// Constants
const DEFAULT_CONFIDENCE_THRESHOLD = 0.4; // Lowered from 0.6 for more suggestions
const PREFERENCES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const DEBUG_LOGGING = true; // Enable debug logging for calendar analysis

export class CalendarAnalysisService extends ApiService {
	private static instance: CalendarAnalysisService;
	private supabase: SupabaseClient<Database>;
	private calendarService: CalendarService;
	private llmService: SmartLLMService;
	public errorLogger: ErrorLoggerService;

	private constructor(supabase: SupabaseClient<Database>) {
		super('/api/calendar/analysis');
		this.supabase = supabase;
		this.calendarService = new CalendarService(supabase);
		this.llmService = new SmartLLMService({ supabase });
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
	}

	public static getInstance(supabase: SupabaseClient<Database>): CalendarAnalysisService {
		if (!this.instance) {
			this.instance = new CalendarAnalysisService(supabase);
		}
		return this.instance;
	}

	/**
	 * Analyze a user's calendar and suggest projects
	 */
	async analyzeUserCalendar(
		userId: string,
		options: {
			daysBack?: number;
			daysForward?: number;
			calendarsToAnalyze?: string[];
		} = {}
	): Promise<AnalysisResult> {
		const { daysBack = 30, daysForward = 60 } = options;

		// Create analysis record
		const analysis = await this.createAnalysisRecord(userId, {
			date_range_start: dayjs().subtract(daysBack, 'days').format('YYYY-MM-DD'),
			date_range_end: dayjs().add(daysForward, 'days').format('YYYY-MM-DD'),
			calendars_analyzed: options.calendarsToAnalyze || []
		});

		try {
			// Fetch calendar events using the existing CalendarService
			const eventsResponse = await this.calendarService.getCalendarEvents(userId, {
				timeMin: dayjs().subtract(daysBack, 'days').toISOString(),
				timeMax: dayjs().add(daysForward, 'days').toISOString(),
				maxResults: 300,
				calendarId: 'primary' // Start with primary calendar
			});

			// Check if we got events - the response directly contains events array
			if (!eventsResponse.events || eventsResponse.events.length === 0) {
				throw new Error('No calendar events found');
			}

			const events = eventsResponse.events;

			if (DEBUG_LOGGING) {
				console.log(`[Calendar Analysis] Total events fetched: ${events.length}`);
				console.log(
					`[Calendar Analysis] Date range: ${daysBack} days back, ${daysForward} days forward`
				);
			}

			// Filter out declined events and all-day personal events
			const relevantEvents = this.filterRelevantEvents(events);

			if (DEBUG_LOGGING) {
				console.log(`[Calendar Analysis] Events after filtering: ${relevantEvents.length}`);
				console.log(
					`[Calendar Analysis] Events excluded: ${events.length - relevantEvents.length}`
				);
			}

			// Store event snapshots for future reference
			await this.storeAnalysisEvents(analysis.id, relevantEvents);

			// Send to LLM for analysis
			const suggestions = await this.analyzeEventsWithAI({events:relevantEvents, userId});

			if (DEBUG_LOGGING) {
				console.log(`[Calendar Analysis] AI generated ${suggestions.length} suggestions`);
				console.log(
					`[Calendar Analysis] Confidence scores:`,
					suggestions.map((s) => s.confidence)
				);
			}

			// Store suggestions in database
			await this.storeSuggestions(analysis.id, userId, suggestions);

			// Get the stored suggestions with full data
			const storedSuggestions = await this.getSuggestionsForAnalysis(analysis.id);

			// Update analysis record
			await this.updateAnalysisRecord(analysis.id, {
				status: 'completed',
				events_analyzed: relevantEvents.length,
				events_excluded: events.length - relevantEvents.length,
				projects_suggested: suggestions.length,
				confidence_average:
					suggestions.length > 0
						? suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length
						: null,
				completed_at: new Date().toISOString()
			});

			return {
				analysisId: analysis.id,
				suggestions: storedSuggestions,
				eventsAnalyzed: relevantEvents.length
			};
		} catch (error) {
			await this.updateAnalysisRecord(analysis.id, {
				status: 'failed',
				error_message: error instanceof Error ? error.message : 'Unknown error'
			});

			this.errorLogger.logError(error, {
				userId,
				metadata: {
					operation: 'calendar_analysis',
					analysisId: analysis.id
				}
			});

			throw error;
		}
	}

	/**
	 * Filter out irrelevant events
	 */
	private filterRelevantEvents(events: CalendarEvent[]): CalendarEvent[] {
		return events.filter((event) => {
			// Skip declined events
			const selfAttendee = event.attendees?.find((a) => a.self);
			if (selfAttendee?.responseStatus === 'declined') {
				return false;
			}

			// Skip all-day events that look personal (basic heuristic)
			const isAllDay = !event.start?.dateTime;
			if (isAllDay) {
				const title = (event.summary || '').toLowerCase();
				const personalKeywords = [
					'birthday',
					'anniversary',
					'vacation',
					'holiday',
					'pto',
					'out of office',
					'ooo'
				];
				if (personalKeywords.some((keyword) => title.includes(keyword))) {
					return false;
				}
			}

			// Skip events with no title
			if (!event.summary || event.summary.trim() === '') {
				return false;
			}

			// Skip cancelled events
			if (event.status === 'cancelled') {
				return false;
			}

			return true;
		});
	}

	/**
	 * Analyze events with AI to detect project patterns with confidence threshold
	 */
	private async analyzeEventsWithAI({events, minConfidence = DEFAULT_CONFIDENCE_THRESHOLD, userId}:{
		events: CalendarEvent[],
		minConfidence?: number,
		userId: string
	}
	): Promise<ProjectSuggestion[]> {
		if (events.length === 0) {
			return [];
		}

		const today = new Date().toISOString().split('T')[0];

		const prompt = `
A user has asked you to analyze their google calendar and suggest project based off the events.

Your role is to act like a project organizer and look at the google calendar events and suggest projects with associated tasks.

You will be returning a JSON response of detailed "suggestions" array. See **Output Requirements** for correct JSON schema formatting.

## Project Detection Criteria

Identify projects based on:
- Recurring meetings with similar titles/attendees (likely ongoing projects)
- Clusters of related events (project milestones, reviews, planning sessions)
- Events with project-indicating keywords (sprint, launch, milestone, review, kickoff, deadline, sync, standup, retrospective, planning, design, implementation)
- Series of events building toward a goal
- Events with multiple attendees working on the same topic
- Any pattern suggesting coordinated work effort

Ignore:
- One-off personal events (lunch, coffee, dentist, doctor, vacation)
- Company all-hands or general meetings without specific project focus
- Events marked as declined or tentative
- Generic focus/work blocks without specific context
- Social events without work context

## Data Models

### Project Model (REQUIRED structure):
${getProjectModel(true)}

### Task Model (REQUIRED structure):
${getTaskModel({ includeRecurring: true, includeProjectRef: false })}

${generateProjectContextFramework('condensed')}


## Calendar Events to Analyze:
${JSON.stringify(
	events.map((e) => ({
		id: e.id || 'unknown',
		title: e.summary,
		description: e.description?.substring(0, 500), // Increased limit for better context
		start: e.start?.dateTime || e.start?.date,
		end: e.end?.dateTime || e.end?.date,
		attendees: e.attendees?.map((a) => a.email),
		organizer: e.organizer?.email,
		recurring: !!e.recurringEventId,
		status: e.status,
		location: e.location
	})),
	null,
	2
)}

## Output Requirements- JSON schema

Return a JSON object with a "suggestions" array. Each suggestion must follow this EXACT structure:

{
  "suggestions": [
    {
      // Project fields (all required)
      "name": "Clear, action-oriented project name",
      "slug": "generated-from-name-lowercase-hyphens",
      "description": "2-3 sentence description of what this project is about",
      "context": "Comprehensive markdown following the BuildOS context framework. Include all relevant information about the project's purpose, vision, scope, approach, stakeholders, timelines, and any other relevant context extracted from the calendar events. This should be rich and detailed.",
      "executive_summary": "Brief executive summary under 500 characters",
      "status": "active", // Default to active for new projects
      "start_date": "YYYY-MM-DD", // Earliest relevant event date or today
      "end_date": "YYYY-MM-DD or null", // Latest relevant event date or null if ongoing
      "tags": ["relevant", "tags", "from", "events"],

      // Calendar analysis metadata (all required)
      "event_ids": ["array", "of", "event", "ids"],
      "confidence": 0.7, // 0-1 score, must be >= ${minConfidence}
      "reasoning": "Clear explanation of why these events suggest a project",
      "keywords": ["detected", "keywords", "that", "indicated", "project"],

      // Suggested tasks (optional but recommended)
      "suggested_tasks": [
        {
          "title": "Specific task title (max 255 chars)",
          "description": "Brief task description",
          "details": "Comprehensive details about the task from event context",
          "status": "backlog",
          "priority": "medium", // low|medium|high based on event importance
          "task_type": "one_off", // or "recurring" for repeating events
          "duration_minutes": 60, // Estimate based on event duration
          "start_date": "YYYY-MM-DDTHH:MM:SS", // From event time, null if no specific time
          "recurrence_pattern": "weekly", // Only if task_type is "recurring"
          "recurrence_ends": "YYYY-MM-DD", // Only if recurring
          "event_id": "linked-calendar-event-id",
          "tags": ["optional", "task", "tags"]
        }
      ]
    }
  ]
}

IMPORTANT:
- Only suggest projects with confidence >= ${minConfidence}
- Generate meaningful, actionable project names (not just event titles)
- Create rich, comprehensive context using the BuildOS framework
- Extract specific, actionable tasks from event details
- Use proper date formats (YYYY-MM-DD for dates, YYYY-MM-DDTHH:MM:SS for timestamps)
- Ensure all required fields are present
- The response must be valid JSON that can be parsed
`;

		try {
			if (DEBUG_LOGGING) {
				console.log(
					`[Calendar Analysis] Sending ${events.length} events to AI for analysis`
				);
				console.log(`[Calendar Analysis] Minimum confidence threshold: ${minConfidence}`);
			}

			// Use SmartLLMService's getJSONResponse method for better type safety and model routing
			const response = await this.llmService.getJSONResponse<{
				suggestions: ProjectSuggestion[];
			}>({
				systemPrompt:
					'You are an AI assistant specialized in analyzing calendar events to identify potential projects. Always respond with valid JSON following the specified schema.',
				userPrompt: prompt,
				userId, // System-level operation
				profile: 'balanced', // Use balanced profile for good accuracy/speed tradeoff
				temperature: 0.3,
				validation: {
					retryOnParseError: true,
					validateSchema: true,
					maxRetries: 2
				}
			});

			// Filter by minimum confidence score
			const suggestions = response.suggestions || response.projects || [];

			if (DEBUG_LOGGING) {
				console.log(`[Calendar Analysis] Raw suggestions from AI: ${suggestions.length}`);
				if (suggestions.length > 0) {
					console.log(
						`[Calendar Analysis] Raw confidence scores:`,
						suggestions.map((s: ProjectSuggestion) => s.confidence)
					);
				}
			}

			const filtered = suggestions.filter(
				(s: ProjectSuggestion) => s.confidence >= minConfidence
			);

			if (DEBUG_LOGGING) {
				console.log(
					`[Calendar Analysis] Suggestions after confidence filter (>= ${minConfidence}): ${filtered.length}`
				);
			}

			return filtered;
		} catch (error) {
			this.errorLogger.logError(error, {
				userId: 'system',
				metadata: {
					operation: 'calendar_analysis_ai',
					eventCount: events.length
				}
			});
			return [];
		}
	}

	/**
	 * Accept a suggestion and create a project
	 */
	async acceptSuggestion(
		suggestionId: string,
		userId: string,
		modifications?: {
			name?: string;
			description?: string;
			includeTasks?: boolean;
			taskSelections?: Record<string, boolean>; // Which tasks to include
			taskModifications?: Record<number, any>; // Task edits
		}
	): Promise<ServiceResponse<any>> {
		try {
			const suggestion = await this.getSuggestion(suggestionId, userId);
			if (!suggestion) {
				throw new Error('Suggestion not found');
			}

			// Extract additional metadata from event_patterns if available
			const eventPatterns = suggestion.event_patterns as any;
			const executiveSummary = eventPatterns?.executive_summary;
			const startDate = eventPatterns?.start_date;
			const endDate = eventPatterns?.end_date;
			const tags = eventPatterns?.tags || [];

			// Generate operations using existing pattern
			const projectName = modifications?.name || suggestion.suggested_name;
			const operations: ParsedOperation[] = [
				{
					id: `calendar-project-${suggestionId}`,
					operation: 'create' as const,
					table: 'projects' as const,
					ref: 'project-0', // Reference for tasks to use
					data: {
						name: projectName,
						slug: generateSlug(projectName), // Explicitly generate slug
						description: modifications?.description || suggestion.suggested_description,
						context: suggestion.suggested_context,
						executive_summary: executiveSummary,
						status: 'active',
						start_date: startDate || new Date().toISOString().split('T')[0],
						end_date: endDate,
						tags: tags,
						source: 'calendar_analysis',
						source_metadata: {
							analysis_id: suggestion.analysis_id,
							suggestion_id: suggestion.id,
							event_ids: suggestion.calendar_event_ids,
							confidence: suggestion.confidence_score,
							detected_keywords: suggestion.detected_keywords
						}
					},
					enabled: true
				}
			];

			// Add task operations if requested and tasks exist
			if (modifications?.includeTasks !== false && suggestion.suggested_tasks) {
				// Safely handle suggested_tasks which might be JSON or null
				const tasksData = suggestion.suggested_tasks;
				const tasks = tasksData && Array.isArray(tasksData) ? tasksData : [];
				const today = new Date();
				today.setHours(0, 0, 0, 0);

				operations.push(
					...tasks
						.map((task: any, index: number) => {
							// Check if task is selected
							const taskKey = `${suggestionId}-${index}`;
							if (
								modifications?.taskSelections &&
								modifications.taskSelections[taskKey] === false
							) {
								return null; // Skip unselected tasks
							}

							// Apply task modifications if provided
							const modifiedTask = modifications?.taskModifications?.[index]
								? { ...task, ...modifications.taskModifications[index] }
								: task;

							// Filter out past one-time events and handle rescheduling
							let rescheduledFromPast = false;
							if (modifiedTask.task_type === 'one_off' && modifiedTask.start_date) {
								const taskDate = new Date(modifiedTask.start_date);
								if (taskDate < today) {
									// Reschedule to today for one-off tasks
									modifiedTask.start_date =
										today.toISOString().split('T')[0] +
										'T' +
										(modifiedTask.start_date.includes('T')
											? modifiedTask.start_date.split('T')[1]
											: '09:00:00');
									rescheduledFromPast = true;
								}
							}

							return {
								id: `calendar-task-${suggestionId}-${index}`,
								operation: 'create' as const,
								table: 'tasks' as const,
								data: {
									title: modifiedTask.title || 'Untitled Task',
									description: modifiedTask.description || '',
									details: rescheduledFromPast
										? `${modifiedTask.details || ''}\n\n⚠️ Note: This task was originally scheduled for ${task.start_date} but was rescheduled because it was in the past.`
										: modifiedTask.details || '',
									status: modifiedTask.status || 'backlog',
									priority: modifiedTask.priority || 'medium',
									task_type: modifiedTask.task_type || 'one_off',
									duration_minutes: modifiedTask.duration_minutes || null,
									start_date: modifiedTask.start_date || null,
									recurrence_pattern: modifiedTask.recurrence_pattern || null,
									recurrence_ends: modifiedTask.recurrence_ends || null,
									project_ref: 'project-0', // Reference to the project created above
									source: 'calendar_event',
									source_calendar_event_id: modifiedTask.event_id || null
								},
								enabled: true
							};
						})
						.filter(Boolean) // Remove null entries for unselected tasks
				);
			}

			// Execute operations using existing executor
			const executor = new OperationsExecutor(this.supabase);
			const results = await executor.executeOperations({
				operations,
				userId
			});

			// Update suggestion status - find the created project from results
			const createdProject = results.results?.find(
				(r) => r.table === 'projects' && r.operationType === 'create'
			);

			// If we found the created project, update the suggestion status
			if (createdProject?.id) {
				await this.updateSuggestionStatus(suggestionId, 'accepted', createdProject.id);
			}

			// Return the complete project data for the API response
			return {
				success: true,
				data: createdProject
					? {
							...createdProject, // Spread first to allow overrides
							name:
								createdProject.name ||
								modifications?.name ||
								suggestion.suggested_name,
							description:
								createdProject.description ||
								modifications?.description ||
								suggestion.suggested_description
						}
					: null
			};
		} catch (error) {
			this.errorLogger.logError(error, {
				userId,
				metadata: {
					operation: 'accept_calendar_suggestion',
					suggestionId
				}
			});

			return {
				success: false,
				errors: [error instanceof Error ? error.message : 'Failed to accept suggestion']
			};
		}
	}

	/**
	 * Reject a suggestion
	 */
	async rejectSuggestion(
		suggestionId: string,
		_userId: string,
		reason?: string
	): Promise<ServiceResponse> {
		try {
			await this.updateSuggestionStatus(suggestionId, 'rejected', null, reason);
			return { success: true };
		} catch (error) {
			return {
				success: false,
				errors: [error instanceof Error ? error.message : 'Failed to reject suggestion']
			};
		}
	}

	/**
	 * Get user's calendar analysis preferences with caching
	 */
	async getPreferences(userId: string): Promise<CalendarAnalysisPreferences | null> {
		const { data, error } = await this.supabase
			.from('calendar_analysis_preferences')
			.select('*')
			.eq('user_id', userId)
			.single();

		if (error && error.code !== 'PGRST116') {
			// Not found is ok
			this.errorLogger.logError(error, {
				userId,
				metadata: { operation: 'get_calendar_preferences' }
			});
		}

		return data;
	}

	/**
	 * Update user's calendar analysis preferences
	 */
	async updatePreferences(
		userId: string,
		preferences: Partial<CalendarAnalysisPreferences>
	): Promise<ServiceResponse> {
		try {
			const { error } = await this.supabase.from('calendar_analysis_preferences').upsert({
				...preferences,
				user_id: userId,
				updated_at: new Date().toISOString()
			});

			if (error) throw error;

			return { success: true };
		} catch (error) {
			return {
				success: false,
				errors: [error instanceof Error ? error.message : 'Failed to update preferences']
			};
		}
	}

	/**
	 * Get calendar analysis history for a user with proper response
	 */
	async getAnalysisHistory(userId: string): Promise<CalendarAnalysis[]> {
		const { data, error } = await this.supabase
			.from('calendar_analyses')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(10);

		if (error) {
			this.errorLogger.logError(error, {
				userId,
				metadata: { operation: 'get_analysis_history' }
			});
			return [];
		}

		return data || [];
	}

	/**
	 * Get projects created from calendar analysis with proper typing
	 */
	async getCalendarProjects(userId: string): Promise<any[]> {
		const { data, error } = await this.supabase
			.from('projects')
			.select(
				`
				*,
				tasks!tasks_project_id_fkey(count)
			`
			)
			.eq('user_id', userId)
			.eq('source', 'calendar_analysis')
			.order('created_at', { ascending: false });

		if (error) {
			this.errorLogger.logError(error, {
				userId,
				metadata: { operation: 'get_calendar_projects' }
			});
			return [];
		}

		return data || [];
	}

	// Private helper methods

	private async createAnalysisRecord(
		userId: string,
		metadata: Partial<CalendarAnalysis>
	): Promise<CalendarAnalysis> {
		const { data, error } = await this.supabase
			.from('calendar_analyses')
			.insert({
				user_id: userId,
				status: 'processing',
				...metadata
			})
			.select()
			.single();

		if (error || !data) {
			throw new Error('Failed to create analysis record');
		}

		return data;
	}

	private async updateAnalysisRecord(
		analysisId: string,
		updates: Partial<CalendarAnalysis>
	): Promise<void> {
		const { error } = await this.supabase
			.from('calendar_analyses')
			.update({
				...updates,
				updated_at: new Date().toISOString()
			})
			.eq('id', analysisId);

		if (error) {
			throw new Error('Failed to update analysis record');
		}
	}

	private async storeAnalysisEvents(analysisId: string, events: CalendarEvent[]): Promise<void> {
		const eventRecords = events.map((event) => ({
			analysis_id: analysisId,
			calendar_id: 'primary', // TODO: Get actual calendar ID
			calendar_event_id: event.id || 'unknown',
			event_title: event.summary,
			event_description: event.description,
			event_start: event.start?.dateTime || event.start?.date,
			event_end: event.end?.dateTime || event.end?.date,
			event_location: event.location,
			is_recurring: !!event.recurringEventId,
			is_organizer: event.organizer?.self || false,
			attendee_count: event.attendees?.length || 0,
			attendee_emails: event.attendees?.map((a) => a.email) || [],
			included_in_analysis: true
		}));

		const { error } = await this.supabase.from('calendar_analysis_events').insert(eventRecords);

		if (error) {
			// Log but don't fail the analysis
			this.errorLogger.logError(error, {
				userId: 'system',
				metadata: {
					operation: 'store_analysis_events',
					analysisId,
					eventCount: events.length
				}
			});
		}
	}

	private async storeSuggestions(
		analysisId: string,
		userId: string,
		suggestions: ProjectSuggestion[]
	): Promise<void> {
		if (suggestions.length === 0) return;

		const suggestionRecords = suggestions.map((suggestion) => ({
			analysis_id: analysisId,
			user_id: userId,
			suggested_name: suggestion.name,
			suggested_description: suggestion.description,
			suggested_context: suggestion.context,
			confidence_score: suggestion.confidence,
			calendar_event_ids: suggestion.event_ids,
			event_count: suggestion.event_ids.length,
			ai_reasoning: suggestion.reasoning,
			detected_keywords: suggestion.keywords,
			suggested_tasks: suggestion.suggested_tasks || [],
			// Store additional metadata in event_patterns for now
			event_patterns: {
				executive_summary: suggestion.executive_summary,
				start_date: suggestion.start_date,
				end_date: suggestion.end_date,
				tags: suggestion.tags,
				slug: suggestion.slug
			},
			status: 'pending' as const
		}));

		const { error } = await this.supabase
			.from('calendar_project_suggestions')
			.insert(suggestionRecords);

		if (error) {
			throw new Error('Failed to store suggestions');
		}
	}

	private async getSuggestionsForAnalysis(
		analysisId: string
	): Promise<CalendarProjectSuggestion[]> {
		const { data, error } = await this.supabase
			.from('calendar_project_suggestions')
			.select('*')
			.eq('analysis_id', analysisId)
			.order('confidence_score', { ascending: false });

		if (error) {
			throw new Error('Failed to get suggestions');
		}

		return data || [];
	}

	private async getSuggestion(
		suggestionId: string,
		userId: string
	): Promise<CalendarProjectSuggestion | null> {
		const { data, error } = await this.supabase
			.from('calendar_project_suggestions')
			.select('*')
			.eq('id', suggestionId)
			.eq('user_id', userId)
			.single();

		if (error) {
			throw new Error('Failed to get suggestion');
		}

		return data;
	}

	private async updateSuggestionStatus(
		suggestionId: string,
		status: 'accepted' | 'rejected' | 'modified' | 'deferred',
		projectId?: string | null,
		reason?: string
	): Promise<void> {
		const updates: any = {
			status,
			status_changed_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		if (status === 'accepted' && projectId) {
			updates.created_project_id = projectId;
		}

		if (status === 'rejected' && reason) {
			updates.rejection_reason = reason;
		}

		const { error } = await this.supabase
			.from('calendar_project_suggestions')
			.update(updates)
			.eq('id', suggestionId);

		if (error) {
			throw new Error('Failed to update suggestion status');
		}
	}
}
