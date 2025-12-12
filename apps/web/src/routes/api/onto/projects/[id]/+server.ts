// apps/web/src/routes/api/onto/projects/[id]/+server.ts
/**
 * GET /api/onto/projects/[id]
 * Fetch project with all related entities (goals, plans, tasks, outputs, etc.)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { Project, Document } from '$lib/types/onto';

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

		// OPTIMIZATION: Fetch project AND actor ID in parallel
		// These are independent and can run concurrently
		const [projectResult, actorResult] = await Promise.all([
			supabase.from('onto_projects').select('*').eq('id', id).single(),
			supabase.rpc('ensure_actor_for_user', { p_user_id: user.id })
		]);

		if (projectResult.error) {
			console.error('[Project API] Failed to fetch project:', projectResult.error);
			return ApiResponse.error(
				`Failed to fetch project: ${projectResult.error.message}`,
				500
			);
		}

		const project = projectResult.data;
		if (!project) {
			return ApiResponse.notFound('Project not found');
		}

		if (actorResult.error || !actorResult.data) {
			console.error('[Project API] Failed to get actor:', actorResult.error);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		const actorId = actorResult.data;
		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to access this project');
		}

		// OPTIMIZATION: Fetch ALL related entities in a single parallel batch
		// Including context document (via JOIN), task-plan edges, and all entity tables
		// Note: FSM transitions removed - using simple enum states now (see FSM_SIMPLIFICATION_COMPLETE.md)
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
			contextDocResult,
			taskPlanEdgesResult
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
			// OPTIMIZATION: Fetch context document via edge in single query with JOIN
			supabase
				.from('onto_edges')
				.select('dst_id, document:onto_documents!inner(*)')
				.eq('src_kind', 'project')
				.eq('src_id', id)
				.eq('rel', 'has_context_document')
				.eq('dst_kind', 'document')
				.maybeSingle(),
			// OPTIMIZATION: Fetch task-plan edges in parallel (not after tasks loaded)
			supabase
				.from('onto_edges')
				.select('src_id, dst_id')
				.eq('rel', 'belongs_to_plan')
				.eq('src_kind', 'task')
				.eq('dst_kind', 'plan')
		]);

		// Log any errors (non-fatal)
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

		// Extract context document from JOIN result
		// The !inner join creates an aliased property with the table name
		const contextDocument: Document | null = (contextDocResult.data as any)?.document ?? null;

		// Enrich tasks with plan information from pre-fetched edges
		const tasks = tasksResult.data || [];
		const plans = plansResult.data || [];
		const taskPlanEdges = taskPlanEdgesResult.data || [];

		if (tasks.length > 0 && taskPlanEdges.length > 0) {
			// Build a set of task IDs for this project for filtering
			const projectTaskIds = new Set(tasks.map((t: any) => t.id));

			// Build map from task -> plan (only for tasks in this project)
			const taskToPlanMap = new Map<string, string>();
			for (const edge of taskPlanEdges) {
				if (projectTaskIds.has(edge.src_id)) {
					taskToPlanMap.set(edge.src_id, edge.dst_id);
				}
			}

			// Add plan_id and plan object to each task for backward compatibility
			for (const task of tasks) {
				const planId = taskToPlanMap.get(task.id);
				if (planId) {
					(task as any).plan_id = planId;
					(task as any).plan = plans.find((p: any) => p.id === planId) || null;
				}
			}
		}

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
			context_document: contextDocument
		});
	} catch (err) {
		console.error('[Project API] Unexpected error:', err);
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id } = params;
		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}

		const body = await request.json().catch(() => null);
		if (!body || typeof body !== 'object') {
			return ApiResponse.badRequest('Invalid request body');
		}

		// Build update object from allowed fields
		const {
			name,
			description,
			state_key,
			props,
			facet_context,
			facet_scale,
			facet_stage,
			start_at,
			end_at
		} = body as Record<string, unknown>;

		const hasUpdates =
			name !== undefined ||
			description !== undefined ||
			state_key !== undefined ||
			props !== undefined ||
			facet_context !== undefined ||
			facet_scale !== undefined ||
			facet_stage !== undefined ||
			start_at !== undefined ||
			end_at !== undefined;

		if (!hasUpdates) {
			return ApiResponse.badRequest('No update fields provided');
		}

		const supabase = locals.supabase;

		// Resolve actor for ownership verification
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Project PATCH] Failed to get actor:', actorError);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		// Fetch project to verify ownership and existing props
		const { data: existingProject, error: fetchError } = await supabase
			.from('onto_projects')
			.select('*')
			.eq('id', id)
			.single();

		if (fetchError || !existingProject) {
			return ApiResponse.notFound('Project not found');
		}

		if (existingProject.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to modify this project');
		}

		const updateData: Record<string, unknown> = {
			updated_at: new Date().toISOString()
		};

		if (name !== undefined) {
			updateData.name = typeof name === 'string' ? name.trim() : existingProject.name;
		}

		if (description !== undefined) {
			updateData.description =
				typeof description === 'string' && description.trim().length > 0
					? description.trim()
					: null;
		}

		if (state_key !== undefined) {
			updateData.state_key =
				typeof state_key === 'string' ? state_key : existingProject.state_key;
		}

		if (facet_context !== undefined) {
			updateData.facet_context =
				typeof facet_context === 'string' && facet_context.length > 0
					? facet_context
					: null;
		}

		if (facet_scale !== undefined) {
			updateData.facet_scale =
				typeof facet_scale === 'string' && facet_scale.length > 0 ? facet_scale : null;
		}

		if (facet_stage !== undefined) {
			updateData.facet_stage =
				typeof facet_stage === 'string' && facet_stage.length > 0 ? facet_stage : null;
		}

		if (start_at !== undefined) {
			updateData.start_at = normalizeDateInput(start_at, existingProject.start_at);
		}

		if (end_at !== undefined) {
			updateData.end_at = normalizeDateInput(end_at, existingProject.end_at);
		}

		if (props !== undefined) {
			const currentProps = (existingProject.props as Record<string, unknown>) ?? {};
			if (props && typeof props === 'object' && !Array.isArray(props)) {
				updateData.props = {
					...currentProps,
					...props
				};
			} else {
				updateData.props = currentProps;
			}
		}

		const { data: updatedProject, error: updateError } = await supabase
			.from('onto_projects')
			.update(updateData)
			.eq('id', id)
			.select('*')
			.single();

		if (updateError || !updatedProject) {
			console.error('[Project PATCH] Failed to update project:', updateError);
			return ApiResponse.error('Failed to update project', 500);
		}

		return ApiResponse.success({ project: updatedProject });
	} catch (err) {
		console.error('[Project PATCH] Unexpected error:', err);
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};

function normalizeDateInput(value: unknown, fallback: string | null): string | null {
	if (value === null) {
		return null;
	}

	if (typeof value !== 'string') {
		return fallback;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	// Accept YYYY-MM-DD or ISO strings
	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		const date = new Date(`${trimmed}T00:00:00Z`);
		return isNaN(date.getTime()) ? fallback : date.toISOString();
	}

	const parsed = new Date(trimmed);
	return isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

export const DELETE: RequestHandler = async ({ params, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id } = params;
		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}

		const supabase = locals.supabase;

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Project DELETE] Failed to get actor:', actorError);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		const { data: project, error: fetchError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', id)
			.single();

		if (fetchError || !project) {
			return ApiResponse.notFound('Project not found');
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to delete this project');
		}

		const { error: deleteError } = await supabase.rpc('delete_onto_project', {
			p_project_id: id
		});

		if (deleteError) {
			console.error('[Project DELETE] Failed to delete project:', deleteError);
			return ApiResponse.error('Failed to delete project', 500);
		}

		return ApiResponse.success({
			id,
			message: 'Project deleted'
		});
	} catch (err) {
		console.error('[Project DELETE] Unexpected error:', err);
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
