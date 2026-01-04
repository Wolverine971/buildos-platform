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
 * - type_key: string (ignored; auto-classified) - Template type key
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
		const { project_id, title, milestone, due_at, state_key, description } = body;
		const classificationSource = body?.classification_source ?? body?.classificationSource;

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
			.is('deleted_at', null)
			.eq('created_by', actorId)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		// Create the milestone
		const milestoneData = {
			project_id,
			type_key: 'milestone.default',
			title: title.trim(),
			milestone: milestone?.trim() || null,
			due_at: dueDate.toISOString(),
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
			return ApiResponse.databaseError(createError);
		}

		// Create an edge linking the milestone to the project
		await supabase.from('onto_edges').insert({
			project_id: project_id,
			src_id: project_id,
			src_kind: 'project',
			dst_id: createdMilestone.id,
			dst_kind: 'milestone',
			rel: 'has_milestone'
		});

		// Log activity async (non-blocking)
		logCreateAsync(
			supabase,
			project_id,
			'milestone',
			createdMilestone.id,
			{
				title: createdMilestone.title,
				type_key: createdMilestone.type_key,
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

		return ApiResponse.created({ milestone: createdMilestone });
	} catch (error) {
		console.error('[Milestone Create] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};
