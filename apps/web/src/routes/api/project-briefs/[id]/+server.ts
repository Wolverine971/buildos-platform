// apps/web/src/routes/api/project-briefs/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { mapOntologyProjectBriefRow } from '$lib/services/dailyBrief/ontology-mappers';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const { data, error } = await supabase
			.from('ontology_project_briefs')
			.select(
				`
				id,
				daily_brief_id,
				project_id,
				brief_content,
				metadata,
				created_at,
				updated_at,
				daily_brief:ontology_daily_briefs!inner(brief_date, user_id, generation_status),
				project:onto_projects(id, name, description)
			`
			)
			.eq('id', params.id)
			.eq('daily_brief.user_id', user.id)
			.single();

		if (error) {
			return ApiResponse.databaseError(error);
		}

		if (!data) {
			return ApiResponse.notFound('Brief');
		}

		const mapped = mapOntologyProjectBriefRow({
			row: data as any,
			userId: user.id,
			briefDate: (data as any).daily_brief?.brief_date,
			project: (data as any).project,
			generationStatus: (data as any).daily_brief?.generation_status
		});

		return ApiResponse.success({
			brief: {
				...mapped,
				project_name: mapped.projects?.name
			}
		});
	} catch (error) {
		console.error('Error fetching project brief:', error);
		return ApiResponse.internalError(error, 'Failed to fetch project brief');
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const { data: briefRow } = await supabase
			.from('ontology_project_briefs')
			.select('id, daily_brief:ontology_daily_briefs!inner(user_id)')
			.eq('id', params.id)
			.eq('daily_brief.user_id', user.id)
			.maybeSingle();

		if (!briefRow?.id) {
			return ApiResponse.notFound('Brief');
		}

		const { error } = await supabase
			.from('ontology_project_briefs')
			.delete()
			.eq('id', params.id);

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ message: 'Brief deleted successfully' });
	} catch (error) {
		console.error('Error deleting project brief:', error);
		return ApiResponse.internalError(error, 'Failed to delete brief');
	}
};
