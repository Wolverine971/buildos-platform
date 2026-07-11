// apps/web/src/routes/api/inbox/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	listInboxItems: vi.fn(),
	createAdminSupabaseClient: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('$lib/server/inbox.service', () => ({
	listInboxItems: mocks.listInboxItems,
	isInboxItemStatus: (value: string | null) => value === 'pending',
	isInboxSourceType: (value: string | null) => value === 'agent_run',
	parseInboxLimit: (value: string | null) => Number.parseInt(value ?? '50', 10)
}));

import { GET } from './+server';

function makeEvent(url: string) {
	return {
		url: new URL(url),
		locals: {
			supabase: { from: vi.fn() },
			safeGetSession: vi.fn(async () => ({ user: { id: 'user-1' } }))
		}
	} as any;
}

describe('GET /api/inbox', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createAdminSupabaseClient.mockReturnValue({ from: vi.fn() });
		mocks.listInboxItems.mockResolvedValue({
			items: [],
			total: 0,
			repairedCount: 0,
			backfilledCount: 0
		});
	});

	it('uses the indexed fast path when repair=none', async () => {
		const response = await GET(
			makeEvent(
				'http://localhost/api/inbox?status=pending&include_payload=1&limit=25&repair=none'
			)
		);

		expect(response.status).toBe(200);
		expect(mocks.listInboxItems).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				status: 'pending',
				limit: 25,
				includePayload: true,
				repair: false
			})
		);
	});

	it('preserves full repair as the default list contract', async () => {
		const response = await GET(makeEvent('http://localhost/api/inbox?status=pending'));

		expect(response.status).toBe(200);
		expect(mocks.listInboxItems).toHaveBeenCalledWith(
			expect.objectContaining({ repair: true })
		);
	});

	it('rejects an unknown repair mode', async () => {
		const response = await GET(
			makeEvent('http://localhost/api/inbox?status=pending&repair=background')
		);
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.success).toBe(false);
		expect(mocks.listInboxItems).not.toHaveBeenCalled();
	});
});
