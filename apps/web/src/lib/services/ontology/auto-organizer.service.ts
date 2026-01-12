// apps/web/src/lib/services/ontology/auto-organizer.service.ts
/**
 * Auto-organizes ontology edges for a single entity based on relationship inputs.
 *
 * Centralizes edge validation, creation, and deletion for containment + semantic links.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { EntityKind, RelationshipType } from './edge-direction';
import {
	applyContainmentEdges,
	fetchContainmentParents,
	normalizeParentRefs,
	type ParentRef
} from './containment-organizer';
import {
	resolveConnections,
	type ConnectionOptions,
	type ConnectionRef
} from './relationship-resolver';

export const ENTITY_TABLES = {
	project: 'onto_projects',
	plan: 'onto_plans',
	task: 'onto_tasks',
	goal: 'onto_goals',
	milestone: 'onto_milestones',
	document: 'onto_documents',
	risk: 'onto_risks',
	requirement: 'onto_requirements',
	metric: 'onto_metrics',
	source: 'onto_sources'
} as const satisfies Record<EntityKind, keyof Database['public']['Tables']>;

type Supabase = SupabaseClient<Database>;

export class AutoOrganizeError extends Error {
	readonly status: number;

	constructor(message: string, status = 400) {
		super(message);
		this.name = 'AutoOrganizeError';
		this.status = status;
	}
}

export type SemanticEdgeSpec = {
	rel: RelationshipType;
	direction?: 'outgoing' | 'incoming';
	targets?: ParentRef[];
	mode?: 'replace' | 'merge';
	props?: Record<string, unknown> | ((target: ParentRef) => Record<string, unknown>);
};

export type AutoOrganizeRequest = {
	supabase: Supabase;
	projectId: string;
	entity: { kind: EntityKind; id: string };
	containment?: {
		parents?: ParentRef[];
		allowProjectFallback?: boolean;
	};
	semantic?: SemanticEdgeSpec[];
	projectEdge?: {
		rel: RelationshipType;
		mode?: 'ensure' | 'remove';
	};
};

export type AutoOrganizeConnectionsRequest = {
	supabase: Supabase;
	projectId: string;
	entity: { kind: EntityKind; id: string };
	connections?: ConnectionRef[];
	options?: ConnectionOptions;
};

export function toParentRefs(input?: {
	parent?: ParentRef | null;
	parents?: ParentRef[] | null;
}): ParentRef[] {
	return normalizeParentRefs(input);
}

export async function assertEntityRefsInProject(params: {
	supabase: Supabase;
	projectId: string;
	refs: ParentRef[];
	allowProject?: boolean;
}): Promise<void> {
	const { supabase, projectId, refs, allowProject = true } = params;

	for (const ref of refs) {
		if (ref.kind === 'project') {
			if (!allowProject) {
				throw new AutoOrganizeError('Project cannot be used as a parent here', 400);
			}
			if (ref.id !== projectId) {
				throw new AutoOrganizeError('parent project_id must match project_id', 400);
			}
			continue;
		}

		const table = ENTITY_TABLES[ref.kind];
		if (!table) {
			throw new AutoOrganizeError(`Unsupported entity kind: ${ref.kind}`, 400);
		}

		const { data, error } = await supabase
			.from(table)
			.select('id')
			.eq('id', ref.id)
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		if (error) {
			throw new AutoOrganizeError(error.message, 500);
		}

		if (!data) {
			throw new AutoOrganizeError(`${ref.kind} not found`, 404);
		}
	}
}

async function applySemanticEdges(params: {
	supabase: Supabase;
	projectId: string;
	entity: { kind: EntityKind; id: string };
	spec: SemanticEdgeSpec;
}): Promise<void> {
	const { supabase, projectId, entity, spec } = params;
	const direction = spec.direction ?? 'outgoing';
	const targets = spec.targets ?? [];
	const mode = spec.mode ?? 'replace';

	await assertEntityRefsInProject({ supabase, projectId, refs: targets, allowProject: false });

	if (mode === 'replace') {
		if (direction === 'outgoing') {
			await supabase
				.from('onto_edges')
				.delete()
				.eq('src_kind', entity.kind)
				.eq('src_id', entity.id)
				.eq('rel', spec.rel);
		} else {
			await supabase
				.from('onto_edges')
				.delete()
				.eq('dst_kind', entity.kind)
				.eq('dst_id', entity.id)
				.eq('rel', spec.rel);
		}
	}

	if (targets.length === 0) {
		return;
	}

	const edges = targets.map((target) => {
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

	const { error } = await supabase.from('onto_edges').insert(edges);
	if (error) {
		throw new AutoOrganizeError(error.message, 500);
	}
}

async function ensureProjectEdge(params: {
	supabase: Supabase;
	projectId: string;
	entity: { kind: EntityKind; id: string };
	rel: RelationshipType;
}): Promise<void> {
	const { supabase, projectId, entity, rel } = params;
	const { data, error } = await supabase
		.from('onto_edges')
		.select('id')
		.eq('src_kind', 'project')
		.eq('src_id', projectId)
		.eq('dst_kind', entity.kind)
		.eq('dst_id', entity.id)
		.eq('rel', rel)
		.maybeSingle();

	if (error) {
		throw new AutoOrganizeError(error.message, 500);
	}

	if (!data) {
		const { error: insertError } = await supabase.from('onto_edges').insert({
			project_id: projectId,
			src_kind: 'project',
			src_id: projectId,
			dst_kind: entity.kind,
			dst_id: entity.id,
			rel,
			props: {}
		});

		if (insertError) {
			throw new AutoOrganizeError(insertError.message, 500);
		}
	}
}

async function removeProjectEdge(params: {
	supabase: Supabase;
	projectId: string;
	entity: { kind: EntityKind; id: string };
	rel: RelationshipType;
}): Promise<void> {
	const { supabase, projectId, entity, rel } = params;
	const { error } = await supabase
		.from('onto_edges')
		.delete()
		.eq('src_kind', 'project')
		.eq('src_id', projectId)
		.eq('dst_kind', entity.kind)
		.eq('dst_id', entity.id)
		.eq('rel', rel);

	if (error) {
		throw new AutoOrganizeError(error.message, 500);
	}
}

export async function autoOrganizeEntityEdges(request: AutoOrganizeRequest): Promise<void> {
	const { supabase, projectId, entity, containment, semantic, projectEdge } = request;

	if (containment?.parents) {
		await assertEntityRefsInProject({
			supabase,
			projectId,
			refs: containment.parents,
			allowProject: true
		});

		await applyContainmentEdges({
			supabase,
			projectId,
			childKind: entity.kind,
			childId: entity.id,
			parents: containment.parents,
			allowProjectFallback: containment.allowProjectFallback ?? true
		});
	}

	if (projectEdge?.mode === 'ensure') {
		await ensureProjectEdge({ supabase, projectId, entity, rel: projectEdge.rel });
	} else if (projectEdge?.mode === 'remove') {
		await removeProjectEdge({ supabase, projectId, entity, rel: projectEdge.rel });
	}

	if (semantic?.length) {
		for (const spec of semantic) {
			await applySemanticEdges({ supabase, projectId, entity, spec });
		}
	}
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

export async function autoOrganizeConnections(
	request: AutoOrganizeConnectionsRequest
): Promise<void> {
	const { supabase, projectId, entity, connections = [], options } = request;

	if (connections.length > 0) {
		await assertEntityRefsInProject({
			supabase,
			projectId,
			refs: connections,
			allowProject: true
		});
	}

	const plan = resolveConnections({ entity, connections, options });
	const allowMultiParent = options?.allowMultiParent ?? false;
	const mode = options?.mode ?? 'replace';
	const skipContainment = options?.skipContainment ?? false;

	let containmentParents = plan.entityContainment?.parents ?? [];
	if (!skipContainment && mode === 'merge') {
		const existing = await fetchContainmentParents({
			supabase,
			childKind: entity.kind,
			childId: entity.id
		});
		containmentParents = mergeParents(existing, containmentParents);
	}

	await autoOrganizeEntityEdges({
		supabase,
		projectId,
		entity,
		containment:
			plan.entityContainment && !skipContainment
				? {
						parents: containmentParents,
						allowProjectFallback: plan.entityContainment.allowProjectFallback
					}
				: undefined,
		semantic: plan.entitySemantic,
		projectEdge: plan.entityProjectEdge
	});

	if (!skipContainment) {
		for (const childPlan of plan.childContainment) {
			const existing =
				childPlan.mode === 'merge'
					? await fetchContainmentParents({
							supabase,
							childKind: childPlan.child.kind,
							childId: childPlan.child.id
						})
					: [];
			const parents = mergeParents(existing, [childPlan.parent]);

			await applyContainmentEdges({
				supabase,
				projectId,
				childKind: childPlan.child.kind,
				childId: childPlan.child.id,
				parents,
				allowProjectFallback: true,
				allowMultiParent
			});
		}
	}
}
