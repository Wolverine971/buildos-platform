// apps/web/src/routes/api/onto/projects/[id]/ownership/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }));
vi.mock('$lib/server/project-sharing-notifications', () => ({
	notifyOwnershipReceived: notifyMock
}));

import { POST } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';

const makeEvent = (body: unknown, rpc = vi.fn()) =>
	({
		params: { id: PROJECT_ID },
		request: new Request('http://localhost', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body)
		}),
		locals: {
			supabase: { rpc },
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: 'user-1', email: 'owner@example.com', name: 'Owner' }
			})
		}
	}) as any;

describe('POST /api/onto/projects/[id]/ownership', () => {
	beforeEach(() => vi.clearAllMocks());

	it('hands off the project and notifies the new owner', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: {
				project_id: PROJECT_ID,
				project_name: 'Apollo',
				new_owner_actor_id: 'actor-2',
				new_owner_user_id: 'user-2',
				previous_owner_left: true
			},
			error: null
		});
		const response = await POST(makeEvent({ member_id: MEMBER_ID, leave: true }, rpc));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(rpc).toHaveBeenCalledWith('transfer_onto_project_ownership', {
			p_project_id: PROJECT_ID,
			p_new_owner_member_id: MEMBER_ID,
			p_leave: true
		});
		expect(payload.data).toEqual({
			project_id: PROJECT_ID,
			new_owner_actor_id: 'actor-2',
			previous_owner_left: true
		});
		expect(notifyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectName: 'Apollo',
				newOwnerUserId: 'user-2',
				fromName: 'Owner',
				senderUserId: 'user-1'
			})
		);
	});

	it('returns 403 when the caller is not the owner', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } });
		const response = await POST(makeEvent({ member_id: MEMBER_ID }, rpc));

		expect(response.status).toBe(403);
		expect(notifyMock).not.toHaveBeenCalled();
	});

	it('returns 404 when the member cannot take over', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'P0002' } });
		const response = await POST(makeEvent({ member_id: MEMBER_ID }, rpc));
		const payload = await response.json();

		expect(response.status).toBe(404);
		expect(payload.code).toBe('handoff_member_not_found');
	});

	it('rejects a bad body without calling the database', async () => {
		const rpc = vi.fn();
		const response = await POST(makeEvent({ member_id: 'nope' }, rpc));

		expect(response.status).toBe(400);
		expect(rpc).not.toHaveBeenCalled();
	});
});
