// apps/web/src/routes/api/onto/projects/[id]/tasks/options/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { validatePaginationCustom } from '$lib/utils/api-helpers';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	try {
		const { limit, offset } = validatePaginationCustom(
			{
				limit: url.searchParams.get('limit'),
				offset: url.searchParams.get('offset')
			},
			{ defaultLimit: 200, maxLimit: 200 }
		);
		const access = await requireProjectMemberAccess({
			locals,
			projectId: params.id,
			requiredAccess: 'read'
		});
		if (!access.ok) return access.response;

		const { data, error, count } = await locals.supabase
			.from('onto_tasks')
			.select('id, title', { count: 'exact' })
			.eq('project_id', access.projectId)
			.is('deleted_at', null)
			.order('title', { ascending: true })
			.order('id', { ascending: true })
			.range(offset, offset + limit - 1);

		if (error) {
			console.error('[Project Task Options API] fetch failed:', error);
			return ApiResponse.error('Failed to fetch project task options', 500);
		}

		const tasks = data ?? [];
		const total = count ?? 0;
		const nextOffset = offset + tasks.length;
		const hasMore = nextOffset < total;
		return ApiResponse.success({
			tasks,
			total,
			hasMore,
			nextOffset: hasMore ? nextOffset : null
		});
	} catch (error) {
		console.error('[Project Task Options API] unexpected error:', error);
		return ApiResponse.internalError(error, 'Failed to load project task options');
	}
};
