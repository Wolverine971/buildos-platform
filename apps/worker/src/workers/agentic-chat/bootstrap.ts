// apps/worker/src/workers/agentic-chat/bootstrap.ts
import { logAgenticChatPersistenceTrace } from './persistenceTrace';
// apps/worker/src/workers/agentic-chat/bootstrap.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import {
	GLM_53_FLASH_MODEL,
	GPT_56_LUNA_MODEL,
	JSON_PROFILE_MODELS,
	JevClient,
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
import type {
	ContextFinderReadClient,
	WorkspaceFinderReadClient
} from '@buildos/agentic-chat-runtime/context-finder';
import {
	CHAT_CONTEXT_FINDER_HEDGE_MS,
	CHAT_CONTEXT_FINDER_JEV_TIMEOUT_MS,
	ChatContextFinder
} from './provider/chat-context-finder';
import { ChatWorkspaceFinder, composeContextFinders } from './provider/chat-workspace-finder';
import { JevToolSelector } from './provider/jev-tool-selector';
import {
	WEB_NAVIGATE_DECISION_TIMEOUT_MS,
	WEB_NAVIGATE_MAX_REQUEST_BYTES,
	WEB_NAVIGATE_MODEL,
	createWorkerWebNavigatePort
} from './tools/web-navigate';
import { SPECIALIST_SHADOW_POLICY } from './workflow/specialist-selection-policy';
import { WORKFLOW_CONTEXT_FINDER_TIMEOUT_MS } from './workflow/context-finder-port';
import {
	AGENTIC_CHAT_WORKFLOW_REQUEST_TIMEOUT_MS,
	AGENTIC_CHAT_WORKFLOW_RESPONSE_HEADERS_TIMEOUT_MS,
	buildAgenticChatWorkflowRoutesV1
} from './workflow/workflow-dispatch';
import { AgenticChatTurnActivityRegistry, withAgenticChatTurnActivityV1 } from './deliveryHealth';
import { type AgenticChatConfig, loadAgenticChatConfig } from './config';
import {
	type AgenticChatExecutionObservationRpcClient,
	SupabaseAgenticChatExecutionObservationAdapter
} from './executionObservation';
import {
	AgenticChatQueueWakeListener,
	type AgenticChatQueueWakeListenerHealthV1,
	type AgenticChatQueueWakeListenerPort,
	type AgenticChatQueueWakeRealtimeClient,
	agenticChatQueueWakeEnabled
} from './queueWakeListener';

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
	/** Admission wake transport; informational, never a health failure. */
	queueWake?: AgenticChatQueueWakeListenerHealthV1 | null;
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
	/**
	 * Admission wake transport. Defaults to a private Realtime Broadcast listener
	 * on `client`; null keeps the worker on durable polling alone.
	 */
	queueWake?: AgenticChatQueueWakeListenerPort | null;
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
	const environment = options.environment ?? process.env;
	const queueWake =
		options.queueWake !== undefined
			? options.queueWake
			: agenticChatQueueWakeEnabled(environment)
				? new AgenticChatQueueWakeListener({
						client: options.client as unknown as AgenticChatQueueWakeRealtimeClient
					})
				: null;
	return new AgenticChatBootstrap(
		composition,
		mutationCapabilities,
		calendarCredentials.status,
		queueWake
	);
}

export class AgenticChatBootstrap {
	private state: AgenticChatBootstrapState;
	private startPromise: Promise<AgenticChatBootstrapStartResult> | null = null;
	private stopPromise: Promise<void> | null = null;
	private lastError: string | null = null;

