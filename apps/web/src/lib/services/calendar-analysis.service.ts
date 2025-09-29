import { ApiService, type ServiceResponse } from './base/api-service';
import { CalendarService } from './calendar-service';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import { OperationsExecutor } from '$lib/utils/operations/operations-executor';
import { supabase } from '$lib/supabase';
import dayjs from 'dayjs';
import type { Database } from '@buildos/shared-types';
import { ErrorLoggerService } from './errorLogger.service';

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
	id: string;
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
	project_name: string;
	description: string;
	context: string;
	event_ids: string[];
	confidence: number;
	reasoning: string;
	keywords: string[];
	suggested_tasks?: Array<{
		title: string;
		description: string;
		event_id: string;
		date?: string;
	}>;
}

export class CalendarAnalysisService extends ApiService {
	private static instance: CalendarAnalysisService;
	private calendarService: CalendarService;
	private llmService: SmartLLMService;
	private errorLogger: ErrorLoggerService;

	private constructor() {
		super('/api/calendar/analysis');
		this.calendarService = CalendarService.getInstance();
		this.llmService = SmartLLMService.getInstance();
		this.errorLogger = ErrorLoggerService.getInstance();
	}

	public static getInstance(): CalendarAnalysisService {
		if (!this.instance) {
			this.instance = new CalendarAnalysisService();
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
				maxResults: 500,
				calendarId: 'primary' // Start with primary calendar
			});

			if (!eventsResponse.success || !eventsResponse.data?.items) {
				throw new Error('Failed to fetch calendar events');
			}

			const events = eventsResponse.data.items as CalendarEvent[];

			// Filter out declined events and all-day personal events
			const relevantEvents = this.filterRelevantEvents(events);

			// Store event snapshots for future reference
			await this.storeAnalysisEvents(analysis.id, relevantEvents);

