// apps/worker/tests/supabaseQueueRefill.test.ts
// Per-slot refill regression from the 2026-07-23 queue audit: a fast job
// finishing must make room for the next pending job even while a slow sibling
// from the original claim remains active.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseQueue, type ProcessingJob } from '../src/lib/supabaseQueue';
import { supabase } from '../src/lib/supabase';
import { processCaptureChatCheckpointJob } from '../src/workers/chat/checkpoint/checkpointJob';
import type { CheckpointCapturePorts } from '../src/workers/chat/checkpoint/checkpointCapture';

const { rpcMock } = vi.hoisted(() => ({
	rpcMock:
		vi.fn<
			(
				name: string,
				args?: Record<string, unknown>
			) => Promise<{ data: unknown; error: unknown }>
		>()
}));

const { captureMock, jsonMock } = vi.hoisted(() => ({
	captureMock: vi.fn(),
	jsonMock: vi.fn().mockResolvedValue({})
}));
vi.mock('../src/workers/chat/checkpoint/checkpointCapture', () => ({
	runChatCheckpointCapture: captureMock
}));
vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		getJSONResponse = jsonMock;
	}
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		rpc: vi.fn((name: string, args?: Record<string, unknown>) => request(rpcMock(name, args))),
		from: vi.fn()
	}
}));

vi.mock('../src/lib/errorLogger', () => ({ logWorkerError: vi.fn() }));

type Response = { data: unknown; error: unknown };

// Model PostgREST's thenable builder, including abort-as-error responses.
function request(result: Promise<Response>) {
	return Object.assign(result, {
		abortSignal(signal: AbortSignal) {
			return new Promise<Response>((resolve, reject) => {
				const abort = () =>
					resolve({ data: null, error: { message: 'Request timed out' } });
				if (signal.aborted) return abort();
				signal.addEventListener('abort', abort, { once: true });
				void result
					.then(resolve, reject)
					.finally(() => signal.removeEventListener('abort', abort));
			});
		}
	});
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function fakeRequestDeadlines() {
	vi.useFakeTimers();
	return vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), ms);
		return controller.signal;
	});
}

type TestMetadata = { label: 'slow' | 'fast-1' | 'fast-2' };

function claimedJob(sequence: number, label: TestMetadata['label']) {
	const timestamp = new Date(2026, 6, 23, 12, 0, sequence).toISOString();
	return {
		attempts: 0,
		completed_at: null,
		created_at: timestamp,
		dedup_key: `dedup-${sequence}`,
		error_message: null,
		id: `row-${sequence}`,
		job_type: 'send_notification',
		max_attempts: 3,
		metadata: { label },
		priority: 10,
		processed_at: null,
		processing_token: null,
		queue_job_id: `job-${sequence}`,
		result: null,
		scheduled_for: timestamp,
		started_at: timestamp,
		status: 'processing',
		updated_at: timestamp,
		user_id: 'user-1'
	};
}

