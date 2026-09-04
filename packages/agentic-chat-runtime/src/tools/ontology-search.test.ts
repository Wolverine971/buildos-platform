// packages/agentic-chat-runtime/src/tools/ontology-search.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import {
	AgenticChatOntologySearchInputError,
	normalizeOptionalOntologySearchProjectId,
	searchAllProjects,
	searchOntologyEntities
} from './ontology-search';
import {
	dedupeSearchRows,
	normalizeSearchResult,
	rankSearchResult,
	reciprocalRankFuseSearchRows,
	taskBucketsForQuery
} from './ontology-search-ranking';

const ACTOR_ID = '90000000-0000-4000-8000-000000000009';
const USER_ID = '91000000-0000-4000-8000-000000000009';
const PROJECT_ID = '40000000-0000-4000-8000-000000000004';
const SHARED_PROJECT_ID = '50000000-0000-4000-8000-000000000005';
const NOW = new Date('2026-08-08T12:00:00.000Z').getTime();

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
	projectSummaries?: Array<{ id: string; state_key?: string | null }>;
	embeddings?: { embedQuery: ReturnType<typeof vi.fn> };
}) {
	const builders = new Map<string, ReturnType<typeof makeBuilder>>();
	const client = {
		rpc:
			input.rpc ??
			vi.fn(async () => ({
				data: [],
				error: null
			})),
		from: vi.fn((table: string) => {
			const builder = makeBuilder(input.tables?.[table] ?? []);
			builders.set(table, builder);
			return builder;
		})
	};
	const assertProjectAccess = vi.fn(async () => {});
	const getActorId = vi.fn(async () => ACTOR_ID);
	const context: AgenticChatSharedReadContextV1 = {
		client: client as never,
		userId: USER_ID,
		timezone: null,
		access: {
			getActorId,
			resolveProjectSummaries: vi.fn(async () => input.projectSummaries ?? []),
			assertProjectAccess,
			assertEntityAccess: vi.fn(async () => {})
		},
		...(input.embeddings ? { embeddings: input.embeddings as never } : {})
	};
	return { context, client, builders, assertProjectAccess, getActorId };
}

describe('ontology search ranking', () => {
	it('normalizes, deduplicates, and ranks active results deterministically', () => {
		const rows = dedupeSearchRows([
			{
				type: 'task',
				id: 'task-1',
				project_id: PROJECT_ID,
				title: 'Launch',
				score: 0.5
			},
			{
				type: 'task',
				id: 'task-1',
				project_id: PROJECT_ID,
				score: 0.9,
				state_key: 'in_progress'
			}
		]);
		const ranked = rankSearchResult(normalizeSearchResult(rows[0]!), NOW);

		expect(ranked).toMatchObject({
			type: 'task',
			id: 'task-1',
			title: 'Launch',
			score: 0.9,
			rank_score: 1.28,
			path: `project:${PROJECT_ID}/task:task-1`,
			ranking_factors: [
				{ key: 'type_task', weight: 0.16 },
				{ key: 'state_in_progress', weight: 0.22 }
			]
		});
	});

	it('recognizes legacy task bucket aliases', () => {
		expect([...taskBucketsForQuery('show backlogged and stuck tasks')]).toEqual([
			'backlog',
			'blocked'
		]);
	});

	it('RRF rewards cross-channel agreement without comparing raw score scales', () => {
		const fused = reciprocalRankFuseSearchRows([
			[
				{ type: 'document', id: 'shared', title: 'Shared', score: 0.08 },
				{ type: 'document', id: 'lexical', title: 'Lexical only', score: 0.95 }
			],
			[
				{ type: 'document', id: 'semantic', title: 'Semantic only', score: 0.91 },
				{ type: 'document', id: 'shared', title: 'Shared', score: 0.62 }
			]
		]);

		expect(fused.map((row) => row.id)).toEqual(['shared', 'semantic', 'lexical']);
		expect(fused[0]?.score).toBeCloseTo(0.992, 3);
		expect(fused[1]?.score).toBeCloseTo(0.5, 3);
	});
});

