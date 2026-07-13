// apps/web/src/lib/server/today-feed.service.ts
// Assembles the /today agenda: today's calendar events + today's tasks in the
// user's timezone, plus the attention counts the Today view surfaces as chips.
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { TypedSupabaseClient } from '@buildos/supabase-client';

import type { ServerTiming } from '$lib/server/server-timing';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import type { CalendarItem } from '$lib/types/calendar-items';
import type { TodayFeed, TodayProject, TodayTask, TodayTaskBucket } from '$lib/types/today';

const ACTIVE_TASK_STATES = ['todo', 'in_progress', 'blocked'] as const;
const EVENT_FETCH_LIMIT = 200;
const TASK_FETCH_LIMIT = 200;

export type { TodayFeed, TodayTask, TodayTaskBucket };

function isValidTimezone(timezone: string): boolean {
	try {
		Intl.DateTimeFormat(undefined, { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

async function resolveTimezone(
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

function resolveBucket(
	task: {
		due_at: string | null;
		start_at: string | null;
		state_key: string;
	},
	dayStartMs: number,
	dayEndMs: number
): TodayTaskBucket {
	const dueMs = task.due_at ? new Date(task.due_at).getTime() : null;
	if (dueMs !== null && dueMs >= dayStartMs && dueMs < dayEndMs) {
		return 'due_today';
	}
	const startMs = task.start_at ? new Date(task.start_at).getTime() : null;
	if (startMs !== null && startMs >= dayStartMs && startMs < dayEndMs) {
		return 'starts_today';
	}
	return 'in_progress';
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
	const dayStart = fromZonedTime(`${date}T00:00:00`, timezone);
	const nextDate = formatInTimeZone(
		new Date(dayStart.getTime() + 36 * 60 * 60 * 1000),
		timezone,
		'yyyy-MM-dd'
	);
	const dayEnd = fromZonedTime(`${nextDate}T00:00:00`, timezone);
	const dayStartIso = dayStart.toISOString();
	const dayEndIso = dayEnd.toISOString();

	const actorId = await measure('today.actor', () => ensureActorId(supabase, userId));
	const projects = (
		await measure('today.projects', () => fetchProjectSummaries(supabase, actorId, timing))
	).filter((project) => project.state_key !== 'paused');
	const projectById = new Map(projects.map((project) => [project.id, project]));
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
			return [] as CalendarItem[];
		}
		return (data ?? []) as CalendarItem[];
	});

	const tasksPromise = measure('today.tasks', async () => {
		if (projectIds.length === 0) return [];
		const { data, error } = await supabase
			.from('onto_tasks')
			.select(
				'id, project_id, title, description, state_key, due_at, start_at, priority, updated_at'
			)
			.in('project_id', projectIds)
			.is('deleted_at', null)
			.in('state_key', [...ACTIVE_TASK_STATES])
			.or(
				`and(due_at.gte.${dayStartIso},due_at.lt.${dayEndIso}),` +
					`and(start_at.gte.${dayStartIso},start_at.lt.${dayEndIso}),` +
					`state_key.eq.in_progress`
			)
			.order('due_at', { ascending: true, nullsFirst: false })
			.limit(TASK_FETCH_LIMIT);
		if (error) {
			console.error('[TodayFeed] Failed to load tasks:', error);
			return [];
		}
		return data ?? [];
	});

	const overduePromise = measure('today.overdue_count', async () => {
		if (projectIds.length === 0) return 0;
		const { count, error } = await supabase
			.from('onto_tasks')
			.select('id', { count: 'exact', head: true })
			.in('project_id', projectIds)
			.is('deleted_at', null)
			.in('state_key', [...ACTIVE_TASK_STATES])
			.lt('due_at', dayStartIso);
		if (error) {
			console.error('[TodayFeed] Failed to count overdue tasks:', error);
			return 0;
		}
		return count ?? 0;
	});

	const [events, taskRows, overdueCount] = await Promise.all([
		eventsPromise,
		tasksPromise,
		overduePromise
	]);

	const dayStartMs = dayStart.getTime();
	const dayEndMs = dayEnd.getTime();
	const tasks: TodayTask[] = taskRows
		.map((task): TodayTask | null => {
			const project = projectById.get(task.project_id);
			if (!project) return null;
			return {
				...task,
				project_name: project.name,
				bucket: resolveBucket(task, dayStartMs, dayEndMs)
			};
		})
		.filter((task): task is TodayTask => task !== null);

	// Carry a lightweight project list (already fetched above — no extra query) so the
	// client can render readiness-aware empty states: a first-run hero for zero-project
	// users, and a "what's waiting" next-steps list when there's no dated work today.
	const projectList: TodayProject[] = projects.map((project) => ({
		id: project.id,
		name: project.name,
		state_key: project.state_key,
		next_step_short: project.next_step_short ?? null,
		next_step_long: project.next_step_long ?? null
	}));

	return {
		date,
		timezone,
		dayStart: dayStartIso,
		dayEnd: dayEndIso,
		events,
		tasks,
		overdueCount,
		projectNames: Object.fromEntries(projects.map((project) => [project.id, project.name])),
		projects: projectList
	};
}
