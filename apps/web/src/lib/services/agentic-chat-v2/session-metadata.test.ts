// apps/web/src/lib/services/agentic-chat-v2/session-metadata.test.ts
import { describe, expect, it, vi } from 'vitest';
import { updateAgentMetadata } from './session-metadata';

describe('updateAgentMetadata', () => {
	it('retries one transient network failure', async () => {
		const rpc = vi
			.fn()
			.mockResolvedValueOnce({
				data: null,
				error: {
					message: 'TypeError: fetch failed',
					details: 'ECONNRESET: socket disconnected before secure TLS connection'
				}
			})
			.mockResolvedValueOnce({ data: { ok: true }, error: null });
		const logError = vi.fn();

		const result = await updateAgentMetadata(
			{ rpc } as never,
			'session-id',
			{ project_id: 'project-id' },
			{ errorLogger: { logError } as never }
		);

		expect(result).toBe(true);
		expect(rpc).toHaveBeenCalledTimes(2);
		expect(logError).not.toHaveBeenCalled();
	});

	it('does not retry a non-transient database error', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: null,
			error: { message: 'permission denied', code: '42501' }
		});
		const logError = vi.fn();

		const result = await updateAgentMetadata(
			{ rpc } as never,
			'session-id',
			{ project_id: 'project-id' },
			{ errorLogger: { logError } as never }
		);

		expect(result).toBe(false);
		expect(rpc).toHaveBeenCalledTimes(1);
		expect(logError).toHaveBeenCalledOnce();
	});
});
