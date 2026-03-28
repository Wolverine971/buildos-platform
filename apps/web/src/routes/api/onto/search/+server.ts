// apps/web/src/routes/api/onto/search/+server.ts
/**
 * POST /api/onto/search
 * Cross-entity ontology search across BuildOS projects.
 * Returns a stable, agent-friendly result envelope for both broad and project-scoped search.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

const ALLOWED_TYPES = new Set([
	'project',
	'task',
	'goal',
	'plan',
	'milestone',
	'document',
	'risk',
	'requirement',
	'image'
]);
const NULLISH_PROJECT_ID_SENTINELS = new Set(['none', 'null', 'undefined']);
const SEARCHABLE_FIELDS_BY_TYPE: Record<string, string[]> = {
	project: ['name', 'description', 'props'],
	task: ['title', 'description', 'props'],
	goal: ['name', 'description', 'props'],
	plan: ['name', 'description', 'props'],
	milestone: ['title', 'description', 'props'],
	document: ['title', 'description', 'content', 'props'],
	risk: ['title', 'content', 'props'],
	requirement: ['text', 'props'],
	image: ['caption', 'alt_text', 'extraction_summary', 'extracted_text']
};

type SearchRequest = {
	query?: string;
	project_id?: string;
	types?: string[];
	limit?: number;
};

type SearchRow = {
	type?: string | null;
	id?: string | null;
	project_id?: string | null;
	project_name?: string | null;
	title?: string | null;
	snippet?: string | null;
	score?: number | null;
	state_key?: string | null;
	type_key?: string | null;
};

function normalizeOptionalProjectId(value: unknown): string | null | 'invalid' {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	if (NULLISH_PROJECT_ID_SENTINELS.has(trimmed.toLowerCase())) {
		return null;
	}

	return isValidUUID(trimmed) ? trimmed : 'invalid';
}

function buildResultPath(result: SearchRow): string | null {
	const type = typeof result.type === 'string' ? result.type : null;
	const id = typeof result.id === 'string' ? result.id : null;
	const projectId = typeof result.project_id === 'string' ? result.project_id : null;
	if (!type || !id) {
		return null;
	}
	if (type === 'project') {
		return `project:${id}`;
	}
	if (projectId) {
		return `project:${projectId}/${type}:${id}`;
	}
	return `${type}:${id}`;
}

function normalizeSearchResult(result: SearchRow) {
	const type = typeof result.type === 'string' ? result.type : 'unknown';
	const matchedFields = SEARCHABLE_FIELDS_BY_TYPE[type] ?? ['title'];
	const normalizedProjectId =
		typeof result.project_id === 'string'
			? result.project_id
			: type === 'project' && typeof result.id === 'string'
				? result.id
				: null;
	const normalizedProjectName =
		typeof result.project_name === 'string'
			? result.project_name
			: type === 'project' && typeof result.title === 'string'
				? result.title
				: null;

	return {
		type,
		id: typeof result.id === 'string' ? result.id : null,
		project_id: normalizedProjectId,
		project_name: normalizedProjectName,
		title: typeof result.title === 'string' ? result.title : null,
		snippet: typeof result.snippet === 'string' ? result.snippet : null,
		score: Number.isFinite(Number(result.score)) ? Number(result.score) : 0,
		state_key: typeof result.state_key === 'string' ? result.state_key : null,
		type_key: typeof result.type_key === 'string' ? result.type_key : null,
		matched_fields: matchedFields,
		path: buildResultPath({
			...result,
			type,
			project_id: normalizedProjectId
		}),
		why_matched: `Matched indexed ${matchedFields.join(', ')} fields for ${type}.`
	};
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const body = (await request.json().catch(() => null)) as SearchRequest | null;
		if (!body || typeof body !== 'object') {
			return ApiResponse.badRequest('Invalid request body');
		}

		const query = typeof body.query === 'string' ? body.query.trim() : '';
		if (!query) {
			return ApiResponse.badRequest('Query is required');
		}

		const normalizedProjectId = normalizeOptionalProjectId(body.project_id);
		if (normalizedProjectId === 'invalid') {
			return ApiResponse.badRequest('Invalid project_id');
		}
		const projectId = normalizedProjectId;

		const requestedTypes =
			Array.isArray(body.types) && body.types.length
				? body.types
						.map((t) => (typeof t === 'string' ? t.trim() : ''))
						.filter((t) => t && ALLOWED_TYPES.has(t))
				: null;

		const rawLimit =
			body.limit !== undefined && body.limit !== null && Number.isFinite(Number(body.limit))
				? Number(body.limit)
				: null;
		const limit = rawLimit && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 50) : 50;

		const supabase = locals.supabase;

		let actorId: string;
		try {
			actorId = await ensureActorId(supabase, session.user.id);
		} catch (actorError) {
			console.error('[Ontology Search API] Failed to resolve actor:', actorError);
			return ApiResponse.internalError(actorError, 'Failed to resolve user actor');
		}

		if (projectId) {
			const { data: hasAccess, error: accessError } = await supabase.rpc(
				'current_actor_has_project_access',
				{
					p_project_id: projectId,
					p_required_access: 'read'
				}
			);

			if (accessError) {
				console.error('[Ontology Search API] Access check failed:', accessError);
				return ApiResponse.internalError(accessError, 'Failed to check project access');
			}

			if (!hasAccess) {
				return ApiResponse.forbidden('You do not have access to this project');
			}

			const { data: project, error: projectError } = await supabase
				.from('onto_projects')
				.select('id')
				.eq('id', projectId)
				.is('deleted_at', null)
				.maybeSingle();

			if (projectError) {
				console.error('[Ontology Search API] Project lookup failed:', projectError);
				return ApiResponse.databaseError(projectError);
			}

			if (!project) {
				return ApiResponse.notFound('Project');
			}
		}

		const { data, error } = await supabase.rpc('onto_search_entities', {
			p_actor_id: actorId,
			p_query: query,
			p_project_id: projectId ?? undefined,
			p_types: requestedTypes && requestedTypes.length ? requestedTypes : undefined,
			p_limit: limit
		});

		if (error) {
			console.error('[Ontology Search API] RPC failed:', error);
			return ApiResponse.databaseError(error);
		}

		const rawResults = ((data as SearchRow[] | null) ?? []).filter(Boolean);
		const results = rawResults.map((result) => normalizeSearchResult(result));
		const searchScope = projectId ? 'project' : 'workspace';
		const maybeMore = results.length >= limit;

		return ApiResponse.success({
			query,
			search_scope: searchScope,
			project_id: projectId,
			total_returned: results.length,
			maybe_more: maybeMore,
			results,
			total: results.length,
			message:
				searchScope === 'project'
					? `Found ${results.length} BuildOS matches in this project.`
					: `Found ${results.length} BuildOS matches across accessible projects.`
		});
	} catch (err) {
		console.error('[Ontology Search API] Unexpected error:', err);
		return ApiResponse.internalError(err, 'Failed to search ontology');
	}
};
