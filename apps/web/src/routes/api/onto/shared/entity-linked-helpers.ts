// apps/web/src/routes/api/onto/shared/entity-linked-helpers.ts
/**
 * Shared helper functions for fetching linked entities via onto_edges.
 *
 * This provides a generic implementation that can be used by any entity type's
 * /full endpoint to resolve linked entities in a single request.
 *
 * Performance optimization: Consolidates what would be 2 API calls (entity + linked)
 * into a single database roundtrip.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type EntityKind = 'task' | 'plan' | 'goal' | 'milestone' | 'document' | 'risk';

export interface LinkedEntity {
	id: string;
	name?: string;
	title?: string;
	type_key?: string;
	state_key?: string;
	due_at?: string;
	edge_id: string;
	edge_rel: string;
	edge_direction: 'outgoing' | 'incoming';
}

export interface LinkedEntitiesResult {
	tasks: LinkedEntity[];
	plans: LinkedEntity[];
	goals: LinkedEntity[];
	milestones: LinkedEntity[];
	documents: LinkedEntity[];
	risks: LinkedEntity[];
}

const VALID_KINDS: EntityKind[] = ['task', 'plan', 'goal', 'milestone', 'document', 'risk'];

function isValidKind(kind: string): kind is EntityKind {
	return VALID_KINDS.includes(kind as EntityKind);
}

/**
 * Resolves all entities linked to any source entity via onto_edges.
 *
 * @param supabase - Supabase client
 * @param sourceId - The source entity ID
 * @param sourceKind - The source entity kind (for filtering self-references)
 * @returns Object containing arrays of linked entities by type
 */
export async function resolveLinkedEntitiesGeneric(
	supabase: SupabaseClient,
	sourceId: string,
	sourceKind: EntityKind
): Promise<LinkedEntitiesResult> {
	const result: LinkedEntitiesResult = {
		tasks: [],
		plans: [],
		goals: [],
		milestones: [],
		documents: [],
		risks: []
	};

	// Fetch all edges where entity is source or destination
	const { data: edges, error } = await supabase
		.from('onto_edges')
		.select('*')
		.or(`src_id.eq.${sourceId},dst_id.eq.${sourceId}`);

	if (error || !edges || edges.length === 0) {
		return result;
	}

	// Group entity IDs by type with edge info
	const entityMap = new Map<
		string,
		{ kind: EntityKind; edgeId: string; rel: string; direction: 'outgoing' | 'incoming' }
	>();

	for (const edge of edges) {
		const isSource = edge.src_id === sourceId;
		const linkedId = isSource ? edge.dst_id : edge.src_id;
		const linkedKind = isSource ? edge.dst_kind : edge.src_kind;

		// Skip self-references and invalid kinds
		if (linkedId === sourceId || !isValidKind(linkedKind)) continue;

		// Skip if already processed
		if (entityMap.has(linkedId)) continue;

		entityMap.set(linkedId, {
			kind: linkedKind,
			edgeId: edge.id,
			rel: edge.rel,
			direction: isSource ? 'outgoing' : 'incoming'
		});
	}

	// Group IDs by kind for batch fetching
	const idsByKind: Record<EntityKind, string[]> = {
		task: [],
		plan: [],
		goal: [],
		milestone: [],
		document: [],
		risk: []
	};

	for (const [id, info] of entityMap) {
		idsByKind[info.kind].push(id);
	}

	// Fetch entity details in parallel
	const [tasks, plans, goals, milestones, documents, risks] = await Promise.all([
		fetchEntityDetails(supabase, 'onto_tasks', idsByKind.task, [
			'id',
			'title',
			'state_key',
			'type_key'
		]),
		fetchEntityDetails(supabase, 'onto_plans', idsByKind.plan, [
			'id',
			'name',
			'state_key',
			'type_key'
		]),
		fetchEntityDetails(supabase, 'onto_goals', idsByKind.goal, [
			'id',
			'name',
			'state_key',
			'type_key'
		]),
		fetchEntityDetails(supabase, 'onto_milestones', idsByKind.milestone, [
			'id',
			'title',
			'due_at',
			'type_key'
		]),
		fetchEntityDetails(supabase, 'onto_documents', idsByKind.document, [
			'id',
			'title',
			'type_key',
			'state_key'
		]),
		fetchEntityDetails(supabase, 'onto_risks', idsByKind.risk, [
			'id',
			'title',
			'state_key',
			'type_key',
			'impact'
		])
	]);

	// Map results with edge info
	result.tasks = mapEntitiesToLinked(tasks, entityMap, 'task');
	result.plans = mapEntitiesToLinked(plans, entityMap, 'plan');
	result.goals = mapEntitiesToLinked(goals, entityMap, 'goal');
	result.milestones = mapEntitiesToLinked(milestones, entityMap, 'milestone');
	result.documents = filterScratchDocuments(
		mapEntitiesToLinked(documents, entityMap, 'document')
	);
	result.risks = mapEntitiesToLinked(risks, entityMap, 'risk');

	return result;
}

async function fetchEntityDetails(
	supabase: SupabaseClient,
	table: string,
	ids: string[],
	columns: string[]
): Promise<any[]> {
	if (ids.length === 0) return [];

	let query = supabase.from(table).select(columns.join(', ')).in('id', ids);

	// All ontology entities now support soft deletes
	query = query.is('deleted_at', null);

	const { data, error } = await query;

	if (error) {
		console.error(`[Entity Linked Helpers] Error fetching ${table}:`, error);
		return [];
	}

	return data || [];
}

function mapEntitiesToLinked(
	entities: any[],
	entityMap: Map<
		string,
		{ kind: EntityKind; edgeId: string; rel: string; direction: 'outgoing' | 'incoming' }
	>,
	kind: EntityKind
): LinkedEntity[] {
	return entities.map((e) => {
		const info = entityMap.get(e.id);
		return {
			id: e.id,
			name: e.name,
			title: e.title,
			type_key: e.type_key,
			state_key: e.state_key,
			due_at: e.due_at,
			edge_id: info?.edgeId || '',
			edge_rel: info?.rel || '',
			edge_direction: info?.direction || 'outgoing'
		};
	});
}

function filterScratchDocuments(documents: LinkedEntity[]): LinkedEntity[] {
	return documents.filter((d) => {
		const typeKey = d.type_key || '';
		return !typeKey.includes('scratch') && !typeKey.includes('workspace');
	});
}

/**
 * Check if there are any linked entities
 */
export function hasLinkedEntities(linked: LinkedEntitiesResult): boolean {
	return (
		linked.tasks.length > 0 ||
		linked.plans.length > 0 ||
		linked.goals.length > 0 ||
		linked.milestones.length > 0 ||
		linked.documents.length > 0 ||
		linked.risks.length > 0
	);
}
