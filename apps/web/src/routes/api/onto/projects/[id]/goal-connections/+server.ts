// apps/web/src/routes/api/onto/projects/[id]/goal-connections/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { buildProjectGoalConnectionOverview } from '$lib/server/project-goal-connection-summary';
import { logOntologyApiError } from '../../../shared/error-logging';

export const GET: RequestHandler = async ({ params, locals }) => {
	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'read'
	});
	if (!access.ok) return access.response;

	const projectId = access.projectId;
	const supabase = locals.supabase;

	try {
		const [goalsResult, tasksResult, plansResult, milestonesResult, edgesResult] =
			await Promise.all([
				supabase
					.from('onto_goals')
					.select('id, created_at, updated_at')
					.eq('project_id', projectId)
					.is('deleted_at', null)
					.is('archived_at', null),
				supabase
					.from('onto_tasks')
					.select('id, title, state_key, due_at, props, created_at, updated_at')
					.eq('project_id', projectId)
					.is('deleted_at', null)
					.is('archived_at', null),
				supabase
					.from('onto_plans')
					.select('id, name, state_key, props, created_at, updated_at')
					.eq('project_id', projectId)
					.is('deleted_at', null)
					.is('archived_at', null),
				supabase
					.from('onto_milestones')
					.select('id, title, state_key, due_at, props, created_at, updated_at')
					.eq('project_id', projectId)
					.is('deleted_at', null)
					.is('archived_at', null),
				supabase
					.from('onto_edges')
					.select('src_kind, src_id, rel, dst_kind, dst_id, created_at')
					.eq('project_id', projectId)
					.in('rel', [
						'has_task',
						'supports_goal',
						'achieved_by',
						'supports',
						'has_plan',
						'has_milestone',
						'has'
					])
					.or('src_kind.eq.goal,dst_kind.eq.goal')
			]);

		const failedResult = [
			['onto_goals', goalsResult.error],
			['onto_tasks', tasksResult.error],
			['onto_plans', plansResult.error],
			['onto_milestones', milestonesResult.error],
			['onto_edges', edgesResult.error]
		].find(([, error]) => Boolean(error));

		if (failedResult) {
			const [tableName, error] = failedResult;
			await logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/projects/${projectId}/goal-connections`,
				method: 'GET',
				userId: access.userId,
				projectId,
				entityType: 'goal',
				operation: 'project_goal_connections_fetch',
				tableName: String(tableName)
			});
			return ApiResponse.error('Failed to load goal connections', 500);
		}

		const overview = buildProjectGoalConnectionOverview({
			projectId,
			goals: goalsResult.data ?? [],
			tasks: tasksResult.data ?? [],
			plans: plansResult.data ?? [],
			milestones: milestonesResult.data ?? [],
			edges: edgesResult.data ?? []
		});

		return ApiResponse.success({ overview });
	} catch (error) {
		await logOntologyApiError({
			supabase,
			error,
			endpoint: `/api/onto/projects/${projectId}/goal-connections`,
			method: 'GET',
			userId: access.userId,
			projectId,
			entityType: 'goal',
			operation: 'project_goal_connections_fetch'
		});
		return ApiResponse.internalError(error, 'Failed to load goal connections');
	}
};
