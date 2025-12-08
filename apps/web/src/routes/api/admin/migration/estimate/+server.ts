// apps/web/src/routes/api/admin/migration/estimate/+server.ts
// Cost estimation endpoint for migration operations
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	estimateCostForEntities,
	getAvailableModels
} from '$lib/services/ontology/migration-llm.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	// Get parameters
	const userId = url.searchParams.get('userId');
	const projectIds = url.searchParams.get('projectIds')?.split(',').filter(Boolean);
	const model = url.searchParams.get('model') || 'deepseek-chat';
	const includeCompleted = url.searchParams.get('includeCompleted') === 'true';

	const supabase = createAdminSupabaseClient();

	try {
		let projectQuery = supabase.from('projects').select('id');

		// Filter by user or specific projects
		if (userId) {
			projectQuery = projectQuery.eq('user_id', userId);
		} else if (projectIds && projectIds.length > 0) {
			projectQuery = projectQuery.in('id', projectIds);
		}

		// Exclude archived by default
		if (!includeCompleted) {
			projectQuery = projectQuery.neq('status', 'archived');
		}

		const { data: projects, error: projectError } = await projectQuery;

		if (projectError) {
			throw new Error(`Failed to fetch projects: ${projectError.message}`);
		}

		if (!projects || projects.length === 0) {
			return ApiResponse.success({
				estimate: {
					tokens: 0,
					cost: 0,
					breakdown: { inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0 },
					estimatedDuration: '0 seconds',
					model
				},
				entityCounts: { projects: 0, tasks: 0, phases: 0, pendingProjects: 0 },
				models: getAvailableModels()
			});
		}

		const projectIdList = projects.map((p) => p.id);

		// Check which projects are already migrated
		const { data: existingMappings } = await supabase
			.from('legacy_entity_mappings')
			.select('legacy_id')
			.eq('legacy_table', 'projects')
			.in('legacy_id', projectIdList);

		const migratedProjectIds = new Set(existingMappings?.map((m) => m.legacy_id) ?? []);
		const pendingProjectIds = projectIdList.filter((id) => !migratedProjectIds.has(id));

		if (pendingProjectIds.length === 0) {
			return ApiResponse.success({
				estimate: {
					tokens: 0,
					cost: 0,
					breakdown: { inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0 },
					estimatedDuration: '0 seconds',
					model
				},
				entityCounts: {
					projects: projectIdList.length,
					tasks: 0,
					phases: 0,
					pendingProjects: 0
				},
				allMigrated: true,
				models: getAvailableModels()
			});
		}

		// Count pending tasks
		const { count: taskCount } = await supabase
			.from('tasks')
			.select('id', { count: 'exact', head: true })
			.in('project_id', pendingProjectIds);

		// Exclude already migrated tasks
		const { data: migratedTasks } = await supabase
			.from('legacy_entity_mappings')
			.select('legacy_id')
			.eq('legacy_table', 'tasks');

		const migratedTaskIds = new Set(migratedTasks?.map((m) => m.legacy_id) ?? []);

		// Get actual pending task count
		const { data: pendingTasks } = await supabase
			.from('tasks')
			.select('id')
			.in('project_id', pendingProjectIds);

		const pendingTaskCount =
			pendingTasks?.filter((t) => !migratedTaskIds.has(t.id)).length ?? 0;

		// Count pending phases
		const { data: pendingPhases } = await supabase
			.from('phases')
			.select('id')
			.in('project_id', pendingProjectIds);

		const { data: migratedPhases } = await supabase
			.from('legacy_entity_mappings')
			.select('legacy_id')
			.eq('legacy_table', 'phases');

		const migratedPhaseIds = new Set(migratedPhases?.map((m) => m.legacy_id) ?? []);
		const pendingPhaseCount =
			pendingPhases?.filter((p) => !migratedPhaseIds.has(p.id)).length ?? 0;

		// Calculate estimate
		const estimate = estimateCostForEntities({
			projects: pendingProjectIds.length,
			tasks: pendingTaskCount,
			phases: pendingPhaseCount,
			model
		});

		return ApiResponse.success({
			estimate,
			entityCounts: {
				projects: projectIdList.length,
				pendingProjects: pendingProjectIds.length,
				tasks: taskCount ?? 0,
				pendingTasks: pendingTaskCount,
				phases: pendingPhases?.length ?? 0,
				pendingPhases: pendingPhaseCount
			},
			models: getAvailableModels()
		});
	} catch (error) {
		console.error('[Migration] Cost estimation failed', error);
		return ApiResponse.internalError(error, 'Failed to estimate migration cost');
	}
};

// POST endpoint for custom entity counts
export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const body = await request.json().catch(() => ({}));

	const projects = typeof body?.projects === 'number' ? body.projects : 0;
	const tasks = typeof body?.tasks === 'number' ? body.tasks : 0;
	const phases = typeof body?.phases === 'number' ? body.phases : 0;
	const model = typeof body?.model === 'string' ? body.model : 'deepseek-chat';

	try {
		const estimate = estimateCostForEntities({
			projects,
			tasks,
			phases,
			model
		});

		return ApiResponse.success({
			estimate,
			entityCounts: { projects, tasks, phases },
			models: getAvailableModels()
		});
	} catch (error) {
		console.error('[Migration] Cost estimation failed', error);
		return ApiResponse.internalError(error, 'Failed to estimate migration cost');
	}
};
