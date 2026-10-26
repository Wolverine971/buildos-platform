// apps/web/src/routes/api/cron/email-campaigns/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	environment: { dev: false },
	env: { CRON_SECRET: 'synthetic-cron-secret', PRIVATE_CAMPAIGN_DAILY_CAP: '7' },
	createAdminSupabaseClient: vi.fn(),
	processDueCampaignSends: vi.fn(),
	logError: vi.fn()
}));
vi.mock('$app/environment', () => mocks.environment);
vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));
vi.mock('$env/static/private', () => ({ PRIVATE_CRON_SECRET: '' }));
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));
vi.mock('$lib/services/errorLogger.service', () => ({
	ErrorLoggerService: { getInstance: () => ({ logError: mocks.logError }) }
}));
vi.mock('$lib/server/email-campaigns/sender', () => ({
	processDueCampaignSends: mocks.processDueCampaignSends,
	parseDailyCap: (value: string) => Number(value)
}));
import { GET } from './+server';

function event(authorization?: string) {
	return {
		request: new Request('https://build-os.com/api/cron/email-campaigns', {
			headers: authorization ? { authorization } : undefined
		})
	} as Parameters<typeof GET>[0];
}

describe('campaign cron authorization', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.environment.dev = false;
		mocks.createAdminSupabaseClient.mockReturnValue({ from: vi.fn() });
		mocks.processDueCampaignSends.mockResolvedValue({
			claimed: 0,
			expired: 0,
			completedCampaigns: 0,
			errors: []
		});
	});

	it.each([undefined, 'Bearer wrong', 'synthetic-cron-secret'])(
		'rejects invalid credentials %s before any privileged work',
		async (authorization) => {
			expect((await GET(event(authorization))).status).toBe(401);
			expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
			expect(mocks.processDueCampaignSends).not.toHaveBeenCalled();
		}
	);
	it('passes the configured cap to the authorized sender', async () => {
		expect((await GET(event('Bearer synthetic-cron-secret'))).status).toBe(200);
		expect(mocks.processDueCampaignSends).toHaveBeenCalledWith({
			supabase: mocks.createAdminSupabaseClient.mock.results[0]!.value,
			dailyCap: 7
		});
	});
	it('does not drain the shared production queue in development', async () => {
		mocks.environment.dev = true;
		expect((await GET(event('Bearer synthetic-cron-secret'))).status).toBe(200);
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
		expect(mocks.processDueCampaignSends).not.toHaveBeenCalled();
	});
});
