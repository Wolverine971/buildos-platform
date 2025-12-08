// apps/web/src/routes/projects-old/[id]/notes/[noteId]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({
	params,
	locals: { supabase, safeGetSession },
	depends
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const userId = user.id;
	const projectId = params.id;
	const noteId = params.noteId;

	// Check if the ID parameter is actually a slug (backwards compatibility)
	// UUIDs have a specific format, slugs typically don't contain only hex characters and dashes in UUID pattern
	const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		projectId
	);

	if (!isUuid) {
		// Try to find the project by slug and redirect to the correct URL
		const { data: projectBySlug, error: slugError } = await supabase
			.from('projects')
			.select('id')
			.eq('slug', projectId)
			.eq('user_id', userId)
			.single();

		if (!slugError && projectBySlug) {
			// Redirect to the correct ID-based URL
			throw redirect(301, `/projects/${projectBySlug.id}/notes/${noteId}`);
		}
		// If we can't find by slug, continue and let it fail naturally with 404
	}

	// Define granular dependencies
	// depends(`projects:${projectId}`);
	// depends(`projects:${projectId}:notes:${noteId}`);

	depends(`note:${noteId}`);
	// depends(`projects:${projectId}:context`);

	try {
		// Load project data
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select(
				'id, name, description, status, tags, slug, start_date, end_date, created_at, updated_at, user_id, context, executive_summary'
			)
			.eq('id', projectId)
			.eq('user_id', userId)
			.single();

		if (projectError || !project) {
			throw error(404, 'Project not found');
		}

		// Load the specific note
		const { data: note, error: noteError } = await supabase
			.from('notes')
			.select('id, title, content, category, tags, created_at, updated_at, project_id')
			.eq('id', noteId)
			.eq('project_id', project.id)
			.single();

		if (noteError || !note) {
			throw error(404, 'Note not found');
		}

		// Load other notes in the project for context (optional)
		const { data: otherNotes, error: otherNotesError } = await supabase
			.from('notes')
			.select('id, title, category, tags, created_at, updated_at')
			.eq('project_id', project.id)
			.neq('id', noteId)
			.order('updated_at', { ascending: false })
			.limit(10);

		return {
			// Core data
			project,
			note,
			otherNotes: otherNotes || [],

			// User data
			user: {
				id: userId
			},

			// Metadata
			__meta: {
				loadedAt: new Date().toISOString()
			}
		};
	} catch (err) {
		console.error('Error in note page server load:', err);
		throw error(500, 'Failed to load note data');
	}
};
