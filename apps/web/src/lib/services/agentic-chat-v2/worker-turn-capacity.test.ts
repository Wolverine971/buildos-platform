// apps/web/src/lib/services/agentic-chat-v2/worker-turn-capacity.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	evaluateAgenticChatWorkerCapacity,
	observeAgenticChatWorkerCapacity,
	type AgenticChatWorkerCapacityEvidenceV1
} from './worker-turn-capacity.server';

const NOW = 10_000_000;

function evidence(
	overrides: Partial<AgenticChatWorkerCapacityEvidenceV1> = {}
): AgenticChatWorkerCapacityEvidenceV1 {
	return {
		observedAtMs: NOW - 100,
		queue: { oldestReadyJobAgeMs: 100 },
		provider: { available: true },
		publisher: { healthy: true, pendingBytes: 0 },
		...overrides
	};
}

describe('Agentic Chat worker capacity boundary', () => {
	it('defaults closed until complete live evidence and transport configuration are supplied', async () => {
		expect(evaluateAgenticChatWorkerCapacity(null, NOW)).toMatchObject({
			available: false,
			reason: 'missing_evidence',
			retryAfterSeconds: 2
		});
		expect(
			await observeAgenticChatWorkerCapacity({ workerUrl: '', workerToken: '' })
		).toMatchObject({
			available: false,
			reason: 'missing_evidence'
		});
	});

	it('opens only for fresh queue, provider, and publisher evidence', () => {
		expect(evaluateAgenticChatWorkerCapacity(evidence(), NOW)).toEqual({
			available: true,
			retryAfterSeconds: 2,
			reason: 'open'
		});
	});

	it('closes independently for stale and pressured evidence', () => {
		expect(
			evaluateAgenticChatWorkerCapacity(evidence({ observedAtMs: NOW - 20_000 }), NOW)
		).toMatchObject({ reason: 'stale_evidence' });
		expect(
			evaluateAgenticChatWorkerCapacity(
				evidence({ queue: { oldestReadyJobAgeMs: 30_001 } }),
				NOW
			)
		).toMatchObject({ reason: 'queue_pressure' });
		expect(
			evaluateAgenticChatWorkerCapacity(evidence({ provider: { available: false } }), NOW)
		).toMatchObject({ reason: 'provider_pressure' });
		expect(
			evaluateAgenticChatWorkerCapacity(
				evidence({ publisher: { healthy: false, pendingBytes: 0 } }),
				NOW
			)
		).toMatchObject({ reason: 'publisher_pressure' });
	});

	it('fetches the bearer-protected no-store endpoint and opens on exact fresh evidence', async () => {
		const fetchImpl = vi.fn<typeof fetch>(
			async () =>
				new Response(JSON.stringify(evidence()), {
					status: 200,
					headers: { 'content-type': 'application/json; charset=utf-8' }
				})
		);

		await expect(
			observeAgenticChatWorkerCapacity({
				workerUrl: 'https://worker.test',
				workerToken: 'worker-token',
				fetchImpl,
				now: () => NOW
			})
		).resolves.toEqual({ available: true, retryAfterSeconds: 2, reason: 'open' });

		expect(fetchImpl).toHaveBeenCalledWith(
			'https://worker.test/agentic-chat/capacity',
			expect.objectContaining({
				method: 'GET',
				headers: {
					Accept: 'application/json',
					Authorization: 'Bearer worker-token'
				},
				cache: 'no-store',
				credentials: 'omit',
				redirect: 'error',
				signal: expect.any(AbortSignal)
			})
		);
	});

	it('preserves a valid stale decision instead of misclassifying it as malformed', async () => {
		const fetchImpl = vi.fn<typeof fetch>(
			async () =>
				new Response(JSON.stringify(evidence({ observedAtMs: NOW - 20_000 })), {
					headers: { 'content-type': 'application/problem+json' }
				})
		);
		expect(
			await observeAgenticChatWorkerCapacity({
				workerUrl: 'https://worker.test/',
				workerToken: 'worker-token',
				fetchImpl,
				now: () => NOW
			})
		).toMatchObject({ available: false, reason: 'stale_evidence' });
	});

	it('fails closed before fetch for unsafe worker URLs or bearer tokens', async () => {
		const fetchImpl = vi.fn<typeof fetch>();
		for (const [workerUrl, workerToken] of [
			['http://worker.test', 'worker-token'],
			['https://user@worker.test', 'worker-token'],
			['https://worker.test/base', 'worker-token'],
			['https://worker.test', ' token-with-whitespace ']
		] as const) {
			expect(
				await observeAgenticChatWorkerCapacity({ workerUrl, workerToken, fetchImpl })
			).toMatchObject({ available: false, reason: 'missing_evidence' });
		}
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('fails closed for HTTP, content-type, body-bound, JSON, and exact-schema failures', async () => {
		const responses = [
			new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } }),
			new Response(JSON.stringify(evidence()), { headers: { 'content-type': 'text/plain' } }),
			new Response('{}', {
				headers: { 'content-type': 'application/json', 'content-length': '4097' }
			}),
			new Response('{', { headers: { 'content-type': 'application/json' } }),
			new Response(JSON.stringify({ ...evidence(), model: 'must-not-pass' }), {
				headers: { 'content-type': 'application/json' }
			})
		];
		for (const response of responses) {
			const fetchImpl = vi.fn<typeof fetch>(async () => response);
			expect(
				await observeAgenticChatWorkerCapacity({
					workerUrl: 'https://worker.test',
					workerToken: 'worker-token',
					fetchImpl,
					now: () => NOW
				})
			).toMatchObject({ available: false, reason: 'missing_evidence' });
		}
	});

	it('aborts an unresponsive capacity request at the configured deadline', async () => {
		const fetchImpl = vi.fn<typeof fetch>(
			(_input, init) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
						once: true
					});
				})
		);

		expect(
			await observeAgenticChatWorkerCapacity({
				workerUrl: 'http://127.0.0.1:3001',
				workerToken: 'worker-token',
				fetchImpl,
				timeoutMs: 5
			})
		).toMatchObject({ available: false, reason: 'missing_evidence' });
		expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
	});
});
