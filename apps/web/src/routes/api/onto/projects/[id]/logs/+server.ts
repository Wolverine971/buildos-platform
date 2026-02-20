// apps/web/src/routes/api/onto/projects/[id]/logs/+server.ts
/**
 * GET /api/onto/projects/[id]/logs
 * Fetch paginated activity logs for a project
 * test
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../shared/error-logging';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id: projectId } = params;
		if (!projectId) {
			return ApiResponse.badRequest('Project ID required');
		}

		// Parse pagination params
		const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '10', 10);
		const parsedOffset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);
		const limit = Number.isNaN(parsedLimit) ? 10 : Math.min(Math.max(parsedLimit, 1), 50);
		const offset = Number.isNaN(parsedOffset) ? 0 : Math.max(parsedOffset, 0);

		const supabase = locals.supabase;

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', projectId)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project not found');
		}

		const memberAccessResult = await supabase.rpc('current_actor_is_project_member', {
			p_project_id: projectId
		});
		let hasAccess = Boolean(memberAccessResult.data);

		if (memberAccessResult.error) {
			console.warn(
				'[Project Logs API] Member check failed, falling back to access check:',
				memberAccessResult.error
			);
			const fallbackAccessResult = await supabase.rpc('current_actor_has_project_access', {
				p_project_id: projectId,
				p_required_access: 'read'
			});

			if (fallbackAccessResult.error) {
				console.error(
					'[Project Logs API] Failed to check access:',
					fallbackAccessResult.error
				);
				await logOntologyApiError({
					supabase,
					error: fallbackAccessResult.error,
					endpoint: `/api/onto/projects/${projectId}/logs`,
					method: 'GET',
					userId: user.id,
					projectId,
					entityType: 'project',
					operation: 'project_logs_access_check'
				});
				return ApiResponse.error('Failed to check project access', 500);
			}

			hasAccess = Boolean(fallbackAccessResult.data);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to access this project');
		}

		// Fetch logs with pagination
		const {
			data: logs,
			error: logsError,
			count
		} = await supabase
			.from('onto_project_logs')
			.select('*', { count: 'exact' })
			.eq('project_id', projectId)
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1);

		if (logsError) {
			console.error('[Project Logs API] Failed to fetch logs:', logsError);
			await logOntologyApiError({
				supabase,
				error: logsError,
				endpoint: `/api/onto/projects/${projectId}/logs`,
				method: 'GET',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_logs_fetch',
				tableName: 'onto_project_logs'
			});
			return ApiResponse.error('Failed to fetch activity logs', 500);
		}

		const total = count ?? 0;
		const hasMore = offset + (logs?.length ?? 0) < total;

		// Enrich logs with entity names by fetching them in batch
		const enrichedLogs = await enrichLogsForDisplay(supabase, logs || []);

		return ApiResponse.success({
			logs: enrichedLogs,
			total,
			hasMore
		});
	} catch (err) {
		console.error('[Project Logs API] Unexpected error:', err);
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/projects/${params.id ?? ''}/logs`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'project_logs_fetch'
		});
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};

/**
 * Enrich log entries with entity names for display
 */
async function enrichLogsForDisplay(
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

	// Group entity IDs by type for batch fetching
	const entityIdsByType: Record<string, Set<string>> = {};
	for (const log of logs) {
		if (!entityIdsByType[log.entity_type]) {
			entityIdsByType[log.entity_type] = new Set();
		}
		entityIdsByType[log.entity_type]!.add(log.entity_id);
	}

	// Fetch entity names in parallel
	const entityNames: Record<string, Record<string, string>> = {};
	const fetchPromises: Promise<void>[] = [];

	const tableMapping: Record<string, { table: string; nameField: string }> = {
		task: { table: 'onto_tasks', nameField: 'title' },
		goal: { table: 'onto_goals', nameField: 'name' },
		plan: { table: 'onto_plans', nameField: 'name' },
		milestone: { table: 'onto_milestones', nameField: 'title' },
		risk: { table: 'onto_risks', nameField: 'title' },
		project: { table: 'onto_projects', nameField: 'name' },
		note: { table: 'onto_documents', nameField: 'title' },
		document: { table: 'onto_documents', nameField: 'title' },
		requirement: { table: 'onto_requirements', nameField: 'title' },
		source: { table: 'onto_sources', nameField: 'title' },
		edge: { table: 'onto_edges', nameField: 'rel' }
	};

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

	for (const [entityType, ids] of Object.entries(entityIdsByType)) {
		const mapping = tableMapping[entityType];
		if (!mapping) continue;

		const idsArray = Array.from(ids);
		fetchPromises.push(
			supabase
				.from(mapping.table)
				.select(`id, ${mapping.nameField}`)
				.in('id', idsArray)
				.then(({ data }: { data: any[] | null }) => {
					entityNames[entityType] = {};
					for (const entity of data || []) {
						entityNames[entityType][entity.id] =
							entity[mapping.nameField] || 'Untitled';
					}
				})
		);
	}

	await Promise.all(fetchPromises);

	// Enrich logs with entity + actor names
	return logs.map((log) => ({
		...log,
		entity_name: entityNames[log.entity_type]?.[log.entity_id] || getNameFromLogData(log),
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

	return log.changed_by || null;
}

/**
 * Try to extract entity name from the log's before/after data
 */
function getNameFromLogData(log: {
	before_data: any;
	after_data: any;
	entity_type: string;
}): string {
	const data = log.after_data || log.before_data;
	if (!data || typeof data !== 'object') {
		return `${log.entity_type} (deleted)`;
	}

	// Try common name fields
	return data.title || data.name || data.rel || `${log.entity_type}`;
}
