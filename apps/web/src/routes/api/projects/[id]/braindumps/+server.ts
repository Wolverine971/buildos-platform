// apps/web/src/routes/api/projects/[id]/braindumps/+server.ts
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import type { BraindumpWithLinks } from '$lib/types/brain-dump';

/**
 * GET /api/projects/:id/braindumps
 *
 * Fetches all braindumps associated with a project via brain_dump_links table.
 * Returns enriched braindump data including linked tasks and notes.
 *
 * A single braindump can be linked to multiple tasks/notes within the same project,
 * so we group the results by braindump_id to avoid duplicates.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const { supabase, safeGetSession } = locals;
	const { user } = await safeGetSession();

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const { id: projectId } = params;

	try {
		// Query brain_dump_links joined with brain_dumps, tasks, and notes
		// Note: We get all links for this project, then group by braindump
		const { data: braindumpLinks, error: err } = await supabase
			.from('brain_dump_links')
			.select(
				`
				brain_dump_id,
				linked_at:created_at,
				task_id,
				note_id,
				brain_dumps!inner (
					id,
					title,
					content,
					ai_summary,
					status,
					created_at,
					updated_at,
					user_id
				),
				tasks (
					id,
					title,
					status
				),
				notes (
					id,
					title
				)
			`
			)
			.eq('project_id', projectId)
			.eq('brain_dumps.user_id', user.id)
			.order('created_at', { ascending: false });

		if (err) {
			console.error('Error fetching project braindumps:', err);
			throw error(500, 'Failed to fetch braindumps');
		}

		// Group by braindump_id to consolidate multiple links
		const braindumpsMap = new Map<string, BraindumpWithLinks>();

		for (const link of braindumpLinks || []) {
			const braindump = link.brain_dumps;
			const braindumpId = braindump.id;

			// Initialize braindump entry if not exists
			if (!braindumpsMap.has(braindumpId)) {
				braindumpsMap.set(braindumpId, {
					id: braindump.id,
					title: braindump.title || '',
					content: braindump.content || '',
					ai_summary: braindump.ai_summary,
					status: braindump.status,
					created_at: braindump.created_at,
					updated_at: braindump.updated_at,
					linked_at: link.linked_at,
					linked_tasks: [],
					linked_notes: []
				});
			}

			const bd = braindumpsMap.get(braindumpId)!;

			// Add task if present and not already added
			if (link.task_id && link.tasks) {
				const taskExists = bd.linked_tasks.find((t) => t.id === link.tasks.id);
				if (!taskExists) {
					bd.linked_tasks.push({
						id: link.tasks.id,
						title: link.tasks.title,
						status: link.tasks.status
					});
				}
			}

			// Add note if present and not already added
			if (link.note_id && link.notes) {
				const noteExists = bd.linked_notes.find((n) => n.id === link.notes.id);
				if (!noteExists) {
					bd.linked_notes.push({
						id: link.notes.id,
						title: link.notes.title
					});
				}
			}
		}

		// Convert map to array
		const braindumps: BraindumpWithLinks[] = Array.from(braindumpsMap.values());

		return json({
			braindumps,
			count: braindumps.length
		});
	} catch (err: any) {
		console.error('Error in project braindumps endpoint:', err);
		throw error(err.status || 500, err.message || 'Internal server error');
	}
};