	constructor(
		private readonly composition: AgenticChatBootstrapCompositionPort,
		private readonly mutationCapabilities: AgenticChatMutationCapabilitiesSummaryV1 | null = null,
		private readonly calendarCredentials: string = 'configured',
		private readonly queueWake: AgenticChatQueueWakeListenerPort | null = null
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
		const queueWake = this.safeQueueWakeHealth();
		if (this.state === 'running') {
			return runtime?.healthy
				? {
						enabled: true,
						healthy: true,
						state: this.state,
						runtime,
						mutationCapabilities,
						calendarCredentials,
						queueWake
					}
				: {
						enabled: true,
						healthy: false,
						state: this.state,
						reason: runtime?.reason ?? 'runtime_health_unavailable',
						runtime,
						mutationCapabilities,
						calendarCredentials,
						queueWake
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
				calendarCredentials,
				queueWake
			};
		}
		return {
			enabled: true,
			healthy: false,
			state: this.state,
			reason: this.state === 'failed' ? (this.lastError ?? 'bootstrap_failed') : this.state,
			runtime,
			mutationCapabilities,
			calendarCredentials,
			queueWake
		};
	}

	private async startRuntime(): Promise<AgenticChatBootstrapStartResult> {
		try {
			await this.composition.runtime.start();
			this.state = 'running';
			// Subscribe only once the queue can claim. The listener never throws
			// and re-subscribes on its own; polling covers any gap.
			this.startQueueWake();
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
			await this.stopQueueWake();
			await this.composition.runtime.stop();
			this.state = 'stopped';
		} catch (error) {
			this.lastError = canonicalError(error);
			this.state = 'failed';
			throw error;
		}
	}

	private startQueueWake(): void {
		try {
			this.queueWake?.start(() => this.wake());
		} catch (error) {
			console.warn(
				JSON.stringify({
					event: 'agentic_chat_queue_wake_start_failed',
					error: canonicalError(error)
				})
			);
		}
	}

	private async stopQueueWake(): Promise<void> {
		try {
			await this.queueWake?.stop();
		} catch {
			// The wake hint cannot block draining the durable queue.
		}
	}

