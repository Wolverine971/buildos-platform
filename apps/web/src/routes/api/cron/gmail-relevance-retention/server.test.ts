import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	purgeExpiredEmailRelevanceMetadata: vi.fn(),
	insert: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: { CRON_SECRET: 'synthetic-cron-secret' } }));
vi.mock('$env/static/private', () => ({ PRIVATE_CRON_SECRET: '' }));
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));
vi.mock('$lib/server/gmail-relevance/metadata-retention', () => ({
	purgeExpiredEmailRelevanceMetadata: mocks.purgeExpiredEmailRelevanceMetadata
}));

import { config, GET } from './+server';

function event(authorization?: string) {
	return {
		request: new Request('https://build-os.com/api/cron/gmail-relevance-retention', {
			headers: authorization ? { authorization } : undefined
		})
	} as Parameters<typeof GET>[0];
}

describe('GET /api/cron/gmail-relevance-retention', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.insert.mockResolvedValue({ error: null });
		mocks.createAdminSupabaseClient.mockReturnValue({
			from: vi.fn(() => ({ insert: mocks.insert }))
		});
	});

	it('rejects unauthenticated requests before creating an admin client', async () => {
		const response = await GET(event());

		expect(response.status).toBe(401);
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
		expect(mocks.purgeExpiredEmailRelevanceMetadata).not.toHaveBeenCalled();
	});

	it('returns only bounded deletion counts for an authorized purge', async () => {
		mocks.purgeExpiredEmailRelevanceMetadata.mockResolvedValue({
			observations_deleted: 12,
			candidates_deleted: 31,
			batches_run: 1,
			drained: true
		});

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toEqual({
			observations_deleted: 12,
			candidates_deleted: 31,
			batches_run: 1,
			drained: true
		});
		expect(JSON.stringify(payload)).not.toMatch(/subject|snippet|participant|body|attachment/i);
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				job_name: 'gmail_relevance_retention',
				status: 'success'
			})
		);
	});

	it('fails with a fixed public error when retention cannot be enforced', async () => {
		mocks.purgeExpiredEmailRelevanceMetadata.mockRejectedValue(new Error('synthetic secret'));
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(response.status).toBe(500);
		expect(payload.code).toBe('gmail_relevance_retention_failed');
		expect(JSON.stringify(payload)).not.toContain('synthetic secret');
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({ error_message: 'retention_failed' })
		);
		consoleError.mockRestore();
	});

	it('reserves enough runtime for bounded batches and settlement', () => {
		expect(config.maxDuration).toBe(60);
	});
});
