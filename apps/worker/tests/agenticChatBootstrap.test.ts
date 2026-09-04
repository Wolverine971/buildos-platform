// apps/worker/tests/agenticChatBootstrap.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatWorkerCapacityEvidenceV1 } from '../src/workers/agentic-chat/capacity';
import type { AgenticChatConsumerRuntimeHealth } from '../src/workers/agentic-chat/consumerRuntime';
import {
	ALL_AGENTIC_CHAT_MUTATION_CAPABILITIES_V1,
	AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1
} from '../src/workers/agentic-chat/mutationToolCatalog';
import { GPT_56_LUNA_MODEL, JSON_PROFILE_MODELS } from '@buildos/smart-llm';
import {
	AGENTIC_CHAT_SEMANTIC_REVIEWER_PROVIDER_ORDER,
	AGENTIC_CHAT_SEMANTIC_REVIEWER_REQUEST_TIMEOUT_MS,
	buildAgenticChatSemanticReviewerRoutes,
	createAgenticChatBootstrap,
	summarizeAgenticChatCalendarCredentialsV1,
	summarizeAgenticChatMutationCapabilitiesV1,
	type AgenticChatBootstrapCompositionPort
} from '../src/workers/agentic-chat/bootstrap';

function environment(): NodeJS.ProcessEnv {
	return {
		PRIVATE_OPENROUTER_API_KEY: 'provider-secret',
		AGENTIC_CHAT_OPENROUTER_MODEL: 'provider/primary',
		AGENTIC_CHAT_OPENROUTER_FALLBACK_MODELS: 'provider/fallback',
		// Retired rollout values may remain during the compatible deployment.
		// The code-owned reviewed catalog must win regardless of their contents.
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
		activeTurns: 0,
		realtime: {
			healthy: true,
			status: 'idle',
			activeChannels: 0,
			lastTransitionAt: null,
			consecutiveFailures: 0
		},
		recovery: {
			healthy: true,
			state: 'running',
			lastSweepStartedAt: null,
			lastSweepFinishedAt: null,
			lastSuccessfulSweepAt: null,
			consecutiveSweepFailures: 0,
			lastError: null,
			lastCandidateCount: 0,
			lastAttentionRequiredCount: 0
		},
		queue: {
			healthy,
			...(healthy ? {} : { reason: 'queue_not_started' }),
			startedAt: healthy ? new Date(0).toISOString() : null,
			lastSuccessfulClaimAt: healthy ? new Date(0).toISOString() : null,
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

function composition(): AgenticChatBootstrapCompositionPort & {
	runtime: AgenticChatBootstrapCompositionPort['runtime'] & {
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

describe('Agentic Chat operational bootstrap', () => {
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
			kind: 'openrouter',
			model: 'openai/gpt-5.6-luna'
		});
		expect(routes[0]?.model).not.toBe('deepseek/deepseek-v4-flash');
		expect(routes[0]?.apiKey).toBe('provider-secret');
	});

	it('routes the reviewer to OpenAI before Azure instead of the acting provider order', () => {
		const routes = buildAgenticChatSemanticReviewerRoutes([
			{
				id: 'openrouter',
				kind: 'openrouter',
				baseUrl: 'https://openrouter.ai/api/v1',
				apiKey: 'provider-secret',
				model: 'deepseek/deepseek-v4-flash',
				fallbackModels: ['z-ai/glm-5.1'],
				providerRouting: {
					allow_fallbacks: true,
					order: ['deepinfra', 'deepseek', 'alibaba', 'cloudflare'],
					ignore: ['digitalocean']
				}
			}
		]);

		expect(routes[0]?.providerRouting).toEqual({
			allow_fallbacks: true,
			order: ['openai', 'azure'],
			ignore: ['digitalocean']
		});
		expect(AGENTIC_CHAT_SEMANTIC_REVIEWER_PROVIDER_ORDER).toEqual(['openai', 'azure']);
		expect(routes[0]?.providerRouting?.order).not.toContain('deepinfra');
		expect(routes[0]?.fallbackModels).not.toContain('deepseek/deepseek-v4-flash');
		expect(routes[0]?.fallbackModels).not.toContain('z-ai/glm-5.1');
	});

	it('gives the reviewer client a shorter request timeout than the acting client', () => {
		expect(AGENTIC_CHAT_SEMANTIC_REVIEWER_REQUEST_TIMEOUT_MS).toBe(45_000);
		expect(AGENTIC_CHAT_SEMANTIC_REVIEWER_REQUEST_TIMEOUT_MS).toBeLessThan(90_000);
	});

	it('fails at startup instead of reviewing with an acting model', () => {
		expect(() =>
			buildAgenticChatSemanticReviewerRoutes([
				{
					id: 'openrouter',
					kind: 'openrouter',
					baseUrl: 'https://openrouter.ai/api/v1',
					apiKey: 'provider-secret',
					model: GPT_56_LUNA_MODEL,
					fallbackModels: [
						...JSON_PROFILE_MODELS.powerful,
						...JSON_PROFILE_MODELS.maximum
					]
				}
			])
		).toThrow('semantic reviewer cannot be the acting model');
	});

	it('fails before construction when the dedicated service is not configured', () => {
		const database = client();
		const createComposition = vi.fn();
		expect(() =>
			createAgenticChatBootstrap({
				client: database as never,
				environment: {},
				createComposition
			})
		).toThrow('PRIVATE_OPENROUTER_API_KEY');

		expect(createComposition).not.toHaveBeenCalled();
		expect(database.rpc).not.toHaveBeenCalled();
		expect(database.from).not.toHaveBeenCalled();
		expect(database.channel).not.toHaveBeenCalled();
	});

	it('constructs the validated composition and owns idempotent start and drain', async () => {
		const hosted = composition();
		const createComposition = vi.fn(() => hosted);
		const fetchImpl = vi.fn();
		const bootstrap = createAgenticChatBootstrap({
			client: client() as never,
			environment: environment(),
			fetchImpl: fetchImpl as never,
			createComposition
		});

		expect(createComposition).toHaveBeenCalledWith(
			expect.objectContaining({
				config: expect.objectContaining({
					enabled: true,
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
		const names = AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.map(([capability]) => capability);
		const toolNames = AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.map(([, toolName]) => toolName);
		expect(bootstrap.getHealth().mutationCapabilities).toEqual({
			provider: { count: 25, names },
			adapter: { count: 25, names },
			advertisedMutationToolNames: toolNames
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

	it('constructs the real provider and hosted composition inertly without provider or database I/O', async () => {
		const database = client();
		const fetchImpl = vi.fn();
		const bootstrap = createAgenticChatBootstrap({
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
		const hosted = composition();
		hosted.runtime.start.mockRejectedValueOnce(new Error('queue unavailable'));
		const bootstrap = createAgenticChatBootstrap({
			client: client() as never,
			environment: environment(),
			createComposition: () => hosted
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
		const hosted = composition();
		let resolveStart!: () => void;
		hosted.runtime.start.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveStart = resolve;
				})
		);
		const bootstrap = createAgenticChatBootstrap({
			client: client() as never,
			environment: environment(),
			createComposition: () => hosted
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

describe('summarizeAgenticChatMutationCapabilitiesV1', () => {
	const moveDocumentInTree = AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.find(
		([capability]) => capability === 'moveDocumentInTree'
	)?.[1];
	const updateOntoTask = AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.find(
		([capability]) => capability === 'updateOntoTask'
	)?.[1];
	it('reports counts and catalog-ordered names for the unified capability surface', () => {
		const capabilities = { updateOntoTask: true, moveDocumentInTree: true };

		const expectedNames = AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.filter(
			([capability]) => capability === 'updateOntoTask' || capability === 'moveDocumentInTree'
		).map(([capability]) => capability);
		const expectedToolNames = AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.filter(
			([capability]) => capability === 'updateOntoTask' || capability === 'moveDocumentInTree'
		).map(([, toolName]) => toolName);

		expect(summarizeAgenticChatMutationCapabilitiesV1(capabilities)).toEqual({
			provider: { count: 2, names: expectedNames },
			adapter: { count: 2, names: expectedNames },
			advertisedMutationToolNames: expectedToolNames
		});
		expect(summarizeAgenticChatMutationCapabilitiesV1(capabilities)).toEqual({
			provider: { count: 2, names: ['moveDocumentInTree', 'updateOntoTask'] },
			adapter: { count: 2, names: ['moveDocumentInTree', 'updateOntoTask'] },
			advertisedMutationToolNames: [moveDocumentInTree, updateOntoTask]
		});
	});

	it('keeps provider advertisement and adapter installation identical by construction', () => {
		const summary = summarizeAgenticChatMutationCapabilitiesV1(
			ALL_AGENTIC_CHAT_MUTATION_CAPABILITIES_V1
		);

		expect(summary.provider).toEqual(summary.adapter);
		expect(summary.provider.count).toBe(AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.length);
		expect(summary.advertisedMutationToolNames).toHaveLength(
			AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.length
		);
	});

	it('treats an undefined capability map as no capabilities enabled', () => {
		expect(summarizeAgenticChatMutationCapabilitiesV1(undefined)).toEqual({
			provider: { count: 0, names: [] },
			adapter: { count: 0, names: [] },
			advertisedMutationToolNames: []
		});
	});
});

// Calendar reads run on this service, so its calendar credentials must be on
// this service. Production shipped without them and every calendar read blamed
// Google; startup now has to say the variable names out loud.
describe('summarizeAgenticChatCalendarCredentialsV1', () => {
	const configured: NodeJS.ProcessEnv = {
		PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1: 'x'.repeat(32),
		PRIVATE_GOOGLE_CALENDAR_CLIENT_ID: 'calendar-client',
		PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET: 'calendar-secret',
		PRIVATE_GOOGLE_CLIENT_ID: 'shared-client',
		PRIVATE_GOOGLE_CLIENT_SECRET: 'shared-secret'
	};

	it('reports configured when every calendar variable is present', () => {
		expect(summarizeAgenticChatCalendarCredentialsV1(configured)).toEqual({
			status: 'configured',
			missing: []
		});
	});

	it('names every missing variable and never a value', () => {
		const summary = summarizeAgenticChatCalendarCredentialsV1({});
		expect(summary.missing).toEqual([
			'PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1',
			'PRIVATE_GOOGLE_CALENDAR_CLIENT_ID',
			'PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET',
			'PRIVATE_GOOGLE_CLIENT_ID',
			'PRIVATE_GOOGLE_CLIENT_SECRET'
		]);
		expect(summary.status).toBe(`missing:${summary.missing.join(',')}`);
	});

	it('treats a blank variable as missing and half a pair as missing', () => {
		expect(
			summarizeAgenticChatCalendarCredentialsV1({
				...configured,
				PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1: '   ',
				PRIVATE_GOOGLE_CLIENT_SECRET: undefined
			}).missing
		).toEqual(['PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1', 'PRIVATE_GOOGLE_CLIENT_SECRET']);
	});

	it('publishes the calendar credential status on bootstrap health without failing startup', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		try {
			const bootstrap = createAgenticChatBootstrap({
				client: client() as never,
				environment: environment(),
				createComposition: () => composition()
			});
			expect(bootstrap.getHealth().calendarCredentials).toContain(
				'missing:PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1'
			);
			const logged = warn.mock.calls
				.map(([entry]) => String(entry))
				.filter((entry) => entry.includes('agentic_chat_calendar_credentials_missing'));
			expect(logged).toHaveLength(1);
			expect(logged[0]).toContain('credentials_not_configured');
		} finally {
			warn.mockRestore();
		}
	});
});
