// apps/web/src/routes/api/projects/[id]/generate-brief-template/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { ProjectBriefTemplateGeneratorService } from '$lib/services/projectBriefTemplateGenerator.service';

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const projectId = params.id;
		const userId = user.id;

		// Optional parameters from request body
		const body = await request.json().catch(() => ({}));
		const { templateName, description } = body;

		// Initialize services
		const templateGenerator = new ProjectBriefTemplateGeneratorService(supabase);

		// Generate the template
		const template = await templateGenerator.generateProjectBriefTemplate({
			projectId,
			userId,
			templateName,
			description
		});

		return ApiResponse.success({ template }, 'Template generated');
	} catch (error) {
		console.error('Error generating project brief template:', error);

		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		const statusCode = errorMessage.includes('not found') ? 404 : 500;

		return ApiResponse.error('Failed to generate template', statusCode, undefined, {
			details: errorMessage
		});
	}
};

// Also support regenerating an existing template
export const PUT: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const projectId = params.id;
		const userId = user.id;

		// First check if a template exists for this project
		const { data: existingTemplate } = await supabase
			.from('project_brief_templates')
			.select('id')
			.eq('project_id', projectId)
			.eq('user_id', userId)
			.single();

		if (!existingTemplate) {
			return ApiResponse.notFound('Template');
		}

		// Initialize services
		const templateGenerator = new ProjectBriefTemplateGeneratorService(supabase);

		// Regenerate the template
		const template = await templateGenerator.regenerateTemplate(existingTemplate.id, userId);

		return ApiResponse.success({ template, regenerated: true }, 'Template regenerated');
	} catch (error) {
		console.error('Error regenerating project brief template:', error);

		const errorMessage = error instanceof Error ? error.message : 'Unknown error';

		return ApiResponse.internalError(error, 'Failed to regenerate template');
	}
};

// Get the current template for a project
export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const projectId = params.id;
		const userId = user.id;

		const { data: template, error } = await supabase
			.from('project_brief_templates')
			.select('*')
			.eq('project_id', projectId)
			.eq('user_id', userId)
			.eq('in_use', true)
			.single();

		if (error || !template) {
			return ApiResponse.notFound('Active template');
		}

		return ApiResponse.success({ template });
	} catch (error) {
		console.error('Error fetching project brief template:', error);
		return ApiResponse.internalError(error, 'Failed to fetch template');
	}
};
