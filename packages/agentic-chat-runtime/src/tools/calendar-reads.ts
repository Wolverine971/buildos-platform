// packages/agentic-chat-runtime/src/tools/calendar-reads.ts
//
// Shared calendar READ tools (Phase 4 Slice 18 S3-A3): `list_calendar_events`,
// `get_calendar_event_details`, and `get_project_calendar`, ported from the web
// executor
// (apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts)
// onto the injected `AgenticChatCalendarReadPortV1` plus the host's Supabase
// client. Reads only — the four calendar writes and `set_project_calendar` stay
// on the web executor.
//
// Two things differ from the legacy executor on purpose:
//
//  1. There is no legacy single-OAuth-account fallback. The port is the only
//     provider route; a user with no source-aware calendar connection gets
//     `coverage: 'unavailable'` with `reason_code: 'not_connected'` instead of
//     an empty event list that reads like "the calendar is free".
//  2. The user-scope `onto_events` query selects the same sync-row projection
//     as `OntoEventReadService` (ONTO_EVENT_WITH_SYNC_SELECT), so the merged
//     payload no longer drops `external_calendar_id` outside project scope.
//
// Authorization: the worker reads with a service-role client and has no RLS, so
// every query below is gated explicitly. Project-scoped reads go through
// `context.access.assertProjectAccess`; user-scoped reads filter on
// `context.userId` (the turn's trusted claim) or the access port's actor id.

import { isValidUUID } from '@buildos/shared-agent-ops/utils/validation-utils';
import {
	ONTO_EVENT_WITH_SYNC_SELECT,
	scopeOntoEventSyncRows
} from '@buildos/shared-agent-ops/calendar/onto-event-read.service';
import type {
	AgenticChatCalendarEventV1,
	AgenticChatCalendarReadCoverageV1,
	AgenticChatCalendarSourceFailureV1
} from './external-ports';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';

// ============================================
// COVERAGE
// ============================================

/**
 * Zero sources means nothing failed, so coverage is vacuously complete. Hosts
 * that read nothing at all (no connection, no credentials) must set
 * `unavailable` explicitly rather than relying on this.
 */
export function resolveCalendarReadCoverage(
	sourceCount: number,
	successfulSourceCount: number
): AgenticChatCalendarReadCoverageV1 {
	if (sourceCount - successfulSourceCount === 0) return 'complete';
	return successfulSourceCount === 0 ? 'unavailable' : 'degraded';
}

export type AgenticChatCalendarReadSummaryV1 = {
	mode: 'none' | 'legacy_single_account' | 'source_aware';
	source_count: number;
	successful_source_count: number;
	failed_source_count: number;
	partial: boolean;
	/** `partial` alone cannot separate 0-of-N from N-1-of-N. Coverage can. */
	coverage: AgenticChatCalendarReadCoverageV1;
	source_failures: AgenticChatCalendarSourceFailureV1[];
};

/**
 * The model previously saw `partial: true` for both a total calendar outage and
 * a single missing calendar. Say plainly which one happened, and what to do
 * about it.
 */
export function describeCalendarCoverage(read: {
	coverage: AgenticChatCalendarReadCoverageV1;
	source_count: number;
	failed_source_count: number;
	source_failures: AgenticChatCalendarSourceFailureV1[];
}): string | null {
	if (read.coverage === 'complete') return null;

	const reasons = Array.from(new Set(read.source_failures.map((f) => f.reason_code))).join(', ');
	const reconnect = read.source_failures.filter((f) => f.reason_code === 'reconnect_required');
	const reconnectSentence = reconnect.length
		? ` Tell the user to reconnect ${reconnect
				.map((f) => f.calendar)
				.filter((calendar) => calendar.length > 0)
				.join(', ')} from Profile > Calendar (/profile?tab=calendar).`
		: '';

	if (read.coverage === 'unavailable') {
		// A zero-source outage has no "all N sources failed" to report; say what
		// actually happened (nothing is connected / nothing is configured).
		if (read.source_count === 0) {
			return (
				`No calendar data was read (${reasons || 'no calendar source was available'}). ` +
				`Do not assert availability, free time, or that a slot is open from this result — ` +
				`the calendar was not read.${reconnectSentence}`
			);
		}
		return (
			`No calendar data was read: all ${read.source_count} connected calendar source(s) failed` +
			`${reasons ? ` (${reasons})` : ''}. Do not assert availability, free time, or that a slot is open ` +
			`from this result — the calendar was not read.${reconnectSentence}`
		);
	}

	return (
		`Calendar coverage is degraded: ${read.failed_source_count} of ${read.source_count} calendar ` +
		`source(s) failed${reasons ? ` (${reasons})` : ''}. Events on those calendars are missing from ` +
		`this result, so availability may be wrong.${reconnectSentence}`
	);
}

