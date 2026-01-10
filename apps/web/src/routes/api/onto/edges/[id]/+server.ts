// apps/web/src/routes/api/onto/edges/[id]/+server.ts
/**
 * DELETE /api/onto/edges/:id
 *
 * Deletes a single edge by its ID.
 *
 * Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	logDeleteAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const edgeId = params.id;
		if (!edgeId) {
			return ApiResponse.badRequest('Edge ID is required');
		}

		const supabase = locals.supabase;

		// Verify user actor exists
		const actorResult = await supabase.rpc('ensure_actor_for_user', { p_user_id: user.id });

		if (actorResult.error || !actorResult.data) {
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		// First, fetch the edge to verify it exists and get related entity info
		const { data: edge, error: fetchError } = await supabase
			.from('onto_edges')
			.select('*')
			.eq('id', edgeId)
			.single();

		if (fetchError || !edge) {
			return ApiResponse.notFound('Edge');
		}

		// Verify user has access to at least one of the connected entities
		// by checking if they own a project that contains the source entity
		const hasAccess = await verifyEdgeAccess(supabase, edge);
		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to delete this edge');
		}

		// Capture edge data for logging before deletion
		const projectId = edge.project_id;
		const edgeDataForLog = { src_kind: edge.src_kind, dst_kind: edge.dst_kind, rel: edge.rel };

		// Delete the edge
		const { error: deleteError } = await supabase.from('onto_edges').delete().eq('id', edgeId);

		if (deleteError) {
			console.error('[Edges API] Delete error:', deleteError);
			return ApiResponse.databaseError(deleteError);
		}

		// Log activity async (non-blocking)
		if (projectId) {
			const chatSessionId = getChatSessionIdFromRequest(request);
			logDeleteAsync(
				supabase,
				projectId,
				'edge',
				edgeId,
				edgeDataForLog,
				user.id,
				getChangeSourceFromRequest(request),
				chatSessionId
			);
		}

		return ApiResponse.success({ deleted: true });
	} catch (error) {
		console.error('[Edges API] Error:', error);
		return ApiResponse.internalError(error, 'Failed to delete edge');
	}
};

async function verifyEdgeAccess(
	supabase: any,
	edge: { src_kind: string; src_id: string; dst_kind: string; dst_id: string }
): Promise<boolean> {
	// Check access based on source entity type
	const entityTable = getEntityTable(edge.src_kind);
	if (!entityTable) {
		// For project edges, check project ownership directly
		if (edge.src_kind === 'project') {
			const { data } = await supabase.rpc('current_actor_has_project_access', {
				p_project_id: edge.src_id,
				p_required_access: 'write'
			});
			return !!data;
		}
		return false;
	}

	// For other entity types, check if the entity belongs to a project the user owns
	const { data: entity } = await supabase
		.from(entityTable)
		.select('project_id')
		.eq('id', edge.src_id)
		.is('deleted_at', null)
		.single();

	if (!entity?.project_id) return false;

	const { data: hasAccess } = await supabase.rpc('current_actor_has_project_access', {
		p_project_id: entity.project_id,
		p_required_access: 'write'
	});

	return !!hasAccess;
}

function getEntityTable(kind: string): string | null {
	const tableMap: Record<string, string> = {
		task: 'onto_tasks',
		plan: 'onto_plans',
		goal: 'onto_goals',
		milestone: 'onto_milestones',
		document: 'onto_documents',
		output: 'onto_outputs'
	};
	return tableMap[kind] || null;
}
