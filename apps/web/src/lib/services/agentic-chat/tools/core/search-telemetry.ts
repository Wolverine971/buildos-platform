// apps/web/src/lib/services/agentic-chat/tools/core/search-telemetry.ts
//
// Search telemetry helpers. The agent's search tools each return their matches
// under a different key (results/tasks/projects/documents/...). To make search
// outcomes queryable (result_count / zero_result on chat_tool_executions) without
// teaching every executor about telemetry, ChatToolExecutor derives the count from
// the tool name + result here.

/**
 * Search tools and the key under which each returns its result array.
 * Keep in sync with the search tools in definitions/ontology-read.ts.
 */
export const SEARCH_RESULT_ARRAY_KEYS: Record<string, string> = {
	search_all_projects: 'results',
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
const SMART_SEARCH_TOOLS = new Set(['search_all_projects', 'search_project', 'search_ontology']);

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
 * How many rows a search tool returned, or null when the tool is not a search
 * tool. Reads the per-tool result array, falling back to total_returned / total
 * when the array is absent. A non-search tool returns null so callers can leave
 * the telemetry columns empty for it.
 */
export function extractSearchResultCount(toolName: string, result: unknown): number | null {
	const key = SEARCH_RESULT_ARRAY_KEYS[toolName];
	if (!key) return null;
	if (!result || typeof result !== 'object') return 0;
	const record = result as Record<string, unknown>;
	const rows = record[key];
	if (Array.isArray(rows)) return rows.length;
	const fallback = record.total_returned ?? record.total;
	return typeof fallback === 'number' ? fallback : 0;
}
