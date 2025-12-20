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
 * - title: string (required) - Task title
 * - description?: string - Task description (stored in column)
 * - priority?: number (1-5) - Task priority
 * - plan_id?: string - Associated plan UUID (creates edge relationship)
 * - type_key?: string (default: 'task.execute') - Task type (e.g., task.create, task.review)
 * - state_key?: string (default: 'todo') - Initial state
 * - start_at?: string - Start date ISO string (when work should begin)
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
			title,
			description,
			priority = 3,
			plan_id,
			state_key = 'todo',
			type_key,
			props = {},
			goal_id,
			supporting_milestone_id,
			start_at,
			due_at
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

		// Validate optional goal and milestone relationships
		let validatedGoalId: string | null = null;
		let validatedMilestoneId: string | null = null;

		if (goal_id) {
			const { data: goal, error: goalError } = await supabase
				.from('onto_goals')
				.select('id')
				.eq('id', goal_id)
				.eq('project_id', project_id)
				.single();

			if (goalError || !goal) {
				return ApiResponse.notFound('Goal');
			}
			validatedGoalId = goal.id;
		}

		if (supporting_milestone_id) {
			const { data: milestone, error: milestoneError } = await supabase
				.from('onto_milestones')
				.select('id')
				.eq('id', supporting_milestone_id)
				.eq('project_id', project_id)
				.single();

			if (milestoneError || !milestone) {
				return ApiResponse.notFound('Milestone');
			}
			validatedMilestoneId = milestone.id;
		}

		// Create the task
		// Description is now a proper column (not just in props)
		// completed_at is auto-set when state_key is 'done'
		const taskData: Record<string, unknown> = {
			project_id,
			title,
			description: description || null,
			type_key: type_key || 'task.execute',
			state_key,
			priority,
			start_at: start_at || null,
			due_at: due_at || null,
			created_by: actorId,
			props: {
				...props,
				// Keep goal_id and milestone_id in props for edge reference
				...(validatedGoalId ? { goal_id: validatedGoalId } : {}),
				...(validatedMilestoneId ? { supporting_milestone_id: validatedMilestoneId } : {})
			}
		};

		// Auto-set completed_at when creating a task as done
		if (state_key === 'done') {
			taskData.completed_at = new Date().toISOString();
		}

		const { data: task, error: createError } = await supabase
			.from('onto_tasks')
			.insert(taskData)
			.select('*')
			.single();

		if (createError) {
			console.error('Error creating task:', createError);
			return ApiResponse.databaseError(createError);
		}

		// Create edges linking the task to the project, plan (if any), goal, and milestone
		// All edges include project_id for efficient project-scoped queries
		// See: docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md
		const edges = [
			{
				src_id: project_id,
				src_kind: 'project',
				dst_id: task.id,
				dst_kind: 'task',
				rel: 'contains',
				project_id: project_id
			}
		];

		// Plan relationship via edge (plan_id is no longer a column on onto_tasks)
		// Convention: Store directionally (plan → task), query bidirectionally
		if (plan_id) {
			edges.push({
				src_id: plan_id,
				src_kind: 'plan',
				dst_id: task.id,
				dst_kind: 'task',
				rel: 'has_task',
				project_id: project_id
			});
		}

		if (validatedGoalId) {
			edges.push({
				src_id: validatedGoalId,
				src_kind: 'goal',
				dst_id: task.id,
				dst_kind: 'task',
				rel: 'supports_goal',
				project_id: project_id
			});
		}

		if (validatedMilestoneId) {
			edges.push({
				src_id: validatedMilestoneId,
				src_kind: 'milestone',
				dst_id: task.id,
				dst_kind: 'task',
				rel: 'contains',
				project_id: project_id
			});
		}

		await supabase.from('onto_edges').insert(edges);

		// Log activity async (non-blocking)
		logCreateAsync(
			supabase,
			project_id,
			'task',
			task.id,
			{ title: task.title, type_key: task.type_key, state_key: task.state_key },
			actorId,
			getChangeSourceFromRequest(request)
		);

		return ApiResponse.created({ task });
	} catch (error) {
		console.error('Error in task create endpoint:', error);
		return ApiResponse.internalError(error);
	}
};
