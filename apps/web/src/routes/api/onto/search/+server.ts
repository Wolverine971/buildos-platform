// apps/web/src/routes/api/onto/search/+server.ts
/**
 * POST /api/onto/search
 * Cross-entity ontology search (tasks, plans, goals, milestones, documents)
 * Returns typed results with snippets for agentic chat discovery.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

const ALLOWED_TYPES = new Set(['task', 'plan', 'goal', 'milestone', 'document']);

type SearchRequest = {
	query?: string;
	project_id?: string;
	types?: string[];
	limit?: number;
};

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

		const projectId =
			typeof body.project_id === 'string' && body.project_id.trim()
				? body.project_id.trim()
				: null;

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

		const results = (data as any[]) ?? [];

		return ApiResponse.success({
			results,
			total: results.length,
			message: `Found ${results.length} ontology matches.`
		});
	} catch (err) {
		console.error('[Ontology Search API] Unexpected error:', err);
		return ApiResponse.internalError(err, 'Failed to search ontology');
	}
};
