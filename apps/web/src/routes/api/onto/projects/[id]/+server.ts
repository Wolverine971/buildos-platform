// apps/web/src/routes/api/onto/projects/[id]/+server.ts
/**
 * GET /api/onto/projects/[id]
 * Fetch project with all related entities (goals, plans, tasks, etc.)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { Document } from '$lib/types/onto';
import { PROJECT_STATES } from '$lib/types/onto';
import {
	logUpdateAsync,
	logDeleteAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { logOntologyApiError } from '../../shared/error-logging';
import type { Database } from '@buildos/shared-types';
import { decorateMilestonesWithGoals } from '$lib/server/milestone-decorators';

type GoalRow = Database['public']['Tables']['onto_goals']['Row'];
type MilestoneRow = Database['public']['Tables']['onto_milestones']['Row'];

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();

		const { id } = params;

		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}

		const supabase = locals.supabase;

		if (user) {
			const actorResult = await supabase.rpc('ensure_actor_for_user', { p_user_id: user.id });

			if (actorResult.error || !actorResult.data) {
				console.error('[Project API] Failed to get actor:', actorResult.error);
				await logOntologyApiError({
					supabase,
					error: actorResult.error || new Error('Failed to resolve user actor'),
					endpoint: `/api/onto/projects/${id}`,
					method: 'GET',
					userId: user.id,
					projectId: id,
					entityType: 'project',
					operation: 'project_actor_resolve'
				});
				return ApiResponse.internalError(
					actorResult.error || new Error('Failed to resolve user actor'),
					'Failed to resolve user actor'
				);
			}
		}

		// OPTIMIZATION: Fetch project data + access check in parallel
		// Note: We don't filter deleted_at here to allow viewing deleted projects
		// (but we return deleted_at status so frontend can handle it)
		const [projectResult, accessResult] = await Promise.all([
			supabase.from('onto_projects').select('*').eq('id', id).maybeSingle(),
			supabase.rpc('current_actor_has_project_access', {
				p_project_id: id,
				p_required_access: 'read'
			})
		]);

		if (projectResult.error) {
			console.error('[Project API] Failed to fetch project:', projectResult.error);
			await logOntologyApiError({
				supabase,
				error: projectResult.error,
				endpoint: `/api/onto/projects/${id}`,
				method: 'GET',
				userId: user?.id,
				projectId: id,
				entityType: 'project',
				operation: 'project_get',
				tableName: 'onto_projects'
			});
			return ApiResponse.databaseError(projectResult.error);
		}

		const project = projectResult.data;
		if (!project) {
			return ApiResponse.notFound('Project');
		}

		// Return 404 for soft-deleted projects (they shouldn't be accessed directly)
		if (project.deleted_at) {
			return ApiResponse.notFound('Project');
		}

		if (accessResult.error) {
			console.error('[Project API] Failed to check access:', accessResult.error);
			await logOntologyApiError({
				supabase,
				error: accessResult.error,
				endpoint: `/api/onto/projects/${id}`,
				method: 'GET',
				userId: user?.id,
				projectId: id,
				entityType: 'project',
				operation: 'project_access_check'
			});
			return ApiResponse.internalError(accessResult.error, 'Failed to check project access');
		}

		if (!accessResult.data) {
			return user
				? ApiResponse.forbidden('You do not have permission to access this project')
				: ApiResponse.notFound('Project');
		}

		// OPTIMIZATION: Fetch ALL related entities in a single parallel batch
		// Including context document (via JOIN) and all entity tables
		// Note: FSM transitions removed - using simple enum states now (see FSM_SIMPLIFICATION_COMPLETE.md)
		const [
			goalsResult,
			requirementsResult,
			plansResult,
			tasksResult,
			documentsResult,
			sourcesResult,
			milestonesResult,
			risksResult,
			metricsResult,
			contextDocResult
		] = await Promise.all([
			supabase
				.from('onto_goals')
				.select('*')
				.eq('project_id', id)
				.is('deleted_at', null)
				.order('created_at'),
			supabase
				.from('onto_requirements')
				.select('*')
				.eq('project_id', id)
				.is('deleted_at', null)
				.order('created_at'),
			supabase
				.from('onto_plans')
				.select('*')
				.eq('project_id', id)
				.is('deleted_at', null)
				.order('created_at'),
			supabase
				.from('onto_tasks')
				.select('*')
				.eq('project_id', id)
				.is('deleted_at', null)
				.order('created_at'),
			supabase
				.from('onto_documents')
				.select('*')
				.eq('project_id', id)
				.is('deleted_at', null)
				.order('created_at'),
			supabase.from('onto_sources').select('*').eq('project_id', id).order('created_at'),
			supabase
				.from('onto_milestones')
				.select('*')
				.eq('project_id', id)
				.is('deleted_at', null)
				.order('due_at', { ascending: true, nullsFirst: false }),
			supabase
				.from('onto_risks')
				.select('*')
				.eq('project_id', id)
				.is('deleted_at', null)
				.order('created_at'),
			supabase.from('onto_metrics').select('*').eq('project_id', id).order('created_at'),
			// OPTIMIZATION: Fetch context document via edge in single query with JOIN
			supabase
				.from('onto_edges')
				.select('dst_id, document:onto_documents!inner(*)')
				.eq('src_kind', 'project')
				.eq('src_id', id)
				.eq('rel', 'has_context_document')
				.eq('dst_kind', 'document')
				.is('document.deleted_at', null)
				.maybeSingle()
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
		if (documentsResult.error) {
			console.error('[Project API] Failed to fetch documents:', documentsResult.error);
		}

		// Extract context document from JOIN result
		// The !inner join creates an aliased property with the table name
		const contextDocument: Document | null = (contextDocResult.data as any)?.document ?? null;

		const { milestones: decoratedMilestones } = await decorateMilestonesWithGoals(
			supabase,
			(goalsResult.data || []) as GoalRow[],
			(milestonesResult.data || []) as MilestoneRow[]
		);

		return ApiResponse.success({
			project,
			goals: goalsResult.data || [],
			requirements: requirementsResult.data || [],
			plans: plansResult.data || [],
			tasks: tasksResult.data || [],
			documents: documentsResult.data || [],
			sources: sourcesResult.data || [],
			milestones: decoratedMilestones,
			risks: risksResult.data || [],
			metrics: metricsResult.data || [],
			context_document: contextDocument
		});
	} catch (err) {
		console.error('[Project API] Unexpected error:', err);
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/projects/${params.id ?? ''}`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'project_get'
		});
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};

const FACET_CONTEXT_VALUES = new Set([
	'personal',
	'client',
	'commercial',
	'internal',
	'open_source',
	'community',
	'academic',
	'nonprofit',
	'startup'
]);
const FACET_SCALE_VALUES = new Set(['micro', 'small', 'medium', 'large', 'epic']);
const FACET_STAGE_VALUES = new Set([
	'discovery',
	'planning',
	'execution',
	'launch',
	'maintenance',
	'complete'
]);

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
			end_at,
			next_step_short,
			next_step_long
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
			end_at !== undefined ||
			next_step_short !== undefined ||
			next_step_long !== undefined;

		if (!hasUpdates) {
			return ApiResponse.badRequest('No update fields provided');
		}

		if (state_key !== undefined) {
			if (typeof state_key !== 'string' || !PROJECT_STATES.includes(state_key)) {
				return ApiResponse.badRequest(
					`state_key must be one of: ${PROJECT_STATES.join(', ')}`
				);
			}
		}

		if (facet_context !== undefined && facet_context !== null) {
			if (typeof facet_context !== 'string' || !FACET_CONTEXT_VALUES.has(facet_context)) {
				return ApiResponse.badRequest('facet_context is invalid');
			}
		}

		if (facet_scale !== undefined && facet_scale !== null) {
			if (typeof facet_scale !== 'string' || !FACET_SCALE_VALUES.has(facet_scale)) {
				return ApiResponse.badRequest('facet_scale is invalid');
			}
		}

		if (facet_stage !== undefined && facet_stage !== null) {
			if (typeof facet_stage !== 'string' || !FACET_STAGE_VALUES.has(facet_stage)) {
				return ApiResponse.badRequest('facet_stage is invalid');
			}
		}

		const supabase = locals.supabase;
		const chatSessionId = getChatSessionIdFromRequest(request);

		// Resolve actor for ownership verification
		const actorResult = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorResult.error || !actorResult.data) {
			console.error('[Project PATCH] Failed to get actor:', actorResult.error);
			await logOntologyApiError({
				supabase,
				error: actorResult.error || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/projects/${id}`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: id,
				entityType: 'project',
				operation: 'project_actor_resolve'
			});
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: id,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Project PATCH] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/projects/${id}`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: id,
				entityType: 'project',
				operation: 'project_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to modify this project');
		}

		// Fetch project to verify existing props
		const { data: existingProject, error: fetchError } = await supabase
			.from('onto_projects')
			.select('*')
			.eq('id', id)
			.is('deleted_at', null)
			.single();

		if (fetchError || !existingProject) {
			return ApiResponse.notFound('Project not found');
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

		// Handle next_step fields - user can manually set/edit these
		if (next_step_short !== undefined || next_step_long !== undefined) {
			// When user sets next step, update both fields and mark source as 'user'
			if (next_step_short !== undefined) {
				updateData.next_step_short =
					typeof next_step_short === 'string' && next_step_short.trim().length > 0
						? next_step_short.trim()
						: null;
			}
			if (next_step_long !== undefined) {
				updateData.next_step_long =
					typeof next_step_long === 'string' && next_step_long.trim().length > 0
						? next_step_long.trim()
						: null;
			}
			// Mark as user-set and update timestamp
			updateData.next_step_source = 'user';
			updateData.next_step_updated_at = new Date().toISOString();
		}

		const { data: updatedProject, error: updateError } = await supabase
			.from('onto_projects')
			.update(updateData)
			.eq('id', id)
			.select('*')
			.single();

		if (updateError || !updatedProject) {
			console.error('[Project PATCH] Failed to update project:', updateError);
			await logOntologyApiError({
				supabase,
				error: updateError || new Error('Project update failed'),
				endpoint: `/api/onto/projects/${id}`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: id,
				entityType: 'project',
				entityId: id,
				operation: 'project_update',
				tableName: 'onto_projects'
			});
			return ApiResponse.error('Failed to update project', 500);
		}

		// Log activity async (non-blocking)
		logUpdateAsync(
			supabase,
			id,
			'project',
			id,
			{
				name: existingProject.name,
				state_key: existingProject.state_key,
				description: existingProject.description
			},
			{
				name: updatedProject.name,
				state_key: updatedProject.state_key,
				description: updatedProject.description
			},
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ project: updatedProject });
	} catch (err) {
		console.error('[Project PATCH] Unexpected error:', err);
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/projects/${params.id ?? ''}`,
			method: 'PATCH',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			entityId: params.id,
			operation: 'project_update'
		});
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

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
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
		const chatSessionId = getChatSessionIdFromRequest(request);

		const actorResult = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorResult.error || !actorResult.data) {
			console.error('[Project DELETE] Failed to get actor:', actorResult.error);
			await logOntologyApiError({
				supabase,
				error: actorResult.error || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/projects/${id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId: id,
				entityType: 'project',
				operation: 'project_actor_resolve'
			});
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: id,
				p_required_access: 'admin'
			}
		);

		if (accessError) {
			console.error('[Project DELETE] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/projects/${id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId: id,
				entityType: 'project',
				operation: 'project_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to delete this project');
		}

		const { data: project, error: fetchError } = await supabase
			.from('onto_projects')
			.select('id, name, type_key')
			.eq('id', id)
			.is('deleted_at', null)
			.single();

		if (fetchError || !project) {
			return ApiResponse.notFound('Project not found');
		}

		const projectDataForLog = { name: project.name, type_key: project.type_key };

		// Determine delete strategy based on environment:
		// - Development: Hard delete (permanent removal for clean dev iterations)
		// - Production: Soft delete (preserve data, set deleted_at timestamp)
		const isProduction = process.env.NODE_ENV === 'production';
		const deleteRpcName = isProduction ? 'soft_delete_onto_project' : 'delete_onto_project';

		const { error: deleteError } = await supabase.rpc(deleteRpcName, {
			p_project_id: id
		});

		if (deleteError) {
			console.error(
				`[Project DELETE] Failed to ${isProduction ? 'soft' : 'hard'} delete project:`,
				deleteError
			);
			await logOntologyApiError({
				supabase,
				error: deleteError,
				endpoint: `/api/onto/projects/${id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId: id,
				entityType: 'project',
				entityId: id,
				operation: 'project_delete',
				tableName: 'onto_projects',
				metadata: { deleteRpcName }
			});
			return ApiResponse.error('Failed to delete project', 500);
		}

		if (deleteRpcName === 'soft_delete_onto_project') {
			// Only log when the project row remains (soft delete) to avoid FK errors.
			logDeleteAsync(
				supabase,
				id,
				'project',
				id,
				projectDataForLog,
				session.user.id,
				getChangeSourceFromRequest(request),
				chatSessionId
			);
		}

		return ApiResponse.success({
			id,
			message: isProduction ? 'Project archived' : 'Project deleted',
			deleteType: isProduction ? 'soft' : 'hard'
		});
	} catch (err) {
		console.error('[Project DELETE] Unexpected error:', err);
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/projects/${params.id ?? ''}`,
			method: 'DELETE',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			entityId: params.id,
			operation: 'project_delete'
		});
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
