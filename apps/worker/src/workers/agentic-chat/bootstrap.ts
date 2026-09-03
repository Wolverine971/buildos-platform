// apps/worker/src/workers/agentic-chat/bootstrap.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import {
	GPT_56_LUNA_MODEL,
	JSON_PROFILE_MODELS,
	LLMUsageLogger,
	modelSupportsCapability
} from '@buildos/smart-llm';
import type { AgenticChatWorkerCapacityEvidenceV1 } from './capacity';
import type { AgenticChatConsumerRuntimeHealth } from './consumerRuntime';
import {
	AgenticChatLlmUsageObserver,
	AgenticChatOpenRouterClient
} from './provider/openrouter-client';
import {
	AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1,
	ALL_AGENTIC_CHAT_MUTATION_CAPABILITIES_V1,
	type AgenticChatMutationCapabilityNameV1,
	type AgenticChatProviderMutationCapabilitiesV1
} from './mutationToolCatalog';
import { createAgenticChatCompositionRoot } from './composition-root';
import { type AgenticChatConfig, loadAgenticChatConfig } from './config';
import {
	type AgenticChatExecutionObservationRpcClient,
	SupabaseAgenticChatExecutionObservationAdapter
} from './executionObservation';

const OPENROUTER_HTTP_REFERER = 'https://build-os.com';
const OPENROUTER_APP_NAME = 'BuildOS Agentic Chat Worker';

type EnabledAgenticChatConfig = AgenticChatConfig;

export type AgenticChatBootstrapState =
	| 'ready'
	| 'starting'
	| 'running'
	| 'stopping'
	| 'stopped'
	| 'failed';

export type AgenticChatMutationCapabilitiesSummaryV1 = {
	provider: { count: number; names: string[] };
	adapter: { count: number; names: string[] };
	advertisedMutationToolNames: string[];
};

export type AgenticChatBootstrapHealth = {
	enabled: boolean;
	healthy: boolean;
	state: AgenticChatBootstrapState;
	reason?: string;
	runtime: AgenticChatConsumerRuntimeHealth | null;
	mutationCapabilities: AgenticChatMutationCapabilitiesSummaryV1 | null;
};

/**
 * Reduce the unified mutation capability surface to the backwards-compatible
 * health shape operators and the e2e harness read back. Provider advertisement
 * and adapter installation intentionally report the same code-owned catalog.
 * Names only — this never touches environment values.
 */
export function summarizeAgenticChatMutationCapabilitiesV1(
	capabilities: Readonly<Partial<AgenticChatProviderMutationCapabilitiesV1>> | undefined
): AgenticChatMutationCapabilitiesSummaryV1 {
	const providerNames: AgenticChatMutationCapabilityNameV1[] = [];
	const adapterNames: AgenticChatMutationCapabilityNameV1[] = [];
	const advertisedMutationToolNames: string[] = [];

	for (const [capability, toolName] of AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1) {
		const enabled = capabilities?.[capability] === true;
		if (enabled) {
			providerNames.push(capability);
			adapterNames.push(capability);
			advertisedMutationToolNames.push(toolName);
		}
	}

	return {
		provider: { count: providerNames.length, names: providerNames },
		adapter: { count: adapterNames.length, names: adapterNames },
		advertisedMutationToolNames
	};
}

export type AgenticChatBootstrapCompositionPort = {
	runtime: {
		start(): Promise<void>;
		stop(): Promise<void>;
		wake(): Promise<void>;
		getHealth(): AgenticChatConsumerRuntimeHealth;
	};
	capacity: {
		collect(): Promise<AgenticChatWorkerCapacityEvidenceV1 | null>;
	};
};

export type AgenticChatBootstrapCompositionFactoryInput = {
	client: SupabaseClient<Database>;
	config: EnabledAgenticChatConfig;
	fetchImpl?: typeof fetch;
	onUsageError?: (error: unknown) => void;
	onConsumptionBillingError?: (error: unknown) => void;
};

