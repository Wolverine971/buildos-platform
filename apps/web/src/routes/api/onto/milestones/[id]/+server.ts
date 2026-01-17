// apps/web/src/routes/api/onto/milestones/[id]/+server.ts
/**
 * Milestone CRUD API Endpoints (GET, PATCH, DELETE)
 *
 * Handles read, update, and delete operations for milestones in the ontology system.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Implementation: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
 * - API Patterns: /apps/web/docs/technical/api/PATTERNS.md
 *
 * GET /api/onto/milestones/[id]:
 * - Returns milestone with project ownership verification
 * - Includes state information from props
 *
 * PATCH /api/onto/milestones/[id]:
 * - Updates milestone properties (title, due_at, state_key, etc.)
 * - Maintains props object integrity
 *
 * DELETE /api/onto/milestones/[id]:
 * - Removes milestone and associated edges
 * - Verifies ownership before deletion
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/MilestoneEditModal.svelte
 * - Create Endpoint: /apps/web/src/routes/api/onto/milestones/create/+server.ts
 * - Database: onto_milestones, onto_edges tables
 *
 * Security:
 * - Uses locals.supabase for RLS enforcement
 * - Actor-based authorization
 * - Project ownership verification
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { MILESTONE_STATES } from '$lib/types/onto';
import {
	logUpdateAsync,
	logDeleteAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { normalizeMilestoneStateInput } from '../../shared/milestone-state';
import {
	AutoOrganizeError,
	autoOrganizeConnections,
	assertEntityRefsInProject,
	toParentRefs
} from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import { logOntologyApiError } from '../../shared/error-logging';
import { withComputedMilestoneState } from '$lib/utils/milestone-state';

// GET /api/onto/milestones/[id] - Get a single milestone
export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;

	try {
		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Milestone GET] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/milestones/${params.id}`,
				method: 'GET',
				userId: session.user.id,
				entityType: 'milestone',
				entityId: params.id,
				operation: 'milestone_actor_resolve'
			});
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get milestone with project to verify ownership (exclude soft-deleted)
		const { data: milestone, error } = await supabase
			.from('onto_milestones')
			.select(
				`
				*,
				project:onto_projects!inner(
					id,
					name
				)
			`
			)
			.eq('id', params.id)
			.is('deleted_at', null)
			.single();

		if (error || !milestone) {
			return ApiResponse.notFound('Milestone');
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: milestone.project.id,
				p_required_access: 'read'
			}
		);

		if (accessError) {
			console.error('[Milestone GET] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/milestones/${params.id}`,
				method: 'GET',
				userId: session.user.id,
				projectId: milestone.project_id,
				entityType: 'milestone',
				entityId: params.id,
				operation: 'milestone_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have access to this milestone');
		}

		const decoratedMilestone = withComputedMilestoneState(milestone);

		// Extract project data and include project name in response
		const { project, type_key: _typeKey, ...milestoneData } = decoratedMilestone;

		return ApiResponse.success({
			milestone: { ...milestoneData, project: { name: project.name } }
		});
	} catch (error) {
		console.error('[Milestone GET] Unexpected error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/milestones/${params.id}`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'milestone',
			entityId: params.id,
			operation: 'milestone_get'
		});
		return ApiResponse.internalError(error);
	}
};

// PATCH /api/onto/milestones/[id] - Update a milestone
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		const body = await request.json();
		const {
			title,
			due_at,
			state_key,
			milestone,
			description,
			props,
			goal_id,
			parent,
			parents,
			connections
		} = body;

		// Validate state_key if provided
		const hasStateInput = Object.prototype.hasOwnProperty.call(body, 'state_key');
		const hasDueAtInput = Object.prototype.hasOwnProperty.call(body, 'due_at');
		const normalizedState = normalizeMilestoneStateInput(state_key);
		if (hasStateInput && !normalizedState) {
			return ApiResponse.badRequest(`State must be one of: ${MILESTONE_STATES.join(', ')}`);
		}

		let normalizedDueAt: string | null | undefined = undefined;

		// Validate due_at if provided
		if (hasDueAtInput) {
			if (due_at === null || String(due_at).trim() === '') {
				normalizedDueAt = null;
			} else {
				const dueDate = new Date(due_at);
				if (isNaN(dueDate.getTime())) {
					return ApiResponse.badRequest('Due date must be a valid ISO 8601 date');
				}
				normalizedDueAt = dueDate.toISOString();
			}
		}

		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Milestone PATCH] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/milestones/${params.id}`,
				method: 'PATCH',
				userId: session.user.id,
				entityType: 'milestone',
				entityId: params.id,
				operation: 'milestone_actor_resolve'
			});
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get milestone with project to verify ownership (exclude soft-deleted)
		const { data: existingMilestone, error: fetchError } = await supabase
			.from('onto_milestones')
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

		if (fetchError || !existingMilestone) {
			if (fetchError) {
				await logOntologyApiError({
					supabase,
					error: fetchError,
					endpoint: `/api/onto/milestones/${params.id}`,
					method: 'PATCH',
					userId: session.user.id,
					entityType: 'milestone',
					entityId: params.id,
					operation: 'milestone_fetch',
					tableName: 'onto_milestones'
				});
			}
			return ApiResponse.notFound('Milestone');
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: existingMilestone.project.id,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Milestone PATCH] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/milestones/${params.id}`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: existingMilestone.project_id,
				entityType: 'milestone',
				entityId: params.id,
				operation: 'milestone_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to modify this milestone');
		}

		const explicitParents = toParentRefs({ parent, parents });
		const hasParentField = Object.prototype.hasOwnProperty.call(body, 'parent');
		const hasParentsField = Object.prototype.hasOwnProperty.call(body, 'parents');
		const hasGoalInput = Object.prototype.hasOwnProperty.call(body, 'goal_id');

		let validatedGoalId: string | null = null;

		const invalidParent = explicitParents.find((parentRef) => parentRef.kind !== 'goal');
		if (invalidParent) {
			return ApiResponse.badRequest('Milestones must be linked to a goal');
		}

		if (hasGoalInput) {
			const targetGoalId =
				typeof goal_id === 'string' && goal_id.trim().length > 0 ? goal_id : null;
			if (targetGoalId) {
				validatedGoalId = targetGoalId;
			} else {
				validatedGoalId = null;
			}
		}

		const legacyConnections: ConnectionRef[] = [
			...explicitParents,
			...(validatedGoalId ? [{ kind: 'goal', id: validatedGoalId }] : [])
		];

		const hasConnectionsInput = Array.isArray(connections);
		const connectionList: ConnectionRef[] =
			hasConnectionsInput && connections.length > 0 ? connections : legacyConnections;

		// Build update object
		const updateData: Record<string, unknown> = {};

		if (title !== undefined) {
			if (typeof title !== 'string' || !title.trim()) {
				return ApiResponse.badRequest('Title cannot be empty');
			}
			updateData.title = title.trim();
		}

		if (hasDueAtInput) {
			updateData.due_at = normalizedDueAt ?? null;
		}

		// Update dedicated columns
		if (milestone !== undefined) {
			updateData.milestone = milestone?.trim() || null;
		}
		if (description !== undefined) {
			updateData.description = description?.trim() || null;
		}

		// Handle props update - merge with existing
		const currentProps = (existingMilestone.props as Record<string, unknown>) || {};
		let hasPropsUpdate = false;
		const propsUpdate: Record<string, unknown> = { ...currentProps };

		if (props !== undefined && typeof props === 'object' && props !== null) {
			Object.assign(propsUpdate, props);
			hasPropsUpdate = true;
		}

		// Maintain backwards compatibility by also storing in props
		if (description !== undefined) {
			propsUpdate.description = description?.trim() || null;
			hasPropsUpdate = true;
		}

		if (hasStateInput) {
			const finalState = normalizedState ?? 'pending';
			updateData.state_key = finalState;
			propsUpdate.state_key = finalState;
			hasPropsUpdate = true;
			if (finalState === 'completed' && existingMilestone.state_key !== 'completed') {
				updateData.completed_at = new Date().toISOString();
			} else if (finalState !== 'completed' && existingMilestone.state_key === 'completed') {
				updateData.completed_at = null;
			}
		}

		if (hasPropsUpdate) {
			updateData.props = propsUpdate;
		}

		// Always update updated_at
		updateData.updated_at = new Date().toISOString();

		// Only update if there's something to update
		if (Object.keys(updateData).length === 0) {
			return ApiResponse.badRequest('No valid update fields provided');
		}

		// Update the milestone
		const { data: updatedMilestone, error: updateError } = await supabase
			.from('onto_milestones')
			.update(updateData)
			.eq('id', params.id)
			.select('*')
			.single();

		if (updateError) {
			console.error('[Milestone PATCH] Error updating milestone:', updateError);
			await logOntologyApiError({
				supabase,
				error: updateError,
				endpoint: `/api/onto/milestones/${params.id}`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: existingMilestone.project_id,
				entityType: 'milestone',
				entityId: params.id,
				operation: 'milestone_update',
				tableName: 'onto_milestones'
			});
			return ApiResponse.error('Failed to update milestone', 500);
		}

		const hasContainmentInput =
			hasGoalInput || hasParentField || hasParentsField || hasConnectionsInput;

		if (hasContainmentInput) {
			const hasGoalConnection = connectionList.some(
				(connection) => connection.kind === 'goal'
			);

			if (!hasGoalConnection) {
				return ApiResponse.badRequest(
					'goal_id (or parent goal) is required for milestones'
				);
			}

			await assertEntityRefsInProject({
				supabase,
				projectId: existingMilestone.project_id,
				refs: connectionList,
				allowProject: false
			});

			await autoOrganizeConnections({
				supabase,
				projectId: existingMilestone.project_id,
				entity: { kind: 'milestone', id: params.id },
				connections: connectionList,
				options: { mode: 'replace' }
			});
		}

		// Log activity async (non-blocking)
		logUpdateAsync(
			supabase,
			existingMilestone.project_id,
			'milestone',
			params.id,
			{
				title: existingMilestone.title,
				due_at: existingMilestone.due_at,
				props: existingMilestone.props
			},
			{
				title: updatedMilestone.title,
				due_at: updatedMilestone.due_at,
				props: updatedMilestone.props
			},
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		const { type_key: _typeKey, ...milestonePayload } =
			withComputedMilestoneState(updatedMilestone);

		const goalFromInput = hasContainmentInput
			? (connectionList.find((connection) => connection.kind === 'goal')?.id ?? null)
			: undefined;

		const responseMilestone =
			goalFromInput !== undefined
				? { ...milestonePayload, goal_id: goalFromInput }
				: milestonePayload;

		return ApiResponse.success({ milestone: responseMilestone });
	} catch (error) {
		if (error instanceof AutoOrganizeError) {
			return ApiResponse.error(error.message, error.status);
		}
		console.error('[Milestone PATCH] Unexpected error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/milestones/${params.id}`,
			method: 'PATCH',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'milestone',
			entityId: params.id,
			operation: 'milestone_update'
		});
		return ApiResponse.internalError(error);
	}
};

// DELETE /api/onto/milestones/[id] - Delete a milestone
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Milestone DELETE] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/milestones/${params.id}`,
				method: 'DELETE',
				userId: session.user.id,
				entityType: 'milestone',
				entityId: params.id,
				operation: 'milestone_actor_resolve'
			});
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get milestone with project to verify ownership (exclude already deleted)
		const { data: milestone, error: fetchError } = await supabase
			.from('onto_milestones')
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

		if (fetchError || !milestone) {
			if (fetchError) {
				await logOntologyApiError({
					supabase,
					error: fetchError,
					endpoint: `/api/onto/milestones/${params.id}`,
					method: 'DELETE',
					userId: session.user.id,
					entityType: 'milestone',
					entityId: params.id,
					operation: 'milestone_fetch',
					tableName: 'onto_milestones'
				});
			}
			return ApiResponse.notFound('Milestone');
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: milestone.project.id,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Milestone DELETE] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/milestones/${params.id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId: milestone.project_id,
				entityType: 'milestone',
				entityId: params.id,
				operation: 'milestone_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to delete this milestone');
		}

		const projectId = milestone.project_id;
		const milestoneDataForLog = {
			title: milestone.title,
			due_at: milestone.due_at
		};

		// Soft delete the milestone (set deleted_at timestamp)
		const { error: deleteError } = await supabase
			.from('onto_milestones')
			.update({ deleted_at: new Date().toISOString() })
			.eq('id', params.id);

		if (deleteError) {
			console.error('[Milestone DELETE] Error deleting milestone:', deleteError);
			await logOntologyApiError({
				supabase,
				error: deleteError,
				endpoint: `/api/onto/milestones/${params.id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId,
				entityType: 'milestone',
				entityId: params.id,
				operation: 'milestone_delete',
				tableName: 'onto_milestones'
			});
			return ApiResponse.error('Failed to delete milestone', 500);
		}

		// Log activity async (non-blocking)
		logDeleteAsync(
			supabase,
			projectId,
			'milestone',
			params.id,
			milestoneDataForLog,
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ message: 'Milestone deleted successfully' });
	} catch (error) {
		console.error('[Milestone DELETE] Unexpected error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/milestones/${params.id}`,
			method: 'DELETE',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'milestone',
			entityId: params.id,
			operation: 'milestone_delete'
		});
		return ApiResponse.internalError(error);
	}
};
