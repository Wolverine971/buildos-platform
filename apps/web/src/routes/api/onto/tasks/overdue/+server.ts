// apps/web/src/routes/api/onto/tasks/overdue/+server.ts
import type { RequestHandler } from './$types';

import { fetchHydratedOverdueTasks } from '$lib/server/overdue-task-triage';
import type { LaneKey } from '$lib/types/overdue-triage';
import { ApiResponse } from '$lib/utils/api-response';
import { laneCountsFromTasks } from '$lib/utils/overdue-task-batches';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function toPositiveInt(raw: string | null, fallback: number): number {
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return parsed;
}

function parseLane(raw: string | null): LaneKey | null {
	if (!raw) return null;
	return raw === 'assigned_collab' || raw === 'assigned_other' || raw === 'other' ? raw : null;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	try {
		const limit = Math.min(
			toPositiveInt(url.searchParams.get('limit'), DEFAULT_LIMIT),
			MAX_LIMIT
		);
		const cursor = toPositiveInt(url.searchParams.get('cursor'), 0);
		const laneFilter = parseLane(url.searchParams.get('lane'));

		const tasks = await fetchHydratedOverdueTasks({
			supabase: locals.supabase,
			userId: session.user.id,
			timing: locals.serverTiming
		});

		const filtered = laneFilter ? tasks.filter((task) => task.lane === laneFilter) : tasks;
		const paged = filtered.slice(cursor, cursor + limit);
		const nextCursor = cursor + limit < filtered.length ? String(cursor + limit) : null;

		return ApiResponse.success({
			tasks: paged,
			total: filtered.length,
			nextCursor,
			laneCounts: laneCountsFromTasks(tasks)
		});
	} catch (error) {
		console.error('[Overdue Tasks API] Unexpected error:', error);
		return ApiResponse.internalError(error, 'Failed to load overdue tasks');
	}
};
