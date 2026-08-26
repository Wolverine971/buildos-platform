// apps/worker/tests/agenticChatConsumer.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../src/lib/supabase';
import {
	DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG,
	createAgenticChatConsumer
} from '../src/workers/agentic-chat/consumer';
import { AgenticChatConsumerRuntime } from '../src/workers/agentic-chat/consumerRuntime';
import { loadAgenticChatConfig } from '../src/workers/agentic-chat/config';
import { DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG } from '../src/workers/agentic-chat/streamPublisher';

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		rpc: vi.fn(),
		from: vi.fn()
	}
}));

const INTERNAL_USER_ID = 'd1000000-0000-4000-8000-000000000001';
const DEDICATED_PROVIDER_ENV = {
	PRIVATE_OPENROUTER_API_KEY: 'provider-secret',
	AGENTIC_CHAT_OPENROUTER_MODEL: 'provider/primary'
} as const;

function configuredEnvironment(
	overrides: Record<string, string | undefined> = {}
): NodeJS.ProcessEnv {
	return { ...DEDICATED_PROVIDER_ENV, ...overrides };
}

beforeEach(() => {
	vi.mocked(supabase.rpc).mockReset();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('Agentic Chat queue consumer', () => {
	it('constructs an inert one-type pool with the dedicated default envelope', () => {
		const execute = vi.fn();
		const consumer = createAgenticChatConsumer(testExecutor(execute), consumerOptions());

		expect(consumer.config).toEqual(DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG);
		expect(consumer.queue.getRegisteredJobTypes()).toEqual(['agentic_chat_turn']);
		expect(consumer.queue.getHealth()).toMatchObject({
			healthy: false,
			reason: 'queue_not_started'
		});
		expect(execute).not.toHaveBeenCalled();
	});

	it('accepts the reviewed two-slot bound and preserves the one-second fallback', () => {
		const executor = testExecutor();
		expect(
			createAgenticChatConsumer(executor, consumerOptions({ concurrency: 2 })).config
		).toMatchObject({ concurrency: 2 });
		expect(() =>
			createAgenticChatConsumer(executor, consumerOptions({ concurrency: 3 }))
		).toThrow('cannot exceed the reviewed bound of 2');
		expect(() =>
			createAgenticChatConsumer(executor, consumerOptions({ pollIntervalMs: 999 }))
		).toThrow('polling cannot be below 1000ms');
		expect(() =>
			createAgenticChatConsumer(
				executor,
				consumerOptions({
					workerTimeoutMs: 1_000,
					stalledTimeoutMs: 1_000
				})
			)
		).toThrow('stalled timeout must exceed');
	});

	it('uses wake for immediate pickup while retaining processor-managed lifecycle', async () => {
		const job = claimedChatJob();
		let exposeJob = false;
		let delivered = false;
		vi.mocked(supabase.rpc).mockImplementation(async (name, args) => {
			if (name !== 'claim_pending_jobs') return { data: true, error: null } as never;
			expect(args).toEqual({ p_job_types: ['agentic_chat_turn'], p_batch_size: 1 });
			if (!exposeJob || delivered) return { data: [], error: null } as never;
			delivered = true;
			return { data: [job], error: null } as never;
		});

		const execute = vi.fn().mockResolvedValue({ outcome: 'completed' });
		const consumer = createAgenticChatConsumer(
			testExecutor(execute),
			consumerOptions({ pollIntervalMs: 60_000 })
		);
		await consumer.queue.start();
		expect(execute).not.toHaveBeenCalled();

		exposeJob = true;
		await consumer.wake();
		await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
		expect(execute.mock.calls[0]?.[0]).toMatchObject({
			queueRowId: job.id,
			processingToken: job.processing_token,
			userId: job.user_id
		});
		expect(
			vi
				.mocked(supabase.rpc)
				.mock.calls.some(
					([name]) => name === 'complete_queue_job' || name === 'fail_queue_job'
				)
		).toBe(false);
		await consumer.queue.stop();
	});

	it('replays a wake that arrives while the initial durable claim is in flight', async () => {
		const job = claimedChatJob();
		let resolveInitialClaim!: (value: { data: unknown[]; error: null }) => void;
		const initialClaim = new Promise<{ data: unknown[]; error: null }>((resolve) => {
			resolveInitialClaim = resolve;
		});
		let claimCount = 0;
		vi.mocked(supabase.rpc).mockImplementation(async (name) => {
			if (name !== 'claim_pending_jobs') return { data: true, error: null } as never;
			claimCount += 1;
			if (claimCount === 1) return (await initialClaim) as never;
			return { data: claimCount === 2 ? [job] : [], error: null } as never;
		});

		const execute = vi.fn().mockResolvedValue({ outcome: 'completed' });
		const consumer = createAgenticChatConsumer(
			testExecutor(execute),
			consumerOptions({ pollIntervalMs: 60_000 })
		);
		const starting = consumer.queue.start();
		await vi.waitFor(() => expect(claimCount).toBe(1));
		const waking = consumer.wake();

		resolveInitialClaim({ data: [], error: null });
		await Promise.all([starting, waking]);
		await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
		expect(claimCount).toBeGreaterThanOrEqual(2);
		await consumer.queue.stop();
	});

	it('delegates stalled rows only to the fenced chat recovery service', async () => {
		vi.useFakeTimers();
		vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
		const consumer = createAgenticChatConsumer(testExecutor(), consumerOptions());

		await consumer.queue.start();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(
			vi.mocked(supabase.rpc).mock.calls.some(([name]) => name === 'reset_stalled_jobs')
		).toBe(false);
		await consumer.queue.stop();
	});

	it('executes an admitted job without a second worker-local user cohort', async () => {
		const job = { ...claimedChatJob(), user_id: 'd1000000-0000-4000-8000-000000000002' };
		let claimCount = 0;
		vi.mocked(supabase.rpc).mockImplementation(async (name) => {
			if (name !== 'claim_pending_jobs') return { data: true, error: null } as never;
			claimCount += 1;
			return { data: claimCount === 1 ? [job] : [], error: null } as never;
		});
		const execute = vi.fn().mockResolvedValue({ outcome: 'completed' });
		const executor = testExecutor(execute);
		const consumer = createAgenticChatConsumer(executor, consumerOptions());

		await consumer.queue.start();
		await vi.waitFor(() => expect(claimCount).toBeGreaterThanOrEqual(2));
		expect(execute).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ userId: job.user_id, queueRowId: job.id })
		);
		expect(
			vi
				.mocked(supabase.rpc)
				.mock.calls.some(
					([name]) => name === 'complete_queue_job' || name === 'fail_queue_job'
				)
		).toBe(false);
		await consumer.queue.stop();
	});
});

