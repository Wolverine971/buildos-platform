// apps/web/src/lib/services/dunning-service.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/static/public', () => ({ PUBLIC_APP_URL: 'https://build-os.test' }));
vi.mock('./email-service', () => ({
	EmailService: vi.fn(function () {
		return { sendEmail: vi.fn().mockResolvedValue({ success: true }) };
	})
}));
vi.mock('./stripe-service', () => ({
	StripeService: vi.fn(function () {
		return { cancelSubscription: vi.fn() };
	})
}));
vi.mock('$lib/server/tracked-in-app-notification.service', () => ({
	createTrackedInAppNotification: vi.fn().mockResolvedValue({ success: true })
}));
vi.mock('$lib/server/billing-context-cache', () => ({
	invalidateBillingContextCache: vi.fn()
}));

import { DunningService, getDueDunningStage } from './dunning-service';

const DAY_MS = 24 * 60 * 60 * 1000;

function createSupabase(payment: Record<string, unknown>) {
	const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
	const from = (table: string) => {
		const builder: any = {
			select: () => builder,
			is: () => builder,
			order: () => Promise.resolve({ data: [payment], error: null }),
			update: (payload: Record<string, unknown>) => {
				updates.push({ table, payload });
				return builder;
			},
			eq: () => Promise.resolve({ data: null, error: null })
		};
		return builder;
	};
	return { supabase: { from } as any, updates };
}

describe('dunning stage selection', () => {
	it('picks the latest stage that has come due', () => {
		expect(getDueDunningStage(0)?.name).toBe('Initial Failure');
		expect(getDueDunningStage(4)?.name).toBe('First Reminder');
		expect(getDueDunningStage(8)?.name).toBe('Second Reminder');
		expect(getDueDunningStage(11)?.name).toBe('Access Restriction');
		expect(getDueDunningStage(-1)).toBeUndefined();
	});

	it('advances a payment past the initial stage and restricts access on day 10+', async () => {
		const { supabase, updates } = createSupabase({
			id: 'fp-1',
			user_id: 'user-1',
			failed_at: new Date(Date.now() - 11 * DAY_MS).toISOString(),
			dunning_stage: 'Second Reminder',
			users: { email: 'user@example.com', name: 'User' },
			customer_subscriptions: null
		});

		await new DunningService(supabase).processDunningQueue();

		expect(updates).toContainEqual({
			table: 'users',
			payload: expect.objectContaining({ access_restricted: true })
		});
		expect(updates).toContainEqual({
			table: 'failed_payments',
			payload: expect.objectContaining({ dunning_stage: 'Access Restriction' })
		});
	});
});
