// apps/web/src/routes/api/brief-templates/project/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const { data, error } = await supabase
			.from('project_brief_templates')
			.select('*')
			.order('created_at', { ascending: false });

		if (error) throw error;

		return ApiResponse.success({ templates: data });
	} catch (error) {
		console.error('Error fetching project brief templates:', error);
		return ApiResponse.internalError(error, 'Failed to fetch templates');
	}
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const templateData = await request.json();

		const { data, error } = await supabase
			.from('project_brief_templates')
			.insert(templateData)
			.select()
			.single();

		if (error) throw error;

		return ApiResponse.success({ template: data }, 'Template created');
	} catch (error) {
		console.error('Error creating project brief template:', error);
		return ApiResponse.internalError(error, 'Failed to create template');
	}
};