describe('Dedicated Agentic Chat startup configuration', () => {
	it('is enabled by dedicated process ownership and requires provider configuration', () => {
		expect(() => loadAgenticChatConfig({})).toThrow('PRIVATE_OPENROUTER_API_KEY');
		expect(loadAgenticChatConfig(configuredEnvironment())).toMatchObject({
			enabled: true,
			liveVisionEnabled: false,
			supervisorEnabled: false,
			consumptionBillingEnabled: false,
			mutationProviderCapabilities: {},
			mutationAdapterCapabilities: {},
			consumer: DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG,
			publisher: DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG,
			providerBudgetMs: 300_000,
			maxProviderRounds: 16,
			maxToolCalls: 40,
			provider: { routes: [expect.objectContaining({ model: 'provider/primary' })] }
		});
	});

	it('uses the shared live vision gate name and parses only an exact explicit value', () => {
		expect(
			loadAgenticChatConfig(configuredEnvironment({ AGENT_CHAT_LIVE_VISION_ENABLED: 'true' }))
		).toMatchObject({ enabled: true, liveVisionEnabled: true });
		expect(() =>
			loadAgenticChatConfig(configuredEnvironment({ AGENT_CHAT_LIVE_VISION_ENABLED: 'TRUE' }))
		).toThrow('AGENT_CHAT_LIVE_VISION_ENABLED must be exactly true or false');
	});

	it('keeps the worker supervisor default-off and parses only an exact explicit gate', () => {
		expect(
			loadAgenticChatConfig(
				configuredEnvironment({ AGENTIC_CHAT_WORKER_SUPERVISOR_ENABLED: 'true' })
			)
		).toMatchObject({ enabled: true, supervisorEnabled: true });
		expect(() =>
			loadAgenticChatConfig(
				configuredEnvironment({ AGENTIC_CHAT_WORKER_SUPERVISOR_ENABLED: 'TRUE' })
			)
		).toThrow('AGENTIC_CHAT_WORKER_SUPERVISOR_ENABLED must be exactly true or false');
	});

	it('keeps terminal consumption billing aligned with the exact shared web gate', () => {
		expect(
			loadAgenticChatConfig(
				configuredEnvironment({ PRIVATE_ENABLE_CONSUMPTION_BILLING_GATE: 'true' })
			)
		).toMatchObject({ enabled: true, consumptionBillingEnabled: true });
		expect(() =>
			loadAgenticChatConfig(
				configuredEnvironment({ PRIVATE_ENABLE_CONSUMPTION_BILLING_GATE: 'TRUE' })
			)
		).toThrow('PRIVATE_ENABLE_CONSUMPTION_BILLING_GATE must be exactly true or false');
	});

	it('keeps mutation capabilities default-off and requires exact dual-gate configuration', () => {
		const capabilities = 'updateOntoTask,moveDocumentInTree';
		expect(
			loadAgenticChatConfig(
				configuredEnvironment({
					AGENTIC_CHAT_MUTATION_PROVIDER_CAPABILITIES: capabilities,
					AGENTIC_CHAT_MUTATION_ADAPTER_CAPABILITIES: capabilities
				})
			)
		).toMatchObject({
			mutationProviderCapabilities: {
				updateOntoTask: true,
				moveDocumentInTree: true
			},
			mutationAdapterCapabilities: {
				updateOntoTask: true,
				moveDocumentInTree: true
			}
		});
		expect(() =>
			loadAgenticChatConfig(
				configuredEnvironment({
					AGENTIC_CHAT_MUTATION_PROVIDER_CAPABILITIES: 'updateOntoTask'
				})
			)
		).toThrow('update_onto_task provider capability requires its mutation adapter');
		expect(() =>
			loadAgenticChatConfig(
				configuredEnvironment({
					AGENTIC_CHAT_MUTATION_ADAPTER_CAPABILITIES: 'updateOntoTask,updateOntoTask'
				})
			)
		).toThrow('AGENTIC_CHAT_MUTATION_ADAPTER_CAPABILITIES must not contain duplicates');
		expect(() =>
			loadAgenticChatConfig(
				configuredEnvironment({
					AGENTIC_CHAT_MUTATION_ADAPTER_CAPABILITIES: 'updateOntoTask, moveDocumentInTree'
				})
			)
		).toThrow('must be a comma-separated canonical capability list');
		expect(() =>
			loadAgenticChatConfig(
				configuredEnvironment({
					AGENTIC_CHAT_MUTATION_ADAPTER_CAPABILITIES: 'update_onto_task'
				})
			)
		).toThrow('AGENTIC_CHAT_MUTATION_ADAPTER_CAPABILITIES contains an unknown capability');
	});

	it('parses an independently bounded two-slot queue policy', () => {
		const config = loadAgenticChatConfig({
			...DEDICATED_PROVIDER_ENV,
			AGENTIC_CHAT_OPENROUTER_FALLBACK_MODELS: 'provider/fallback-1,provider/fallback-2',
			CHAT_CONCURRENCY: '2',
			CHAT_POLL_INTERVAL_MS: '1500',
			CHAT_WORKER_TIMEOUT_MS: '2000',
			CHAT_PROVIDER_BUDGET_MS: '1200',
			CHAT_STALLED_TIMEOUT_MS: '3000',
			CHAT_DRAIN_TIMEOUT_MS: '1000',
			CHAT_MAX_TOOL_ROUNDS: '4',
			CHAT_MAX_TOOL_CALLS: '9'
		});

		expect(config).toEqual({
			enabled: true,
			liveVisionEnabled: false,
			supervisorEnabled: false,
			consumptionBillingEnabled: false,
			mutationProviderCapabilities: {},
			mutationAdapterCapabilities: {},
			consumer: {
				concurrency: 2,
				pollIntervalMs: 1500,
				workerTimeoutMs: 2000,
				stalledTimeoutMs: 3000,
				drainTimeoutMs: 1000
			},
			publisher: DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG,
			providerBudgetMs: 1200,
			maxProviderRounds: 4,
			maxToolCalls: 9,
			provider: {
				routes: [
					{
						id: 'openrouter',
						kind: 'openrouter',
						baseUrl: 'https://openrouter.ai/api/v1',
						apiKey: 'provider-secret',
						model: 'provider/primary',
						fallbackModels: ['provider/fallback-1', 'provider/fallback-2'],
						providerRouting: {
							allow_fallbacks: true,
							order: ['deepinfra', 'deepseek', 'alibaba', 'cloudflare']
						}
					}
				]
			}
		});
	});

	it('requires explicit capacity, timeout, cadence, and publisher high-water values in the production profile', () => {
		const productionEnvironment = {
			...DEDICATED_PROVIDER_ENV,
			AGENTIC_CHAT_WORKER_PROFILE: 'production',
			CHAT_CONCURRENCY: '2',
			CHAT_POLL_INTERVAL_MS: '1000',
			CHAT_WORKER_TIMEOUT_MS: '360000',
			CHAT_PROVIDER_BUDGET_MS: '270000',
			CHAT_STALLED_TIMEOUT_MS: '420000',
			CHAT_DRAIN_TIMEOUT_MS: '22000',
			CHAT_PUBLISHER_TURN_PENDING_SOFT_BYTES: '262144',
			CHAT_PUBLISHER_TURN_PENDING_HARD_BYTES: '1048576',
			CHAT_PUBLISHER_WORKER_PENDING_SOFT_BYTES: '2097152',
			CHAT_PUBLISHER_WORKER_PENDING_HARD_BYTES: '8388608',
			CHAT_PUBLISHER_TURN_PENDING_SOFT_EVENTS: '32',
			CHAT_PUBLISHER_TURN_PENDING_HARD_EVENTS: '128',
			CHAT_PUBLISHER_WORKER_PENDING_SOFT_EVENTS: '256',
			CHAT_PUBLISHER_WORKER_PENDING_HARD_EVENTS: '1024',
			AGENT_CHAT_LIVE_VISION_ENABLED: 'true'
		};

		expect(loadAgenticChatConfig(productionEnvironment)).toMatchObject({
			enabled: true,
			publisher: {
				turnPendingSoftBytes: 262_144,
				turnPendingHardBytes: 1_048_576,
				workerPendingSoftBytes: 2_097_152,
				workerPendingHardBytes: 8_388_608,
				turnPendingSoftEvents: 32,
				turnPendingHardEvents: 128,
				workerPendingSoftEvents: 256,
				workerPendingHardEvents: 1024
			}
		});
		for (const requiredName of [
			'CHAT_CONCURRENCY',
			'CHAT_POLL_INTERVAL_MS',
			'CHAT_WORKER_TIMEOUT_MS',
			'CHAT_PROVIDER_BUDGET_MS',
			'CHAT_STALLED_TIMEOUT_MS',
			'CHAT_DRAIN_TIMEOUT_MS',
			'CHAT_PUBLISHER_TURN_PENDING_SOFT_BYTES',
			'CHAT_PUBLISHER_TURN_PENDING_HARD_BYTES',
			'CHAT_PUBLISHER_WORKER_PENDING_SOFT_BYTES',
			'CHAT_PUBLISHER_WORKER_PENDING_HARD_BYTES',
			'CHAT_PUBLISHER_TURN_PENDING_SOFT_EVENTS',
			'CHAT_PUBLISHER_TURN_PENDING_HARD_EVENTS',
			'CHAT_PUBLISHER_WORKER_PENDING_SOFT_EVENTS',
			'CHAT_PUBLISHER_WORKER_PENDING_HARD_EVENTS',
			'AGENT_CHAT_LIVE_VISION_ENABLED'
		] as const) {
			expect(() =>
				loadAgenticChatConfig({
					...productionEnvironment,
					[requiredName]: undefined
				})
			).toThrow(`${requiredName} must be explicitly configured for the production profile`);
		}
		expect(() =>
			loadAgenticChatConfig({
				...productionEnvironment,
				CHAT_PUBLISHER_WORKER_PENDING_SOFT_BYTES: '8388608'
			})
		).toThrow('worker pending-byte soft limit must be below the hard limit');
		expect(() =>
			loadAgenticChatConfig({
				...productionEnvironment,
				AGENTIC_CHAT_WORKER_PROFILE: 'Production'
			})
		).toThrow('AGENTIC_CHAT_WORKER_PROFILE must be exactly production when set');
	});

	it('fails closed on incomplete or out-of-envelope dedicated-service values', () => {
		expect(() =>
			loadAgenticChatConfig(configuredEnvironment({ CHAT_CONCURRENCY: '3' }))
		).toThrow('cannot exceed the reviewed bound of 2');
		expect(() =>
			loadAgenticChatConfig({
				...DEDICATED_PROVIDER_ENV,
				CHAT_DRAIN_TIMEOUT_MS: '25000'
			})
		).toThrow('cannot exceed 22000ms process budget');
		expect(() =>
			loadAgenticChatConfig({
				...DEDICATED_PROVIDER_ENV,
				CHAT_DRAIN_TIMEOUT_MS: '22001'
			})
		).toThrow('cannot exceed 22000ms process budget');
		expect(() => loadAgenticChatConfig({})).toThrow('PRIVATE_OPENROUTER_API_KEY');
		expect(() =>
			loadAgenticChatConfig({
				...DEDICATED_PROVIDER_ENV,
				AGENTIC_CHAT_OPENROUTER_BASE_URL: 'http://openrouter.example/api/v1'
			})
		).toThrow('clean HTTPS base URL');
		expect(() =>
			loadAgenticChatConfig({
				...DEDICATED_PROVIDER_ENV,
				AGENTIC_CHAT_OPENROUTER_FALLBACK_MODELS: 'provider/fallback,provider/fallback'
			})
		).toThrow('must be unique');
	});
});