			// Send to LLM for analysis
			const suggestions = await this.analyzeEventsWithAI(relevantEvents);

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
				operation: 'calendar_analysis',
				context: { analysisId: analysis.id }
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
	 * Analyze events with AI to detect project patterns
	 */
	private async analyzeEventsWithAI(events: CalendarEvent[]): Promise<ProjectSuggestion[]> {
		if (events.length === 0) {
			return [];
		}

		const prompt = `
Analyze these calendar events and identify potential projects for a BuildOS user.

BuildOS is designed for ADHD minds, helping transform scattered thoughts into organized projects.
Look for patterns that suggest ongoing projects or initiatives.

Identify projects based on:
- Recurring meetings with similar titles/attendees (likely ongoing projects)
- Clusters of related events (project milestones, reviews, planning sessions)
- Events with project-indicating keywords (sprint, launch, milestone, review, kickoff, deadline, sync, standup, retrospective)
- Series of events building toward a goal
- Events with multiple attendees working on the same topic

For each potential project, provide:
1. project_name: Clear, action-oriented name (e.g., "Q1 Product Launch", "Website Redesign")
2. description: 2-3 sentence description of what this project appears to be about
3. context: Detailed context for the project in markdown format, including key dates, participants, and objectives
4. event_ids: Array of event IDs that belong to this project
5. confidence: 0-1 score (how confident this is a real project, must be >= 0.6 to include)
6. reasoning: Why these events suggest a project
7. keywords: Keywords from events that indicated this project
8. suggested_tasks: Initial tasks based on the events, each with title, description, event_id, and date

Ignore:
- One-off personal events (lunch, coffee, dentist, doctor)
- Company all-hands or general meetings
- Events marked as declined or tentative
- Focus/work blocks without specific context
- Social events without work context

Calendar Events:
${JSON.stringify(
	events.map((e) => ({
		id: e.id,
		title: e.summary,
		description: e.description?.substring(0, 200), // Limit description length
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

Return as JSON object with a "suggestions" array containing project suggestions.
Only suggest projects with confidence >= 0.6.
Ensure the response is valid JSON that can be parsed.
`;

		try {
			const response = await this.llmService.createChatCompletion(
				[{ role: 'user', content: prompt }],
				{
					response_format: { type: 'json_object' },
					max_tokens: 4000,
					temperature: 0.7
				}
			);

			if (!response.content) {
				return [];
			}

			const result = JSON.parse(response.content);
			return result.suggestions || [];
		} catch (error) {
			this.errorLogger.logError(error, {
				operation: 'calendar_analysis_ai',
				context: { eventCount: events.length }
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
		}
	): Promise<ServiceResponse<any>> {
		try {
			const suggestion = await this.getSuggestion(suggestionId, userId);
			if (!suggestion) {
				throw new Error('Suggestion not found');
			}

			// Generate operations using existing pattern
			const operations = [
				{
					type: 'create' as const,
					entity: 'projects' as const,
					data: {
						name: modifications?.name || suggestion.suggested_name,
						description: modifications?.description || suggestion.suggested_description,
						context: suggestion.suggested_context,
						source: 'calendar_analysis',
						source_metadata: {
							analysis_id: suggestion.analysis_id,
							suggestion_id: suggestion.id,
							event_ids: suggestion.calendar_event_ids,
							confidence: suggestion.confidence_score
						}
					}
				}
			];

			// Add task operations if requested and tasks exist
			if (modifications?.includeTasks !== false && suggestion.suggested_tasks) {
				const tasks = Array.isArray(suggestion.suggested_tasks)
					? suggestion.suggested_tasks
					: [];

				operations.push(
					...tasks.map((task: any) => ({
						type: 'create' as const,
						entity: 'tasks' as const,
						data: {
							title: task.title,
							description: task.description,
							project_ref: 0, // Reference to the project created above
							source: 'calendar_event',
							source_calendar_event_id: task.event_id,
							start_date: task.date
						}
					}))
				);
			}

			// Execute operations using existing executor
			const executor = new OperationsExecutor(supabase, userId);
			const results = await executor.executeOperations(operations);

			// Update suggestion status
			const projectId = results.projects?.[0]?.id;
			await this.updateSuggestionStatus(suggestionId, 'accepted', projectId);

			return {
				success: true,
				data: results.projects?.[0]
			};
		} catch (error) {
			this.errorLogger.logError(error, {
				userId,
				operation: 'accept_calendar_suggestion',
				context: { suggestionId }
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
		userId: string,
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
	 * Get user's calendar analysis preferences
	 */
	async getPreferences(userId: string): Promise<CalendarAnalysisPreferences | null> {
		const { data, error } = await supabase
			.from('calendar_analysis_preferences')
			.select('*')
			.eq('user_id', userId)
			.single();

		if (error && error.code !== 'PGRST116') {
			// Not found is ok
			this.errorLogger.logError(error, {
				userId,
				operation: 'get_calendar_preferences'
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
			const { error } = await supabase.from('calendar_analysis_preferences').upsert({
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
	 * Get calendar analysis history for a user
	 */
	async getAnalysisHistory(userId: string): Promise<CalendarAnalysis[]> {
		const { data, error } = await supabase
			.from('calendar_analyses')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(10);

		if (error) {
			this.errorLogger.logError(error, {
				userId,
				operation: 'get_analysis_history'
			});
			return [];
		}

		return data || [];
	}

	/**
	 * Get projects created from calendar analysis
	 */
	async getCalendarProjects(userId: string): Promise<any[]> {
		const { data, error } = await supabase
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
				operation: 'get_calendar_projects'
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
		const { data, error } = await supabase
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
		const { error } = await supabase
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
			calendar_event_id: event.id,
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

		const { error } = await supabase.from('calendar_analysis_events').insert(eventRecords);

		if (error) {
			// Log but don't fail the analysis
			this.errorLogger.logError(error, {
				operation: 'store_analysis_events',
				context: { analysisId, eventCount: events.length }
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
			suggested_name: suggestion.project_name,
			suggested_description: suggestion.description,
			suggested_context: suggestion.context,
			confidence_score: suggestion.confidence,
			calendar_event_ids: suggestion.event_ids,
			event_count: suggestion.event_ids.length,
			ai_reasoning: suggestion.reasoning,
			detected_keywords: suggestion.keywords,
			suggested_tasks: suggestion.suggested_tasks || [],
			status: 'pending' as const
		}));

		const { error } = await supabase
			.from('calendar_project_suggestions')
			.insert(suggestionRecords);

		if (error) {
			throw new Error('Failed to store suggestions');
		}
	}

	private async getSuggestionsForAnalysis(
		analysisId: string
	): Promise<CalendarProjectSuggestion[]> {
		const { data, error } = await supabase
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
		const { data, error } = await supabase
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

		const { error } = await supabase
			.from('calendar_project_suggestions')
			.update(updates)
			.eq('id', suggestionId);

		if (error) {
			throw new Error('Failed to update suggestion status');
		}
	}
}
