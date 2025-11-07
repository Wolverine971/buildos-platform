// apps/web/src/routes/api/brief-templates/project/[id]/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const { data, error } = await supabase
			.from('project_brief_templates')
			.select('*')
			.eq('id', params.id)
			.single();

		if (error) throw error;

		return ApiResponse.success({ template: data });
	} catch (error) {
		console.error('Error fetching project brief template:', error);
		return ApiResponse.notFound('Template');
	}
};

export const PUT: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const updates = await request.json();

		const { data, error } = await supabase
			.from('project_brief_templates')
			.update({ ...updates, updated_at: new Date().toISOString() })
			.eq('id', params.id)
			.select()
			.single();

		if (error) throw error;

		return ApiResponse.success({ template: data }, 'Template updated');
	} catch (error) {
		console.error('Error updating project brief template:', error);
		return ApiResponse.internalError(error, 'Failed to update template');
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const { error } = await supabase
			.from('project_brief_templates')
			.delete()
			.eq('id', params.id);

		if (error) throw error;

		return ApiResponse.success({ success: true }, 'Template deleted');
	} catch (error) {
		console.error('Error deleting project brief template:', error);
		return ApiResponse.internalError(error, 'Failed to delete template');
	}
};
