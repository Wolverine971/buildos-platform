// apps/web/src/routes/api/onto/risks/[id]/+server.ts
/**
 * Risk CRUD API Endpoints (GET, PATCH, DELETE)
 *
 * Handles read, update, and delete operations for risks in the ontology system.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Implementation: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
 * - API Patterns: /apps/web/docs/technical/api/PATTERNS.md
 *
 * GET /api/onto/risks/[id]:
 * - Returns risk with project ownership verification
 * - Includes FSM state information
 *
 * PATCH /api/onto/risks/[id]:
 * - Updates risk properties (title, impact, probability, state_key, etc.)
 * - Maintains props object integrity
 *
 * DELETE /api/onto/risks/[id]:
 * - Removes risk and associated edges
 * - Verifies ownership before deletion
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/RiskEditModal.svelte
 * - Create Endpoint: /apps/web/src/routes/api/onto/risks/create/+server.ts
 * - Database: onto_risks, onto_edges tables
 *
 * Security:
 * - Uses locals.supabase for RLS enforcement
 * - Actor-based authorization
 * - Project ownership verification
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { RISK_STATES } from '$lib/types/onto';
import {
	logUpdateAsync,
	logDeleteAsync,
	getChangeSourceFromRequest
} from '$lib/services/async-activity-logger';

const VALID_IMPACTS = ['low', 'medium', 'high', 'critical'] as const;
type Impact = (typeof VALID_IMPACTS)[number];

type RiskState = (typeof RISK_STATES)[number];

// GET /api/onto/risks/[id] - Get a single risk
export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;

	try {
		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Risk GET] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get risk with project to verify ownership
		const { data: risk, error } = await supabase
			.from('onto_risks')
			.select(
				`
				*,
				project:onto_projects!inner(
					id,
					name,
					created_by
				)
			`
			)
			.eq('id', params.id)
			.single();

		if (error || !risk) {
			return ApiResponse.notFound('Risk');
		}

		// Check if user owns the project
		if (risk.project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have access to this risk');
		}

		// Extract project data and include project name in response
		const { project, ...riskData } = risk;

		return ApiResponse.success({ risk: { ...riskData, project: { name: project.name } } });
	} catch (error) {
		console.error('[Risk GET] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};

// PATCH /api/onto/risks/[id] - Update a risk
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;

	try {
		const body = await request.json();
		const {
			title,
			impact,
			probability,
			state_key,
			description,
			mitigation_strategy,
			owner,
			props
		} = body;

		// Validate impact if provided
		if (impact !== undefined && !VALID_IMPACTS.includes(impact as Impact)) {
			return ApiResponse.badRequest(`Impact must be one of: ${VALID_IMPACTS.join(', ')}`);
		}

		// Validate probability if provided
		if (probability !== undefined && probability !== null) {
			const prob = Number(probability);
			if (isNaN(prob) || prob < 0 || prob > 1) {
				return ApiResponse.badRequest('Probability must be a number between 0 and 1');
			}
		}

		// Validate state_key if provided
		if (state_key !== undefined && !RISK_STATES.includes(state_key as RiskState)) {
			return ApiResponse.badRequest(`State must be one of: ${RISK_STATES.join(', ')}`);
		}

		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Risk PATCH] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get risk with project to verify ownership
		const { data: existingRisk, error: fetchError } = await supabase
			.from('onto_risks')
			.select(
				`
				*,
				project:onto_projects!inner(
					id,
					created_by
				)
			`
			)
			.eq('id', params.id)
			.single();

		if (fetchError || !existingRisk) {
			return ApiResponse.notFound('Risk');
		}

		// Check if user owns the project
		if (existingRisk.project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to modify this risk');
		}

		// Build update object
		const updateData: Record<string, unknown> = {};

		if (title !== undefined) {
			if (typeof title !== 'string' || !title.trim()) {
				return ApiResponse.badRequest('Title cannot be empty');
			}
			updateData.title = title.trim();
		}

		if (impact !== undefined) {
			updateData.impact = impact;
		}

		if (probability !== undefined) {
			updateData.probability = probability !== null ? Number(probability) : null;
		}

		if (state_key !== undefined) {
			updateData.state_key = state_key;
		}

		// Handle props update - merge with existing
		const currentProps = (existingRisk.props as Record<string, unknown>) || {};
		let hasPropsUpdate = false;
		const propsUpdate: Record<string, unknown> = { ...currentProps };

		if (props !== undefined && typeof props === 'object' && props !== null) {
			Object.assign(propsUpdate, props);
			hasPropsUpdate = true;
		}

		if (description !== undefined) {
			propsUpdate.description = description?.trim() || null;
			hasPropsUpdate = true;
		}

		if (mitigation_strategy !== undefined) {
			propsUpdate.mitigation_strategy = mitigation_strategy?.trim() || null;
			hasPropsUpdate = true;
		}

		if (owner !== undefined) {
			propsUpdate.owner = owner?.trim() || null;
			hasPropsUpdate = true;
		}

		if (hasPropsUpdate) {
			updateData.props = propsUpdate;
		}

		// Only update if there's something to update
		if (Object.keys(updateData).length === 0) {
			return ApiResponse.badRequest('No valid update fields provided');
		}

		// Update the risk
		const { data: updatedRisk, error: updateError } = await supabase
			.from('onto_risks')
			.update(updateData)
			.eq('id', params.id)
			.select('*')
			.single();

		if (updateError) {
			console.error('[Risk PATCH] Error updating risk:', updateError);
			return ApiResponse.error('Failed to update risk', 500);
		}

		// Log activity async (non-blocking)
		logUpdateAsync(
			supabase,
			existingRisk.project_id,
			'risk',
			params.id,
			{
				title: existingRisk.title,
				impact: existingRisk.impact,
				state_key: existingRisk.state_key
			},
			{
				title: updatedRisk.title,
				impact: updatedRisk.impact,
				state_key: updatedRisk.state_key
			},
			actorId,
			getChangeSourceFromRequest(request)
		);

		return ApiResponse.success({ risk: updatedRisk });
	} catch (error) {
		console.error('[Risk PATCH] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};

// DELETE /api/onto/risks/[id] - Delete a risk
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;

	try {
		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Risk DELETE] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get risk with project to verify ownership (fetch full data for logging)
		const { data: risk, error: fetchError } = await supabase
			.from('onto_risks')
			.select(
				`
				*,
				project:onto_projects!inner(
					id,
					created_by
				)
			`
			)
			.eq('id', params.id)
			.single();

		if (fetchError || !risk) {
			return ApiResponse.notFound('Risk');
		}

		// Check if user owns the project
		if (risk.project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to delete this risk');
		}

		const projectId = risk.project_id;
		const riskDataForLog = {
			title: risk.title,
			type_key: risk.type_key,
			impact: risk.impact,
			state_key: risk.state_key
		};

		// Delete related edges
		await supabase
			.from('onto_edges')
			.delete()
			.or(`src_id.eq.${params.id},dst_id.eq.${params.id}`);

		// Delete the risk
		const { error: deleteError } = await supabase
			.from('onto_risks')
			.delete()
			.eq('id', params.id);

		if (deleteError) {
			console.error('[Risk DELETE] Error deleting risk:', deleteError);
			return ApiResponse.error('Failed to delete risk', 500);
		}

		// Log activity async (non-blocking)
		logDeleteAsync(
			supabase,
			projectId,
			'risk',
			params.id,
			riskDataForLog,
			actorId,
			getChangeSourceFromRequest(request)
		);

		return ApiResponse.success({ message: 'Risk deleted successfully' });
	} catch (error) {
		console.error('[Risk DELETE] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};
