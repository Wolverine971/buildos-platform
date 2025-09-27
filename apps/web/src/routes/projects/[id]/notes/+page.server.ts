// src/routes/projects/[id]/notes/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const userId = user.id;
	const projectId = params.id;

	// Define granular dependencies
	// depends(`projects:${projectId}`);
	// depends(`projects:${projectId}:notes`);
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

		// Load all notes for this project
		const { data: notes, error: notesError } = await supabase
			.from('notes')
			.select('id, title, content, category, tags, created_at, updated_at, project_id')
			.eq('project_id', project.id)
			.order('updated_at', { ascending: false });

		if (notesError) {
			console.error('Error loading notes:', notesError);
			throw error(500, 'Failed to load notes');
		}

		// Get notes statistics
		const totalNotes = notes?.length || 0;
		const notesByCategory =
			notes?.reduce((acc, note) => {
				const category = note.category || 'uncategorized';
				acc[category] = (acc[category] || 0) + 1;
				return acc;
			}, {}) || {};

		const allTags = [...new Set(notes?.flatMap((note) => note.tags || []) || [])];

		return {
			// Core data
			project,
			notes: notes || [],

			// Statistics
			stats: {
				totalNotes,
				notesByCategory,
				totalTags: allTags.length,
				allTags
			},

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
		console.error('Error in notes page server load:', err);
		throw error(500, 'Failed to load notes data');
	}
};
