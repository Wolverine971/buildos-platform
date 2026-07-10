// apps/web/src/routes/api/onto/projects/[id]/logs/+server.ts
/**
 * GET /api/onto/projects/[id]/logs
 * Fetch paginated activity logs for a project
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../shared/error-logging';
import { validatePaginationCustom } from '$lib/utils/api-helpers';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { enrichLogsForDisplay } from '$lib/server/project-logs-enrich';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id: projectId } = params;
		if (!projectId) {
			return ApiResponse.badRequest('Project ID required');
		}
		if (!isValidUUID(projectId)) {
			return ApiResponse.badRequest('Invalid project ID');
		}

		const { limit, offset } = validatePaginationCustom(
			{
				limit: url.searchParams.get('limit'),
				offset: url.searchParams.get('offset')
			},
			{ defaultLimit: 10, maxLimit: 50 }
		);

		const access = await requireProjectMemberAccess({
			locals,
			projectId,
			requiredAccess: 'read',
			user
		});
		if (!access.ok) return access.response;

		const supabase = locals.supabase;

		// Fetch logs with pagination
		const {
			data: logs,
			error: logsError,
			count
		} = await supabase
			.from('onto_project_logs')
			.select('*', { count: 'exact' })
			.eq('project_id', projectId)
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1);

		if (logsError) {
			console.error('[Project Logs API] Failed to fetch logs:', logsError);
			await logOntologyApiError({
				supabase,
				error: logsError,
				endpoint: `/api/onto/projects/${projectId}/logs`,
				method: 'GET',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_logs_fetch',
				tableName: 'onto_project_logs'
			});
			return ApiResponse.error('Failed to fetch activity logs', 500);
		}

		const total = count ?? 0;
		const hasMore = offset + (logs?.length ?? 0) < total;

		// Enrich logs with entity names by fetching them in batch
		const enrichedLogs = await enrichLogsForDisplay(supabase, logs || []);

		return ApiResponse.success({
			logs: enrichedLogs,
			total,
			hasMore
		});
	} catch (err) {
		console.error('[Project Logs API] Unexpected error:', err);
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/projects/${params.id ?? ''}/logs`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'project_logs_fetch'
		});
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