// ============================================
// ARGS
// ============================================

export type SharedCalendarScopeV1 = 'user' | 'project' | 'calendar_id';

export interface SharedListCalendarEventsArgs {
	timeMin?: string;
	time_min?: string;
	timeMax?: string;
	time_max?: string;
	timezone?: string;
	query?: string;
	q?: string;
	limit?: number;
	max_results?: number;
	offset?: number;
	calendar_scope?: SharedCalendarScopeV1;
	calendarScope?: SharedCalendarScopeV1;
	project_id?: string;
	projectId?: string;
	calendar_id?: string;
	calendarId?: string;
}

export interface SharedGetCalendarEventDetailsArgs {
	onto_event_id?: string;
	event_id?: string;
	external_event_id?: string;
	calendar_id?: string;
	calendarId?: string;
	calendar_scope?: SharedCalendarScopeV1;
	calendarScope?: SharedCalendarScopeV1;
	project_id?: string;
	projectId?: string;
	calendar_source_id?: string;
}

export interface SharedGetProjectCalendarArgs {
	project_id: string;
}

// ============================================
// CONSTANTS (mirrors the legacy web executor)
// ============================================

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIST_LOOKBACK_DAYS = 7;
const DEFAULT_LIST_LOOKAHEAD_DAYS = 90;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 200;
const MAX_LIST_FETCH = 300;
const MAX_LIST_OFFSET = MAX_LIST_FETCH - 1;
/**
 * Multi-account fan-out can cover dozens of enabled sources. The default 4s
 * interactive budget is too short for that bounded set and can turn every
 * source into a timeout before the first useful read.
 */
const CALENDAR_LIST_BUDGET_MS = 20_000;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIMEZONE_SUFFIX_PATTERN = /(Z|[+-]\d{2}(:?\d{2})?)$/i;
const NAIVE_DATETIME_PATTERN =
	/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

// ============================================
// ARG HELPERS (ported verbatim from the web executor)
// ============================================

function stringArg(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (trimmed.length > 0) return trimmed;
	}
	return undefined;
}

function numericArg(...values: unknown[]): number | undefined {
	for (const value of values) {
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		if (typeof value === 'string') {
			const trimmed = value.trim();
			if (!trimmed) continue;
			const parsed = Number(trimmed);
			if (Number.isFinite(parsed)) return parsed;
		}
	}
	return undefined;
}

function uuidArg(fieldName: string, ...values: unknown[]): string | undefined {
	const value = stringArg(...values);
	if (!value) return undefined;
	if (!isValidUUID(value)) {
		throw new Error(`Invalid ${fieldName}: expected UUID`);
	}
	return value;
}

function normalizeCalendarId(value?: string | null): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length > 200) return null;
	if (/\s/.test(trimmed)) return null;
	if (trimmed === 'primary') return trimmed;
	if (trimmed.includes('@')) return trimmed;
	return null;
}

function normalizeListCalendarScope(
	rawScope: unknown,
	fallback: SharedCalendarScopeV1
): SharedCalendarScopeV1 {
	if (typeof rawScope !== 'string') return fallback;
	const normalized = rawScope.trim();
	if (!normalized) return fallback;
	if (normalized === 'user' || normalized === 'project' || normalized === 'calendar_id') {
		return normalized;
	}
	throw new Error('calendar_scope must be one of: user, project, calendar_id');
}

function normalizeListLimit(rawLimit: number | undefined): number {
	if (rawLimit === undefined) return DEFAULT_LIST_LIMIT;
	return Math.min(Math.max(Math.floor(rawLimit), 1), MAX_LIST_LIMIT);
}

function normalizeListOffset(rawOffset: number | undefined): number {
	if (rawOffset === undefined) return 0;
	const offset = Math.floor(rawOffset);
	if (offset < 0 || offset > MAX_LIST_OFFSET) {
		throw new Error(`offset must be between 0 and ${MAX_LIST_OFFSET}`);
	}
	return offset;
}

// ============================================
// TIMEZONE / RANGE
// ============================================

function isValidIanaTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

/**
 * The read context carries `users.timezone` (null when unknown or invalid).
 * Unlike the legacy web executor, which hard-coded `America/New_York` for a
 * user with no stored zone, the shared tools fall back to UTC — the documented
 * contract for `AgenticChatSharedReadContextV1.timezone`.
 */
