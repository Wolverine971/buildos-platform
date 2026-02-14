// apps/web/src/routes/api/onto/projects/[id]/briefs/+server.ts
/**
 * GET /api/onto/projects/[id]/briefs
 * Fetch paginated daily briefs for a project from ontology_project_briefs
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { validatePaginationCustom, verifyProjectAccess } from '$lib/utils/api-helpers';
import { logOntologyApiError } from '../../../shared/error-logging';

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

		// Validate pagination params (security fix: 2026-01-03)
		const { limit, offset } = validatePaginationCustom(
			{
				limit: url.searchParams.get('limit'),
				offset: url.searchParams.get('offset')
			},
			{ defaultLimit: 5, maxLimit: 20 }
		);

		const supabase = locals.supabase;

		// Verify project access using shared helper (refactor: 2026-01-03)
		const authResult = await verifyProjectAccess(supabase, projectId, user.id);
		if (!authResult.authorized) {
			return authResult.error!;
		}

		const { data: isMember, error: memberError } = await supabase.rpc(
			'current_actor_is_project_member',
			{
				p_project_id: projectId
			}
		);

		if (memberError) {
			console.error('[Project Briefs API] Failed to verify membership:', memberError);
			await logOntologyApiError({
				supabase,
				error: memberError,
				endpoint: `/api/onto/projects/${projectId}/briefs`,
				method: 'GET',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_briefs_access'
			});
			return ApiResponse.internalError(memberError, 'Failed to verify project access');
		}

		if (!isMember) {
			return ApiResponse.forbidden('Access denied');
		}

		// Fetch briefs from ontology_project_briefs with join to daily brief for date
		const {
			data: briefs,
			error: briefsError,
			count
		} = await supabase
			.from('ontology_project_briefs')
			.select(
				`
				id,
				brief_content,
				metadata,
				created_at,
				daily_brief:ontology_daily_briefs!inner(
					id,
					user_id,
					brief_date,
					executive_summary,
					priority_actions
				)
			`,
				{ count: 'exact' }
			)
			.eq('project_id', projectId)
			.eq('daily_brief.user_id', user.id)
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1);

		if (briefsError) {
			console.error('[Project Briefs API] Failed to fetch briefs:', briefsError);
			await logOntologyApiError({
				supabase,
				error: briefsError,
				endpoint: `/api/onto/projects/${projectId}/briefs`,
				method: 'GET',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_briefs_fetch',
				tableName: 'ontology_project_briefs'
			});
			return ApiResponse.error('Failed to fetch daily briefs', 500);
		}

		const total = count ?? 0;
		const hasMore = offset + (briefs?.length ?? 0) < total;

		// Transform the data for easier frontend consumption
		const transformedBriefs = (briefs || []).map((brief: any) => ({
			id: brief.id,
			brief_content: brief.brief_content,
			metadata: brief.metadata,
			created_at: brief.created_at,
			brief_date: brief.daily_brief?.brief_date,
			daily_brief_id: brief.daily_brief?.id,
			executive_summary: brief.daily_brief?.executive_summary,
			priority_actions: brief.daily_brief?.priority_actions
		}));

		return ApiResponse.success({
			briefs: transformedBriefs,
			total,
			hasMore
		});
	} catch (err) {
		console.error('[Project Briefs API] Unexpected error:', err);
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/projects/${params.id ?? ''}/briefs`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'project_briefs_fetch'
		});
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
