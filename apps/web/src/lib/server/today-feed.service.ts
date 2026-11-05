// apps/web/src/lib/server/today-feed.service.ts
// Assembles the /today agenda: today's calendar events + today's tasks in the
// user's timezone, plus the attention counts the Today view surfaces as chips.
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { TypedSupabaseClient } from '@buildos/supabase-client';

import { isActiveFacing } from '$lib/config/project-states';
import type { ServerTiming } from '$lib/server/server-timing';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import type { CalendarItem } from '$lib/types/calendar-items';
import type {
	TodayFeed,
	TodayFeedDegradedSection,
	TodayProject,
	TodayTask,
	TodayTaskBucket
} from '$lib/types/today';
import { getDateOnlyCalendarDate } from '$lib/utils/date-only-semantics';

const ACTIVE_TASK_STATES = ['todo', 'in_progress', 'blocked'] as const;
const EVENT_FETCH_LIMIT = 200;
const TASK_FETCH_LIMIT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Tasks added this recently show as "new" when nothing else puts them on the day. */
const NEW_TASK_DAYS = 3;
/** In-progress tasks untouched this long stop showing on Today. */
const STALE_IN_PROGRESS_DAYS = 14;

export type { TodayFeed, TodayTask, TodayTaskBucket };

function isValidTimezone(timezone: string): boolean {
	try {
		Intl.DateTimeFormat(undefined, { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

export async function resolveTimezone(
	supabase: TypedSupabaseClient,
	userId: string,
	provided?: string | null
): Promise<string> {
	if (provided && isValidTimezone(provided)) {
		return provided;
	}
	const { data } = await supabase.from('users').select('timezone').eq('id', userId).single();
	const timezone = data?.timezone;
	return timezone && isValidTimezone(timezone) ? timezone : 'UTC';
}

/**
 * Midnight today in the user's timezone. "Overdue" everywhere (the Today chip
 * and the triage list) means due before this instant, so both agree.
 */
export function startOfUserDay(timezone: string, now: Date = new Date()): Date {
	const date = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
	return fromZonedTime(`${date}T00:00:00`, timezone);
}

export function resolveTodayTaskBucket(
	task: {
		due_at: string | null;
		start_at: string | null;
		state_key: string;
	},
	date: string,
	dayStartMs: number,
	dayEndMs: number,
	timezone?: string | null
): TodayTaskBucket | null {
	const dueDateOnly = getDateOnlyCalendarDate(task.due_at, 'end', timezone);
	if (dueDateOnly ? dueDateOnly === date : isWithinDay(task.due_at, dayStartMs, dayEndMs)) {
		return 'due_today';
	}

	const startDateOnly = getDateOnlyCalendarDate(task.start_at, 'start', timezone);
	if (startDateOnly ? startDateOnly === date : isWithinDay(task.start_at, dayStartMs, dayEndMs)) {
		return 'starts_today';
	}

	return task.state_key === 'in_progress' ? 'in_progress' : null;
}

/** Calendar days from `date` (YYYY-MM-DD) to the task's due date in the person's timezone. */
export function dueInDays(dueAt: string | null, date: string, timezone: string): number | null {
	if (!dueAt) return null;
	const dueDate =
		getDateOnlyCalendarDate(dueAt, 'end', timezone) ??
		(Number.isFinite(new Date(dueAt).getTime())
			? formatInTimeZone(new Date(dueAt), timezone, 'yyyy-MM-dd')
			: null);
	if (!dueDate) return null;
	return Math.round(
		(Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS
	);
}

/**
 * Today's bucket, widened for the week view: due yesterday through the next 7 days, then
 * tasks added in the last few days. In-progress tasks nobody touched for weeks drop off.
 */
export function resolveTodayWeekBucket(
	task: {
		due_at: string | null;
		start_at: string | null;
		state_key: string;
		created_at?: string | null;
		updated_at: string;
	},
	date: string,
	dayStartMs: number,
	dayEndMs: number,
	timezone: string,
	nowMs: number
): TodayTaskBucket | null {
	const todayBucket = resolveTodayTaskBucket(task, date, dayStartMs, dayEndMs, timezone);
	if (todayBucket && todayBucket !== 'in_progress') return todayBucket;
	const days = dueInDays(task.due_at, date, timezone);
	if (days !== null && days >= -1 && days <= 7 && days !== 0) return 'due_soon';
	const createdMs = task.created_at ? new Date(task.created_at).getTime() : NaN;
	if (Number.isFinite(createdMs) && createdMs >= nowMs - NEW_TASK_DAYS * DAY_MS) return 'new';
	if (todayBucket === 'in_progress') {
		const updatedMs = new Date(task.updated_at).getTime();
		if (Number.isFinite(updatedMs) && updatedMs >= nowMs - STALE_IN_PROGRESS_DAYS * DAY_MS)
			return 'in_progress';
	}
	return null;
}

function isWithinDay(value: string | null, dayStartMs: number, dayEndMs: number): boolean {
	if (!value) return false;
	const valueMs = new Date(value).getTime();
	return Number.isFinite(valueMs) && valueMs >= dayStartMs && valueMs < dayEndMs;
}

export async function getTodayFeed({
	supabase,
	userId,
	timezone: providedTimezone,
	timing
}: {
	supabase: TypedSupabaseClient;
	userId: string;
	timezone?: string | null;
	timing?: ServerTiming;
}): Promise<TodayFeed> {
	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		timing ? timing.measure(name, fn) : fn();

	const timezone = await resolveTimezone(supabase, userId, providedTimezone);
	const now = new Date();
	const date = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
	const dayStart = startOfUserDay(timezone, now);
	const nextDate = formatInTimeZone(
		new Date(dayStart.getTime() + 36 * 60 * 60 * 1000),
		timezone,
		'yyyy-MM-dd'
	);
	const dayEnd = fromZonedTime(`${nextDate}T00:00:00`, timezone);
	const dayStartIso = dayStart.toISOString();
	const dayEndIso = dayEnd.toISOString();
	// A day of slack on both ends: date-only due dates are stored at the end of their day, and
	// the exact window is applied per task below.
	const weekStartIso = new Date(dayStart.getTime() - 2 * DAY_MS).toISOString();
	const weekEndIso = new Date(dayStart.getTime() + 9 * DAY_MS).toISOString();
	const newSinceIso = new Date(now.getTime() - NEW_TASK_DAYS * DAY_MS).toISOString();

	const actorId = await measure('today.actor', () => ensureActorId(supabase, userId));
	const projects = await measure('today.projects', () =>
		fetchProjectSummaries(supabase, actorId, timing)
	);
	const activeProjects = projects.filter((project) => isActiveFacing(project.state_key));
	const projectById = new Map(activeProjects.map((project) => [project.id, project]));
	const projectIds = Array.from(projectById.keys());

	const eventsPromise = measure('today.calendar_items', async () => {
		const { data, error } = await supabase.rpc('list_calendar_items', {
			p_start: dayStartIso,
			p_end: dayEndIso,
			p_include_events: true,
			p_include_task_range: false,
			p_include_task_start: false,
			p_include_task_due: false,
			p_limit: EVENT_FETCH_LIMIT
		});
		if (error) {
			console.error('[TodayFeed] Failed to load calendar items:', error);
			return { data: [] as CalendarItem[], failed: true };
		}
		return { data: (data ?? []) as CalendarItem[], failed: false };
	});

	const tasksPromise = measure('today.tasks', async () => {
		if (projectIds.length === 0) return { data: [], failed: false };
		const { data, error } = await supabase
			.from('onto_tasks')
			.select(
				'id, project_id, title, description, state_key, due_at, start_at, priority, updated_at, created_at'
			)
			.in('project_id', projectIds)
			.is('deleted_at', null)
			.in('state_key', [...ACTIVE_TASK_STATES])
			.or(
				`and(due_at.gte.${dayStartIso},due_at.lt.${dayEndIso}),` +
					`and(start_at.gte.${dayStartIso},start_at.lt.${dayEndIso}),` +
					`due_at.eq.${date}T23:59:59.000Z,` +
					`start_at.eq.${date}T00:00:00.000Z,` +
					`and(due_at.gte.${weekStartIso},due_at.lt.${weekEndIso}),` +
					`created_at.gte.${newSinceIso},` +
					`state_key.eq.in_progress`
			)
			.order('due_at', { ascending: true, nullsFirst: false })
			.limit(TASK_FETCH_LIMIT);
		if (error) {
			console.error('[TodayFeed] Failed to load tasks:', error);
			return { data: [], failed: true };
		}
		return { data: data ?? [], failed: false };
	});

	const overduePromise = measure('today.overdue_count', async () => {
		if (projectIds.length === 0) return { data: 0, failed: false };
		const { count, error } = await supabase
			.from('onto_tasks')
			.select('id', { count: 'exact', head: true })
			.in('project_id', projectIds)
			.is('deleted_at', null)
			.in('state_key', [...ACTIVE_TASK_STATES])
			.lt('due_at', dayStartIso);
		if (error) {
			console.error('[TodayFeed] Failed to count overdue tasks:', error);
			return { data: 0, failed: true };
		}
		return { data: count ?? 0, failed: false };
	});

	const [eventsResult, tasksResult, overdueResult] = await Promise.all([
		eventsPromise,
		tasksPromise,
		overduePromise
	]);
	const degradedSections: TodayFeedDegradedSection[] = [];
	if (eventsResult.failed) degradedSections.push('events');
	if (tasksResult.failed) degradedSections.push('tasks');
	if (overdueResult.failed) degradedSections.push('overdue');

	const dayStartMs = dayStart.getTime();
	const dayEndMs = dayEnd.getTime();
	const nowMs = now.getTime();
	const placed = tasksResult.data
		.map((task) => {
			const project = projectById.get(task.project_id);
			if (!project) return null;
			const bucket = resolveTodayWeekBucket(
				task,
				date,
				dayStartMs,
				dayEndMs,
				timezone,
				nowMs
			);
			if (!bucket) return null;
			return { task, project, bucket };
		})
		.filter((entry) => entry !== null);

	// Agents (Claude Code, Codex, other connected callers) write as the person, so "you added
	// this" comes from the change log: a create with no external agent caller was the person,
	// by hand or through BuildOS chat.
	const newIds = placed.filter((entry) => entry.bucket === 'new').map((entry) => entry.task.id);
	const agentMadeIds = await measure('today.new_task_sources', async () => {
		if (newIds.length === 0) return new Set<string>();
		const { data, error } = await supabase
			.from('onto_project_logs')
			.select('entity_id, external_agent_caller_id')
			.eq('entity_type', 'task')
			.eq('action', 'created')
			.in('entity_id', newIds)
			.not('external_agent_caller_id', 'is', null)
			.limit(newIds.length);
		if (error) {
			console.error('[TodayFeed] Failed to read who added new tasks:', error);
			return new Set<string>();
		}
		return new Set((data ?? []).map((row) => row.entity_id));
	});

	const tasks: TodayTask[] = placed.map(({ task, project, bucket }) => ({
		...task,
		project_name: project.name,
		bucket,
		created_by_you: !agentMadeIds.has(task.id),
		due_in_days: dueInDays(task.due_at, date, timezone)
	}));

	// Carry a lightweight project list (already fetched above — no extra query) so the
	// client can render readiness-aware empty states: a first-run hero for zero-project
	// users, and a "what's waiting" next-steps list when there's no dated work today.
	const projectList: TodayProject[] = projects.map((project) => ({
		id: project.id,
		name: project.name,
		kind: project.kind,
		state_key: project.state_key,
		next_step_short: project.next_step_short ?? null,
		next_step_long: project.next_step_long ?? null,
		can_write: project.access_level
			? project.access_level !== 'read'
			: project.access_role !== 'viewer'
	}));

	return {
		date,
		timezone,
		dayStart: dayStartIso,
		dayEnd: dayEndIso,
		events: eventsResult.data,
		tasks,
		overdueCount: overdueResult.data,
		degradedSections,
		projectNames: Object.fromEntries(projects.map((project) => [project.id, project.name])),
		projects: projectList
	};
}
