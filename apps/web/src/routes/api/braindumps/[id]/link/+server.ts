// apps/web/src/routes/api/braindumps/[id]/link/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ActivityLogger } from '$lib/utils/activityLogger';

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const { project_id } = await request.json();

		// Validate project_id
		if (!project_id) {
			return ApiResponse.badRequest('Project ID is required');
		}

		// Verify braindump and project ownership in parallel
		const [
			{ data: existingBraindump, error: fetchError },
			{ data: project, error: projectError }
		] = await Promise.all([
			supabase
				.from('brain_dumps')
				.select('user_id, title, content, project_id')
				.eq('id', params.id)
				.single(),
			supabase.from('projects').select('id, name, user_id').eq('id', project_id).single()
		]);

		if (fetchError) {
			return ApiResponse.notFound('Braindump');
		}

		if (existingBraindump.user_id !== user.id) {
			return ApiResponse.forbidden();
		}

		// Check if braindump is already linked
		if (existingBraindump.project_id === project_id) {
			return ApiResponse.badRequest('Braindump is already linked to this project');
		}

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		if (project.user_id !== user.id) {
			return ApiResponse.forbidden('You do not own this project');
		}

		// Update the braindump with the new project_id
		const { data: updatedBraindump, error: updateError } = await supabase
			.from('brain_dumps')
			.update({
				project_id: project_id,
				updated_at: new Date().toISOString()
			})
			.eq('id', params.id)
			.select()
			.single();

		if (updateError) {
			return ApiResponse.databaseError(updateError);
		}

		// Log the activity
		const logger = new ActivityLogger(supabase);
		await logger.logActivity(
			user.id,
			'brain_dump_updated',
			{
				brain_dump_id: params.id,
				action: 'linked_to_project',
				project_id: project_id,
				project_name: project.name,
				previous_project_id: existingBraindump.project_id
			},
			request
		);

		// Also update any brain_dump_links that are associated with this braindump
		// to include the project reference if they don't have one
		const { error: linkUpdateError } = await supabase
			.from('brain_dump_links')
			.update({ project_id: project_id })
			.eq('brain_dump_id', params.id)
			.is('project_id', null);

		if (linkUpdateError) {
			console.error('Failed to update brain_dump_links:', linkUpdateError);
			// Non-critical error, continue
		}

		return ApiResponse.success({
			braindump: updatedBraindump,
			project: {
				id: project.id,
				name: project.name
			},
			message: `Braindump linked to ${project.name}`
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};

// Endpoint to unlink a braindump from a project
export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		// Verify braindump ownership
		const { data: existingBraindump, error: fetchError } = await supabase
			.from('brain_dumps')
			.select('user_id, project_id')
			.eq('id', params.id)
			.single();

		if (fetchError) {
			return ApiResponse.notFound('Braindump');
		}

		if (existingBraindump.user_id !== user.id) {
			return ApiResponse.forbidden();
		}

		if (!existingBraindump.project_id) {
			return ApiResponse.badRequest('Braindump is not linked to any project');
		}

		// Unlink the braindump from the project
		const { data: updatedBraindump, error: updateError } = await supabase
			.from('brain_dumps')
			.update({
				project_id: null,
				updated_at: new Date().toISOString()
			})
			.eq('id', params.id)
			.select()
			.single();

		if (updateError) {
			return ApiResponse.databaseError(updateError);
		}

		// Log the activity
		const logger = new ActivityLogger(supabase);
		await logger.logActivity(user.id, 'brain_dump_updated', {
			brain_dump_id: params.id,
			action: 'unlinked_from_project',
			previous_project_id: existingBraindump.project_id
		});

		return ApiResponse.success({
			braindump: updatedBraindump,
			message: 'Braindump unlinked from project'
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
