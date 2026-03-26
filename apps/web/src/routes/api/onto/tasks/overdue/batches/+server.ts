// apps/web/src/routes/api/onto/tasks/overdue/batches/+server.ts
import type { RequestHandler } from './$types';

import { fetchHydratedOverdueTasks } from '$lib/server/overdue-task-triage';
import type { OverdueProjectBatch } from '$lib/types/overdue-triage';
import { ApiResponse } from '$lib/utils/api-response';
import { buildOverdueProjectBatches } from '$lib/utils/overdue-task-batches';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toPositiveInt(raw: string | null, fallback: number): number {
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return parsed;
}

function parseBoolean(raw: string | null, fallback: boolean): boolean {
	if (raw === null) return fallback;
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	return fallback;
}

function prioritizeProject(
	batches: OverdueProjectBatch[],
	projectId: string | null
): OverdueProjectBatch[] {
	if (!projectId) return batches;
	const index = batches.findIndex((batch) => batch.project_id === projectId);
	if (index <= 0) return batches;

	const next = [...batches];
	const [target] = next.splice(index, 1);
	if (!target) return batches;
	next.unshift(target);
	return next;
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
		const includeTasks = parseBoolean(url.searchParams.get('include_tasks'), true);
		const prioritizedProjectId = url.searchParams.get('project_id');

		const tasks = await fetchHydratedOverdueTasks({
			supabase: locals.supabase,
			userId: session.user.id,
			timing: locals.serverTiming
		});

		const allBatches = prioritizeProject(
			buildOverdueProjectBatches(tasks),
			prioritizedProjectId
		);
		const paged = allBatches.slice(cursor, cursor + limit);
		const nextCursor = cursor + limit < allBatches.length ? String(cursor + limit) : null;

		return ApiResponse.success({
			batches: paged.map((batch) =>
				includeTasks
					? batch
					: {
							...batch,
							tasks: undefined
						}
			),
			totalProjects: allBatches.length,
			totalTasks: tasks.length,
			nextCursor
		});
	} catch (error) {
		console.error('[Overdue Task Batches API] Unexpected error:', error);
		return ApiResponse.internalError(error, 'Failed to load overdue project batches');
	}
};
