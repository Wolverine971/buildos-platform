// apps/worker/tests/agenticChatShutdownDrain.test.ts
// Audit B2: a deploy mid-turn. On SIGTERM the chat worker stops claiming, lets
// running turns finish, aborts the rest as a worker shutdown, and stops the
// stream publisher only after each aborted turn's recovery handoff landed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred } from './helpers/deferred';
import type { ProcessingJob } from '../src/lib/supabaseQueue';
import { QueueShutdownAbortError } from '../src/lib/queueShutdown';
import { createAgenticChatConsumer } from '../src/workers/agentic-chat/host/consumer';
import { AgenticChatConsumerRuntime } from '../src/workers/agentic-chat/host/consumer-runtime';
import {
	AGENTIC_CHAT_RAILWAY_DRAINING_SECONDS,
	AGENTIC_CHAT_SHUTDOWN_BUDGET_V1
} from '../src/workers/agentic-chat/host/shutdown-budget';
import { classifyFailure } from '../src/workers/agentic-chat/turn/executor-failures';
import { AgenticChatEffectExecutionError } from '../src/workers/agentic-chat/mutations/mutation-executor';
import { AgenticChatProviderExecutionError } from '../src/workers/agentic-chat/provider/contracts';
import { AgenticChatCancellationError } from '../src/workers/agentic-chat/turn/cancellation-observer';

const { rpcMock } = vi.hoisted(() => ({
	rpcMock:
		vi.fn<
			(
				name: string,
				args?: Record<string, unknown>
			) => Promise<{ data: unknown; error: unknown }>
		>()
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		rpc: rpcMock,
		from: vi.fn(() => ({
			update: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) })
		}))
	}
}));

