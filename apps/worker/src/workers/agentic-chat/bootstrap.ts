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
	/**
	 * `'configured'` or `'missing:<VAR,VAR>'`. Variable names only, never values.
	 * Optional so a caller that cannot reach the bootstrap can still report health.
	 */
	calendarCredentials?: string;
};

/**
 * Calendar reads and writes run on this service now, so the credentials must be
 * on this service too. When they are not, every calendar tool reports
 * `credentials_not_configured` — which is only self-diagnosing if startup says
 * so out loud. Names only: this never reads or logs a value.
 */
const CALENDAR_CREDENTIAL_ENV_VARS = [
	'PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1',
	'PRIVATE_GOOGLE_CALENDAR_CLIENT_ID',
	'PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET',
	'PRIVATE_GOOGLE_CLIENT_ID',
	'PRIVATE_GOOGLE_CLIENT_SECRET'
] as const;

export function summarizeAgenticChatCalendarCredentialsV1(environment: NodeJS.ProcessEnv): {
	status: string;
	missing: string[];
} {
	const missing = CALENDAR_CREDENTIAL_ENV_VARS.filter(
		(name) => !environment[name]?.trim()
	) as string[];
	return {
		status: missing.length === 0 ? 'configured' : `missing:${missing.join(',')}`,
		missing
	};
}

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
	const calendarCredentials = summarizeAgenticChatCalendarCredentialsV1(
		options.environment ?? process.env
	);
	// Never fails startup: a chat worker without calendar credentials still runs
	// every non-calendar turn. It just must not be silent about it.
	if (calendarCredentials.missing.length > 0) {
		console.warn(
			JSON.stringify({
				event: 'agentic_chat_calendar_credentials_missing',
				missingVariables: calendarCredentials.missing,
				impact: 'Calendar reads and writes on this service will report credentials_not_configured until these variables are set.',
				remediation:
					'Set them on this Railway service with values byte-identical to Vercel production.'
			})
		);
	}
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
	return new AgenticChatBootstrap(composition, mutationCapabilities, calendarCredentials.status);
}

export class AgenticChatBootstrap {
	private state: AgenticChatBootstrapState;
	private startPromise: Promise<AgenticChatBootstrapStartResult> | null = null;
	private stopPromise: Promise<void> | null = null;
	private lastError: string | null = null;

	constructor(
		private readonly composition: AgenticChatBootstrapCompositionPort,
		private readonly mutationCapabilities: AgenticChatMutationCapabilitiesSummaryV1 | null = null,
		private readonly calendarCredentials: string = 'configured'
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
		const calendarCredentials = this.calendarCredentials;
		if (this.state === 'running') {
			return runtime?.healthy
				? {
						enabled: true,
						healthy: true,
						state: this.state,
						runtime,
						mutationCapabilities,
						calendarCredentials
					}
				: {
						enabled: true,
						healthy: false,
						state: this.state,
						reason: runtime?.reason ?? 'runtime_health_unavailable',
						runtime,
						mutationCapabilities,
						calendarCredentials
					};
		}
		if (this.state === 'stopping' || this.state === 'stopped') {
			return {
				enabled: true,
				healthy: true,
				state: this.state,
				reason: this.state,
				runtime,
				mutationCapabilities,
				calendarCredentials
			};
		}
		return {
			enabled: true,
			healthy: false,
			state: this.state,
			reason: this.state === 'failed' ? (this.lastError ?? 'bootstrap_failed') : this.state,
			runtime,
			mutationCapabilities,
			calendarCredentials
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
		routes: buildAgenticChatSemanticReviewerRoutes(
			input.config.provider.routes,
			input.config.provider.reviewer
		),
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
 * tool-capable model distinct from the acting models. An explicit reviewer
 * policy restricts both primary and fallbacks; omitted policy uses the
 * reviewed default without additional model fallbacks.
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
export const DEFAULT_AGENTIC_CHAT_SEMANTIC_REVIEWER_MODEL = GPT_56_LUNA_MODEL;

export function buildAgenticChatSemanticReviewerRoutes(
	routes: EnabledAgenticChatConfig['provider']['routes'],
	policy?: EnabledAgenticChatConfig['provider']['reviewer']
): EnabledAgenticChatConfig['provider']['routes'] {
	const actingModels = new Set(
		routes.flatMap((route) => [route.model, ...(route.fallbackModels ?? [])])
	);
	// Preserve the deployed default until a replacement passes semantic replay.
	// 2026-09-04: GLM 5.3 Flash approved a dependency correction without declaring
	// its endpoints. An explicit policy opts out of the legacy fallback pool;
	// only the operator's listed alternatives can then be used.
	const reviewerCandidates = policy
		? [policy.model, ...policy.fallbackModels]
		: [
				DEFAULT_AGENTIC_CHAT_SEMANTIC_REVIEWER_MODEL,
				...JSON_PROFILE_MODELS.powerful,
				...JSON_PROFILE_MODELS.maximum
			];
	if (policy) {
		for (const candidate of reviewerCandidates) {
			if (!modelSupportsCapability(candidate, 'tools')) {
				throw new Error(
					`Agentic Chat reviewer model must be a catalogued tool-capable model: ${candidate}`
				);
			}
			if (actingModels.has(candidate)) {
				throw new Error(
					`Agentic Chat semantic reviewer cannot be the acting model: ${candidate}`
				);
			}
		}
		if (
			new Set(reviewerCandidates).size !== reviewerCandidates.length ||
			policy.fallbackModels.length > 3
		) {
			throw new Error(
				'Agentic Chat reviewer policy requires unique models and at most three fallbacks'
			);
		}
	}
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
			`Agentic Chat semantic reviewer cannot be the acting model: every reviewed tool-capable candidate (${toolCapableCandidates.join(', ') || 'none'}) is already in the acting route (${Array.from(actingModels).join(', ')}). Set AGENTIC_CHAT_REVIEWER_MODEL to a distinct model, or change the acting route.`
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
					...(model === GPT_56_LUNA_MODEL
						? { order: AGENTIC_CHAT_SEMANTIC_REVIEWER_PROVIDER_ORDER }
						: {})
				})
			})
		)
	);
}

function canonicalError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error ?? '');
	return message.trim().slice(0, 1_000) || 'Agentic Chat bootstrap failed';
}
