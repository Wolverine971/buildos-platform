// packages/agentic-chat-runtime/src/tools/ontology-task-documents.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import { listTaskDocuments } from './ontology-task-documents';

const PROJECT_ID = '40000000-0000-4000-8000-000000000004';
const TASK_ID = '10000000-0000-4000-8000-000000000001';

type QueryResponse = { data: unknown; error: unknown };

function createContext(responses: Record<string, QueryResponse[]>) {
	const events: string[] = [];
	const builders: Array<{ table: string; index: number; query: Record<string, any> }> = [];
	const positions = new Map<string, number>();
	const client = {
		from: vi.fn((table: string) => {
			const index = positions.get(table) ?? 0;
			positions.set(table, index + 1);
			const response = responses[table]?.[index] ?? { data: [], error: null };
			const query: Record<string, any> = {};
			for (const method of ['select', 'eq', 'in', 'is', 'order']) {
				query[method] = vi.fn(() => query);
			}
			query.maybeSingle = vi.fn(async () => {
				events.push(`query:${table}:${index}`);
				return response;
			});
			query.then = (
				onFulfilled: (value: QueryResponse) => unknown,
				onRejected: (reason: unknown) => unknown
			) => {
				events.push(`query:${table}:${index}`);
				return Promise.resolve(response).then(onFulfilled, onRejected);
			};
			builders.push({ table, index, query });
			return query;
		})
	};
	const access = {
		getActorId: vi.fn(async () => 'actor-1'),
		resolveProjectSummaries: vi.fn(async () => []),
		assertProjectAccess: vi.fn(async (projectId: string) => {
			events.push(`access:${projectId}`);
		}),
		assertEntityAccess: vi.fn(async () => {})
	};
	return {
		context: { client, access } as unknown as AgenticChatSharedReadContextV1,
		access,
		builders,
		events
	};
}

describe('shared task document reads', () => {
	it('returns edge-ordered links and the scratch pad behind project fences', async () => {
		const deliverableId = '20000000-0000-4000-8000-000000000002';
		const scratchId = '30000000-0000-4000-8000-000000000003';
		const deliverableEdge = {
			id: 'edge-1',
			project_id: PROJECT_ID,
			dst_id: deliverableId,
			props: { role: 'deliverable' }
		};
		const scratchEdge = {
			id: 'edge-2',
			project_id: PROJECT_ID,
			dst_id: scratchId,
			props: { role: 'scratch' }
		};
		const { context, access, builders, events } = createContext({
			onto_tasks: [{ data: { id: TASK_ID, project_id: PROJECT_ID }, error: null }],
			onto_edges: [{ data: [deliverableEdge, scratchEdge], error: null }],
			onto_documents: [
				{
					data: [
						{ id: scratchId, project_id: PROJECT_ID, title: 'Scratch' },
						{ id: deliverableId, project_id: PROJECT_ID, title: 'Brief' }
					],
					error: null
				}
			]
		});

		const result = await listTaskDocuments(context, { task_id: TASK_ID });

		expect(result.documents.map((link) => link.document.title)).toEqual(['Brief', 'Scratch']);
		expect(result.scratch_pad).toEqual({
			document: { id: scratchId, project_id: PROJECT_ID, title: 'Scratch' },
			edge: scratchEdge
		});
		expect(result.message).toBe('Found 2 documents linked to this task.');
		expect(events.slice(0, 2)).toEqual(['query:onto_tasks:0', `access:${PROJECT_ID}`]);
		expect(access.assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
		for (const { table, query } of builders.filter(({ table }) => table !== 'onto_tasks')) {
			expect(query.eq, `${table} project fence`).toHaveBeenCalledWith(
				'project_id',
				PROJECT_ID
			);
		}
	});

	it('returns the legacy empty envelope when no document edges exist', async () => {
		const { context } = createContext({
			onto_tasks: [{ data: { id: TASK_ID, project_id: PROJECT_ID }, error: null }],
			onto_edges: [{ data: [], error: null }]
		});

		await expect(listTaskDocuments(context, { task_id: TASK_ID })).resolves.toEqual({
			documents: [],
			scratch_pad: null,
			message: 'Found 0 documents linked to this task.'
		});
	});

	it('preserves argument validation before touching the database', async () => {
		const { context } = createContext({});
		await expect(listTaskDocuments(context, { task_id: '' })).rejects.toThrow(
			'task_id is required for list_task_documents'
		);
		await expect(listTaskDocuments(context, { task_id: 'not-a-uuid' })).rejects.toThrow(
			'Invalid task_id: expected UUID'
		);
		expect((context.client as any).from).not.toHaveBeenCalled();
	});
});
