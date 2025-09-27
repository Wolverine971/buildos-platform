// src/routes/api/braindumps/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const braindumpId = params.id;

		// Get the braindump
		const { data: braindump, error: braindumpError } = await supabase
			.from('brain_dumps')
			.select('*')
			.eq('id', braindumpId)
			.eq('user_id', user.id)
			.single();

		if (braindumpError || !braindump) {
			return ApiResponse.notFound('Braindump not found');
		}

		// Get brain_dump_links for this braindump
		const { data: links, error: linksError } = await supabase
			.from('brain_dump_links')
			.select(
				`
				*,
				projects(id, name, slug, description, status, created_at),
				tasks(id, title, description, status),
				notes(id, title, content)
			`
			)
			.eq('brain_dump_id', braindumpId);

		if (linksError) {
			console.error('Error fetching links:', linksError);
		}

		const brain_dump_links = links || [];

		// Get linked data
		const linkedData = {
			projects: brain_dump_links.filter((link) => link.projects).map((link) => link.projects),
			tasks: brain_dump_links.filter((link) => link.tasks).map((link) => link.tasks),
			notes: brain_dump_links.filter((link) => link.notes).map((link) => link.notes)
		};

		// Calculate metadata
		const content = braindump.content || '';
		const wordCount = content.split(/\s+/).filter((word) => word.length > 0).length;
		const characterCount = content.length;
		const linkCount = brain_dump_links.length;

		const metadata = {
			wordCount,
			characterCount,
			linkCount
		};

		return ApiResponse.success({
			braindump,
			linkedData,
			metadata
		});
	} catch (error) {
		console.error('Error fetching braindump details:', error);
		return ApiResponse.internalError(error, 'Failed to fetch braindump details');
	}
};

export const PUT: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const { id } = params;

		const updateData = await parseRequestBody(request);
		if (!updateData) {
			return ApiResponse.badRequest('Invalid request body');
		}

		const { data: braindump, error } = await supabase
			.from('brain_dumps')
			.update({
				title: updateData.title,
				content: updateData.content,
				tags: updateData.tags,
				status: updateData.status,
				updated_at: new Date().toISOString()
			})
			.eq('id', id)
			.eq('user_id', user.id)
			.select()
			.single();

		if (error) {
			console.error('Error updating braindump:', error);
			return ApiResponse.internalError(error, 'Failed to update braindump');
		}

		return ApiResponse.success({ braindump });
	} catch (error) {
		console.error('Error in braindump update API:', error);
		return ApiResponse.internalError(error);
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const { id } = params;

		// First, get the braindump details for logging
		const { data: braindump, error: fetchError } = await supabase
			.from('brain_dumps')
			.select('id, title, created_at')
			.eq('id', id)
			.eq('user_id', user.id)
			.single();

		if (fetchError || !braindump) {
			return ApiResponse.notFound('Braindump not found');
		}

		// Track what we're deleting for the response
		let linksCleared = 0;
		let questionsAffected = 0;

		// Delete brain_dump_links first and count them
		const { count: linkCount } = await supabase
			.from('brain_dump_links')
			.select('*', { count: 'exact', head: true })
			.eq('brain_dump_id', id);

		linksCleared = linkCount || 0;

		if (linksCleared > 0) {
			const { error: linkError } = await supabase
				.from('brain_dump_links')
				.delete()
				.eq('brain_dump_id', id);

			if (linkError) {
				console.error('Error deleting brain_dump_links:', linkError);
				// Continue with deletion even if links fail
			}
		}

		// Clear answer_brain_dump_id references in project_questions
		const { count: questionCount } = await supabase
			.from('project_questions')
			.select('*', { count: 'exact', head: true })
			.eq('answer_brain_dump_id', id);

		questionsAffected = questionCount || 0;

		if (questionsAffected > 0) {
			const { error: questionError } = await supabase
				.from('project_questions')
				.update({ answer_brain_dump_id: null })
				.eq('answer_brain_dump_id', id);

			if (questionError) {
				console.error('Error clearing project_questions references:', questionError);
				// Continue with deletion even if this fails
			}
		}

		// Log the deletion activity for audit trail
		const activityData = {
			user_id: user.id,
			action: 'delete_braindump',
			resource_type: 'brain_dump',
			resource_id: id,
			metadata: {
				title: braindump.title,
				created_at: braindump.created_at,
				links_cleared: linksCleared,
				questions_affected: questionsAffected,
				deleted_at: new Date().toISOString()
			}
		};

		// Insert activity log (non-blocking)
		supabase
			.from('user_activity')
			.insert(activityData)
			.then(({ error }) => {
				if (error) {
					console.error('Failed to log deletion activity:', error);
				}
			});

		// Finally, delete the braindump
		const { error: deleteError } = await supabase
			.from('brain_dumps')
			.delete()
			.eq('id', id)
			.eq('user_id', user.id);

		if (deleteError) {
			console.error('Error deleting braindump:', deleteError);
			return ApiResponse.internalError(deleteError, 'Failed to delete braindump');
		}

		// Return detailed response about what was deleted
		return ApiResponse.success({
			success: true,
			deleted: {
				braindump_id: id,
				title: braindump.title,
				links_cleared: linksCleared,
				questions_affected: questionsAffected
			}
		});
	} catch (error) {
		console.error('Error in braindump delete API:', error);
		return ApiResponse.internalError(error);
	}
};