beforeEach(() => {
	rpcMock.mockReset();
	let claimed = false;
	rpcMock.mockImplementation(async (name) => {
		if (name === 'claim_pending_jobs') {
			if (claimed) return { data: [], error: null };
			claimed = true;
			return { data: [claimedChatJob()], error: null };
		}
		return { data: true, error: null };
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('Agentic Chat shutdown drain', () => {
	it('lets an in-flight turn finish inside the drain window and stops the publisher after it', async () => {
		const calls: string[] = [];
		const started = deferred<void>();
		const finish = deferred<void>();
		let abortReason: unknown = null;
		const consumer = createAgenticChatConsumer(
			{
				execute: async (job: ProcessingJob) => {
					job.signal.addEventListener('abort', () => (abortReason = job.signal.reason), {
						once: true
					});
					started.resolve();
					await finish.promise;
					calls.push('turn.completed');
				}
			},
			{ config: { drainTimeoutMs: 5_000 } }
		);
		const runtime = runtimeFor(consumer, calls);

		await runtime.start();
		await started.promise;
		const stopping = runtime.stop();
		await flush();
		// Draining: nothing downstream of the queue has stopped yet.
		expect(calls).toEqual(['recovery.stop']);
		expect(consumer.queue.getCapacitySnapshot()).toMatchObject({
			acceptingWork: false,
			draining: true,
			activeJobs: 1
		});

		finish.resolve();
		await stopping;

		expect(abortReason).toBeNull();
		expect(calls).toEqual([
			'recovery.stop',
			'turn.completed',
			'cancellation.stop',
			'publisher.stop'
		]);
		// One claim at startup; the drain claimed nothing more.
		expect(rpcMock.mock.calls.filter(([name]) => name === 'claim_pending_jobs')).toHaveLength(
			1
		);
	});

	it('aborts an unfinishable turn as a worker shutdown and awaits its recovery handoff before the publisher stops', async () => {
		const calls: string[] = [];
		const started = deferred<void>();
		const recoverRpc = deferred<void>();
		const recoverStarted = deferred<unknown>();
		const consumer = createAgenticChatConsumer(
			{
				execute: async (job: ProcessingJob) => {
					started.resolve();
					await new Promise<void>((resolve) =>
						job.signal.addEventListener('abort', () => resolve(), { once: true })
					);
					// The executor's catch → finalizer.recover → recover_agentic_chat_turn.
					recoverStarted.resolve(job.signal.reason);
					await recoverRpc.promise;
					calls.push('turn.requeued');
				}
			},
			{ config: { drainTimeoutMs: 20 } }
		);
		const runtime = runtimeFor(consumer, calls);

		await runtime.start();
		await started.promise;
		const stopping = runtime.stop();

		const reason = await recoverStarted.promise;
		expect(reason).toBeInstanceOf(QueueShutdownAbortError);
		// The handoff is still in flight: the publisher must still be running.
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(calls).toEqual(['recovery.stop']);

		recoverRpc.resolve();
		await stopping;

		expect(calls).toEqual([
			'recovery.stop',
			'turn.requeued',
			'cancellation.stop',
			'publisher.stop'
		]);
		// processor_managed: the queue never completes or fails the row itself.
		expect(
			rpcMock.mock.calls.some(
				([name]) => name === 'complete_queue_job' || name === 'fail_queue_job'
			)
		).toBe(false);
	});

	it('gives every aborted turn the chat cleanup grace from the shutdown budget', () => {
		const consumer = createAgenticChatConsumer({ execute: vi.fn() }, { config: {} });
		expect((consumer.queue as unknown as { abortGraceMs: number }).abortGraceMs).toBe(
			AGENTIC_CHAT_SHUTDOWN_BUDGET_V1.abortCleanupGraceMs
		);
	});
});

describe('Agentic Chat shutdown budget', () => {
	it('matches railway.chat.toml drainingSeconds', () => {
		const toml = readFileSync(
			fileURLToPath(new URL('../../../railway.chat.toml', import.meta.url)),
			'utf8'
		);
		const deploy = toml.split(/^\[deploy\]\s*$/m)[1]?.split(/^\[/m)[0] ?? '';
		const match = deploy.match(/^drainingSeconds\s*=\s*(\d+)\s*$/m);
		expect(match?.[1]).toBe(String(AGENTIC_CHAT_RAILWAY_DRAINING_SECONDS));
		// Overlap would keep the old deploy claiming turns it must then drain.
		expect(deploy).not.toMatch(/^overlapSeconds\s*=/m);
	});

	it('finishes natural drain, abort cleanup, and publisher shutdown before the hard stop', () => {
		const budget = AGENTIC_CHAT_SHUTDOWN_BUDGET_V1;
		expect(budget.drainingWindowMs).toBe(AGENTIC_CHAT_RAILWAY_DRAINING_SECONDS * 1_000);
		expect(budget.processHardStopMs).toBeLessThan(budget.drainingWindowMs);
		// Publisher shutdown flush is 5 s; leave it and Realtime/HTTP close room.
		expect(budget.maxQueueDrainTimeoutMs + budget.abortCleanupGraceMs + 5_000).toBeLessThan(
			budget.processHardStopMs
		);
		// The worker's own 10 s recovery RPC deadline fits the cleanup grace.
		expect(budget.abortCleanupGraceMs).toBeGreaterThan(10_000);
		expect(() =>
			createAgenticChatConsumer(
				{ execute: vi.fn() },
				{ config: { drainTimeoutMs: budget.maxQueueDrainTimeoutMs + 1 } }
			)
		).toThrow(`cannot exceed ${budget.maxQueueDrainTimeoutMs}ms process budget`);
	});
});

describe('worker_shutdown classification', () => {
	it('names the shutdown as the cause whatever the aborted step raised', () => {
		const shutdown = abortedWith(new QueueShutdownAbortError());

		expect(classifyFailure(shutdown.reason, true, shutdown)).toBe('worker_shutdown');
		expect(classifyFailure(shutdown.reason, false, shutdown)).toBe('worker_shutdown');
		// The provider (or a read tool) surfaces the abort as its own timeout.
		expect(
			classifyFailure(
				new AgenticChatProviderExecutionError(
					'provider_aborted',
					'timeout_post_start',
					'aborted'
				),
				true,
				shutdown
			)
		).toBe('worker_shutdown');
	});

	it('keeps effect truth: an uncertain write is never reported as a shutdown', () => {
		const shutdown = abortedWith(new QueueShutdownAbortError());
		expect(
			classifyFailure(
				new AgenticChatEffectExecutionError(
					'uncertain_external_commit',
					'e0000000-0000-4000-8000-000000000001',
					'write outcome unknown'
				),
				true,
				shutdown
			)
		).toBe('uncertain_external_commit');
	});

	it('leaves other aborts unchanged', () => {
		const timeout = abortedWith(new Error('Worker timeout after 360000ms'));
		expect(classifyFailure(timeout.reason, true, timeout)).toBe('timeout_post_start');
		expect(classifyFailure(timeout.reason, false, timeout)).toBe('timeout_pre_start');
		const stop = abortedWith(
			new AgenticChatCancellationError({
				turn_run_id: 'd3000000-0000-4000-8000-000000000001',
				execution_generation: 1,
				signal_id: 'd6000000-0000-4000-8000-000000000001',
				cancel_reason: 'user_cancelled',
				cancel_source: 'browser',
				cancel_requested_at: '2026-10-17T12:00:00.000Z',
				consumed_at: '2026-10-17T12:00:01.000Z'
			})
		);
		expect(classifyFailure(stop.reason, true, stop)).toBe('cancelled');
		expect(classifyFailure(new Error('boom'), true, new AbortController().signal)).toBe(
			'unknown'
		);
	});
});

function abortedWith(reason: unknown): AbortSignal {
	const controller = new AbortController();
	controller.abort(reason);
	return controller.signal;
}

function runtimeFor(
	consumer: ReturnType<typeof createAgenticChatConsumer>,
	calls: string[]
): AgenticChatConsumerRuntime {
	return new AgenticChatConsumerRuntime(consumer.queue, {
		publisher: service('publisher', calls),
		cancellation: service('cancellation', calls),
		recovery: { ...service('recovery', calls), getHealth: vi.fn(() => recoveryHealth()) },
		realtime: {
			getHealth: vi.fn(() => ({ healthy: true, status: 'idle' }) as never)
		}
	});
}

function service(name: string, calls: string[]) {
	return {
		start: vi.fn(),
		stop: vi.fn(async () => {
			calls.push(`${name}.stop`);
		})
	};
}

function recoveryHealth() {
	return {
		healthy: true,
		state: 'running' as const,
		lastSweepStartedAt: null,
		lastSweepFinishedAt: null,
		lastSuccessfulSweepAt: null,
		consecutiveSweepFailures: 0,
		lastError: null,
		lastCandidateCount: 0,
		lastAttentionRequiredCount: 0,
		lastParkedCount: 0
	};
}

async function flush(): Promise<void> {
	for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

function claimedChatJob() {
	const timestamp = '2026-10-17T12:00:00.000Z';
	return {
		attempts: 0,
		completed_at: null,
		created_at: timestamp,
		dedup_key: 'agentic-chat-turn:d3000000-0000-4000-8000-000000000001',
		error_message: null,
		id: 'd2000000-0000-4000-8000-000000000001',
		job_type: 'agentic_chat_turn',
		max_attempts: 3,
		metadata: {
			contractVersion: 'agentic_chat_worker_v1',
			turnRunId: 'd3000000-0000-4000-8000-000000000001',
			correlationId: 'd4000000-0000-4000-8000-000000000001'
		},
		priority: 10,
		processed_at: null,
		processing_token: 'd5000000-0000-4000-8000-000000000001',
		queue_job_id: 'agentic-chat-shutdown-drain',
		result: null,
		scheduled_for: timestamp,
		started_at: timestamp,
		status: 'processing',
		updated_at: timestamp,
		user_id: 'd1000000-0000-4000-8000-000000000001'
	};
}
