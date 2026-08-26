// apps/worker/tests/agenticChatCapacity.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatWorkerCapacityCollector,
	SupabaseAgenticChatReadyQueueAgeAdapter
} from '../src/workers/agentic-chat/capacity';

const NOW = Date.parse('2026-08-03T12:00:00.000Z');

function queueAgeClient(result: { data: unknown; error: { message: string } | null }) {
	const query = {
		eq: vi.fn(),
		lte: vi.fn(),
		order: vi.fn(),
		limit: vi.fn(),
		maybeSingle: vi.fn(async () => result),
		then: undefined as never
	};
	query.eq.mockReturnValue(query);
	query.lte.mockReturnValue(query);
	query.order.mockReturnValue(query);
	query.limit.mockReturnValue(query);
	const select = vi.fn(() => query);
	const from = vi.fn(() => ({ select }));
	return { client: { from } as never, from, select, query };
}

function publisherSnapshot(overrides: Record<string, unknown> = {}) {
	return {
		registeredTurns: 0,
		pendingBytes: 128,
		pendingEvents: 1,
		pressure: 'normal',
		softByteLimit: 1_024,
		hardByteLimit: 2_048,
		softEventLimit: 8,
		hardEventLimit: 16,
		accepting: true,
		stopping: false,
		...overrides
	};
}

function collectorPorts(overrides: Record<string, unknown> = {}) {
	return {
		runtime: {
			getHealth: vi.fn(() => ({ healthy: true, state: 'running', queue: { healthy: true } }))
		},
		queue: {
			getCapacitySnapshot: vi.fn(() => ({
				concurrency: 1,
				activeJobs: 0,
				availableSlots: 1,
				acceptingWork: true,
				draining: false
			}))
		},
		queueAge: { observeOldestReadyJobAgeMs: vi.fn(async () => 250) },
		provider: {
			getSnapshot: vi.fn(() => ({
				observedAtMs: NOW,
				configured: true,
				available: true,
				activeRequests: 0,
				concurrency: 1,
				degradedUntilMs: null
			}))
		},
		publisher: { getWorkerSnapshot: vi.fn(() => publisherSnapshot()) },
		now: () => NOW,
		...overrides
	};
}

describe('SupabaseAgenticChatReadyQueueAgeAdapter', () => {
	it('observes only the oldest ready pending chat job', async () => {
		const harness = queueAgeClient({
			data: { scheduled_for: '2026-08-03T11:59:57.500Z' },
			error: null
		});
		const adapter = new SupabaseAgenticChatReadyQueueAgeAdapter(harness.client);

		await expect(adapter.observeOldestReadyJobAgeMs(NOW)).resolves.toBe(2_500);
		expect(harness.from).toHaveBeenCalledWith('queue_jobs');
		expect(harness.select).toHaveBeenCalledWith('scheduled_for');
		expect(harness.query.eq.mock.calls).toEqual([
			['job_type', 'agentic_chat_turn'],
			['status', 'pending']
		]);
		expect(harness.query.lte).toHaveBeenCalledWith('scheduled_for', '2026-08-03T12:00:00.000Z');
		expect(harness.query.order).toHaveBeenCalledWith('scheduled_for', {
			ascending: true,
			nullsFirst: false
		});
		expect(harness.query.limit).toHaveBeenCalledWith(1);
	});

	it('reports zero for no ready rows and rejects malformed observations', async () => {
		const empty = queueAgeClient({ data: null, error: null });
		await expect(
			new SupabaseAgenticChatReadyQueueAgeAdapter(empty.client).observeOldestReadyJobAgeMs(
				NOW
			)
		).resolves.toBe(0);

		const future = queueAgeClient({
			data: { scheduled_for: '2026-08-03T12:00:01.000Z' },
			error: null
		});
		await expect(
			new SupabaseAgenticChatReadyQueueAgeAdapter(future.client).observeOldestReadyJobAgeMs(
				NOW
			)
		).rejects.toThrow('invalid ready timestamp');

		const failed = queueAgeClient({ data: null, error: { message: 'offline' } });
		await expect(
			new SupabaseAgenticChatReadyQueueAgeAdapter(failed.client).observeOldestReadyJobAgeMs(
				NOW
			)
		).rejects.toThrow('offline');
	});
});