function contextTimezone(context: AgenticChatSharedReadContextV1): string {
	const candidate = typeof context.timezone === 'string' ? context.timezone.trim() : '';
	return candidate && isValidIanaTimezone(candidate) ? candidate : 'UTC';
}

function resolveInputTimezone(
	context: AgenticChatSharedReadContextV1,
	candidate?: string | null
): string {
	const trimmed = typeof candidate === 'string' ? candidate.trim() : '';
	if (trimmed.length === 0) return contextTimezone(context);
	if (!isValidIanaTimezone(trimmed)) {
		throw new Error(
			`Invalid timezone "${trimmed}". Use an IANA timezone like "America/New_York".`
		);
	}
	return trimmed;
}

/** Offset (ms) between the wall-clock reading of `date` in `timezone` and the instant. */
function timeZoneOffsetMs(date: Date, timezone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(date);
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return (
		Date.UTC(
			Number(values.year),
			Number(values.month) - 1,
			Number(values.day),
			Number(values.hour),
			Number(values.minute),
			Number(values.second)
		) - date.getTime()
	);
}

/** Wall-clock components read in `timezone` -> the ISO instant they name. */
function zonedWallClockToInstant(
	parts: {
		year: number;
		month: number;
		day: number;
		hour: number;
		minute: number;
		second: number;
		millisecond: number;
	},
	timezone: string
): Date {
	const wallClockUtc = Date.UTC(
		parts.year,
		parts.month - 1,
		parts.day,
		parts.hour,
		parts.minute,
		parts.second,
		parts.millisecond
	);
	// Two passes settle the boundary when the first guess lands on the other
	// side of a daylight-saving transition.
	let candidate = wallClockUtc - timeZoneOffsetMs(new Date(wallClockUtc), timezone);
	candidate = wallClockUtc - timeZoneOffsetMs(new Date(candidate), timezone);
	return new Date(candidate);
}

function normalizeOffsetSuffix(value: string): string {
	return value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
}

/**
 * Port of the web executor's `normalizeCalendarDateTimeInput`: explicit offsets
 * pass through, bare dates become the requested civil boundary in `timezone`,
 * and a naive datetime is read as wall-clock time in `timezone`.
 */
function parseCalendarDateTime(
	rawValue: string,
	timezone: string,
	fieldName: string,
	dateBoundary: 'start' | 'end'
): string {
	const value = normalizeOffsetSuffix(rawValue.trim());
	if (!value) throw new Error(`${fieldName} is required`);

	if (value.includes('T') && TIMEZONE_SUFFIX_PATTERN.test(value)) {
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) {
			throw new Error(`${fieldName} must be a valid ISO 8601 datetime`);
		}
		return parsed.toISOString();
	}

	if (DATE_ONLY_PATTERN.test(value)) {
		const [year, month, day] = value.split('-').map(Number);
		const parsed = zonedWallClockToInstant(
			dateBoundary === 'end'
				? { year, month, day, hour: 23, minute: 59, second: 59, millisecond: 0 }
				: { year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 },
			timezone
		);
		if (Number.isNaN(parsed.getTime())) {
			throw new Error(`${fieldName} must be a valid ISO 8601 date`);
		}
		return parsed.toISOString();
	}

	const naive = NAIVE_DATETIME_PATTERN.exec(value);
	if (naive) {
		const parsed = zonedWallClockToInstant(
			{
				year: Number(naive[1]),
				month: Number(naive[2]),
				day: Number(naive[3]),
				hour: Number(naive[4]),
				minute: Number(naive[5]),
				second: Number(naive[6] ?? '0'),
				millisecond: Number((naive[7] ?? '0').padEnd(3, '0'))
			},
			timezone
		);
		if (Number.isNaN(parsed.getTime())) {
			throw new Error(`${fieldName} must be a valid ISO 8601 datetime`);
		}
		return parsed.toISOString();
	}

	throw new Error(`${fieldName} must be a valid ISO 8601 datetime`);
}

interface ResolvedListCalendarRange {
	timeMin: string;
	timeMax: string;
	timezone: string;
	defaultsApplied: { timeMin: boolean; timeMax: boolean };
}

