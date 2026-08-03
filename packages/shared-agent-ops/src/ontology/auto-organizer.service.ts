// packages/shared-agent-ops/src/ontology/auto-organizer.service.ts
/**
 * Auto-organizes ontology edges for a single entity based on relationship inputs.
 *
 * Centralizes edge validation, creation, and deletion for containment + semantic links.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import type { EntityKind, RelationshipType } from './edge-direction';
import {
	applyContainmentEdges,
	applyPlannedContainmentEdges,
	fetchContainmentEdges,
	normalizeParentRefs,
	type ContainmentEdge,
	type ParentRef
} from './containment-organizer';
import {
	buildRelationshipMutationPlan,
	buildSemanticMutationEdges,
	resolveConnections,
	type ConnectionOptions,
	type ConnectionRef,
	type PlannedSemanticMutation,
	type RelationshipMutationPlan
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
	source: 'onto_sources',
	event: 'onto_events'
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
	/** The caller already validated every reference in this exact request. */
	referencesValidated?: boolean;
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
	/** Skip duplicate validation after a pre-insert/pre-update validation guard. */
	referencesValidated?: boolean;
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
	const refsByKind = new Map<
		Exclude<EntityKind, 'project'>,
		{ table: (typeof ENTITY_TABLES)[Exclude<EntityKind, 'project'>]; ids: string[] }
	>();

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
		const kind = ref.kind as Exclude<EntityKind, 'project'>;
		const group = refsByKind.get(kind);
		if (!group) {
			refsByKind.set(kind, { table, ids: [ref.id] });
		} else if (!group.ids.includes(ref.id)) {
			group.ids.push(ref.id);
		}
	}

	const validationResults = await Promise.all(
		Array.from(refsByKind, async ([kind, group]) => {
			const { data, error } = await supabase
				.from(group.table)
				.select('id')
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.in('id', group.ids);

			return { kind, ids: group.ids, data, error };
		})
	);

	for (const result of validationResults) {
		if (result.error) {
			throw new AutoOrganizeError(result.error.message, 500);
		}

		const foundIds = new Set((result.data ?? []).map((row) => row.id));
		if (result.ids.some((id) => !foundIds.has(id))) {
			throw new AutoOrganizeError(`${result.kind} not found`, 404);
		}
	}
}

async function applySemanticEdges(params: {
	supabase: Supabase;
	projectId: string;
	entity: { kind: EntityKind; id: string };
	spec: SemanticEdgeSpec;
	referencesValidated?: boolean;
}): Promise<void> {
	const { supabase, projectId, entity, spec, referencesValidated = false } = params;
	const direction = spec.direction ?? 'outgoing';
	const targets = spec.targets ?? [];
	const mode = spec.mode ?? 'replace';

	if (!referencesValidated) {
		await assertEntityRefsInProject({
			supabase,
			projectId,
			refs: targets,
			allowProject: false
		});
	}

	await applyPlannedSemanticMutation({
		supabase,
		mutation: {
			type: 'semantic',
			entity,
			rel: spec.rel,
			direction,
			mode,
			desiredEdges: buildSemanticMutationEdges({ projectId, entity, spec })
		}
	});
}

