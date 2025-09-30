// apps/web/src/routes/api/projects/[id]/generate-brief-template/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ProjectBriefTemplateGeneratorService } from '$lib/services/projectBriefTemplateGenerator.service';

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
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

		return json({
			success: true,
			template
		});
	} catch (error) {
		console.error('Error generating project brief template:', error);

		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		const statusCode = errorMessage.includes('not found') ? 404 : 500;

		return json(
			{
				error: 'Failed to generate template',
				details: errorMessage
			},
			{ status: statusCode }
		);
	}
};

// Also support regenerating an existing template
export const PUT: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
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
			return json(
				{
					error: 'No template found for this project'
				},
				{ status: 404 }
			);
		}

		// Initialize services
		const templateGenerator = new ProjectBriefTemplateGeneratorService(supabase);

		// Regenerate the template
		const template = await templateGenerator.regenerateTemplate(existingTemplate.id, userId);

		return json({
			success: true,
			template,
			regenerated: true
		});
	} catch (error) {
		console.error('Error regenerating project brief template:', error);

		const errorMessage = error instanceof Error ? error.message : 'Unknown error';

		return json(
			{
				error: 'Failed to regenerate template',
				details: errorMessage
			},
			{ status: 500 }
		);
	}
};

// Get the current template for a project
export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
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
			return json(
				{
					error: 'No active template found for this project'
				},
				{ status: 404 }
			);
		}

		return json({ template });
	} catch (error) {
		console.error('Error fetching project brief template:', error);
		return json(
			{
				error: 'Failed to fetch template'
			},
			{ status: 500 }
		);
	}
};