export type AgenticChatBootstrapOptions = {
	client: SupabaseClient<Database>;
	environment?: NodeJS.ProcessEnv;
	fetchImpl?: typeof fetch;
	onUsageError?: (error: unknown) => void;
	onConsumptionBillingError?: (error: unknown) => void;
	createComposition?: (
		input: AgenticChatBootstrapCompositionFactoryInput
	) => AgenticChatBootstrapCompositionPort;
};

export type AgenticChatBootstrapStartResult = 'started';

/**
 * Build the production operational boundary without publishing capacity or
 * changing web admission. Only chat-worker.ts constructs this bootstrap, so
 * incomplete configuration fails the dedicated service startup.
 */
export function createAgenticChatBootstrap(
	options: AgenticChatBootstrapOptions
): AgenticChatBootstrap {
	const config = loadAgenticChatConfig(options.environment);
	const mutationCapabilities = summarizeAgenticChatMutationCapabilitiesV1(
		ALL_AGENTIC_CHAT_MUTATION_CAPABILITIES_V1
	);
	// One-line, JSON-ish startup record of the write surface — capability and
	// tool names/counts only, never env values — so operators and the e2e
	// harness can confirm what mutation capability shipped without reading env.
	console.log(
		JSON.stringify({
			event: 'agentic_chat_mutation_capabilities',
			provider: mutationCapabilities.provider,
			adapter: mutationCapabilities.adapter,
			advertisedMutationToolNames: mutationCapabilities.advertisedMutationToolNames
		})
	);

	const createComposition = options.createComposition ?? createDefaultComposition;
	const composition = createComposition({
		client: options.client,
		config,
		fetchImpl: options.fetchImpl,
		onUsageError: options.onUsageError,
		onConsumptionBillingError: options.onConsumptionBillingError
	});
	return new AgenticChatBootstrap(composition, mutationCapabilities);
}

export class AgenticChatBootstrap {
	private state: AgenticChatBootstrapState;
	private startPromise: Promise<AgenticChatBootstrapStartResult> | null = null;
	private stopPromise: Promise<void> | null = null;
	private lastError: string | null = null;

	constructor(
		private readonly composition: AgenticChatBootstrapCompositionPort,
		private readonly mutationCapabilities: AgenticChatMutationCapabilitiesSummaryV1 | null = null
	) {
		this.state = 'ready';
	}

	start(): Promise<AgenticChatBootstrapStartResult> {
		if ((this.state === 'starting' || this.state === 'running') && this.startPromise) {
			return this.startPromise;
		}
		if (this.state !== 'ready') {
			return Promise.reject(
				new Error(`Agentic Chat bootstrap cannot start from ${this.state}`)
			);
		}

		this.state = 'starting';
		this.startPromise = this.startRuntime();
		return this.startPromise;
	}

	stop(): Promise<void> {
		if (this.stopPromise) return this.stopPromise;
		this.stopPromise = this.stopRuntime();
		return this.stopPromise;
	}

	async wake(): Promise<boolean> {
		if (this.state !== 'running') return false;
		await this.composition.runtime.wake();
		return true;
	}

	async collectCapacityEvidence(): Promise<AgenticChatWorkerCapacityEvidenceV1 | null> {
		if (this.state !== 'running') return null;
		try {
			if (!this.composition.runtime.getHealth().healthy) return null;
			return await this.composition.capacity.collect();
		} catch {
			return null;
		}
	}

	getHealth(): AgenticChatBootstrapHealth {
		const runtime = this.safeRuntimeHealth();
		const mutationCapabilities = this.mutationCapabilities;
		if (this.state === 'running') {
			return runtime?.healthy
				? { enabled: true, healthy: true, state: this.state, runtime, mutationCapabilities }
				: {
						enabled: true,
						healthy: false,
						state: this.state,
						reason: runtime?.reason ?? 'runtime_health_unavailable',
						runtime,
						mutationCapabilities
					};
		}
		if (this.state === 'stopping' || this.state === 'stopped') {
			return {
				enabled: true,
				healthy: true,
				state: this.state,
				reason: this.state,
				runtime,
				mutationCapabilities
			};
		}
		return {
			enabled: true,
			healthy: false,
			state: this.state,
			reason: this.state === 'failed' ? (this.lastError ?? 'bootstrap_failed') : this.state,
			runtime,
			mutationCapabilities
		};
	}

