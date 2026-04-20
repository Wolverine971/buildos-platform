// apps/web/src/routes/api/onto/goals/create/+server.ts
/**
 * Goal Creation API Endpoint
 *
 * Creates a new goal within the BuildOS ontology system.
 * Goals are strategic objectives with measurement criteria and target dates.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Implementation: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
 *
 * Request Body:
 * - project_id: string (required) - Project UUID
 * - type_key: string (ignored; auto-classified) - Template type key
 * - name: string (required) - Goal name
 * - description?: string - Goal description
 * - target_date?: string - Target date ISO string
 * - measurement_criteria?: string - How success is measured
 * - priority?: 'high' | 'medium' | 'low' - Goal priority
 * - props?: object (ignored; auto-classified)
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/GoalCreateModal.svelte
 * - Plans: /apps/web/src/routes/api/onto/plans/create/+server.ts
 * - Database: onto_goals, onto_edges tables
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
import { GOAL_STATES } from '$lib/types/onto';
import {
	logCreateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { classifyOntologyEntity } from '$lib/server/ontology-classification.service';
import {
	notifyEntityMentionsAdded,
	resolveEntityMentionUserIds
} from '$lib/server/entity-mention-notification.service';
import {
	AutoOrganizeError,
	autoOrganizeConnections,
	assertEntityRefsInProject
} from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import { logOntologyApiError } from '../../shared/error-logging';
import {
	normalizeDateTimeInput,
	normalizeOptionalString,
	normalizeRequiredString,
	normalizeTypeKeyInput
} from '../../shared/input-normalization';

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
			type_key,
			name,
			goal,
			description,
			target_date,
			state_key = 'draft',
			measurement_criteria,
			priority,
			props,
			connections
		} = body;
		const classificationSource = body?.classification_source ?? body?.classificationSource;

		const normalizedProjectId = normalizeRequiredString(project_id, 'Project ID');
		if (!normalizedProjectId.ok) {
			return ApiResponse.badRequest(normalizedProjectId.error);
		}

		const normalizedName = normalizeRequiredString(name, 'Name');
		if (!normalizedName.ok) {
			return ApiResponse.badRequest(normalizedName.error);
		}

		const normalizedTargetDate = normalizeDateTimeInput(target_date, 'target_date', 'end');
		if (!normalizedTargetDate.ok) {
			return ApiResponse.badRequest(normalizedTargetDate.error);
		}

		const projectId = normalizedProjectId.value;
		const goalName = normalizedName.value;
		const goalBody = normalizeOptionalString(goal);
		const goalDescription = normalizeOptionalString(description);
		const goalMeasurementCriteria = normalizeOptionalString(measurement_criteria);
		const goalTargetDate = normalizedTargetDate.value ?? null;
		const goalTypeKey = normalizeTypeKeyInput(type_key, 'goal', 'goal.default');
		const rawGoalStateKey =
			typeof state_key === 'string' && state_key.trim().length > 0
				? state_key.trim()
				: 'draft';
		const incomingProps =
			props && typeof props === 'object' && !Array.isArray(props)
				? (props as Record<string, unknown>)
				: {};

		if (!GOAL_STATES.includes(rawGoalStateKey as (typeof GOAL_STATES)[number])) {
			return ApiResponse.badRequest(`state_key must be one of: ${GOAL_STATES.join(', ')}`);
		}
		const goalStateKey = rawGoalStateKey as (typeof GOAL_STATES)[number];

		// Get user's actor ID
		const { data: actorData, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorData) {
			console.error('Error resolving actor for goal creation:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: '/api/onto/goals/create',
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'goal',
				operation: 'goal_actor_resolve'
			});
			return ApiResponse.internalError(new Error('Failed to get user actor'));
		}

		const actorId = actorData as EnsureActorResponse;

		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, name, created_by')
			.eq('id', projectId)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: projectId,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Goal Create] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: '/api/onto/goals/create',
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'goal',
				operation: 'goal_access_check'
			});
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}

		if (!hasAccess) {
			return ApiResponse.forbidden(
				'You do not have permission to create goals in this project'
			);
		}

		// Create the goal
		const goalData = {
			project_id: projectId,
			type_key: goalTypeKey,
			name: goalName,
			goal: goalBody ?? null,
			description: goalDescription ?? null, // Use dedicated column
			target_date: goalTargetDate, // Use dedicated column
			state_key: goalStateKey,
			created_by: actorId,
			completed_at: goalStateKey === 'achieved' ? new Date().toISOString() : null,
			props: {
				...incomingProps,
				// Maintain backwards compatibility by also storing in props
				goal: goalBody ?? null,
				description: goalDescription ?? null,
				target_date: goalTargetDate,
				measurement_criteria: goalMeasurementCriteria ?? null,
				priority: priority || null
			}
		};

		const { data: createdGoal, error: createError } = await supabase
			.from('onto_goals')
			.insert(goalData)
			.select('*')
			.single();

		if (createError) {
			console.error('Error creating goal:', createError);
			await logOntologyApiError({
				supabase,
				error: createError,
				endpoint: '/api/onto/goals/create',
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'goal',
				entityId: (createdGoal as { id?: string } | null)?.id,
				operation: 'goal_create',
				tableName: 'onto_goals'
			});
			return ApiResponse.databaseError(createError);
		}

		const connectionList: ConnectionRef[] =
			Array.isArray(connections) && connections.length > 0 ? connections : [];

		if (connectionList.length > 0) {
			await assertEntityRefsInProject({
				supabase,
				projectId,
				refs: connectionList,
				allowProject: true
			});
		}

		await autoOrganizeConnections({
			supabase,
			projectId,
			entity: { kind: 'goal', id: createdGoal.id },
			connections: connectionList,
			options: { mode: 'replace' }
		});

		const actorDisplayName =
			(typeof user.name === 'string' && user.name) ||
			user.email?.split('@')[0] ||
			'A teammate';
		const mentionUserIds = await resolveEntityMentionUserIds({
			supabase,
			projectId,
			projectOwnerActorId: project.created_by,
			actorUserId: user.id,
			nextTextValues: [createdGoal.name, createdGoal.goal, createdGoal.description]
		});

		await notifyEntityMentionsAdded({
			supabase,
			projectId,
			projectName: project.name,
			entityType: 'goal',
			entityId: createdGoal.id,
			entityTitle: createdGoal.name,
			actorUserId: user.id,
			actorDisplayName,
			mentionedUserIds: mentionUserIds
		});

		// Log activity async (non-blocking)
		logCreateAsync(
			supabase,
			projectId,
			'goal',
			createdGoal.id,
			{ name: createdGoal.name, type_key: createdGoal.type_key },
			user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		if (classificationSource === 'create_modal') {
			void classifyOntologyEntity({
				entityType: 'goal',
				entityId: createdGoal.id,
				userId: user.id,
				classificationSource: 'create_modal'
			}).catch((err) => {
				if (dev) console.warn('[Goal Create] Classification failed:', err);
			});
		}

		return ApiResponse.created({ goal: createdGoal });
	} catch (error) {
		if (error instanceof AutoOrganizeError) {
			return ApiResponse.error(error.message, error.status);
		}
		console.error('Error in goal create endpoint:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: '/api/onto/goals/create',
			method: 'POST',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'goal',
			operation: 'goal_create'
		});
		return ApiResponse.internalError(error);
	}
};
