// apps/web/src/routes/api/onto/edges/available/+server.ts
/**
 * GET /api/onto/edges/available
 *
 * Lazy-loaded endpoint for fetching available (linkable) entities.
 * Called only when user clicks "Add" to link an entity, not on initial modal load.
 *
 * This is a performance optimization - previously available entities were fetched
 * eagerly with linked entities, resulting in 7 extra database queries on every modal open.
 *
 * Query params:
 * - projectId: UUID of the project context
 * - sourceId: UUID of source entity to exclude from results
 * - sourceKind: Type of source entity
 * - targetKind: Type of entity to fetch (task, plan, goal, etc.)
 * - linkedIds: Comma-separated list of already-linked entity IDs
 *
 * Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

type EntityKind = 'task' | 'plan' | 'goal' | 'milestone' | 'document' | 'output' | 'risk';

interface AvailableEntity {
	id: string;
	name?: string;
	title?: string;
	state_key?: string;
	type_key?: string;
	due_at?: string;
	isLinked: boolean;
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

		const projectId = url.searchParams.get('projectId');
		const sourceId = url.searchParams.get('sourceId');
		const sourceKind = url.searchParams.get('sourceKind');
		const targetKind = url.searchParams.get('targetKind');
		const linkedIdsParam = url.searchParams.get('linkedIds') || '';

		if (!projectId || !sourceId || !sourceKind || !targetKind) {
			return ApiResponse.badRequest(
				'projectId, sourceId, sourceKind, and targetKind are required'
			);
		}

		if (!isValidKind(sourceKind) || !isValidKind(targetKind)) {
			return ApiResponse.badRequest('Invalid entity kind');
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

		// Parse linked IDs for quick lookup
		const linkedIds = new Set(linkedIdsParam.split(',').filter(Boolean));

		// Fetch available entities for the target kind
		const entities = await fetchAvailableForKind(
			supabase,
			projectId,
			sourceId,
			sourceKind,
			targetKind,
			linkedIds
		);

		return ApiResponse.success({ entities });
	} catch (error) {
		console.error('[Available Entities API] Error:', error);
		return ApiResponse.internalError(error, 'Failed to fetch available entities');
	}
};

async function fetchAvailableForKind(
	supabase: any,
	projectId: string,
	sourceId: string,
	sourceKind: EntityKind,
	targetKind: EntityKind,
	linkedIds: Set<string>
): Promise<AvailableEntity[]> {
	const tableMap: Record<EntityKind, string> = {
		task: 'onto_tasks',
		plan: 'onto_plans',
		goal: 'onto_goals',
		milestone: 'onto_milestones',
		document: 'onto_documents',
		output: 'onto_outputs',
		risk: 'onto_risks'
	};

	const columnsMap: Record<EntityKind, string[]> = {
		task: ['id', 'title', 'state_key', 'type_key'],
		plan: ['id', 'name', 'state_key', 'type_key'],
		goal: ['id', 'name', 'state_key', 'type_key'],
		milestone: ['id', 'title', 'due_at', 'type_key'],
		document: ['id', 'title', 'type_key', 'state_key'],
		output: ['id', 'name', 'type_key', 'state_key'],
		risk: ['id', 'title', 'state_key', 'type_key', 'impact']
	};

	const table = tableMap[targetKind];
	const columns = columnsMap[targetKind];

	let query = supabase
		.from(table)
		.select(columns.join(', '))
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('created_at', { ascending: false })
		.limit(100);

	// Exclude source entity if same kind
	if (sourceKind === targetKind) {
		query = query.neq('id', sourceId);
	}

	const { data, error } = await query;

	if (error) {
		console.error(`[Available Entities API] Error fetching ${table}:`, error);
		return [];
	}

	let entities = (data || []).map((e: any) => ({
		id: e.id,
		name: e.name,
		title: e.title,
		state_key: e.state_key,
		type_key: e.type_key,
		due_at: e.due_at,
		isLinked: linkedIds.has(e.id)
	}));

	// Filter scratch documents
	if (targetKind === 'document') {
		entities = entities.filter((d: AvailableEntity) => {
			const typeKey = d.type_key || '';
			return !typeKey.includes('scratch') && !typeKey.includes('workspace');
		});
	}

	return entities;
}
