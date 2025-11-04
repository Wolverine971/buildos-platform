// apps/web/src/routes/api/onto/projects/[id]/+server.ts
/**
 * GET /api/onto/projects/[id]
 * Fetch project with all related entities (goals, plans, tasks, outputs, etc.)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { Project, Template } from '$lib/types/onto';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id } = params;

		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}

		const supabase = locals.supabase;

		// Fetch project with template metadata
		const { data: projectRows, error: projectFetchError } = await supabase.rpc(
			'get_project_with_template',
			{
				p_project_id: id
			}
		);

		if (projectFetchError) {
			console.error('[Project API] Failed to fetch project:', projectFetchError);
			return ApiResponse.error(`Failed to fetch project: ${projectFetchError.message}`, 500);
		}

		if (!projectRows || projectRows.length === 0 || !projectRows[0]?.project) {
			return ApiResponse.notFound('Project not found');
		}

		const project = projectRows[0].project as Project;
		const template = (projectRows[0].template as Template | null | undefined) ?? null;

		// Security check: Verify user owns this project via actor
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId) {
			console.error('[Project API] Failed to get actor:', actorError);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to access this project');
		}

		// Fetch all related entities in parallel
		const [
			goalsResult,
			requirementsResult,
			plansResult,
			tasksResult,
			outputsResult,
			documentsResult,
			sourcesResult,
			milestonesResult,
			risksResult,
			decisionsResult,
			metricsResult,
			allowedTransitionsResult
		] = await Promise.all([
			supabase.from('onto_goals').select('*').eq('project_id', id).order('created_at'),
			supabase.from('onto_requirements').select('*').eq('project_id', id).order('created_at'),
			supabase.from('onto_plans').select('*').eq('project_id', id).order('created_at'),
			supabase.from('onto_tasks').select('*').eq('project_id', id).order('created_at'),
			supabase.from('onto_outputs').select('*').eq('project_id', id).order('created_at'),
			supabase.from('onto_documents').select('*').eq('project_id', id).order('created_at'),
			supabase.from('onto_sources').select('*').eq('project_id', id).order('created_at'),
			supabase.from('onto_milestones').select('*').eq('project_id', id).order('due_at'),
			supabase.from('onto_risks').select('*').eq('project_id', id).order('created_at'),
			supabase.from('onto_decisions').select('*').eq('project_id', id).order('decision_at'),
			supabase.from('onto_metrics').select('*').eq('project_id', id).order('created_at'),
			supabase.rpc('get_allowed_transitions', {
				p_object_kind: 'project',
				p_object_id: id
			})
		]);

		if (goalsResult.error) {
			console.error('[Project API] Failed to fetch goals:', goalsResult.error);
		}
		if (requirementsResult.error) {
			console.error('[Project API] Failed to fetch requirements:', requirementsResult.error);
		}
		if (plansResult.error) {
			console.error('[Project API] Failed to fetch plans:', plansResult.error);
		}
		if (tasksResult.error) {
			console.error('[Project API] Failed to fetch tasks:', tasksResult.error);
		}
		if (outputsResult.error) {
			console.error('[Project API] Failed to fetch outputs:', outputsResult.error);
		}
		if (documentsResult.error) {
			console.error('[Project API] Failed to fetch documents:', documentsResult.error);
		}

		if (allowedTransitionsResult.error) {
			console.error(
				'[Project API] Failed to fetch allowed transitions:',
				allowedTransitionsResult.error
			);
			return ApiResponse.error(
				`Failed to fetch allowed transitions: ${allowedTransitionsResult.error.message}`,
				500
			);
		}

		const allowedTransitions = (allowedTransitionsResult.data || []).map((transition: any) => ({
			event: transition.event,
			to: transition.to_state,
			label: transition.event
				.replace(/_/g, ' ')
				.replace(/\b\w/g, (l: string) => l.toUpperCase()),
			guards: Array.isArray(transition.guards) ? transition.guards : [],
			actions: Array.isArray(transition.actions) ? transition.actions : []
		}));

		return ApiResponse.success({
			project,
			goals: goalsResult.data || [],
			requirements: requirementsResult.data || [],
			plans: plansResult.data || [],
			tasks: tasksResult.data || [],
			outputs: outputsResult.data || [],
			documents: documentsResult.data || [],
			sources: sourcesResult.data || [],
			milestones: milestonesResult.data || [],
			risks: risksResult.data || [],
			decisions: decisionsResult.data || [],
			metrics: metricsResult.data || [],
			template,
			allowed_transitions: allowedTransitions
		});
	} catch (err) {
		console.error('[Project API] Unexpected error:', err);
		return ApiResponse.internalError('An unexpected error occurred');
	}
};