describe('shared ontology search', () => {
	it('preserves the route UUID validator used by legacy search callers', () => {
		expect(
			normalizeOptionalOntologySearchProjectId('00000000-0000-0000-0000-000000000000')
		).toBe('invalid');
	});

	it('keeps workspace RPC search actor-scoped through the hardened actor argument', async () => {
		const rpc = vi.fn(async (fn: string) => {
			if (fn !== 'onto_search_entities') throw new Error(`Unexpected rpc: ${fn}`);
			return {
				data: [
					{
						type: 'task',
						id: 'task-1',
						project_id: PROJECT_ID,
						project_name: 'Launch',
						title: 'Ship launch',
						score: 0.9,
						state_key: 'in_progress'
					}
				],
				error: null
			};
		});
		const { context } = contextWith({ rpc });

		await expect(
			searchOntologyEntities(
				context,
				{ query: 'launch', types: ['task'], limit: 10 },
				{ now: () => NOW }
			)
		).resolves.toMatchObject({
			search_scope: 'workspace',
			project_id: null,
			total_returned: 1,
			results: [{ type: 'task', id: 'task-1', rank_score: 1.28 }]
		});
		expect(rpc).toHaveBeenCalledWith(
			'onto_search_entities',
			expect.objectContaining({
				p_actor_id: ACTOR_ID,
				p_project_id: undefined,
				p_types: ['task'],
				p_limit: 30
			})
		);
	});

	it('drops weak workspace trigram tails without weakening project-scoped recall', async () => {
		const weakTrigramRow = {
			type: 'risk',
			id: 'risk-1',
			project_id: PROJECT_ID,
			title: 'Unrelated risk',
			score: 0.046
		};
		const rpc = vi.fn(async () => ({ data: [weakTrigramRow], error: null }));
		const { context: workspaceContext } = contextWith({ rpc });
		const { context: projectContext } = contextWith({
			rpc,
			tables: { onto_projects: [{ id: PROJECT_ID }] }
		});

		await expect(
			searchOntologyEntities(workspaceContext, {
				query: 'quantum entanglement',
				types: ['risk']
			})
		).resolves.toMatchObject({ total_returned: 0, results: [] });
		await expect(
			searchOntologyEntities(projectContext, {
				query: 'quantum entanglement',
				project_id: PROJECT_ID,
				types: ['risk']
			})
		).resolves.toMatchObject({ total_returned: 1, results: [{ id: 'risk-1' }] });
	});

	it('hybrid-RRF merges lexical and semantic RPC ranks when embeddings are available', async () => {
		const rpc = vi.fn(async (fn: string) => {
			if (fn === 'onto_search_entities') {
				return {
					data: [
						{ type: 'document', id: 'shared', title: 'Shared', score: 0.08 },
						{ type: 'document', id: 'lexical', title: 'Lexical only', score: 0.95 }
					],
					error: null
				};
			}
			if (fn === 'onto_search_semantic') {
				return {
					data: [
						{ type: 'document', id: 'semantic', title: 'Semantic only', score: 0.91 },
						{ type: 'document', id: 'shared', title: 'Shared', score: 0.62 }
					],
					error: null
				};
			}
			throw new Error(`Unexpected rpc: ${fn}`);
		});
		const embedQuery = vi.fn(async () => [0.1, 0.2, 0.3]);
		const { context } = contextWith({ rpc, embeddings: { embedQuery } });

		const payload = await searchOntologyEntities(
			context,
			{ query: 'vocabulary mismatch', types: ['document'], limit: 10 },
			{ now: () => NOW }
		);

		expect(payload.results.map((row) => row.id)).toEqual(['shared', 'semantic', 'lexical']);
		expect(embedQuery).toHaveBeenCalledWith('vocabulary mismatch');
		expect(rpc).toHaveBeenCalledWith(
			'onto_search_semantic',
			expect.objectContaining({
				p_actor_id: ACTOR_ID,
				p_query_embedding: '[0.1,0.2,0.3]',
				p_types: ['document'],
				p_limit: 30,
				p_min_similarity: 0.3
			})
		);
	});

	it('uses the lower semantic floor for an explicitly scoped project', async () => {
		const rpc = vi.fn(async () => ({ data: [], error: null }));
		const { context } = contextWith({
			rpc,
			tables: { onto_projects: [{ id: PROJECT_ID }] },
			embeddings: { embedQuery: vi.fn(async () => [0.1, 0.2, 0.3]) }
		});

		await searchOntologyEntities(context, {
			query: 'vocabulary mismatch',
			project_id: PROJECT_ID,
			types: ['document'],
			limit: 10
		});

		expect(rpc).toHaveBeenCalledWith(
			'onto_search_semantic',
			expect.objectContaining({
				p_project_id: PROJECT_ID,
				p_min_similarity: 0.2
			})
		);
	});

	it('falls back to lexical results when the optional embedding channel fails', async () => {
		const rpc = vi.fn(async (fn: string) => {
			if (fn !== 'onto_search_entities') throw new Error(`Unexpected rpc: ${fn}`);
			return {
				data: [{ type: 'document', id: 'lexical', title: 'Lexical', score: 0.9 }],
				error: null
			};
		});
		const { context } = contextWith({
			rpc,
			embeddings: { embedQuery: vi.fn(async () => Promise.reject(new Error('offline'))) }
		});

		await expect(
			searchOntologyEntities(
				context,
				{ query: 'launch', types: ['document'], limit: 10 },
				{ now: () => NOW }
			)
		).resolves.toMatchObject({ results: [{ id: 'lexical', score: 0.9 }] });
	});

	it('scopes workspace event reads to owner/member project summaries', async () => {
		const { context, builders } = contextWith({
			projectSummaries: [{ id: PROJECT_ID }, { id: SHARED_PROJECT_ID }],
			tables: {
				onto_events: [
					{
						id: 'event-1',
						project_id: SHARED_PROJECT_ID,
						title: 'Launch review',
						description: null,
						location: null,
						start_at: '2026-08-09T12:00:00.000Z',
						state_key: 'scheduled',
						type_key: 'event.meeting'
					}
				]
			}
		});

		await searchOntologyEntities(
			context,
			{ query: 'launch', types: ['event'], limit: 10 },
			{ now: () => NOW }
		);

		expect(builders.get('onto_events')?.in).toHaveBeenCalledWith('project_id', [
			PROJECT_ID,
			SHARED_PROJECT_ID
		]);
		expect(builders.get('onto_events')?.eq).not.toHaveBeenCalledWith('created_by', ACTOR_ID);
	});

	it('gates project search before loading active project and task bucket rows', async () => {
		const rpc = vi.fn(async () => ({ data: [], error: null }));
		const { context, builders, assertProjectAccess } = contextWith({
			rpc,
			tables: {
				onto_projects: [{ id: PROJECT_ID }],
				onto_tasks: [
					{
						id: 'backlog-task',
						project_id: PROJECT_ID,
						title: 'Write checklist',
						description: null,
						state_key: 'todo',
						type_key: 'task.execution',
						start_at: null,
						due_at: null,
						completed_at: null,
						updated_at: '2026-08-08T00:00:00.000Z',
						deleted_at: null,
						archived_at: null,
						priority: 4
					}
				]
			}
		});

		await expect(
			searchOntologyEntities(
				context,
				{
					query: 'backlogged tasks',
					project_id: PROJECT_ID,
					types: ['task'],
					limit: 10
				},
				{ now: () => NOW }
			)
		).resolves.toMatchObject({
			search_scope: 'project',
			results: [
				{
					id: 'backlog-task',
					bucket_key: 'backlog',
					matched_fields: ['title', 'description', 'props', 'state_key', 'bucket']
				}
			]
		});
		expect(assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
		expect(builders.get('onto_tasks')?.eq).toHaveBeenCalledWith('project_id', PROJECT_ID);
		expect(builders.get('onto_tasks')?.in).toHaveBeenCalledWith('state_key', ['todo']);
	});

	it('rejects malformed project ids before actor or database access', async () => {
		const { context, getActorId, client } = contextWith({});
		await expect(
			searchOntologyEntities(context, { query: 'launch', project_id: 'not-a-uuid' })
		).rejects.toBeInstanceOf(AgenticChatOntologySearchInputError);
		expect(getActorId).not.toHaveBeenCalled();
		expect(client.from).not.toHaveBeenCalled();
	});

	it('preserves agent query cleanup, limits, and materialized tool hints', async () => {
		const rpc = vi.fn(async () => ({
			data: [{ type: 'document', id: 'doc-1', project_id: PROJECT_ID, score: 1 }],
			error: null
		}));
		const { context } = contextWith({ rpc });

		await expect(
			searchAllProjects(context, {
				query: '%launch, brief',
				types: ['DOCUMENT', 'event'],
				limit: 100
			})
		).resolves.toMatchObject({
			query: 'launch  brief',
			materialized_tools: [
				'get_document_outline',
				'read_document_section',
				'get_onto_document_details'
			]
		});
		expect(rpc).toHaveBeenCalledWith(
			'onto_search_entities',
			expect.objectContaining({
				p_query: 'launch  brief',
				p_types: ['document'],
				p_limit: 50
			})
		);
	});
});
