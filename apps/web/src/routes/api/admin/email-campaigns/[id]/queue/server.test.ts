// apps/web/src/routes/api/admin/email-campaigns/[id]/queue/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ queueCampaign: vi.fn() }));
vi.mock('$lib/server/email-campaigns/campaigns', () => ({
	queueCampaign: mocks.queueCampaign,
	CampaignError: class extends Error {
		status = 400;
	}
}));
import { POST } from './+server';

function event(
	user: { id: string; is_admin: boolean } | null,
	body: unknown = { wave_size: 20, wave_interval_minutes: 60 }
) {
	return {
		params: { id: 'campaign-1' },
		locals: { supabase: {}, safeGetSession: async () => ({ user }) },
		request: new Request('https://build-os.com/api/admin/email-campaigns/campaign-1/queue', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as unknown as Parameters<typeof POST>[0];
}

describe('campaign queue boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	it.each([null, { id: 'ordinary-user', is_admin: false }])(
		'rejects a non-admin session',
		async (user) => {
			expect((await POST(event(user))).status).toBe(403);
			expect(mocks.queueCampaign).not.toHaveBeenCalled();
		}
	);
	it('rejects an invalid wave before queueing', async () => {
		expect(
			(
				await POST(
					event(
						{ id: 'admin', is_admin: true },
						{ wave_size: 0, wave_interval_minutes: 60 }
					)
				)
			).status
		).toBe(422);
		expect(mocks.queueCampaign).not.toHaveBeenCalled();
	});
	it('queues a valid request using the authenticated admin context', async () => {
		mocks.queueCampaign.mockResolvedValue({ id: 'campaign-1', status: 'sending' });
		const request = event({ id: 'admin', is_admin: true });
		expect((await POST(request)).status).toBe(200);
		expect(mocks.queueCampaign).toHaveBeenCalledWith(request.locals.supabase, 'campaign-1', {
			wave_size: 20,
			wave_interval_minutes: 60
		});
	});
});
