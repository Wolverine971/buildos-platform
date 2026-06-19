// apps/web/src/lib/services/agentic-chat/tools/core/search-telemetry.test.ts
import { describe, expect, it } from 'vitest';
import { extractSearchResultCount, isSearchTool } from './search-telemetry';

describe('extractSearchResultCount', () => {
	it('returns null for non-search tools', () => {
		expect(extractSearchResultCount('create_onto_task', { id: 'x' })).toBeNull();
		expect(extractSearchResultCount('get_onto_project_details', {})).toBeNull();
	});

	it('counts per-entity search result arrays', () => {
		expect(extractSearchResultCount('search_onto_tasks', { tasks: [1, 2, 3] })).toBe(3);
		expect(extractSearchResultCount('search_onto_documents', { documents: [] })).toBe(0);
		expect(extractSearchResultCount('search_onto_projects', { projects: [{}, {}] })).toBe(2);
	});

	it('counts the agentic search results array', () => {
		expect(extractSearchResultCount('search_all_projects', { results: [{}, {}, {}, {}] })).toBe(
			4
		);
		expect(extractSearchResultCount('search_project', { results: [] })).toBe(0);
	});

	it('falls back to total_returned / total when the array is missing', () => {
		expect(extractSearchResultCount('search_ontology', { total_returned: 7 })).toBe(7);
		expect(extractSearchResultCount('search_onto_tasks', { total: 2 })).toBe(2);
	});

	it('treats a missing/invalid result as zero rows for a search tool', () => {
		expect(extractSearchResultCount('search_onto_goals', null)).toBe(0);
		expect(extractSearchResultCount('search_onto_goals', 'oops')).toBe(0);
		expect(extractSearchResultCount('search_onto_goals', {})).toBe(0);
	});

	it('isSearchTool flags search tools only', () => {
		expect(isSearchTool('search_project')).toBe(true);
		expect(isSearchTool('search_onto_risks')).toBe(true);
		expect(isSearchTool('update_onto_task')).toBe(false);
	});
});
