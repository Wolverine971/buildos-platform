// apps/web/src/lib/services/agentic-chat/tools/core/search-telemetry.test.ts
import { describe, expect, it } from 'vitest';
import {
	extractSearchResultCount,
	isSearchTool,
	searchTelemetryColumns,
	searchToolFamily
} from './search-telemetry';

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

describe('searchToolFamily', () => {
	it('classifies the smart ranked tools', () => {
		expect(searchToolFamily('search_all_projects')).toBe('smart');
		expect(searchToolFamily('search_project')).toBe('smart');
		expect(searchToolFamily('search_ontology')).toBe('smart');
	});

	it('classifies the legacy per-entity tools', () => {
		expect(searchToolFamily('search_onto_tasks')).toBe('legacy');
		expect(searchToolFamily('search_onto_documents')).toBe('legacy');
		expect(searchToolFamily('search_onto_risks')).toBe('legacy');
	});

	it('returns null for non-search tools', () => {
		expect(searchToolFamily('create_onto_task')).toBeNull();
		expect(searchToolFamily('update_onto_project')).toBeNull();
	});
});

// Regression guard: this is the logic both chat_tool_executions writers share
// (the v2 stream persistence path and ChatToolExecutor). If result_count/zero_result
// ever go NULL again in prod, it will be because a writer stopped calling this.
describe('searchTelemetryColumns', () => {
	it('populates count + zero flag for a successful search', () => {
		expect(
			searchTelemetryColumns({
				toolName: 'search_project',
				success: true,
				result: { results: [{}, {}, {}] }
			})
		).toEqual({ result_count: 3, zero_result: false });
	});

	it('marks zero_result true for an empty successful search', () => {
		expect(
			searchTelemetryColumns({
				toolName: 'search_onto_documents',
				success: true,
				result: { documents: [] }
			})
		).toEqual({ result_count: 0, zero_result: true });
	});

	it('leaves both columns null for a non-search tool', () => {
		expect(
			searchTelemetryColumns({
				toolName: 'create_onto_task',
				success: true,
				result: { id: 'x' }
			})
		).toEqual({ result_count: null, zero_result: null });
	});

	it('leaves both columns null for a failed search (not a zero-result)', () => {
		expect(
			searchTelemetryColumns({
				toolName: 'search_project',
				success: false,
				result: null
			})
		).toEqual({ result_count: null, zero_result: null });
	});
});
