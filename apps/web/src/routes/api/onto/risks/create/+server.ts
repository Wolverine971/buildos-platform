// apps/web/src/routes/api/onto/risks/create/+server.ts
/**
 * Risk Creation API Endpoint
 *
 * Creates a new risk within the BuildOS ontology system.
 * Risks represent potential issues that could impact project success.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Implementation: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
 *
 * Request Body:
 * - project_id: string (required) - Project UUID
 * - type_key: string (default: 'risk.general') - Template type key
 * - title: string (required) - Risk title
 * - impact: 'low' | 'medium' | 'high' | 'critical' (required) - Impact severity
 * - probability?: number (0-1) - Likelihood of occurrence
 * - state_key?: string - Initial state (default: 'identified')
 * - description?: string - Detailed description
 * - mitigation_strategy?: string - How to mitigate
 * - props?: object - Additional properties
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/RiskCreateModal.svelte
 * - Goals: /apps/web/src/routes/api/onto/goals/create/+server.ts
 * - Database: onto_risks, onto_edges tables
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

const VALID_IMPACTS = ['low', 'medium', 'high', 'critical'] as const;
type Impact = (typeof VALID_IMPACTS)[number];

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
			type_key = 'risk.general',
			title,
			impact,
			probability,
			state_key = 'identified',
			content,
			description,
			mitigation_strategy,
			props = {}
		} = body;

		// Validate required fields
		if (!project_id) {
			return ApiResponse.badRequest('Project ID is required');
		}

		if (!title || typeof title !== 'string' || !title.trim()) {
			return ApiResponse.badRequest('Risk title is required');
		}

		if (!impact || !VALID_IMPACTS.includes(impact as Impact)) {
			return ApiResponse.badRequest(
				`Impact is required and must be one of: ${VALID_IMPACTS.join(', ')}`
			);
		}

		// Validate probability if provided
		if (probability !== undefined && probability !== null) {
			const prob = Number(probability);
			if (isNaN(prob) || prob < 0 || prob > 1) {
				return ApiResponse.badRequest('Probability must be a number between 0 and 1');
			}
		}

		// Get user's actor ID
		const { data: actorData, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorData) {
			console.error('[Risk Create] Error resolving actor:', actorError);
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

		// Create the risk
		const riskData = {
			project_id,
			type_key,
			title: title.trim(),
			impact,
			probability:
				probability !== undefined && probability !== null ? Number(probability) : null,
			state_key,
			content: content?.trim() || null,
			created_by: actorId,
			props: {
				...props,
				description: description?.trim() || null,
				mitigation_strategy: mitigation_strategy?.trim() || null
			}
		};

		const { data: risk, error: createError } = await supabase
			.from('onto_risks')
			.insert(riskData)
			.select('*')
			.single();

		if (createError) {
			console.error('[Risk Create] Error creating risk:', createError);
			return ApiResponse.databaseError(createError);
		}

		// Create an edge linking the risk to the project
		await supabase.from('onto_edges').insert({
			project_id: project_id,
			src_id: project_id,
			src_kind: 'project',
			dst_id: risk.id,
			dst_kind: 'risk',
			rel: 'contains'
		});

		// Log activity async (non-blocking)
		logCreateAsync(
			supabase,
			project_id,
			'risk',
			risk.id,
			{
				title: risk.title,
				type_key: risk.type_key,
				impact: risk.impact,
				state_key: risk.state_key
			},
			user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.created({ risk });
	} catch (error) {
		console.error('[Risk Create] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};
