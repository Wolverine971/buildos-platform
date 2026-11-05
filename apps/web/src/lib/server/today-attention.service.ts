// apps/web/src/lib/server/today-attention.service.ts
// The Today page's "who's waiting" lists and the suggestions the daily brief keeps repeating.
// Loaded beside the agenda feed; either half failing leaves that list empty, never the page.
import type { TypedSupabaseClient } from '@buildos/supabase-client';

import { isActiveFacing } from '$lib/config/project-states';
import type { ServerTiming } from '$lib/server/server-timing';
import type {
	TodayAttention,
	TodayFeed,
	TodayRepeatedSuggestion,
	TodayWaitingItem
} from '$lib/types/today';

/** A waiting row the morning job hasn't seen for this long is treated as gone. */
const WAITING_FRESH_DAYS = 3;
const WAITING_LIMIT = 24;
/** "Suggested every morning" starts at this many briefs in a row. */
export const REPEAT_MIN_DAYS = 5;
const BRIEF_HISTORY = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_TASK_STATES = ['todo', 'in_progress', 'blocked'] as const;

function previousDate(date: string): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/**
 * For each action in the newest brief, how many briefs in a row (ending there) listed it.
 * A missing day ends the run. The newest brief must be from today or yesterday.
 */
export function repeatedActionStreaks(
	briefs: { brief_date: string; priority_actions: string[] | null }[],
	today: string
): Map<string, number> {
	const byDate = new Map(briefs.map((brief) => [brief.brief_date, brief.priority_actions ?? []]));
	const latest = byDate.has(today) ? today : previousDate(today);
	const streaks = new Map<string, number>();
	const latestActions = byDate.get(latest);
	if (!latestActions) return streaks;
	for (const action of new Set(latestActions)) {
		let days = 0;
		let cursor = latest;
		while (byDate.get(cursor)?.includes(action)) {
			days += 1;
			cursor = previousDate(cursor);
		}
		streaks.set(action, days);
	}
	return streaks;
}

async function loadWaiting(supabase: TypedSupabaseClient): Promise<TodayWaitingItem[]> {
	const freshSince = new Date(Date.now() - WAITING_FRESH_DAYS * DAY_MS).toISOString();
	const { data, error } = await supabase
		.from('today_waiting_items')
		.select(
			'id, direction, who, who_kind, what, project_id, task_id, since, project:onto_projects(name)'
		)
		.eq('status', 'open')
		.gte('last_seen_at', freshSince)
		.order('since', { ascending: true, nullsFirst: false })
		.limit(WAITING_LIMIT);
	if (error) {
		console.error('[TodayAttention] Failed to load waiting items:', error);
		return [];
	}
	return (data ?? []).map((row) => {
		const project = Array.isArray(row.project) ? row.project[0] : row.project;
		return {
			id: row.id,
			direction: row.direction === 'on_them' ? 'on_them' : 'on_you',
			who: row.who,
			who_kind:
				row.who_kind === 'agent' || row.who_kind === 'organization'
					? row.who_kind
					: 'person',
			what: row.what,
			project_id: row.project_id,
			project_name: project?.name ?? null,
			task_id: row.task_id,
			since: row.since
		};
	});
}

async function loadRepeated(
	supabase: TypedSupabaseClient,
	userId: string,
	date: string,
	projectNames: Record<string, string>
): Promise<TodayRepeatedSuggestion[]> {
	const { data: briefs, error } = await supabase
		.from('ontology_daily_briefs')
		.select('brief_date, priority_actions')
		.eq('user_id', userId)
		.eq('generation_status', 'completed')
		.order('brief_date', { ascending: false })
		.limit(BRIEF_HISTORY);
	if (error) {
		console.error('[TodayAttention] Failed to load brief history:', error);
		return [];
	}
	const streaks = repeatedActionStreaks(briefs ?? [], date);
	const repeatedTitles = [...streaks].filter(([, days]) => days >= REPEAT_MIN_DAYS);
	const projectIds = Object.keys(projectNames);
	if (repeatedTitles.length === 0 || projectIds.length === 0) return [];

	// "Start here" lists tasks by title; match them back to the person's open tasks.
	const [tasksResult, keptResult] = await Promise.all([
		supabase
			.from('onto_tasks')
			.select('id, project_id, title, due_at, updated_at')
			.in('project_id', projectIds)
			.in(
				'title',
				repeatedTitles.map(([title]) => title)
			)
			.is('deleted_at', null)
			.in('state_key', [...ACTIVE_TASK_STATES])
			.limit(40),
		supabase.from('today_kept_suggestions').select('task_id').gte('kept_until', date)
	]);
	if (tasksResult.error) {
		console.error('[TodayAttention] Failed to match repeated suggestions:', tasksResult.error);
		return [];
	}
	const kept = new Set((keptResult.data ?? []).map((row) => row.task_id));
	const daysByTitle = new Map(repeatedTitles);
	const seenTitles = new Set<string>();
	const out: TodayRepeatedSuggestion[] = [];
	// Newest edit first, so a duplicate title resolves to the task the person last touched.
	const tasks = [...(tasksResult.data ?? [])].sort((a, b) =>
		b.updated_at.localeCompare(a.updated_at)
	);
	for (const task of tasks) {
		if (kept.has(task.id) || seenTitles.has(task.title)) continue;
		seenTitles.add(task.title);
		out.push({
			task_id: task.id,
			project_id: task.project_id,
			project_name: projectNames[task.project_id] ?? 'Project',
			title: task.title,
			days: daysByTitle.get(task.title) ?? REPEAT_MIN_DAYS,
			due_at: task.due_at
		});
	}
	return out.sort((a, b) => b.days - a.days);
}

/** Active projects by id, for matching suggestions to tasks the person can still act on. */
export function activeProjectNames(feed: TodayFeed): Record<string, string> {
	return Object.fromEntries(
		feed.projects
			.filter((project) => isActiveFacing(project.state_key))
			.map((project) => [project.id, project.name])
	);
}

export async function getTodayAttention({
	supabase,
	userId,
	date,
	projectNames,
	timing
}: {
	supabase: TypedSupabaseClient;
	userId: string;
	/** Today, YYYY-MM-DD in the person's timezone. */
	date: string;
	/** The person's active project names by id (from the Today feed). */
	projectNames: Record<string, string>;
	timing?: ServerTiming;
}): Promise<TodayAttention> {
	const measure = <T>(name: string, fn: () => Promise<T>) =>
		timing ? timing.measure(name, fn) : fn();
	const [waiting, repeated] = await Promise.all([
		measure('today.waiting', () => loadWaiting(supabase)).catch((error) => {
			console.error('[TodayAttention] Waiting items failed:', error);
			return [];
		}),
		measure('today.repeated', () => loadRepeated(supabase, userId, date, projectNames)).catch(
			(error) => {
				console.error('[TodayAttention] Repeated suggestions failed:', error);
				return [];
			}
		)
	]);
	return { waiting, repeated };
}
