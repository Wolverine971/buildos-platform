import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	commitChangeSet: vi.fn(),
	createAdminSupabaseClient: vi.fn(),
	expireInboxItemsForProject: vi.fn()
}));

vi.mock('@buildos/shared-agent-ops', () => ({
	commitChangeSet: mocks.commitChangeSet
}));

vi.mock('@buildos/shared-agent-ops/inbox-index', () => ({
	expireInboxItemsForProject: mocks.expireInboxItemsForProject
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

import { POST } from './+server';

type Row = Record<string, unknown>;

function createAdminMock(tables: Record<string, Row[]>) {
	const updates: Array<{ table: string; payload: Row }> = [];
	return {
		updates,
		client: {
			from(table: string) {
				const filters: Array<[string, unknown]> = [];
				let updatePayload: Row | null = null;
				const matches = (row: Row) =>
					filters.every(([column, value]) => row[column] === value);
				const builder = {
					select() {
						return builder;
					},
					update(payload: Row) {
						updatePayload = payload;
						return builder;
					},
					eq(column: string, value: unknown) {
						filters.push([column, value]);
						return builder;
					},
					async maybeSingle() {
						return {
							data: (tables[table] ?? []).find(matches) ?? null,
							error: null
						};
					},
					then(resolve: (value: { data: null; error: null }) => unknown) {
						if (updatePayload) {
							updates.push({ table, payload: updatePayload });
							for (const row of (tables[table] ?? []).filter(matches)) {
								Object.assign(row, updatePayload);
							}
						}
						return Promise.resolve(resolve({ data: null, error: null }));
					}
				};
				return builder;
			}
		}
	};
}

function request() {
	return new Request('http://localhost/api/agent-runs/run-1/commit', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			decisions: [{ change_id: 'change-1', decision: 'approved' }]
		})
	});
}

function locals() {
	return {
		safeGetSession: vi.fn(async () => ({ user: { id: 'user-1' } }))
	};
}

describe('POST /api/agent-runs/[id]/commit', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.expireInboxItemsForProject.mockResolvedValue(1);
	});

	it('cancels an unreviewed proposal instead of committing it after project deletion', async () => {
		const admin = createAdminMock({
			agent_runs: [
				{
					id: 'run-1',
					user_id: 'user-1',
					project_id: 'project-1',
					status: 'proposal_ready'
				}
			],
			onto_projects: [
				{
					id: 'project-1',
					deleted_at: '2026-07-11T03:38:13.141Z'
				}
			]
		});
		mocks.createAdminSupabaseClient.mockReturnValue(admin.client);

		const response = await POST({
			params: { id: 'run-1' },
			request: request(),
			locals: locals()
		} as any);
		const json = await response.json();

		expect(response.status).toBe(409);
		expect(json).toMatchObject({
			error: 'This proposal belongs to a deleted project and can no longer be applied.',
			code: 'PROJECT_DELETED'
		});
		expect(mocks.commitChangeSet).not.toHaveBeenCalled();
		expect(admin.updates).toContainEqual({
			table: 'agent_runs',
			payload: expect.objectContaining({
				status: 'cancelled',
				error: 'Project was deleted before proposal review'
			})
		});
		expect(mocks.expireInboxItemsForProject).toHaveBeenCalledWith({
			supabase: admin.client,
			projectId: 'project-1'
		});
	});

	it('commits a proposal when its project is active', async () => {
		const admin = createAdminMock({
			agent_runs: [
				{
					id: 'run-1',
					user_id: 'user-1',
					project_id: 'project-1',
					status: 'proposal_ready'
				}
			],
			onto_projects: [{ id: 'project-1', deleted_at: null }]
		});
		mocks.createAdminSupabaseClient.mockReturnValue(admin.client);
		mocks.commitChangeSet.mockResolvedValue({
			ok: true,
			result: {
				change_set_status: 'applied',
				run_status: 'completed',
				applied: 1,
				rejected: 0,
				failed: 0,
				change_set: { status: 'applied', changes: [] },
				entities_touched: []
			}
		});

		const response = await POST({
			params: { id: 'run-1' },
			request: request(),
			locals: locals()
		} as any);

		expect(response.status).toBe(200);
		expect(mocks.commitChangeSet).toHaveBeenCalledWith(
			expect.objectContaining({
				runId: 'run-1',
				userId: 'user-1'
			})
		);
	});
});
