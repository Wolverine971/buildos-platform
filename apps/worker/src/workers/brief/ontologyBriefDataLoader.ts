// apps/worker/src/workers/brief/ontologyBriefDataLoader.ts
/**
 * Ontology Brief Data Loader
 * Fetches data from ontology tables using graph loader pattern for daily brief generation.
 *
 * Spec Reference: /docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database } from '@buildos/shared-types';
import { formatInTimeZone, zonedTimeToUtc } from 'date-fns-tz';
import { addDays, subDays, subHours, parseISO, differenceInDays } from 'date-fns';

// ============================================================================
// ENTITY CAPS (from PROJECT_CONTEXT_ENRICHMENT_SPEC.md)
// ============================================================================

export const ENTITY_CAPS = {
	GOALS: 5,
	RISKS: 5,
	REQUIREMENTS: 5,
	DOCUMENTS: 5,
	MILESTONES: 5,
	PLANS: 5,
	TASKS_RECENT: 10,
	TASKS_UPCOMING: 5
} as const;

import type {
	OntoProject,
	OntoTask,
	OntoGoal,
	OntoPlan,
	OntoMilestone,
	OntoRisk,
	OntoDocument,
	OntoRequirement,
	OntoEdge,
	OntoActor,
	OntoProjectWithRelations,
	CategorizedTasks,
	GoalProgress,
	MilestoneStatus,
	UnblockingTask,
	RecentUpdates,
	PlanProgress,
	OntologyBriefData,
	ProjectBriefData,
	OntologyBriefMetadata,
	ProjectActivityEntry,
	ProjectRecentChange,
	ProjectRecentChangeKind,
	CalendarBriefItem,
	CalendarBriefItemKind,
	CalendarBriefSection,
	CalendarBriefCounts,
	CalendarBriefSource,
	CalendarBriefSourceLabel
} from './ontologyBriefTypes.js';

export const CALENDAR_BRIEF_CAPS = {
	TODAY: 8,
	UPCOMING: 5,
	UPCOMING_DAYS: 7,
	QUERY_LIMIT: 80
} as const;

type OntoEventSyncRow = Database['public']['Tables']['onto_event_sync']['Row'];
type TaskCalendarEventRow = Database['public']['Tables']['task_calendar_events']['Row'];

type OntoCalendarEventRow = Pick<
	Database['public']['Tables']['onto_events']['Row'],
	| 'id'
	| 'title'
	| 'start_at'
	| 'end_at'
	| 'all_day'
	| 'timezone'
	| 'project_id'
	| 'owner_entity_type'
	| 'owner_entity_id'
	| 'state_key'
	| 'type_key'
	| 'props'
	| 'external_link'
	| 'sync_status'
	| 'sync_error'
	| 'deleted_at'
	| 'created_at'
	| 'updated_at'
> & {
	onto_event_sync?: OntoEventSyncRow[] | null;
};

// ============================================================================
// TIMEZONE UTILITIES
// ============================================================================

/**
 * Calculate a date string N days from a given date, respecting the user's timezone.
 * Uses noon to avoid DST edge cases where midnight might not exist or be ambiguous.
 *
 * @param dateStr - The starting date as yyyy-MM-dd in user's local timezone
 * @param days - Number of days to add (can be negative)
 * @param timezone - The user's timezone (e.g., 'America/Los_Angeles')
 * @returns The resulting date as yyyy-MM-dd in user's local timezone
 */
function addDaysToLocalDate(dateStr: string, days: number, timezone: string): string {
	// Convert the user's local date at noon to a UTC Date object
	// Using noon avoids DST edge cases where midnight might not exist
	const localDateAtNoon = zonedTimeToUtc(`${dateStr} 12:00:00`, timezone);
	// Add the specified number of days
	const resultDate = addDays(localDateAtNoon, days);
	// Format back to yyyy-MM-dd in user's timezone
	return formatInTimeZone(resultDate, timezone, 'yyyy-MM-dd');
}

/**
 * Get "now" as a yyyy-MM-dd string in the user's timezone.
 *
 * @param timezone - The user's timezone
 * @returns Today's date as yyyy-MM-dd in user's timezone
 */
function getTodayInTimezone(timezone: string): string {
	return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
}

function getLocalDayUtcBounds(dateStr: string, timezone: string): { start: Date; end: Date } {
	const start = zonedTimeToUtc(`${dateStr} 00:00:00`, timezone);
	const nextDateStr = addDaysToLocalDate(dateStr, 1, timezone);
	const end = zonedTimeToUtc(`${nextDateStr} 00:00:00`, timezone);
	return { start, end };
}

function getCalendarBriefWindow(
	briefDate: string,
	timezone: string
): {
	todayStart: Date;
	windowEnd: Date;
} {
	const today = getLocalDayUtcBounds(briefDate, timezone);
	const windowEndDate = addDaysToLocalDate(
		briefDate,
		CALENDAR_BRIEF_CAPS.UPCOMING_DAYS + 1,
		timezone
	);
	return {
		todayStart: today.start,
		windowEnd: zonedTimeToUtc(`${windowEndDate} 00:00:00`, timezone)
	};
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	return value as Record<string, unknown>;
}

function getStringProp(record: Record<string, unknown>, key: string): string | null {
	const value = record[key];
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isCalendarItemKind(value: string | null): value is CalendarBriefItemKind {
	return value === 'event' || value === 'range' || value === 'start' || value === 'due';
}

function getCalendarSourceLabel(source: CalendarBriefSource): CalendarBriefSourceLabel {
	switch (source) {
		case 'google':
			return 'Google Calendar';
		case 'sync_issue':
			return 'Google sync issue';
		case 'internal':
			return 'Internal only';
	}
}

function hasGoogleCalendarLink(value: string | null | undefined): boolean {
	if (!value) return false;
	const normalized = value.toLowerCase();
	return (
		normalized.includes('calendar.google.com') ||
		normalized.includes('google.com/calendar') ||
		normalized.includes('www.google.com/calendar')
	);
}

function createCalendarCounts(): CalendarBriefCounts {
	return {
		total: 0,
		google: 0,
		internal: 0,
		syncIssue: 0
	};
}

function countCalendarItems(items: CalendarBriefItem[]): CalendarBriefCounts {
	const counts = createCalendarCounts();
	for (const item of items) {
		counts.total++;
		if (item.source === 'google') {
			counts.google++;
		} else if (item.source === 'sync_issue') {
			counts.syncIssue++;
		} else {
			counts.internal++;
		}
	}
	return counts;
}

export function createEmptyCalendarBriefSection(): CalendarBriefSection {
	return {
		allItems: [],
		today: [],
		upcoming: [],
		todayTotal: 0,
		upcomingTotal: 0,
		hiddenTodayCount: 0,
		hiddenUpcomingCount: 0,
		counts: {
			today: createCalendarCounts(),
			upcoming: createCalendarCounts(),
			all: createCalendarCounts()
		}
	};
}

function formatCalendarDisplayTime(
	startAt: string,
	endAt: string | null,
	allDay: boolean,
	timezone: string
): string {
	if (allDay) return 'All day';

	const start = parseISO(startAt);
	const startLabel = formatInTimeZone(start, timezone, 'h:mm a');
	if (!endAt) return startLabel;

	const end = parseISO(endAt);
	if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
		return startLabel;
	}

	const startDate = formatInTimeZone(start, timezone, 'yyyy-MM-dd');
	const endDate = formatInTimeZone(end, timezone, 'yyyy-MM-dd');
	if (startDate !== endDate) {
		return `${startLabel}-${formatInTimeZone(end, timezone, 'MMM d h:mm a')}`;
	}

	return `${startLabel}-${formatInTimeZone(end, timezone, 'h:mm a')}`;
}

function formatCalendarDisplayDate(startAt: string, timezone: string): string {
	return formatInTimeZone(parseISO(startAt), timezone, 'EEE MMM d');
}

function getCalendarLocalDate(item: Pick<CalendarBriefItem, 'startAt'>, timezone: string): string {
	return formatInTimeZone(parseISO(item.startAt), timezone, 'yyyy-MM-dd');
}

function getCalendarItemEnd(item: Pick<CalendarBriefItem, 'startAt' | 'endAt'>): Date | null {
	const start = parseISO(item.startAt);
	if (Number.isNaN(start.getTime())) return null;
	if (!item.endAt) return start;

	const end = parseISO(item.endAt);
	if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
		return start;
	}
	return end;
}

function calendarItemOverlapsRange(
	item: Pick<CalendarBriefItem, 'startAt' | 'endAt'>,
	rangeStart: Date,
	rangeEnd: Date
): boolean {
	const start = parseISO(item.startAt);
	const end = getCalendarItemEnd(item);
	if (Number.isNaN(start.getTime()) || !end) return false;
	if (end.getTime() === start.getTime()) {
		return start >= rangeStart && start < rangeEnd;
	}
	return start < rangeEnd && end > rangeStart;
}

function compareCalendarItems(
	a: CalendarBriefItem,
	b: CalendarBriefItem,
	timezone: string
): number {
	const aLocalDate = getCalendarLocalDate(a, timezone);
	const bLocalDate = getCalendarLocalDate(b, timezone);
	const dateDelta = aLocalDate.localeCompare(bLocalDate);
	if (dateDelta !== 0) return dateDelta;

	if (a.allDay !== b.allDay) {
		return a.allDay ? -1 : 1;
	}

	if (a.allDay && b.allDay) {
		const titleDelta = a.title.localeCompare(b.title);
		if (titleDelta !== 0) return titleDelta;
	}

	const startDelta = parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime();
	if (startDelta !== 0) return startDelta;

	const sourceOrder: Record<CalendarBriefSource, number> = {
		google: 0,
		sync_issue: 1,
		internal: 2
	};
	const sourceDelta = sourceOrder[a.source] - sourceOrder[b.source];
	if (sourceDelta !== 0) return sourceDelta;

	return a.title.localeCompare(b.title);
}

