// apps/web/src/lib/components/agent/agent-chat-tool-outcome.test.ts
import { describe, expect, it } from 'vitest';
import { describeToolOutcome } from './agent-chat-tool-outcome';

describe('describeToolOutcome', () => {
	it('counts list and search results from the structured total', () => {
		expect(describeToolOutcome('list_onto_tasks', { tasks: [{ id: 't1' }], total: 7 })).toBe(
			'7 tasks'
		);
		expect(describeToolOutcome('list_onto_goals', { goals: [{ id: 'g1' }], total: 1 })).toBe(
			'1 goal'
		);
		expect(
			describeToolOutcome('search_onto_projects', {
				projects: [{}, {}, {}],
				total: 3,
				message: 'Found 3 projects matching "Cadre".'
			})
		).toBe('3 projects');
	});

	it('reads the live wrapper as well as a stored result', () => {
		expect(
			describeToolOutcome('list_onto_plans', {
				success: true,
				tool_name: 'list_onto_plans',
				result: { plans: [{}, {}], total: 5 }
			})
		).toBe('5 plans');
	});

	it('falls back to the array length and says "no" for zero', () => {
		expect(describeToolOutcome('list_task_documents', { documents: [] })).toBe('no documents');
		expect(describeToolOutcome('get_document_outline', { outline: [{}, {}] })).toBe(
			'2 headings'
		);
		expect(describeToolOutcome('web_search', { results: [{}], result_count: 8 })).toBe(
			'8 results'
		);
	});

	it('uses each overview tool’s own count field', () => {
		expect(
			describeToolOutcome('get_project_overview', {
				counts: { active_tasks: 77 },
				tasks: [{}, {}]
			})
		).toBe('77 active tasks');
		expect(
			describeToolOutcome('get_workspace_overview', { projects_returned: 20, projects: [] })
		).toBe('20 projects');
		expect(describeToolOutcome('read_table_rows', { matched_rows: 1, total_rows: 40 })).toBe(
			'1 row'
		);
		expect(describeToolOutcome('scan_email_inbox', { relevant_count: 0 })).toBe(
			'no relevant emails'
		);
		expect(describeToolOutcome('list_email_accounts', { count: 2, accounts: [] })).toBe(
			'2 inboxes'
		);
	});

	it('says nothing for writes, proposals, or results without a count', () => {
		expect(describeToolOutcome('create_onto_task', { task: { id: 't1' } })).toBeUndefined();
		expect(
			describeToolOutcome('propose_project_combine', { projects: [{}, {}] })
		).toBeUndefined();
		expect(
			describeToolOutcome('get_onto_document_details', { document: { id: 'd1' } })
		).toBeUndefined();
		expect(describeToolOutcome('get_project_overview', { counts: {} })).toBeUndefined();
		expect(describeToolOutcome('list_onto_tasks', null)).toBeUndefined();
		expect(describeToolOutcome(undefined, { tasks: [] })).toBeUndefined();
	});
});
