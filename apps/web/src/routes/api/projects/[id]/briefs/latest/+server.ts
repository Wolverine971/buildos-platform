// apps/web/src/routes/api/projects/[id]/briefs/latest/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import { verifyProjectAccess } from '$lib/utils/api-helpers';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const access = await verifyProjectAccess(supabase, params.id, user.id);
		if (!access.authorized) {
			return access.error || ApiResponse.forbidden('Forbidden');
		}

		const { data: brief, error: briefError } = await supabase
			.from('ontology_project_briefs')
			.select(
				`
				id,
				project_id,
				brief_content,
				metadata,
				created_at,
				updated_at,
				daily_brief:ontology_daily_briefs!inner(user_id, brief_date, generation_status, generation_error)
			`
			)
			.eq('project_id', params.id)
			.eq('daily_brief.user_id', user.id)
			.order('brief_date', { ascending: false, foreignTable: 'daily_brief' })
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (briefError) {
			console.error('Error fetching latest project brief:', briefError);
			return ApiResponse.internalError(briefError, briefError.message);
		}

		if (!brief) {
			return ApiResponse.success({ brief: null });
		}

		return ApiResponse.success({
			brief: {
				id: (brief as any).id,
				project_id: (brief as any).project_id,
				brief_content: (brief as any).brief_content,
				brief_date: (brief as any).daily_brief?.brief_date,
				generation_status: (brief as any).daily_brief?.generation_status,
				generation_error: (brief as any).daily_brief?.generation_error,
				metadata: (brief as any).metadata,
				created_at: (brief as any).created_at,
				updated_at: (brief as any).updated_at
			}
		});
	} catch (err) {
		console.error('Error in GET /api/projects/[id]/briefs/latest:', err);
		return ApiResponse.internalError(err, 'Internal server error');
	}
};