	private safeQueueWakeHealth(): AgenticChatQueueWakeListenerHealthV1 | null {
		try {
			return this.queueWake?.getHealth() ?? null;
		} catch {
			return null;
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
	// the database is healthy. The executor joins usage before billing; errors are reported
	// so strict accounting cannot strand terminal user-visible truth.
	const usageLogger = new LLMUsageLogger({
		supabase: input.client,
		failureMode: 'throw'
	});
	const executionObservations = new SupabaseAgenticChatExecutionObservationAdapter(
		input.client as unknown as AgenticChatExecutionObservationRpcClient
	);
	const usageObserver = new AgenticChatLlmUsageObserver(usageLogger);
	// One process-local registry sees provider attempts from both clients for
	// per-turn progress health; the durable observation writes are unchanged.
	const turnActivity = new AgenticChatTurnActivityRegistry();
	const clientPorts = {
		usage: usageObserver,
		onPersistenceTrace: logAgenticChatPersistenceTrace,
		executionObservations: withAgenticChatTurnActivityV1(executionObservations, turnActivity),
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
		routes: input.config.provider.routes,
		...(input.config.provider.responseHeadersTimeoutMs
			? { responseHeadersTimeoutMs: input.config.provider.responseHeadersTimeoutMs }
			: {})
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
	const jevMode = input.config.jevToolSelection;
	const toolSelector =
		jevMode === 'off'
			? undefined
			: new JevToolSelector({
					// Same validated OpenRouter credential as the acting route.
					apiKey: input.config.provider.routes[0]!.apiKey,
					mode: jevMode,
					fetchImpl: input.fetchImpl,
					usage: usageLogger,
					onUsageError: input.onUsageError
				});
	// Ordinary project chat: Jev-ranked "Working from" chips (CONTEXT_FINDER_2026-09-22.md).
	// Global chat: Jev picks the projects first, then digs (JEV_GLOBAL_CONTEXT_2026-09-23.md).
	const contextFinderChatMode = input.config.contextFinderChat ?? 'off';
	const contextFinderGlobalMode = input.config.contextFinderGlobal ?? 'off';
	const contextFinderUserIds = input.config.contextFinderChatUserIds ?? [];
	const contextFinderJev =
		contextFinderUserIds.length &&
		(contextFinderChatMode !== 'off' || contextFinderGlobalMode !== 'off')
			? new JevClient({
					apiKey: (
						input.config.provider.routes.find((route) => route.kind === 'openrouter') ??
						input.config.provider.routes[0]!
					).apiKey,
					timeoutMs: CHAT_CONTEXT_FINDER_JEV_TIMEOUT_MS,
					maxRequestBytes: 96_000,
					retryOnce: false,
					// About 26% of Jev calls land in a 2-3 s lane, independently; a hedge
					// rescues most (48/48 hop-1 calls under 1.4 s hedged vs 7 timeouts unhedged).
					hedgeAfterMs: CHAT_CONTEXT_FINDER_HEDGE_MS,
					usage: usageLogger,
					...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
					title: 'BuildOS Context Finder (chat)'
				})
			: null;
	const contextFinder = contextFinderJev
		? composeContextFinders(
				contextFinderChatMode === 'off'
					? undefined
					: new ChatContextFinder({
							mode: contextFinderChatMode,
							userIds: contextFinderUserIds,
							// Service client; the turn's project access was checked at admission.
							client: input.client as unknown as ContextFinderReadClient,
							decider: contextFinderJev
						}),
				contextFinderGlobalMode === 'off'
					? undefined
					: new ChatWorkspaceFinder({
							mode: contextFinderGlobalMode,
							userIds: contextFinderUserIds,
							// Service client; the loader scopes to the user's accessible projects.
							client: input.client as unknown as WorkspaceFinderReadClient,
							decider: contextFinderJev
						})
			)
		: undefined;
	// web_navigate: Jev picks links, code fetches politely, Tavily renders pages a
	// plain fetch cannot read. Same OpenRouter credential as the acting route.
	const webNavigator = createWorkerWebNavigatePort({
		jev: new JevClient({
			apiKey: (
				input.config.provider.routes.find((route) => route.kind === 'openrouter') ??
				input.config.provider.routes[0]!
			).apiKey,
			model: WEB_NAVIGATE_MODEL,
			timeoutMs: WEB_NAVIGATE_DECISION_TIMEOUT_MS,
			maxRequestBytes: WEB_NAVIGATE_MAX_REQUEST_BYTES,
			title: 'BuildOS Web Navigation',
			usage: usageLogger,
			...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {})
		}),
		tavilyApiKey:
			process.env.PRIVATE_TAVILY_API_KEY?.trim() || process.env.TAVILY_API_KEY?.trim() || null
	});
	// Tasker 87: a separate client whose routes use only priced workflow models.
	const workflowExecutionEnabled = input.config.workflowV4ExecutionEnabled === true;
	const workflowClient = workflowExecutionEnabled
		? new AgenticChatOpenRouterClient(clientPorts, {
				...clientOptions,
				routes: buildAgenticChatWorkflowRoutesV1(input.config.provider.routes),
				requestTimeoutMs: AGENTIC_CHAT_WORKFLOW_REQUEST_TIMEOUT_MS,
				responseHeadersTimeoutMs: AGENTIC_CHAT_WORKFLOW_RESPONSE_HEADERS_TIMEOUT_MS
			})
		: undefined;
	return createAgenticChatCompositionRoot({
		client: input.client,
		providerClient,
		semanticReviewerClient,
		...(toolSelector ? { toolSelector } : {}),
		...(contextFinder ? { contextFinder } : {}),
		webNavigator,
		providerConfigured: true,
		workflowPrototypeUserIds: input.config.workflowPrototypeUserIds,
		workflowV4: {
			preparationEnabled: input.config.workflowV4PreparationEnabled === true,
			executionEnabled: workflowExecutionEnabled,
			specialistWorkflowsEnabled: input.config.specialistWorkflowsEnabled === true,
			documentReadToolsEnabled: input.config.documentReadToolsEnabled === true,
			publishedSpecialistsEnabled: input.config.publishedSpecialistsEnabled === true,
			projectReviewV2Enabled: input.config.projectReviewV2Enabled === true,
			projectReviewV3Enabled: input.config.projectReviewV3Enabled === true,
			documentEvidenceHandoffEnabled: input.config.documentEvidenceHandoffEnabled,
			selectionDecider:
				workflowExecutionEnabled && input.config.jevSpecialistSelection === 'shadow'
					? new JevClient({
							apiKey: input.config.provider.routes.find(
								(route) => route.kind === 'openrouter'
							)!.apiKey,
							model: SPECIALIST_SHADOW_POLICY.model,
							timeoutMs: SPECIALIST_SHADOW_POLICY.timeoutMs,
							maxRequestBytes: SPECIALIST_SHADOW_POLICY.maxRequestBytes,
							retryOnce: false,
							fetchImpl: input.fetchImpl,
							title: 'BuildOS Specialist Shadow'
						})
					: undefined,
			contextFinderEnabled:
				workflowExecutionEnabled && input.config.contextFinderEnabled === true,
			contextFinderDecider:
				workflowExecutionEnabled && input.config.contextFinderEnabled === true
					? new JevClient({
							apiKey: input.config.provider.routes.find(
								(route) => route.kind === 'openrouter'
							)!.apiKey,
							timeoutMs: WORKFLOW_CONTEXT_FINDER_TIMEOUT_MS,
							maxRequestBytes: 96_000,
							retryOnce: false,
							usage: usageLogger,
							fetchImpl: input.fetchImpl,
							title: 'BuildOS Context Finder'
						})
					: undefined,
			runnerClient: workflowClient,
			reasoning: input.config.workflowReasoning
		},
		liveVisionEnabled: input.config.liveVisionEnabled,
		consumptionBillingEnabled: input.config.consumptionBillingEnabled,
		mutationCapabilities: ALL_AGENTIC_CHAT_MUTATION_CAPABILITIES_V1,
		liveVisionFetchImpl: input.fetchImpl,
		consumerConfig: input.config.consumer,
		publisherConfig: input.config.publisher,
		providerBudgetMs: input.config.providerBudgetMs,
		maxProviderRounds: input.config.maxProviderRounds,
		mutationBatchLaneEnabled: input.config.mutationBatchLaneEnabled,
		maxToolCalls: input.config.maxToolCalls,
		maxToolConcurrency: input.config.maxToolConcurrency,
		onExecutionObservationError: input.onUsageError,
		turnActivity,
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
 * the cost of the calls that already fit. Reconfirmed against the 2026-09-08
 * audit window (p50 767 completion tokens, reasoning included) when reviewer
 * passes moved to `reasoning.effort: low` (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F80).
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
/**
 * Never a default reviewer fallback: 2026-09-04 GLM 5.3 Flash approved a
 * dependency correction without declaring its endpoints. An explicit policy
 * may still name it; the operator has then evaluated it
 * (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F81).
 */
export const AGENTIC_CHAT_SEMANTIC_REVIEWER_DEFAULT_EXCLUDED_MODELS: ReadonlySet<string> = new Set([
	GLM_53_FLASH_MODEL
]);

export function buildAgenticChatSemanticReviewerRoutes(
	routes: EnabledAgenticChatConfig['provider']['routes'],
	policy?: EnabledAgenticChatConfig['provider']['reviewer']
): EnabledAgenticChatConfig['provider']['routes'] {
	const actingModels = new Set(
		routes.flatMap((route) => [route.model, ...(route.fallbackModels ?? [])])
	);
	// Preserve the deployed default until a replacement passes semantic replay.
	// An explicit policy opts out of the legacy fallback pool; only the
	// operator's listed alternatives can then be used.
	const reviewerCandidates = policy
		? [policy.model, ...policy.fallbackModels]
		: [
				DEFAULT_AGENTIC_CHAT_SEMANTIC_REVIEWER_MODEL,
				...JSON_PROFILE_MODELS.powerful,
				...JSON_PROFILE_MODELS.maximum
			].filter((model) => !AGENTIC_CHAT_SEMANTIC_REVIEWER_DEFAULT_EXCLUDED_MODELS.has(model));
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
				// Provider evidence is per model. The acting route's `order` and
				// `ignore` describe DeepSeek's endpoints (Azure serves it at 112 ms
				// per token; it serves Luna fine), so none of it carries over.
				providerRouting: Object.freeze({
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