function resolveListCalendarRange(
	context: AgenticChatSharedReadContextV1,
	args: SharedListCalendarEventsArgs
): ResolvedListCalendarRange {
	const timezone = resolveInputTimezone(context, args.timezone);
	const rawTimeMin = stringArg(args.timeMin, args.time_min);
	const rawTimeMax = stringArg(args.timeMax, args.time_max);
	const defaultsApplied = { timeMin: false, timeMax: false };

	let timeMin = rawTimeMin
		? parseCalendarDateTime(rawTimeMin, timezone, 'time_min', 'start')
		: null;
	let timeMax = rawTimeMax
		? parseCalendarDateTime(rawTimeMax, timezone, 'time_max', 'end')
		: null;

	const now = Date.now();
	if (!timeMin) {
		defaultsApplied.timeMin = true;
		timeMin = new Date(now - DEFAULT_LIST_LOOKBACK_DAYS * DAY_IN_MS).toISOString();
	}
	if (!timeMax) {
		defaultsApplied.timeMax = true;
		timeMax = new Date(now + DEFAULT_LIST_LOOKAHEAD_DAYS * DAY_IN_MS).toISOString();
	}

	if (Date.parse(timeMax) <= Date.parse(timeMin)) {
		throw new Error('time_max must be after time_min');
	}

	return { timeMin, timeMax, timezone, defaultsApplied };
}

// ============================================
// SHARED HELPERS
// ============================================

const CALENDAR_PORT_UNAVAILABLE_REASON = 'calendar_port_unavailable';

function emptyCalendarRead(): AgenticChatCalendarReadSummaryV1 {
	return {
		mode: 'none',
		source_count: 0,
		successful_source_count: 0,
		failed_source_count: 0,
		partial: false,
		coverage: 'complete',
		source_failures: []
	};
}

function unavailableCalendarRead(reasonCode: string): AgenticChatCalendarReadSummaryV1 {
	return {
		mode: 'none',
		source_count: 0,
		successful_source_count: 0,
		failed_source_count: 0,
		partial: false,
		coverage: 'unavailable',
		source_failures: [
			{ calendar: '', calendar_source_id: '', connection_id: '', reason_code: reasonCode }
		]
	};
}

/** Same sentence the legacy executor emitted when the Google read produced nothing at all. */
function noCalendarDataWarning(detail: string): string {
	return `No calendar data was read (${detail}). Do not assert availability or that time is free from this result.`;
}

