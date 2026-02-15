// apps/web/src/routes/api/braindumps/init/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		// Get the optional projectId from query params
		// Filter out 'new' as it's a special UI value meaning no project
		const rawProjectId = url.searchParams.get('projectId');
		const projectId = rawProjectId === 'new' ? null : rawProjectId;
		const excludeBrainDumpId = url.searchParams.get('excludeBrainDumpId');
		const actorId = await ensureActorId(supabase, user.id);

		// Execute queries in parallel for faster loading
		const [projectsResult, recentBrainDumpsResult, draftCountsResult, currentDraftResult] =
			await Promise.all([
				// Get projects with essential fields
				supabase
					.from('onto_projects')
					.select('id, name, description, created_at, updated_at')
					.eq('created_by', actorId)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(20),

				// Get recent brain dumps (completed ones)
				supabase
					.from('brain_dumps')
					.select(
						'id, content, created_at, ai_summary, ai_insights, status, project_id, title'
					)
					.eq('user_id', user.id)
					.in('status', ['saved', 'parsed_and_deleted'])
					.order('created_at', { ascending: false })
					.limit(5),

				// Get draft counts per project
				supabase
					.from('brain_dumps')
					.select('project_id, status')
					.eq('user_id', user.id)
					.in('status', ['pending', 'parsed']),

				// Get current draft if projectId is provided
				projectId
					? (() => {
							let query = supabase
								.from('brain_dumps')
								.select('*')
								.eq('user_id', user.id)
								.eq('project_id', projectId)
								.in('status', ['pending', 'parsed']);

							if (excludeBrainDumpId) {
								query = query.neq('id', excludeBrainDumpId);
							}

							return query
								.order('updated_at', { ascending: false })
								.limit(1)
								.maybeSingle();
						})()
					: Promise.resolve({ data: null, error: null })
			]);

		// Handle potential errors gracefully
		if (projectsResult.error) {
			console.error('Error loading projects:', projectsResult.error);
		}
		if (recentBrainDumpsResult.error) {
			console.error('Error loading brain dumps:', recentBrainDumpsResult.error);
		}
		if (draftCountsResult.error) {
			console.error('Error loading draft counts:', draftCountsResult.error);
		}
		if (currentDraftResult.error) {
			console.error('Error loading current draft:', currentDraftResult.error);
		}

		const projects = projectsResult.data || [];
		const drafts = draftCountsResult.data || [];

		// Count drafts per project
		const draftCounts: Record<string, number> = {};
		drafts.forEach((draft) => {
			const key = draft.project_id || 'new';
			draftCounts[key] = (draftCounts[key] || 0) + 1;
		});

		// Fetch task and note counts for each project
		let projectsWithCounts: Array<Record<string, unknown>> = [];
		if (projects.length > 0) {
			const projectIds = projects.map((p) => p.id);

			const [tasksResult, notesResult] = await Promise.all([
				// Get task counts per project
				supabase
					.from('onto_tasks')
					.select('project_id')
					.is('deleted_at', null)
					.in('project_id', projectIds),

				// Get note counts per project
				supabase
					.from('notes')
					.select('project_id')
					.eq('user_id', user.id)
					.in('project_id', projectIds)
			]);

			// Count tasks and notes per project
			const taskCounts = (tasksResult.data || []).reduce(
				(acc, task) => {
					if (task.project_id) {
						acc[task.project_id] = (acc[task.project_id] || 0) + 1;
					}
					return acc;
				},
				{} as Record<string, number>
			);

			const noteCounts = (notesResult.data || []).reduce(
				(acc, note) => {
					if (note.project_id) {
						acc[note.project_id] = (acc[note.project_id] || 0) + 1;
					}
					return acc;
				},
				{} as Record<string, number>
			);

			// Combine project data with counts
			projectsWithCounts = projects.map((project) => ({
				...project,
				slug: null,
				taskCount: taskCounts[project.id] || 0,
				noteCount: noteCounts[project.id] || 0,
				draftCount: draftCounts[project.id] || 0
			}));
		}

		// Process recent brain dumps
		const recentBrainDumps = (recentBrainDumpsResult.data || []).filter(
			(dump) => dump.status === 'saved'
		);

		// Process current draft if exists
		let currentDraft = null;
		let parseResults = null;

		if (currentDraftResult.data) {
			currentDraft = currentDraftResult.data;

			// If it's parsed, try to get the parse results
			if (currentDraft.status === 'parsed' && currentDraft.parsed_results) {
				try {
					parseResults = JSON.parse(currentDraft.parsed_results as string);

					// Validate parse results structure
					if (!parseResults?.operations || !Array.isArray(parseResults.operations)) {
						console.error('Invalid parse results structure');
						parseResults = null;
					}
				} catch (e) {
					console.warn('Could not parse parse results:', e);
					parseResults = null;
				}
			}
		}

		return ApiResponse.success({
			projects: projectsWithCounts,
			recentBrainDumps,
			newProjectDraftCount: draftCounts['new'] || 0,
			currentDraft: currentDraft
				? {
						brainDump: currentDraft,
						parseResults
					}
				: null
		});
	} catch (error) {
		console.error('Brain dump init API error:', error);
		return ApiResponse.internalError(error);
	}
};
