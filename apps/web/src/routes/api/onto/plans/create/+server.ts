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
 * - type_key: string (default: 'plan.basic') - Template type key
 * - name: string (required) - Plan name
 * - description?: string - Plan description
 * - state_key?: string - Initial state (draft, planning, active, etc.)
 * - start_date?: string - Start date ISO string
 * - end_date?: string - End date ISO string
 * - props?: object - Additional properties
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
import { ApiResponse } from '$lib/utils/api-response';

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
			type_key = 'plan.basic',
			name,
			description,
			state_key = 'draft',
			start_date,
			end_date,
			props = {}
		} = body;

		// Validate required fields
		if (!project_id || !name) {
			return ApiResponse.badRequest('Project ID and name are required');
		}

		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId) {
			console.error('Error resolving actor for plan creation:', actorError);
			return ApiResponse.internalError(new Error('Failed to get user actor'));
		}

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

		// Create the plan
		const planData = {
			project_id,
			type_key,
			name,
			state_key,
			created_by: actorId,
			props: {
				...props,
				description: description || null,
				start_date: start_date || null,
				end_date: end_date || null
			}
		};

		const { data: plan, error: createError } = await supabase
			.from('onto_plans')
			.insert(planData)
			.select('*')
			.single();

		if (createError) {
			console.error('Error creating plan:', createError);
			return ApiResponse.databaseError(createError);
		}

		// Create an edge linking the plan to the project
		await supabase.from('onto_edges').insert({
			src_id: project_id,
			src_kind: 'project',
			dst_id: plan.id,
			dst_kind: 'plan',
			rel: 'contains'
		});

		return ApiResponse.created({ plan });
	} catch (error) {
		console.error('Error in plan create endpoint:', error);
		return ApiResponse.internalError(error);
	}
};
