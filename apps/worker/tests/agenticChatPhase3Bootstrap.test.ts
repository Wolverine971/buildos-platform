// apps/worker/tests/agenticChatPhase3Bootstrap.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatWorkerCapacityEvidenceV1 } from '../src/workers/agentic-chat/capacity';
import type { AgenticChatConsumerRuntimeHealth } from '../src/workers/agentic-chat/consumerRuntime';
import {
	buildAgenticChatSemanticReviewerRoutes,
	createAgenticChatPhase3Bootstrap,
	type AgenticChatPhase3BootstrapAssemblyPort
} from '../src/workers/agentic-chat/phase3Bootstrap';

const INTERNAL_USER_ID = 'd1000000-0000-4000-8000-000000000001';

function environment(): NodeJS.ProcessEnv {
	return {
		AGENTIC_CHAT_WORKER_ENABLED: 'true',
		AGENTIC_CHAT_INTERNAL_USER_IDS: INTERNAL_USER_ID,
		PRIVATE_OPENROUTER_API_KEY: 'provider-secret',
		AGENTIC_CHAT_OPENROUTER_MODEL: 'provider/primary',
		AGENTIC_CHAT_OPENROUTER_FALLBACK_MODELS: 'provider/fallback',
		AGENTIC_CHAT_MUTATION_PROVIDER_CAPABILITIES: 'updateOntoTask,moveDocumentInTree',
		AGENTIC_CHAT_MUTATION_ADAPTER_CAPABILITIES: 'updateOntoTask,moveDocumentInTree'
	};
}

function client() {
	return {
		rpc: vi.fn(),
		from: vi.fn(),
		channel: vi.fn(),
		removeChannel: vi.fn()
	};
}

function health(
	state: AgenticChatConsumerRuntimeHealth['state'],
	healthy = state === 'running'
): AgenticChatConsumerRuntimeHealth {
	return {
		healthy,
		...(healthy ? {} : { reason: `runtime_${state}` }),
		state,
		queue: {
			healthy,
			...(healthy ? {} : { reason: 'queue_not_started' }),
			startedAt: healthy ? new Date(0).toISOString() : null,
			lastPollSuccessAt: healthy ? new Date(0).toISOString() : null,
			consecutiveClaimFailures: 0,
			processingBatch: false,
			draining: state === 'stopping' || state === 'stopped'
		}
	};
}

function evidence(): AgenticChatWorkerCapacityEvidenceV1 {
	return {
		observedAtMs: 1_000,
		queue: { oldestReadyJobAgeMs: 0 },
		provider: { available: true },
		publisher: { healthy: true, pendingBytes: 0 }
	};
}

function assembly(): AgenticChatPhase3BootstrapAssemblyPort & {
	runtime: AgenticChatPhase3BootstrapAssemblyPort['runtime'] & {
		start: ReturnType<typeof vi.fn>;
		stop: ReturnType<typeof vi.fn>;
		wake: ReturnType<typeof vi.fn>;
		getHealth: ReturnType<typeof vi.fn>;
	};
	capacity: { collect: ReturnType<typeof vi.fn> };
} {
	let runtimeState: AgenticChatConsumerRuntimeHealth['state'] = 'idle';
	const runtime = {
		start: vi.fn(async () => {
			runtimeState = 'running';
		}),
		stop: vi.fn(async () => {
			runtimeState = 'stopped';
		}),
		wake: vi.fn(async () => undefined),
		getHealth: vi.fn(() => health(runtimeState, runtimeState === 'running'))
	};
	return {
		runtime,
		capacity: { collect: vi.fn(async () => evidence()) }
	};
}

