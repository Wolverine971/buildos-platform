// packages/agentic-chat-runtime/src/tools/ontology-task-detail.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import { getOntoTaskDetails, loadOntoTaskDetail } from './ontology-task-detail';

const PROJECT_ID = '40000000-0000-4000-8000-000000000004';
const TASK_ID = '10000000-0000-4000-8000-000000000001';

type QueryResponse = { data: unknown; error: unknown; count?: number };

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
			for (const method of ['select', 'eq', 'is', 'in', 'or', 'order']) {
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

describe('shared ontology task detail', () => {
	it('fences the task, graph fan-out, linked rows, and assignees to one authorized project', async () => {
		const { context, access, builders, events } = createContext({
			onto_tasks: [
				{ data: { id: TASK_ID, project_id: PROJECT_ID }, error: null },
				{
					data: {
						id: TASK_ID,
						project_id: PROJECT_ID,
						title: 'Ship T7',
						search_vector: "'ship':1",
						props: { search_vector: "'nested':1", kept: true },
						project: { id: PROJECT_ID, created_by: 'actor-1' }
					},
					error: null
				},
				{
					data: [
						{
							id: '20000000-0000-4000-8000-000000000002',
							title: 'Dependent task',
							state_key: 'todo',
							type_key: 'task.default',
							priority: 2
						}
					],
					error: null
				}
			],
			onto_edges: [
				{
					data: [
						{
							src_id: TASK_ID,
							dst_id: '30000000-0000-4000-8000-000000000003',
							src_kind: 'task',
							dst_kind: 'goal',
							rel: 'supports_goal'
						},
						{
							src_id: '20000000-0000-4000-8000-000000000002',
							dst_id: TASK_ID,
							src_kind: 'task',
							dst_kind: 'task',
							rel: 'blocks'
						}
					],
					error: null
				}
			],
			onto_goals: [
				{
					data: [
						{
							id: '30000000-0000-4000-8000-000000000003',
							name: 'Launch',
							state_key: 'active',
							type_key: 'goal.default'
						}
					],
					error: null
				}
			],
			onto_task_assignees: [
				{
					data: [
						{
							task_id: TASK_ID,
							created_at: '2026-08-08T12:00:00.000Z',
							assignee: {
								id: '90000000-0000-4000-8000-000000000009',
								user_id: null,
								name: 'Avery',
								email: 'avery@example.com'
							}
						}
					],
					error: null
				}
			]
		});

		const result = await getOntoTaskDetails(context, { task_id: TASK_ID });

		expect(result).toMatchObject({
			task: {
				id: TASK_ID,
				project_id: PROJECT_ID,
				title: 'Ship T7',
				props: { kept: true },
				assignees: [
					{
						actor_id: '90000000-0000-4000-8000-000000000009',
						name: 'Avery'
					}
				]
			},
			linkedEntities: {
				goals: [
					{
						id: '30000000-0000-4000-8000-000000000003',
						edge_rel: 'supports_goal',
						edge_direction: 'outgoing'
					}
				],
				dependentTasks: [
					{
						id: '20000000-0000-4000-8000-000000000002',
						edge_rel: 'blocks',
						edge_direction: 'incoming'
					}
				]
			},
			message: 'Complete ontology task details loaded.'
		});
		expect(JSON.stringify(result)).not.toContain('search_vector');
		expect(events.slice(0, 3)).toEqual([
			'query:onto_tasks:0',
			`access:${PROJECT_ID}`,
			'query:onto_tasks:1'
		]);
		expect(access.assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');

		for (const { table, index, query } of builders) {
			if (table === 'onto_tasks' && index < 2) continue;
			expect(query.eq, `${table}:${index} project fence`).toHaveBeenCalledWith(
				'project_id',
				PROJECT_ID
			);
		}
	});

	it('keeps assignee enrichment best-effort', async () => {
		const onAssigneeError = vi.fn();
		const { context } = createContext({
			onto_tasks: [
				{ data: { id: TASK_ID, project_id: PROJECT_ID }, error: null },
				{
					data: {
						id: TASK_ID,
						project_id: PROJECT_ID,
						title: 'Ship T7',
						project: { id: PROJECT_ID, created_by: 'actor-1' }
					},
					error: null
				}
			],
			onto_edges: [{ data: [], error: null }],
			onto_task_assignees: [
				{
					data: null,
					error: Object.assign(new Error('assignees unavailable'), { code: 'XX000' })
				}
			]
		});

		await expect(
			loadOntoTaskDetail(context, TASK_ID, { onAssigneeError })
		).resolves.toMatchObject({ task: { id: TASK_ID, assignees: [] } });
		expect(onAssigneeError).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'assignees unavailable' })
		);
	});

	it('returns the task recovery payload for a stale id', async () => {
		const { context, access } = createContext({
			onto_tasks: [{ data: null, error: null }]
		});

		await expect(getOntoTaskDetails(context, { task_id: 'stale-task' })).resolves.toEqual({
			status: 'not_found',
			found: false,
			task_id: 'stale-task',
			task: null,
			message:
				'Task not found. The task may have been deleted, archived, inaccessible, or the ID may be stale. Use list_onto_tasks or search_onto_tasks to find a current task.'
		});
		expect(access.assertProjectAccess).not.toHaveBeenCalled();
	});
});
