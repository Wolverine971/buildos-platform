// apps/web/src/routes/api/onto/edges/linked/+server.ts
/**
 * GET /api/onto/edges/linked
 *
 * Fetches linked entities and available entities for the LinkedEntities component.
 * Returns both currently linked items (via onto_edges) and all available items
 * in the project that could be linked.
 *
 * Query params:
 * - sourceId: UUID of the source entity
 * - sourceKind: Type of source entity (task, plan, goal, etc.)
 * - projectId: UUID of the project context
 *
 * Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { SupabaseClient } from '@supabase/supabase-js';

type EntityKind = 'task' | 'plan' | 'goal' | 'milestone' | 'document' | 'output' | 'risk';

interface LinkedEntity {
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

interface AvailableEntity {
	id: string;
	name?: string;
	title?: string;
	state_key?: string;
	type_key?: string;
	due_at?: string;
	isLinked: boolean;
}

interface LinkedEntitiesResult {
	tasks: LinkedEntity[];
	plans: LinkedEntity[];
	goals: LinkedEntity[];
	milestones: LinkedEntity[];
	documents: LinkedEntity[];
	outputs: LinkedEntity[];
	risks: LinkedEntity[];
}

interface AvailableEntitiesResult {
	tasks: AvailableEntity[];
	plans: AvailableEntity[];
	goals: AvailableEntity[];
	milestones: AvailableEntity[];
	documents: AvailableEntity[];
	outputs: AvailableEntity[];
	risks: AvailableEntity[];
}

const VALID_KINDS: EntityKind[] = [
	'task',
	'plan',
	'goal',
	'milestone',
	'document',
	'output',
	'risk'
];

function isValidKind(kind: string): kind is EntityKind {
	return VALID_KINDS.includes(kind as EntityKind);
}

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const sourceId = url.searchParams.get('sourceId');
		const sourceKind = url.searchParams.get('sourceKind');
		const projectId = url.searchParams.get('projectId');
		// Performance optimization: skip fetching available entities on initial load
		// They will be fetched lazily via /api/onto/edges/available when user clicks "Add"
		const includeAvailable = url.searchParams.get('includeAvailable') !== 'false';

		if (!sourceId || !sourceKind || !projectId) {
			return ApiResponse.badRequest('sourceId, sourceKind, and projectId are required');
		}

		if (!isValidKind(sourceKind)) {
			return ApiResponse.badRequest(`Invalid sourceKind: ${sourceKind}`);
		}

		const supabase = locals.supabase;

		// Verify user has access to the project
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId) {
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', projectId)
			.is('deleted_at', null)
			.eq('created_by', actorId)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		// Fetch linked entities
		const linkedEntities = await fetchLinkedEntities(supabase, sourceId, sourceKind);

		// Only fetch available entities if explicitly requested (backwards compatibility)
		// New pattern: skip this on initial load, fetch lazily when user clicks "Add"
		let availableEntities: AvailableEntitiesResult = {
			tasks: [],
			plans: [],
			goals: [],
			milestones: [],
			documents: [],
			outputs: [],
			risks: []
		};

		if (includeAvailable) {
			availableEntities = await fetchAvailableEntities(
				supabase,
				projectId,
				sourceId,
				sourceKind,
				linkedEntities
			);
		}

		return ApiResponse.success({
			linkedEntities,
			availableEntities
		});
	} catch (error) {
		console.error('[LinkedEntities API] Error:', error);
		return ApiResponse.internalError(error, 'Failed to fetch linked entities');
	}
};

async function fetchLinkedEntities(
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
		outputs: [],
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
		output: [],
		risk: []
	};

	for (const [id, info] of entityMap) {
		idsByKind[info.kind].push(id);
	}

	// Fetch entity details in parallel
	const [tasks, plans, goals, milestones, documents, outputs, risks] = await Promise.all([
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
		fetchEntityDetails(supabase, 'onto_outputs', idsByKind.output, [
			'id',
			'name',
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
	result.outputs = mapEntitiesToLinked(outputs, entityMap, 'output');
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

	const { data, error } = await supabase
		.from(table)
		.select(columns.join(', '))
		.in('id', ids)
		.is('deleted_at', null);

	if (error) {
		console.error(`[LinkedEntities API] Error fetching ${table}:`, error);
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

async function fetchAvailableEntities(
	supabase: SupabaseClient,
	projectId: string,
	sourceId: string,
	sourceKind: EntityKind,
	linked: LinkedEntitiesResult
): Promise<AvailableEntitiesResult> {
	// Create sets of linked IDs for quick lookup
	const linkedIds = {
		tasks: new Set(linked.tasks.map((e) => e.id)),
		plans: new Set(linked.plans.map((e) => e.id)),
		goals: new Set(linked.goals.map((e) => e.id)),
		milestones: new Set(linked.milestones.map((e) => e.id)),
		documents: new Set(linked.documents.map((e) => e.id)),
		outputs: new Set(linked.outputs.map((e) => e.id)),
		risks: new Set(linked.risks.map((e) => e.id))
	};

	// Build queries - only add .neq filter when querying the same entity type as source
	// (to exclude the source entity itself from appearing in available list)
	const tasksQuery = supabase
		.from('onto_tasks')
		.select('id, title, state_key, type_key')
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('created_at', { ascending: false })
		.limit(100);
	if (sourceKind === 'task') tasksQuery.neq('id', sourceId);

	const plansQuery = supabase
		.from('onto_plans')
		.select('id, name, state_key, type_key')
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('created_at', { ascending: false })
		.limit(100);
	if (sourceKind === 'plan') plansQuery.neq('id', sourceId);

	const goalsQuery = supabase
		.from('onto_goals')
		.select('id, name, state_key, type_key')
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('created_at', { ascending: false })
		.limit(100);
	if (sourceKind === 'goal') goalsQuery.neq('id', sourceId);

	const milestonesQuery = supabase
		.from('onto_milestones')
		.select('id, title, due_at, type_key')
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('due_at', { ascending: true })
		.limit(100);
	if (sourceKind === 'milestone') milestonesQuery.neq('id', sourceId);

	const documentsQuery = supabase
		.from('onto_documents')
		.select('id, title, type_key, state_key')
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('created_at', { ascending: false })
		.limit(100);
	if (sourceKind === 'document') documentsQuery.neq('id', sourceId);

	const outputsQuery = supabase
		.from('onto_outputs')
		.select('id, name, type_key, state_key')
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('created_at', { ascending: false })
		.limit(100);
	if (sourceKind === 'output') outputsQuery.neq('id', sourceId);

	const risksQuery = supabase
		.from('onto_risks')
		.select('id, title, state_key, type_key, impact')
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('created_at', { ascending: false })
		.limit(100);
	if (sourceKind === 'risk') risksQuery.neq('id', sourceId);

	// Fetch all entities from the project in parallel
	const [tasks, plans, goals, milestones, documents, outputs, risks] = await Promise.all([
		tasksQuery,
		plansQuery,
		goalsQuery,
		milestonesQuery,
		documentsQuery,
		outputsQuery,
		risksQuery
	]);

	return {
		tasks: mapToAvailable(tasks.data || [], linkedIds.tasks),
		plans: mapToAvailable(plans.data || [], linkedIds.plans),
		goals: mapToAvailable(goals.data || [], linkedIds.goals),
		milestones: mapToAvailable(milestones.data || [], linkedIds.milestones),
		documents: filterScratchAvailable(
			mapToAvailable(documents.data || [], linkedIds.documents)
		),
		outputs: mapToAvailable(outputs.data || [], linkedIds.outputs),
		risks: mapToAvailable(risks.data || [], linkedIds.risks)
	};
}

function mapToAvailable(entities: any[], linkedSet: Set<string>): AvailableEntity[] {
	return entities.map((e) => ({
		id: e.id,
		name: e.name,
		title: e.title,
		state_key: e.state_key,
		type_key: e.type_key,
		due_at: e.due_at,
		isLinked: linkedSet.has(e.id)
	}));
}

function filterScratchAvailable(documents: AvailableEntity[]): AvailableEntity[] {
	return documents.filter((d) => {
		const typeKey = d.type_key || '';
		return !typeKey.includes('scratch') && !typeKey.includes('workspace');
	});
}