describe('Agentic Chat consumer lifecycle', () => {
	it('starts and drains owned services in dependency-safe order', async () => {
		const consumer = createAgenticChatConsumer(testExecutor(), consumerOptions());
		const calls: string[] = [];
		vi.spyOn(consumer.queue, 'start').mockImplementation(async () => {
			calls.push('queue.start');
		});
		vi.spyOn(consumer.queue, 'stop').mockImplementation(async () => {
			calls.push('queue.stop');
		});
		const runtime = new AgenticChatConsumerRuntime(consumer.queue, {
			publisher: service('publisher', calls),
			cancellation: service('cancellation', calls),
			recovery: service('recovery', calls),
			realtime: realtimeHealth()
		});

		await runtime.start();
		expect(calls).toEqual([
			'publisher.start',
			'cancellation.start',
			'recovery.start',
			'queue.start'
		]);
		await runtime.stop();
		expect(calls).toEqual([
			'publisher.start',
			'cancellation.start',
			'recovery.start',
			'queue.start',
			'recovery.stop',
			'queue.stop',
			'cancellation.stop',
			'publisher.stop'
		]);
		expect(runtime.getHealth()).toMatchObject({
			healthy: true,
			reason: 'stopped',
			state: 'stopped'
		});
		await expect(runtime.start()).rejects.toThrow('cannot start from stopped');
	});

	it('rolls back earlier services when startup fails', async () => {
		const consumer = createAgenticChatConsumer(testExecutor(), consumerOptions());
		const calls: string[] = [];
		vi.spyOn(consumer.queue, 'stop').mockImplementation(async () => {
			calls.push('queue.stop');
		});
		const publisher = service('publisher', calls);
		const cancellation = service('cancellation', calls);
		const recovery = service('recovery', calls);
		recovery.start.mockImplementation(() => {
			calls.push('recovery.start');
			throw new Error('recovery unavailable');
		});
		const runtime = new AgenticChatConsumerRuntime(consumer.queue, {
			publisher,
			cancellation,
			recovery,
			realtime: realtimeHealth()
		});

		await expect(runtime.start()).rejects.toThrow('recovery unavailable');
		expect(calls).toEqual([
			'publisher.start',
			'cancellation.start',
			'recovery.start',
			'queue.stop',
			'cancellation.stop',
			'publisher.stop'
		]);
		expect(runtime.getHealth()).toMatchObject({ state: 'stopped' });
	});

	it('attempts every drain stage even if one service stop fails', async () => {
		const consumer = createAgenticChatConsumer(testExecutor(), consumerOptions());
		const calls: string[] = [];
		vi.spyOn(consumer.queue, 'start').mockResolvedValue();
		vi.spyOn(consumer.queue, 'stop').mockImplementation(async () => {
			calls.push('queue.stop');
		});
		const publisher = service('publisher', calls);
		const cancellation = service('cancellation', calls);
		const recovery = service('recovery', calls);
		recovery.stop.mockImplementation(async () => {
			calls.push('recovery.stop');
			throw new Error('recovery stop failed');
		});
		const runtime = new AgenticChatConsumerRuntime(consumer.queue, {
			publisher,
			cancellation,
			recovery,
			realtime: realtimeHealth()
		});
		await runtime.start();
		calls.length = 0;

		await expect(runtime.stop()).rejects.toThrow('shutdown was incomplete');
		expect(calls).toEqual([
			'recovery.stop',
			'queue.stop',
			'cancellation.stop',
			'publisher.stop'
		]);
		expect(runtime.getHealth()).toMatchObject({ state: 'stopped' });
	});

	it('turns runtime health unhealthy after repeated stalled-sweep failures', async () => {
		vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
		const consumer = createAgenticChatConsumer(testExecutor(), consumerOptions());
		const recovery = service('recovery', []);
		const runtime = new AgenticChatConsumerRuntime(consumer.queue, {
			publisher: service('publisher', []),
			cancellation: service('cancellation', []),
			recovery,
			realtime: realtimeHealth()
		});
		await runtime.start();
		recovery.getHealth.mockReturnValue(
			recoveryHealth({
				healthy: false,
				reason: 'repeated_sweep_failures',
				consecutiveSweepFailures: 3,
				lastError: 'database unavailable'
			})
		);

		expect(runtime.getHealth()).toMatchObject({
			healthy: false,
			state: 'running',
			reason: 'repeated_sweep_failures',
			recovery: {
				consecutiveSweepFailures: 3,
				lastError: 'database unavailable'
			}
		});
		await runtime.stop();
	});

	it('refuses a mixed or general queue at construction', () => {
		const consumer = createAgenticChatConsumer(testExecutor(), consumerOptions());
		consumer.queue.process('send_notification', vi.fn());
		expect(
			() =>
				new AgenticChatConsumerRuntime(consumer.queue, {
					publisher: service('publisher', []),
					cancellation: service('cancellation', []),
					recovery: service('recovery', []),
					realtime: realtimeHealth()
				})
		).toThrow('requires one isolated agentic_chat_turn queue');
	});
});

