import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSupabaseServerMock, scheduleAccountDeletionMock, cancelSubscriptionsMock } =
	vi.hoisted(() => ({
		createSupabaseServerMock: vi.fn(),
		scheduleAccountDeletionMock: vi.fn(),
		cancelSubscriptionsMock: vi.fn()
	}));

vi.mock('$lib/supabase/index', () => ({
	createSupabaseServer: createSupabaseServerMock
}));

vi.mock('$lib/server/account-deletion', () => ({
	scheduleAccountDeletion: scheduleAccountDeletionMock,
	cancelDeletionSubscriptions: cancelSubscriptionsMock
}));

import { DELETE } from './+server';

describe('DELETE /api/account/settings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('schedules the purge, starts subscription cancellation, and signs out', async () => {
		const signOut = vi.fn().mockResolvedValue({ error: null });
		createSupabaseServerMock.mockReturnValue({ auth: { signOut } });
		scheduleAccountDeletionMock.mockResolvedValue({
			requestId: 'request-1',
			requestedAt: '2026-07-16T12:00:00.000Z',
			scheduledFor: '2026-08-15T11:00:00.000Z'
		});
		cancelSubscriptionsMock.mockResolvedValue({ completed: true, subscriptionCount: 1 });

		const response = await DELETE({
			cookies: {},
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({
					user: { id: 'user-1', email: 'user@example.com' }
				})
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.scheduledFor).toBe('2026-08-15T11:00:00.000Z');
		expect(scheduleAccountDeletionMock).toHaveBeenCalledWith('user-1');
		expect(cancelSubscriptionsMock).toHaveBeenCalledWith(
			{
				id: 'request-1',
				user_id: 'user-1',
				billing_subscription_ids: []
			},
			{ immediately: false }
		);
		expect(signOut).toHaveBeenCalledOnce();
	});

	it('requires an authenticated user', async () => {
		const response = await DELETE({
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: null })
			}
		} as any);

		expect(response.status).toBe(401);
		expect(scheduleAccountDeletionMock).not.toHaveBeenCalled();
	});
});
