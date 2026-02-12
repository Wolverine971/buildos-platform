// apps/web/src/routes/api/onto/projects/[id]/reorganize/+server.ts
/**
 * POST /api/onto/projects/[id]/reorganize
 * Reorganize a subset of project entities using resolver + auto-organization rules.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	applyGraphReorgPlan,
	planGraphReorg,
	GraphReorgConflictError,
	type GraphReorgMode,
	type GraphReorgSemanticMode,
	type GraphReorgNodeInput
} from '$lib/services/ontology/graph-reorganizer';
import {
	assertEntityRefsInProject,
	ENTITY_TABLES,
	AutoOrganizeError
} from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import { RELATIONSHIP_DIRECTIONS, type EntityKind } from '$lib/services/ontology/edge-direction';
import { normalizeRelationshipToken } from '$lib/services/ontology/edge-relationship-resolver';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

const VALID_MODES = new Set<GraphReorgMode>(['replace', 'merge']);
const VALID_SEMANTIC_MODES = new Set<GraphReorgSemanticMode>(['replace_auto', 'merge', 'preserve']);
const VALID_INTENTS = new Set<ConnectionRef['intent']>(['containment', 'semantic']);
const VALID_CANONICAL_RELATIONSHIPS = new Set<string>(Object.keys(RELATIONSHIP_DIRECTIONS));

function parseMode(value: unknown): GraphReorgMode | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return VALID_MODES.has(trimmed as GraphReorgMode) ? (trimmed as GraphReorgMode) : undefined;
}

function parseSemanticMode(value: unknown): GraphReorgSemanticMode | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return VALID_SEMANTIC_MODES.has(trimmed as GraphReorgSemanticMode)
		? (trimmed as GraphReorgSemanticMode)
		: undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
	if (typeof value === 'boolean') return value;
	return undefined;
}

function parseConnections(value: unknown): ConnectionRef[] {
	if (!Array.isArray(value)) return [];
	return value.filter(Boolean).map((entry) => ({
		kind: typeof (entry as ConnectionRef).kind === 'string' ? (entry as any).kind.trim() : '',
		id: typeof (entry as ConnectionRef).id === 'string' ? (entry as any).id.trim() : '',
		intent:
			typeof (entry as ConnectionRef).intent === 'string'
				? ((entry as any).intent.trim() as ConnectionRef['intent']) || undefined
				: undefined,
		rel:
			typeof (entry as ConnectionRef).rel === 'string'
				? ((entry as any).rel.trim() as ConnectionRef['rel']) || undefined
				: undefined
	}));
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id } = params;
		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}
		if (!isValidUUID(id)) {
			return ApiResponse.badRequest('Invalid project ID');
		}

		const body = await request.json().catch(() => null);
		if (!body || typeof body !== 'object') {
			return ApiResponse.badRequest('Invalid request body');
		}

		const projectId = typeof (body as any).project_id === 'string' ? body.project_id : id;
		if (!isValidUUID(projectId)) {
			return ApiResponse.badRequest('Invalid project ID');
		}
		if (projectId !== id) {
			return ApiResponse.badRequest('project_id must match route project id');
		}

		const nodesInput = (body as any).nodes;
		if (!Array.isArray(nodesInput) || nodesInput.length === 0) {
			return ApiResponse.badRequest('nodes array is required');
		}

		const optionsInput = (body as any).options ?? {};
		const defaultMode = parseMode(optionsInput.mode);
		if (optionsInput.mode !== undefined && !defaultMode) {
			return ApiResponse.badRequest('Invalid options.mode value');
		}
		const defaultSemanticMode = parseSemanticMode(optionsInput.semantic_mode);
		if (optionsInput.semantic_mode !== undefined && !defaultSemanticMode) {
			return ApiResponse.badRequest('Invalid options.semantic_mode value');
		}
		const defaultAllowProjectFallback = parseBoolean(optionsInput.allow_project_fallback);
		if (
			optionsInput.allow_project_fallback !== undefined &&
			defaultAllowProjectFallback === undefined
		) {
			return ApiResponse.badRequest('Invalid options.allow_project_fallback value');
		}
		const defaultAllowMultiParent = parseBoolean(optionsInput.allow_multi_parent);
		if (
			optionsInput.allow_multi_parent !== undefined &&
			defaultAllowMultiParent === undefined
		) {
			return ApiResponse.badRequest('Invalid options.allow_multi_parent value');
		}
		const parsedDryRun = parseBoolean(optionsInput.dry_run);
		if (optionsInput.dry_run !== undefined && parsedDryRun === undefined) {
			return ApiResponse.badRequest('Invalid options.dry_run value');
		}
		const dryRun = parsedDryRun ?? false;

		const seenKeys = new Set<string>();
		const nodes: GraphReorgNodeInput[] = [];
		const connectionRefs: ConnectionRef[] = [];

		for (const entry of nodesInput) {
			if (!entry || typeof entry !== 'object') {
				return ApiResponse.badRequest('Invalid node entry in nodes array');
			}
			const rawKind = String((entry as any).kind ?? '').trim();
			const rawId = String((entry as any).id ?? '').trim();
			if (!rawKind || !rawId) {
				return ApiResponse.badRequest('Each node requires kind and id');
			}
			if (!isValidUUID(rawId)) {
				return ApiResponse.badRequest(`Invalid ${rawKind} id; expected UUID`);
			}
			if (rawKind === 'project') {
				return ApiResponse.badRequest('project cannot be reorganized as a node');
			}
			if (!(rawKind in ENTITY_TABLES)) {
				return ApiResponse.badRequest(`Unsupported node kind: ${rawKind}`);
			}

			const nodeKey = `${rawKind}:${rawId}`;
			if (seenKeys.has(nodeKey)) {
				return ApiResponse.badRequest(`Duplicate node entry: ${nodeKey}`);
			}
			seenKeys.add(nodeKey);

			const nodeConnections = parseConnections((entry as any).connections);
			for (const connection of nodeConnections) {
				if (!connection.kind || !connection.id) {
					return ApiResponse.badRequest('Each connection requires kind and id');
				}
				if (!(connection.kind in ENTITY_TABLES) && connection.kind !== 'project') {
					return ApiResponse.badRequest(
						`Unsupported connection kind: ${connection.kind}`
					);
				}
				if (connection.kind === 'project' && connection.id !== projectId) {
					return ApiResponse.badRequest('Connection project id must match project_id');
				}
				if (connection.kind !== 'project' && !isValidUUID(connection.id)) {
					return ApiResponse.badRequest(
						`Invalid connection id for ${connection.kind}; expected UUID`
					);
				}
				if (connection.intent && !VALID_INTENTS.has(connection.intent)) {
					return ApiResponse.badRequest(`Invalid connection intent for node ${nodeKey}`);
				}
				if (connection.rel) {
					const normalizedRel = normalizeRelationshipToken(connection.rel);
					connection.rel = VALID_CANONICAL_RELATIONSHIPS.has(normalizedRel)
						? (normalizedRel as any)
						: undefined;
				}
				connectionRefs.push(connection);
			}

			const nodeMode = parseMode((entry as any).mode);
			if ((entry as any).mode !== undefined && !nodeMode) {
				return ApiResponse.badRequest(`Invalid mode for node ${nodeKey}`);
			}

			const nodeSemanticMode = parseSemanticMode((entry as any).semantic_mode);
			if ((entry as any).semantic_mode !== undefined && !nodeSemanticMode) {
				return ApiResponse.badRequest(`Invalid semantic_mode for node ${nodeKey}`);
			}

			const nodeAllowProjectFallback = parseBoolean((entry as any).allow_project_fallback);
			if (
				(entry as any).allow_project_fallback !== undefined &&
				nodeAllowProjectFallback === undefined
			) {
				return ApiResponse.badRequest(`Invalid allow_project_fallback for node ${nodeKey}`);
			}
			const nodeAllowMultiParent = parseBoolean((entry as any).allow_multi_parent);
			if (
				(entry as any).allow_multi_parent !== undefined &&
				nodeAllowMultiParent === undefined
			) {
				return ApiResponse.badRequest(`Invalid allow_multi_parent for node ${nodeKey}`);
			}

			nodes.push({
				id: rawId,
				kind: rawKind as EntityKind,
				connections: nodeConnections,
				mode: nodeMode,
				semantic_mode: nodeSemanticMode,
				allow_project_fallback: nodeAllowProjectFallback,
				allow_multi_parent: nodeAllowMultiParent
			});
		}

		const supabase = locals.supabase;
		const actorResult = await supabase.rpc('ensure_actor_for_user', { p_user_id: user.id });

		if (actorResult.error || !actorResult.data) {
			console.error('[Graph Reorg API] Failed to resolve actor', actorResult.error);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: projectId,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Graph Reorg API] Failed to check access', accessError);
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to access this project');
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', projectId)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project not found');
		}

		await assertEntityRefsInProject({
			supabase,
			projectId,
			refs: nodes.map((node) => ({ kind: node.kind, id: node.id })),
			allowProject: false
		});

		if (connectionRefs.length > 0) {
			await assertEntityRefsInProject({
				supabase,
				projectId,
				refs: connectionRefs.map((connection) => ({
					kind: connection.kind,
					id: connection.id
				})),
				allowProject: true
			});
		}

		const plan = await planGraphReorg({
			supabase,
			projectId,
			nodes,
			options: {
				mode: defaultMode,
				semantic_mode: defaultSemanticMode,
				allow_project_fallback: defaultAllowProjectFallback,
				allow_multi_parent: defaultAllowMultiParent,
				dry_run: dryRun
			}
		});

		if (!dryRun) {
			await applyGraphReorgPlan({ supabase, plan, projectId });
		}

		return ApiResponse.success({
			dry_run: dryRun,
			node_count: plan.nodeCount,
			counts: plan.counts,
			changes: dryRun
				? {
						edges_to_create: plan.edgesToCreate,
						edges_to_delete: plan.edgesToDelete.map((edge) => ({
							id: edge.id,
							rel: edge.rel,
							src_kind: edge.src_kind,
							src_id: edge.src_id,
							dst_kind: edge.dst_kind,
							dst_id: edge.dst_id
						})),
						edges_to_update: plan.edgesToUpdate.map((edge) => ({
							id: edge.id,
							rel: edge.rel,
							src_kind: edge.src_kind,
							src_id: edge.src_id,
							dst_kind: edge.dst_kind,
							dst_id: edge.dst_id,
							props: edge.props
						}))
					}
				: undefined
		});
	} catch (error) {
		if (error instanceof GraphReorgConflictError) {
			return ApiResponse.error(error.message, error.status);
		}
		if (error instanceof AutoOrganizeError) {
			return ApiResponse.error(error.message, error.status);
		}
		console.error('[Graph Reorg API] Unexpected error', error);
		return ApiResponse.internalError(error, 'Failed to reorganize project graph');
	}
};
