// apps/web/src/routes/api/onto/plans/create/+server.ts
/**
 * Plan Creation API Endpoint
 *
 * Creates a new plan within the BuildOS ontology system.
 * Plans are logical groupings of tasks with optional date ranges.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Implementation: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
 *
 * Request Body:
 * - project_id: string (required) - Project UUID
 * - type_key: string (ignored; auto-classified) - Template type key
 * - name: string (required) - Plan name
 * - description?: string - Plan description
 * - state_key?: string - Initial state (draft, active, completed)
 * - start_date?: string - Start date ISO string
 * - end_date?: string - End date ISO string
 * - props?: object (ignored; auto-classified)
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/PlanCreateModal.svelte
 * - Task Association: /apps/web/src/routes/api/onto/tasks/create/+server.ts
 * - Database: onto_plans, onto_edges tables
 *
 * Security:
 * - Uses locals.supabase for RLS enforcement
 * - Actor-based authorization
 * - Project ownership verification
 */
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { ApiResponse } from '$lib/utils/api-response';
import { PLAN_STATES } from '$lib/types/onto';
import {
	logCreateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { classifyOntologyEntity } from '$lib/server/ontology-classification.service';
import {
	AutoOrganizeError,
	autoOrganizeConnections,
	assertEntityRefsInProject,
	toParentRefs
} from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import { logOntologyApiError } from '../../shared/error-logging';

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
			name,
			plan,
			description,
			state_key = 'draft',
			start_date,
			end_date,
			goal_id,
			milestone_id,
			parent,
			parents,
			connections
		} = body;
		const classificationSource = body?.classification_source ?? body?.classificationSource;

		// Validate required fields
		if (!project_id || !name) {
			return ApiResponse.badRequest('Project ID and name are required');
		}

		if (state_key && !PLAN_STATES.includes(state_key)) {
			return ApiResponse.badRequest(`state_key must be one of: ${PLAN_STATES.join(', ')}`);
		}

		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId) {
			console.error('Error resolving actor for plan creation:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: '/api/onto/plans/create',
				method: 'POST',
				userId: user.id,
				projectId: project_id,
				entityType: 'plan',
				operation: 'plan_actor_resolve'
			});
			return ApiResponse.internalError(new Error('Failed to get user actor'));
		}

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
			console.error('[Plan Create] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: '/api/onto/plans/create',
				method: 'POST',
				userId: user.id,
				projectId: project_id,
				entityType: 'plan',
				operation: 'plan_access_check'
			});
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}

		if (!hasAccess) {
			return ApiResponse.forbidden(
				'You do not have permission to create plans in this project'
			);
		}

		// Validate optional goal or milestone parent
		let validatedGoalId: string | null = null;
		let validatedMilestoneId: string | null = null;
		const explicitParents = toParentRefs({ parent, parents });
		const normalizedGoalId =
			typeof goal_id === 'string' && goal_id.trim().length > 0 ? goal_id : null;
		const normalizedMilestoneId =
			typeof milestone_id === 'string' && milestone_id.trim().length > 0
				? milestone_id
				: null;

		const invalidParent = explicitParents.find(
			(parentRef) => !['project', 'goal', 'milestone'].includes(parentRef.kind)
		);
		if (invalidParent) {
			return ApiResponse.badRequest(`Unsupported parent kind: ${invalidParent.kind}`);
		}

		if (normalizedGoalId) {
			validatedGoalId = normalizedGoalId;
		}
		if (normalizedMilestoneId) {
			validatedMilestoneId = normalizedMilestoneId;
		}

		const legacyConnections: ConnectionRef[] = [
			...explicitParents,
			...(validatedGoalId ? [{ kind: 'goal', id: validatedGoalId }] : []),
			...(validatedMilestoneId ? [{ kind: 'milestone', id: validatedMilestoneId }] : [])
		];

		const connectionList: ConnectionRef[] =
			Array.isArray(connections) && connections.length > 0 ? connections : legacyConnections;

		if (connectionList.length > 0) {
			await assertEntityRefsInProject({
				supabase,
				projectId: project_id,
				refs: connectionList,
				allowProject: true
			});
		}

		// Create the plan
		const planData = {
			project_id,
			type_key: 'plan.default',
			name,
			state_key,
			plan: plan || null,
			description: description || null, // Use dedicated column
			created_by: actorId,
			props: {
				// Maintain backwards compatibility by also storing in props
				plan: plan || null,
				description: description || null,
				start_date: start_date || null,
				end_date: end_date || null
			}
		};

		const { data: createdPlan, error: createError } = await supabase
			.from('onto_plans')
			.insert(planData)
			.select('*')
			.single();

		if (createError) {
			console.error('Error creating plan:', createError);
			await logOntologyApiError({
				supabase,
				error: createError,
				endpoint: '/api/onto/plans/create',
				method: 'POST',
				userId: user.id,
				projectId: project_id,
				entityType: 'plan',
				entityId: createdPlan?.id,
				operation: 'plan_create',
				tableName: 'onto_plans'
			});
			return ApiResponse.databaseError(createError);
		}

		await autoOrganizeConnections({
			supabase,
			projectId: project_id,
			entity: { kind: 'plan', id: createdPlan.id },
			connections: connectionList,
			options: { mode: 'replace' }
		});

		// Log activity async (non-blocking)
		logCreateAsync(
			supabase,
			project_id,
			'plan',
			createdPlan.id,
			{
				name: createdPlan.name,
				type_key: createdPlan.type_key,
				state_key: createdPlan.state_key
			},
			user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		if (classificationSource === 'create_modal') {
			void classifyOntologyEntity({
				entityType: 'plan',
				entityId: createdPlan.id,
				userId: user.id,
				classificationSource: 'create_modal'
			}).catch((err) => {
				if (dev) console.warn('[Plan Create] Classification failed:', err);
			});
		}

		return ApiResponse.created({ plan: createdPlan });
	} catch (error) {
		if (error instanceof AutoOrganizeError) {
			return ApiResponse.error(error.message, error.status);
		}
		console.error('Error in plan create endpoint:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: '/api/onto/plans/create',
			method: 'POST',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'plan',
			operation: 'plan_create'
		});
		return ApiResponse.internalError(error);
	}
};
