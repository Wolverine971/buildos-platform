// apps/web/src/routes/api/cron/account-deletions/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	processDueAccountDeletions: vi.fn(),
	alertOverdueAccountDeletions: vi.fn(),
	retryPendingDeletionSubscriptionCancellations: vi.fn(),
	deleteExpiredLegalAcceptanceIntents: vi.fn(),
	insert: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: { CRON_SECRET: 'synthetic-cron-secret' } }));
vi.mock('$env/static/private', () => ({ PRIVATE_CRON_SECRET: '' }));
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));
vi.mock('$lib/server/account-deletion', () => ({
	processDueAccountDeletions: mocks.processDueAccountDeletions,
	alertOverdueAccountDeletions: mocks.alertOverdueAccountDeletions,
	retryPendingDeletionSubscriptionCancellations:
		mocks.retryPendingDeletionSubscriptionCancellations
}));
vi.mock('$lib/server/legal-acceptance', () => ({
	deleteExpiredLegalAcceptanceIntents: mocks.deleteExpiredLegalAcceptanceIntents
}));

import { GET } from './+server';

function event(authorization?: string) {
	return {
		request: new Request('https://build-os.com/api/cron/account-deletions', {
			headers: authorization ? { authorization } : undefined
		})
	} as Parameters<typeof GET>[0];
}

function deletionCounts(overrides: Record<string, number> = {}) {
	return {
		claimed: 0,
		completed: 0,
		failed: 0,
		storageObjectsRemoved: 0,
		gmailConnectionsDeleted: 0,
		gmailRemoteRevocationsSucceeded: 0,
		gmailRemoteRevocationsUnconfirmed: 0,
		calendarConnectionsDeleted: 0,
		calendarLegacyTokensDeleted: 0,
		calendarRemoteRevocationsSucceeded: 0,
		calendarRemoteRevocationsUnconfirmed: 0,
		posthogPersonsDeleted: 0,
		posthogDeletionsSkipped: 0,
		posthogDeletionsFailed: 0,
		...overrides
	};
}

describe('GET /api/cron/account-deletions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.insert.mockResolvedValue({ error: null });
		mocks.createAdminSupabaseClient.mockReturnValue({
			from: vi.fn(() => ({ insert: mocks.insert }))
		});
		mocks.deleteExpiredLegalAcceptanceIntents.mockResolvedValue(0);
		mocks.retryPendingDeletionSubscriptionCancellations.mockResolvedValue({
			processed: 0,
			completed: 0
		});
		mocks.alertOverdueAccountDeletions.mockResolvedValue(0);
	});

	it('rejects unauthenticated requests before doing any work', async () => {
		const response = await GET(event());

		expect(response.status).toBe(401);
		expect(mocks.processDueAccountDeletions).not.toHaveBeenCalled();
	});

	it('logs success when every claimed deletion completed and none is overdue', async () => {
		mocks.processDueAccountDeletions.mockResolvedValue(
			deletionCounts({ claimed: 2, completed: 2, posthogPersonsDeleted: 2 })
		);

		const response = await GET(event('Bearer synthetic-cron-secret'));

		expect(response.status).toBe(200);
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				job_name: 'account_deletions',
				status: 'success',
				error_message: null
			})
		);
	});

	it('logs error when any deletion failed', async () => {
		mocks.processDueAccountDeletions.mockResolvedValue(
			deletionCounts({ claimed: 2, completed: 1, failed: 1 })
		);

		const response = await GET(event('Bearer synthetic-cron-secret'));

		expect(response.status).toBe(200);
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				job_name: 'account_deletions',
				status: 'error',
				error_message: expect.stringContaining('1 deletion(s) failed')
			})
		);
	});

	it('logs error on every run while a request is past its deadline', async () => {
		mocks.processDueAccountDeletions.mockResolvedValue(deletionCounts());
		mocks.alertOverdueAccountDeletions.mockResolvedValue(1);

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(mocks.alertOverdueAccountDeletions).toHaveBeenCalledTimes(1);
		expect(payload.data.overdueDeletions).toBe(1);
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'error',
				error_message: expect.stringContaining('1 request(s) more than 24h past')
			})
		);
	});
});