	private async startRuntime(): Promise<AgenticChatBootstrapStartResult> {
		try {
			await this.composition.runtime.start();
			this.state = 'running';
			return 'started';
		} catch (error) {
			this.lastError = canonicalError(error);
			this.state = 'failed';
			throw error;
		}
	}

	private async stopRuntime(): Promise<void> {
		if (this.state === 'stopped') return;
		if (this.state === 'starting' && this.startPromise) {
			await this.startPromise.catch(() => undefined);
		}
		this.state = 'stopping';
		try {
			await this.composition.runtime.stop();
			this.state = 'stopped';
		} catch (error) {
			this.lastError = canonicalError(error);
			this.state = 'failed';
			throw error;
		}
	}

	private safeRuntimeHealth(): AgenticChatConsumerRuntimeHealth | null {
		try {
			return this.composition.runtime.getHealth();
		} catch {
			return null;
		}
	}
}

function createDefaultComposition(
	input: AgenticChatBootstrapCompositionFactoryInput
): AgenticChatBootstrapCompositionPort {
	// Worker terminal billing must observe committed current-turn usage whenever
	// the database is healthy. The provider boundary still catches/report errors
	// so strict accounting cannot strand terminal user-visible truth.
	const usageLogger = new LLMUsageLogger({
		supabase: input.client,
		failureMode: 'throw'
	});
	const executionObservations = new SupabaseAgenticChatExecutionObservationAdapter(
		input.client as unknown as AgenticChatExecutionObservationRpcClient
	);
	const usageObserver = new AgenticChatLlmUsageObserver(usageLogger);
	const clientPorts = {
		usage: usageObserver,
		executionObservations,
		onUsageError: input.onUsageError,
		onExecutionObservationError: input.onUsageError
	};
	const clientOptions = {
		httpReferer: OPENROUTER_HTTP_REFERER,
		appName: OPENROUTER_APP_NAME,
		fetchImpl: input.fetchImpl
	};
	const providerClient = new AgenticChatOpenRouterClient(clientPorts, {
		...clientOptions,
		routes: input.config.provider.routes
	});
	const semanticReviewerClient = new AgenticChatOpenRouterClient(clientPorts, {
		...clientOptions,
		routes: buildAgenticChatSemanticReviewerRoutes(input.config.provider.routes),
		temperature: 0,
		maxTokens: AGENTIC_CHAT_SEMANTIC_REVIEWER_MAX_TOKENS,
		requestTimeoutMs: AGENTIC_CHAT_SEMANTIC_REVIEWER_REQUEST_TIMEOUT_MS
	});
	return createAgenticChatCompositionRoot({
		client: input.client,
		providerClient,
		semanticReviewerClient,
		providerConfigured: true,
		liveVisionEnabled: input.config.liveVisionEnabled,
		consumptionBillingEnabled: input.config.consumptionBillingEnabled,
		mutationCapabilities: ALL_AGENTIC_CHAT_MUTATION_CAPABILITIES_V1,
		liveVisionFetchImpl: input.fetchImpl,
		consumerConfig: input.config.consumer,
		publisherConfig: input.config.publisher,
		providerBudgetMs: input.config.providerBudgetMs,
		maxProviderRounds: input.config.maxProviderRounds,
		maxToolCalls: input.config.maxToolCalls,
		maxToolConcurrency: input.config.maxToolConcurrency,
		onExecutionObservationError: input.onUsageError,
		onConsumptionBillingError: input.onConsumptionBillingError ?? input.onUsageError
	});
}

/**
 * Reuse the validated OpenRouter credential/route policy, but select a
 * reviewed tool-capable model that is distinct from the acting model whenever
 * the catalog permits it. This is configuration-free by design.
 */
