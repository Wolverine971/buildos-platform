// apps/web/src/routes/api/notes/[id]/link/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ActivityLogger } from '$lib/utils/activityLogger';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

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
		const actorId = await ensureActorId(supabase, user.id);

		// Validate project_id
		if (!project_id) {
			return ApiResponse.badRequest('Project ID is required');
		}

		// Verify note ownership
		const { data: existingNote, error: fetchError } = await supabase
			.from('notes')
			.select('user_id, title, content, project_id')
			.eq('id', params.id)
			.single();

		if (fetchError) {
			return ApiResponse.notFound('Note');
		}

		if (existingNote.user_id !== user.id) {
			return ApiResponse.forbidden();
		}

		// Check if note is already linked
		if (existingNote.project_id === project_id) {
			return ApiResponse.badRequest('Note is already linked to this project');
		}

		// Verify project ownership
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, name, created_by')
			.eq('id', project_id)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not own this project');
		}

		// Update the note with the new project_id
		const { data: updatedNote, error: updateError } = await supabase
			.from('notes')
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
			'note_updated',
			{
				note_id: params.id,
				action: 'linked_to_project',
				project_id: project_id,
				project_name: project.name,
				previous_project_id: existingNote.project_id
			},
			request
		);

		// Also update any brain_dump_links that reference this note
		// to include the project reference
		const { error: linkUpdateError } = await supabase
			.from('brain_dump_links')
			.update({ project_id: project_id })
			.eq('note_id', params.id)
			.is('project_id', null);

		if (linkUpdateError) {
			console.error('Failed to update brain_dump_links:', linkUpdateError);
			// Non-critical error, continue
		}

		return ApiResponse.success({
			note: updatedNote,
			project: {
				id: project.id,
				name: project.name
			},
			message: `Note linked to ${project.name}`
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};

// Endpoint to unlink a note from a project
export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		// Verify note ownership
		const { data: existingNote, error: fetchError } = await supabase
			.from('notes')
			.select('user_id, project_id')
			.eq('id', params.id)
			.single();

		if (fetchError) {
			return ApiResponse.notFound('Note');
		}

		if (existingNote.user_id !== user.id) {
			return ApiResponse.forbidden();
		}

		if (!existingNote.project_id) {
			return ApiResponse.badRequest('Note is not linked to any project');
		}

		// Unlink the note from the project
		const { data: updatedNote, error: updateError } = await supabase
			.from('notes')
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
		await logger.logActivity(user.id, 'note_updated', {
			note_id: params.id,
			action: 'unlinked_from_project',
			previous_project_id: existingNote.project_id
		});

		// Also update any brain_dump_links that reference this note
		const { error: linkUpdateError } = await supabase
			.from('brain_dump_links')
			.update({ project_id: null })
			.eq('note_id', params.id);

		if (linkUpdateError) {
			console.error('Failed to update brain_dump_links:', linkUpdateError);
			// Non-critical error, continue
		}

		return ApiResponse.success({
			note: updatedNote,
			message: 'Note unlinked from project'
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
