// packages/agentic-chat-runtime/src/tools/ontology-explore.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import { AgenticChatExploreUnavailableError, exploreProject } from './ontology-explore';
import { AgenticChatOntologySearchInputError } from './ontology-search';

const ACTOR_ID = '90000000-0000-4000-8000-000000000009';
const PROJECT_ID = '40000000-0000-4000-8000-000000000004';
const OTHER_PROJECT_ID = '50000000-0000-4000-8000-000000000005';
const EMBEDDING = [0.1, 0.2, 0.3];

function makeBuilder(rows: unknown[]) {
	const builder: Record<string, any> = {};
	for (const method of ['select', 'eq', 'in', 'is', 'not', 'or', 'order', 'limit']) {
		builder[method] = vi.fn(() => builder);
	}
	builder.maybeSingle = vi.fn(async () => ({ data: rows[0] ?? null, error: null }));
	builder.then = (
		onFulfilled: (value: unknown) => unknown,
		onRejected: (reason: unknown) => unknown
	) => Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
	return builder;
}

function contextWith(input: {
	rpc?: ReturnType<typeof vi.fn>;
	tables?: Record<string, unknown[]>;
	embeddings?: { embedQuery: ReturnType<typeof vi.fn> } | undefined;
}) {
	const client = {
		rpc: input.rpc ?? vi.fn(async () => ({ data: [], error: null })),
		from: vi.fn((table: string) => makeBuilder(input.tables?.[table] ?? []))
	};
	const assertProjectAccess = vi.fn(async () => {});
	const context: AgenticChatSharedReadContextV1 = {
		client: client as never,
		access: {
			getActorId: vi.fn(async () => ACTOR_ID),
			resolveProjectSummaries: vi.fn(async () => []),
			assertProjectAccess,
			assertEntityAccess: vi.fn(async () => {})
		},
		embeddings:
			'embeddings' in input
				? (input.embeddings as never)
				: { embedQuery: vi.fn(async () => EMBEDDING) }
	};
	return { context, client, assertProjectAccess };
}

describe('exploreProject', () => {
	it('requires a theme', async () => {
		const { context } = contextWith({});
		await expect(exploreProject(context, { theme: '   ' })).rejects.toBeInstanceOf(
			AgenticChatOntologySearchInputError
		);
	});

	it('reports itself unavailable when the host has no embeddings port', async () => {
		const { context } = contextWith({ embeddings: undefined });
		await expect(exploreProject(context, { theme: 'marketing' })).rejects.toBeInstanceOf(
			AgenticChatExploreUnavailableError
		);
	});

	it('embeds the theme and calls the semantic RPC with a vector literal', async () => {
		const rpc = vi.fn(async () => ({ data: [], error: null }));
		const embedQuery = vi.fn(async () => EMBEDDING);
		const { context } = contextWith({ rpc, embeddings: { embedQuery } });

		await exploreProject(context, { theme: 'marketing direction', limit: 10 });

		expect(embedQuery).toHaveBeenCalledWith('marketing direction');
		expect(rpc).toHaveBeenCalledWith('onto_search_semantic', {
			p_actor_id: ACTOR_ID,
			p_query_embedding: '[0.1,0.2,0.3]',
			p_project_id: undefined,
			p_types: undefined,
			p_limit: 20
		});
	});

	it('asserts project access and scopes the RPC when project_id is set', async () => {
		const rpc = vi.fn(async (..._args: unknown[]) => ({ data: [], error: null }));
		const { context, assertProjectAccess } = contextWith({
			rpc,
			tables: { onto_projects: [{ id: PROJECT_ID }] }
		});

		const payload = await exploreProject(context, {
			theme: 'marketing',
			project_id: PROJECT_ID
		});

		expect(assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
		expect(rpc.mock.calls[0]![1]).toMatchObject({ p_project_id: PROJECT_ID });
		expect(payload.search_scope).toBe('project');
	});

	it('ranks results, groups by project, and surfaces chunk anchors + materialized tools', async () => {
		const rpc = vi.fn(async () => ({
			data: [
				{
					type: 'document',
					id: 'doc-1',
					project_id: PROJECT_ID,
					project_name: 'Acme',
					title: 'Customer Segments',
					snippet: 'segment text',
					score: 0.61,
					state_key: 'active',
					type_key: 'note',
					chunk_anchor: 'target-users'
				},
				{
					type: 'task',
					id: 'task-1',
					project_id: OTHER_PROJECT_ID,
					project_name: 'Side',
					title: 'Post campaign recap',
					snippet: 'recap',
					score: 0.42,
					state_key: 'in_progress',
					type_key: 'default',
					chunk_anchor: null
				}
			],
			error: null
		}));
		const { context } = contextWith({ rpc });

		const payload = await exploreProject(context, { theme: 'marketing' });

		expect(payload.total_returned).toBe(2);
		expect(payload.results.map((row) => row.id)).toContain('doc-1');
		const doc = payload.results.find((row) => row.id === 'doc-1')!;
		expect(doc.chunk_anchor).toBe('target-users');
		expect(payload.projects).toHaveLength(2);
		expect(payload.projects.map((group) => group.project_id)).toEqual(
			expect.arrayContaining([PROJECT_ID, OTHER_PROJECT_ID])
		);
		expect(payload.materialized_tools).toEqual(
			expect.arrayContaining(['get_onto_document_details', 'get_onto_task_details'])
		);
		expect(payload.search_scope).toBe('workspace');
	});
});
