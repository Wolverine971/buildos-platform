// apps/web/src/routes/api/onto/projects/[id]/tasks/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { validatePaginationCustom } from '$lib/utils/api-helpers';
import { attachAssigneesToTasks, fetchTaskAssigneesMap } from '$lib/server/task-assignment.service';
import {
	attachLastChangedByActorToTasks,
	fetchTaskLastChangedByActorMap
} from '$lib/server/task-relevance.service';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import {
	PROJECT_ACTIVE_TASK_BUCKET_KEYS,
	type ProjectActiveTaskBucketKey
} from '$lib/types/project-full-data';

function parseBucket(value: string | null): ProjectActiveTaskBucketKey | null {
	return PROJECT_ACTIVE_TASK_BUCKET_KEYS.find((bucket) => bucket === value) ?? null;
}

function applyBucketFilter(query: any, bucket: ProjectActiveTaskBucketKey, nowIso: string) {
	switch (bucket) {
		case 'done':
			return query.eq('state_key', 'done');
		case 'overdue':
			return query.neq('state_key', 'done').lt('due_at', nowIso);
		case 'scheduled':
			return query
				.eq('state_key', 'todo')
				.or(`due_at.gte.${nowIso},and(due_at.is.null,start_at.gte.${nowIso})`);
		case 'in_progress':
			return query.eq('state_key', 'in_progress').or(`due_at.is.null,due_at.gte.${nowIso}`);
		case 'blocked':
			return query.eq('state_key', 'blocked').or(`due_at.is.null,due_at.gte.${nowIso}`);
		case 'backlog':
			return query
				.eq('state_key', 'todo')
				.is('due_at', null)
				.or(`start_at.is.null,start_at.lt.${nowIso}`);
	}
}

function applyBucketOrder(query: any, bucket: ProjectActiveTaskBucketKey) {
	query = query.order('priority', { ascending: true, nullsFirst: false });
	if (bucket === 'done') {
		query = query.order('completed_at', { ascending: false, nullsFirst: false });
	} else {
		query = query
			.order('due_at', { ascending: true, nullsFirst: false })
			.order('start_at', { ascending: true, nullsFirst: false });
	}
	return query.order('updated_at', { ascending: false }).order('id', { ascending: true });
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const bucket = parseBucket(url.searchParams.get('bucket'));
	if (!bucket) {
		return ApiResponse.badRequest('A valid task bucket is required');
	}
	const asOfParam = url.searchParams.get('asOf');
	const asOf = asOfParam ? new Date(asOfParam) : new Date();
	if (!Number.isFinite(asOf.getTime())) {
		return ApiResponse.badRequest('Invalid task pagination timestamp');
	}

	try {
		const { limit, offset } = validatePaginationCustom(
			{
				limit: url.searchParams.get('limit'),
				offset: url.searchParams.get('offset')
			},
			{ defaultLimit: 20, maxLimit: 100 }
		);
		const access = await requireProjectMemberAccess({
			locals,
			projectId: params.id,
			requiredAccess: 'read'
		});
		if (!access.ok) return access.response;

		const nowIso = asOf.toISOString();
		let query = (locals.supabase as any)
			.from('onto_tasks')
			.select('*', { count: 'exact' })
			.eq('project_id', access.projectId)
			.is('deleted_at', null);
		query = applyBucketFilter(query, bucket, nowIso);
		query = applyBucketOrder(query, bucket);

		const { data: rows, error, count } = await query.range(offset, offset + limit - 1);
		if (error) {
			console.error('[Project Task Board API] fetch failed:', error);
			return ApiResponse.error('Failed to fetch project tasks', 500);
		}

		const tasks = (rows ?? []) as Array<{ id: string } & Record<string, unknown>>;
		const taskIds = tasks.map((task) => task.id);
		const [assigneeMap, lastChangedByActorMap] = await Promise.all([
			fetchTaskAssigneesMap({ supabase: locals.supabase, taskIds }),
			fetchTaskLastChangedByActorMap({
				supabase: locals.supabase,
				projectId: access.projectId,
				taskIds
			})
		]);
		let enrichedTasks = attachAssigneesToTasks(tasks, assigneeMap);
		enrichedTasks = attachLastChangedByActorToTasks(enrichedTasks, lastChangedByActorMap);

		const total = count ?? 0;
		const nextOffset = offset + enrichedTasks.length;
		const hasMore = nextOffset < total;
		return ApiResponse.success({
			bucket,
			tasks: enrichedTasks,
			total,
			hasMore,
			offset,
			nextOffset: hasMore ? nextOffset : null
		});
	} catch (error) {
		console.error('[Project Task Board API] unexpected error:', error);
		return ApiResponse.internalError(error, 'Failed to load project tasks');
	}
};
