// apps/web/src/lib/services/agentic-chat-v2/worker-turn-capacity.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	evaluateAgenticChatWorkerCapacity,
	observeAgenticChatWorkerCapacity,
	observeAgenticChatWorkerCapacityWithRetry,
	selectAgenticChatWorkerUrl,
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
	it('prefers the server-only chat worker URL and falls back only while it is absent', () => {
		expect(
			selectAgenticChatWorkerUrl('https://chat-worker.test', 'https://general-worker.test')
		).toBe('https://chat-worker.test');
		expect(selectAgenticChatWorkerUrl(undefined, 'https://general-worker.test')).toBe(
			'https://general-worker.test'
		);
		expect(selectAgenticChatWorkerUrl('', 'https://general-worker.test')).toBe('');
	});

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

	it('tolerates bounded infrastructure clock skew but rejects future evidence beyond it', () => {
		expect(
			evaluateAgenticChatWorkerCapacity(evidence({ observedAtMs: NOW + 1_000 }), NOW)
		).toEqual({ available: true, retryAfterSeconds: 2, reason: 'open' });
		expect(
			evaluateAgenticChatWorkerCapacity(evidence({ observedAtMs: NOW + 1_001 }), NOW)
		).toMatchObject({ available: false, reason: 'stale_evidence' });
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

	it('reserves network transit budget beyond the worker collection ceiling', async () => {
		vi.useFakeTimers();
		try {
			let requestSignal: AbortSignal | null = null;
			const fetchImpl = vi.fn<typeof fetch>(
				(_input, init) =>
					new Promise<Response>((resolve, reject) => {
						requestSignal = init?.signal ?? null;
						init?.signal?.addEventListener(
							'abort',
							() => reject(new Error('aborted')),
							{
								once: true
							}
						);
						setTimeout(
							() =>
								resolve(
									new Response(JSON.stringify(evidence()), {
										headers: { 'content-type': 'application/json' }
									})
								),
							4_999
						);
					})
			);

			const observation = observeAgenticChatWorkerCapacity({
				workerUrl: 'https://worker.test',
				workerToken: 'worker-token',
				fetchImpl,
				now: () => NOW
			});

			await vi.advanceTimersByTimeAsync(4_999);
			expect(requestSignal?.aborted).toBe(false);
			await expect(observation).resolves.toEqual({
				available: true,
				retryAfterSeconds: 2,
				reason: 'open'
			});
		} finally {
			vi.useRealTimers();
		}
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

describe('Agentic Chat worker capacity retry boundary', () => {
	it('retries once after a failed observation and returns the fresh open decision', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockRejectedValueOnce(new Error('network reset'))
			.mockResolvedValueOnce(
				new Response(JSON.stringify(evidence()), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
			);

		await expect(
			observeAgenticChatWorkerCapacityWithRetry('turn_admission', {
				workerUrl: 'https://worker.test',
				workerToken: 'worker-token',
				fetchImpl,
				now: () => NOW
			})
		).resolves.toEqual({ available: true, retryAfterSeconds: 2, reason: 'open' });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it('never retries an authoritative worker-reported pressure closure', async () => {
		const fetchImpl = vi.fn<typeof fetch>(
			async () =>
				new Response(JSON.stringify(evidence({ provider: { available: false } })), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
		);

		await expect(
			observeAgenticChatWorkerCapacityWithRetry('transport_negotiation', {
				workerUrl: 'https://worker.test',
				workerToken: 'worker-token',
				fetchImpl,
				now: () => NOW
			})
		).resolves.toMatchObject({ available: false, reason: 'provider_pressure' });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('stays closed after exactly two failed observations', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => {
			throw new Error('unreachable');
		});

		await expect(
			observeAgenticChatWorkerCapacityWithRetry('turn_admission', {
				workerUrl: 'https://worker.test',
				workerToken: 'worker-token',
				fetchImpl,
				now: () => NOW
			})
		).resolves.toMatchObject({ available: false, reason: 'missing_evidence' });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it('bounds the primary attempt at 5s and the retry attempt at 2.5s', async () => {
		vi.useFakeTimers();
		try {
			const abortedAt: number[] = [];
			const startedAt: number[] = [];
			const fetchImpl = vi.fn<typeof fetch>(
				(_input, init) =>
					new Promise<Response>((_resolve, reject) => {
						startedAt.push(vi.getMockedSystemTime()?.getTime() ?? Date.now());
						init?.signal?.addEventListener(
							'abort',
							() => {
								abortedAt.push(vi.getMockedSystemTime()?.getTime() ?? Date.now());
								reject(new Error('aborted'));
							},
							{ once: true }
						);
					})
			);

			const observation = observeAgenticChatWorkerCapacityWithRetry('turn_admission', {
				workerUrl: 'https://worker.test',
				workerToken: 'worker-token',
				fetchImpl,
				now: () => NOW
			});
			await vi.advanceTimersByTimeAsync(5_000);
			await vi.advanceTimersByTimeAsync(2_500);
			await expect(observation).resolves.toMatchObject({
				available: false,
				reason: 'missing_evidence'
			});
			expect(fetchImpl).toHaveBeenCalledTimes(2);
			expect(abortedAt[0]! - startedAt[0]!).toBe(5_000);
			expect(abortedAt[1]! - startedAt[1]!).toBe(2_500);
		} finally {
			vi.useRealTimers();
		}
	});
});
