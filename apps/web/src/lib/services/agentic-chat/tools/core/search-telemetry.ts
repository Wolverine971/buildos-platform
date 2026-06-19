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
