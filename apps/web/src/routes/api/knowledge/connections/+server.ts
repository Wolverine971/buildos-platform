// apps/web/src/routes/api/knowledge/connections/+server.ts
/**
 * POST /api/knowledge/connections
 *   body { filters?, facets?, limit?, offset?, facet_limit? }
 *   → { people, total, facets, coverage, gaps, anchor?, notes }
 *
 * Find connections (tasker 166): the caller's people that pass the filters, the groups they
 * fall into (company, place, region, industry, title), how much of the pool has the data a
 * filter needs, and `notes`: plain sentences about what is missing, each with the employers
 * research would fill first. One database call; free.
 *
 * A POST although it only reads: the filters are names of people's employers and towns, which
 * stay out of URLs and logs (same rule as the page's search text).
 * The read goes through the caller's own client, so row security applies.
 */
import type { RequestHandler } from './$types';
import {
	KNOWLEDGE_CONNECTION_FACETS,
	KnowledgeConnectionsError,
	describeKnowledgeConnectionGaps,
	readKnowledgeConnections,
	type KnowledgeConnectionFacet,
	type KnowledgeConnectionFilters
} from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import { knowledgeDb } from '$lib/server/knowledge/knowledge.server';

const FILTER_KEYS = [
	'scope',
	'person_ids',
	'via',
	'employment',
	'company',
	'company_ids',
	'title',
	'industry',
	'place',
	'place_ids',
	'place_of',
	'in_records',
	'related_to',
	'bridge_to',
	'bridge_to_ids'
] as const satisfies ReadonlyArray<keyof KnowledgeConnectionFilters>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function wholeNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const body = await request.json().catch(() => null);
	if (!isRecord(body)) return ApiResponse.badRequest('Send a JSON body');
	if (body.filters !== undefined && !isRecord(body.filters))
		return ApiResponse.badRequest('filters must be an object');
	if (body.facets !== undefined && !Array.isArray(body.facets))
		return ApiResponse.badRequest('facets must be a list');

	const given = (body.filters ?? {}) as Record<string, unknown>;
	// Only the known filters pass through; the shared reader validates each value.
	const filters = Object.fromEntries(
		FILTER_KEYS.filter((key) => given[key] !== undefined && given[key] !== null).map((key) => [
			key,
			given[key]
		])
	) as KnowledgeConnectionFilters;
	const facets = ((body.facets ?? []) as unknown[]).filter(
		(facet): facet is KnowledgeConnectionFacet =>
			KNOWLEDGE_CONNECTION_FACETS.includes(facet as KnowledgeConnectionFacet)
	);

	try {
		const result = await readKnowledgeConnections(
			knowledgeDb(locals.supabase),
			user.id,
			filters,
			{
				facets,
				limit: wholeNumber(body.limit, 50),
				offset: wholeNumber(body.offset, 0),
				facetLimit: wholeNumber(body.facet_limit, 12)
			}
		);
		return ApiResponse.success({
			...result,
			notes: describeKnowledgeConnectionGaps(result, { filters, facets })
		});
	} catch (error) {
		if (error instanceof KnowledgeConnectionsError) {
			if (error.code === 'INVALID') return ApiResponse.badRequest(error.message);
			// The database function isn't applied yet: the page shows a quiet "not yet" state.
			if (error.code === 'UNAVAILABLE') return ApiResponse.success({ unavailable: true });
		}
		return ApiResponse.internalError(error, 'Could not find connections');
	}
};