function errorDetail(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

function normalizeTitle(value?: string | null): string {
	return (value ?? '').trim().toLowerCase();
}

type OntoEventRecord = Record<string, any>;

/**
 * Loads the ontology events for a list request. Project scope is gated by the
 * access port; user scope is gated by the acting actor id, and both scope the
 * `onto_event_sync` rows to the turn's trusted user id.
 */
async function loadOntologyEventsForList(
	context: AgenticChatSharedReadContextV1,
	input: {
		scope: SharedCalendarScopeV1;
		projectId?: string;
		timeMin: string;
		timeMax: string;
		fetchLimit: number;
	}
): Promise<OntoEventRecord[]> {
	const client = context.client as any;

	if (input.scope === 'project' && input.projectId) {
		// Access already asserted by the caller; scope the query to that project.
		let query = client
			.from('onto_events')
			.select(ONTO_EVENT_WITH_SYNC_SELECT)
			.eq('project_id', input.projectId)
			.is('deleted_at', null)
			.order('start_at', { ascending: true })
			.limit(input.fetchLimit);
		query = query.gte('start_at', input.timeMin).lte('start_at', input.timeMax);
		const { data, error } = await query;
		if (error) throw new Error(error.message);
		return ((data ?? []) as OntoEventRecord[]).map((event) => ({
			...event,
			onto_event_sync: scopeOntoEventSyncRows(event.onto_event_sync, context.userId)
		}));
	}

	// User scope: the actor's own events. The worker has no RLS, so `created_by`
	// is the authorization fence here, exactly as auth.uid() was on web.
	const actorId = await context.access.getActorId();
	let query = client
		.from('onto_events')
		.select(ONTO_EVENT_WITH_SYNC_SELECT)
		.eq('created_by', actorId)
		.is('deleted_at', null)
		.order('start_at', { ascending: true })
		.limit(input.fetchLimit);

	if (input.projectId) query = query.eq('project_id', input.projectId);
	query = query.gte('start_at', input.timeMin).lte('start_at', input.timeMax);

	const { data, error } = await query;
	if (error) throw new Error(error.message);
	return ((data ?? []) as OntoEventRecord[]).map((event) => ({
		...event,
		onto_event_sync: scopeOntoEventSyncRows(event.onto_event_sync, context.userId)
	}));
}

/**
 * Task titles for task-owned events, used for the title-based merge fallback.
 * The ids come from rows the caller already authorized; the extra `project_id`
 * fence keeps a service-role client from reading a task outside them.
 */
async function loadTaskTitles(
	context: AgenticChatSharedReadContextV1,
	ontoEvents: readonly OntoEventRecord[]
): Promise<Map<string, string>> {
	const taskTitleById = new Map<string, string>();
	const taskOwningEvents = ontoEvents.filter(
		(event) => event.owner_entity_type === 'task' && event.owner_entity_id
	);
	const taskIds = Array.from(
		new Set(taskOwningEvents.map((event) => event.owner_entity_id as string))
	);
	if (taskIds.length === 0) return taskTitleById;

	const projectIds = Array.from(
		new Set(
			taskOwningEvents
				.map((event) => event.project_id)
				.filter((projectId): projectId is string => typeof projectId === 'string')
		)
	);

	let query = (context.client as any).from('onto_tasks').select('id, title').in('id', taskIds);
	if (projectIds.length > 0) query = query.in('project_id', projectIds);

	const { data: tasks, error } = await query;
	if (error) throw new Error(error.message);

	for (const task of (tasks ?? []) as Array<{ id?: string | null; title?: string | null }>) {
		if (task.id) taskTitleById.set(task.id, task.title ?? '');
	}
	return taskTitleById;
}

// ============================================
// list_calendar_events
// ============================================

export async function listCalendarEvents(
	context: AgenticChatSharedReadContextV1,
	args: SharedListCalendarEventsArgs
): Promise<Record<string, any>> {
	const projectId = uuidArg('project_id', args.project_id, args.projectId);
	const textQuery = stringArg(args.query, args.q);
	const requestedScope = stringArg(args.calendar_scope, args.calendarScope);
	const scope = normalizeListCalendarScope(requestedScope, projectId ? 'project' : 'user');
	const { timeMin, timeMax, timezone, defaultsApplied } = resolveListCalendarRange(context, args);
	const limit = normalizeListLimit(numericArg(args.limit, args.max_results));
	const offset = normalizeListOffset(numericArg(args.offset));
	const fetchLimit = Math.min(limit + offset, MAX_LIST_FETCH);

	let googleEvents: AgenticChatCalendarEventV1[] = [];
	let googleError: string | null = null;
	let googleCalendarId: string | null = null;
	let googleCalendarSourceId: string | null = null;
	let googleRead = emptyCalendarRead();
	const requestedCalendarId = normalizeCalendarId(stringArg(args.calendar_id, args.calendarId));

	if (scope === 'project') {
		if (!projectId) {
			throw new Error('project_id is required when calendar_scope is project');
		}
		await context.access.assertProjectAccess(projectId, 'read');

		// `user_id` scoping matters on a service-role client: the mapping row is
		// per-member, and reading another member's row would route the fan-out at
		// their calendar.
		const { data: projectCalendar } = await (context.client as any)
			.from('project_calendars')
			.select('id, calendar_id, calendar_source_id, sync_enabled')
			.eq('project_id', projectId)
			.eq('user_id', context.userId)
			.maybeSingle();

		if (projectCalendar?.calendar_id && projectCalendar.sync_enabled !== false) {
			googleCalendarId = projectCalendar.calendar_id;
			googleCalendarSourceId = projectCalendar.calendar_source_id ?? null;
		}
	} else if (scope === 'calendar_id') {
		if (!requestedCalendarId) {
			throw new Error('calendar_id must be a valid Google Calendar ID');
		}
		googleCalendarId = requestedCalendarId;
	} else {
		googleCalendarId = requestedCalendarId ?? 'primary';
	}

	if (googleCalendarId) {
		if (!context.calendar) {
			googleRead = unavailableCalendarRead(CALENDAR_PORT_UNAVAILABLE_REASON);
			googleError = noCalendarDataWarning('calendar access is not configured for this host');
		} else {
			try {
				const response = await context.calendar.listEvents({
					userId: context.userId,
					calendarSourceId: googleCalendarSourceId ?? undefined,
					// An implicit user/primary scope means every enabled read source
					// in the multi-account model. Explicit/project calendar ids still
					// resolve to one exact source through the host's target resolver.
					calendarId:
						scope === 'user' && !requestedCalendarId ? undefined : googleCalendarId,
					timeMin,
					timeMax,
					maxResults: fetchLimit,
					query: textQuery,
					timeZone: timezone,
					budgetMs: CALENDAR_LIST_BUDGET_MS
				});
				googleEvents = response.events ?? [];
				googleRead = {
					mode: response.mode,
					source_count: response.sourceCount,
					successful_source_count: response.successfulSourceCount,
					failed_source_count: response.failedSourceCount,
					partial: response.partial,
					coverage: response.coverage,
					source_failures: response.sourceFailures ?? []
				};
				const coverageWarning = describeCalendarCoverage(googleRead);
				if (coverageWarning) {
					googleError = coverageWarning;
				} else if (response.partial) {
					googleError = `Calendar read returned partial results for ${response.failedSourceCount} source(s).`;
				}
			} catch (error) {
				// The provider read produced nothing at all, so the model must not
				// treat an empty event list as evidence that the time is free.
				googleEvents = [];
				googleRead = { ...googleRead, coverage: 'unavailable' };
				googleError = noCalendarDataWarning(
					errorDetail(error, 'Failed to load Google events')
				);
			}
		}
	}

	let ontoEvents = await loadOntologyEventsForList(context, {
		scope,
		projectId,
		timeMin,
		timeMax,
		fetchLimit
	});

	if (textQuery) {
		const normalizedQuery = textQuery.toLowerCase();
		ontoEvents = ontoEvents.filter((event) => {
			const props = (event.props as Record<string, unknown> | null) ?? {};
			const taskTitle = typeof props.task_title === 'string' ? props.task_title : undefined;
			const candidates = [event.title, event.description, event.location, taskTitle];
			return candidates.some((candidate) =>
				typeof candidate === 'string'
					? candidate.toLowerCase().includes(normalizedQuery)
					: false
			);
		});
	}

	const taskTitleById = await loadTaskTitles(context, ontoEvents);

	const googleEventKey = (event: AgenticChatCalendarEventV1): string =>
		`${event.calendarSourceId ?? 'legacy'} ${event.providerEventId ?? event.id}`;
	const googlePrimaryById = new Map<string, AgenticChatCalendarEventV1>();
	const googleByQualifiedIdentity = new Map<string, AgenticChatCalendarEventV1>();
	const googleByProviderEventId = new Map<string, Set<AgenticChatCalendarEventV1>>();
	const googleByTitle = new Map<string, AgenticChatCalendarEventV1[]>();
	for (const event of googleEvents) {
		if (!event.id) continue;
		googlePrimaryById.set(googleEventKey(event), event);
		const identities = [
			{
				calendarSourceId: event.calendarSourceId,
				providerEventId: event.providerEventId ?? event.id
			},
			...(event.contributingSourceEvents ?? [])
		];
		for (const identity of identities) {
			if (!identity.calendarSourceId || !identity.providerEventId) continue;
			googleByQualifiedIdentity.set(
				`${identity.calendarSourceId} ${identity.providerEventId}`,
				event
			);
			const providerBucket =
				googleByProviderEventId.get(identity.providerEventId) ?? new Set();
			providerBucket.add(event);
			googleByProviderEventId.set(identity.providerEventId, providerBucket);
		}
		const summaryKey = normalizeTitle(event.summary);
		if (summaryKey) {
			const bucket = googleByTitle.get(summaryKey) ?? [];
			bucket.push(event);
			googleByTitle.set(summaryKey, bucket);
		}
	}

	const merged: Array<Record<string, any>> = [];

	for (const event of ontoEvents) {
		const syncRows = event.onto_event_sync || [];
		const syncRow = syncRows.find((candidate: any) => candidate.user_id === context.userId);
		const externalId = syncRow?.external_event_id ?? null;
		const calendarSourceId = syncRow?.calendar_source_id ?? null;
		let matchedGoogle: AgenticChatCalendarEventV1 | undefined;

		if (externalId) {
			matchedGoogle = calendarSourceId
				? googleByQualifiedIdentity.get(`${calendarSourceId} ${externalId}`)
				: Array.from(googleByProviderEventId.get(externalId) ?? []).filter((candidate) =>
							googlePrimaryById.has(googleEventKey(candidate))
					  ).length === 1
					? Array.from(googleByProviderEventId.get(externalId) ?? []).find((candidate) =>
							googlePrimaryById.has(googleEventKey(candidate))
						)
					: undefined;
			if (matchedGoogle) {
				googlePrimaryById.delete(googleEventKey(matchedGoogle));
			}
		}

		if (!matchedGoogle && !externalId) {
			const titleKey = normalizeTitle(event.title);
			const taskTitleKey = normalizeTitle(
				taskTitleById.get(event.owner_entity_id as string) ?? ''
			);
			const canMatchByTitle =
				event.owner_entity_type === 'task' && titleKey && titleKey === taskTitleKey;

			if (canMatchByTitle) {
				const bucket = googleByTitle.get(titleKey);
				if (bucket && bucket.length > 0) {
					matchedGoogle = bucket.find((candidate) =>
						googlePrimaryById.has(googleEventKey(candidate))
					);
					if (matchedGoogle?.id) {
						googlePrimaryById.delete(googleEventKey(matchedGoogle));
					}
				}
			}
		}

		const props = (event.props as Record<string, unknown>) ?? {};
		const taskLink =
			typeof props.task_link === 'string'
				? props.task_link
				: event.owner_entity_type === 'task' && event.project_id && event.owner_entity_id
					? `/projects/${event.project_id}/tasks/${event.owner_entity_id}`
					: null;
		const matchedTopLevelSource =
			matchedGoogle &&
			(calendarSourceId === null || calendarSourceId === matchedGoogle.calendarSourceId);

		merged.push({
			source: 'ontology',
			is_synced: Boolean(externalId),
			external_event_id:
				externalId ?? matchedGoogle?.providerEventId ?? matchedGoogle?.id ?? null,
			calendar_source_id: calendarSourceId ?? matchedGoogle?.calendarSourceId ?? null,
			connection_id: matchedTopLevelSource ? (matchedGoogle?.connectionId ?? null) : null,
			provider_calendar_id: matchedTopLevelSource
				? (matchedGoogle?.providerCalendarId ?? null)
				: null,
			onto_event_id: event.id,
			title: event.title,
			start_at: event.start_at,
			end_at: event.end_at,
			owner_entity_type: event.owner_entity_type,
			owner_entity_id: event.owner_entity_id,
			task_link: taskLink,
			sync_status: event.sync_status,
			sync_error: event.sync_error,
			event
		});
	}

	for (const event of googlePrimaryById.values()) {
		const startAt = event.start?.dateTime || event.start?.date || null;
		const endAt = event.end?.dateTime || event.end?.date || null;
		merged.push({
			source: 'google',
			is_synced: false,
			external_event_id: event.providerEventId ?? event.id ?? null,
			calendar_source_id: event.calendarSourceId ?? null,
			connection_id: event.connectionId ?? null,
			provider_calendar_id: event.providerCalendarId ?? null,
			title: event.summary,
			start_at: startAt,
			end_at: endAt,
			// Hosts carry the untouched provider payload on `raw`; the legacy
			// executor echoed that same object back to the model.
			event: event.raw ?? event
		});
	}

	merged.sort((a, b) => {
		const aTime = new Date(a.start_at || 0).getTime();
		const bTime = new Date(b.start_at || 0).getTime();
		return aTime - bTime;
	});

	const totalAvailable = merged.length;
	const pagedEvents = merged.slice(offset, offset + limit);
	const warnings: string[] = [];
	if (googleError) warnings.push(googleError);
	if (defaultsApplied.timeMin || defaultsApplied.timeMax) {
		warnings.push(
			`Applied default event window (${DEFAULT_LIST_LOOKBACK_DAYS}d past, ${DEFAULT_LIST_LOOKAHEAD_DAYS}d future). Pass time_min/time_max for exact range control.`
		);
	}

	return {
		events: pagedEvents,
		google_event_count: googleEvents.length,
		ontology_event_count: ontoEvents.length,
		merged_event_count: totalAvailable,
		pagination: {
			offset,
			limit,
			returned: pagedEvents.length,
			total_available: totalAvailable,
			has_more: offset + limit < totalAvailable,
			next_offset: offset + limit < totalAvailable ? offset + limit : null
		},
		queried_range: {
			time_min: timeMin,
			time_max: timeMax,
			timezone,
			query: textQuery ?? null,
			default_time_min_applied: defaultsApplied.timeMin,
			default_time_max_applied: defaultsApplied.timeMax
		},
		google_read: googleRead,
		warnings
	};
}

// ============================================
// get_calendar_event_details
// ============================================

export async function getCalendarEventDetails(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetCalendarEventDetailsArgs
): Promise<Record<string, any>> {
	// Models routinely pass the Google event id from list_calendar_events'
	// external_event_id as onto_event_id. A non-UUID value cannot reference an
	// ontology event, so route it to the Google lookup instead of failing the round.
	const rawOntoEventId = stringArg(args.onto_event_id);
	let googleEventIdFromOntoArg: string | undefined;
	if (rawOntoEventId) {
		if (isValidUUID(rawOntoEventId)) {
			const event = await loadAuthorizedOntoEvent(context, rawOntoEventId);
			if (!event) throw new Error('Event not found');
			return { source: 'ontology', event };
		}
		googleEventIdFromOntoArg = rawOntoEventId;
	}

	const eventId = stringArg(args.event_id, args.external_event_id) ?? googleEventIdFromOntoArg;
	if (!eventId) {
		throw new Error(
			'Provide onto_event_id (the UUID from list_calendar_events results) or event_id (the external_event_id value for Google events).'
		);
	}

	if (!context.calendar) {
		return {
			source: 'google',
			coverage: 'unavailable',
			reason_code: CALENDAR_PORT_UNAVAILABLE_REASON,
			calendar_source_id: null,
			connection_id: null,
			provider_calendar_id: null,
			external_event_id: eventId,
			event: null,
			warnings: [noCalendarDataWarning('calendar access is not configured for this host')]
		};
	}

	const result = await context.calendar.getEvent({
		userId: context.userId,
		providerEventId: eventId,
		calendarSourceId: stringArg(args.calendar_source_id),
		calendarId: normalizeCalendarId(stringArg(args.calendar_id, args.calendarId)) ?? undefined
	});

	if (!result.event) {
		const reasonCode = result.reasonCode ?? 'not_found';
		return {
			source: 'google',
			coverage: 'unavailable',
			reason_code: reasonCode,
			calendar_source_id: result.calendarSourceId,
			connection_id: result.connectionId,
			provider_calendar_id: result.providerCalendarId,
			external_event_id: eventId,
			event: null,
			warnings: [noCalendarDataWarning(reasonCode)]
		};
	}

	return {
		source: 'google',
		calendar_source_id: result.calendarSourceId,
		connection_id: result.connectionId,
		provider_calendar_id: result.providerCalendarId,
		external_event_id: result.event.providerEventId ?? eventId,
		event: result.event.raw ?? result.event
	};
}

/**
 * Loads one `onto_events` row and gates it. The legacy web path relied on RLS
 * for this read; the worker's service-role client has none, so membership on
 * the owning project (or ownership of a projectless personal event) is checked
 * explicitly before the row is returned.
 */
async function loadAuthorizedOntoEvent(
	context: AgenticChatSharedReadContextV1,
	eventId: string
): Promise<OntoEventRecord | null> {
	const client = context.client as any;
	const { data, error } = await client
		.from('onto_events')
		.select(ONTO_EVENT_WITH_SYNC_SELECT)
		.eq('id', eventId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) return null;

	const event = data as OntoEventRecord;
	if (typeof event.project_id === 'string' && event.project_id) {
		await context.access.assertProjectAccess(event.project_id, 'read');
	} else {
		const actorId = await context.access.getActorId();
		if (event.created_by !== actorId) return null;
	}

	return {
		...event,
		onto_event_sync: scopeOntoEventSyncRows(event.onto_event_sync, context.userId)
	};
}

// ============================================
// get_project_calendar
// ============================================

export async function getProjectCalendar(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetProjectCalendarArgs
): Promise<Record<string, any>> {
	const projectId = uuidArg('project_id', args.project_id);
	if (!projectId) throw new Error('project_id is required');
	await context.access.assertProjectAccess(projectId, 'read');

	if (!context.calendar) {
		return {
			coverage: 'unavailable',
			reason_code: CALENDAR_PORT_UNAVAILABLE_REASON,
			project_id: projectId,
			project_calendar: null,
			warnings: [
				'The project calendar mapping was not read (calendar access is not configured for this host).'
			]
		};
	}

	const calendar = await context.calendar.getProjectCalendar({
		userId: context.userId,
		projectId
	});

	// The legacy web tool returned the bare `project_calendars` row, or a bare
	// `null` when the project had no mapping. A null tool result is not a legal
	// worker result envelope, so the mapping is carried in a stable field
	// instead; the row itself is unchanged when the host can hand it back.
	if (!calendar) {
		return {
			project_id: projectId,
			project_calendar: null,
			message: 'This project has no calendar mapping. Use set_project_calendar to create one.'
		};
	}

	return {
		project_id: projectId,
		project_calendar:
			calendar.raw && typeof calendar.raw === 'object'
				? (calendar.raw as Record<string, any>)
				: {
						id: calendar.id,
						project_id: calendar.projectId,
						calendar_id: calendar.calendarId,
						calendar_source_id: calendar.calendarSourceId,
						calendar_name: calendar.calendarName,
						sync_enabled: calendar.syncEnabled,
						sync_mode: calendar.syncMode
					},
		message: 'Project calendar mapping loaded.'
	};
}
