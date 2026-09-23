// apps/web/src/routes/api/cron/agentic-chat-stale-turns/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	rpc: vi.fn(),
	insert: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		CRON_SECRET: 'synthetic-cron-secret',
		// Legacy knob from the retired SSE reaper: it must not shorten the
		// queued-turn timeout (a leftover 90 would kill healthy queued turns).
		AGENT_CHAT_STALE_TURN_REAPER_AGE_SECONDS: '90',
		AGENT_CHAT_STALE_TURN_REAPER_BATCH_SIZE: '9999'
	}
}));
vi.mock('$env/static/private', () => ({ PRIVATE_CRON_SECRET: '' }));
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

import { config, GET } from './+server';

function event(authorization?: string) {
	return {
		request: new Request('https://build-os.com/api/cron/agentic-chat-stale-turns', {
			headers: authorization ? { authorization } : undefined
		})
	} as Parameters<typeof GET>[0];
}

describe('GET /api/cron/agentic-chat-stale-turns', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.insert.mockResolvedValue({ error: null });
		mocks.createAdminSupabaseClient.mockReturnValue({
			rpc: mocks.rpc,
			from: vi.fn(() => ({ insert: mocks.insert }))
		});
	});

	it('rejects unauthenticated requests before creating an admin client', async () => {
		const response = await GET(event());

		expect(response.status).toBe(401);
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
		expect(mocks.rpc).not.toHaveBeenCalled();
	});

	it('times out stranded queued turns after ten minutes with a bounded batch, never the legacy reaper', async () => {
		mocks.rpc.mockResolvedValue({
			data: { reaped_count: 500, failed_count: 0, has_more: true },
			error: null
		});

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.rpc).toHaveBeenCalledTimes(1);
		expect(mocks.rpc).toHaveBeenCalledWith('reap_stranded_queued_agentic_chat_turns', {
			p_queued_before_seconds: 600,
			p_batch_size: 500
		});
		expect(mocks.rpc).not.toHaveBeenCalledWith(
			'reap_stale_legacy_agentic_chat_turns',
			expect.anything()
		);
		expect(payload.data).toEqual({
			reapedCount: 500,
			failedCount: 0,
			hasMore: true,
			queuedBeforeSeconds: 600,
			batchSize: 500
		});
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				job_name: 'agentic_chat_stale_turns',
				status: 'warning'
			})
		);
	});

	it('records a clean sweep as success', async () => {
		mocks.rpc.mockResolvedValue({
			data: { reaped_count: 3, failed_count: 0, has_more: false },
			error: null
		});

		const response = await GET(event('Bearer synthetic-cron-secret'));

		expect(response.status).toBe(200);
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				job_name: 'agentic_chat_stale_turns',
				status: 'success',
				message: 'Timed out 3 stranded queued turn(s); failed=0; has_more=false.'
			})
		);
	});

	it('surfaces turns the sweeper could not finalize as a warning receipt', async () => {
		mocks.rpc.mockResolvedValue({
			data: { reaped_count: 1, failed_count: 2, has_more: false },
			error: null
		});

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.failedCount).toBe(2);
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'warning',
				message: 'Timed out 1 stranded queued turn(s); failed=2; has_more=false.'
			})
		);
	});

	it('returns a fixed public error when the reaper RPC fails', async () => {
		mocks.rpc.mockResolvedValue({ data: null, error: new Error('synthetic secret') });
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(response.status).toBe(500);
		expect(payload.code).toBe('agentic_chat_stale_turn_reaper_failed');
		expect(JSON.stringify(payload)).not.toContain('synthetic secret');
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({ error_message: 'reaper_failed' })
		);
		consoleError.mockRestore();
	});

	it.each([
		{ reaped_count: 'not-a-count', failed_count: 0, has_more: 'not-a-boolean' },
		// The legacy reaper's receipt shape (no failed_count) is not accepted.
		{ reaped_count: 1, has_more: false },
		{ reaped_count: 1, failed_count: -1, has_more: false }
	])('fails closed when the service-only RPC returns a malformed payload %#', async (data) => {
		mocks.rpc.mockResolvedValue({ data, error: null });
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(response.status).toBe(500);
		expect(payload.code).toBe('agentic_chat_stale_turn_reaper_failed');
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({ error_message: 'reaper_failed' })
		);
		consoleError.mockRestore();
	});

	it('does not turn a successful reap into a failure when receipt logging is unavailable', async () => {
		mocks.rpc.mockResolvedValue({
			data: { reaped_count: 2, failed_count: 0, has_more: false },
			error: null
		});
		mocks.insert.mockRejectedValue(new Error('synthetic receipt outage'));
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.reapedCount).toBe(2);
		expect(consoleError).toHaveBeenCalledWith(
			'Agentic Chat stale-turn receipt failed with fixed code: receipt_failed'
		);
		consoleError.mockRestore();
	});

	it('uses a short bounded function duration', () => {
		expect(config.maxDuration).toBe(30);
	});
});