function getCalendarDedupeKey(item: CalendarBriefItem): string {
	if (item.googleEventId) {
		return `google:${item.googleEventId}`;
	}
	if (item.eventId) {
		return `event:${item.eventId}`;
	}
	if (item.taskId) {
		return `task:${item.taskId}:${item.itemKind}:${item.startAt}`;
	}
	return `fallback:${item.title.toLowerCase()}:${item.startAt}:${item.endAt ?? ''}`;
}

function getCalendarDedupePriority(item: CalendarBriefItem): number {
	if (item.source === 'google') return 0;
	if (item.source === 'sync_issue') return 1;
	if (item.eventId) return 2;
	if (item.taskId) return 3;
	return 4;
}

function dedupeCalendarItems(items: CalendarBriefItem[]): CalendarBriefItem[] {
	const byKey = new Map<string, CalendarBriefItem>();
	for (const item of items) {
		const key = getCalendarDedupeKey(item);
		const existing = byKey.get(key);
		if (!existing || getCalendarDedupePriority(item) < getCalendarDedupePriority(existing)) {
			byKey.set(key, item);
		}
	}
	return Array.from(byKey.values());
}

export function selectCalendarBriefItems(
	items: CalendarBriefItem[],
	briefDate: string,
	timezone: string
): CalendarBriefSection {
	if (items.length === 0) {
		return createEmptyCalendarBriefSection();
	}

	const todayBounds = getLocalDayUtcBounds(briefDate, timezone);
	const tomorrowDate = addDaysToLocalDate(briefDate, 1, timezone);
	const upcomingEndDate = addDaysToLocalDate(
		briefDate,
		CALENDAR_BRIEF_CAPS.UPCOMING_DAYS,
		timezone
	);
	const upcomingEndBounds = getLocalDayUtcBounds(upcomingEndDate, timezone);
	const deduped = dedupeCalendarItems(items).sort((a, b) =>
		compareCalendarItems(a, b, timezone)
	);
	const todayAll = deduped.filter((item) =>
		calendarItemOverlapsRange(item, todayBounds.start, todayBounds.end)
	);
	const upcomingAll = deduped.filter((item) => {
		if (todayAll.includes(item)) return false;
		const localDate = getCalendarLocalDate(item, timezone);
		return (
			localDate >= tomorrowDate &&
			localDate <= upcomingEndDate &&
			calendarItemOverlapsRange(item, todayBounds.end, upcomingEndBounds.end)
		);
	});

	const today = todayAll.slice(0, CALENDAR_BRIEF_CAPS.TODAY);
	const upcoming = upcomingAll.slice(0, CALENDAR_BRIEF_CAPS.UPCOMING);
	const allVisible = [...today, ...upcoming];
	const allInWindow = [...todayAll, ...upcomingAll];

	return {
		allItems: allInWindow,
		today,
		upcoming,
		todayTotal: todayAll.length,
		upcomingTotal: upcomingAll.length,
		hiddenTodayCount: Math.max(0, todayAll.length - today.length),
		hiddenUpcomingCount: Math.max(0, upcomingAll.length - upcoming.length),
		counts: {
			today: countCalendarItems(todayAll),
			upcoming: countCalendarItems(upcomingAll),
			all: countCalendarItems(allInWindow.length > 0 ? allInWindow : allVisible)
		}
	};
}

function isTaskCompleteOrCancelled(task: OntoTask): boolean {
	const state = String(task.state_key);
	return state === 'done' || state === 'cancelled' || state === 'archived';
}

function isWithinCalendarWindow(timestamp: string | null, start: Date, end: Date): boolean {
	if (!timestamp) return false;
	const date = parseISO(timestamp);
	if (Number.isNaN(date.getTime())) return false;
	return date >= start && date < end;
}

function createCalendarItem(params: {
	id: string;
	title: string | null;
	startAt: string;
	endAt: string | null;
	allDay?: boolean | null;
	timezone?: string | null;
	projectId?: string | null;
	projectName?: string | null;
	taskId?: string | null;
	eventId?: string | null;
	itemType: 'event' | 'task';
	itemKind: CalendarBriefItemKind;
	stateKey?: string | null;
	source: CalendarBriefSource;
	googleEventId?: string | null;
	googleCalendarId?: string | null;
	externalLink?: string | null;
	displayTimezone: string;
}): CalendarBriefItem {
	return {
		id: params.id,
		title: params.title?.trim() || 'Untitled',
		startAt: params.startAt,
		endAt: params.endAt,
		allDay: params.allDay ?? false,
		timezone: params.timezone ?? null,
		projectId: params.projectId ?? null,
		projectName: params.projectName ?? null,
		taskId: params.taskId ?? null,
		eventId: params.eventId ?? null,
		itemType: params.itemType,
		itemKind: params.itemKind,
		stateKey: params.stateKey ?? null,
		source: params.source,
		sourceLabel: getCalendarSourceLabel(params.source),
		googleEventId: params.googleEventId ?? null,
		googleCalendarId: params.googleCalendarId ?? null,
		externalLink: params.externalLink ?? null,
		displayTime: formatCalendarDisplayTime(
			params.startAt,
			params.endAt,
			params.allDay ?? false,
			params.displayTimezone
		),
		displayDate: formatCalendarDisplayDate(params.startAt, params.displayTimezone)
	};
}

function resolveOntologyEventTaskId(row: OntoCalendarEventRow): string | null {
	const props = asRecord(row.props);
	if (row.owner_entity_type === 'task' && row.owner_entity_id) {
		return row.owner_entity_id;
	}
	const propTaskId = getStringProp(props, 'task_id');
	return propTaskId;
}

function resolveOntologyEventKind(row: OntoCalendarEventRow): CalendarBriefItemKind {
	const props = asRecord(row.props);
	const kind = getStringProp(props, 'task_event_kind');
	return isCalendarItemKind(kind) ? kind : 'event';
}

function resolveOntologyEventSource(
	row: OntoCalendarEventRow,
	userId: string
): {
	source: CalendarBriefSource;
	googleEventId: string | null;
	googleCalendarId: string | null;
} {
	const props = asRecord(row.props);
	const syncRows = row.onto_event_sync ?? [];
	const syncRow =
		syncRows.find((sync) => sync.user_id === userId && sync.provider === 'google') ??
		syncRows.find((sync) => !sync.user_id && sync.provider === 'google') ??
		null;

	const propProvider = getStringProp(props, 'provider');
	const propExternalEventId = getStringProp(props, 'external_event_id');
	const propExternalCalendarId = getStringProp(props, 'external_calendar_id');
	const googleEventId = syncRow?.external_event_id ?? propExternalEventId;
	const googleCalendarId = propExternalCalendarId ?? syncRow?.calendar_id ?? null;
	const status = syncRow?.sync_status ?? row.sync_status ?? null;
	const syncError = syncRow?.sync_error ?? row.sync_error ?? null;
	const hasGoogleIntent =
		syncRow !== null ||
		propProvider === 'google' ||
		Boolean(googleEventId) ||
		hasGoogleCalendarLink(row.external_link);

	if (hasGoogleIntent && (status === 'failed' || Boolean(syncError))) {
		return {
			source: 'sync_issue',
			googleEventId,
			googleCalendarId
		};
	}

	if (hasGoogleIntent) {
		return {
			source: 'google',
			googleEventId,
			googleCalendarId
		};
	}

	return {
		source: 'internal',
		googleEventId: null,
		googleCalendarId: null
	};
}

function normalizeOntologyCalendarEvent(
	row: OntoCalendarEventRow,
	userId: string,
	projectNameMap: Map<string, string>,
	timezone: string
): CalendarBriefItem | null {
	if (!row.start_at || row.deleted_at || row.state_key === 'cancelled') {
		return null;
	}

	const kind = resolveOntologyEventKind(row);
	const taskId = resolveOntologyEventTaskId(row);
	const itemType = kind !== 'event' || taskId ? 'task' : 'event';
	const source = resolveOntologyEventSource(row, userId);

	return createCalendarItem({
		id: `onto_event:${row.id}`,
		title: row.title,
		startAt: row.start_at,
		endAt: row.end_at,
		allDay: row.all_day,
		timezone: row.timezone,
		projectId: row.project_id,
		projectName: row.project_id ? (projectNameMap.get(row.project_id) ?? null) : null,
		taskId,
		eventId: row.id,
		itemType,
		itemKind: kind,
		stateKey: row.state_key,
		source: source.source,
		googleEventId: source.googleEventId,
		googleCalendarId: source.googleCalendarId,
		externalLink: row.external_link,
		displayTimezone: timezone
	});
}

function normalizeLegacyTaskCalendarEvent(
	row: TaskCalendarEventRow,
	taskProjectMap: Map<string, { projectId: string; projectName: string }>,
	timezone: string
): CalendarBriefItem | null {
	const syncStatus = String(row.sync_status);
	if (!row.event_start || syncStatus === 'cancelled') {
		return null;
	}

	const taskProject = taskProjectMap.get(row.task_id);
	let source: CalendarBriefSource = 'internal';
	if (syncStatus === 'synced') {
		source = 'google';
	} else if (row.calendar_event_id || row.sync_error) {
		source = 'sync_issue';
	}

	return createCalendarItem({
		id: `legacy_task_calendar:${row.id}`,
		title: row.event_title,
		startAt: row.event_start,
		endAt: row.event_end,
		allDay: false,
		timezone: null,
		projectId: taskProject?.projectId ?? null,
		projectName: taskProject?.projectName ?? null,
		taskId: row.task_id,
		eventId: null,
		itemType: 'task',
		itemKind: 'range',
		stateKey: row.sync_status,
		source,
		googleEventId: row.calendar_event_id,
		googleCalendarId: row.calendar_id,
		externalLink: row.event_link,
		displayTimezone: timezone
	});
}

