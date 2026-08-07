// packages/agentic-chat-runtime/src/loop/search-telemetry.ts
//
// Search telemetry helpers. Registry discovery tools and data-search tools return
// counts in different shapes. To make their outcomes queryable (result_count /
// zero_result on chat_tool_executions) without teaching every executor about
// telemetry, ChatToolExecutor derives the count from the tool name + result here.

/**
 * Search tools and the key under which each returns its result array.
 * Keep in sync with the search tools in definitions/ontology-read.ts.
 */
export const SEARCH_RESULT_ARRAY_KEYS: Record<string, string> = {
	search_all_projects: 'results',
	search_buildos: 'results',
	search_project: 'results',
	search_ontology: 'results',
	search_onto_tasks: 'tasks',
	search_onto_projects: 'projects',
	search_onto_documents: 'documents',
	search_onto_goals: 'goals',
	search_onto_plans: 'plans',
	search_onto_milestones: 'milestones',
	search_onto_risks: 'risks'
};

const DISCOVERY_SEARCH_TOOLS = new Set(['tool_search', 'skill_search']);

/** True when the given tool is one of the agent's search tools. */
export function isSearchTool(toolName: string): boolean {
	return toolName in SEARCH_RESULT_ARRAY_KEYS;
}

/**
 * The "smart" ranked search tools (FTS + trigram via /api/onto/search) that the
 * gateway preloads and the funneled descriptions steer the agent toward. Everything
 * else in SEARCH_RESULT_ARRAY_KEYS is a legacy per-entity ILIKE tool. Keep this in
 * sync with Family A in the search audit / AGENTIC_BUILDOS_SEARCH_SPEC.
 */
const SMART_SEARCH_TOOLS = new Set([
	'search_all_projects',
	'search_buildos',
	'search_project',
	'search_ontology'
]);

/**
 * Which search family a tool belongs to, for telemetry that answers the spec's
 * "should the two families collapse to one?" question. Returns null for non-search tools.
 */
export function searchToolFamily(toolName: string): 'smart' | 'legacy' | null {
	if (!isSearchTool(toolName)) return null;
	return SMART_SEARCH_TOOLS.has(toolName) ? 'smart' : 'legacy';
}

/**
 * Derive the search-telemetry columns (`result_count` / `zero_result`) for a tool
 * execution. Single source of truth shared by every chat_tool_executions writer so
 * the columns can't drift between the v2 stream path and ChatToolExecutor.
 *
 * - non-search tool        -> { null, null }   (leave columns empty)
 * - failed execution       -> { null, null }   (a failure isn't a "zero-result" search)
 * - successful search      -> { count, count === 0 }
 */
export function searchTelemetryColumns(params: {
	toolName: string;
	success: boolean;
	result: unknown;
}): { result_count: number | null; zero_result: boolean | null } {
	if (!params.success) return { result_count: null, zero_result: null };
	const result_count = extractSearchResultCount(params.toolName, params.result);
	return {
		result_count,
		zero_result: result_count === null ? null : result_count === 0
	};
}

/**
 * How many matches a discovery/data-search tool returned, or null when the tool
 * does not expose search health. A tool_schema hit counts as one and not_found as
 * zero. Data-search tools read their per-tool result arrays, falling back to
 * total_returned / total when the array is absent.
 */
export function extractSearchResultCount(toolName: string, result: unknown): number | null {
	if (toolName === 'tool_schema') {
		if (!result || typeof result !== 'object') return 0;
		return (result as Record<string, unknown>).type === 'tool_schema' ? 1 : 0;
	}

	if (DISCOVERY_SEARCH_TOOLS.has(toolName)) {
		if (!result || typeof result !== 'object') return 0;
		const record = result as Record<string, unknown>;
		if (typeof record.total_matches === 'number') return record.total_matches;
		return Array.isArray(record.matches) ? record.matches.length : 0;
	}

	const key = SEARCH_RESULT_ARRAY_KEYS[toolName];
	if (!key) return null;
	if (!result || typeof result !== 'object') return 0;
	const record = result as Record<string, unknown>;
	const rows = record[key];
	if (Array.isArray(rows)) return rows.length;
	const fallback = record.total_returned ?? record.total;
	return typeof fallback === 'number' ? fallback : 0;
}
