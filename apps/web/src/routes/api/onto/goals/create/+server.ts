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
 * - type_key: string (default: 'goal.outcome.project') - Template type key
 * - name: string (required) - Goal name
 * - description?: string - Goal description
 * - target_date?: string - Target date ISO string
 * - measurement_criteria?: string - How success is measured
 * - priority?: 'high' | 'medium' | 'low' - Goal priority
 * - props?: object - Additional properties
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
import { ApiResponse } from '$lib/utils/api-response';
import type { EnsureActorResponse } from '$lib/types/onto-api';
import { logCreateAsync, getChangeSourceFromRequest } from '$lib/services/async-activity-logger';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Check authentication
	const { user } = await locals.safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;

	try {
		// Parse request body
		const body = await request.json();
		const {
			project_id,
			type_key = 'goal.outcome.project',
			name,
			description,
			props = {}
		} = body;

		// Validate required fields
		if (!project_id || !name) {
			return ApiResponse.badRequest('Project ID and name are required');
		}

		// Get user's actor ID
		const { data: actorData, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorData) {
			console.error('Error resolving actor for goal creation:', actorError);
			return ApiResponse.internalError(new Error('Failed to get user actor'));
		}

		const actorId = actorData as EnsureActorResponse;

		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', project_id)
			.eq('created_by', actorId)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		// Create the goal
		const goalData = {
			project_id,
			type_key,
			name,
			created_by: actorId,
			props: {
				...props,
				description: description || null
			}
		};

		const { data: goal, error: createError } = await supabase
			.from('onto_goals')
			.insert(goalData)
			.select('*')
			.single();

		if (createError) {
			console.error('Error creating goal:', createError);
			return ApiResponse.databaseError(createError);
		}

		// Create an edge linking the goal to the project
		await supabase.from('onto_edges').insert({
			project_id: project_id,
			src_id: project_id,
			src_kind: 'project',
			dst_id: goal.id,
			dst_kind: 'goal',
			rel: 'contains'
		});

		// Log activity async (non-blocking)
		logCreateAsync(
			supabase,
			project_id,
			'goal',
			goal.id,
			{ name: goal.name, type_key: goal.type_key },
			actorId,
			getChangeSourceFromRequest(request)
		);

		return ApiResponse.created({ goal });
	} catch (error) {
		console.error('Error in goal create endpoint:', error);
		return ApiResponse.internalError(error);
	}
};