async function applyPlannedSemanticMutation(params: {
	supabase: Supabase;
	mutation: PlannedSemanticMutation;
}): Promise<void> {
	const { supabase, mutation } = params;

	if (mutation.mode === 'replace') {
		const deleteQuery = supabase.from('onto_edges').delete();
		const { error } =
			mutation.direction === 'outgoing'
				? await deleteQuery
						.eq('src_kind', mutation.entity.kind)
						.eq('src_id', mutation.entity.id)
						.eq('rel', mutation.rel)
				: await deleteQuery
						.eq('dst_kind', mutation.entity.kind)
						.eq('dst_id', mutation.entity.id)
						.eq('rel', mutation.rel);

		if (error) {
			throw new AutoOrganizeError(error.message, 500);
		}
	}

	if (mutation.desiredEdges.length === 0) return;

	const edges = mutation.desiredEdges.map((edge) => ({
		...edge,
		props: edge.props as Json
	}));
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
	// Project membership is now implied by the entity project_id FK. Treat legacy
	// "ensure" requests as cleanup so older callers stop reintroducing direct
	// project edges.
	await removeProjectEdge(params);
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
	const {
		supabase,
		projectId,
		entity,
		containment,
		semantic,
		projectEdge,
		referencesValidated = false
	} = request;

	if (containment?.parents) {
		if (!referencesValidated) {
			await assertEntityRefsInProject({
				supabase,
				projectId,
				refs: containment.parents,
				allowProject: true
			});
		}

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
			await applySemanticEdges({
				supabase,
				projectId,
				entity,
				spec,
				referencesValidated
			});
		}
	}
}

function entityKey(entity: { kind: EntityKind; id: string }): string {
	return `${entity.kind}:${entity.id}`;
}

async function fetchExistingContainmentForPlan(params: {
	supabase: Supabase;
	entity: { kind: EntityKind; id: string };
	resolved: ReturnType<typeof resolveConnections>;
	options?: ConnectionOptions;
}): Promise<Map<string, ContainmentEdge[]>> {
	const { supabase, entity, resolved, options } = params;
	if (options?.skipContainment) return new Map();

	const children = new Map<string, { kind: EntityKind; id: string }>();
	if (resolved.entityContainment?.mode === 'merge') {
		children.set(entityKey(entity), entity);
	}
	for (const childPlan of resolved.childContainment) {
		if (childPlan.mode === 'merge') {
			children.set(entityKey(childPlan.child), childPlan.child);
		}
	}

	const entries = await Promise.all(
		Array.from(children, async ([key, child]) => {
			const edges = await fetchContainmentEdges({
				supabase,
				childKind: child.kind,
				childId: child.id
			});
			return [key, edges] as const;
		})
	);

	return new Map(entries);
}

export async function applyRelationshipMutationPlan(params: {
	supabase: Supabase;
	projectId: string;
	plan: RelationshipMutationPlan;
}): Promise<void> {
	const { supabase, projectId, plan } = params;
	const applyContainment = async (
		mutation: NonNullable<RelationshipMutationPlan['entityContainment']>
	) =>
		applyPlannedContainmentEdges({
			supabase,
			childKind: mutation.child.kind,
			childId: mutation.child.id,
			desiredEdges: mutation.desiredEdges
		});

	if (plan.entityContainment) {
		await applyContainment(plan.entityContainment);
	}

	for (const mutation of plan.projectEdges) {
		await removeProjectEdge({
			supabase,
			projectId,
			entity: mutation.entity,
			rel: mutation.rel
		});
	}

	for (const mutation of plan.semantic) {
		await applyPlannedSemanticMutation({ supabase, mutation });
	}

	for (const mutation of plan.childContainment) {
		await applyContainment(mutation);
	}
}

export async function autoOrganizeConnections(
	request: AutoOrganizeConnectionsRequest
): Promise<void> {
	const {
		supabase,
		projectId,
		entity,
		connections = [],
		options,
		referencesValidated = false
	} = request;

	if (connections.length > 0 && !referencesValidated) {
		await assertEntityRefsInProject({
			supabase,
			projectId,
			refs: connections,
			allowProject: true
		});
	}

	const plan = resolveConnections({ entity, connections, options });
	const existingContainmentByChild = await fetchExistingContainmentForPlan({
		supabase,
		entity,
		resolved: plan,
		options
	});
	const mutationPlan = buildRelationshipMutationPlan({
		projectId,
		entity,
		resolved: plan,
		options,
		references: connections,
		existingContainmentByChild
	});

	await applyRelationshipMutationPlan({ supabase, projectId, plan: mutationPlan });
}
