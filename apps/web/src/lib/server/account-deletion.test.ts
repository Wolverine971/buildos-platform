// apps/web/src/lib/server/account-deletion.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: vi.fn() }));
vi.mock('$lib/services/stripe-service', () => ({ StripeService: vi.fn() }));
vi.mock('$lib/server/gmail-read-oauth.service', () => ({
	GmailOAuthError: class extends Error {},
	GmailReadOAuthService: vi.fn()
}));
vi.mock('$lib/server/google-calendar-connection.service', () => ({
	GoogleCalendarConnectionError: class extends Error {},
	GoogleCalendarConnectionService: vi.fn()
}));
vi.mock('$lib/services/calendar-webhook-service', () => ({ CalendarWebhookService: vi.fn() }));

import { listAccountDeletionStorageObjects } from './account-deletion';

function createPagedRpc(total: number, serverCap: number) {
	const rows = Array.from({ length: total }, (_, index) => ({
		bucket_id: 'voice-notes',
		object_name: `user-1/${String(index).padStart(5, '0')}.webm`
	}));
	const ranges: Array<[number, number]> = [];
	const rpc = vi.fn(() => {
		const builder: any = {
			order: () => builder,
			range: (from: number, to: number) => {
				ranges.push([from, to]);
				const end = Math.min(to + 1, from + serverCap);
				return Promise.resolve({ data: rows.slice(from, end), error: null });
			}
		};
		return builder;
	});
	return { admin: { rpc }, ranges };
}

describe('listAccountDeletionStorageObjects', () => {
	it('pages past the PostgREST row cap so no stored file is left behind', async () => {
		const { admin, ranges } = createPagedRpc(2500, 1000);

		const objects = await listAccountDeletionStorageObjects(admin, 'user-1');

		expect(objects).toHaveLength(2500);
		expect(new Set(objects.map((object) => object.object_name)).size).toBe(2500);
		expect(ranges[0]).toEqual([0, 999]);
		expect(ranges[1]).toEqual([1000, 1999]);
	});

	it('stays complete when the server cap is lower than the requested page', async () => {
		const { admin } = createPagedRpc(1200, 500);

		const objects = await listAccountDeletionStorageObjects(admin, 'user-1');

		expect(objects).toHaveLength(1200);
	});

	it('surfaces RPC errors instead of treating them as an empty listing', async () => {
		const failure = new Error('rpc failed');
		const builder: any = {
			order: () => builder,
			range: () => Promise.resolve({ data: null, error: failure })
		};
		const admin = { rpc: vi.fn(() => builder) };

		await expect(listAccountDeletionStorageObjects(admin, 'user-1')).rejects.toBe(failure);
	});
});
