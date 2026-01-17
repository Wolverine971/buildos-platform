// apps/web/src/routes/api/onto/milestones/create/+server.ts
/**
 * Milestone Creation API Endpoint
 *
 * Creates a new milestone within the BuildOS ontology system.
 * Milestones represent key dates and deliverable checkpoints in projects.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Implementation: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
 *
 * Request Body:
 * - project_id: string (required) - Project UUID
 * - title: string (required) - Milestone title
 * - due_at: string (required) - ISO 8601 date/timestamp
 * - state_key?: string - Initial state (default: 'pending')
 * - description?: string - Detailed description
 * - props?: object (ignored; auto-classified)
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/MilestoneCreateModal.svelte
 * - Risks: /apps/web/src/routes/api/onto/risks/create/+server.ts
 * - Database: onto_milestones, onto_edges tables
 *
 * Security:
 * - Uses locals.supabase for RLS enforcement
 * - Actor-based authorization
 * - Project ownership verification
 */
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { ApiResponse } from '$lib/utils/api-response';
import type { EnsureActorResponse } from '$lib/types/onto-api';
import {
	logCreateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { MILESTONE_STATES } from '$lib/types/onto';
import { normalizeMilestoneStateInput } from '../../shared/milestone-state';
import { classifyOntologyEntity } from '$lib/server/ontology-classification.service';
import {
	AutoOrganizeError,
	autoOrganizeConnections,
	assertEntityRefsInProject,
	toParentRefs
} from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import { logOntologyApiError } from '../../shared/error-logging';
import { withComputedMilestoneState } from '$lib/utils/milestone-state';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Check authentication
	const { user } = await locals.safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		// Parse request body
		const body = await request.json();
		const {
			project_id,
			title,
			milestone,
			due_at,
			state_key,
			description,
			goal_id,
			parent,
			parents,
			connections
		} = body;
		const classificationSource = body?.classification_source ?? body?.classificationSource;

		// Validate required fields
		if (!project_id) {
			return ApiResponse.badRequest('Project ID is required');
		}

		if (!title || typeof title !== 'string' || !title.trim()) {
			return ApiResponse.badRequest('Milestone title is required');
		}

		let dueDateIso: string | null = null;
		if (due_at !== undefined && due_at !== null && String(due_at).trim() !== '') {
			const dueDate = new Date(due_at);
			if (isNaN(dueDate.getTime())) {
				return ApiResponse.badRequest('Due date must be a valid ISO 8601 date');
			}
			dueDateIso = dueDate.toISOString();
		}

		const hasStateInput = Object.prototype.hasOwnProperty.call(body, 'state_key');
		const normalizedState = normalizeMilestoneStateInput(state_key);
		if (hasStateInput && !normalizedState) {
			return ApiResponse.badRequest(`State must be one of: ${MILESTONE_STATES.join(', ')}`);
		}
		const finalState = normalizedState ?? 'pending';

		// Get user's actor ID
		const { data: actorData, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorData) {
			console.error('[Milestone Create] Error resolving actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: '/api/onto/milestones/create',
				method: 'POST',
				userId: user.id,
				projectId: project_id,
				entityType: 'milestone',
				operation: 'milestone_actor_resolve'
			});
			return ApiResponse.internalError(new Error('Failed to get user actor'));
		}

		const actorId = actorData as EnsureActorResponse;

		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', project_id)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: project_id,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Milestone Create] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: '/api/onto/milestones/create',
				method: 'POST',
				userId: user.id,
				projectId: project_id,
				entityType: 'milestone',
				operation: 'milestone_access_check'
			});
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}

		if (!hasAccess) {
			return ApiResponse.forbidden(
				'You do not have permission to create milestones in this project'
			);
		}

		let validatedGoalId: string | null = null;
		const explicitParents = toParentRefs({ parent, parents });
		const normalizedGoalId =
			typeof goal_id === 'string' && goal_id.trim().length > 0 ? goal_id : null;

		const invalidParent = explicitParents.find((parentRef) => parentRef.kind !== 'goal');
		if (invalidParent) {
			return ApiResponse.badRequest('Milestones must be linked to a goal');
		}

		if (normalizedGoalId) {
			validatedGoalId = normalizedGoalId;
		}

		const legacyConnections: ConnectionRef[] = [
			...explicitParents,
			...(validatedGoalId ? [{ kind: 'goal', id: validatedGoalId }] : [])
		];

		const connectionList: ConnectionRef[] =
			Array.isArray(connections) && connections.length > 0 ? connections : legacyConnections;

		const hasGoalConnection = connectionList.some((connection) => connection.kind === 'goal');

		if (!hasGoalConnection) {
			return ApiResponse.badRequest('goal_id (or parent goal) is required for milestones');
		}

		await assertEntityRefsInProject({
			supabase,
			projectId: project_id,
			refs: connectionList,
			allowProject: false
		});

		// Create the milestone
		const milestoneData = {
			project_id,
			type_key: 'milestone.default',
			title: title.trim(),
			milestone: milestone?.trim() || null,
			due_at: dueDateIso,
			state_key: finalState,
			description: description?.trim() || null, // Use dedicated column
			created_by: actorId,
			props: {
				// Maintain backwards compatibility by also storing in props
				description: description?.trim() || null,
				state_key: finalState
			}
		};

		const { data: createdMilestone, error: createError } = await supabase
			.from('onto_milestones')
			.insert(milestoneData)
			.select('*')
			.single();

		if (createError) {
			console.error('[Milestone Create] Error creating milestone:', createError);
			await logOntologyApiError({
				supabase,
				error: createError,
				endpoint: '/api/onto/milestones/create',
				method: 'POST',
				userId: user.id,
				projectId: project_id,
				entityType: 'milestone',
				entityId: createdMilestone?.id,
				operation: 'milestone_create',
				tableName: 'onto_milestones'
			});
			return ApiResponse.databaseError(createError);
		}

		await autoOrganizeConnections({
			supabase,
			projectId: project_id,
			entity: { kind: 'milestone', id: createdMilestone.id },
			connections: connectionList,
			options: { mode: 'replace' }
		});

		// Log activity async (non-blocking)
		logCreateAsync(
			supabase,
			project_id,
			'milestone',
			createdMilestone.id,
			{
				title: createdMilestone.title,
				due_at: createdMilestone.due_at
			},
			user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		if (classificationSource === 'create_modal') {
			void classifyOntologyEntity({
				entityType: 'milestone',
				entityId: createdMilestone.id,
				userId: user.id,
				classificationSource: 'create_modal'
			}).catch((err) => {
				if (dev) console.warn('[Milestone Create] Classification failed:', err);
			});
		}

		const goalIdForResponse =
			connectionList.find((connection) => connection.kind === 'goal')?.id ?? null;

		const { type_key: _typeKey, ...milestonePayload } =
			withComputedMilestoneState(createdMilestone);

		return ApiResponse.created({
			milestone: {
				...milestonePayload,
				goal_id: goalIdForResponse
			}
		});
	} catch (error) {
		if (error instanceof AutoOrganizeError) {
			return ApiResponse.error(error.message, error.status);
		}
		console.error('[Milestone Create] Unexpected error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: '/api/onto/milestones/create',
			method: 'POST',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'milestone',
			operation: 'milestone_create'
		});
		return ApiResponse.internalError(error);
	}
};
