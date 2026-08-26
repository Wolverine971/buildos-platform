// apps/web/src/routes/api/onto/search/+server.ts
/**
 * POST /api/onto/search
 * UI compatibility envelope over the shared cross-entity search implementation.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { buildSearchFilter } from '$lib/utils/api-helpers';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { createWebAgenticChatSharedReadContext } from '$lib/services/agentic-chat/tools/core/executors/web-access-adapter';
import {
	AgenticChatOntologySearchInputError,
	AgenticChatOntologySearchProjectNotFoundError,
	AgenticChatOntologySearchQueryError,
	AgenticChatToolAccessDeniedError,
	searchOntologyEntities,
	type SharedOntologySearchRequest
} from '@buildos/agentic-chat-runtime/tools';

class OntologySearchActorResolutionError extends Error {
	readonly cause: unknown;

	constructor(cause: unknown) {
		super('Failed to resolve user actor');
		this.cause = cause;
	}
}

type ProjectTaskSearchRow = {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	state_key: string | null;
	type_key: string | null;
	updated_at: string | null;
};

const TASK_BUCKET_SEARCH_TERMS = [
	'backlog',
	'backlogged',
	'todo',
	'to do',
	'not started',
	'scheduled',
	'upcoming',
	'planned',
	'overdue',
	'late',
	'past due',
	'in progress',
	'working',
	'doing',
	'started',
	'blocked',
	'stuck',
	'waiting',
	'done',
	'completed',
	'complete',
	'finished',
	'closed',
	'archived',
	'archive'
] as const;

function hasTaskBucketSearchIntent(query: unknown): boolean {
	if (typeof query !== 'string') return false;
	const normalized = query.trim().toLocaleLowerCase();
	return TASK_BUCKET_SEARCH_TERMS.some((term) => normalized.includes(term));
}

function isProjectTaskSearch(
	body: SharedOntologySearchRequest
): body is SharedOntologySearchRequest & {
	project_id: string;
	types: string[];
} {
	if (typeof body.project_id !== 'string' || !Array.isArray(body.types)) return false;
	const types = Array.from(
		new Set(
			body.types.map((type) => (typeof type === 'string' ? type.trim() : '')).filter(Boolean)
		)
	);
	return types.length === 1 && types[0] === 'task' && !hasTaskBucketSearchIntent(body.query);
}

function taskSearchScore(row: ProjectTaskSearchRow, query: string): number {
	const normalizedQuery = query.toLocaleLowerCase();
	const title = row.title.toLocaleLowerCase();
	const description = row.description?.toLocaleLowerCase() ?? '';
	if (title === normalizedQuery) return 1;
	if (title.startsWith(normalizedQuery)) return 0.95;
	if (title.includes(normalizedQuery)) return 0.9;
	if (description.includes(normalizedQuery)) return 0.7;
	return 0.5;
}

function taskSearchSnippet(row: ProjectTaskSearchRow): string {
	const source = row.description?.replace(/\s+/g, ' ').trim() || row.title;
	return source.length > 220 ? `${source.slice(0, 217)}...` : source;
}

async function searchProjectTasks(input: {
	locals: App.Locals;
	projectId: string;
	query: string;
	limit?: number;
	signal: AbortSignal;
}) {
	if (!isValidUUID(input.projectId)) {
		return ApiResponse.badRequest('Invalid project_id');
	}
	if (!input.query) {
		return ApiResponse.badRequest('Query is required');
	}

	const { data: hasAccess, error: accessError } = await input.locals.supabase.rpc(
		'current_actor_has_project_member_access',
		{
			p_project_id: input.projectId,
			p_required_access: 'read'
		}
	);
	if (accessError) {
		console.error('[Ontology Search API] Project task access check failed:', accessError);
		return ApiResponse.databaseError(accessError);
	}
	if (!hasAccess) {
		return ApiResponse.forbidden('You do not have access to this project');
	}

	const requestedLimit = Number.isFinite(Number(input.limit)) ? Number(input.limit) : 12;
	const limit = Math.min(50, Math.max(1, Math.floor(requestedLimit)));
	const candidateLimit = Math.min(50, Math.max(limit, limit * 3));
	const searchFilter = buildSearchFilter(input.query, ['title', 'description']);
	if (!searchFilter) {
		return ApiResponse.badRequest('Query is required');
	}

	const taskRequest = input.locals.supabase
		.from('onto_tasks')
		.select('id, project_id, title, description, state_key, type_key, updated_at')
		.eq('project_id', input.projectId)
		.is('deleted_at', null)
		.or(searchFilter)
		.order('updated_at', { ascending: false })
		.limit(candidateLimit)
		.abortSignal(input.signal);
	const { data, error } = await taskRequest;
	if (error) {
		console.error('[Ontology Search API] Project task query failed:', error);
		return ApiResponse.databaseError(error);
	}

	const rows = ((data as ProjectTaskSearchRow[] | null) ?? []).filter(Boolean);
	const results = rows
		.map((row) => ({ row, score: taskSearchScore(row, input.query) }))
		.sort(
			(a, b) =>
				b.score - a.score ||
				Date.parse(b.row.updated_at ?? '') - Date.parse(a.row.updated_at ?? '')
		)
		.slice(0, limit)
		.map(({ row, score }) => ({
			type: 'task',
			id: row.id,
			project_id: row.project_id,
			project_name: null,
			title: row.title,
			snippet: taskSearchSnippet(row),
			score,
			rank_score: score,
			state_key: row.state_key,
			type_key: row.type_key,
			updated_at: row.updated_at,
			matched_fields: ['title', 'description'],
			path: `project:${row.project_id}/task:${row.id}`,
			why_matched: 'Matched task title or description in this project.'
		}));

	return ApiResponse.success({
		query: input.query,
		search_scope: 'project',
		project_id: input.projectId,
		total_returned: results.length,
		maybe_more: rows.length >= candidateLimit,
		results,
		total: results.length,
		message: `Found ${results.length} task matches in this project.`
	});
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) return ApiResponse.unauthorized('Authentication required');
		const userId = session.user.id;

		const body = (await request.json().catch(() => null)) as SharedOntologySearchRequest | null;
		if (!body || typeof body !== 'object') {
			return ApiResponse.badRequest('Invalid request body');
		}
		if (isProjectTaskSearch(body)) {
			return searchProjectTasks({
				locals,
				projectId: body.project_id.trim(),
				query: typeof body.query === 'string' ? body.query.trim() : '',
				limit: body.limit,
				signal: request.signal
			});
		}

		let actorPromise: Promise<string> | undefined;
		const getActorId = () => {
			actorPromise ??= ensureActorId(locals.supabase, userId).catch((error) => {
				throw new OntologySearchActorResolutionError(error);
			});
			return actorPromise;
		};
		const payload = await searchOntologyEntities(
			createWebAgenticChatSharedReadContext({
				supabase: locals.supabase as never,
				getActorId
			}),
			body
		);

		return ApiResponse.success(payload);
	} catch (error) {
		if (error instanceof AgenticChatOntologySearchInputError) {
			return ApiResponse.badRequest(error.message);
		}
		if (error instanceof AgenticChatToolAccessDeniedError) {
			return ApiResponse.forbidden('You do not have access to this project');
		}
		if (error instanceof AgenticChatOntologySearchProjectNotFoundError) {
			return ApiResponse.notFound('Project');
		}
		if (error instanceof AgenticChatOntologySearchQueryError) {
			console.error(`[Ontology Search API] ${error.stage} query failed:`, error.cause);
			return ApiResponse.databaseError(error.cause as never);
		}
		if (error instanceof OntologySearchActorResolutionError) {
			console.error('[Ontology Search API] Failed to resolve actor:', error.cause);
			return ApiResponse.internalError(error.cause, error.message);
		}

		console.error('[Ontology Search API] Unexpected error:', error);
		return ApiResponse.internalError(error, 'Failed to search ontology');
	}
};