/**
 * The reviewer's completion budget covers hidden reasoning as well as the
 * decision it writes. `reasoning: { exclude: true }` keeps reasoning out of the
 * stream but not out of this budget, so a reasoning model can spend most of the
 * allowance thinking and then be cut off mid-`arguments`.
 *
 * At the previous 1_200 the 2026-08-20 battery lost both `project-organize`
 * turns exactly that way: 1007 and 593 reasoning tokens against a 1200 cap, both
 * reported by the provider as `finish_reason: "tool_calls"`. Across 32 reviewer
 * calls in that battery the largest that completed was 909, so this leaves real
 * headroom for reasoning plus a long decision while staying a firm bound. Only
 * tokens actually generated are billed, so raising the ceiling does not raise
 * the cost of the calls that already fit.
 */
export const AGENTIC_CHAT_SEMANTIC_REVIEWER_MAX_TOKENS = 4_000;

/**
 * A reviewer pass is one bounded tool-choice decision over a filtered
 * evidence set, not a streamed answer; the acting client's 90s ceiling let a
 * stalled reviewer route eat most of the turn wall before failing over
 * (audit 2026-09-02, Finding 5: minute-long reviewer tail).
 */
export const AGENTIC_CHAT_SEMANTIC_REVIEWER_REQUEST_TIMEOUT_MS = 45_000;

/**
 * The reviewer prefers OpenAI's own endpoint over Azure: both serve the Luna
 * model, but the acting route's provider order (DeepInfra/DeepSeek/...) is
 * meaningless for it and the audited 0% prefix-cache rate came from the
 * request bouncing between endpoints. Fallbacks stay allowed for availability.
 */
export const AGENTIC_CHAT_SEMANTIC_REVIEWER_PROVIDER_ORDER = Object.freeze(['openai', 'azure']);

export function buildAgenticChatSemanticReviewerRoutes(
	routes: EnabledAgenticChatConfig['provider']['routes']
): EnabledAgenticChatConfig['provider']['routes'] {
	const actingModels = new Set(
		routes.flatMap((route) => [route.model, ...(route.fallbackModels ?? [])])
	);
	// Production evidence showed the cheaper GLM fallback turning an explicitly
	// informational pricing-research request into an irrelevant clarification.
	// This lane is a bounded, temperature-zero safety adjudication, so prefer the
	// stronger reviewed Luna model before the general-purpose JSON profile order.
	const reviewerCandidates = [
		GPT_56_LUNA_MODEL,
		...JSON_PROFILE_MODELS.powerful,
		...JSON_PROFILE_MODELS.maximum
	];
	const toolCapableCandidates = [...reviewerCandidates].filter(
		(model, index, models) =>
			models.indexOf(model) === index && modelSupportsCapability(model, 'tools')
	);
	const candidates = toolCapableCandidates.filter((model) => !actingModels.has(model));
	const model = candidates[0];
	if (!model) {
		// The reviewer is the only thing that caught a guessed-target write in
		// production; a reviewer that is the acting model reviews its own work.
		// Fail the dedicated service at startup rather than degrade silently.
		throw new Error(
			`Agentic Chat semantic reviewer cannot be the acting model: every reviewed tool-capable candidate (${toolCapableCandidates.join(', ') || 'none'}) is already in the acting route (${Array.from(actingModels).join(', ')}). Change AGENTIC_CHAT_OPENROUTER_MODEL or AGENTIC_CHAT_OPENROUTER_FALLBACK_MODELS so a distinct reviewer model remains.`
		);
	}
	return Object.freeze(
		routes.map((route) =>
			Object.freeze({
				...route,
				id: `${route.id}_semantic_reviewer`,
				model,
				fallbackModels: Object.freeze(candidates.slice(1, 4)),
				providerRouting: Object.freeze({
					...(route.providerRouting?.ignore
						? { ignore: route.providerRouting.ignore }
						: {}),
					allow_fallbacks: true,
					order: AGENTIC_CHAT_SEMANTIC_REVIEWER_PROVIDER_ORDER
				})
			})
		)
	);
}

function canonicalError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error ?? '');
	return message.trim().slice(0, 1_000) || 'Agentic Chat bootstrap failed';
}