function buildSyntheticTaskCalendarItems(
	tasks: OntoTask[],
	projectNameMap: Map<string, string>,
	tasksWithExplicitEvents: Set<string>,
	windowStart: Date,
	windowEnd: Date,
	timezone: string
): CalendarBriefItem[] {
	const items: CalendarBriefItem[] = [];
	const maxRangeMs = 10 * 60 * 60 * 1000;

	for (const task of tasks) {
		if (tasksWithExplicitEvents.has(task.id) || isTaskCompleteOrCancelled(task)) {
			continue;
		}

		const hasStart = isWithinCalendarWindow(task.start_at, windowStart, windowEnd);
		const hasDue = isWithinCalendarWindow(task.due_at, windowStart, windowEnd);
		if (!hasStart && !hasDue) {
			continue;
		}

		const startDate = task.start_at ? parseISO(task.start_at) : null;
		const dueDate = task.due_at ? parseISO(task.due_at) : null;
		const shouldCreateRange =
			startDate &&
			dueDate &&
			dueDate > startDate &&
			dueDate.getTime() - startDate.getTime() <= maxRangeMs &&
			isWithinCalendarWindow(task.start_at, windowStart, windowEnd);

		if (shouldCreateRange) {
			items.push(
				createCalendarItem({
					id: `task:${task.id}:range`,
					title: task.title,
					startAt: task.start_at!,
					endAt: task.due_at,
					allDay: false,
					timezone: null,
					projectId: task.project_id,
					projectName: projectNameMap.get(task.project_id) ?? null,
					taskId: task.id,
					eventId: null,
					itemType: 'task',
					itemKind: 'range',
					stateKey: task.state_key,
					source: 'internal',
					displayTimezone: timezone
				})
			);
			continue;
		}

		if (hasStart && task.start_at) {
			items.push(
				createCalendarItem({
					id: `task:${task.id}:start`,
					title: `Start: ${task.title}`,
					startAt: task.start_at,
					endAt: new Date(
						parseISO(task.start_at).getTime() + 30 * 60 * 1000
					).toISOString(),
					allDay: false,
					timezone: null,
					projectId: task.project_id,
					projectName: projectNameMap.get(task.project_id) ?? null,
					taskId: task.id,
					eventId: null,
					itemType: 'task',
					itemKind: 'start',
					stateKey: task.state_key,
					source: 'internal',
					displayTimezone: timezone
				})
			);
		}

		if (hasDue && task.due_at) {
			const due = parseISO(task.due_at);
			items.push(
				createCalendarItem({
					id: `task:${task.id}:due`,
					title: `Due: ${task.title}`,
					startAt: new Date(due.getTime() - 30 * 60 * 1000).toISOString(),
					endAt: task.due_at,
					allDay: false,
					timezone: null,
					projectId: task.project_id,
					projectName: projectNameMap.get(task.project_id) ?? null,
					taskId: task.id,
					eventId: null,
					itemType: 'task',
					itemKind: 'due',
					stateKey: task.state_key,
					source: 'internal',
					displayTimezone: timezone
				})
			);
		}
	}

	return items;
}

// ============================================================================
// TASK CATEGORIZATION UTILITIES
// ============================================================================

/**
 * Categorize tasks by time, status, and work mode
 * Uses 7-day windows per PROJECT_CONTEXT_ENRICHMENT_SPEC.md
 */
export function categorizeTasks(
	tasks: OntoTask[],
	briefDate: string,
	timezone: string
): CategorizedTasks {
	const now = new Date();
	const cutoff24h = subHours(now, 24); // For recently completed
	const cutoff7d = subDays(now, 7); // For recently updated (per spec)
	const todayStr = briefDate; // yyyy-MM-dd (user-local date)
	// Calculate week end date (7 days from today) in user's timezone
	const weekEndStr = addDaysToLocalDate(todayStr, 7, timezone);

	// Time-based categorization
	const todaysTasks: OntoTask[] = [];
	const overdueTasks: OntoTask[] = [];
	const upcomingTasks: OntoTask[] = [];
	const recentlyCompleted: OntoTask[] = [];

	// Status-based
	const blockedTasks: OntoTask[] = [];
	const inProgressTasks: OntoTask[] = [];

	// Work mode categories
	const executeTasks: OntoTask[] = [];
	const createTasks: OntoTask[] = [];
	const refineTasks: OntoTask[] = [];
	const researchTasks: OntoTask[] = [];
	const reviewTasks: OntoTask[] = [];
	const coordinateTasks: OntoTask[] = [];
	const adminTasks: OntoTask[] = [];
	const planTasks: OntoTask[] = [];

	// Relationship-based (populated later via edges)
	const unblockingTasks: OntoTask[] = [];
	const goalAlignedTasks: OntoTask[] = [];
	const recentlyUpdated: OntoTask[] = [];

	const taskSort = (a: OntoTask, b: OntoTask): number => {
		const priorityA = a.priority ?? Number.POSITIVE_INFINITY;
		const priorityB = b.priority ?? Number.POSITIVE_INFINITY;
		if (priorityA !== priorityB) return priorityA - priorityB;

		const dueA = a.due_at ? parseISO(a.due_at).getTime() : Number.POSITIVE_INFINITY;
		const dueB = b.due_at ? parseISO(b.due_at).getTime() : Number.POSITIVE_INFINITY;
		if (dueA !== dueB) return dueA - dueB;

		return a.title.localeCompare(b.title);
	};

	for (const task of tasks) {
		const dueAt = task.due_at ? parseISO(task.due_at) : null;
		const dueDateStr = dueAt ? formatInTimeZone(dueAt, timezone, 'yyyy-MM-dd') : null;
		const startAt = task.start_at ? parseISO(task.start_at) : null;
		const startDateStr = startAt ? formatInTimeZone(startAt, timezone, 'yyyy-MM-dd') : null;
		const updatedAt = parseISO(task.updated_at);
		const state = task.state_key;

		// Recently updated (last 7 days, per PROJECT_CONTEXT_ENRICHMENT_SPEC.md)
		if (updatedAt >= cutoff7d && state !== 'done' && state !== 'blocked') {
			recentlyUpdated.push(task);
		}

		// Time-based
		if (state === 'done') {
			// Recently completed uses 24h window
			if (updatedAt >= cutoff24h) {
				recentlyCompleted.push(task);
			}
		} else if (dueDateStr || startDateStr) {
			// Check overdue first (only for tasks with due dates)
			if (dueDateStr && dueDateStr < todayStr) {
				overdueTasks.push(task);
			} else if (dueDateStr === todayStr) {
				todaysTasks.push(task);
			} else {
				// Upcoming: due_at in next 7 days OR start_at in next 7 days (per spec)
				const isDueUpcoming =
					dueDateStr && dueDateStr > todayStr && dueDateStr <= weekEndStr;
				const isStartUpcoming =
					startDateStr && startDateStr >= todayStr && startDateStr <= weekEndStr;
				if (isDueUpcoming || isStartUpcoming) {
					if (state !== 'blocked') {
						upcomingTasks.push(task);
					}
				}
			}
		}

		// Status-based
		if (state === 'blocked') {
			blockedTasks.push(task);
		} else if (state === 'in_progress') {
			inProgressTasks.push(task);
		}

		if (state === 'done') {
			continue;
		}

		// Work mode categorization (based on type_key)
		const typeKey = task.type_key || '';
		if (typeKey.startsWith('task.execute') || typeKey.includes('action')) {
			executeTasks.push(task);
		} else if (typeKey.startsWith('task.create') || typeKey.includes('produce')) {
			createTasks.push(task);
		} else if (
			typeKey.startsWith('task.refine') ||
			typeKey.includes('edit') ||
			typeKey.includes('improve')
		) {
			refineTasks.push(task);
		} else if (
			typeKey.startsWith('task.research') ||
			typeKey.includes('learn') ||
			typeKey.includes('discover')
		) {
			researchTasks.push(task);
		} else if (
			typeKey.startsWith('task.review') ||
			typeKey.includes('feedback') ||
			typeKey.includes('assess')
		) {
			reviewTasks.push(task);
		} else if (
			typeKey.startsWith('task.coordinate') ||
			typeKey.includes('discuss') ||
			typeKey.includes('meeting')
		) {
			coordinateTasks.push(task);
		} else if (
			typeKey.startsWith('task.admin') ||
			typeKey.includes('setup') ||
			typeKey.includes('config')
		) {
			adminTasks.push(task);
		} else if (
			typeKey.startsWith('task.plan') ||
			typeKey.includes('strategy') ||
			typeKey.includes('define')
		) {
			planTasks.push(task);
		}
	}

	// Sort for "Recent Updates" per spec: updated_at desc
	const recentUpdatedSort = (a: OntoTask, b: OntoTask): number => {
		return parseISO(b.updated_at).getTime() - parseISO(a.updated_at).getTime();
	};

	// Sort for "Upcoming" per spec: earliest due_at/start_at, then updated_at desc
	const upcomingSort = (a: OntoTask, b: OntoTask): number => {
		// Get earliest date (due or start) for each task
		const aEarliest = Math.min(
			a.due_at ? parseISO(a.due_at).getTime() : Number.POSITIVE_INFINITY,
			a.start_at ? parseISO(a.start_at).getTime() : Number.POSITIVE_INFINITY
		);
		const bEarliest = Math.min(
			b.due_at ? parseISO(b.due_at).getTime() : Number.POSITIVE_INFINITY,
			b.start_at ? parseISO(b.start_at).getTime() : Number.POSITIVE_INFINITY
		);
		if (aEarliest !== bEarliest) return aEarliest - bEarliest;
		// Tie-breaker: updated_at desc
		return parseISO(b.updated_at).getTime() - parseISO(a.updated_at).getTime();
	};

	return {
		todaysTasks: todaysTasks.sort(taskSort),
		overdueTasks: overdueTasks.sort(taskSort),
		upcomingTasks: upcomingTasks.sort(upcomingSort),
		recentlyCompleted: recentlyCompleted.sort(taskSort),
		blockedTasks: blockedTasks.sort(taskSort),
		inProgressTasks: inProgressTasks.sort(taskSort),
		executeTasks: executeTasks.sort(taskSort),
		createTasks: createTasks.sort(taskSort),
		refineTasks: refineTasks.sort(taskSort),
		researchTasks: researchTasks.sort(taskSort),
		reviewTasks: reviewTasks.sort(taskSort),
		coordinateTasks: coordinateTasks.sort(taskSort),
		adminTasks: adminTasks.sort(taskSort),
		planTasks: planTasks.sort(taskSort),
		unblockingTasks, // Will be populated later
		goalAlignedTasks, // Will be populated later
		recentlyUpdated: recentlyUpdated.sort(recentUpdatedSort)
	};
}

