// apps/web/src/lib/server/projects/desktop-signals.ts
//
// The numbers behind the Projects desktop tiles, read with the viewer's own
// client (RLS decides what they can see). Two lean reads run side by side:
// open tasks plus tasks finished recently, and the last PARKED_AFTER_DAYS of
// the project change log, newest first. The log is the honest record of
// activity: it covers edits from the app, chat and agents, and skips bulk
// system writes that bump `updated_at` without anyone working.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import {
	PARKED_AFTER_DAYS,
	RECENT_DAYS,
	emptySignals,
	taskBucket,
	type ProjectSignals
} from '$lib/components/projects/desktop/desktop-signals';

const DAY_MS = 86_400_000;
const PAGE_SIZE = 1000;
/** A cap per read; beyond it counts are approximate rather than slow. */
const MAX_PAGES = 5;
/** Keeps `project_id=in.(…)` well inside URL limits. */
const IDS_PER_REQUEST = 120;

type Client = SupabaseClient<Database>;
type Page<T> = { data: T[] | null; error: { message: string } | null };

function chunks<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let start = 0; start < items.length; start += size)
		out.push(items.slice(start, start + size));
	return out;
}

async function readPages<T>(
	read: (from: number, to: number) => PromiseLike<Page<T>>,
	label: string,
	stop?: () => boolean
): Promise<T[]> {
	const rows: T[] = [];
	for (let page = 0; page < MAX_PAGES; page++) {
		const from = page * PAGE_SIZE;
		const { data, error } = await read(from, from + PAGE_SIZE - 1);
		if (error) throw new Error(`${label}: ${error.message}`);
		rows.push(...(data ?? []));
		if (!data || data.length < PAGE_SIZE || stop?.()) return rows;
	}
	console.warn(`[DesktopSignals] ${label} hit the ${MAX_PAGES}-page cap; counts are approximate`);
	return rows;
}

type TaskRow = {
	project_id: string;
	state_key: string | null;
	start_at: string | null;
	due_at: string | null;
	completed_at: string | null;
};

export async function loadProjectSignals(
	client: Client,
	projectIds: readonly string[],
	now = Date.now()
): Promise<Map<string, ProjectSignals>> {
	const signals = new Map(projectIds.map((id) => [id, emptySignals()]));
	if (projectIds.length === 0) return signals;
	const recentSince = new Date(now - RECENT_DAYS * DAY_MS).toISOString();
	const logSince = new Date(now - PARKED_AFTER_DAYS * DAY_MS).toISOString();

	const readTasks = (ids: string[]) =>
		readPages<TaskRow>(
			(from, to) =>
				client
					.from('onto_tasks')
					.select('project_id, state_key, start_at, due_at, completed_at')
					.in('project_id', ids)
					.is('deleted_at', null)
					.is('archived_at', null)
					.or(`state_key.neq.done,completed_at.gte."${recentSince}"`)
					.order('id')
					.range(from, to) as unknown as PromiseLike<Page<TaskRow>>,
			'tasks'
		);

	// Newest first, so the first row seen per project is its last change; stop
	// paging once every project in the chunk has one.
	const readTouches = (ids: string[]) => {
		const seen = new Set<string>();
		return readPages<{ project_id: string; created_at: string }>(
			async (from, to) => {
				const page = (await client
					.from('onto_project_logs')
					.select('project_id, created_at')
					.in('project_id', ids)
					.gte('created_at', logSince)
					.order('created_at', { ascending: false })
					.range(from, to)) as unknown as Page<{
					project_id: string;
					created_at: string;
				}>;
				for (const row of page.data ?? []) seen.add(row.project_id);
				return page;
			},
			'project logs',
			() => seen.size >= ids.length
		);
	};

	const idChunks = chunks(projectIds, IDS_PER_REQUEST);
	const [taskRows, touchRows] = await Promise.all([
		Promise.all(idChunks.map(readTasks)).then((parts) => parts.flat()),
		Promise.all(idChunks.map(readTouches)).then((parts) => parts.flat())
	]);

	for (const task of taskRows) {
		const entry = signals.get(task.project_id);
		if (!entry) continue;
		const bucket = taskBucket(task, now);
		if (bucket === 'done') entry.done_recent += 1;
		else entry[bucket] += 1;
	}
	for (const touch of touchRows) {
		const entry = signals.get(touch.project_id);
		if (entry && (!entry.last_touch_at || touch.created_at > entry.last_touch_at))
			entry.last_touch_at = touch.created_at;
	}
	return signals;
}
