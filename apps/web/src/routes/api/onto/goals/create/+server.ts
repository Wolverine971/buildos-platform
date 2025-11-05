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
 * - type_key: string (default: 'goal.basic') - Template type key
 * - name: string (required) - Goal name
 * - description?: string - Goal description
 * - state_key?: string - Initial state (draft, active, achieved, etc.)
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

export const POST: RequestHandler = async ({ request, locals }) => {
	// Check authentication
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;

	try {
		// Parse request body
		const body = await request.json();
		const {
			project_id,
			type_key = 'goal.basic',
			name,
			description,
			state_key = 'draft',
			props = {}
		} = body;

		// Validate required fields
		if (!project_id || !name) {
			return ApiResponse.error('Project ID and name are required', 400);
		}

		// Get user's actor ID
		const { data: actor } = await supabase
			.rpc('ensure_actor_for_user', {
				p_user_id: session.user.id
			})
			.single();

		if (!actor) {
			return ApiResponse.error('Failed to get user actor', 500);
		}

		const actorId = (actor as any).actor_id;

		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', project_id)
			.eq('created_by', actorId)
			.single();

		if (projectError || !project) {
			return ApiResponse.error('Project not found or access denied', 404);
		}

		// Create the goal
		const goalData = {
			project_id,
			type_key,
			name,
			state_key,
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
			return ApiResponse.error('Failed to create goal', 500);
		}

		// Create an edge linking the goal to the project
		await supabase.from('onto_edges').insert({
			src_id: project_id,
			src_kind: 'project',
			dst_id: goal.id,
			dst_kind: 'goal',
			rel: 'contains'
		});

		return ApiResponse.success({ goal }, 201);
	} catch (error) {
		console.error('Error in goal create endpoint:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};
