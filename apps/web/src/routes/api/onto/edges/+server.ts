// apps/web/src/routes/api/onto/edges/+server.ts
/**
 * POST /api/onto/edges
 *
 * Creates one or more edge relationships between entities.
 * Automatically normalizes edges to canonical direction and stamps project_id.
 *
 * Convention: Store edges directionally, query bidirectionally.
 * Deprecated relationship types (e.g., 'belongs_to_plan') are automatically
 * converted to their canonical equivalents (e.g., 'has_task' with swapped direction).
 *
 * Request body:
 * {
 *   edges: Array<{
 *     src_kind: string;
 *     src_id: string;
 *     dst_kind: string;
 *     dst_id: string;
 *     rel: string;
 *     props?: object;
 *   }>
 * }
 *
 * See: docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md
 * Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md
 */

import type { RequestHandler } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiResponse } from '$lib/utils/api-response';
import {
	normalizeEdgeDirection,
	VALID_RELS,
	type EdgeInput
} from '$lib/services/ontology/edge-direction';
import {
	logActivitiesAsync,
	getChangeSourceFromRequest
} from '$lib/services/async-activity-logger';

const VALID_KINDS = [
	'task',
	'plan',
	'goal',
	'milestone',
	'document',
	'output',
	'project',
	'risk',
	'decision',
	'metric',
	'source',
	'requirement'
];

const TABLE_MAP: Record<string, string> = {
	task: 'onto_tasks',
	plan: 'onto_plans',
	goal: 'onto_goals',
	milestone: 'onto_milestones',
	document: 'onto_documents',
	output: 'onto_outputs',
	project: 'onto_projects',
	risk: 'onto_risks',
	decision: 'onto_decisions',
	metric: 'onto_metrics',
	source: 'onto_sources',
	requirement: 'onto_requirements'
};

/**
 * Get the project_id for an entity.
 * For projects, returns the entity's own id.
 * For other entities, returns the project_id column value.
 */
async function getEntityProjectId(
	supabase: SupabaseClient,
	kind: string,
	id: string
): Promise<string | null> {
	const table = TABLE_MAP[kind];
	if (!table) return null;

	if (kind === 'project') {
		// For projects, the project_id is the entity's own id
		const { data } = await supabase.from(table).select('id').eq('id', id).single();
		return data?.id ?? null;
	}

	// For other entities, get project_id column
	const { data } = await supabase.from(table).select('project_id').eq('id', id).single();
	return data?.project_id ?? null;
}