describe('Agentic Chat Phase 3 operational bootstrap', () => {
	it('derives a distinct reviewed tool-capable route without new configuration', () => {
		const routes = buildAgenticChatSemanticReviewerRoutes([
			{
				id: 'openrouter',
				kind: 'openrouter',
				baseUrl: 'https://openrouter.ai/api/v1',
				apiKey: 'provider-secret',
				model: 'deepseek/deepseek-v4-flash',
				fallbackModels: []
			}
		]);

		expect(routes[0]).toMatchObject({
			id: 'openrouter_semantic_reviewer',
			kind: 'openrouter'
		});
		expect(routes[0]?.model).not.toBe('deepseek/deepseek-v4-flash');
		expect(routes[0]?.apiKey).toBe('provider-secret');
	});

	it('does not construct or touch dependencies while disabled', async () => {
		const database = client();
		const createAssembly = vi.fn();
		const bootstrap = createAgenticChatPhase3Bootstrap({
			client: database as never,
			environment: {
				AGENTIC_CHAT_WORKER_ENABLED: 'false',
				PRIVATE_OPENROUTER_API_KEY: 'invalid\nsecret',
				AGENTIC_CHAT_OPENROUTER_MODEL: ''
			},
			createAssembly
		});

		expect(createAssembly).not.toHaveBeenCalled();
		expect(bootstrap.getHealth()).toEqual({
			enabled: false,
			healthy: true,
			state: 'disabled',
			reason: 'disabled',
			runtime: null
		});
		await expect(bootstrap.start()).resolves.toBe('disabled');
		await expect(bootstrap.collectCapacityEvidence()).resolves.toBeNull();
		await expect(bootstrap.wake()).resolves.toBe(false);
		await expect(bootstrap.stop()).resolves.toBeUndefined();
		expect(database.rpc).not.toHaveBeenCalled();
		expect(database.from).not.toHaveBeenCalled();
		expect(database.channel).not.toHaveBeenCalled();
	});

	it('constructs the validated enabled assembly and owns idempotent start and drain', async () => {
		const hosted = assembly();
		const createAssembly = vi.fn(() => hosted);
		const fetchImpl = vi.fn();
		const bootstrap = createAgenticChatPhase3Bootstrap({
			client: client() as never,
			environment: environment(),
			fetchImpl: fetchImpl as never,
			createAssembly
		});

		expect(createAssembly).toHaveBeenCalledWith(
			expect.objectContaining({
				config: expect.objectContaining({
					enabled: true,
					internalUserIds: [INTERNAL_USER_ID],
					mutationProviderCapabilities: {
						updateOntoTask: true,
						moveDocumentInTree: true
					},
					mutationAdapterCapabilities: {
						updateOntoTask: true,
						moveDocumentInTree: true
					},
					consumer: expect.objectContaining({ concurrency: 1 }),
					provider: {
						routes: [
							expect.objectContaining({
								id: 'openrouter',
								model: 'provider/primary',
								fallbackModels: ['provider/fallback']
							})
						]
					}
				}),
				fetchImpl
			})
		);
		expect(bootstrap.getHealth()).toMatchObject({
			enabled: true,
			healthy: false,
			state: 'ready',
			reason: 'ready'
		});
		const firstStart = bootstrap.start();
		const secondStart = bootstrap.start();
		expect(secondStart).toBe(firstStart);
		await expect(firstStart).resolves.toBe('started');
		expect(hosted.runtime.start).toHaveBeenCalledOnce();
		expect(bootstrap.getHealth()).toMatchObject({
			enabled: true,
			healthy: true,
			state: 'running'
		});
		await expect(bootstrap.collectCapacityEvidence()).resolves.toEqual(evidence());
		hosted.capacity.collect.mockRejectedValueOnce(new Error('capacity unavailable'));
		await expect(bootstrap.collectCapacityEvidence()).resolves.toBeNull();
		await expect(bootstrap.wake()).resolves.toBe(true);
		expect(hosted.runtime.wake).toHaveBeenCalledOnce();

		const firstStop = bootstrap.stop();
		const secondStop = bootstrap.stop();
		expect(secondStop).toBe(firstStop);
		await firstStop;
		expect(hosted.runtime.stop).toHaveBeenCalledOnce();
		expect(bootstrap.getHealth()).toMatchObject({
			healthy: true,
			state: 'stopped',
			reason: 'stopped'
		});
		await expect(bootstrap.collectCapacityEvidence()).resolves.toBeNull();
	});

	it('constructs the real provider and hosted assembly inertly without provider or database I/O', async () => {
		const database = client();
		const fetchImpl = vi.fn();
		const bootstrap = createAgenticChatPhase3Bootstrap({
			client: database as never,
			environment: environment(),
			fetchImpl: fetchImpl as never
		});

		expect(bootstrap.getHealth()).toMatchObject({ state: 'ready', healthy: false });
		await expect(bootstrap.collectCapacityEvidence()).resolves.toBeNull();
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(database.rpc).not.toHaveBeenCalled();
		expect(database.from).not.toHaveBeenCalled();
		expect(database.channel).not.toHaveBeenCalled();
		await bootstrap.stop();
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('fails closed on startup error and never exposes capacity evidence', async () => {
		const hosted = assembly();
		hosted.runtime.start.mockRejectedValueOnce(new Error('queue unavailable'));
		const bootstrap = createAgenticChatPhase3Bootstrap({
			client: client() as never,
			environment: environment(),
			createAssembly: () => hosted
		});

		await expect(bootstrap.start()).rejects.toThrow('queue unavailable');
		expect(bootstrap.getHealth()).toMatchObject({
			enabled: true,
			healthy: false,
			state: 'failed',
			reason: 'queue unavailable'
		});
		await expect(bootstrap.collectCapacityEvidence()).resolves.toBeNull();
		expect(hosted.capacity.collect).not.toHaveBeenCalled();
		await expect(bootstrap.start()).rejects.toThrow('cannot start from failed');
		await bootstrap.stop();
		expect(hosted.runtime.stop).toHaveBeenCalledOnce();
	});

	it('waits for an in-progress startup before draining the runtime', async () => {
		const hosted = assembly();
		let resolveStart!: () => void;
		hosted.runtime.start.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveStart = resolve;
				})
		);
		const bootstrap = createAgenticChatPhase3Bootstrap({
			client: client() as never,
			environment: environment(),
			createAssembly: () => hosted
		});

		const starting = bootstrap.start();
		const stopping = bootstrap.stop();
		expect(hosted.runtime.stop).not.toHaveBeenCalled();
		resolveStart();
		await starting;
		await stopping;
		expect(hosted.runtime.stop).toHaveBeenCalledOnce();
		expect(bootstrap.getHealth()).toMatchObject({ state: 'stopped', healthy: true });
	});
});