/**
 * Get work mode from task type_key
 */
export function getWorkMode(typeKey: string | null): string | null {
	if (!typeKey) return null;
	const key = typeKey.toLowerCase();
	if (key.startsWith('task.execute') || key.includes('action')) return 'execute';
	if (key.startsWith('task.create') || key.includes('produce')) return 'create';
	if (key.startsWith('task.refine') || key.includes('edit') || key.includes('improve'))
		return 'refine';
	if (key.startsWith('task.research') || key.includes('learn') || key.includes('discover'))
		return 'research';
	if (key.startsWith('task.review') || key.includes('feedback') || key.includes('assess'))
		return 'review';
	if (key.startsWith('task.coordinate') || key.includes('discuss') || key.includes('meeting'))
		return 'coordinate';
	if (key.startsWith('task.admin') || key.includes('setup') || key.includes('config'))
		return 'admin';
	if (key.startsWith('task.plan') || key.includes('strategy') || key.includes('define'))
		return 'plan';
	return null;
}

/**
 * Build a project visibility filter that tolerates migration-era data.
 *
 * Some older ontology projects still store `created_by` as the auth user id
 * instead of the canonical actor id, and some are missing owner membership rows.
 * The brief loader must include both shapes until the data is fully reconciled.
 */
export function buildProjectAccessFilter(params: {
	actorId: string;
	userId: string;
	memberProjectIds: Iterable<string>;
}): string {
	const memberProjectIds = Array.from(
		new Set(Array.from(params.memberProjectIds).filter((id): id is string => Boolean(id)))
	);
	const filters = [`created_by.eq.${params.actorId}`, `created_by.eq.${params.userId}`];

	if (memberProjectIds.length > 0) {
		filters.push(`id.in.(${memberProjectIds.join(',')})`);
	}

	return filters.join(',');
}

/**
 * Find accessible owned projects that still lack an owner membership row.
 * This self-heals migration seams the next time the brief worker touches them.
 */
export function findMissingOwnerMembershipProjectIds(params: {
	projects: Array<Pick<OntoProject, 'id' | 'created_by'>>;
	actorId: string;
	userId: string;
	memberProjectIds: Iterable<string>;
}): string[] {
	const memberProjectIds = new Set(
		Array.from(params.memberProjectIds).filter((id): id is string => Boolean(id))
	);

	return params.projects
		.filter((project) => {
			if (!project?.id || memberProjectIds.has(project.id)) {
				return false;
			}

			return project.created_by === params.actorId || project.created_by === params.userId;
		})
		.map((project) => project.id);
}

// ============================================================================
// GOAL PROGRESS UTILITIES
// ============================================================================

function getGoalTargetStatus(
	goal: OntoGoal,
	todayStr: string,
	timezone: string
): {
	targetDate: string | null;
	targetDaysAway: number | null;
	status: 'on_track' | 'at_risk' | 'behind';
} {
	if (!goal.target_date) {
		return { targetDate: null, targetDaysAway: null, status: 'on_track' };
	}

	const targetDate = formatInTimeZone(parseISO(goal.target_date), timezone, 'yyyy-MM-dd');
	const today = parseISO(`${todayStr}T12:00:00`);
	const targetDay = parseISO(`${targetDate}T12:00:00`);
	const targetDaysAway = differenceInDays(targetDay, today);

	let status: 'on_track' | 'at_risk' | 'behind';
	if (targetDaysAway < 0) {
		status = 'behind';
	} else if (targetDaysAway <= 7) {
		status = 'at_risk';
	} else {
		status = 'on_track';
	}

	return { targetDate, targetDaysAway, status };
}

/**
 * Calculate goal progress from supporting tasks via edges
 */
export function calculateGoalProgress(
	goal: OntoGoal,
	edges: OntoEdge[],
	allTasks: OntoTask[],
	todayStr: string,
	timezone: string
): GoalProgress {
	// Find tasks that support this goal (task -[supports_goal]-> goal)
	const supportingEdges = edges.filter(
		(e) => e.dst_id === goal.id && e.rel === 'supports_goal' && e.src_kind === 'task'
	);

	const contributingTaskIds = new Set(supportingEdges.map((e) => e.src_id));
	const contributingTasks = allTasks.filter((t) => contributingTaskIds.has(t.id));

	const totalTasks = contributingTasks.length;
	const completedTasks = contributingTasks.filter((t) => t.state_key === 'done').length;
	const { targetDate, targetDaysAway, status } = getGoalTargetStatus(goal, todayStr, timezone);

	return {
		goal,
		totalTasks,
		completedTasks,
		targetDate,
		targetDaysAway,
		status,
		contributingTasks
	};
}

/**
 * Get milestone status with risk assessment.
 *
 * Note: This function calculates days away using calendar dates in the user's timezone,
 * not absolute time differences. A milestone due "tomorrow" in the user's timezone
 * will show as 1 day away regardless of the exact hour.
 *
 * @param milestone - The milestone to check
 * @param project - The parent project
 * @param todayStr - Today's date as yyyy-MM-dd in user's timezone
 * @param timezone - The user's timezone
 */
export function getMilestoneStatus(
	milestone: OntoMilestone,
	project: OntoProject,
	todayStr: string,
	timezone: string
): MilestoneStatus {
	// Handle milestones without due dates
	if (!milestone.due_at) {
		return {
			milestone,
			daysAway: Infinity,
			isAtRisk: false,
			projectName: project.name
		};
	}

	// Format the milestone due date in user's timezone
	const dueDateStr = formatInTimeZone(parseISO(milestone.due_at), timezone, 'yyyy-MM-dd');

	// Calculate days away using date strings to avoid timezone confusion
	// This gives calendar day difference, not 24-hour periods
	const today = parseISO(`${todayStr}T12:00:00`);
	const dueDay = parseISO(`${dueDateStr}T12:00:00`);
	const daysAway = differenceInDays(dueDay, today);

	const isAtRisk = daysAway <= 7 && milestone.state_key !== 'completed';

	return {
		milestone,
		daysAway,
		isAtRisk,
		projectName: project.name
	};
}

/**
 * Calculate plan progress from tasks
 */
export function calculatePlanProgress(
	plan: OntoPlan,
	edges: OntoEdge[],
	allTasks: OntoTask[]
): PlanProgress {
	// Find tasks belonging to this plan (plan -[has_task]-> task)
	const planTaskEdges = edges.filter(
		(e) => e.src_id === plan.id && e.rel === 'has_task' && e.dst_kind === 'task'
	);

	const planTaskIds = new Set(planTaskEdges.map((e) => e.dst_id));
	const planTasks = allTasks.filter((t) => planTaskIds.has(t.id));

	const totalTasks = planTasks.length;
	const completedTasks = planTasks.filter((t) => t.state_key === 'done').length;
	const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

	return {
		plan,
		totalTasks,
		completedTasks,
		progressPercent
	};
}

/**
 * Find unblocking tasks (tasks that, when completed, unblock others)
 */
export function findUnblockingTasks(tasks: OntoTask[], edges: OntoEdge[]): UnblockingTask[] {
	const unblockingTasks: UnblockingTask[] = [];
	const taskMap = new Map(tasks.map((t) => [t.id, t]));

	// Find all dependency edges (task -[depends_on]-> task)
	const dependencyEdges = edges.filter(
		(e) => e.rel === 'depends_on' && e.src_kind === 'task' && e.dst_kind === 'task'
	);

	// Group by target (the task being depended on)
	const blockedByMap = new Map<string, string[]>();
	for (const edge of dependencyEdges) {
		const blockerTaskId = edge.dst_id;
		const blockedTaskId = edge.src_id;
		if (!blockedByMap.has(blockerTaskId)) {
			blockedByMap.set(blockerTaskId, []);
		}
		blockedByMap.get(blockerTaskId)!.push(blockedTaskId);
	}

	// Find incomplete tasks that block other tasks
	for (const [blockerTaskId, blockedTaskIds] of blockedByMap.entries()) {
		const blockerTask = taskMap.get(blockerTaskId);
		if (blockerTask && blockerTask.state_key !== 'done') {
			const blockedTasks = blockedTaskIds
				.map((id) => taskMap.get(id))
				.filter((t): t is OntoTask => t !== undefined);

			if (blockedTasks.length > 0) {
				unblockingTasks.push({
					task: blockerTask,
					blockedTasks
				});
			}
		}
	}

	// Sort by number of blocked tasks (most impact first)
	return unblockingTasks.sort((a, b) => b.blockedTasks.length - a.blockedTasks.length);
}

// ============================================================================
// RECENT UPDATES
// ============================================================================

const RECENT_CHANGE_WINDOW_DAYS = 7;

