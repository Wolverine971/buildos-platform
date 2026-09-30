// packages/shared-agent-ops/src/gateway/op-execution-gateway.archive-state.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	readGatewayArchiveState,
	type ArchiveStateTarget
} from './op-execution-gateway.archive-state';

const { visible } = vi.hoisted(() => ({ visible: vi.fn() }));
vi.mock('./op-execution-gateway.access', () => ({ loadVisibleProjects: visible }));
const PROJECT = '10000000-0000-4000-8000-000000000001';
const TASK = '10000000-0000-4000-8000-000000000002';
const GOAL = '10000000-0000-4000-8000-000000000003';
const DOC = '10000000-0000-4000-8000-000000000004';
const at = '2026-09-29T00:00:00Z';
function input(
	targets: ArchiveStateTarget[],
	tables: Record<string, unknown[]> = {},
	error: unknown = null
) {
	const queries: Record<string, ReturnType<typeof query>> = {};
	function query(table: string) {
		return {
			select: vi.fn().mockReturnThis(),
			in: vi.fn().mockReturnThis(),
			is: vi.fn().mockReturnThis(),
			abortSignal: vi.fn().mockReturnThis(),
			then: (resolve: (v: unknown) => unknown) =>
				Promise.resolve({ data: tables[table] ?? [], error }).then(resolve)
		};
	}
	const admin = { from: vi.fn((table: string) => (queries[table] = query(table))) };
	return {
		params: {
			admin: admin as never,
			userId: 'user',
			scope: { mode: 'read_only' as const, project_ids: [PROJECT] },
			targets
		},
		admin,
		queries
	};
}
describe('archive postcondition read', () => {
	beforeEach(() => {
		visible.mockReset();
		visible.mockResolvedValue({ projects: [{ id: PROJECT }] });
	});
	it('verifies exact scoped task and goal ids while preserving workflow state', async () => {
		const { params, admin, queries } = input(
			[
				{ entity_kind: 'task', id: TASK },
				{ entity_kind: 'goal', id: GOAL }
			],
			{
				onto_tasks: [
					{
						id: TASK,
						project_id: PROJECT,
						title: 'Old task',
						state_key: 'todo',
						archived_at: at,
						deleted_at: at
					}
				],
				onto_goals: [
					{
						id: GOAL,
						project_id: PROJECT,
						name: 'Old goal',
						state_key: 'active',
						archived_at: at,
						deleted_at: null
					}
				]
			}
		);
		expect(await readGatewayArchiveState({ ...params, memo: {} } as never)).toMatchObject({
			status: 'verified',
			targets: [
				{ id: TASK, status: 'archived' },
				{ id: GOAL, status: 'archived' }
			]
		});
		expect(visible.mock.calls[0]![0]).not.toHaveProperty('memo');
		expect(queries.onto_tasks!.in).toHaveBeenCalledWith('id', [TASK]);
		expect(queries.onto_tasks!.in).toHaveBeenCalledWith('project_id', [PROJECT]);
		expect(
			admin.from.mock.calls.every(([table]) => ['onto_tasks', 'onto_goals'].includes(table))
		).toBe(true);
	});
	it.each([
		['removed', [], 'archived'],
		['still in tree', [{ id: DOC, children: [] }], 'inconsistent'],
		['malformed', null, 'unavailable']
	])('checks document archive and canonical tree: %s', async (_label, root, status) => {
		const { params } = input([{ entity_kind: 'document', id: DOC }], {
			onto_documents: [
				{
					id: DOC,
					project_id: PROJECT,
					title: 'Doc',
					archived_at: at,
					state_key: 'archived'
				}
			],
			onto_projects: [{ id: PROJECT, doc_structure: { root } }]
		});
		expect(await readGatewayArchiveState(params)).toMatchObject({
			targets: [{ id: DOC, status }]
		});
	});
	it('does not treat missing, deleted-only, or out-of-scope rows as archived', async () => {
		const { params } = input(
			[
				{ entity_kind: 'task', id: TASK },
				{ entity_kind: 'goal', id: GOAL },
				{ entity_kind: 'document', id: DOC }
			],
			{
				onto_tasks: [{ id: TASK, project_id: PROJECT, deleted_at: at, archived_at: null }],
				onto_goals: [{ id: GOAL, project_id: TASK, archived_at: at }]
			}
		);
		expect(
			(await readGatewayArchiveState(params)).targets.every((t) => t.status === 'unavailable')
		).toBe(true);
	});
	it('returns no evidence on permission/query failure or oversized input', async () => {
		const failure = input([{ entity_kind: 'task', id: TASK }], {}, { message: 'offline' });
		expect(await readGatewayArchiveState(failure.params)).toEqual({
			version: 1,
			status: 'unavailable',
			targets: []
		});
		visible.mockRejectedValueOnce(new Error('revoked'));
		expect(await readGatewayArchiveState(failure.params)).toEqual({
			version: 1,
			status: 'unavailable',
			targets: []
		});
		const tooMany = input(
			Array.from({ length: 101 }, () => ({ entity_kind: 'task', id: TASK }))
		);
		expect((await readGatewayArchiveState(tooMany.params)).status).toBe('unavailable');
		expect(tooMany.admin.from).not.toHaveBeenCalled();
	});
});
