// apps/web/src/routes/api/onto/projects/[id]/restore/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }));
vi.mock('$lib/server/project-sharing-notifications', () => ({
	notifyMembersProjectRestored: notifyMock
}));

import { POST } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

const makeEvent = (rpc: any) =>
	({
		params: { id: PROJECT_ID },
		locals: {
			supabase: { rpc },
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: 'user-1', email: 'owner@example.com' }
			})
		}
	}) as any;

describe('POST /api/onto/projects/[id]/restore', () => {
	beforeEach(() => vi.clearAllMocks());

	it('restores the project and notifies members', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: {
				project_id: PROJECT_ID,
				project_name: 'Apollo',
				restored: true,
				items_restored: 7
			},
			error: null
		});
		const response = await POST(makeEvent(rpc));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(rpc).toHaveBeenCalledWith('restore_onto_project', { p_project_id: PROJECT_ID });
		expect(payload.data).toEqual({
			project_id: PROJECT_ID,
			restored: true,
			items_restored: 7
		});
		expect(notifyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: PROJECT_ID,
				projectName: 'Apollo',
				ownerName: 'owner@example.com',
				excludeUserId: 'user-1'
			})
		);
	});

	it('does not notify when nothing was restored', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: {
				project_id: PROJECT_ID,
				project_name: 'Apollo',
				restored: false,
				items_restored: 0
			},
			error: null
		});
		const response = await POST(makeEvent(rpc));

		expect(response.status).toBe(200);
		expect(notifyMock).not.toHaveBeenCalled();
	});

	it('returns 403 for non-owners', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } });
		const response = await POST(makeEvent(rpc));

		expect(response.status).toBe(403);
		expect(notifyMock).not.toHaveBeenCalled();
	});
});
