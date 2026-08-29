// packages/agentic-chat-runtime/src/tools/ontology-explore.ts
//
// Semantic discovery search (docs/architecture/semantic-discovery/README.md,
// tasker/71). explore_project is deliberately a SEPARATE tool from the
// FTS-backed search_project/search_all_projects: it answers "everything related
// to <theme>" via pgvector cosine similarity over onto_embeddings (RPC
// onto_search_semantic), including matches with zero keyword overlap. Results
// flow through the same normalize/rank pipeline as the smart search so state
// and type boosts (in-progress up, done/archived down) behave identically.

import { formatPgVectorLiteral } from '@buildos/shared-agent-ops/embeddings/entity-embedding';
import { inferMaterializedToolsFromEntityResults } from '../loop/entity-result-materialization';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import {
	AgenticChatOntologySearchInputError,
	AgenticChatOntologySearchProjectNotFoundError,
	AgenticChatOntologySearchQueryError,
	normalizeOptionalOntologySearchProjectId
} from './ontology-search';
import {
	dedupeSearchRows,
	normalizeSearchResult,
	rankSearchResult,
	type OntologySearchRow
} from './ontology-search-ranking';

export const EXPLORE_ALLOWED_TYPES = new Set([
	'project',
	'task',
	'goal',
	'plan',
	'milestone',
	'document',
	'risk',
	'requirement',
	'event',
	'image'
]);

const DEFAULT_EXPLORE_LIMIT = 15;
const MAX_EXPLORE_LIMIT = 30;

export interface SharedExploreProjectArgs {
	theme: string;
	project_id?: string;
	types?: string[];
	limit?: number;
}

type SemanticSearchRow = OntologySearchRow & { chunk_anchor?: string | null };

export class AgenticChatExploreUnavailableError extends Error {
	readonly name = 'AgenticChatExploreUnavailableError';

	constructor() {
		super(
			'explore_project is unavailable: semantic search is not configured on this host. Use search_project or search_all_projects with keyword queries instead.'
		);
	}
}

function normalizeExploreTypes(types?: string[]): string[] | null {
	if (!Array.isArray(types) || types.length === 0) return null;
	const normalized = Array.from(
		new Set(
			types
				.map((type) => (typeof type === 'string' ? type.trim().toLowerCase() : ''))
				.filter((type) => EXPLORE_ALLOWED_TYPES.has(type))
		)
	);
	return normalized.length > 0 ? normalized : null;
}

export type ExploreProjectPayload = {
	theme: string;
	search_scope: 'workspace' | 'project';
	project_id: string | null;
	total_returned: number;
	maybe_more: boolean;
	results: Array<ReturnType<typeof rankSearchResult> & { chunk_anchor: string | null }>;
	projects: Array<{
		project_id: string | null;
		project_name: string | null;
		result_count: number;
	}>;
	materialized_tools: string[];
	total: number;
	message: string;
};

/**
 * Conceptual/thematic discovery across ontology entities. Embeds the theme via
 * the host's embeddings port and searches onto_embeddings through the
 * membership-scoped onto_search_semantic RPC.
 */
