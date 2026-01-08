// apps/web/src/lib/services/ontology/graph-reorganizer.ts
/**
 * Graph Reorganizer
 *
 * Plans and applies project graph reorganization for a subset of entities.
 * Uses resolver rules for containment + semantic edges and supports dry-run previews.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { OntoEdge } from '$lib/types/onto-api';
import type { EntityKind, RelationshipType } from './edge-direction';
import {
	CONTAINMENT_RELS,
	ALLOWED_PARENTS,
	resolveContainmentRel,
	type ParentRef
} from './containment-organizer';
import {
	resolveConnections,
	type ConnectionRef,
	type ResolvedSemanticEdge
} from './relationship-resolver';
import {
	PRODUCER_KINDS,
	SUPPORTS_GOAL_KINDS,
	TARGETS_MILESTONE_KINDS,
	REFERENCE_TARGET_KINDS
} from './relationship-policy';

export type GraphReorgMode = 'replace' | 'merge';
export type GraphReorgSemanticMode = 'replace_auto' | 'merge' | 'preserve';

export type GraphReorgNodeInput = {
	id: string;
	kind: EntityKind;
	connections?: ConnectionRef[];
	mode?: GraphReorgMode;
	semantic_mode?: GraphReorgSemanticMode;
	allow_project_fallback?: boolean;
	allow_multi_parent?: boolean;
};

export type GraphReorgOptions = {
	mode?: GraphReorgMode;
	semantic_mode?: GraphReorgSemanticMode;
	allow_project_fallback?: boolean;
	allow_multi_parent?: boolean;
	dry_run?: boolean;
};

type EdgeInsert = {
	project_id: string;
	src_kind: EntityKind;
	src_id: string;
	dst_kind: EntityKind;
	dst_id: string;
	rel: RelationshipType;
	props: Record<string, unknown>;
};

type EdgeUpdate = {
	id: string;
	props: Record<string, unknown>;
	expected_props: Record<string, unknown>;
	src_kind: EntityKind;
	src_id: string;
	dst_kind: EntityKind;
	dst_id: string;
	rel: RelationshipType;
};

type DeleteScope =
	| { type: 'containment'; nodeKey: string }
	| {
			type: 'semantic';
			nodeId: string;
			rel: RelationshipType;
			direction: 'outgoing' | 'incoming';
	  }
	| { type: 'projectEdge'; edgeKey: string };

type NodePlan = {
	node: GraphReorgNodeInput;
	connections: ConnectionRef[];
	mode: GraphReorgMode;
	semanticMode: GraphReorgSemanticMode;
	allowProjectFallback: boolean;
	allowMultiParent: boolean;
	skipContainment: boolean;
	plan: ReturnType<typeof resolveConnections>;
	deleteScopes: DeleteScope[];
};

export type GraphReorgPlan = {
	edgesToCreate: EdgeInsert[];
	edgesToDelete: OntoEdge[];
	edgesToUpdate: EdgeUpdate[];
	counts: { create: number; delete: number; update: number };
	nodeCount: number;
};

export class GraphReorgConflictError extends Error {
	readonly status = 409;

	constructor(message: string) {
		super(message);
		this.name = 'GraphReorgConflictError';
	}
}

const AUTO_MANAGED_SEMANTIC_RELS = new Set<RelationshipType>([
	'supports_goal',
	'targets_milestone',
	'references',
	'produces',
	'depends_on'
]);

function buildEdgeKey(edge: {
	rel: string;
	src_kind: string;
	src_id: string;
	dst_kind: string;
	dst_id: string;
}): string {
	return `${edge.rel}:${edge.src_kind}:${edge.src_id}:${edge.dst_kind}:${edge.dst_id}`;
}

function normalizeProps(
	value: Record<string, unknown> | null | undefined
): Record<string, unknown> {
	return value ?? {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function areJsonValuesEqual(left: unknown, right: unknown): boolean {
	if (left === right) return true;

	if (Array.isArray(left) && Array.isArray(right)) {
		if (left.length !== right.length) return false;
		for (let i = 0; i < left.length; i += 1) {
			if (!areJsonValuesEqual(left[i], right[i])) return false;
		}
		return true;
	}

	if (isPlainObject(left) && isPlainObject(right)) {
		const leftKeys = Object.keys(left);
		const rightKeys = Object.keys(right);
		if (leftKeys.length !== rightKeys.length) return false;
		for (const key of leftKeys) {
			if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
			if (!areJsonValuesEqual(left[key], right[key])) return false;
		}
		return true;
	}

	return false;
}

function arePropsEqual(
	left: Record<string, unknown> | null | undefined,
	right: Record<string, unknown> | null | undefined
): boolean {
	return areJsonValuesEqual(normalizeProps(left), normalizeProps(right));
}

function mergeParents(existing: ParentRef[], additions: ParentRef[]): ParentRef[] {
	const merged = new Map<string, ParentRef>();
	for (const parent of existing) {
		merged.set(`${parent.kind}:${parent.id}`, parent);
	}
	for (const parent of additions) {
		const key = `${parent.kind}:${parent.id}`;
		if (!merged.has(key)) {
			merged.set(key, parent);
		}
	}
	return Array.from(merged.values());
}

function shouldSkipContainment(kind: EntityKind, connections: ConnectionRef[]): boolean {
	if (kind === 'output' || kind === 'source') return true;
	if (kind === 'document') {
		return !connections.some((connection) => connection.kind === 'document');
	}
	return false;
}

function buildDesiredContainmentEdges(params: {
	projectId: string;
	childKind: EntityKind;
	childId: string;
	parents: ParentRef[];
	allowProjectFallback: boolean;
	allowMultiParent: boolean;
}): EdgeInsert[] {
	const { projectId, childKind, childId, parents, allowProjectFallback, allowMultiParent } =
		params;

	const allowedParents = ALLOWED_PARENTS[childKind] ?? [];
	let desiredParents = parents.filter((parent) => allowedParents.includes(parent.kind));

	if (desiredParents.length === 0 && allowProjectFallback && allowedParents.includes('project')) {
		desiredParents = [{ kind: 'project', id: projectId, is_primary: true }];
	}

	if (desiredParents.length > 0) {
		const precedence = allowedParents;
		const indexByKind = new Map(precedence.map((kind, index) => [kind, index]));
		const minIndex = Math.min(
			...desiredParents.map(
				(parent) => indexByKind.get(parent.kind) ?? Number.POSITIVE_INFINITY
			)
		);
		desiredParents = desiredParents.filter(
			(parent) => (indexByKind.get(parent.kind) ?? Number.POSITIVE_INFINITY) === minIndex
		);
		if (!allowMultiParent && desiredParents.length > 1) {
			desiredParents = desiredParents.slice(0, 1);
		}
	}

	if (desiredParents.length > 0) {
		const hasPrimary = desiredParents.some((parent) => parent.is_primary === true);
		if (!hasPrimary) {
			desiredParents = desiredParents.map((parent, index) => ({
				...parent,
				is_primary: index === 0
			}));
		} else {
			let primaryAssigned = false;
			desiredParents = desiredParents.map((parent) => {
				if (parent.is_primary && !primaryAssigned) {
					primaryAssigned = true;
					return parent;
				}
				if (parent.is_primary && primaryAssigned) {
					return { ...parent, is_primary: false };
				}
				return parent;
			});
		}
	}

	const desiredEdges: EdgeInsert[] = [];
	for (const parent of desiredParents) {
		const rel = resolveContainmentRel(childKind, parent.kind);
		if (!rel) continue;
		desiredEdges.push({
			project_id: projectId,
			src_kind: parent.kind,
			src_id: parent.id,
			dst_kind: childKind,
			dst_id: childId,
			rel,
			props: { is_primary: parent.is_primary ?? false }
		});
	}

	return desiredEdges;
}

function getManagedSemanticScopes(
	kind: EntityKind
): Array<{ rel: RelationshipType; direction: 'outgoing' | 'incoming' }> {
	const scopes: Array<{ rel: RelationshipType; direction: 'outgoing' | 'incoming' }> = [];
	if (SUPPORTS_GOAL_KINDS.has(kind)) {
		scopes.push({ rel: 'supports_goal', direction: 'outgoing' });
	}
	if (TARGETS_MILESTONE_KINDS.has(kind)) {
		scopes.push({ rel: 'targets_milestone', direction: 'outgoing' });
	}
	if (PRODUCER_KINDS.has(kind)) {
		scopes.push({ rel: 'produces', direction: 'outgoing' });
	}
	if (kind === 'task') {
		scopes.push({ rel: 'depends_on', direction: 'outgoing' });
	}

	const referenceDirection: 'outgoing' | 'incoming' = REFERENCE_TARGET_KINDS.has(kind)
		? 'incoming'
		: 'outgoing';
	scopes.push({ rel: 'references', direction: referenceDirection });

	return scopes;
}

function buildSemanticSpecs(params: {
	kind: EntityKind;
	semanticMode: GraphReorgSemanticMode;
	entitySemantic: ResolvedSemanticEdge[];
}): ResolvedSemanticEdge[] {
	const { kind, semanticMode, entitySemantic } = params;

	if (semanticMode === 'preserve') return [];

	const specsByKey = new Map<string, ResolvedSemanticEdge>();
	for (const spec of entitySemantic) {
		const direction = spec.direction ?? 'outgoing';
		specsByKey.set(`${spec.rel}:${direction}`, { ...spec, direction });
	}

	if (semanticMode === 'replace_auto') {
		for (const scope of getManagedSemanticScopes(kind)) {
			const key = `${scope.rel}:${scope.direction}`;
			if (!specsByKey.has(key)) {
				specsByKey.set(key, {
					rel: scope.rel,
					direction: scope.direction,
					targets: [],
					mode: 'replace'
				});
			}
		}
	}

	const specs: ResolvedSemanticEdge[] = [];
	for (const spec of specsByKey.values()) {
		const direction = spec.direction ?? 'outgoing';
		const isAuto = AUTO_MANAGED_SEMANTIC_RELS.has(spec.rel);
		let mode: 'replace' | 'merge';
		if (semanticMode === 'merge') {
			mode = 'merge';
		} else if (semanticMode === 'replace_auto' && isAuto) {
			mode = 'replace';
		} else {
			mode = 'merge';
		}

		const targets = spec.targets ?? [];
		if (mode === 'merge' && targets.length === 0) {
			continue;
		}

		specs.push({
			...spec,
			direction,
			mode,
			targets
		});
	}

	return specs;
}

function buildSemanticEdges(params: {
	projectId: string;
	entity: { kind: EntityKind; id: string };
	spec: ResolvedSemanticEdge;
}): EdgeInsert[] {
	const { projectId, entity, spec } = params;
	const direction = spec.direction ?? 'outgoing';
	const targets = spec.targets ?? [];

	if (targets.length === 0) return [];

	return targets.map((target) => {
		const extraProps =
			typeof spec.props === 'function' ? spec.props(target) : (spec.props ?? {});
		const props = { is_primary: target.is_primary ?? false, ...extraProps };

		if (direction === 'outgoing') {
			return {
				project_id: projectId,
				src_kind: entity.kind,
				src_id: entity.id,
				dst_kind: target.kind,
				dst_id: target.id,
				rel: spec.rel,
				props
			};
		}

		return {
			project_id: projectId,
			src_kind: target.kind,
			src_id: target.id,
			dst_kind: entity.kind,
			dst_id: entity.id,
			rel: spec.rel,
			props
		};
	});
}

function getEdgesByDirection(
	edgesBySrc: Map<string, OntoEdge[]>,
	edgesByDst: Map<string, OntoEdge[]>,
	entityId: string,
	rel: RelationshipType,
	direction: 'outgoing' | 'incoming'
): OntoEdge[] {
	const edges = direction === 'outgoing' ? edgesBySrc.get(entityId) : edgesByDst.get(entityId);
	return (edges ?? []).filter((edge) => edge.rel === rel);
}

export async function planGraphReorg(params: {
	supabase: SupabaseClient<Database>;
	projectId: string;
	nodes: GraphReorgNodeInput[];
	options?: GraphReorgOptions;
}): Promise<GraphReorgPlan> {
	const { supabase, projectId, nodes, options } = params;

	const defaultMode: GraphReorgMode = options?.mode ?? 'replace';
	const defaultSemanticMode: GraphReorgSemanticMode = options?.semantic_mode ?? 'replace_auto';
	const defaultAllowProjectFallback = options?.allow_project_fallback ?? true;
	const defaultAllowMultiParent = options?.allow_multi_parent ?? false;

	const listedKeys = new Set(nodes.map((node) => `${node.kind}:${node.id}`));
	const nodeIds = nodes.map((node) => node.id);

	const [srcEdgesResult, dstEdgesResult] = await Promise.all([
		supabase.from('onto_edges').select('*').eq('project_id', projectId).in('src_id', nodeIds),
		supabase.from('onto_edges').select('*').eq('project_id', projectId).in('dst_id', nodeIds)
	]);

	if (srcEdgesResult.error) {
		throw new Error(srcEdgesResult.error.message);
	}
	if (dstEdgesResult.error) {
		throw new Error(dstEdgesResult.error.message);
	}

	const edgesById = new Map<string, OntoEdge>();
	for (const edge of srcEdgesResult.data ?? []) {
		edgesById.set(edge.id, edge);
	}
	for (const edge of dstEdgesResult.data ?? []) {
		if (!edgesById.has(edge.id)) {
			edgesById.set(edge.id, edge);
		}
	}

	const edgesBySrc = new Map<string, OntoEdge[]>();
	const edgesByDst = new Map<string, OntoEdge[]>();
	const existingEdgesByKey = new Map<string, OntoEdge>();

	for (const edge of edgesById.values()) {
		const srcList = edgesBySrc.get(edge.src_id) ?? [];
		srcList.push(edge);
		edgesBySrc.set(edge.src_id, srcList);

		const dstList = edgesByDst.get(edge.dst_id) ?? [];
		dstList.push(edge);
		edgesByDst.set(edge.dst_id, dstList);

		const key = buildEdgeKey(edge);
		if (!existingEdgesByKey.has(key)) {
			existingEdgesByKey.set(key, edge);
		}
	}

	const nodePlans: NodePlan[] = [];

	for (const node of nodes) {
		const connections = node.connections ?? [];
		const mode = node.mode ?? defaultMode;
		let semanticMode = node.semantic_mode ?? defaultSemanticMode;
		const allowProjectFallback = node.allow_project_fallback ?? defaultAllowProjectFallback;
		const allowMultiParent = node.allow_multi_parent ?? defaultAllowMultiParent;
		const skipContainment = shouldSkipContainment(node.kind, connections);

		if (node.kind === 'document' && connections.length === 0) {
			semanticMode = 'preserve';
		}

		const plan = resolveConnections({
			entity: { kind: node.kind, id: node.id },
			connections,
			options: {
				allowProjectFallback,
				allowMultiParent,
				mode
			}
		});

		nodePlans.push({
			node,
			connections,
			mode,
			semanticMode,
			allowProjectFallback,
			allowMultiParent,
			skipContainment,
			plan,
			deleteScopes: []
		});
	}

	const extraParentsByChildKey = new Map<string, ParentRef[]>();
	for (const nodePlan of nodePlans) {
		for (const childPlan of nodePlan.plan.childContainment) {
			const childKey = `${childPlan.child.kind}:${childPlan.child.id}`;
			if (!listedKeys.has(childKey)) continue;
			const parents = extraParentsByChildKey.get(childKey) ?? [];
			parents.push(childPlan.parent);
			extraParentsByChildKey.set(childKey, parents);
		}
	}

	const desiredEdgesByKey = new Map<string, EdgeInsert>();
	const updateEligibleKeys = new Set<string>();

	for (const nodePlan of nodePlans) {
		const nodeKey = `${nodePlan.node.kind}:${nodePlan.node.id}`;
		const extraParents = extraParentsByChildKey.get(nodeKey) ?? [];
		const containmentParents = mergeParents(
			nodePlan.plan.entityContainment?.parents ?? [],
			extraParents
		);

		const existingContainmentEdges =
			edgesByDst
				.get(nodePlan.node.id)
				?.filter(
					(edge) =>
						edge.dst_kind === nodePlan.node.kind &&
						CONTAINMENT_RELS.includes(edge.rel as RelationshipType)
				) ?? [];

		const existingParents: ParentRef[] = existingContainmentEdges.map((edge) => ({
			kind: edge.src_kind as EntityKind,
			id: edge.src_id,
			is_primary: normalizeProps(edge.props).is_primary as boolean | undefined
		}));

		const mergedParents =
			nodePlan.mode === 'merge'
				? mergeParents(existingParents, containmentParents)
				: containmentParents;

		if (!nodePlan.skipContainment) {
			const desiredContainmentEdges = buildDesiredContainmentEdges({
				projectId,
				childKind: nodePlan.node.kind,
				childId: nodePlan.node.id,
				parents: mergedParents,
				allowProjectFallback: nodePlan.plan.entityContainment?.allowProjectFallback ?? true,
				allowMultiParent: nodePlan.allowMultiParent
			});

			nodePlan.deleteScopes.push({ type: 'containment', nodeKey });

			for (const edge of desiredContainmentEdges) {
				const key = buildEdgeKey(edge);
				if (!desiredEdgesByKey.has(key)) {
					desiredEdgesByKey.set(key, edge);
				}
				updateEligibleKeys.add(key);
			}
		}

		const semanticSpecs = buildSemanticSpecs({
			kind: nodePlan.node.kind,
			semanticMode: nodePlan.semanticMode,
			entitySemantic: nodePlan.plan.entitySemantic
		});

		for (const spec of semanticSpecs) {
			if (spec.mode === 'replace') {
				nodePlan.deleteScopes.push({
					type: 'semantic',
					nodeId: nodePlan.node.id,
					rel: spec.rel,
					direction: spec.direction ?? 'outgoing'
				});
			}

			const edges = buildSemanticEdges({
				projectId,
				entity: { kind: nodePlan.node.kind, id: nodePlan.node.id },
				spec
			});

			for (const edge of edges) {
				const key = buildEdgeKey(edge);
				if (!desiredEdgesByKey.has(key)) {
					desiredEdgesByKey.set(key, edge);
				}
				if (spec.mode === 'replace') {
					updateEligibleKeys.add(key);
				}
			}
		}

		const projectEdge = nodePlan.plan.entityProjectEdge;
		if (projectEdge?.mode === 'ensure') {
			const edge: EdgeInsert = {
				project_id: projectId,
				src_kind: 'project',
				src_id: projectId,
				dst_kind: nodePlan.node.kind,
				dst_id: nodePlan.node.id,
				rel: projectEdge.rel,
				props: {}
			};
			const key = buildEdgeKey(edge);
			if (!desiredEdgesByKey.has(key)) {
				desiredEdgesByKey.set(key, edge);
			}
		} else if (projectEdge?.mode === 'remove') {
			const edgeKey = `${projectEdge.rel}:project:${projectId}:${nodePlan.node.kind}:${nodePlan.node.id}`;
			nodePlan.deleteScopes.push({ type: 'projectEdge', edgeKey });
		}
	}

	const edgesToDeleteById = new Map<string, OntoEdge>();

	for (const nodePlan of nodePlans) {
		for (const scope of nodePlan.deleteScopes) {
			if (scope.type === 'containment') {
				const [kind, id] = scope.nodeKey.split(':');
				const edges =
					edgesByDst
						.get(id)
						?.filter(
							(edge) =>
								edge.dst_kind === kind &&
								CONTAINMENT_RELS.includes(edge.rel as RelationshipType)
						) ?? [];
				for (const edge of edges) {
					const key = buildEdgeKey(edge);
					if (!desiredEdgesByKey.has(key)) {
						edgesToDeleteById.set(edge.id, edge);
					}
				}
				continue;
			}

			if (scope.type === 'semantic') {
				const edges = getEdgesByDirection(
					edgesBySrc,
					edgesByDst,
					scope.nodeId,
					scope.rel,
					scope.direction
				);
				for (const edge of edges) {
					const key = buildEdgeKey(edge);
					if (!desiredEdgesByKey.has(key)) {
						edgesToDeleteById.set(edge.id, edge);
					}
				}
				continue;
			}

			if (scope.type === 'projectEdge') {
				const existing = existingEdgesByKey.get(scope.edgeKey);
				if (existing) {
					edgesToDeleteById.set(existing.id, existing);
				}
			}
		}
	}

	const edgesToUpdateById = new Map<string, EdgeUpdate>();
	const edgesToCreateByKey = new Map<string, EdgeInsert>();

	for (const [key, desired] of desiredEdgesByKey.entries()) {
		const existing = existingEdgesByKey.get(key);
		if (!existing) {
			edgesToCreateByKey.set(key, desired);
			continue;
		}

		if (updateEligibleKeys.has(key) && !arePropsEqual(existing.props, desired.props)) {
			edgesToUpdateById.set(existing.id, {
				id: existing.id,
				props: normalizeProps(desired.props),
				expected_props: normalizeProps(existing.props),
				src_kind: existing.src_kind as EntityKind,
				src_id: existing.src_id,
				dst_kind: existing.dst_kind as EntityKind,
				dst_id: existing.dst_id,
				rel: existing.rel as RelationshipType
			});
		}
	}

	const edgesToCreate = Array.from(edgesToCreateByKey.values());
	const edgesToDelete = Array.from(edgesToDeleteById.values()).filter(
		(edge) => !edgesToUpdateById.has(edge.id)
	);
	const edgesToUpdate = Array.from(edgesToUpdateById.values());

	return {
		edgesToCreate,
		edgesToDelete,
		edgesToUpdate,
		counts: {
			create: edgesToCreate.length,
			delete: edgesToDelete.length,
			update: edgesToUpdate.length
		},
		nodeCount: nodes.length
	};
}

export async function applyGraphReorgPlan(params: {
	supabase: SupabaseClient<Database>;
	projectId: string;
	plan: GraphReorgPlan;
}): Promise<void> {
	const { supabase, plan, projectId } = params;

	const { error } = await supabase.rpc('apply_graph_reorg_changes', {
		p_project_id: projectId,
		p_deletes: plan.edgesToDelete.map((edge) => ({
			id: edge.id,
			src_kind: edge.src_kind,
			src_id: edge.src_id,
			rel: edge.rel,
			dst_kind: edge.dst_kind,
			dst_id: edge.dst_id,
			props: normalizeProps(edge.props)
		})),
		p_updates: plan.edgesToUpdate.map((edge) => ({
			id: edge.id,
			src_kind: edge.src_kind,
			src_id: edge.src_id,
			rel: edge.rel,
			dst_kind: edge.dst_kind,
			dst_id: edge.dst_id,
			props: normalizeProps(edge.props),
			expected_props: normalizeProps(edge.expected_props)
		})),
		p_inserts: plan.edgesToCreate.map((edge) => ({
			src_kind: edge.src_kind,
			src_id: edge.src_id,
			rel: edge.rel,
			dst_kind: edge.dst_kind,
			dst_id: edge.dst_id,
			props: normalizeProps(edge.props)
		}))
	});

	if (error) {
		if (error.code === '40001') {
			throw new GraphReorgConflictError(
				'Graph changed since planning. Reload and try again.'
			);
		}
		throw new Error(error.message);
	}
}
