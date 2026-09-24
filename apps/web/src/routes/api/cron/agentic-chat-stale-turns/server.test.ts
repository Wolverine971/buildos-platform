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

const RECOVERY_OK = {
	candidate_count: 2,
	requeued_count: 1,
	finalized_count: 1,
	reconciled_count: 0,
	handoff_count: 0,
	deferred_count: 0,
	not_dead_count: 0,
	skipped_count: 0,
	failed_count: 0,
	parked_count: 0,
	has_more: false,
	batch_size: 25,
	results: [],
	handoffs: []
};

type RpcReply = { data: unknown; error: unknown };

/** Answers each service RPC by name; the dead-turn recovery succeeds unless overridden. */
function rpcReplies(replies: { reaper: RpcReply; recovery?: RpcReply }) {
	mocks.rpc.mockImplementation(async (name: string) => {
		if (name === 'reap_stranded_queued_agentic_chat_turns') return replies.reaper;
		if (name === 'recover_dead_agentic_chat_turns') {
			return replies.recovery ?? { data: RECOVERY_OK, error: null };
		}
		throw new Error(`unexpected rpc ${name}`);
	});
}

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
		rpcReplies({
			reaper: { data: { reaped_count: 500, failed_count: 0, has_more: true }, error: null }
		});

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.rpc).toHaveBeenCalledTimes(2);
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
			batchSize: 500,
			recovery: {
				candidateCount: 2,
				requeuedCount: 1,
				finalizedCount: 1,
				reconciledCount: 0,
				deferredCount: 0,
				notDeadCount: 0,
				skippedCount: 0,
				failedCount: 0,
				parkedCount: 0,
				hasMore: false
			}
		});
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				job_name: 'agentic_chat_stale_turns',
				status: 'warning'
			})
		);
	});

	it('records a clean sweep as success', async () => {
		rpcReplies({
			reaper: { data: { reaped_count: 3, failed_count: 0, has_more: false }, error: null }
		});

		const response = await GET(event('Bearer synthetic-cron-secret'));

		expect(response.status).toBe(200);
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				job_name: 'agentic_chat_stale_turns',
				status: 'success',
				message:
					'Timed out 3 stranded queued turn(s); failed=0; has_more=false. ' +
					'Recovered 2 dead-worker turn(s): requeued=1; ended=1; reconciled=0; deferred=0; ' +
					'not_dead=0; failed=0; parked=0; has_more=false.'
			})
		);
	});

	it('surfaces turns the sweeper could not finalize as a warning receipt', async () => {
		rpcReplies({
			reaper: { data: { reaped_count: 1, failed_count: 2, has_more: false }, error: null }
		});

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.failedCount).toBe(2);
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'warning',
				message: expect.stringContaining(
					'Timed out 1 stranded queued turn(s); failed=2; has_more=false.'
				)
			})
		);
	});

	it('returns a fixed public error when the reaper RPC fails', async () => {
		rpcReplies({ reaper: { data: null, error: new Error('synthetic secret') } });
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(response.status).toBe(500);
		expect(payload.code).toBe('agentic_chat_stale_turn_reaper_failed');
		expect(JSON.stringify(payload)).not.toContain('synthetic secret');
		// The dead-turn recovery still ran and is recorded.
		expect(mocks.rpc).toHaveBeenCalledWith(
			'recover_dead_agentic_chat_turns',
			expect.anything()
		);
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				error_message: 'reaper_failed',
				message: expect.stringContaining('Recovered 2 dead-worker turn(s)')
			})
		);
		consoleError.mockRestore();
	});

	it.each([
		{ reaped_count: 'not-a-count', failed_count: 0, has_more: 'not-a-boolean' },
		// The legacy reaper's receipt shape (no failed_count) is not accepted.
		{ reaped_count: 1, has_more: false },
		{ reaped_count: 1, failed_count: -1, has_more: false }
	])('fails closed when the service-only RPC returns a malformed payload %#', async (data) => {
		rpcReplies({ reaper: { data, error: null } });
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
		rpcReplies({
			reaper: { data: { reaped_count: 2, failed_count: 0, has_more: false }, error: null }
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

	it('recovers dead-worker turns with the shared SQL policy and no workflow handoff', async () => {
		rpcReplies({
			reaper: { data: { reaped_count: 0, failed_count: 0, has_more: false }, error: null },
			recovery: {
				data: { ...RECOVERY_OK, candidate_count: 25, has_more: true },
				error: null
			}
		});

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.rpc).toHaveBeenCalledWith('recover_dead_agentic_chat_turns', {
			p_batch_size: 25,
			p_workflow_handoff: false
		});
		expect(payload.data.recovery).toMatchObject({ candidateCount: 25, hasMore: true });
		// A full batch means more dead turns are waiting: a warning, not success.
		expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'warning' }));
	});

	it('warns about parked turns even when every other count is clean', async () => {
		rpcReplies({
			reaper: { data: { reaped_count: 0, failed_count: 0, has_more: false }, error: null },
			recovery: {
				data: {
					...RECOVERY_OK,
					candidate_count: 0,
					requeued_count: 0,
					finalized_count: 0,
					parked_count: 2
				},
				error: null
			}
		});

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.recovery).toMatchObject({ parkedCount: 2, notDeadCount: 0 });
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'warning',
				message: expect.stringContaining('parked=2')
			})
		);
	});

	it('reads a receipt without the newer counts as zero', async () => {
		const { not_dead_count: _notDead, parked_count: _parked, ...older } = RECOVERY_OK;
		rpcReplies({
			reaper: { data: { reaped_count: 0, failed_count: 0, has_more: false }, error: null },
			recovery: { data: older, error: null }
		});

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.recovery).toMatchObject({ notDeadCount: 0, parkedCount: 0 });
		expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
	});

	it.each([
		{ data: null, error: { code: 'PGRST202', message: 'synthetic missing function' } },
		{ data: { candidate_count: 1, has_more: 'no' }, error: null }
	])('still times out queued turns when dead-turn recovery fails %#', async (recoveryReply) => {
		rpcReplies({
			reaper: { data: { reaped_count: 4, failed_count: 0, has_more: false }, error: null },
			recovery: recoveryReply
		});
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const response = await GET(event('Bearer synthetic-cron-secret'));
		const payload = await response.json();

		expect(response.status).toBe(500);
		expect(payload.code).toBe('agentic_chat_dead_turn_recovery_failed');
		expect(JSON.stringify(payload)).not.toContain('synthetic');
		expect(mocks.rpc).toHaveBeenCalledWith(
			'reap_stranded_queued_agentic_chat_turns',
			expect.anything()
		);
		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'error',
				error_message: 'recovery_failed',
				message: expect.stringContaining('Timed out 4 stranded queued turn(s)')
			})
		);
		expect(consoleError).toHaveBeenCalledWith(
			'Agentic Chat dead-turn recovery failed with fixed code: recovery_failed'
		);
		consoleError.mockRestore();
	});

	it('uses a short bounded function duration', () => {
		expect(config.maxDuration).toBe(30);
	});
});
