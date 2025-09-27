// src/routes/api/projects/[id]/synthesize/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ProjectSynthesisService } from '$lib/services/projectSynthesis.service';
import { ActivityLogger } from '$lib/utils/activityLogger';

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
		const { regenerate = false, includeDeleted = false, options } = await request.json();

		// Verify project ownership
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id, user_id')
			.eq('id', params.id)
			.single();

		if (projectError || !project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		if (project.user_id !== user.id) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		// Initialize services
		const activityLogger = new ActivityLogger(supabase);
		const synthesisService = new ProjectSynthesisService(supabase, activityLogger);

		// Generate synthesis with options
		const synthesisResult = await synthesisService.synthesizeProject(params.id, user.id, {
			regenerate,
			includeDeleted,
			synthesisOptions: options
		});

		// Return in a format that matches what the frontend expects
		return json({
			synthesis: {
				id: synthesisResult.id,
				synthesis_content: {
					operations: synthesisResult.operations,
					insights: synthesisResult.insights,
					comparison: synthesisResult.comparison,
					summary: synthesisResult.summary
				},
				created_at: new Date().toISOString()
			}
		});
	} catch (error) {
		console.error('Error in project synthesis:', error);
		return json(
			{
				error: 'Failed to synthesize project',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Verify project ownership
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id, user_id')
			.eq('id', params.id)
			.single();

		if (projectError || !project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		if (project.user_id !== user.id) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		// Get existing synthesis - use limit(1) to always get an array
		const { data: syntheses, error: synthesisError } = await supabase
			.from('project_synthesis')
			.select('*')
			.eq('project_id', params.id)
			.eq('user_id', user.id)
			.in('status', ['completed', 'success', 'draft'])
			.order('created_at', { ascending: false })
			.limit(1);

		if (synthesisError) {
			console.error('Error fetching synthesis:', synthesisError);
			return json({ error: 'Failed to fetch synthesis' }, { status: 500 });
		}

		// Return the first synthesis if exists, otherwise null
		return json({
			synthesis: syntheses && syntheses.length > 0 ? syntheses[0] : null
		});
	} catch (error) {
		console.error('Error fetching project synthesis:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// Update existing synthesis (save edited operations)
export const PUT: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { synthesis_id, synthesis_content, status = 'draft' } = await request.json();

		// If no synthesis_id provided, get the most recent one
		let targetSynthesisId = synthesis_id;

		if (!targetSynthesisId) {
			// Get the most recent synthesis for backward compatibility
			const { data: recentSynthesis, error: fetchError } = await supabase
				.from('project_synthesis')
				.select('id')
				.eq('project_id', params.id)
				.eq('user_id', user.id)
				.order('created_at', { ascending: false })
				.limit(1)
				.single();

			if (fetchError || !recentSynthesis) {
				return json({ error: 'No synthesis found to update' }, { status: 404 });
			}

			targetSynthesisId = recentSynthesis.id;
		}

		// Verify project ownership and synthesis exists
		const { data: synthesis, error: synthError } = await supabase
			.from('project_synthesis')
			.select('id, project_id, user_id')
			.eq('id', targetSynthesisId)
			.eq('project_id', params.id)
			.eq('user_id', user.id)
			.single();

		if (synthError || !synthesis) {
			return json({ error: 'Synthesis not found or access denied' }, { status: 404 });
		}

		// Update the specific synthesis
		const { data: updatedSynthesis, error: updateError } = await supabase
			.from('project_synthesis')
			.update({
				synthesis_content,
				status,
				updated_at: new Date().toISOString()
			})
			.eq('id', targetSynthesisId)
			.eq('user_id', user.id)
			.select()
			.single();

		if (updateError) {
			console.error('Error updating synthesis:', updateError);
			return json({ error: 'Failed to update synthesis' }, { status: 500 });
		}

		return json({
			synthesis: updatedSynthesis
		});
	} catch (error) {
		console.error('Error updating synthesis:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// Delete synthesis
export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Verify project ownership
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id, user_id')
			.eq('id', params.id)
			.single();

		if (projectError || !project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		if (project.user_id !== user.id) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		// Get the most recent synthesis first
		const { data: syntheses, error: fetchError } = await supabase
			.from('project_synthesis')
			.select('id')
			.eq('project_id', params.id)
			.eq('user_id', user.id)
			.order('created_at', { ascending: false })
			.limit(1);

		if (fetchError) {
			console.error('Error fetching synthesis:', fetchError);
			return json({ error: 'Failed to fetch synthesis' }, { status: 500 });
		}

		if (!syntheses || syntheses.length === 0) {
			return json({ error: 'No synthesis found to delete' }, { status: 404 });
		}

		const synthesisToDelete = syntheses[0];

		// Delete only the most recent synthesis
		const { error: deleteError } = await supabase
			.from('project_synthesis')
			.delete()
			.eq('id', synthesisToDelete.id)
			.eq('user_id', user.id);

		if (deleteError) {
			console.error('Error deleting synthesis:', deleteError);
			return json({ error: 'Failed to delete synthesis' }, { status: 500 });
		}

		return json({
			message: 'Synthesis deleted successfully',
			deletedId: synthesisToDelete.id
		});
	} catch (error) {
		console.error('Error deleting synthesis:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