function service(name: string, calls: string[]) {
	return {
		start: vi.fn(() => {
			calls.push(`${name}.start`);
		}),
		stop: vi.fn(async () => {
			calls.push(`${name}.stop`);
		}),
		getHealth: vi.fn(() => recoveryHealth())
	};
}

function recoveryHealth(overrides: Record<string, unknown> = {}) {
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
		...overrides
	};
}

function realtimeHealth() {
	return {
		getHealth: vi.fn(() => ({
			healthy: true,
			status: 'idle' as const,
			activeChannels: 0,
			lastTransitionAt: null,
			consecutiveFailures: 0
		}))
	};
}

function consumerOptions(config = {}) {
	return { config };
}

function testExecutor(execute = vi.fn()) {
	return { execute };
}

function claimedChatJob() {
	const timestamp = '2026-08-03T12:00:00.000Z';
	return {
		attempts: 0,
		completed_at: null,
		created_at: timestamp,
		dedup_key: 'agentic-chat-turn:test',
		error_message: null,
		id: 'd2000000-0000-4000-8000-000000000001',
		job_type: 'agentic_chat_turn',
		max_attempts: 1,
		metadata: {
			contractVersion: 'agentic_chat_worker_v1',
			turnRunId: 'd3000000-0000-4000-8000-000000000001',
			correlationId: 'd4000000-0000-4000-8000-000000000001'
		},
		priority: 10,
		processed_at: null,
		processing_token: 'd5000000-0000-4000-8000-000000000001',
		queue_job_id: 'agentic-chat-turn:test',
		result: null,
		scheduled_for: timestamp,
		started_at: timestamp,
		status: 'processing',
		updated_at: timestamp,
		user_id: INTERNAL_USER_ID
	};
}
