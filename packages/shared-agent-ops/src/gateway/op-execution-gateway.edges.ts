// packages/shared-agent-ops/src/gateway/op-execution-gateway.edges.ts
import type { OntologyProjectSummary } from '../ontology/ontology-projects.service';
import { logCreateAsync, logUpdateAsync } from '../ops/async-activity-logger';
import { normalizeEdgeDirection, VALID_RELS, type EntityKind } from '../ontology/edge-direction';
import { resolveEdgeRelationship } from '../ontology/edge-relationship-resolver';
import {
	assertProjectWriteAccess,
	assertVisibleEntityProject,
	loadVisibleProjects
} from './op-execution-gateway.access';
import { getExternalAgentActivityContext } from './op-execution-gateway.activity';
import {
	loadEntityForAccess,
	normalizeEntityKind,
	resolveEntityProjectId
} from './op-execution-gateway.entity-access';
import { assertValidId } from './op-execution-gateway.ids';
import { normalizeProps, requireTrimmedString } from './op-execution-gateway.normalization';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import { ONTO_EDGE_SELECT, type ExternalLinkEntityKind } from './op-execution-gateway.config';
import type { ToolExecutionContext } from './op-execution-gateway.types';

export const TASK_DOCUMENT_REL = 'task_has_document';

export async function createOptionalParentEdges(
	context: ToolExecutionContext,
	project: OntologyProjectSummary,
	entityKind: ExternalLinkEntityKind,
	entityId: string,
	parents: Array<{ kind: string; id: string; rel?: string }>
): Promise<void> {
	for (const parent of parents) {
		await createEdge(
			context,
			{
				src_kind: parent.kind,
				src_id: parent.id,
				dst_kind: entityKind,
				dst_id: entityId,
				rel: parent.rel ?? 'contains',
				props: { origin: 'external_agent' }
			},
			project
		);
	}
}

export async function createEdge(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	knownProject?: OntologyProjectSummary
): Promise<{
	created: number;
	edge: Record<string, unknown> | null;
	project: OntologyProjectSummary;
}> {
	const srcKind = normalizeEntityKind(args.src_kind, 'src_kind');
	const dstKind = normalizeEntityKind(args.dst_kind, 'dst_kind');
	const relInput = requireTrimmedString(args.rel, 'rel') ?? '';
	const props = normalizeProps(args.props, 'props') ?? {};
	const src = await loadEntityForAccess(context, srcKind, args.src_id, 'write');
	const dst = await loadEntityForAccess(context, dstKind, args.dst_id, 'write');
	const srcProjectId = resolveEntityProjectId(src);
	const dstProjectId = resolveEntityProjectId(dst);

	if (srcProjectId !== dstProjectId) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'Cross-project edges are not allowed'
		);
	}
	if (knownProject && knownProject.id !== srcProjectId) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'Edge project does not match the expected project'
		);
	}

	const normalized =
		relInput === TASK_DOCUMENT_REL
			? {
					src_kind: srcKind as EntityKind,
					src_id: String(src.entity.id),
					dst_kind: dstKind as EntityKind,
					dst_id: String(dst.entity.id),
					rel: TASK_DOCUMENT_REL,
					props
				}
			: (() => {
					const resolved = resolveEdgeRelationship({
						srcKind: srcKind as EntityKind,
						dstKind: dstKind as EntityKind,
						rel: relInput
					});
					const resolvedRel = resolved.rel;
					if (!resolvedRel || !VALID_RELS.includes(resolvedRel)) {
						throw new ExternalToolGatewayError(
							'VALIDATION_ERROR',
							`Invalid relationship: ${relInput}`
						);
					}

					const normalizedEdge = normalizeEdgeDirection({
						src_kind: srcKind,
						src_id: String(src.entity.id),
						dst_kind: dstKind,
						dst_id: String(dst.entity.id),
						rel: resolvedRel,
						props: {
							...props,
							...(resolved.original_rel && props.original_rel === undefined
								? { original_rel: resolved.original_rel }
								: {})
						}
					});
					if (!normalizedEdge) {
						throw new ExternalToolGatewayError(
							'VALIDATION_ERROR',
							`Invalid relationship: ${relInput}`
						);
					}
					return normalizedEdge;
				})();

	const { data: existing, error: existingError } = await context.admin
		.from('onto_edges')
		.select(ONTO_EDGE_SELECT)
		.eq('src_id', normalized.src_id)
		.eq('dst_id', normalized.dst_id)
		.eq('rel', normalized.rel)
		.maybeSingle();
	if (existingError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			existingError.message || 'Failed to check existing edge'
		);
	}
	if (existing) {
		return {
			created: 0,
			edge: existing as Record<string, unknown>,
			project: knownProject ?? src.project
		};
	}

	const { data, error } = await context.admin
		.from('onto_edges')
		.insert({
			project_id: srcProjectId,
			src_kind: normalized.src_kind,
			src_id: normalized.src_id,
			dst_kind: normalized.dst_kind,
			dst_id: normalized.dst_id,
			rel: normalized.rel,
			props: normalized.props
		})
		.select(ONTO_EDGE_SELECT)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError('INTERNAL', error?.message || 'Failed to create edge');
	}

	await logCreateAsync(
		context.admin,
		srcProjectId,
		'edge',
		String(data.id),
		{ src_kind: data.src_kind, dst_kind: data.dst_kind, rel: data.rel },
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		created: 1,
		edge: data as Record<string, unknown>,
		project: knownProject ?? src.project
	};
}

export async function linkOntoEntities(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const result = await createEdge(context, args);
	return {
		created: result.created,
		edge: result.edge,
		message:
			result.created > 0 ? 'Linked entities successfully.' : 'Entities were already linked.'
	};
}

export async function unlinkOntoEdge(context: ToolExecutionContext, args: Record<string, unknown>) {
	const edgeId = assertValidId(args.edge_id, 'edge_id');
	const { data: edge, error: edgeError } = await context.admin
		.from('onto_edges')
		.select(ONTO_EDGE_SELECT)
		.eq('id', edgeId)
		.maybeSingle();

	if (edgeError) {
		throw new ExternalToolGatewayError('INTERNAL', edgeError.message || 'Failed to load edge');
	}
	if (!edge) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Edge not found');
	}

	const visible = await loadVisibleProjects(context);
	const project = assertVisibleEntityProject(visible.projectMap, edge.project_id);
	assertProjectWriteAccess(project);

	const { error: deleteError } = await context.admin.from('onto_edges').delete().eq('id', edgeId);
	if (deleteError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			deleteError.message || 'Failed to delete edge'
		);
	}

	await logUpdateAsync(
		context.admin,
		project.id,
		'edge',
		edgeId,
		edge as Record<string, unknown>,
		{ deleted: true },
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		deleted: true,
		edge_id: edgeId,
		edge,
		message: 'Unlinked entities successfully.'
	};
}
