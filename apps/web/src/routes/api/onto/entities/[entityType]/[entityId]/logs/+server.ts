// apps/web/src/routes/api/onto/entities/[entityType]/[entityId]/logs/+server.ts
/**
 * GET /api/onto/entities/[entityType]/[entityId]/logs
 * Fetch paginated activity logs for a specific entity (task, goal, plan, etc.)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../../shared/error-logging';
import type { ProjectLogEntityType } from '@buildos/shared-types';
import { randomUUID } from 'crypto';

// Valid entity types that can have activity logs
const VALID_ENTITY_TYPES: Set<ProjectLogEntityType> = new Set([
	'task',
	'goal',
	'plan',
	'milestone',
	'risk',
	'project',
	'note',
	'document',
	'requirement',
	'source',
	'edge'
]);

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const requestId = randomUUID();
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { entityType, entityId } = params;
		if (!entityType || !entityId) {
			return ApiResponse.badRequest('Entity type and ID required');
		}

		// Validate entity type
		if (!VALID_ENTITY_TYPES.has(entityType as ProjectLogEntityType)) {
			return ApiResponse.badRequest(`Invalid entity type: ${entityType}`);
		}

		// Parse pagination params
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);
		const offset = parseInt(url.searchParams.get('offset') || '0', 10);

		const supabase = locals.supabase;
		console.info('[Entity Logs API] Request', {
			requestId,
			entityType,
			entityId,
			limit,
			offset,
			userId: user.id
		});

		// First, get the project_id from the entity to verify access
		const projectId = await getProjectIdForEntity(supabase, entityType, entityId);
		if (!projectId) {
			console.warn('[Entity Logs API] Entity lookup failed', {
				requestId,
				entityType,
				entityId,
				userId: user.id
			});
			return ApiResponse.notFound('Entity not found');
		}

		console.info('[Entity Logs API] Resolved project', {
			requestId,
			projectId,
			entityType,
			entityId
		});

		// Check project access
		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: projectId,
				p_required_access: 'read'
			}
		);

		if (accessError) {
			console.error('[Entity Logs API] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/entities/${entityType}/${entityId}/logs`,
				method: 'GET',
				userId: user.id,
				projectId,
				entityType: entityType as ProjectLogEntityType,
				entityId,
				operation: 'entity_logs_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		console.info('[Entity Logs API] Access check', {
			requestId,
			projectId,
			hasAccess
		});

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to access this entity');
		}

		// Fetch logs with pagination
		const {
			data: logs,
			error: logsError,
			count
		} = await supabase
			.from('onto_project_logs')
			.select('*', { count: 'exact' })
			.eq('entity_type', entityType)
			.eq('entity_id', entityId)
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1);

		if (logsError) {
			console.error('[Entity Logs API] Failed to fetch logs:', logsError);
			await logOntologyApiError({
				supabase,
				error: logsError,
				endpoint: `/api/onto/entities/${entityType}/${entityId}/logs`,
				method: 'GET',
				userId: user.id,
				projectId,
				entityType: entityType as ProjectLogEntityType,
				entityId,
				operation: 'entity_logs_fetch',
				tableName: 'onto_project_logs'
			});
			return ApiResponse.error('Failed to fetch activity logs', 500);
		}

		console.info('[Entity Logs API] Logs fetched', {
			requestId,
			projectId,
			logCount: logs?.length ?? 0,
			total: count ?? 0
		});

		const total = count ?? 0;
		const hasMore = offset + (logs?.length ?? 0) < total;

		// Enrich logs with actor names
		const enrichedLogs = await enrichLogsWithActorNames(supabase, logs || []);

		return ApiResponse.success({
			logs: enrichedLogs,
			total,
			hasMore,
			entityType,
			entityId
		});
	} catch (err) {
		console.error('[Entity Logs API] Unexpected error:', err, { requestId });
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/entities/${params.entityType ?? ''}/${params.entityId ?? ''}/logs`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: params.entityType as ProjectLogEntityType | undefined,
			entityId: params.entityId,
			operation: 'entity_logs_fetch'
		});
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};

/**
 * Get the project_id for a given entity to verify access
 */
