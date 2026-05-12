// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.payload.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { OntologyReadExecutor } from './ontology-read-executor';
import type { ExecutorContext } from './types';

function jsonResponse(data: unknown): Response {
	return new Response(JSON.stringify({ data }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

function createSupabaseQuery(result: Record<string, unknown>) {
	const query: Record<string, any> = {};
	query.select = vi.fn(() => query);
	query.eq = vi.fn(() => query);
	query.is = vi.fn(() => query);
	query.order = vi.fn(() => query);
	query.limit = vi.fn(() => Promise.resolve(result));
	query.maybeSingle = vi.fn(() => Promise.resolve(result));
	return query;
}

describe('OntologyReadExecutor payload hygiene', () => {
	let mockSupabase: SupabaseClient<Database>;
	let fetchFn: ReturnType<typeof vi.fn>;
	let context: ExecutorContext;

	beforeEach(() => {
		mockSupabase = {
			auth: {
				getSession: vi.fn().mockResolvedValue({
					data: { session: { access_token: 'test-token' } }
				})
			}
		} as unknown as SupabaseClient<Database>;

		fetchFn = vi.fn();
		context = {
			supabase: mockSupabase,
			userId: 'user-1',
			sessionId: 'session-1',
			fetchFn: fetchFn as unknown as typeof fetch
		};
	});

	it('strips search_vector from document detail tool results before returning them', async () => {
		fetchFn.mockResolvedValue(
			jsonResponse({
				document: {
					id: 'doc-1',
					title: 'Rod notes',
					content: '# Notes',
					props: {
						body_markdown: '# Notes',
						search_vector: "'nested':1"
					},
					search_vector: "'internal':1"
				}
			})
		);

		const executor = new OntologyReadExecutor(context);
		const result = await executor.getOntoDocumentDetails({ document_id: 'doc-1' });

		expect(result.document.search_vector).toBeUndefined();
		expect(result.document.props.search_vector).toBeUndefined();
		expect(result.document.props.body_markdown).toBe('# Notes');
	});

	it('strips search_vector recursively from project detail tool results', async () => {
		const queries = {
			onto_projects: createSupabaseQuery({
				data: {
					id: 'project-1',
					name: 'Tacemus Website Design',
					description: 'Website design company',
					type_key: 'project.service.website',
					state_key: 'active',
					updated_at: '2026-05-12T12:00:00.000Z',
					search_vector: "'project':1"
				},
				error: null
			}),
			onto_goals: createSupabaseQuery({ data: [], count: 0, error: null }),
			onto_requirements: createSupabaseQuery({
				data: [
					{
						id: 'req-1',
						project_id: 'project-1',
						text: 'Compliance status must be resolved before launch.',
						type_key: 'requirement.compliance',
						search_vector: "'requirement':1"
					}
				],
				count: 3,
				error: null
			}),
			onto_plans: createSupabaseQuery({ data: [], count: 0, error: null }),
			onto_tasks: createSupabaseQuery({
				data: [
					{
						id: 'task-1',
						project_id: 'project-1',
						title: 'Follow up with Rod',
						description: 'Resolve compliance status',
						state_key: 'todo',
						search_vector: "'task':1"
					}
				],
				count: 4,
				error: null
			}),
			onto_documents: createSupabaseQuery({
				data: [
					{
						id: 'doc-1',
						project_id: 'project-1',
						title: 'Rod notes',
						description: 'Prep notes',
						state_key: 'draft',
						search_vector: "'doc':1"
					}
				],
				count: 9,
				error: null
			}),
			onto_milestones: createSupabaseQuery({ data: [], count: 0, error: null }),
			onto_risks: createSupabaseQuery({ data: [], count: 0, error: null }),
			onto_edges: createSupabaseQuery({
				data: {
					dst_id: 'doc-1',
					document: {
						id: 'doc-1',
						project_id: 'project-1',
						title: 'Rod notes',
						description: 'Prep notes',
						search_vector: "'context-doc':1"
					}
				},
				error: null
			})
		};
		(mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: true, error: null });
		(mockSupabase as any).from = vi.fn((table: keyof typeof queries) => queries[table]);

		const executor = new OntologyReadExecutor(context);
		const result = await executor.getOntoProjectDetails({ project_id: 'project-1' });

		expect(JSON.stringify(result)).not.toContain('search_vector');
		expect(result.project.name).toBe('Tacemus Website Design');
		expect(result.source).toBe('compact_agent_project_context');
		expect(result.counts).toEqual(
			expect.objectContaining({
				requirements: 3,
				tasks: 4,
				documents: 9
			})
		);
		expect(result.requirements[0].text).toContain('Compliance status');
		expect(fetchFn).not.toHaveBeenCalledWith(
			expect.stringContaining('/api/onto/projects/'),
			expect.anything()
		);
		for (const query of Object.values(queries)) {
			for (const [selection] of query.select.mock.calls) {
				expect(selection).not.toBe('*');
				expect(String(selection)).not.toContain('search_vector');
				expect(String(selection)).not.toContain('content,');
			}
		}
	});
});