function parseMaybeDate(timestamp: string | null | undefined): Date | null {
	if (!timestamp) return null;
	const parsed = parseISO(timestamp);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isRecentTimestamp(
	timestamp: string | null | undefined,
	cutoff: Date
): timestamp is string {
	const parsed = parseMaybeDate(timestamp);
	return Boolean(parsed && parsed >= cutoff);
}

function getEntityChangedAt(entity: { updated_at?: string | null; created_at?: string | null }): {
	changedAt: string | null;
	source: 'updated_at' | 'created_at';
} {
	if (entity.updated_at) {
		return { changedAt: entity.updated_at, source: 'updated_at' };
	}
	return { changedAt: entity.created_at ?? null, source: 'created_at' };
}

function normalizeActivityEntityKind(entityType: string): ProjectRecentChangeKind | null {
	const normalized = entityType.replace(/^onto_/, '').replace(/s$/, '');
	switch (normalized) {
		case 'project':
		case 'task':
		case 'goal':
		case 'plan':
		case 'document':
		case 'milestone':
		case 'risk':
		case 'requirement':
		case 'event':
			return normalized;
		default:
			return null;
	}
}

function addRecentChange(
	changes: ProjectRecentChange[],
	seen: Set<string>,
	change: ProjectRecentChange
): void {
	const key = `${change.kind}:${change.id}:${change.action}`;
	if (seen.has(key)) return;
	seen.add(key);
	changes.push(change);
}

function truncateRecentChangeTitle(title: string): string {
	const trimmed = title.trim();
	if (!trimmed) return 'Untitled';
	return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function buildProjectRecentChanges(params: {
	project: OntoProjectWithRelations;
	recentTasks: OntoTask[];
}): ProjectRecentChange[] {
	const cutoff = subDays(new Date(), RECENT_CHANGE_WINDOW_DAYS);
	const changes: ProjectRecentChange[] = [];
	const seen = new Set<string>();

	for (const log of params.project.activityLogs) {
		const kind = normalizeActivityEntityKind(log.entityType);
		if (!kind) continue;
		addRecentChange(changes, seen, {
			kind,
			id: log.entityId,
			title: truncateRecentChangeTitle(log.entityLabel ?? `${kind} ${log.entityId}`),
			action: log.action,
			changedAt: log.createdAt,
			actorName: log.actorName,
			source: 'activity_log'
		});
	}

	for (const task of params.recentTasks) {
		const { changedAt, source } = getEntityChangedAt(task);
		if (!changedAt || !isRecentTimestamp(changedAt, cutoff)) continue;
		addRecentChange(changes, seen, {
			kind: 'task',
			id: task.id,
			title: truncateRecentChangeTitle(task.title),
			action: source === 'created_at' ? 'created' : 'updated',
			changedAt,
			actorName: null,
			source
		});
	}

	for (const goal of params.project.goals) {
		const { changedAt, source } = getEntityChangedAt(goal);
		if (!changedAt || !isRecentTimestamp(changedAt, cutoff)) continue;
		addRecentChange(changes, seen, {
			kind: 'goal',
			id: goal.id,
			title: truncateRecentChangeTitle(goal.name),
			action: source === 'created_at' ? 'created' : 'updated',
			changedAt,
			actorName: null,
			source
		});
	}

	for (const plan of params.project.plans) {
		const { changedAt, source } = getEntityChangedAt(plan);
		if (!changedAt || !isRecentTimestamp(changedAt, cutoff)) continue;
		addRecentChange(changes, seen, {
			kind: 'plan',
			id: plan.id,
			title: truncateRecentChangeTitle(plan.name ?? 'Plan'),
			action: source === 'created_at' ? 'created' : 'updated',
			changedAt,
			actorName: null,
			source
		});
	}

	for (const document of params.project.documents) {
		const { changedAt, source } = getEntityChangedAt(document);
		if (!changedAt || !isRecentTimestamp(changedAt, cutoff)) continue;
		addRecentChange(changes, seen, {
			kind: 'document',
			id: document.id,
			title: truncateRecentChangeTitle(document.title || document.description || 'Document'),
			action: source === 'created_at' ? 'created' : 'updated',
			changedAt,
			actorName: null,
			source
		});
	}

	return changes
		.sort((a, b) => parseISO(b.changedAt).getTime() - parseISO(a.changedAt).getTime())
		.slice(0, 10);
}

/**
 * Get recent updates across all entity types
 */
export function getRecentUpdates(
	data: OntoProjectWithRelations,
	hoursAgo: number = 24
): RecentUpdates {
	const cutoff = subHours(new Date(), hoursAgo);
	const recentTasks = data.tasks.filter((t) => parseISO(t.updated_at) >= cutoff);
	const recentTaskIds = new Set(recentTasks.map((t) => t.id));

	return {
		tasks: recentTasks,
		// Goals may have updated_at in newer rows; fall back to created_at or supporting task activity.
		goals: data.goals.filter((g) => {
			if (isRecentTimestamp(g.updated_at, cutoff)) return true;
			if (parseISO(g.created_at) >= cutoff) return true;
			return data.edges.some(
				(e) =>
					e.rel === 'supports_goal' &&
					e.src_kind === 'task' &&
					e.dst_kind === 'goal' &&
					e.dst_id === g.id &&
					recentTaskIds.has(e.src_id)
			);
		}),
		documents: data.documents.filter((d) => parseISO(d.updated_at) >= cutoff),
		plans: data.plans.filter((p) => parseISO(p.updated_at) >= cutoff)
	};
}

// ============================================================================
// ACTIVITY LOG UTILITIES
// ============================================================================

const ACTIVITY_WINDOW_HOURS = 24;
const ACTIVITY_LOG_LIMIT = 200;
const ACTIVITY_PER_PROJECT_LIMIT = 8;

// Actions that are meaningful for the daily brief (reduces noise)
const MEANINGFUL_ACTIONS = [
	'created',
	'completed',
	'updated',
	'blocked',
	'unblocked',
	'state_changed',
	'priority_changed',
	'assigned',
	'unassigned',
	'moved',
	'archived',
	'restored'
] as const;

function resolveActivityEntityLabel(log: {
	before_data: unknown;
	after_data: unknown;
}): string | null {
	const data = (
		typeof log.after_data === 'object' && log.after_data !== null
			? log.after_data
			: typeof log.before_data === 'object' && log.before_data !== null
				? log.before_data
				: null
	) as Record<string, unknown> | null;

	if (!data) return null;

	const label =
		(typeof data.title === 'string' && data.title.trim()) ||
		(typeof data.name === 'string' && data.name.trim()) ||
		(typeof data.text === 'string' && data.text.trim()) ||
		(typeof data.description === 'string' && data.description.trim())
			? data.title || data.name || data.text || data.description
			: null;

	if (typeof label !== 'string') return null;

	const trimmed = label.trim();
	if (!trimmed) return null;
	if (trimmed.length > 120) {
		return `${trimmed.slice(0, 117)}...`;
	}
	return trimmed;
}

function resolveActorDisplayName(
	actor: { name: string | null; email: string | null } | null,
	fallback: string
): string {
	if (actor?.name && actor.name.trim()) return actor.name.trim();
	if (actor?.email && actor.email.trim()) return actor.email.trim();
	return fallback;
}

// ============================================================================
// MAIN DATA LOADER CLASS
// ============================================================================

export class OntologyBriefDataLoader {
	constructor(private supabase: TypedSupabaseClient) {}

	/**
	 * Load all ontology data for a user for brief generation
	 */
	async loadUserOntologyData(
		userId: string,
		actorId: string,
		briefDate: Date,
		timezone: string
	): Promise<OntoProjectWithRelations[]> {
		console.log('[OntologyBriefDataLoader] Loading data for user:', userId, 'actor:', actorId);

		// Fetch all active projects the actor can access (owned + shared)
		const { data: memberRows, error: memberError } = await this.supabase
			.from('onto_project_members')
			.select('project_id')
			.eq('actor_id', actorId)
			.is('removed_at', null);

		if (memberError) {
			console.error(
				'[OntologyBriefDataLoader] Error loading project memberships:',
				memberError
			);
			throw new Error(`Failed to load project memberships: ${memberError.message}`);
		}

		const memberProjectIds = (memberRows || [])
			.map((row) => row.project_id)
			.filter((id): id is string => Boolean(id));

		if (memberProjectIds.length === 0) {
			console.log(
				'[OntologyBriefDataLoader] No membership rows found, falling back to owned project lookup'
			);
		}

		const projectAccessFilter = buildProjectAccessFilter({
			actorId,
			userId,
			memberProjectIds
		});
		const { data: projectsData, error: projectsError } = await this.supabase
			.from('onto_projects')
			.select(
				'id, name, state_key, type_key, description, next_step_short, next_step_long, updated_at, created_by'
			)
			.or(projectAccessFilter)
			.in('state_key', ['planning', 'active'])
			.is('deleted_at', null)
			.order('updated_at', { ascending: false });

		if (projectsError) {
			console.error('[OntologyBriefDataLoader] Error loading projects:', projectsError);
			throw new Error(`Failed to load projects: ${projectsError.message}`);
		}

		const projects = (projectsData || []) as OntoProject[];

		if (projects.length === 0) {
			console.log('[OntologyBriefDataLoader] No active projects found');
			return [];
		}

		const missingOwnerMembershipProjectIds = findMissingOwnerMembershipProjectIds({
			projects,
			actorId,
			userId,
			memberProjectIds
		});

		if (missingOwnerMembershipProjectIds.length > 0) {
			const { error: membershipRepairError } = await this.supabase
				.from('onto_project_members')
				.upsert(
					missingOwnerMembershipProjectIds.map((projectId) => ({
						project_id: projectId,
						actor_id: actorId,
						role_key: 'owner',
						access: 'admin',
						added_by_actor_id: actorId,
						removed_at: null,
						removed_by_actor_id: null
					})),
					{ onConflict: 'project_id,actor_id' }
				);

			if (membershipRepairError) {
				console.warn(
					'[OntologyBriefDataLoader] Failed to reconcile owner memberships:',
					membershipRepairError
				);
			} else {
				console.log(
					`[OntologyBriefDataLoader] Reconciled ${missingOwnerMembershipProjectIds.length} missing owner membership(s)`
				);
			}
		}

		const projectIds = projects.map((p) => p.id);
		const projectsById = new Map(projects.map((project) => [project.id, project]));

		// Load recent project activity logs (last 24h)
		// Filter to meaningful actions only to reduce noise in briefs
		const activityCutoff = subHours(new Date(), ACTIVITY_WINDOW_HOURS).toISOString();
		const { data: activityLogs, error: activityError } = await this.supabase
			.from('onto_project_logs')
			.select(
				'id, project_id, entity_type, entity_id, action, before_data, after_data, created_at, changed_by_actor_id, changed_by'
			)
			.in('project_id', projectIds)
			.in('action', MEANINGFUL_ACTIONS)
			.gte('created_at', activityCutoff)
			.order('created_at', { ascending: false })
			.limit(ACTIVITY_LOG_LIMIT);

		if (activityError) {
			console.warn(
				'[OntologyBriefDataLoader] Error loading project activity logs:',
				activityError
			);
		}

		const activityLogRows = (activityLogs || []) as Array<{
			project_id: string;
			entity_type: string;
			entity_id: string;
			action: string;
			before_data: unknown;
			after_data: unknown;
			created_at: string;
			changed_by_actor_id: string | null;
			changed_by: string;
		}>;

		const actorIds = Array.from(
			new Set(
				activityLogRows
					.map((log) => log.changed_by_actor_id)
					.filter((id): id is string => Boolean(id))
			)
		);

		const actorsById = new Map<
			string,
			{ name: string | null; email: string | null; user_id: string | null }
		>();

		if (actorIds.length > 0) {
			const { data: actors, error: actorError } = await this.supabase
				.from('onto_actors')
				.select('id, name, email, user_id')
				.in('id', actorIds);

			if (actorError) {
				console.warn(
					'[OntologyBriefDataLoader] Error loading activity actors:',
					actorError
				);
			} else {
				for (const actor of actors || []) {
					actorsById.set(actor.id, {
						name: actor.name,
						email: actor.email,
						user_id: actor.user_id
					});
				}
			}
		}

		const userIdsForActors = Array.from(
			new Set(
				activityLogRows
					.filter((log) => !log.changed_by_actor_id && log.changed_by)
					.map((log) => log.changed_by)
			)
		);

		if (userIdsForActors.length > 0) {
			const { data: actorByUser, error: actorByUserError } = await this.supabase
				.from('onto_actors')
				.select('id, name, email, user_id')
				.in('user_id', userIdsForActors);

			if (actorByUserError) {
				console.warn(
					'[OntologyBriefDataLoader] Error loading activity actors by user:',
					actorByUserError
				);
			} else {
				for (const actor of actorByUser || []) {
					if (actor.user_id && !actorsById.has(actor.id)) {
						actorsById.set(actor.id, {
							name: actor.name,
							email: actor.email,
							user_id: actor.user_id
						});
					}
				}
			}
		}

		const actorByUserId = new Map<string, { name: string | null; email: string | null }>();
		for (const actor of actorsById.values()) {
			if (actor.user_id) {
				actorByUserId.set(actor.user_id, {
					name: actor.name,
					email: actor.email
				});
			}
		}

		const activityByProject = new Map<string, ProjectActivityEntry[]>();
		for (const log of activityLogRows) {
			const project = projectsById.get(log.project_id);
			if (!project) continue;

			const actor =
				(log.changed_by_actor_id && actorsById.get(log.changed_by_actor_id)) ||
				actorByUserId.get(log.changed_by) ||
				null;

			const entry: ProjectActivityEntry = {
				projectId: log.project_id,
				projectName: project.name || 'Untitled Project',
				isShared: project.created_by ? project.created_by !== actorId : false,
				actorId: log.changed_by_actor_id,
				actorName: resolveActorDisplayName(actor, 'Someone'),
				action: log.action,
				entityType: log.entity_type,
				entityId: log.entity_id,
				entityLabel: resolveActivityEntityLabel(log),
				createdAt: log.created_at
			};

			const list = activityByProject.get(log.project_id) ?? [];
			if (list.length >= ACTIVITY_PER_PROJECT_LIMIT) continue;
			list.push(entry);
			activityByProject.set(log.project_id, list);
		}

		// Load all entities in parallel with timing
		const queryStartTime = Date.now();
		const [
			tasksResult,
			goalsResult,
			plansResult,
			milestonesResult,
			risksResult,
			documentsResult,
			requirementsResult,
			edgesResult
		] = await Promise.all([
			this.supabase
				.from('onto_tasks')
				.select(
					'id, title, project_id, state_key, type_key, priority, due_at, start_at, updated_at, created_at'
				)
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_goals')
				.select(
					'id, name, project_id, state_key, created_at, target_date, description, updated_at, completed_at, type_key'
				)
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_plans')
				.select(
					'id, project_id, name, state_key, type_key, description, created_at, updated_at, facet_context, facet_scale, facet_stage'
				)
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_milestones')
				.select(
					'id, project_id, title, due_at, state_key, created_at, description, updated_at, completed_at, type_key'
				)
				.in('project_id', projectIds)
				.is('deleted_at', null)
				.not('state_key', 'in', '(completed,missed)'), // Only fetch active milestones
			this.supabase
				.from('onto_risks')
				.select(
					'id, project_id, title, impact, state_key, created_at, updated_at, probability, content, type_key'
				)
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_documents')
				.select(
					'id, project_id, title, description, state_key, type_key, created_at, updated_at'
				)
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_requirements')
				.select('id, project_id, text, created_at, updated_at, priority, type_key')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_edges')
				.select('id, project_id, src_id, dst_id, src_kind, dst_kind, rel')
				.in('project_id', projectIds)
		]);
		const queryDuration = Date.now() - queryStartTime;
		console.log(
			`[OntologyBriefDataLoader] Loaded ontology data in ${queryDuration}ms for ${projectIds.length} projects`
		);

		// Check for errors
		const errors = [
			{ name: 'tasks', error: tasksResult.error },
			{ name: 'goals', error: goalsResult.error },
			{ name: 'plans', error: plansResult.error },
			{ name: 'milestones', error: milestonesResult.error },
			{ name: 'risks', error: risksResult.error },
			{ name: 'documents', error: documentsResult.error },
			{ name: 'requirements', error: requirementsResult.error },
			{ name: 'edges', error: edgesResult.error }
		].filter((e) => e.error);

		if (errors.length > 0) {
			console.error('[OntologyBriefDataLoader] Errors loading entities:', errors);
		}

		const tasks = (tasksResult.data || []) as OntoTask[];
		const goals = (goalsResult.data || []) as OntoGoal[];
		const plans = (plansResult.data || []) as OntoPlan[];
		const milestones = (milestonesResult.data || []) as OntoMilestone[];
		const risks = (risksResult.data || []) as OntoRisk[];
		const documents = (documentsResult.data || []) as OntoDocument[];
		const requirements = (requirementsResult.data || []) as OntoRequirement[];
		const edges = (edgesResult.data || []) as OntoEdge[];

		console.log('[OntologyBriefDataLoader] Loaded entities:', {
			projects: projects.length,
			tasks: tasks.length,
			goals: goals.length,
			plans: plans.length,
			milestones: milestones.length,
			risks: risks.length,
			documents: documents.length,
			requirements: requirements.length,
			edges: edges.length
		});

		const briefDateStr = formatInTimeZone(briefDate, timezone, 'yyyy-MM-dd');

		// Build project-specific data structures
		return projects.map((project) => {
			const projectTasks = tasks.filter((t) => t.project_id === project.id);
			const projectGoals = goals.filter((g) => g.project_id === project.id);
			const projectPlans = plans.filter((p) => p.project_id === project.id);
			const projectMilestones = milestones.filter((m) => m.project_id === project.id);
			const projectRisks = risks.filter((r) => r.project_id === project.id);
			const projectDocuments = documents.filter((d) => d.project_id === project.id);
			const projectRequirements = requirements.filter((r) => r.project_id === project.id);
			const projectEdges = edges.filter((e) => e.project_id === project.id);

			// Build computed relationships
			const tasksByPlan = this.buildTasksByPlan(projectPlans, projectEdges, projectTasks);
			const taskDependencies = this.buildTaskDependencies(projectEdges);
			const goalProgress = this.buildGoalProgressMap(
				projectGoals,
				projectEdges,
				projectTasks,
				briefDateStr,
				timezone
			);
			const isShared = project.created_by ? project.created_by !== actorId : false;
			const projectActivityLogs = activityByProject.get(project.id) ?? [];
			const recentUpdates = getRecentUpdates({
				project,
				isShared,
				activityLogs: projectActivityLogs,
				tasks: projectTasks,
				goals: projectGoals,
				plans: projectPlans,
				milestones: projectMilestones,
				risks: projectRisks,
				documents: projectDocuments,
				requirements: projectRequirements,
				edges: projectEdges,
				tasksByPlan,
				taskDependencies,
				goalProgress,
				recentUpdates: { tasks: [], goals: [], documents: [] }
			});

			return {
				project,
				isShared,
				activityLogs: projectActivityLogs,
				tasks: projectTasks,
				goals: projectGoals,
				plans: projectPlans,
				milestones: projectMilestones,
				risks: projectRisks,
				documents: projectDocuments,
				requirements: projectRequirements,
				edges: projectEdges,
				tasksByPlan,
				taskDependencies,
				goalProgress,
				recentUpdates
			};
		});
	}

	/**
	 * Load compact calendar data for the daily brief.
	 *
	 * This intentionally loads a narrow, user-scoped 8-day window and returns capped
	 * visible rows plus counts. LLM prompts consume the counts and first few items,
	 * not a raw calendar dump.
	 */
	async loadCalendarBriefData(
		userId: string,
		actorId: string,
		projectsData: OntoProjectWithRelations[],
		briefDate: string,
		timezone: string
	): Promise<CalendarBriefSection> {
		const projectIds = projectsData.map((data) => data.project.id);
		const projectNameMap = new Map(
			projectsData.map((data) => [data.project.id, data.project.name || 'Untitled Project'])
		);
		const allTasks = projectsData.flatMap((data) => data.tasks);
		const taskProjectMap = new Map(
			allTasks.map((task) => [
				task.id,
				{
					projectId: task.project_id,
					projectName: projectNameMap.get(task.project_id) ?? 'Unknown Project'
				}
			])
		);

		const { todayStart, windowEnd } = getCalendarBriefWindow(briefDate, timezone);
		const windowStartIso = todayStart.toISOString();
		const windowEndIso = windowEnd.toISOString();
		const overlapFilter = `start_at.gte.${windowStartIso},end_at.gte.${windowStartIso}`;
		const legacyOverlapFilter = `event_start.gte.${windowStartIso},event_end.gte.${windowStartIso}`;
		const eventSelect = `
			id,
			title,
			start_at,
			end_at,
			all_day,
			timezone,
			project_id,
			owner_entity_type,
			owner_entity_id,
			state_key,
			type_key,
			props,
			external_link,
			sync_status,
			sync_error,
			deleted_at,
			created_at,
			updated_at,
			onto_event_sync (
				id,
				event_id,
				calendar_id,
				user_id,
				provider,
				external_event_id,
				sync_status,
				sync_error,
				last_synced_at,
				sync_token,
				created_at,
				updated_at
			)
		`;

		const eventRows: OntoCalendarEventRow[] = [];

		const appendRows = (
			rows: unknown[] | null,
			error: { message?: string } | null,
			label: string
		) => {
			if (error) {
				console.warn(`[OntologyBriefDataLoader] Failed to load ${label}:`, error);
				return;
			}
			eventRows.push(...((rows ?? []) as OntoCalendarEventRow[]));
		};

		if (projectIds.length > 0) {
			const { data, error } = await this.supabase
				.from('onto_events')
				.select(eventSelect)
				.in('project_id', projectIds)
				.is('deleted_at', null)
				.lt('start_at', windowEndIso)
				.or(overlapFilter)
				.order('start_at', { ascending: true })
				.limit(CALENDAR_BRIEF_CAPS.QUERY_LIMIT);

			appendRows(data as unknown[] | null, error, 'project calendar events');
		}

		const { data: actorEvents, error: actorEventsError } = await this.supabase
			.from('onto_events')
			.select(eventSelect)
			.eq('owner_entity_type', 'actor')
			.eq('owner_entity_id', actorId)
			.is('deleted_at', null)
			.lt('start_at', windowEndIso)
			.or(overlapFilter)
			.order('start_at', { ascending: true })
			.limit(CALENDAR_BRIEF_CAPS.QUERY_LIMIT);

		appendRows(actorEvents as unknown[] | null, actorEventsError, 'actor calendar events');

		const { data: standaloneEvents, error: standaloneEventsError } = await this.supabase
			.from('onto_events')
			.select(eventSelect)
			.eq('owner_entity_type', 'standalone')
			.in('created_by', [actorId, userId])
			.is('deleted_at', null)
			.lt('start_at', windowEndIso)
			.or(overlapFilter)
			.order('start_at', { ascending: true })
			.limit(CALENDAR_BRIEF_CAPS.QUERY_LIMIT);

		appendRows(
			standaloneEvents as unknown[] | null,
			standaloneEventsError,
			'standalone calendar events'
		);

		const ontologyItems = eventRows
			.map((row) => normalizeOntologyCalendarEvent(row, userId, projectNameMap, timezone))
			.filter((item): item is CalendarBriefItem => item !== null);

		const { data: legacyRows, error: legacyError } = await this.supabase
			.from('task_calendar_events')
			.select('*')
			.eq('user_id', userId)
			.lt('event_start', windowEndIso)
			.or(legacyOverlapFilter)
			.order('event_start', { ascending: true })
			.limit(CALENDAR_BRIEF_CAPS.QUERY_LIMIT);

		if (legacyError) {
			console.warn(
				'[OntologyBriefDataLoader] Failed to load legacy calendar events:',
				legacyError
			);
		}

		const legacyItems = ((legacyRows ?? []) as TaskCalendarEventRow[])
			.map((row) => normalizeLegacyTaskCalendarEvent(row, taskProjectMap, timezone))
			.filter((item): item is CalendarBriefItem => item !== null);

		const tasksWithExplicitEvents = new Set(
			[...ontologyItems, ...legacyItems]
				.map((item) => item.taskId)
				.filter((taskId): taskId is string => Boolean(taskId))
		);
		const syntheticTaskItems = buildSyntheticTaskCalendarItems(
			allTasks,
			projectNameMap,
			tasksWithExplicitEvents,
			todayStart,
			windowEnd,
			timezone
		);

		return selectCalendarBriefItems(
			[...ontologyItems, ...legacyItems, ...syntheticTaskItems],
			briefDate,
			timezone
		);
	}

	/**
	 * Get actor ID for a user
	 */
	async getActorIdForUser(userId: string): Promise<string | null> {
		const { data, error } = await this.supabase.rpc('ensure_actor_for_user', {
			p_user_id: userId
		});

		if (!error && data) {
			return data as string;
		}

		console.warn(
			'[OntologyBriefDataLoader] RPC actor resolution failed, attempting direct fallback:',
			userId,
			error
		);

		const { data: user, error: userError } = await this.supabase
			.from('users')
			.select('id, name, email')
			.eq('id', userId)
			.single();

		if (userError || !user) {
			console.warn(
				'[OntologyBriefDataLoader] Failed to load user for actor fallback:',
				userId,
				userError
			);
			return null;
		}

		const fallbackName = user.name?.trim() || user.email?.trim() || 'BuildOS User';
		const { data: actor, error: actorError } = await this.supabase
			.from('onto_actors')
			.upsert(
				{
					user_id: userId,
					kind: 'human',
					name: fallbackName,
					email: user.email ?? null
				},
				{ onConflict: 'user_id' }
			)
			.select('id')
			.single();

		if (actorError || !actor?.id) {
			console.warn(
				'[OntologyBriefDataLoader] Failed to create actor via fallback:',
				userId,
				actorError
			);
			return null;
		}

		console.log('[OntologyBriefDataLoader] Created missing actor via fallback:', actor.id);
		return actor.id;
	}

	/**
	 * Build tasks by plan map
	 */
	private buildTasksByPlan(
		plans: OntoPlan[],
		edges: OntoEdge[],
		tasks: OntoTask[]
	): Map<string, OntoTask[]> {
		const taskMap = new Map(tasks.map((t) => [t.id, t]));
		const tasksByPlan = new Map<string, OntoTask[]>();

		for (const plan of plans) {
			const planTaskEdges = edges.filter(
				(e) => e.src_id === plan.id && e.rel === 'has_task' && e.dst_kind === 'task'
			);
			const planTasks = planTaskEdges
				.map((e) => taskMap.get(e.dst_id))
				.filter((t): t is OntoTask => t !== undefined);
			tasksByPlan.set(plan.id, planTasks);
		}

		return tasksByPlan;
	}

	/**
	 * Build task dependencies map
	 */
	private buildTaskDependencies(edges: OntoEdge[]): Map<string, string[]> {
		const dependencies = new Map<string, string[]>();

		const dependencyEdges = edges.filter(
			(e) => e.rel === 'depends_on' && e.src_kind === 'task' && e.dst_kind === 'task'
		);

		for (const edge of dependencyEdges) {
			if (!dependencies.has(edge.src_id)) {
				dependencies.set(edge.src_id, []);
			}
			dependencies.get(edge.src_id)!.push(edge.dst_id);
		}

		return dependencies;
	}

	/**
	 * Build goal progress map
	 */
	private buildGoalProgressMap(
		goals: OntoGoal[],
		edges: OntoEdge[],
		tasks: OntoTask[],
		todayStr: string,
		timezone: string
	): Map<string, GoalProgress> {
		const progressMap = new Map<string, GoalProgress>();

		for (const goal of goals) {
			progressMap.set(goal.id, calculateGoalProgress(goal, edges, tasks, todayStr, timezone));
		}

		return progressMap;
	}

	/**
	 * Prepare brief data for LLM analysis
	 */
	prepareBriefData(
		projectsData: OntoProjectWithRelations[],
		briefDate: string,
		timezone: string,
		calendar: CalendarBriefSection = createEmptyCalendarBriefSection()
	): OntologyBriefData {
		// Aggregate data across all projects
		const allTasks = projectsData.flatMap((p) => p.tasks);
		const allRisks = projectsData.flatMap((p) => p.risks);
		const allRequirements = projectsData.flatMap((p) => p.requirements);
		const allEdges = projectsData.flatMap((p) => p.edges);

		// Categorize all tasks
		const categorizedTasks = categorizeTasks(allTasks, briefDate, timezone);

		const groupTasksByProject = (tasks: OntoTask[]): Map<string, OntoTask[]> => {
			const grouped = new Map<string, OntoTask[]>();
			for (const task of tasks) {
				const list = grouped.get(task.project_id);
				if (list) {
					list.push(task);
				} else {
					grouped.set(task.project_id, [task]);
				}
			}
			return grouped;
		};

		const todaysTasksByProject = groupTasksByProject(categorizedTasks.todaysTasks);
		const upcomingTasksByProject = groupTasksByProject(categorizedTasks.upcomingTasks);
		const blockedTasksByProject = groupTasksByProject(categorizedTasks.blockedTasks);
		const recentlyUpdatedByProject = groupTasksByProject(categorizedTasks.recentlyUpdated);
		const taskProjectIds = new Map(allTasks.map((task) => [task.id, task.project_id]));

		const groupCalendarByProject = (
			items: CalendarBriefItem[]
		): Map<string, CalendarBriefItem[]> => {
			const grouped = new Map<string, CalendarBriefItem[]>();
			for (const item of items) {
				const projectId =
					item.projectId ?? (item.taskId ? taskProjectIds.get(item.taskId) : null);
				if (!projectId) continue;
				const list = grouped.get(projectId);
				if (list) {
					list.push(item);
				} else {
					grouped.set(projectId, [item]);
				}
			}
			return grouped;
		};

		const allCalendarItems = calendar.allItems.length > 0
			? calendar.allItems
			: [...calendar.today, ...calendar.upcoming];
		const briefDayBounds = getLocalDayUtcBounds(briefDate, timezone);
		const projectUpcomingEndDate = addDaysToLocalDate(
			briefDate,
			CALENDAR_BRIEF_CAPS.UPCOMING_DAYS,
			timezone
		);
		const projectUpcomingEndBounds = getLocalDayUtcBounds(projectUpcomingEndDate, timezone);
		const projectCalendarTodayItems = allCalendarItems.filter((item) =>
			calendarItemOverlapsRange(item, briefDayBounds.start, briefDayBounds.end)
		);
		const calendarTodayByProject = groupCalendarByProject(
			projectCalendarTodayItems
		);
		const calendarUpcomingByProject = groupCalendarByProject(
			allCalendarItems.filter(
				(item) =>
					!projectCalendarTodayItems.includes(item) &&
					calendarItemOverlapsRange(
						item,
						briefDayBounds.end,
						projectUpcomingEndBounds.end
					)
			)
		);

		// Reuse precomputed goal progress from project data to avoid recomputation
		const goals: GoalProgress[] = [];
		for (const data of projectsData) {
			for (const goal of data.goals) {
				const progress = data.goalProgress.get(goal.id);
				if (progress) {
					goals.push(progress);
				}
			}
		}

		// Get active risks (not mitigated or closed), apply cap per spec
		const activeRisks = allRisks
			.filter((r) => r.state_key !== 'mitigated' && r.state_key !== 'closed')
			.sort((a, b) => parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime())
			.slice(0, ENTITY_CAPS.RISKS);

		// Count high priority tasks (P1/P2) that are due today or overdue
		const highPriorityCount = [
			...categorizedTasks.overdueTasks,
			...categorizedTasks.todaysTasks
		].filter((t) => t.priority !== null && t.priority <= 2 && t.state_key !== 'done').length;

		// Aggregate recent updates
		const allRecentUpdates: RecentUpdates = {
			tasks: projectsData.flatMap((p) => p.recentUpdates.tasks),
			goals: projectsData.flatMap((p) => p.recentUpdates.goals),
			documents: projectsData.flatMap((p) => p.recentUpdates.documents),
			plans: projectsData.flatMap((p) => p.recentUpdates.plans ?? [])
		};

		// Tasks by work mode
		const tasksByWorkMode: Record<string, OntoTask[]> = {
			execute: categorizedTasks.executeTasks,
			create: categorizedTasks.createTasks,
			refine: categorizedTasks.refineTasks,
			research: categorizedTasks.researchTasks,
			review: categorizedTasks.reviewTasks,
			coordinate: categorizedTasks.coordinateTasks,
			admin: categorizedTasks.adminTasks,
			plan: categorizedTasks.planTasks
		};

		// Strategic task splits per PROJECT_CONTEXT_ENRICHMENT_SPEC.md
		// 1) Recent Updates: updated in last 7 days, order by updated_at desc, cap 10
		const recentlyUpdatedTasks = categorizedTasks.recentlyUpdated.slice(
			0,
			ENTITY_CAPS.TASKS_RECENT
		);
		const recentlyUpdatedIds = new Set(recentlyUpdatedTasks.map((t) => t.id));

		// 2) Upcoming: due/start in next 7 days, deduplicated from Recent, cap 5
		const upcomingTasks = categorizedTasks.upcomingTasks
			.filter((t) => !recentlyUpdatedIds.has(t.id))
			.slice(0, ENTITY_CAPS.TASKS_UPCOMING);

		// Apply entity caps to requirements per spec
		const cappedRequirements = allRequirements
			.sort((a, b) => parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime())
			.slice(0, ENTITY_CAPS.REQUIREMENTS);

		// Cap goals by status priority (at_risk/behind first, then on_track)
		const cappedGoals = goals
			.sort((a, b) => {
				const statusOrder = { behind: 0, at_risk: 1, on_track: 2 };
				const aOrder = statusOrder[a.status] ?? 3;
				const bOrder = statusOrder[b.status] ?? 3;
				if (aOrder !== bOrder) return aOrder - bOrder;
				// Tie-breaker: updated_at desc on the goal object
				return (
					parseISO(b.goal.created_at).getTime() - parseISO(a.goal.created_at).getTime()
				);
			})
			.slice(0, ENTITY_CAPS.GOALS);

		// Build project brief data
		const projects: ProjectBriefData[] = projectsData.map((data) => {
			const projectGoals = data.goals
				.map((g) => data.goalProgress.get(g.id))
				.filter((g): g is GoalProgress => g !== undefined);
			const unblockingTasks = findUnblockingTasks(data.tasks, data.edges);
			const projectRequirements = [...data.requirements].sort(
				(a, b) => parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime()
			);

			// Get active plan
			const activePlan = data.plans.find((p) => p.state_key === 'active') || null;

			// Get next steps from project
			const nextSteps: string[] = [];
			if (data.project.next_step_short) {
				nextSteps.push(data.project.next_step_short);
			}
			if (data.project.next_step_long) {
				nextSteps.push(data.project.next_step_long);
			}

			// Get next milestone (already pre-filtered to exclude completed/missed at DB level)
			const nextMilestone = data.milestones
				.filter((m) => m.due_at !== null)
				.sort((a, b) => parseISO(a.due_at!).getTime() - parseISO(b.due_at!).getTime())[0];

			const projectTodaysTasks = todaysTasksByProject.get(data.project.id) ?? [];
			const projectUpcomingAll = upcomingTasksByProject.get(data.project.id) ?? [];
			const projectBlockedTasks = blockedTasksByProject.get(data.project.id) ?? [];
			const projectRecentlyUpdatedAll = recentlyUpdatedByProject.get(data.project.id) ?? [];
			const projectCalendarToday = calendarTodayByProject.get(data.project.id) ?? [];
			const projectCalendarUpcoming = calendarUpcomingByProject.get(data.project.id) ?? [];

			// Project-level strategic task splits with deduplication
			const projectRecentlyUpdated = projectRecentlyUpdatedAll.slice(
				0,
				ENTITY_CAPS.TASKS_RECENT
			);
			const projectRecentIds = new Set(projectRecentlyUpdated.map((t) => t.id));
			const projectUpcoming = projectUpcomingAll
				.filter((t) => !projectRecentIds.has(t.id))
				.slice(0, ENTITY_CAPS.TASKS_UPCOMING);
			const recentChanges = buildProjectRecentChanges({
				project: data,
				recentTasks: projectRecentlyUpdated
			});

			return {
				project: data.project,
				isShared: data.isShared,
				activityLogs: data.activityLogs,
				recentChanges,
				goals: projectGoals.slice(0, ENTITY_CAPS.GOALS),
				plans: data.plans.slice(0, ENTITY_CAPS.PLANS),
				requirements: projectRequirements.slice(0, ENTITY_CAPS.REQUIREMENTS),
				documents: [...data.documents]
					.sort(
						(a, b) =>
							parseISO(b.updated_at).getTime() - parseISO(a.updated_at).getTime()
					)
					.slice(0, ENTITY_CAPS.DOCUMENTS),
				nextSteps,
				nextMilestone: nextMilestone?.title || null,
				activePlan,
				calendarToday: projectCalendarToday,
				calendarUpcoming: projectCalendarUpcoming,
				todaysTasks: projectTodaysTasks,
				thisWeekTasks: [...projectTodaysTasks, ...projectUpcomingAll],
				blockedTasks: projectBlockedTasks,
				unblockingTasks: unblockingTasks.map((u) => u.task),
				recentlyUpdatedTasks: projectRecentlyUpdated,
				upcomingTasks: projectUpcoming
			};
		});

		return {
			briefDate,
			timezone,
			goals: cappedGoals,
			risks: activeRisks,
			requirements: cappedRequirements,
			todaysTasks: categorizedTasks.todaysTasks,
			blockedTasks: categorizedTasks.blockedTasks,
			overdueTasks: categorizedTasks.overdueTasks,
			highPriorityCount,
			recentUpdates: allRecentUpdates,
			tasksByWorkMode,
			projects,
			calendar,
			// Strategic task splits per PROJECT_CONTEXT_ENRICHMENT_SPEC.md
			recentlyUpdatedTasks,
			upcomingTasks
		};
	}

	/**
	 * Calculate brief metadata
	 */
	calculateMetadata(
		projectsData: OntoProjectWithRelations[],
		briefData: OntologyBriefData,
		briefDate: string,
		timezone: string
	): OntologyBriefMetadata {
		// Calculate week end date (7 days from today) in user's timezone
		const weekEndStr = addDaysToLocalDate(briefDate, 7, timezone);

		const allTasks = projectsData.flatMap((p) => p.tasks);
		const allGoals = projectsData.flatMap((p) => p.goals);
		const allMilestones = projectsData.flatMap((p) => p.milestones);
		const allRisks = projectsData.flatMap((p) => p.risks);
		const allEdges = projectsData.flatMap((p) => p.edges);
		const allGoalProgress = projectsData.flatMap((p) => Array.from(p.goalProgress.values()));

		// Count milestones this week (already pre-filtered to exclude completed/missed at DB level)
		const milestonesThisWeek = allMilestones.filter((m) => {
			if (!m.due_at) return false;
			const dueDateStr = formatInTimeZone(parseISO(m.due_at), timezone, 'yyyy-MM-dd');
			return dueDateStr >= briefDate && dueDateStr <= weekEndStr;
		}).length;

		// Count active risks and goals at risk (use full sets, not capped brief data)
		const activeRisksCount = allRisks.filter(
			(r) => r.state_key !== 'mitigated' && r.state_key !== 'closed'
		).length;
		const goalsAtRisk = allGoalProgress.filter(
			(g) => g.status === 'at_risk' || g.status === 'behind'
		).length;

		// Count dependency chains (simplified)
		const dependencyChains = projectsData.reduce(
			(count, p) => count + p.taskDependencies.size,
			0
		);

		// Count recent updates
		const recentUpdatesCount =
			briefData.recentUpdates.tasks.length +
			briefData.recentUpdates.goals.length +
			briefData.recentUpdates.documents.length +
			(briefData.recentUpdates.plans?.length ?? 0);

		return {
			totalProjects: projectsData.length,
			totalTasks: allTasks.length,
			totalGoals: allGoals.length,
			totalMilestones: allMilestones.length,
			activeRisksCount,
			recentUpdatesCount,
			blockedCount: briefData.blockedTasks.length,
			overdueCount: briefData.overdueTasks.length,
			goalsAtRisk,
			milestonesThisWeek,
			totalEdges: allEdges.length,
			dependencyChains,
			calendarTodayCount: briefData.calendar.todayTotal,
			calendarUpcomingCount: briefData.calendar.upcomingTotal,
			calendarGoogleCount: briefData.calendar.counts.all.google,
			calendarInternalCount: briefData.calendar.counts.all.internal,
			calendarSyncIssueCount: briefData.calendar.counts.all.syncIssue,
			generatedVia: 'ontology_v1',
			timezone
		};
	}
}