function validateEdge(edge: EdgeInput): string | null {
	if (!edge.src_kind || !VALID_KINDS.includes(edge.src_kind)) {
		return `Invalid src_kind: ${edge.src_kind}`;
	}
	if (!edge.dst_kind || !VALID_KINDS.includes(edge.dst_kind)) {
		return `Invalid dst_kind: ${edge.dst_kind}`;
	}
	if (!edge.src_id || typeof edge.src_id !== 'string') {
		return 'src_id is required';
	}
	if (!edge.dst_id || typeof edge.dst_id !== 'string') {
		return 'dst_id is required';
	}
	if (!edge.rel || !VALID_RELS.includes(edge.rel)) {
		return `Invalid relationship: ${edge.rel}`;
	}
	if (edge.src_id === edge.dst_id) {
		return 'Cannot create self-referencing edge';
	}
	return null;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const body = await request.json().catch(() => null);
		if (!body || !Array.isArray(body.edges) || body.edges.length === 0) {
			return ApiResponse.badRequest('edges array is required');
		}

		const edges: EdgeInput[] = body.edges;

		// Validate all edges
		for (const edge of edges) {
			const validationError = validateEdge(edge);
			if (validationError) {
				return ApiResponse.badRequest(validationError);
			}
		}

		const supabase = locals.supabase;

		// Verify user actor exists
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId) {
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		// Verify user owns all referenced entities before creating edges
		const idsByKind = new Map<string, Set<string>>();
		for (const edge of edges) {
			if (!idsByKind.has(edge.src_kind)) idsByKind.set(edge.src_kind, new Set());
			if (!idsByKind.has(edge.dst_kind)) idsByKind.set(edge.dst_kind, new Set());
			idsByKind.get(edge.src_kind)!.add(edge.src_id);
			idsByKind.get(edge.dst_kind)!.add(edge.dst_id);
		}

		for (const [kind, idSet] of idsByKind.entries()) {
			const ids = Array.from(idSet);
			const table = TABLE_MAP[kind];
			if (!table) {
				return ApiResponse.badRequest(`Unsupported entity kind: ${kind}`);
			}

			let query;
			if (kind === 'project') {
				query = supabase.from(table).select('id, created_by').in('id', ids);
			} else {
				query = supabase
					.from(table)
					.select('id, project:onto_projects!inner(id, created_by)')
					.in('id', ids);
			}

			const { data, error } = await query;
			if (error) {
				console.error(`[Edges API] Ownership check failed for ${kind}:`, error);
				return ApiResponse.databaseError(error);
			}

			const foundIds = new Set<string>();
			for (const row of data ?? []) {
				foundIds.add(row.id);
				const createdBy =
					kind === 'project'
						? (row as any).created_by
						: (row as any)?.project?.created_by;
				if (createdBy !== actorId) {
					return ApiResponse.forbidden(
						`You do not have permission to link ${kind} ${row.id}`
					);
				}
			}

			for (const id of ids) {
				if (!foundIds.has(id)) {
					return ApiResponse.notFound(`${kind} not found: ${id}`);
				}
			}
		}

		// Normalize edges to canonical direction
		// This handles deprecated rels (e.g., 'belongs_to_plan' → 'has_task' with swapped direction)
		const normalizedEdges = edges.map((edge) => {
			const normalized = normalizeEdgeDirection(edge);
			if (!normalized) {
				// Should not happen if validation passed, but handle gracefully
				return {
					src_kind: edge.src_kind,
					src_id: edge.src_id,
					dst_kind: edge.dst_kind,
					dst_id: edge.dst_id,
					rel: edge.rel,
					props: edge.props || {}
				};
			}
			return normalized;
		});

		// Derive project_id for each edge from the (normalized) source entity
		// and validate that source and destination are in the same project
		const edgesWithProjectId: Array<{
			src_kind: string;
			src_id: string;
			dst_kind: string;
			dst_id: string;
			rel: string;
			props: Record<string, unknown>;
			project_id: string;
		}> = [];

		for (const edge of normalizedEdges) {
			// Get project_id from source entity
			const srcProjectId = await getEntityProjectId(supabase, edge.src_kind, edge.src_id);
			if (!srcProjectId) {
				return ApiResponse.badRequest(
					`Could not determine project for source entity ${edge.src_kind}:${edge.src_id}`
				);
			}

			// Validate destination is in the same project (if not a project itself)
			if (edge.dst_kind !== 'project') {
				const dstProjectId = await getEntityProjectId(supabase, edge.dst_kind, edge.dst_id);
				if (dstProjectId && dstProjectId !== srcProjectId) {
					return ApiResponse.badRequest(
						`Cross-project edges are not allowed. Source (${edge.src_kind}:${edge.src_id}) is in project ${srcProjectId}, but destination (${edge.dst_kind}:${edge.dst_id}) is in project ${dstProjectId}`
					);
				}
			}

			edgesWithProjectId.push({
				src_kind: edge.src_kind,
				src_id: edge.src_id,
				dst_kind: edge.dst_kind,
				dst_id: edge.dst_id,
				rel: edge.rel,
				props: edge.props || {},
				project_id: srcProjectId
			});
		}

		// Check for existing edges to avoid duplicates (using normalized edges)
		const existingEdgesPromises = edgesWithProjectId.map((edge) =>
			supabase
				.from('onto_edges')
				.select('id')
				.eq('src_id', edge.src_id)
				.eq('dst_id', edge.dst_id)
				.eq('rel', edge.rel)
				.maybeSingle()
		);

		const existingResults = await Promise.all(existingEdgesPromises);

		// Filter out edges that already exist
		const newEdges = edgesWithProjectId.filter((_, index) => {
			const result = existingResults[index];
			return !result?.data; // Only include if no existing edge found
		});

		if (newEdges.length === 0) {
			// All edges already exist
			return ApiResponse.success({ created: 0 });
		}

		// Prepare edges for insertion (already normalized, with project_id)
		const edgesToInsert = newEdges.map((edge) => ({
			src_kind: edge.src_kind,
			src_id: edge.src_id,
			dst_kind: edge.dst_kind,
			dst_id: edge.dst_id,
			rel: edge.rel,
			props: edge.props as Record<string, never>,
			project_id: edge.project_id
		}));

		// Insert new edges
		const { data: insertedEdges, error: insertError } = await supabase
			.from('onto_edges')
			.insert(edgesToInsert)
			.select('id');

		if (insertError) {
			console.error('[Edges API] Insert error:', insertError);
			return ApiResponse.databaseError(insertError);
		}

		// Log activity async (non-blocking)
		if (insertedEdges && insertedEdges.length > 0) {
			const changeSource = getChangeSourceFromRequest(request);
			logActivitiesAsync(supabase, {
				logs: newEdges.map((edge, index) => ({
					projectId: edge.project_id,
					entityType: 'edge' as const,
					entityId: insertedEdges[index]?.id ?? 'unknown',
					action: 'created' as const,
					afterData: { src_kind: edge.src_kind, dst_kind: edge.dst_kind, rel: edge.rel },
					changedBy: actorId,
					changeSource
				}))
			});
		}

		return ApiResponse.success({
			created: insertedEdges?.length || newEdges.length
		});
	} catch (error) {
		console.error('[Edges API] Error:', error);
		return ApiResponse.internalError(error, 'Failed to create edges');
	}
};
