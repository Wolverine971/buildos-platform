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
 * - type_key: string (default: 'milestone.general') - Template type key
 * - title: string (required) - Milestone title
 * - due_at: string (required) - ISO 8601 date/timestamp
 * - state_key?: string - Initial state (default: 'pending')
 * - description?: string - Detailed description
 * - props?: object - Additional properties
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
import { ApiResponse } from '$lib/utils/api-response';
import type { EnsureActorResponse } from '$lib/types/onto-api';
import {
	logCreateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { MILESTONE_STATES } from '$lib/types/onto';
import { normalizeMilestoneStateInput } from '../../shared/milestone-state';

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
			type_key = 'milestone.general',
			title,
			milestone,
			due_at,
			state_key,
			description,
			props = {}
		} = body;

		// Validate required fields
		if (!project_id) {
			return ApiResponse.badRequest('Project ID is required');
		}

		if (!title || typeof title !== 'string' || !title.trim()) {
			return ApiResponse.badRequest('Milestone title is required');
		}

		if (!due_at) {
			return ApiResponse.badRequest('Due date is required');
		}

		// Validate due_at is a valid date
		const dueDate = new Date(due_at);
		if (isNaN(dueDate.getTime())) {
			return ApiResponse.badRequest('Due date must be a valid ISO 8601 date');
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

		// Create the milestone
		const milestoneData = {
			project_id,
			type_key,
			title: title.trim(),
			milestone: milestone?.trim() || null,
			due_at: dueDate.toISOString(),
			state_key: finalState,
			description: description?.trim() || null, // Use dedicated column
			created_by: actorId,
			props: {
				...props,
				// Maintain backwards compatibility by also storing in props
				description: description?.trim() || null,
				state_key: finalState
			}
		};

		const { data: milestone, error: createError } = await supabase
			.from('onto_milestones')
			.insert(milestoneData)
			.select('*')
			.single();

		if (createError) {
			console.error('[Milestone Create] Error creating milestone:', createError);
			return ApiResponse.databaseError(createError);
		}

		// Create an edge linking the milestone to the project
		await supabase.from('onto_edges').insert({
			project_id: project_id,
			src_id: project_id,
			src_kind: 'project',
			dst_id: milestone.id,
			dst_kind: 'milestone',
			rel: 'contains'
		});

		// Log activity async (non-blocking)
		logCreateAsync(
			supabase,
			project_id,
			'milestone',
			milestone.id,
			{ title: milestone.title, type_key: milestone.type_key, due_at: milestone.due_at },
			user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.created({ milestone });
	} catch (error) {
		console.error('[Milestone Create] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};
