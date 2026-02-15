// apps/web/src/lib/services/calendar-analysis.service.ts
import { ApiService, type ServiceResponse } from './base/api-service';
import { CalendarService, type CalendarEvent } from './calendar-service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { instantiateProject } from '$lib/services/ontology/instantiation.service';
import {
	convertCalendarSuggestionToProjectSpec,
	inferTaskTypeKey,
	normalizeDueAt,
	normalizePriority,
	type CalendarSuggestionInput,
	type CalendarSuggestionEventPatterns,
	type CalendarSuggestionTask
} from '$lib/services/ontology/braindump-to-ontology-adapter';
import type { TaskState } from '$lib/types/onto';
import type { Database, Json } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorLoggerService } from './errorLogger.service';
import {
	getProjectModel,
	getTaskModel,
	generateProjectContextFramework
} from './prompts/core/prompt-components';
import { ProjectDataFetcher } from './prompts/core/project-data-fetcher';
import { formatProjectsSummaryList } from './prompts/core/data-formatter';
import { savePromptForAudit } from '$lib/utils/prompt-audit';

// Helper functions for date arithmetic (replacing dayjs)
function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

function formatDateYYYYMMDD(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

type CalendarAnalysis = Database['public']['Tables']['calendar_analyses']['Row'];
type CalendarProjectSuggestion =
	Database['public']['Tables']['calendar_project_suggestions']['Row'];
type CalendarAnalysisPreferences =
	Database['public']['Tables']['calendar_analysis_preferences']['Row'];

interface AnalysisResult {
	analysisId: string;
	suggestions: CalendarProjectSuggestion[];
	eventsAnalyzed: number;
}

interface ProjectSuggestion {
	// Reference to source event group from Part 1
	event_group_id?: string; // Reference to EventGroup.group_id from Part 1

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

	// Deduplication fields (REQUIRED - always check against existing projects)
	add_to_existing: boolean; // If true, add tasks to existing project instead of creating new
	existing_project_id: string | null; // ID of existing project to add tasks to
	deduplication_reasoning: string; // REQUIRED: Explanation of deduplication decision

	// Suggested tasks following BuildOS task model
	suggested_tasks?: Array<{
		title: string; // Required, max 255 chars
		description: string; // Required
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

// Part 1: Event Pattern Analysis interfaces
interface LightweightCalendarEvent {
	id: string;
	title: string;
	description_snippet?: string; // First 200 chars
	start: string;
	end: string;
	is_recurring: boolean;
	attendee_count: number;
	is_organizer: boolean;
	location?: string;
}

interface EventGroup {
	group_id: string; // Generated: "group-1", "group-2", etc.

	// High-level project identification
	project_theme: string; // e.g., "Marketing Campaign Planning"
	suggested_project_name: string; // e.g., "Q4 Marketing Campaign"
	confidence: number; // 0-1 score

	// Event relationships
	event_ids: string[]; // IDs of events in this group
	event_count: number;

	// Pattern analysis
	keywords: string[]; // Keywords that indicated this pattern
	recurring_pattern?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
	meeting_series: boolean; // Is this a recurring meeting series?

	// Context
	reasoning: string; // Why these events were grouped together
	key_participants: string[]; // Unique email addresses across events
	time_range: {
		earliest_event: string;
		latest_event: string;
	};

	// Preliminary metadata
	estimated_start_date: string; // YYYY-MM-DD
	estimated_end_date: string | null; // YYYY-MM-DD or null if ongoing
	suggested_tags: string[];
}

interface EventGroupAnalysis {
	groups: EventGroup[];
	ungrouped_event_ids: string[]; // Events that don't fit any pattern
}

// Constants
const DEFAULT_CONFIDENCE_THRESHOLD = 0.4; // Lowered from 0.6 for more suggestions
const PREFERENCES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CALENDAR_ANALYSIS_DEBUG_ENV = process.env.CALENDAR_ANALYSIS_DEBUG;
const DEBUG_LOGGING =
	CALENDAR_ANALYSIS_DEBUG_ENV === 'true' ||
	(CALENDAR_ANALYSIS_DEBUG_ENV !== 'false' && process.env.NODE_ENV !== 'production');

const CALENDAR_TASK_STATE_MAP: Record<string, TaskState> = {
	backlog: 'todo',
	in_progress: 'in_progress',
	done: 'done',
	blocked: 'blocked'
};

type CalendarSuggestionModifications = {
	name?: string;
	description?: string;
	context?: string;
	includeTasks?: boolean;
	taskSelections?: Record<string, boolean>;
	taskModifications?: Record<number, any>;
};

function parseJsonValue<T>(value: unknown): T | null {
	if (!value) return null;
	if (typeof value === 'string') {
		try {
			return JSON.parse(value) as T;
		} catch (error) {
			console.warn('[Calendar Analysis] Failed to parse JSON value:', error);
			return null;
		}
	}
	if (typeof value === 'object') {
		return value as T;
	}
	return null;
}

function prepareCalendarTasks(
	tasks: CalendarSuggestionTask[],
	suggestionId: string,
	modifications?: CalendarSuggestionModifications
): CalendarSuggestionTask[] {
	if (modifications?.includeTasks === false) {
		return [];
	}

	const normalizedToday = new Date();
	normalizedToday.setHours(0, 0, 0, 0);
	const todayDateString = normalizedToday.toISOString().slice(0, 10);

	const preparedTasks: CalendarSuggestionTask[] = [];

	tasks.forEach((task, index) => {
		const taskKey = `${suggestionId}-${index}`;
		if (modifications?.taskSelections && modifications.taskSelections[taskKey] === false) {
			return;
		}

		const modifiedTask = modifications?.taskModifications?.[index]
			? { ...task, ...modifications.taskModifications[index] }
			: { ...task };

		let rescheduledFromPast = false;
		if (modifiedTask.start_date) {
			const taskDate = new Date(modifiedTask.start_date);
			if (taskDate < normalizedToday) {
				const taskTime = modifiedTask.start_date.includes('T')
					? modifiedTask.start_date.split('T')[1]
					: '09:00:00';

				modifiedTask.start_date = `${todayDateString}T${taskTime}`;
				rescheduledFromPast = true;
			}
		}

		if (rescheduledFromPast) {
			const note = `⚠️ Note: This task was originally scheduled for ${task.start_date} but was rescheduled because it was in the past.`;
			modifiedTask.details = modifiedTask.details
				? `${modifiedTask.details}\n\n${note}`
				: note;
		}

		preparedTasks.push(modifiedTask);
	});

	return preparedTasks;
}

async function addTasksToExistingProject(
	supabase: SupabaseClient<Database>,
	projectId: string,
	userId: string,
	tasks: CalendarSuggestionTask[]
): Promise<{ taskCount: number; planId?: string }> {
	if (!tasks?.length) {
		return { taskCount: 0 };
	}

	const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
		p_user_id: userId
	});

	if (actorError || !actorId) {
		throw new Error(`Failed to resolve actor: ${actorError?.message}`);
	}

	const { data: existingPlans } = await supabase
		.from('onto_plans')
		.select('id, name')
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('created_at', { ascending: false })
		.limit(1);

	let planId: string | undefined;

	if (!existingPlans?.length) {
		const { data: newPlan, error: planError } = await supabase
			.from('onto_plans')
			.insert({
				project_id: projectId,
				name: 'Calendar-Imported Tasks',
				type_key: 'plan.phase',
				state_key: 'active',
				props: { source: 'calendar_analysis' } as Json,
				created_by: actorId
			})
			.select('id')
			.single();

		if (planError || !newPlan) {
			throw new Error(`Failed to create plan: ${planError?.message}`);
		}

		planId = newPlan.id;

		await supabase.from('onto_edges').insert({
			project_id: projectId,
			src_kind: 'project',
			src_id: projectId,
			rel: 'has_plan',
			dst_kind: 'plan',
			dst_id: planId
		});
	} else {
		planId = existingPlans[0]!.id;
	}

	const taskInserts = tasks.map((task) => {
		const title = task.title?.trim() || 'Untitled Task';

		return {
			project_id: projectId,
			title,
			type_key: inferTaskTypeKey(title),
			state_key: CALENDAR_TASK_STATE_MAP[task.status ?? 'backlog'] ?? 'todo',
			priority: normalizePriority(task.priority) ?? 3,
			start_at: normalizeDueAt(task.start_date) ?? null,
			due_at: normalizeDueAt(task.start_date) ?? null,
			description: task.description ?? null,
			props: {
				details: task.details,
				calendar_event_id: task.event_id,
				task_type: task.task_type,
				recurrence_pattern: task.recurrence_pattern,
				recurrence_ends: task.recurrence_ends,
				recurrence_rrule: task.recurrence_rrule,
				duration_minutes: task.duration_minutes,
				tags: task.tags
			} as Json,
			created_by: actorId
		};
	});

	const { data: insertedTasks, error: tasksError } = await supabase
		.from('onto_tasks')
		.insert(taskInserts)
		.select('id');

	if (tasksError) {
		throw new Error(`Failed to insert tasks: ${tasksError.message}`);
	}

	const edgeInserts = (insertedTasks ?? []).map((task) => ({
		project_id: projectId,
		src_kind: 'plan',
		src_id: planId,
		rel: 'has_task',
		dst_kind: 'task',
		dst_id: task.id
	}));

	if (edgeInserts.length > 0) {
		await supabase.from('onto_edges').insert(edgeInserts);
	}

	return { taskCount: insertedTasks?.length ?? 0, planId };
}

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
		const now = new Date();

		// Create analysis record
		const analysis = await this.createAnalysisRecord(userId, {
			date_range_start: formatDateYYYYMMDD(addDays(now, -daysBack)),
			date_range_end: formatDateYYYYMMDD(addDays(now, daysForward)),
			calendars_analyzed: options.calendarsToAnalyze || []
		});

		try {
			// Fetch calendar events using the existing CalendarService
			const eventsResponse = await this.calendarService.getCalendarEvents(userId, {
				timeMin: addDays(now, -daysBack).toISOString(),
				timeMax: addDays(now, daysForward).toISOString(),
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

			// Part 1: Analyze event patterns and group them
			const eventGroups = await this.analyzeEventPatterns({
				events: relevantEvents,
				userId
			});

			if (DEBUG_LOGGING) {
				console.log(`[Calendar Analysis] Event groups identified: ${eventGroups.length}`);
			}

			// Early exit if no groups found
			if (eventGroups.length === 0) {
				if (DEBUG_LOGGING) {
					console.log(
						`[Calendar Analysis] No event groups identified. Completing analysis with 0 suggestions.`
					);
				}

				await this.updateAnalysisRecord(analysis.id, {
					status: 'completed',
					events_analyzed: relevantEvents.length,
					events_excluded: events.length - relevantEvents.length,
					projects_suggested: 0,
					confidence_average: null,
					completed_at: new Date().toISOString()
				});

				return {
					analysisId: analysis.id,
					suggestions: [],
					eventsAnalyzed: relevantEvents.length
				};
			}

			// Part 2: Create projects from event groups with deduplication
			const suggestions = await this.createProjectsFromGroups({
				eventGroups,
				events: relevantEvents,
				userId
			});

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

			// Skip all-day and timed events that look personal (expanded heuristic)
			const title = (event.summary || '').toLowerCase();
			const personalKeywords = [
				// Current keywords
				'birthday',
				'anniversary',
				'vacation',
				'holiday',
				'pto',
				'out of office',
				'ooo',
				// Medical/Health (9 keywords)
				'therapy',
				'dentist',
				'doctor',
				'appointment',
				'checkup',
				'physical',
				'medical',
				'pelvic floor',
				'cardio',
				// Family/Kids (6 keywords)
				'kindergarten',
				'school',
				'dismissal',
				'co-op',
				'daycare',
				'early dismissal',
				// Personal Chores (4 keywords)
				'trash',
				'curb',
				'mop',
				'maintenance',
				// Social (3 keywords)
				'housewarming',
				'couples night',
				'visit',
				// Additional personal indicators (3 keywords)
				'bring to school',
				'pick up',
				'drop off'
			];

			// Filter both all-day and timed personal events
			if (personalKeywords.some((keyword) => title.includes(keyword))) {
				return false;
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
	 * Part 1: Analyze event patterns and group related events
	 * This method focuses purely on pattern recognition without the complexity of data models
	 */
	private async analyzeEventPatterns({
		events,
		userId
	}: {
		events: CalendarEvent[];
		userId: string;
	}): Promise<EventGroup[]> {
		if (events.length === 0) {
			return [];
		}

		const todayString = new Date().toISOString().slice(0, 10);

		// Create lightweight event format for pattern analysis
		const lightweightEvents: LightweightCalendarEvent[] = events.map((e) => ({
			id: e.id || 'unknown',
			title: e.summary,
			description_snippet: e.description?.substring(0, 200),
			start: e.start?.dateTime || e.start?.date || '',
			end: e.end?.dateTime || e.end?.date || '',
			is_recurring: !!e.recurringEventId,
			attendee_count: e.attendees?.length || 0,
			is_organizer: e.organizer?.self || false,
			location: e.location
		}));

		const systemPrompt = `You are an expert at analyzing calendar patterns to identify potential projects. Always respond with valid JSON following the specified schema.`;

		const userPrompt = `You are analyzing calendar events to identify patterns and group related events that might represent projects.

**Today's date**: ${todayString}

## Your Task

Group related calendar events and identify project themes. Focus on:
1. Recurring meetings with similar titles/attendees
2. Clusters of events around similar topics
3. Project-indicating keywords (sprint, launch, milestone, review, planning, kickoff, deadline, sync, standup, retrospective, design, implementation)
4. Series of events building toward a goal

## Events to EXCLUDE from Grouping

**DO NOT** group these types of events (they are personal, not work projects):
- Personal appointments (dentist, doctor, therapy, medical, checkup)
- Family events (birthday, kindergarten, school, daycare, dismissal)
- Household tasks (trash, maintenance, mop, errands)
- Social events without work context (couples night, housewarming, visit)
- One-off personal commitments (pick up, drop off, bring to school)

## Events to INCLUDE in Grouping

- Work meetings with project keywords
- Recurring meetings with multiple attendees
- Events suggesting coordinated work effort
- Focus time blocks for specific projects
- Team sync meetings and standups

## Calendar Events (${events.length} total)

${JSON.stringify(lightweightEvents, null, 2)}

## Output Format

Return JSON with this structure:

{
  "groups": [
    {
      "group_id": "group-1",
      "project_theme": "High-level theme description",
      "suggested_project_name": "Specific project name",
      "confidence": 0.8,
      "event_ids": ["event-1", "event-2"],
      "event_count": 5,
      "keywords": ["keyword1", "keyword2"],
      "recurring_pattern": "weekly" or null,
      "meeting_series": true or false,
      "reasoning": "Why these events were grouped together",
      "key_participants": ["email1@example.com", "email2@example.com"],
      "time_range": {
        "earliest_event": "YYYY-MM-DD",
        "latest_event": "YYYY-MM-DD"
      },
      "estimated_start_date": "YYYY-MM-DD",
      "estimated_end_date": "YYYY-MM-DD" or null,
      "suggested_tags": ["tag1", "tag2"]
    }
  ],
  "ungrouped_event_ids": ["event-x", "event-y"]
}

## Guidelines

- Only group events that are clearly related
- **Confidence >= 0.7 for grouping (be highly selective)**
- One event can only belong to one group
- Ungrouped events go in ungrouped_event_ids
- Be specific with project names (not just "Team Sync")
- Include ALL relevant events in time_range calculation
- Ensure all event IDs in groups exist in the input events
- Extract dates carefully from event start/end fields

## Examples

**GOOD Grouping** (High confidence 0.85+):
- "Sprint Planning", "Sprint Review", "Sprint Retro" → "Agile Development Sprint Cycle" (clear series)
- "Q4 Marketing Launch Prep", "Launch Review", "Launch Debrief" → "Q4 Marketing Campaign Launch" (thematic unity)

**BAD Grouping** (Don't do this):
- "Team Lunch", "All Hands", "1:1 with Manager" → Too generic, unrelated
- "Lily Kindergarten", "Walter School Drop-off" → Personal/family events
- "Therapy 1:10pm", "Dentist Appointment" → Personal appointments`;

		try {
			if (DEBUG_LOGGING) {
				console.log(
					`[Calendar Analysis Part 1] Analyzing ${events.length} events for patterns`
				);
			}

			// Save prompt for auditing
			await savePromptForAudit({
				systemPrompt,
				userPrompt,
				scenarioType: 'calendar-analysis-part1-event-grouping',
				metadata: {
					userId,
					eventCount: events.length,
					timestamp: new Date().toISOString()
				}
			});

			// Call LLM
			const response = await this.llmService.getJSONResponse<EventGroupAnalysis>({
				systemPrompt,
				userPrompt,
				userId,
				profile: 'balanced',
				temperature: 0.3,
				validation: {
					retryOnParseError: true,
					validateSchema: true,
					maxRetries: 2
				},
				operationType: 'calendar_analysis_part1'
			});

			const groups = response.groups || [];

			// Validate event IDs in groups
			const validEventIds = new Set(events.map((e) => e.id));
			const validatedGroups = groups.filter((group) => {
				// Check all event IDs exist
				const invalidIds = group.event_ids.filter((id) => !validEventIds.has(id));
				if (invalidIds.length > 0) {
					console.warn(
						`[Calendar Analysis Part 1] Group "${group.group_id}" references ${invalidIds.length} non-existent event IDs:`,
						invalidIds
					);
					return false; // Filter out groups with invalid event IDs
				}

				// Validate event_count matches event_ids length
				if (group.event_count !== group.event_ids.length) {
					console.warn(
						`[Calendar Analysis Part 1] Group "${group.group_id}" has mismatched event_count: ${group.event_count} vs actual: ${group.event_ids.length}`
					);
					group.event_count = group.event_ids.length; // Fix the count
				}

				// Validate confidence is in valid range
				if (group.confidence < 0 || group.confidence > 1) {
					console.warn(
						`[Calendar Analysis Part 1] Group "${group.group_id}" has invalid confidence: ${group.confidence}. Clamping to [0, 1]`
					);
					group.confidence = Math.max(0, Math.min(1, group.confidence));
				}

				return true;
			});

			if (DEBUG_LOGGING) {
				console.log(
					`[Calendar Analysis Part 1] Generated ${validatedGroups.length} event groups`
				);
				if (validatedGroups.length < groups.length) {
					console.log(
						`[Calendar Analysis Part 1] Filtered out ${groups.length - validatedGroups.length} invalid groups`
					);
				}
				console.log(
					`[Calendar Analysis Part 1] Ungrouped events: ${response.ungrouped_event_ids?.length || 0}`
				);
				if (validatedGroups.length > 0) {
					console.log(
						`[Calendar Analysis Part 1] Groups:`,
						validatedGroups.map((g) => ({
							id: g.group_id,
							name: g.suggested_project_name,
							eventCount: g.event_count,
							confidence: g.confidence
						}))
					);
				}
			}

			return validatedGroups;
		} catch (error) {
			this.errorLogger.logError(error, {
				userId,
				metadata: {
					operation: 'calendar_analysis_part1_event_grouping',
					eventCount: events.length
				}
			});
			return [];
		}
	}

	/**
	 * Part 2: Create BuildOS projects from event groups with deduplication
	 * This method transforms event groups into structured projects with tasks
	 */
	private async createProjectsFromGroups({
		eventGroups,
		events,
		userId
	}: {
		eventGroups: EventGroup[];
		events: CalendarEvent[];
		userId: string;
	}): Promise<ProjectSuggestion[]> {
		if (eventGroups.length === 0) {
			return [];
		}

		const todayString = new Date().toISOString().slice(0, 10);
		const now = new Date();

		// Fetch existing projects for deduplication
		const projectDataFetcher = new ProjectDataFetcher(this.supabase);
		const existingProjects = await projectDataFetcher.getAllUserProjectsSummary(userId, {
			limit: 50,
			includeStatus: ['active', 'paused']
		});

		const projectsContext = formatProjectsSummaryList(existingProjects || []);

		if (DEBUG_LOGGING) {
			console.log(`[Calendar Analysis Part 2] Processing ${eventGroups.length} event groups`);
			console.log(
				`[Calendar Analysis Part 2] Checking against ${existingProjects?.length || 0} existing projects`
			);
		}

		// Create a map of events for quick lookup
		const eventMap = new Map(events.map((e) => [e.id, e]));

		// Separate events into past and upcoming for context
		const pastEvents = events.filter((e) => {
			const eventDate = new Date(e.start?.dateTime || e.start?.date || '');
			return eventDate < now;
		});

		const upcomingEvents = events.filter((e) => {
			const eventDate = new Date(e.start?.dateTime || e.start?.date || '');
			return eventDate >= now;
		});

		// Build detailed event groups section
		const eventGroupsSection = eventGroups
			.map((group, idx) => {
				// Get full event details for events in this group
				const groupEvents = group.event_ids
					.map((id) => eventMap.get(id))
					.filter((e): e is CalendarEvent => e !== undefined);

				// Separate into past and upcoming
				const groupPastEvents = groupEvents.filter((e) => {
					const eventDate = new Date(e.start?.dateTime || e.start?.date || '');
					return eventDate < now;
				});

				const groupUpcomingEvents = groupEvents.filter((e) => {
					const eventDate = new Date(e.start?.dateTime || e.start?.date || '');
					return eventDate >= now;
				});

				return `
### Group ${idx + 1}: ${group.project_theme}

**Suggested Name**: ${group.suggested_project_name}
**Confidence**: ${group.confidence}
**Event Count**: ${group.event_count}
**Keywords**: ${group.keywords.join(', ')}
**Time Range**: ${group.time_range.earliest_event} to ${group.time_range.latest_event}
**Reasoning**: ${group.reasoning}

**Past Events in this group (${groupPastEvents.length} events - for context only)**:
${JSON.stringify(
	groupPastEvents.map((e) => ({
		id: e.id,
		title: e.summary,
		description: e.description?.substring(0, 500),
		start: e.start?.dateTime || e.start?.date,
		end: e.end?.dateTime || e.end?.date,
		attendees: e.attendees?.map((a) => a.email),
		organizer: e.organizer?.email,
		location: e.location
	})),
	null,
	2
)}

**Upcoming Events in this group (${groupUpcomingEvents.length} events - create tasks from these)**:
${JSON.stringify(
	groupUpcomingEvents.map((e) => ({
		id: e.id,
		title: e.summary,
		description: e.description?.substring(0, 500),
		start: e.start?.dateTime || e.start?.date,
		end: e.end?.dateTime || e.end?.date,
		attendees: e.attendees?.map((a) => a.email),
		organizer: e.organizer?.email,
		location: e.location,
		hangoutLink: e.hangoutLink,
		recurrence: e.recurrence, // RRULE strings array for recurring events
		is_recurring: !!e.recurringEventId || !!e.recurrence
	})),
	null,
	2
)}
`;
			})
			.join('\n---\n');

		const systemPrompt = `You are an expert in creating structured projects from calendar event patterns. Always respond with valid JSON following the specified schema.`;

		const userPrompt = `You are creating BuildOS projects from calendar event groups with proper deduplication.

**Today's date**: ${todayString}

## User's Existing Projects

${projectsContext || 'No existing projects found.'}

## CRITICAL: Project Deduplication Rules

**IMPORTANT**: Check EVERY event group against existing projects above.

**Deduplication Decision** (Apply in order):

1. **Strong Match (≥75% confidence)**:
   - Set "add_to_existing: true"
   - Set "existing_project_id: 'actual-uuid-from-above'"
   - Set "deduplication_reasoning: 'Events match existing project because...'"
   - Still generate tasks to add to that project

2. **Weak/No Match (<75%)**:
   - Set "add_to_existing: false"
   - Set "existing_project_id: null"
   - Set "deduplication_reasoning: 'No match with existing projects because...'"
   - Create NEW project

**ALWAYS** provide "deduplication_reasoning" explaining your decision.

## Examples:

✅ **Strong Match**:
- Existing: "Product Launch Q4 2025"
- Events: "Launch Planning Meeting", "Launch Review" (Oct-Dec 2025)
- Decision: "add_to_existing: true" - Events are clearly part of existing Q4 launch project

❌ **No Match**:
- Existing: "Marketing Campaign"
- Events: "Engineering Standup", "Code Review"
- Decision: "add_to_existing: false" - Engineering events unrelated to marketing

## Event Groups to Process

You've already identified ${eventGroups.length} event groups. Now create BuildOS projects for each group.

${eventGroupsSection}

## Data Models

### Project Model (REQUIRED structure):
${getProjectModel(true)}

### Task Model (REQUIRED structure):
${getTaskModel({ includeRecurring: true, includeProjectRef: false })}

${generateProjectContextFramework('condensed')}

## Output Format

Return JSON:

{
  "suggestions": [
    {
      "event_group_id": "group-1",

      // Project fields
      "name": "Specific project name",
      "slug": "project-slug",
      "description": "2-3 sentence description",
      "context": "Comprehensive markdown using BuildOS framework above",
      "executive_summary": "Brief summary <500 chars",
      "status": "active",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD" or null,
      "tags": ["tag1", "tag2"],

      // Metadata
      "event_ids": ["all", "event", "ids"],
      "confidence": 0.8,
      "reasoning": "Why this is a project",
      "keywords": ["keyword1", "keyword2"],

      // Deduplication (ALWAYS REQUIRED)
      "add_to_existing": false,
      "existing_project_id": null,
      "deduplication_reasoning": "Checked against existing projects. No match found because...",

      // Tasks (see task generation rules below)
      "suggested_tasks": [
        {
          "title": "Task title",
          "description": "Task description",
          "details": "Comprehensive details including event info",
          "status": "backlog",
          "priority": "medium",
          "task_type": "one_off" | "recurring",
          "recurrence_pattern": "daily|weekly|monthly|etc" or null,
          "recurrence_ends": "YYYY-MM-DD" or null,
          "recurrence_rrule": "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20251215T235959Z" or null,
          "duration_minutes": 60,
          "start_date": "YYYY-MM-DDTHH:MM:SS",
          "event_id": "calendar-event-id",
          "tags": ["tag1"]
        }
      ]
    }
  ]
}

## CRITICAL RULES

### 1. Task Generation Requirements

**Task Count**: Generate tasks for 30-50% of upcoming events
- Calculate: For ${eventGroups.length} event groups, if a group has N upcoming events, generate Math.ceil(N * 0.4) tasks minimum
- **Minimum**: 2 tasks per project
- **Strategy**: Convert key upcoming events to tasks + add inferred preparation/follow-up tasks

**Task Dates**:
- **ALL tasks must have start_date >= ${todayString}**
- No past-dated tasks allowed

### 2. Recurring Event Handling (CRITICAL)

When an event has a "recurrence" field with RRULE:

**Steps**:
1. Set "task_type: 'recurring'"
2. **COPY the exact RRULE string** to "recurrence_rrule" field (preserve it exactly!)
3. Parse RRULE to set "recurrence_pattern":
   - "FREQ=DAILY" → "daily"
   - "FREQ=WEEKLY" → "weekly"
   - "FREQ=MONTHLY" → "monthly"
4. Parse "UNTIL" parameter for "recurrence_ends":
   - "UNTIL=20251215T235959Z" → "2025-12-15"

**Example**:
\`\`\`json
{
  "title": "Sprint Planning",
  "task_type": "recurring",
  "recurrence_pattern": "weekly",
  "recurrence_ends": "2025-12-15",
  "recurrence_rrule": "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20251215T235959Z",
  "event_id": "event-123"
}
\`\`\`

### 3. Task Metadata (REQUIRED)

**Details field MUST include**:
\`\`\`
**Meeting**: {event.title}
**Date**: {event.start}
**Duration**: {duration_minutes} minutes
**Attendees**: {comma-separated emails}
**Location**: {location or "Virtual"}
**Meeting Link**: {hangoutLink or "None"}

{additional context}
\`\`\`

**Duration**: Calculate from event.end - event.start (in minutes)
**Event ID**: Always link task to source event via "event_id"

### 4. Deduplication

- **ALWAYS** provide "deduplication_reasoning" (even for new projects)
- Use EXACT project IDs from "User's Existing Projects" section above
- Don't hallucinate project IDs

### 5. Data Model Compliance

- Follow BuildOS data models exactly
- All required fields must be present
- Use proper date formats (YYYY-MM-DD or ISO 8601 for timestamps)`;

		try {
			if (DEBUG_LOGGING) {
				console.log(
					`[Calendar Analysis Part 2] Generating projects from ${eventGroups.length} groups`
				);
			}

			// Save prompt for auditing
			await savePromptForAudit({
				systemPrompt,
				userPrompt,
				scenarioType: 'calendar-analysis-part2-project-creation',
				metadata: {
					userId,
					eventGroupCount: eventGroups.length,
					existingProjectCount: existingProjects?.length || 0,
					pastEventCount: pastEvents.length,
					upcomingEventCount: upcomingEvents.length,
					timestamp: new Date().toISOString()
				}
			});

			// Call LLM
			const response = await this.llmService.getJSONResponse<{
				suggestions: ProjectSuggestion[];
			}>({
				systemPrompt,
				userPrompt,
				userId,
				profile: 'balanced',
				temperature: 0.3,
				validation: {
					retryOnParseError: true,
					validateSchema: true,
					maxRetries: 2
				},
				operationType: 'calendar_analysis_part2'
			});

			const suggestions = response.suggestions || [];

			// Validate event group references
			const validGroupIds = new Set(eventGroups.map((g) => g.group_id));
			suggestions.forEach((suggestion) => {
				if (suggestion.event_group_id && !validGroupIds.has(suggestion.event_group_id)) {
					console.warn(
						`[Calendar Analysis Part 2] Suggestion "${suggestion.name}" references non-existent event_group_id: ${suggestion.event_group_id}`
					);
					suggestion.event_group_id = undefined; // Clear invalid reference
				}
			});

			if (DEBUG_LOGGING) {
				console.log(
					`[Calendar Analysis Part 2] Generated ${suggestions.length} project suggestions`
				);
				console.log(
					`[Calendar Analysis Part 2] Deduplication results:`,
					suggestions.map((s) => ({
						name: s.name,
						add_to_existing: s.add_to_existing,
						existing_project_id: s.existing_project_id
					}))
				);
			}

			// Validate suggestions
			this.validateProjectSuggestions(suggestions, todayString);

			return suggestions;
		} catch (error) {
			this.errorLogger.logError(error, {
				userId,
				metadata: {
					operation: 'calendar_analysis_part2_project_creation',
					eventGroupCount: eventGroups.length
				}
			});
			return [];
		}
	}

	/**
	 * Validate project suggestions for common issues
	 */
	private validateProjectSuggestions(suggestions: ProjectSuggestion[], today: string): void {
		const todayDate = new Date(today);
		todayDate.setHours(0, 0, 0, 0);

		suggestions.forEach((suggestion) => {
			// Check for past-dated tasks
			if (suggestion.suggested_tasks && Array.isArray(suggestion.suggested_tasks)) {
				const pastTasks = suggestion.suggested_tasks.filter((task) => {
					if (!task.start_date) return false;
					const taskDate = new Date(task.start_date);
					return taskDate < todayDate;
				});

				if (pastTasks.length > 0) {
					console.warn(
						`[Calendar Analysis] WARNING: Project "${suggestion.name}" has ${pastTasks.length} task(s) with past dates`,
						pastTasks.map((t) => ({ title: t.title, start_date: t.start_date }))
					);
				}
			}

			// Check for minimum task count
			const taskCount = suggestion.suggested_tasks?.length || 0;
			if (taskCount < 2) {
				console.warn(
					`[Calendar Analysis] WARNING: Project "${suggestion.name}" has only ${taskCount} task(s). Minimum 2 expected.`
				);
			}

			// Validate required deduplication fields
			if (
				!suggestion.deduplication_reasoning ||
				suggestion.deduplication_reasoning.trim() === ''
			) {
				console.warn(
					`[Calendar Analysis] WARNING: Project "${suggestion.name}" has empty deduplication_reasoning (required field)`
				);
			}

			// Validate deduplication consistency
			if (suggestion.add_to_existing && !suggestion.existing_project_id) {
				console.warn(
					`[Calendar Analysis] WARNING: Project "${suggestion.name}" has add_to_existing=true but no existing_project_id`
				);
			}

			if (!suggestion.add_to_existing && suggestion.existing_project_id) {
				console.warn(
					`[Calendar Analysis] WARNING: Project "${suggestion.name}" has existing_project_id but add_to_existing=false`
				);
			}
		});
	}

	/**
	 * Analyze events with AI to detect project patterns with confidence threshold
	 * @deprecated Use analyzeEventPatterns + createProjectsFromGroups instead
	 */
	private async analyzeEventsWithAI({
		events,
		minConfidence = DEFAULT_CONFIDENCE_THRESHOLD,
		userId
	}: {
		events: CalendarEvent[];
		minConfidence?: number;
		userId: string;
	}): Promise<ProjectSuggestion[]> {
		if (events.length === 0) {
			return [];
		}

		const today = new Date().toISOString().slice(0, 10);
		const now = new Date();

		// Fetch existing projects for deduplication
		const projectDataFetcher = new ProjectDataFetcher(this.supabase);
		const existingProjects = await projectDataFetcher.getAllUserProjectsSummary(userId, {
			limit: 50,
			includeStatus: ['active', 'paused']
		});

		const projectsContext = formatProjectsSummaryList(existingProjects || []);

		if (DEBUG_LOGGING) {
			console.log(
				`[Calendar Analysis] Fetched ${existingProjects?.length || 0} existing projects for deduplication`
			);
		}

		// Separate events into past and upcoming
		const pastEvents = events.filter((e) => {
			const eventDate = new Date(e.start?.dateTime || e.start?.date || '');
			return eventDate < now;
		});

		const upcomingEvents = events.filter((e) => {
			const eventDate = new Date(e.start?.dateTime || e.start?.date || '');
			return eventDate >= now;
		});

		if (DEBUG_LOGGING) {
			console.log(
				`[Calendar Analysis] Event split: ${pastEvents.length} past, ${upcomingEvents.length} upcoming`
			);
		}

		// Calculate adaptive task count based on upcoming events
		const upcomingEventCount = upcomingEvents.length;

		const prompt = `
A user has asked you to analyze their google calendar and suggest projects based off the events.

Your role is to act like a project organizer and look at the google calendar events and suggest projects with associated tasks.

**IMPORTANT CONTEXT**: Today's date is ${today}. You have access to both past and upcoming calendar events.

You will be returning a JSON response of detailed "suggestions" array. See **Output Requirements** for correct JSON schema formatting.

## User's Existing Projects

${projectsContext || 'No existing projects found.'}

---

## CRITICAL: Project Deduplication Rules

**IMPORTANT**: The user already has the projects listed above. When analyzing calendar events:

1. **Check for matches** against existing projects:
   - Compare by project name, description, tags, and context
   - Look for semantic similarity (e.g., "Marketing Campaign" matches "Q4 Marketing Push")
   - Consider if calendar events relate to existing project scope

2. **If a match is found** (confidence >= 70%):
   - Set "add_to_existing": true
   - Set "existing_project_id": "<matching_project_id>"
   - Set "deduplication_reasoning": "Explanation of why this matches existing project"
   - Still generate suggested_tasks to add to the existing project

3. **Only suggest NEW projects if**:
   - Calendar events represent meaningfully different work
   - No semantic match with existing projects
   - Events indicate a distinct initiative or goal

4. **When uncertain** (50-70% match):
   - Err on the side of adding to existing projects
   - Provide clear reasoning for the decision

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

## Calendar Events to Analyze

### Past Events (${pastEvents.length} events)
**Use these events ONLY for project context and understanding. DO NOT create tasks from past events.**
${JSON.stringify(
	pastEvents.map((e) => ({
		id: e.id || 'unknown',
		title: e.summary,
		description: e.description?.substring(0, 500),
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

### Upcoming Events (${upcomingEvents.length} events)
**Use these events for BOTH project context AND task generation.**
${JSON.stringify(
	upcomingEvents.map((e) => ({
		id: e.id || 'unknown',
		title: e.summary,
		description: e.description?.substring(0, 500),
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

## CRITICAL TASK GENERATION RULES


For each project, create tasks using ONE or BOTH of these approaches:

### Approach 1: Tasks from Upcoming Calendar Events
- Convert upcoming calendar events into actionable tasks
- Use the event's date/time as the task's start_date
- If event is recurring, set task_type to "recurring" with appropriate recurrence_pattern

### Approach 2: Inferred Next Steps
- Based on the project context and goals, infer logical next steps
- Schedule these tasks starting from ${today} or later
- Space tasks intelligently (e.g., planning tasks this week, execution tasks next week)

**TASK DATE REQUIREMENTS**:
- ALL tasks MUST have start_date >= ${today} (today or future)
- NEVER create tasks with dates in the past
- Use past events to understand the project, but create tasks for future work
- If an upcoming event exists, you can create a task for it
- If no upcoming events exist, infer 2-3 logical next steps and schedule them starting ${today}

**Examples**:

Example 1 - Project with upcoming events:
- Past events: "Sprint Planning" (weekly, last 8 weeks)
- Upcoming events: "Sprint Planning" on ${new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
- Tasks to create:
  1. "Attend Sprint Planning" - from upcoming event
  2. "Review sprint backlog" - inferred preparation task (2 days before)
  3. "Update team on progress" - recurring task (weekly)

Example 2 - Project with only past events:
- Past events: "Product Review" (monthly, last 3 months)
- No upcoming events
- Tasks to create:
  1. "Schedule next product review" - starting ${today}
  2. "Gather product metrics" - starting ${new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
  3. "Prepare review presentation" - starting ${new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}

## Output Requirements - JSON schema

Return a JSON object with a "suggestions" array. Each suggestion must follow this EXACT structure:

{
  "suggestions": [
    {
      // Project fields (all required unless noted)
      "name": "Clear, action-oriented project name",
      "slug": "generated-from-name-lowercase-hyphens",
      "description": "2-3 sentence description of what this project is about",
      "context": "Comprehensive markdown following the BuildOS context framework. Include all relevant information about the project's purpose, vision, scope, approach, stakeholders, timelines, and any other relevant context extracted from the calendar events. Use BOTH past and upcoming events to build complete context.",
      "executive_summary": "Brief executive summary under 500 characters",
      "status": "active", // Default to active for new projects
      "start_date": "YYYY-MM-DD", // Earliest relevant event date or today
      "end_date": "YYYY-MM-DD or null", // Latest relevant event date or null if ongoing
      "tags": ["relevant", "tags", "from", "events"],

      // Calendar analysis metadata (all required)
      "event_ids": ["array", "of", "ALL", "event", "ids", "both", "past", "and", "upcoming"],
      "confidence": 0.7, // 0-1 score, must be >= ${minConfidence}
      "reasoning": "Clear explanation of why these events suggest a project",
      "keywords": ["detected", "keywords", "that", "indicated", "project"],

      // Deduplication fields (REQUIRED - check against existing projects)
      "add_to_existing": false, // Set to true if this matches an existing project
      "existing_project_id": null, // Set to existing project ID if add_to_existing is true
      "deduplication_reasoning": "Explanation of deduplication decision (why new project or why adding to existing)",

      "suggested_tasks": [
        {
          "title": "Specific task title (max 255 chars)",
          "description": "Brief task description",
          "details": "Comprehensive details including:\n- Event description\n- Meeting attendees (if from calendar event)\n- Location (if applicable)\n- Meeting link (if available)\n- Additional context or next steps",
          "status": "backlog",
          "priority": "medium", // low|medium|high based on urgency/importance
          "task_type": "one_off", // or "recurring" for repeating events
          "duration_minutes": 60, // Estimate based on event duration or task complexity
          "start_date": "YYYY-MM-DDTHH:MM:SS", // MUST be >= ${today}T00:00:00, schedule intelligently
          "recurrence_pattern": "weekly", // Only if task_type is "recurring"
          "recurrence_ends": "YYYY-MM-DD", // Only if recurring
          "event_id": "linked-calendar-event-id", // Only if task is from an upcoming event
          "tags": ["optional", "task", "tags"]
        }
      ]
    }
  ]
}

**VALIDATION CHECKLIST** (verify before returning):
- [ ] Checked all calendar events against existing projects for duplicates
- [ ] Each suggestion has deduplication fields (add_to_existing, existing_project_id, deduplication_reasoning)
- [ ] ALL task start_date values are >= ${today}
- [ ] NO tasks have dates in the past
- [ ] Task details include event metadata (attendees, location, links) when available
- [ ] Tasks either correspond to upcoming events OR are inferred next steps
- [ ] Project context incorporates insights from BOTH past and upcoming events
- [ ] All required fields are present
- [ ] Valid JSON that can be parsed

IMPORTANT:
- **Deduplication is CRITICAL** - always check against existing projects first
- Only suggest NEW projects if meaningfully different from existing ones
- Generate meaningful, actionable project names (not just event titles)
- Create rich, comprehensive context using the BuildOS framework
- **Enrich task details** with meeting metadata (attendees, location, links)
- **ALL tasks must have future dates (>= ${today})**
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

			const systemPrompt =
				'You are an expert in analyzing calendar events to identify potential projects. Always respond with valid JSON following the specified schema.';

			// Save prompt for auditing in development mode
			await savePromptForAudit({
				systemPrompt,
				userPrompt: prompt,
				scenarioType: 'calendar-analysis',
				metadata: {
					userId,
					eventCount: events.length,
					pastEventCount: pastEvents.length,
					upcomingEventCount: upcomingEvents.length,
					minConfidence,
					existingProjectCount: existingProjects?.length || 0,
					timestamp: new Date().toISOString()
				}
			});

			// Use SmartLLMService's getJSONResponse method for better type safety and model routing
			const response = await this.llmService.getJSONResponse<{
				suggestions: ProjectSuggestion[];
			}>({
				systemPrompt,
				userPrompt: prompt,
				userId, // System-level operation
				profile: 'balanced', // Use balanced profile for good accuracy/speed tradeoff
				temperature: 0.3,
				validation: {
					retryOnParseError: true,
					validateSchema: true,
					maxRetries: 2
				},
				operationType: 'calendar_analysis'
			});

			// Filter by minimum confidence score
			const suggestions = response.suggestions || [];

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

			// Validate that all tasks have future dates
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			filtered.forEach((suggestion) => {
				if (suggestion.suggested_tasks && Array.isArray(suggestion.suggested_tasks)) {
					const pastTasks = suggestion.suggested_tasks.filter((task) => {
						if (!task.start_date) return false;
						const taskDate = new Date(task.start_date);
						return taskDate < today;
					});

					if (pastTasks.length > 0) {
						console.warn(
							`[Calendar Analysis] WARNING: Project "${suggestion.name}" has ${pastTasks.length} task(s) with past dates. These should not have been generated by the LLM.`,
							pastTasks.map((t) => ({ title: t.title, start_date: t.start_date }))
						);
					}
				}

				// Validate that each project has at least one task
				const taskCount = suggestion.suggested_tasks?.length || 0;
				if (taskCount === 0) {
					console.warn(
						`[Calendar Analysis] WARNING: Project "${suggestion.name}" has no tasks. At least 2 tasks should be generated.`
					);
				} else if (taskCount === 1) {
					console.warn(
						`[Calendar Analysis] WARNING: Project "${suggestion.name}" has only 1 task. At least 2 tasks should be generated.`
					);
				}
			});

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
		modifications?: CalendarSuggestionModifications
	): Promise<ServiceResponse<any>> {
		try {
			const suggestion = await this.getSuggestion(suggestionId, userId);
			if (!suggestion) {
				throw new Error('Suggestion not found');
			}

			const parsedEventPatterns =
				parseJsonValue<CalendarSuggestionEventPatterns>(suggestion.event_patterns) ??
				({} as CalendarSuggestionEventPatterns);
			const parsedTasks =
				parseJsonValue<CalendarSuggestionTask[]>(suggestion.suggested_tasks) ?? [];

			const preparedTasks = prepareCalendarTasks(
				Array.isArray(parsedTasks) ? parsedTasks : [],
				suggestionId,
				modifications
			);

			const suggestionInput: CalendarSuggestionInput = {
				...suggestion,
				suggested_tasks: preparedTasks,
				event_patterns: parsedEventPatterns
			};

			const addToExisting = !!parsedEventPatterns?.add_to_existing;
			const existingProjectId = parsedEventPatterns?.existing_project_id ?? null;

			if (addToExisting && existingProjectId) {
				if (DEBUG_LOGGING) {
					console.log(
						`[Calendar Analysis] Adding tasks to existing project: ${existingProjectId}`
					);
				}

				const { taskCount, planId } = await addTasksToExistingProject(
					this.supabase,
					existingProjectId,
					userId,
					preparedTasks
				);

				await this.updateSuggestionStatus(suggestionId, 'accepted');

				return {
					success: true,
					data: {
						projectId: existingProjectId,
						tasksCreated: taskCount,
						addedToExisting: true,
						planId
					}
				};
			}

			const projectSpec = convertCalendarSuggestionToProjectSpec(suggestionInput, {
				name: modifications?.name,
				description: modifications?.description,
				context: modifications?.context,
				includeTasks: modifications?.includeTasks
			});

			const { project_id, counts } = await instantiateProject(
				this.supabase,
				projectSpec,
				userId
			);

			await this.updateSuggestionStatus(suggestionId, 'accepted', project_id);

			return {
				success: true,
				data: {
					projectId: project_id,
					counts,
					addedToExisting: false
				}
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
		const { data: actorId, error: actorError } = await this.supabase.rpc(
			'ensure_actor_for_user',
			{
				p_user_id: userId
			}
		);

		if (actorError || !actorId) {
			this.errorLogger.logError(actorError ?? new Error('Missing actor id'), {
				userId,
				metadata: { operation: 'get_calendar_projects_actor' }
			});
			return [];
		}

		const { data: projects, error: projectsError } = await this.supabase
			.from('onto_projects')
			.select('id, name, description, created_at, props')
			.eq('created_by', actorId)
			.is('deleted_at', null)
			.order('created_at', { ascending: false });

		if (projectsError) {
			this.errorLogger.logError(projectsError, {
				userId,
				metadata: { operation: 'get_calendar_projects' }
			});
			return [];
		}

		const calendarProjects = (projects ?? []).filter((project) => {
			const props = (project.props as Record<string, unknown> | null) ?? {};
			const source = props.source;
			const sourceMetadata =
				(props.source_metadata as Record<string, unknown> | null)?.source ?? null;
			return source === 'calendar_analysis' || sourceMetadata === 'calendar_analysis';
		});

		if (calendarProjects.length === 0) {
			return [];
		}

		const projectIds = calendarProjects.map((project) => project.id);
		const { data: tasks, error: tasksError } = await this.supabase
			.from('onto_tasks')
			.select('id, project_id')
			.in('project_id', projectIds)
			.is('deleted_at', null);

		if (tasksError) {
			this.errorLogger.logError(tasksError, {
				userId,
				metadata: { operation: 'get_calendar_projects_task_counts' }
			});
		}

		const taskCountByProject = new Map<string, number>();
		for (const task of tasks ?? []) {
			taskCountByProject.set(
				task.project_id,
				(taskCountByProject.get(task.project_id) ?? 0) + 1
			);
		}

		return calendarProjects.map((project) => ({
			id: project.id,
			name: project.name,
			description: project.description,
			created_at: project.created_at,
			task_count: taskCountByProject.get(project.id) ?? 0
		}));
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
				slug: suggestion.slug,
				// CRITICAL: Store deduplication fields
				add_to_existing: suggestion.add_to_existing,
				existing_project_id: suggestion.existing_project_id,
				deduplication_reasoning: suggestion.deduplication_reasoning
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
		const updates: {
			status: 'accepted' | 'rejected' | 'modified' | 'deferred';
			status_changed_at: string;
			updated_at: string;
			created_project_id?: string | null;
			rejection_reason?: string;
		} = {
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
