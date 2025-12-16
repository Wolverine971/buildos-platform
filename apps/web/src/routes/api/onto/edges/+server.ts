// apps/web/src/routes/api/onto/edges/+server.ts
/**
 * POST /api/onto/edges
 *
 * Creates one or more edge relationships between entities.
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
 * Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

interface EdgeInput {
	src_kind: string;
	src_id: string;
	dst_kind: string;
	dst_id: string;
	rel: string;
	props?: Record<string, unknown>;
}

const VALID_KINDS = ['task', 'plan', 'goal', 'milestone', 'document', 'output', 'project', 'risk'];
const VALID_RELS = [
	'belongs_to_plan',
	'has_task',
	'supports_goal',
	'requires',
	'achieved_by',
	'depends_on',
	'blocks',
	'targets_milestone',
	'contains',
	'references',
	'referenced_by',
	'produces',
	'produced_by',
	'has_document',
	'relates_to',
	// Risk relationships
	'mitigated_by',
	'addressed_in',
	'threatens',
	'documented_in',
	'mitigates',
	'addresses',
	'has_risk'
];

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

		const tableMap: Record<string, string> = {
			task: 'onto_tasks',
			plan: 'onto_plans',
			goal: 'onto_goals',
			milestone: 'onto_milestones',
			document: 'onto_documents',
			output: 'onto_outputs',
			project: 'onto_projects',
			risk: 'onto_risks'
		};

		for (const [kind, idSet] of idsByKind.entries()) {
			const ids = Array.from(idSet);
			const table = tableMap[kind];
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

		// Check for existing edges to avoid duplicates
		const existingEdgesPromises = edges.map((edge) =>
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
		const newEdges = edges.filter((_, index) => {
			const result = existingResults[index];
			return !result?.data; // Only include if no existing edge found
		});

		if (newEdges.length === 0) {
			// All edges already exist
			return ApiResponse.success({ created: 0 });
		}

		// Prepare edges for insertion
		const edgesToInsert = newEdges.map((edge) => ({
			src_kind: edge.src_kind,
			src_id: edge.src_id,
			dst_kind: edge.dst_kind,
			dst_id: edge.dst_id,
			rel: edge.rel,
			props: (edge.props || {}) as Record<string, never>
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

		return ApiResponse.success({
			created: insertedEdges?.length || newEdges.length
		});
	} catch (error) {
		console.error('[Edges API] Error:', error);
		return ApiResponse.internalError(error, 'Failed to create edges');
	}
};
