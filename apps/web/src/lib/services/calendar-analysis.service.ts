// apps/web/src/lib/services/calendar-analysis.service.ts
import { ApiService, type ServiceResponse } from './base/api-service';
import { CalendarService, type CalendarEvent } from './calendar-service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { instantiateProject } from '$lib/services/ontology/instantiation.service';
import {
	convertCalendarSuggestionToProjectSpec,
	type CalendarSuggestionInput,
	type CalendarSuggestionEventPatterns,
	type CalendarSuggestionTask
} from '$lib/services/ontology/braindump-to-ontology-adapter';
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorLoggerService } from './errorLogger.service';
import { generateProjectContextFramework } from './prompts/core/prompt-components';
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

	// Project suggestion fields mapped into ontology ProjectSpec.project
	name: string; // Required project name
	description: string; // Project description
	context: string; // Rich markdown context following BuildOS framework
	status?: 'active' | 'paused' | 'completed' | 'archived';
	start_date?: string; // YYYY-MM-DD format
	end_date?: string; // YYYY-MM-DD format (optional)
	tags?: string[];

	// Calendar analysis specific fields
	event_ids: string[];
	confidence: number;
	reasoning: string;
	keywords: string[];

	// Suggested tasks following BuildOS task model
	suggested_tasks?: Array<{
		title: string; // Required, max 255 chars
		description: string; // Required
		details?: string; // Comprehensive specifics
		status?: 'backlog' | 'in_progress' | 'done' | 'blocked';
		state_key?: 'todo' | 'in_progress' | 'done' | 'blocked';
		priority?: 'low' | 'medium' | 'high' | 'urgent' | number;
		task_type?: 'one_off' | 'recurring';
		type_key?: string;
		duration_minutes?: number;
		start_date?: string; // YYYY-MM-DDTHH:MM:SS for scheduling
		due_at?: string; // YYYY-MM-DDTHH:MM:SS (optional)
		recurrence_pattern?:
			| 'daily'
			| 'weekdays'
			| 'weekly'
			| 'biweekly'
			| 'monthly'
			| 'quarterly'
			| 'yearly';
		recurrence_ends?: string; // YYYY-MM-DD
		recurrence_rrule?: string;
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
const CALENDAR_ANALYSIS_DEBUG_ENV = process.env.CALENDAR_ANALYSIS_DEBUG;
const DEBUG_LOGGING =
	CALENDAR_ANALYSIS_DEBUG_ENV === 'true' ||
	(CALENDAR_ANALYSIS_DEBUG_ENV !== 'false' && process.env.NODE_ENV !== 'production');

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

			// Part 2: Create ontology project suggestions from event groups
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
	 * Part 2: Create BuildOS ontology project suggestions from event groups
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

		if (DEBUG_LOGGING) {
			console.log(`[Calendar Analysis Part 2] Processing ${eventGroups.length} event groups`);
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

		const userPrompt = `You are creating BuildOS ontology project suggestions from calendar event groups.

**Today's date**: ${todayString}

## Event Groups to Process

You've already identified ${eventGroups.length} event groups. Now create BuildOS projects for each group.

${eventGroupsSection}

## Ontology-First Contract (CRITICAL)

Your response is converted into an ontology \`ProjectSpec\` and instantiated into ontology entities.

Each accepted suggestion creates a **new** ontology project:
- \`onto_projects\` (project root)
- \`onto_documents\` (context document from \`context\`, type \`document.context.project\`)
- \`onto_plans\` (auto-created execution plan)
- \`onto_tasks\` (from \`suggested_tasks\`)
- \`onto_edges\` (project→plan, plan→task, project→context-document)

**No merge behavior is supported in this flow.**
Do not output merge fields (e.g. \`add_to_existing\`, \`existing_project_id\`, \`deduplication_reasoning\`).
Do not design for legacy \`projects\`/\`tasks\` tables.

### Context Markdown Guidance
${generateProjectContextFramework('condensed')}

## Output Format

Return JSON:

{
  "suggestions": [
    {
      "event_group_id": "group-1",

      // Project suggestion fields (mapped to ontology project + context document)
      "name": "Specific project name",
      "description": "2-3 sentence description",
      "context": "Comprehensive markdown using BuildOS framework above",
      "status": "active", // suggestion metadata; ontology project is created as active
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD" or null,
      "tags": ["tag1", "tag2"],

      // Metadata
      "event_ids": ["all", "event", "ids"],
      "confidence": 0.8,
      "reasoning": "Why this is a project",
      "keywords": ["keyword1", "keyword2"],

      // Tasks (see task generation rules below)
      "suggested_tasks": [
        {
          "title": "Task title",
          "description": "Task description",
          "details": "Comprehensive details including event info",
          "status": "backlog", // mapped to ontology state_key
          "state_key": "todo", // optional ontology-native alternative
          "priority": "medium",
          "task_type": "one_off" | "recurring",
          "type_key": "task.execute", // optional; inferred if omitted
          "recurrence_pattern": "daily|weekly|monthly|etc" or null,
          "recurrence_ends": "YYYY-MM-DD" or null,
          "recurrence_rrule": "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20251215T235959Z" or null,
          "duration_minutes": 60,
          "start_date": "YYYY-MM-DDTHH:MM:SS",
          "due_at": "YYYY-MM-DDTHH:MM:SS" or null,
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

### 4. Ontology Contract Compliance

- Follow the schema in this prompt exactly
- Keep project context strategic (for ontology context document)
- Keep tasks actionable and schedulable (for ontology task instantiation)
- Use proper date formats (YYYY-MM-DD or ISO 8601 for timestamps)
- Do not output legacy table names, SQL, or merge fields`;

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

		const eventGroups = await this.analyzeEventPatterns({ events, userId });
		const suggestions = await this.createProjectsFromGroups({ eventGroups, events, userId });
		return suggestions.filter((suggestion) => suggestion.confidence >= minConfidence);
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
					counts
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
				start_date: suggestion.start_date,
				end_date: suggestion.end_date,
				tags: suggestion.tags
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
