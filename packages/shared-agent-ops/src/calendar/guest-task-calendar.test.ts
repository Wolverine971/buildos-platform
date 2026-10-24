// packages/shared-agent-ops/src/calendar/guest-task-calendar.test.ts
import { describe, expect, it, vi } from 'vitest';
import { enqueueGuestTaskCalendarSync } from './guest-task-calendar';

describe('restricted task calendar queue', () => {
	it('updates the guest copy and cancels only explicitly mapped other copies', async () => {
		const query: any = {
			select: () => query,
			eq: () => query,
			neq: () => query,
			then: (resolve: any) =>
				resolve({
					data: [
						{ user_id: 'guest' },
						{ user_id: 'owner' },
						{ user_id: null },
						{ user_id: 'owner' }
					],
					error: null
				})
		};
		const client = { from: vi.fn(() => query), rpc: vi.fn(async () => ({ error: null })) };
		await enqueueGuestTaskCalendarSync(
			client as any,
			{
				id: 'event',
				project_id: 'project',
				props: { guest_agent_calendar_user_id: 'guest' },
				updated_at: 'version'
			} as any,
			'upsert',
			'owner'
		);
		expect(
			client.rpc.mock.calls.map((call: any) => [call[1].p_user_id, call[1].p_metadata.action])
		).toEqual([
			['guest', 'upsert'],
			['owner', 'delete']
		]);
		expect(client.rpc).toHaveBeenCalledWith(
			'add_queue_job',
			expect.objectContaining({
				p_metadata: expect.objectContaining({
					targetUserId: 'owner',
					createCalendarIfMissing: false,
					restrictToTargetUser: true
				})
			})
		);
	});

	it('surfaces a failed mapping read before making any provider job', async () => {
		const query: any = {
			select: () => query,
			eq: () => query,
			neq: () => query,
			then: (resolve: any) => resolve({ error: { message: 'read failed' } })
		};
		const client = { from: () => query, rpc: vi.fn() };
		await expect(
			enqueueGuestTaskCalendarSync(
				client as any,
				{
					id: 'event',
					project_id: 'project',
					props: { guest_agent_calendar_user_id: 'guest' }
				} as any,
				'delete',
				'owner'
			)
		).rejects.toThrow('read failed');
		expect(client.rpc).not.toHaveBeenCalled();
	});
});
