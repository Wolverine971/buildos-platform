// apps/web/src/lib/services/ontology/containment-organizer.ts
/**
 * Containment auto-organizer for ontology edges.
 *
 * Applies canonical parent -> child containment edges and removes redundant
 * project-level links when deeper parents exist.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import type { EntityKind, RelationshipType } from './edge-direction';

export type ParentRef = {
	kind: EntityKind;
	id: string;
	is_primary?: boolean;
};

type ContainmentEdgeProps = { is_primary: boolean } & { [key: string]: Json | undefined };

type ContainmentEdge = {
	project_id: string;
	src_kind: EntityKind;
	src_id: string;
	dst_kind: EntityKind;
	dst_id: string;
	rel: RelationshipType;
	props: ContainmentEdgeProps;
};

export const CONTAINMENT_RELS: RelationshipType[] = [
	'has_goal',
	'has_milestone',
	'has_plan',
	'has_task',
	'has_risk',
	'has_requirement',
	'has_metric',
	'has_part',
	'contains'
];

export const ALLOWED_PARENTS: Record<EntityKind, EntityKind[]> = {
	project: [],
	goal: ['project'],
	milestone: ['goal'],
	plan: ['milestone', 'goal', 'project'],
	task: ['plan', 'milestone', 'goal', 'project'],
	document: ['document', 'project'],
	risk: ['task', 'plan', 'milestone', 'goal', 'project'],
	requirement: ['task', 'milestone', 'plan', 'project'],
	metric: ['task', 'plan', 'milestone', 'goal', 'risk', 'project'],
	source: ['project']
};

export function normalizeParentRefs(input?: {
	parent?: ParentRef | null;
	parents?: ParentRef[] | null;
}): ParentRef[] {
	if (!input) return [];

	const rawParents = Array.isArray(input.parents)
		? input.parents
		: input.parent
			? [input.parent]
			: [];

	const deduped = new Map<string, ParentRef>();
	for (const parent of rawParents) {
		if (!parent || !parent.kind || !parent.id) continue;
		const key = `${parent.kind}:${parent.id}`;
		if (!deduped.has(key)) deduped.set(key, parent);
	}

	return Array.from(deduped.values());
}

export function resolveContainmentRel(
	childKind: EntityKind,
	parentKind: EntityKind
): RelationshipType | null {
	if (childKind === 'goal' && parentKind === 'project') return 'has_goal';
	if (childKind === 'milestone' && parentKind === 'goal') return 'has_milestone';
	if (childKind === 'plan' && ['project', 'goal', 'milestone'].includes(parentKind))
		return 'has_plan';
	if (childKind === 'task' && ['project', 'goal', 'plan', 'milestone'].includes(parentKind))
		return 'has_task';
	if (
		childKind === 'risk' &&
		['project', 'goal', 'milestone', 'plan', 'task'].includes(parentKind)
	)
		return 'has_risk';
	if (
		childKind === 'requirement' &&
		['project', 'milestone', 'plan', 'task'].includes(parentKind)
	)
		return 'has_requirement';
	if (
		childKind === 'metric' &&
		['project', 'goal', 'milestone', 'plan', 'task', 'risk'].includes(parentKind)
	)
		return 'has_metric';
	if (childKind === 'document' && parentKind === 'document') return 'has_part';
	return null;
}

function buildEdgeKey(edge: {
	src_kind: string;
	src_id: string;
	dst_kind: string;
	dst_id: string;
	rel: string;
}): string {
	return `${edge.rel}:${edge.src_kind}:${edge.src_id}:${edge.dst_kind}:${edge.dst_id}`;
}

export async function applyContainmentEdges(params: {
	supabase: SupabaseClient<Database>;
	projectId: string;
	childKind: EntityKind;
	childId: string;
	parents?: ParentRef[];
	allowProjectFallback?: boolean;
	allowMultiParent?: boolean;
}): Promise<{ created: number; deleted: number; updated: number }> {
	const {
		supabase,
		projectId,
		childKind,
		childId,
		parents = [],
		allowProjectFallback = true,
		allowMultiParent = false
	} = params;

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

	for (const parent of desiredParents) {
		if (!allowedParents.includes(parent.kind)) {
			throw new Error(
				`Invalid parent kind "${parent.kind}" for ${childKind}. Allowed: ${allowedParents.join(
					', '
				)}`
			);
		}
	}

	const desiredEdges: ContainmentEdge[] = desiredParents.flatMap((parent) => {
		const rel = resolveContainmentRel(childKind, parent.kind);
		if (!rel) return [];
		return [
			{
				project_id: projectId,
				src_kind: parent.kind,
				src_id: parent.id,
				dst_kind: childKind,
				dst_id: childId,
				rel,
				props: {
					is_primary: parent.is_primary ?? false
				}
			}
		];
	});

	const desiredKeys = new Set(desiredEdges.map(buildEdgeKey));

	const { data: existingEdges, error: existingError } = await supabase
		.from('onto_edges')
		.select('id, src_kind, src_id, dst_kind, dst_id, rel, props')
		.eq('dst_kind', childKind)
		.eq('dst_id', childId)
		.in('rel', CONTAINMENT_RELS);

	if (existingError) {
		throw new Error(existingError.message);
	}

	const existingByKey = new Map<string, (typeof existingEdges)[number]>();
	for (const edge of existingEdges ?? []) {
		existingByKey.set(buildEdgeKey(edge), edge);
	}

	const toDelete = (existingEdges ?? []).filter((edge) => !desiredKeys.has(buildEdgeKey(edge)));

	const toInsert = desiredEdges.filter((edge) => !existingByKey.has(buildEdgeKey(edge)));

	const toUpdate = desiredEdges.filter((edge) => {
		const existing = existingByKey.get(buildEdgeKey(edge));
		if (!existing) return false;
		const existingProps = (existing.props ?? {}) as Record<string, unknown>;
		const desiredPrimary = edge.props.is_primary ?? false;
		return existingProps.is_primary !== desiredPrimary;
	});

	let deleted = 0;
	if (toDelete.length > 0) {
		const { error: deleteError } = await supabase
			.from('onto_edges')
			.delete()
			.in(
				'id',
				toDelete.map((edge) => edge.id)
			);
		if (deleteError) throw new Error(deleteError.message);
		deleted = toDelete.length;
	}

	let created = 0;
	if (toInsert.length > 0) {
		const { error: insertError } = await supabase.from('onto_edges').insert(toInsert);
		if (insertError) throw new Error(insertError.message);
		created = toInsert.length;
	}

	let updated = 0;
	for (const edge of toUpdate) {
		const existing = existingByKey.get(buildEdgeKey(edge));
		if (!existing) continue;
		const { error: updateError } = await supabase
			.from('onto_edges')
			.update({ props: edge.props })
			.eq('id', existing.id);
		if (updateError) throw new Error(updateError.message);
		updated += 1;
	}

	return { created, deleted, updated };
}

export async function fetchContainmentParents(params: {
	supabase: SupabaseClient<Database>;
	childKind: EntityKind;
	childId: string;
}): Promise<ParentRef[]> {
	const { supabase, childKind, childId } = params;

	const { data, error } = await supabase
		.from('onto_edges')
		.select('src_kind, src_id, rel, props')
		.eq('dst_kind', childKind)
		.eq('dst_id', childId)
		.in('rel', CONTAINMENT_RELS);

	if (error) {
		throw new Error(error.message);
	}

	const parents: ParentRef[] = [];
	for (const edge of data ?? []) {
		parents.push({
			kind: edge.src_kind as EntityKind,
			id: edge.src_id,
			is_primary: (edge.props as Record<string, unknown> | null)?.is_primary as
				| boolean
				| undefined
		});
	}

	return parents;
}
