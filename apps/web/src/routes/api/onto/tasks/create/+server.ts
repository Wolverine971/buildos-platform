// apps/web/src/routes/api/onto/tasks/create/+server.ts
/**
 * Task Creation API Endpoint
 *
 * Creates a new task within the BuildOS ontology system.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Implementation: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
 * - API Patterns: /apps/web/docs/technical/api/PATTERNS.md
 *
 * Request Body:
 * - project_id: string (required) - Project UUID
 * - type_key: string (default: 'task.basic') - Template type key
 * - title: string (required) - Task title
 * - description?: string - Task description
 * - priority?: number (1-5) - Task priority
 * - plan_id?: string - Associated plan UUID
 * - state_key?: string - Initial state
 * - due_at?: string - Due date ISO string
 * - props?: object - Additional properties
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/TaskCreateModal.svelte
 * - Update/Delete: /apps/web/src/routes/api/onto/tasks/[id]/+server.ts
 * - Database Schema: onto_tasks table
 *
 * Security:
 * - Uses locals.supabase for RLS enforcement
 * - Requires authenticated user with actor
 * - Verifies project ownership
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { EnsureActorResponse } from '$lib/types/onto-api';

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
			type_key = 'task.basic',
			title,
			description,
			priority = 3,
			plan_id,
			state_key = 'todo',
			props = {}
		} = body;

		// Validate required fields
		if (!project_id || !title) {
			return ApiResponse.badRequest('Project ID and title are required');
		}

		// Get user's actor ID
		const { data: actorData, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorData) {
			console.error('Error resolving actor for task creation:', actorError);
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

		// If plan_id is provided, verify it belongs to the project
		if (plan_id) {
			const { data: plan, error: planError } = await supabase
				.from('onto_plans')
				.select('id')
				.eq('id', plan_id)
				.eq('project_id', project_id)
				.single();

			if (planError || !plan) {
				return ApiResponse.notFound('Plan');
			}
		}

		// Create the task
		const taskData = {
			project_id,
			type_key,
			title,
			state_key,
			priority,
			plan_id: plan_id || null,
			created_by: actorId,
			props: {
				...props,
				description: description || null
			}
		};

		const { data: task, error: createError } = await supabase
			.from('onto_tasks')
			.insert(taskData)
			.select('*')
			.single();

		if (createError) {
			console.error('Error creating task:', createError);
			return ApiResponse.databaseError(createError);
		}

		// Create an edge linking the task to the project
		await supabase.from('onto_edges').insert({
			src_id: project_id,
			src_kind: 'project',
			dst_id: task.id,
			dst_kind: 'task',
			rel: 'contains'
		});

		return ApiResponse.created({ task });
	} catch (error) {
		console.error('Error in task create endpoint:', error);
		return ApiResponse.internalError(error);
	}
};