async function getProjectIdForEntity(
	supabase: any,
	entityType: string,
	entityId: string
): Promise<string | null> {
	const tableMapping: Record<string, string> = {
		task: 'onto_tasks',
		goal: 'onto_goals',
		plan: 'onto_plans',
		milestone: 'onto_milestones',
		risk: 'onto_risks',
		project: 'onto_projects',
		note: 'onto_documents',
		document: 'onto_documents',
		requirement: 'onto_requirements',
		source: 'onto_sources',
		edge: 'onto_edges'
	};

	const tableName = tableMapping[entityType];
	if (!tableName) return null;

	// For project entity, the entity itself is the project
	if (entityType === 'project') {
		const { data } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', entityId)
			.single();
		return data?.id ?? null;
	}

	// For edges, we need to get project_id differently
	if (entityType === 'edge') {
		const { data } = await supabase
			.from('onto_edges')
			.select('project_id')
			.eq('id', entityId)
			.single();
		return data?.project_id ?? null;
	}

	// For all other entities, they have a project_id column
	const { data } = await supabase.from(tableName).select('project_id').eq('id', entityId).single();

	return data?.project_id ?? null;
}

/**
 * Enrich log entries with actor names for display
 */
async function enrichLogsWithActorNames(
	supabase: any,
	logs: Array<{
		id: string;
		entity_type: string;
		entity_id: string;
		action: string;
		before_data: any;
		after_data: any;
		changed_by: string | null;
		changed_by_actor_id?: string | null;
		created_at: string;
		change_source: string | null;
	}>
): Promise<any[]> {
	if (logs.length === 0) return [];

	// Collect actor IDs
	const actorIds = Array.from(
		new Set(
			logs.map((log) => log.changed_by_actor_id).filter((id): id is string => Boolean(id))
		)
	);

	const actorsById = new Map<string, { name: string | null; email: string | null }>();
	if (actorIds.length > 0) {
		const { data: actors } = await supabase
			.from('onto_actors')
			.select('id, name, email')
			.in('id', actorIds);

		for (const actor of actors || []) {
			actorsById.set(actor.id, { name: actor.name, email: actor.email });
		}
	}

	// Collect user IDs for actors
	const userIdsForActors = Array.from(
		new Set(
			logs
				.filter((log) => !log.changed_by_actor_id && log.changed_by)
				.map((log) => log.changed_by as string)
		)
	);

	const actorByUserId = new Map<string, { name: string | null; email: string | null }>();
	if (userIdsForActors.length > 0) {
		const { data: actorRows } = await supabase
			.from('onto_actors')
			.select('user_id, name, email')
			.in('user_id', userIdsForActors);

		for (const actor of actorRows || []) {
			if (actor.user_id) {
				actorByUserId.set(actor.user_id, { name: actor.name, email: actor.email });
			}
		}
	}

	// Enrich logs with actor names
	return logs.map((log) => ({
		...log,
		changed_by_name: resolveActorName(log, actorsById, actorByUserId)
	}));
}

function resolveActorName(
	log: { changed_by_actor_id?: string | null; changed_by: string | null },
	actorsById: Map<string, { name: string | null; email: string | null }>,
	actorByUserId: Map<string, { name: string | null; email: string | null }>
): string | null {
	if (log.changed_by_actor_id && actorsById.has(log.changed_by_actor_id)) {
		const actor = actorsById.get(log.changed_by_actor_id);
		return actor?.name || actor?.email || null;
	}

	if (log.changed_by && actorByUserId.has(log.changed_by)) {
		const actor = actorByUserId.get(log.changed_by);
		return actor?.name || actor?.email || null;
	}

	return null;
}