describe('AgenticChatWorkerCapacityCollector', () => {
	it('emits the exact fresh web-admission evidence shape from live worker state', async () => {
		const collector = new AgenticChatWorkerCapacityCollector(collectorPorts() as never);

		await expect(collector.collect()).resolves.toEqual({
			observedAtMs: NOW,
			queue: { oldestReadyJobAgeMs: 250 },
			provider: { available: true },
			publisher: { healthy: true, pendingBytes: 128 }
		});
	});

	it('anchors evidence after local snapshots cross a millisecond boundary', async () => {
		let clockMs = NOW;
		const provider = {
			getSnapshot: vi.fn(() => {
				clockMs += 1;
				return {
					observedAtMs: clockMs,
					configured: true,
					available: true,
					activeRequests: 0,
					concurrency: 1,
					degradedUntilMs: null
				};
			})
		};
		const queueAge = { observeOldestReadyJobAgeMs: vi.fn(async () => 0) };
		const collector = new AgenticChatWorkerCapacityCollector(
			collectorPorts({ provider, queueAge, now: () => clockMs }) as never
		);

		await expect(collector.collect()).resolves.toMatchObject({
			observedAtMs: NOW + 1,
			provider: { available: true }
		});
		expect(queueAge.observeOldestReadyJobAgeMs).toHaveBeenCalledWith(NOW + 1);
	});

	it('accepts coherent queue and provider evidence at the reviewed two-slot bound', async () => {
		const queue = {
			getCapacitySnapshot: vi.fn(() => ({
				concurrency: 2,
				activeJobs: 1,
				availableSlots: 1,
				acceptingWork: true,
				draining: false
			}))
		};
		const provider = {
			getSnapshot: vi.fn(() => ({
				observedAtMs: NOW,
				configured: true,
				available: true,
				activeRequests: 1,
				concurrency: 2,
				degradedUntilMs: null
			}))
		};
		const collector = new AgenticChatWorkerCapacityCollector(
			collectorPorts({ queue, provider }) as never
		);

		await expect(collector.collect()).resolves.toMatchObject({
			provider: { available: true }
		});
	});

	it('preserves valid pressure as closed evidence rather than hiding it', async () => {
		const provider = {
			getSnapshot: vi.fn(() => ({
				observedAtMs: NOW,
				configured: true,
				available: false,
				activeRequests: 1,
				concurrency: 1,
				degradedUntilMs: null
			}))
		};
		const publisher = {
			getWorkerSnapshot: vi.fn(() =>
				publisherSnapshot({ pressure: 'soft_limit', pendingBytes: 1_024 })
			)
		};
		const collector = new AgenticChatWorkerCapacityCollector(
			collectorPorts({ provider, publisher }) as never
		);

		await expect(collector.collect()).resolves.toMatchObject({
			provider: { available: false },
			publisher: { healthy: false, pendingBytes: 1_024 }
		});
	});

	it.each([
		[
			'runtime not running',
			{ runtime: { getHealth: () => ({ healthy: false, state: 'idle' }) } }
		],
		[
			'incoherent queue slots',
			{
				queue: {
					getCapacitySnapshot: () => ({
						concurrency: 1,
						activeJobs: 1,
						availableSlots: 1,
						acceptingWork: true,
						draining: false
					})
				}
			}
		],
		[
			'stale provider snapshot',
			{
				provider: {
					getSnapshot: () => ({
						observedAtMs: NOW - 15_001,
						configured: true,
						available: true,
						activeRequests: 0,
						concurrency: 1,
						degradedUntilMs: null
					})
				}
			}
		],
		[
			'malformed provider availability',
			{
				provider: {
					getSnapshot: () => ({
						observedAtMs: NOW,
						configured: false,
						available: true,
						activeRequests: 0,
						concurrency: 1,
						degradedUntilMs: null
					})
				}
			}
		],
		[
			'queue observation failure',
			{
				queueAge: {
					observeOldestReadyJobAgeMs: async () => {
						throw new Error('offline');
					}
				}
			}
		]
	])('fails closed on %s', async (_label, override) => {
		const collector = new AgenticChatWorkerCapacityCollector(collectorPorts(override) as never);
		await expect(collector.collect()).resolves.toBeNull();
	});
});