export async function exploreProject(
	context: AgenticChatSharedReadContextV1,
	args: SharedExploreProjectArgs,
	options: { now?: () => number } = {}
): Promise<ExploreProjectPayload> {
	const theme = typeof args.theme === 'string' ? args.theme.trim() : '';
	if (!theme) {
		throw new AgenticChatOntologySearchInputError('theme is required for explore_project');
	}
	if (!context.embeddings) {
		throw new AgenticChatExploreUnavailableError();
	}

	const normalizedProjectId = normalizeOptionalOntologySearchProjectId(args.project_id);
	if (normalizedProjectId === 'invalid') {
		throw new AgenticChatOntologySearchInputError('Invalid project_id');
	}
	const projectId = normalizedProjectId;

	const rawLimit =
		typeof args.limit === 'number' && Number.isFinite(args.limit) && args.limit > 0
			? Math.floor(args.limit)
			: DEFAULT_EXPLORE_LIMIT;
	const limit = Math.min(rawLimit, MAX_EXPLORE_LIMIT);
	const candidateLimit = Math.min(50, Math.max(limit, limit * 2));
	const nowMs = options.now?.() ?? Date.now();
	const actorId = await context.access.getActorId();

	if (projectId) {
		await context.access.assertProjectAccess(projectId, 'read');
		const { data: project, error } = await (context.client as any)
			.from('onto_projects')
			.select('id')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();
		if (error) throw new AgenticChatOntologySearchQueryError('project', error);
		if (!project) throw new AgenticChatOntologySearchProjectNotFoundError();
	}

	const queryEmbedding = await context.embeddings.embedQuery(theme);

	const { data, error } = await (context.client as any).rpc('onto_search_semantic', {
		p_actor_id: actorId,
		p_query_embedding: formatPgVectorLiteral(queryEmbedding),
		p_project_id: projectId ?? undefined,
		p_types: normalizeExploreTypes(args.types) ?? undefined,
		p_limit: candidateLimit
	});
	if (error) throw new AgenticChatOntologySearchQueryError('rpc', error);

	const rows = ((data as SemanticSearchRow[] | null) ?? []).filter(Boolean);
	const anchorByEntity = new Map<string, string | null>(
		rows.map((row) => [`${row.type}:${row.id}`, row.chunk_anchor ?? null])
	);

	// Discovery ordering: cosine similarity leads. Negative ranking factors
	// (done/archived/cancelled downrankings) apply in full, but the
	// targeted-search POSITIVE boosts are damped to a quarter — at full
	// strength (+0.38 for an in-progress task) they are ~2x the similarity
	// spread at discovery scale and invert semantic order: the Tier-1 battery
	// caught an in-progress decoy outranking a more-similar hit and
	// requirement/risk entities buried under boosted task noise. Damped, they
	// still nudge actionable work above equally-similar passive material.
	const POSITIVE_BOOST_DAMPING = 0.25;
	const discoveryRank = (row: ReturnType<typeof rankSearchResult>): number =>
		row.score +
		row.ranking_factors.reduce(
			(sum, factor) =>
				sum + (factor.weight < 0 ? factor.weight : factor.weight * POSITIVE_BOOST_DAMPING),
			0
		);

	const results = dedupeSearchRows(rows)
		.map((row) => normalizeSearchResult(row))
		.map((row) => rankSearchResult(row, nowMs))
		.sort(
			(a, b) =>
				discoveryRank(b) - discoveryRank(a) ||
				b.score - a.score ||
				(a.title ?? '').localeCompare(b.title ?? '')
		)
		.slice(0, limit)
		.map((row) => ({
			...row,
			chunk_anchor: anchorByEntity.get(`${row.type}:${row.id}`) ?? null
		}));

	const projectGroups = new Map<
		string,
		{ project_id: string | null; project_name: string | null; result_count: number }
	>();
	for (const row of results) {
		const key = row.project_id ?? 'unknown';
		const group = projectGroups.get(key) ?? {
			project_id: row.project_id ?? null,
			project_name: row.project_name ?? null,
			result_count: 0
		};
		group.result_count += 1;
		if (!group.project_name && row.project_name) group.project_name = row.project_name;
		projectGroups.set(key, group);
	}

	const searchScope = projectId ? 'project' : 'workspace';
	return {
		theme,
		search_scope: searchScope,
		project_id: projectId,
		total_returned: results.length,
		maybe_more: rows.length >= candidateLimit,
		results,
		projects: [...projectGroups.values()].sort((a, b) => b.result_count - a.result_count),
		materialized_tools: inferMaterializedToolsFromEntityResults({ results }),
		total: results.length,
		message:
			searchScope === 'project'
				? `Found ${results.length} entities related to "${theme}" in this project.`
				: `Found ${results.length} entities related to "${theme}" across ${projectGroups.size} accessible project(s).`
	};
}