describe('SupabaseQueue per-slot refill', () => {
	beforeEach(() => {
		rpcMock.mockReset();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('aborts a hung claim after 30 seconds and resumes claiming', async () => {
		const deadlines = fakeRequestDeadlines();
		const hungClaim = deferred<Response>();
		let claims = 0;
		rpcMock.mockImplementation(async (name) => {
			if (name === 'claim_pending_jobs' && ++claims === 1) return hungClaim.promise;
			return { data: [], error: null };
		});
		const queue = new SupabaseQueue({ pollInterval: 1_000, genericStalledRecovery: false });
		const start = queue.start();
		try {
			await vi.advanceTimersByTimeAsync(29_999);
			expect(claims).toBe(1);
			await vi.advanceTimersByTimeAsync(1_001);
			expect(claims).toBe(2);
			expect(deadlines).toHaveBeenCalledWith(30_000);
			expect(queue.getHealth().healthy).toBe(true);
		} finally {
			hungClaim.resolve({ data: [], error: null });
			await start;
			await queue.stop();
		}
	});

	it('retries a hung heartbeat with a fresh 30 second deadline', async () => {
		fakeRequestDeadlines();
		const heartbeat = deferred<Response>();
		const work = deferred<void>();
		let claims = 0;
		rpcMock.mockImplementation(async (name) => ({
			data:
				name === 'claim_pending_jobs'
					? ++claims === 1
						? [{ ...claimedJob(1, 'slow'), processing_token: 'token-1' }]
						: []
					: true,
			error: null
		}));
		const update = vi.fn(() => {
			const builder = Object.assign(request(heartbeat.promise), { eq: vi.fn() });
			builder.eq.mockReturnValue(builder);
			return builder;
		});
		vi.mocked(supabase.from).mockReturnValue({ update } as never);
		const queue = new SupabaseQueue({
			batchSize: 1,
			stalledTimeout: 15_000,
			genericStalledRecovery: false
		});
		queue.process('send_notification', () => work.promise);
		await queue.start();
		try {
			await vi.advanceTimersByTimeAsync(34_999);
			expect(update).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(5_001);
			expect(update.mock.calls.length).toBeGreaterThanOrEqual(2);
		} finally {
			heartbeat.resolve({ data: null, error: null });
			work.resolve();
			await queue.stop();
		}
	});

	it('bounds every completion attempt without requeueing successful work', async () => {
		fakeRequestDeadlines();
		const completion = deferred<Response>();
		let claims = 0;
		let completions = 0;
		rpcMock.mockImplementation(async (name) => {
			if (name === 'claim_pending_jobs')
				return { data: ++claims === 1 ? [claimedJob(1, 'fast-1')] : [], error: null };
			if (name === 'complete_queue_job') {
				completions++;
				return completion.promise;
			}
			return { data: true, error: null };
		});
		const processor = vi.fn(async () => undefined);
		const queue = new SupabaseQueue({ batchSize: 1, genericStalledRecovery: false });
		queue.process('send_notification', processor);
		await queue.start();
		try {
			await vi.advanceTimersByTimeAsync(93_001);
			expect(completions).toBe(3);
			expect(queue.getCapacitySnapshot().activeJobs).toBe(0);
			expect(processor).toHaveBeenCalledTimes(1);
			expect(rpcMock.mock.calls.some(([name]) => name === 'fail_queue_job')).toBe(false);
		} finally {
			completion.resolve({ data: true, error: null });
			await queue.stop();
		}
	});

	it.each(['resolve', 'reject'] as const)(
		'keeps a timed-out processor heartbeating and occupying its slot until it %ss',
		async (settlement) => {
			fakeRequestDeadlines();
			const work = deferred<void>();
			const pending = [{ ...claimedJob(1, 'slow'), processing_token: 'token-1' }];
			let running = 0;
			let maxRunning = 0;
			let attempts = 0;
			let signal: AbortSignal | undefined;
			rpcMock.mockImplementation(async (name) => {
				if (name === 'claim_pending_jobs') return { data: pending.splice(0), error: null };
				if (name === 'fail_queue_job')
					pending.push({ ...claimedJob(1, 'slow'), processing_token: 'token-2' });
				return { data: true, error: null };
			});
			const builder = {
				eq: vi.fn(),
				abortSignal: vi.fn().mockResolvedValue({ error: null })
			};
			builder.eq.mockReturnValue(builder);
			const update = vi.fn(() => builder);
			vi.mocked(supabase.from).mockReturnValue({ update } as never);
			const queue = new SupabaseQueue({ batchSize: 1, genericStalledRecovery: false });
			queue.process(
				'send_notification',
				async (job) => {
					running++;
					maxRunning = Math.max(maxRunning, running);
					try {
						if (++attempts === 1) {
							signal = job.signal;
							await work.promise;
						}
					} finally {
						running--;
					}
				},
				{ workerTimeoutMs: 25 }
			);
			await queue.start();
			try {
				await vi.advanceTimersByTimeAsync(60_001);
				expect(signal?.aborted).toBe(true);
				expect(queue.getCapacitySnapshot().activeJobs).toBe(1);
				expect(rpcMock.mock.calls.some(([name]) => name === 'fail_queue_job')).toBe(false);
				expect(update).toHaveBeenCalledTimes(1);
				if (settlement === 'reject') work.reject(new Error('Late provider failure'));
				else work.resolve();
				await vi.advanceTimersByTimeAsync(0);
				expect(rpcMock).toHaveBeenCalledWith(
					'fail_queue_job',
					expect.objectContaining({
						p_retry: true,
						p_processing_token: 'token-1',
						p_error_message: expect.stringContaining('Worker timed out')
					})
				);
				expect(attempts).toBe(2);
				expect(maxRunning).toBe(1);
			} finally {
				work.resolve();
				await queue.stop();
			}
		}
	);

	it.each(['resolve', 'reject'] as const)(
		'releases an uncooperative timed-out job after three minutes and ignores late %s',
		async (settlement) => {
			vi.useFakeTimers();
			const work = deferred<void>();
			const pending = [{ ...claimedJob(1, 'slow'), processing_token: 'token-1' }];
			let signal: AbortSignal | undefined;
			rpcMock.mockImplementation(async (name) => ({
				data: name === 'claim_pending_jobs' ? pending.splice(0) : true,
				error: null
			}));
			const builder = {
				eq: vi.fn(),
				abortSignal: vi.fn().mockResolvedValue({ error: null })
			};
			builder.eq.mockReturnValue(builder);
			const update = vi.fn(() => builder);
			vi.mocked(supabase.from).mockReturnValue({ update } as never);
			const queue = new SupabaseQueue({ batchSize: 1, genericStalledRecovery: false });
			queue.process(
				'send_notification',
				async (job) => {
					signal = job.signal;
					await work.promise;
				},
				{ workerTimeoutMs: 25 }
			);
			await queue.start();
			try {
				await vi.advanceTimersByTimeAsync(180_024);
				expect(signal?.aborted).toBe(true);
				expect(queue.getCapacitySnapshot().activeJobs).toBe(1);
				expect(update).toHaveBeenCalled();
				await vi.advanceTimersByTimeAsync(1);
				expect(queue.getCapacitySnapshot().activeJobs).toBe(0);
				const heartbeatCount = update.mock.calls.length;
				await vi.advanceTimersByTimeAsync(120_000);
				expect(update).toHaveBeenCalledTimes(heartbeatCount);
				if (settlement === 'reject') work.reject(new Error('Late failure'));
				else work.resolve();
				await vi.advanceTimersByTimeAsync(0);
				expect(
					rpcMock.mock.calls.some(
						([name]) => name === 'complete_queue_job' || name === 'fail_queue_job'
					)
				).toBe(false);
			} finally {
				work.resolve();
				await vi.advanceTimersByTimeAsync(0);
				await queue.stop();
			}
		}
	);

	it('passes the checkpoint job signal to both capture LLM operations', async () => {
		const controller = new AbortController();
		captureMock.mockImplementation(async (ports: CheckpointCapturePorts) => {
			for (const operation of ['thinking_log', 'start_here_synthesis'] as const) {
				await ports.completeJson({
					systemPrompt: 'system',
					userPrompt: 'user',
					userId: 'user-1',
					operation
				});
			}
			return { status: 'skipped', reason: 'no_changes' };
		});
		await processCaptureChatCheckpointJob({
			id: 'job-1',
			userId: 'user-1',
			correlationId: null,
			attempts: 0,
			data: { sessionId: 'session-1', userId: 'user-1', trigger: 'idle' },
			signal: controller.signal,
			log: vi.fn(),
			updateProgress: vi.fn()
		});
		expect(jsonMock).toHaveBeenCalledTimes(2);
		for (const [params] of jsonMock.mock.calls) expect(params.signal).toBe(controller.signal);
	});

	it('claims one replacement as soon as a fast job frees its slot', async () => {
		const claims = [
			[claimedJob(1, 'slow'), claimedJob(2, 'fast-1')],
			[claimedJob(3, 'fast-2')],
			[]
		];
		const claimedBatchSizes: number[] = [];

		rpcMock.mockImplementation(async (functionName, args) => {
			if (functionName === 'claim_pending_jobs') {
				claimedBatchSizes.push((args as { p_batch_size: number }).p_batch_size);
				return { data: claims.shift() ?? [], error: null } as never;
			}
			if (functionName === 'complete_queue_job') {
				return { data: true, error: null } as never;
			}
			return { data: false, error: null } as never;
		});

		let releaseSlow!: () => void;
		const slowGate = new Promise<void>((resolve) => {
			releaseSlow = resolve;
		});
		const started: string[] = [];
		const finished: string[] = [];
		let running = 0;
		let maxRunning = 0;

		const queue = new SupabaseQueue({ batchSize: 2, pollInterval: 60_000 });
		queue.process<TestMetadata>(
			'send_notification',
			async (job: ProcessingJob<TestMetadata>) => {
				started.push(job.data.label);
				running++;
				maxRunning = Math.max(maxRunning, running);
				if (job.data.label === 'slow') {
					await slowGate;
				}
				finished.push(job.data.label);
				running--;
			}
		);

		await queue.start();

		await vi.waitFor(() => {
			expect(started).toContain('fast-2');
		});
		expect(finished).toEqual(['fast-1', 'fast-2']);
		expect(started).toEqual(['slow', 'fast-1', 'fast-2']);
		expect(claimedBatchSizes.slice(0, 2)).toEqual([2, 1]);
		expect(maxRunning).toBe(2);

		releaseSlow();
		await vi.waitFor(() => {
			expect(finished).toContain('slow');
		});
		await queue.stop();
	});

	it('drains jobs returned by a claim that was already in flight at shutdown', async () => {
		let finishClaim!: (value: { data: unknown[]; error: null }) => void;
		const claimGate = new Promise<{ data: unknown[]; error: null }>((resolve) => {
			finishClaim = resolve;
		});
		let releaseJob!: () => void;
		const jobGate = new Promise<void>((resolve) => {
			releaseJob = resolve;
		});

		rpcMock.mockImplementation(async (functionName) => {
			if (functionName === 'claim_pending_jobs') {
				return (await claimGate) as never;
			}
			if (functionName === 'complete_queue_job') {
				return { data: true, error: null } as never;
			}
			return { data: false, error: null } as never;
		});

		let processorStarted = false;
		const queue = new SupabaseQueue({ batchSize: 1, pollInterval: 10 });
		queue.process<TestMetadata>(
			'send_notification',
			async (_job: ProcessingJob<TestMetadata>) => {
				processorStarted = true;
				await jobGate;
			}
		);

		const start = queue.start();
		await vi.waitFor(() => {
			expect(supabase.rpc).toHaveBeenCalledWith(
				'claim_pending_jobs',
				expect.objectContaining({ p_batch_size: 1 })
			);
		});

		let stopped = false;
		const stop = queue.stop().then(() => {
			stopped = true;
		});
		finishClaim({ data: [claimedJob(4, 'slow')], error: null });

		await vi.waitFor(() => {
			expect(processorStarted).toBe(true);
		});
		expect(stopped).toBe(false);

		releaseJob();
		await Promise.all([start, stop]);
		expect(stopped).toBe(true);

		const claimCalls = rpcMock.mock.calls.filter(
			([functionName]) => functionName === 'claim_pending_jobs'
		);
		expect(claimCalls).toHaveLength(1);
	});

	it('exposes the queue row identity and leaves processor-managed lifecycle writes alone', async () => {
		const chatJob = {
			...claimedJob(5, 'fast-1'),
			id: 'd5000000-0000-4000-8000-000000000001',
			job_type: 'agentic_chat_turn',
			processing_token: 'd7000000-0000-4000-8000-000000000001'
		};
		let claimCount = 0;
		rpcMock.mockImplementation(async (functionName) => {
			if (functionName === 'claim_pending_jobs') {
				claimCount += 1;
				return { data: claimCount === 1 ? [chatJob] : [], error: null } as never;
			}
			return { data: true, error: null } as never;
		});

		const received: { job?: ProcessingJob<TestMetadata> } = {};
		const queue = new SupabaseQueue({ batchSize: 1, pollInterval: 60_000 });
		queue.process<TestMetadata>(
			'agentic_chat_turn',
			async (job) => {
				received.job = job;
			},
			{ queueLifecycle: 'processor_managed' }
		);

		await queue.start();
		await vi.waitFor(() => expect(received.job).toBeDefined());
		await vi.waitFor(() => expect(claimCount).toBeGreaterThanOrEqual(2));

		expect(received.job?.id).toBe(chatJob.queue_job_id);
		expect(received.job?.queueRowId).toBe(chatJob.id);
		expect(received.job?.priority).toBe(chatJob.priority);
		expect(
			rpcMock.mock.calls.some(
				([name]) => name === 'complete_queue_job' || name === 'fail_queue_job'
			)
		).toBe(false);
		await queue.stop();
	});

	it('uses a processor-scoped timeout instead of the module-global worker timeout', async () => {
		const chatJob = {
			...claimedJob(6, 'fast-1'),
			id: 'd5000000-0000-4000-8000-000000000002',
			job_type: 'agentic_chat_turn',
			processing_token: 'd7000000-0000-4000-8000-000000000002'
		};
		let claimCount = 0;
		rpcMock.mockImplementation(async (functionName) => {
			if (functionName === 'claim_pending_jobs') {
				claimCount += 1;
				return { data: claimCount === 1 ? [chatJob] : [], error: null } as never;
			}
			return { data: true, error: null } as never;
		});

		let aborted = false;
		const queue = new SupabaseQueue({ batchSize: 1, pollInterval: 60_000 });
		queue.process<TestMetadata>(
			'agentic_chat_turn',
			async (processingJob) => {
				await new Promise<void>((resolve) => {
					processingJob.signal.addEventListener(
						'abort',
						() => {
							aborted = true;
							resolve();
						},
						{ once: true }
					);
				});
			},
			{ queueLifecycle: 'processor_managed', workerTimeoutMs: 20 }
		);

		await queue.start();
		await vi.waitFor(() => expect(aborted).toBe(true));
		expect(
			rpcMock.mock.calls.some(
				([name]) => name === 'complete_queue_job' || name === 'fail_queue_job'
			)
		).toBe(false);
		await queue.stop();
	});
});
