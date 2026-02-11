// apps/web/src/routes/api/onto/plans/[id]/+server.ts
/**
 * Plan CRUD API Endpoints (GET, PATCH, DELETE)
 *
 * Handles read, update, and delete operations for plans in the ontology system.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Implementation: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
 * - API Patterns: /apps/web/docs/technical/api/PATTERNS.md
 *
 * GET /api/onto/plans/[id]:
 * - Returns plan with template and FSM information
 * - Includes project ownership verification
 *
 * PATCH /api/onto/plans/[id]:
 * - Updates plan properties (name, description, dates, state)
 * - Validates state transitions against FSM
 * - Maintains props object integrity
 *
 * DELETE /api/onto/plans/[id]:
 * - Removes plan and associated edges
 * - Verifies ownership before deletion
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/PlanEditModal.svelte
 * - Create Endpoint: /apps/web/src/routes/api/onto/plans/create/+server.ts
 * - Database: onto_plans, onto_edges tables
 *
 * Security:
 * - Uses locals.supabase for RLS enforcement
 * - Actor-based authorization
 * - Project ownership verification
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { PLAN_STATES } from '$lib/types/onto';
import {
	logUpdateAsync,
	logDeleteAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import {
	AutoOrganizeError,
	autoOrganizeConnections,
	assertEntityRefsInProject,
	toParentRefs
} from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import type { EntityKind } from '$lib/services/ontology/edge-direction';
import { logOntologyApiError } from '../../shared/error-logging';

// GET /api/onto/plans/[id] - Get a single plan
export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;

	try {
		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Plan GET] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/plans/${params.id}`,
				method: 'GET',
				userId: session.user.id,
				entityType: 'plan',
				entityId: params.id,
				operation: 'plan_actor_resolve'
			});
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get plan with project to verify ownership (exclude soft-deleted)
		const { data: plan, error } = await supabase
			.from('onto_plans')
			.select(
				`
				*,
				project:onto_projects!inner(
					id
				)
			`
			)
			.eq('id', params.id)
			.is('deleted_at', null)
			.single();

		if (error || !plan) {
			return ApiResponse.error('Plan not found', 404);
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: plan.project.id,
				p_required_access: 'read'
			}
		);

		if (accessError) {
			console.error('[Plan GET] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/plans/${params.id}`,
				method: 'GET',
				userId: session.user.id,
				projectId: plan.project_id,
				entityType: 'plan',
				entityId: params.id,
				operation: 'plan_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.error('Access denied', 403);
		}

		// Remove nested project data from response
		const { project: _project, ...planData } = plan;

		return ApiResponse.success({ plan: planData });
	} catch (error) {
		console.error('Error fetching plan:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/plans/${params.id}`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'plan',
			entityId: params.id,
			operation: 'plan_get'
		});
		return ApiResponse.error('Internal server error', 500);
	}
};

// PATCH /api/onto/plans/[id] - Update a plan
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		const body = await request.json();
		const {
			name,
			plan,
			description,
			start_date,
			end_date,
			state_key,
			props,
			goal_id,
			milestone_id,
			parent,
			parents,
			connections
		} = body;

		if (state_key !== undefined && !PLAN_STATES.includes(state_key)) {
			return ApiResponse.badRequest(`state_key must be one of: ${PLAN_STATES.join(', ')}`);
		}

		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Plan PATCH] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/plans/${params.id}`,
				method: 'PATCH',
				userId: session.user.id,
				entityType: 'plan',
				entityId: params.id,
				operation: 'plan_actor_resolve'
			});
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get plan with project to verify ownership (exclude soft-deleted)
		const { data: existingPlan, error: fetchError } = await supabase
			.from('onto_plans')
			.select(
				`
				*,
				project:onto_projects!inner(
					id
				)
			`
			)
			.eq('id', params.id)
			.is('deleted_at', null)
			.single();

		if (fetchError || !existingPlan) {
			if (fetchError) {
				await logOntologyApiError({
					supabase,
					error: fetchError,
					endpoint: `/api/onto/plans/${params.id}`,
					method: 'PATCH',
					userId: session.user.id,
					entityType: 'plan',
					entityId: params.id,
					operation: 'plan_fetch',
					tableName: 'onto_plans'
				});
			}
			return ApiResponse.error('Plan not found', 404);
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: existingPlan.project.id,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Plan PATCH] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/plans/${params.id}`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: existingPlan.project_id,
				entityType: 'plan',
				entityId: params.id,
				operation: 'plan_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.error('Access denied', 403);
		}

		const explicitParents = toParentRefs({ parent, parents });
		const hasParentField = Object.prototype.hasOwnProperty.call(body, 'parent');
		const hasParentsField = Object.prototype.hasOwnProperty.call(body, 'parents');
		const hasGoalInput = Object.prototype.hasOwnProperty.call(body, 'goal_id');
		const hasMilestoneInput = Object.prototype.hasOwnProperty.call(body, 'milestone_id');

		let validatedGoalId: string | null = null;
		let validatedMilestoneId: string | null = null;
		let normalizedMilestoneId: string | null | undefined = undefined;
		let normalizedGoalId: string | null | undefined = undefined;

		const invalidParent = explicitParents.find(
			(parentRef) => !['project', 'goal', 'milestone'].includes(parentRef.kind)
		);
		if (invalidParent) {
			return ApiResponse.badRequest(`Unsupported parent kind: ${invalidParent.kind}`);
		}

		if (hasGoalInput) {
			normalizedGoalId =
				typeof goal_id === 'string' && goal_id.trim().length > 0 ? goal_id : null;
			if (normalizedGoalId) {
				validatedGoalId = normalizedGoalId;
			} else {
				validatedGoalId = null;
			}
		}

		if (hasMilestoneInput) {
			normalizedMilestoneId =
				typeof milestone_id === 'string' && milestone_id.trim().length > 0
					? milestone_id
					: null;
			if (normalizedMilestoneId) {
				validatedMilestoneId = normalizedMilestoneId;
			} else {
				validatedMilestoneId = null;
			}
		}

		const legacyConnections: ConnectionRef[] = [
			...explicitParents,
			...(validatedGoalId ? [{ kind: 'goal' as const, id: validatedGoalId }] : []),
			...(validatedMilestoneId ? [{ kind: 'milestone' as const, id: validatedMilestoneId }] : [])
		];

		const hasConnectionsInput = Array.isArray(connections);
		const connectionList: ConnectionRef[] =
			hasConnectionsInput && connections.length > 0 ? connections : legacyConnections;

		if (connectionList.length > 0) {
			await assertEntityRefsInProject({
				supabase,
				projectId: existingPlan.project_id,
				refs: connectionList,
				allowProject: true
			});
		}

		// Build update object
		const updateData: Record<string, unknown> = {
			updated_at: new Date().toISOString()
		};

		if (name !== undefined) updateData.name = name;
		if (state_key !== undefined) updateData.state_key = state_key;

		if (plan !== undefined) {
			updateData.plan = plan || null;
		}

		// Update description in dedicated column
		if (description !== undefined) {
			updateData.description = description || null;
		}

		// Handle props update - merge with existing
		const propsUpdate: Record<string, unknown> = {
			...(existingPlan.props as Record<string, unknown>)
		};
		let hasPropsUpdate = false;

		if (props !== undefined && typeof props === 'object' && props !== null) {
			Object.assign(propsUpdate, props);
			hasPropsUpdate = true;
		}

		// Maintain backwards compatibility by also storing in props
		if (plan !== undefined) {
			propsUpdate.plan = plan || null;
			hasPropsUpdate = true;
		}
		if (description !== undefined) {
			propsUpdate.description = description || null;
			hasPropsUpdate = true;
		}
		if (start_date !== undefined) {
			propsUpdate.start_date = start_date || null;
			hasPropsUpdate = true;
		}
		if (end_date !== undefined) {
			propsUpdate.end_date = end_date || null;
			hasPropsUpdate = true;
		}

		if (hasPropsUpdate) {
			updateData.props = propsUpdate;
		}

		// Update the plan
		const { data: updatedPlan, error: updateError } = await supabase
			.from('onto_plans')
			.update(updateData)
			.eq('id', params.id)
			.select('*')
			.single();

		if (updateError) {
			console.error('Error updating plan:', updateError);
			await logOntologyApiError({
				supabase,
				error: updateError,
				endpoint: `/api/onto/plans/${params.id}`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: existingPlan.project_id,
				entityType: 'plan',
				entityId: params.id,
				operation: 'plan_update',
				tableName: 'onto_plans'
			});
			return ApiResponse.error('Failed to update plan', 500);
		}

		const hasContainmentInput =
			hasGoalInput ||
			hasMilestoneInput ||
			hasParentField ||
			hasParentsField ||
			hasConnectionsInput;
		const shouldOrganize = hasContainmentInput;

		if (shouldOrganize) {
			const explicitKinds: EntityKind[] = [];
			if (hasConnectionsInput) {
				explicitKinds.push('goal');
			} else if (hasGoalInput) {
				explicitKinds.push('goal');
			}

			await autoOrganizeConnections({
				supabase,
				projectId: existingPlan.project_id,
				entity: { kind: 'plan', id: params.id },
				connections: connectionList,
				options: {
					mode: 'replace',
					explicitKinds
				}
			});
		}

		// Log activity async (non-blocking)
		logUpdateAsync(
			supabase,
			existingPlan.project_id,
			'plan',
			params.id,
			{
				name: existingPlan.name,
				state_key: existingPlan.state_key,
				props: existingPlan.props
			},
			{ name: updatedPlan.name, state_key: updatedPlan.state_key, props: updatedPlan.props },
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ plan: updatedPlan });
	} catch (error) {
		if (error instanceof AutoOrganizeError) {
			return ApiResponse.error(error.message, error.status);
		}
		console.error('Error updating plan:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/plans/${params.id}`,
			method: 'PATCH',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'plan',
			entityId: params.id,
			operation: 'plan_update'
		});
		return ApiResponse.error('Internal server error', 500);
	}
};

// DELETE /api/onto/plans/[id] - Delete a plan
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Plan DELETE] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/plans/${params.id}`,
				method: 'DELETE',
				userId: session.user.id,
				entityType: 'plan',
				entityId: params.id,
				operation: 'plan_actor_resolve'
			});
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get plan with project to verify ownership (exclude already deleted)
		const { data: plan, error: fetchError } = await supabase
			.from('onto_plans')
			.select(
				`
				*,
				project:onto_projects!inner(
					id
				)
			`
			)
			.eq('id', params.id)
			.is('deleted_at', null)
			.single();

		if (fetchError || !plan) {
			if (fetchError) {
				await logOntologyApiError({
					supabase,
					error: fetchError,
					endpoint: `/api/onto/plans/${params.id}`,
					method: 'DELETE',
					userId: session.user.id,
					entityType: 'plan',
					entityId: params.id,
					operation: 'plan_fetch',
					tableName: 'onto_plans'
				});
			}
			return ApiResponse.error('Plan not found', 404);
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: plan.project.id,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Plan DELETE] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/plans/${params.id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId: plan.project_id,
				entityType: 'plan',
				entityId: params.id,
				operation: 'plan_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.error('Access denied', 403);
		}

		const projectId = plan.project_id;
		const planDataForLog = {
			name: plan.name,
			type_key: plan.type_key,
			state_key: plan.state_key
		};

		// Soft delete the plan (set deleted_at timestamp)
		const { error: deleteError } = await supabase
			.from('onto_plans')
			.update({ deleted_at: new Date().toISOString() })
			.eq('id', params.id);

		if (deleteError) {
			console.error('Error deleting plan:', deleteError);
			await logOntologyApiError({
				supabase,
				error: deleteError,
				endpoint: `/api/onto/plans/${params.id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId,
				entityType: 'plan',
				entityId: params.id,
				operation: 'plan_delete',
				tableName: 'onto_plans'
			});
			return ApiResponse.error('Failed to delete plan', 500);
		}

		// Log activity async (non-blocking)
		logDeleteAsync(
			supabase,
			projectId,
			'plan',
			params.id,
			planDataForLog,
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ message: 'Plan deleted successfully' });
	} catch (error) {
		console.error('Error deleting plan:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/plans/${params.id}`,
			method: 'DELETE',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'plan',
			entityId: params.id,
			operation: 'plan_delete'
		});
		return ApiResponse.error('Internal server error', 500);
	}
};
