// apps/worker/src/workers/agentic-chat/config.ts

import {
	type AgenticChatConsumerConfig,
	DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG,
	validateAgenticChatConsumerConfig,
	validateAgenticChatDrainTimeout
} from './consumer';
import type {
	AgenticChatOpenAiCompatibleRouteV1,
	AgenticChatOpenRouterProviderRoutingV1
} from './provider/openrouter-client';
import {
	DEFAULT_AGENTIC_CHAT_MAX_TOOL_CALLS,
	DEFAULT_AGENTIC_CHAT_MAX_TOOL_CONCURRENCY,
	DEFAULT_AGENTIC_CHAT_MAX_TOOL_ROUNDS,
	DEFAULT_AGENTIC_CHAT_PROVIDER_BUDGET_MS
} from './turn-executor';
import {
	type AgenticChatPublisherConfig,
	DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG,
	validateAgenticChatPublisherConfig
} from './streamPublisher';

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
// Provider preference for the acting model (DeepSeek v4 Flash), measured on
// production passes 2026-09-04 to 09-09 (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08
// F78, lane K). Per-pass p50: DeepInfra 5.3 s, Alibaba 5.3 s, StreamLake 7.3 s
// (n=4), NextBit 7.8 s, Azure 21.5 s at 112 ms per output token and roughly
// 1.5-4x the cheap tier's price. The previous order named DeepSeek and
// Cloudflare, which OpenRouter no longer lists for this model, so the
// effective policy was "Alibaba, then whatever". GMICloud ($0.091/M, 99.5%
// uptime) never served a call under that order. StreamLake stays last until
// its p90 holds: 2026-08-27 canaries saw long-tail final synthesis there.
// Azure is ignored outright for the acting route; it is the endpoint the
// snapshot-id pin (F77) kept detouring to. DigitalOcean stays outside the
// order but is not ignored (2026-08-27: measure same-turn cache hits first).
// Do not use `only`: an allowlist forfeits the availability the ordered
// preference already keeps, and the semantic reviewer builds its own routing.
// Mid-stream recovery is owned by the adapter's atomic buffered-pass retry.
const DEFAULT_OPENROUTER_PROVIDER_POOL = Object.freeze([
	'deepinfra',
	'gmicloud',
	'alibaba',
	'streamlake'
]);
const DEFAULT_OPENROUTER_PROVIDER_IGNORE = Object.freeze(['azure']);
const DEFAULT_OPENROUTER_PROVIDER_ROUTING = Object.freeze({
	allow_fallbacks: true,
	order: DEFAULT_OPENROUTER_PROVIDER_POOL,
	ignore: DEFAULT_OPENROUTER_PROVIDER_IGNORE
});

// Explicit route experiments keep model-specific measurements out of unrelated defaults.
// OpenRouter routing contract: https://openrouter.ai/docs/guides/routing/provider-selection
function resolveProviderRouting(
	environment: Record<string, string | undefined>
): AgenticChatOpenRouterProviderRoutingV1 {
	const isV41 =
		environment.AGENTIC_CHAT_OPENROUTER_MODEL?.trim() === 'deepseek/deepseek-v4.1-flash';
	// Morph took 44.6s on a narrow final answer and exhausted a 90s attempt
	// on another short answer in the Sep 11 QA runs. Other fallbacks stay open.
	const ignoredProviders = isV41 ? ['azure', 'morph'] : DEFAULT_OPENROUTER_PROVIDER_IGNORE;
	const order = environment.AGENTIC_CHAT_OPENROUTER_PROVIDER_ORDER?.trim();
	const sort = environment.AGENTIC_CHAT_OPENROUTER_PROVIDER_SORT?.trim();
	if (order && sort) throw new Error('Choose a provider order or sort, not both');
	if (sort) {
		if (sort !== 'latency' && sort !== 'throughput' && sort !== 'price')
			throw new Error('Invalid AGENTIC_CHAT_OPENROUTER_PROVIDER_SORT');
		return { allow_fallbacks: true, ignore: ignoredProviders, sort };
	}
	if (order) {
		const providers = order.split(',').map((value) => value.trim());
		if (
			providers.length > 16 ||
			providers.some((value) => !/^[a-z0-9][a-z0-9/_-]{0,63}$/.test(value))
		)
			throw new Error('Invalid AGENTIC_CHAT_OPENROUTER_PROVIDER_ORDER');
		return {
			allow_fallbacks: true,
			ignore: ignoredProviders,
			order: [...new Set(providers)]
		};
	}
	// V4.1 is a different endpoint pool from the V4 measurements above.
	// Sep 11 QA: throughput sorting completed all five-task/three-link turns
	// in 52–54s, narrow edits in 18–30s, and document edits in 21–26s (3 each).
	// Fixed ordering had repeated long-tail misses. Preserve fallback availability
	// and explicit overrides; these samples do not establish a latency guarantee.
	if (isV41) {
		return {
			allow_fallbacks: true,
			ignore: ignoredProviders,
			sort: 'throughput'
		};
	}
	return DEFAULT_OPENROUTER_PROVIDER_ROUTING;
}

export type AgenticChatProviderConfig = {
	routes: readonly AgenticChatOpenAiCompatibleRouteV1[];
	/** Explicit reviewer policy; no implicit model fallbacks when configured. */
	reviewer?: { model: string; fallbackModels: readonly string[] };
};

type AgenticChatBaseConfig = {
	liveVisionEnabled: boolean;
	consumptionBillingEnabled: boolean;
	consumer: AgenticChatConsumerConfig;
	publisher: AgenticChatPublisherConfig;
	providerBudgetMs: number;
	maxProviderRounds: number;
	mutationBatchLaneEnabled: boolean;
	maxToolCalls: number;
	maxToolConcurrency: number;
};

export type AgenticChatConfig = AgenticChatBaseConfig & {
	enabled: true;
	provider: AgenticChatProviderConfig;
};

/**
 * Parse the worker startup envelope without mutating process state.
 *
 * This configuration is constructed only by the dedicated chat-worker
 * entrypoint. Process ownership is the enablement boundary; missing provider
 * configuration fails startup instead of creating a healthy disabled service.
 */
export function loadAgenticChatConfig(
	environment: NodeJS.ProcessEnv = process.env
): AgenticChatConfig {
	if (isProductionProfile(environment.AGENTIC_CHAT_WORKER_PROFILE)) {
		requireExplicitProductionConfig(environment);
	}
	const liveVisionEnabled = parseBoolean(
		environment.AGENT_CHAT_LIVE_VISION_ENABLED,
		false,
		'AGENT_CHAT_LIVE_VISION_ENABLED'
	);
	const consumptionBillingEnabled = parseBoolean(
		environment.PRIVATE_ENABLE_CONSUMPTION_BILLING_GATE,
		false,
		'PRIVATE_ENABLE_CONSUMPTION_BILLING_GATE'
	);
	const consumer: AgenticChatConsumerConfig = {
		concurrency: parsePositiveInteger(
			environment.CHAT_CONCURRENCY,
			DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.concurrency,
			'CHAT_CONCURRENCY'
		),
		pollIntervalMs: parsePositiveInteger(
			environment.CHAT_POLL_INTERVAL_MS,
			DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.pollIntervalMs,
			'CHAT_POLL_INTERVAL_MS'
		),
		workerTimeoutMs: parsePositiveInteger(
			environment.CHAT_WORKER_TIMEOUT_MS,
			DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.workerTimeoutMs,
			'CHAT_WORKER_TIMEOUT_MS'
		),
		stalledTimeoutMs: parsePositiveInteger(
			environment.CHAT_STALLED_TIMEOUT_MS,
			DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.stalledTimeoutMs,
			'CHAT_STALLED_TIMEOUT_MS'
		),
		drainTimeoutMs: parsePositiveInteger(
			environment.CHAT_DRAIN_TIMEOUT_MS,
			DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.drainTimeoutMs,
			'CHAT_DRAIN_TIMEOUT_MS'
		)
	};
	validateAgenticChatConsumerConfig(consumer);
	const publisher = loadPublisherConfig(environment);
	const providerBudgetMs = parsePositiveInteger(
		environment.CHAT_PROVIDER_BUDGET_MS,
		DEFAULT_AGENTIC_CHAT_PROVIDER_BUDGET_MS,
		'CHAT_PROVIDER_BUDGET_MS'
	);
	if (providerBudgetMs >= consumer.workerTimeoutMs) {
		throw new Error('CHAT_PROVIDER_BUDGET_MS must be below CHAT_WORKER_TIMEOUT_MS');
	}
	const maxProviderRounds = parsePositiveInteger(
		environment.CHAT_MAX_TOOL_ROUNDS,
		DEFAULT_AGENTIC_CHAT_MAX_TOOL_ROUNDS,
		'CHAT_MAX_TOOL_ROUNDS'
	);
	// SHA-bound batch approval replaces the turn contract DSL on the complex
	// write path (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 Decision 1). On by
	// default; CHAT_MUTATION_BATCH_LANE=false restores the contract lane for
	// one deploy if the battery finds a regression. Both the flag and the
	// contract lane are deleted once the battery confirms the new lane.
	const mutationBatchLaneEnabled = parseBoolean(
		environment.CHAT_MUTATION_BATCH_LANE,
		true,
		'CHAT_MUTATION_BATCH_LANE'
	);
	const maxToolCalls = parsePositiveInteger(
		environment.CHAT_MAX_TOOL_CALLS,
		DEFAULT_AGENTIC_CHAT_MAX_TOOL_CALLS,
		'CHAT_MAX_TOOL_CALLS'
	);
	const maxToolConcurrency = parsePositiveInteger(
		environment.CHAT_MAX_TOOL_CONCURRENCY,
		DEFAULT_AGENTIC_CHAT_MAX_TOOL_CONCURRENCY,
		'CHAT_MAX_TOOL_CONCURRENCY'
	);
	validateAgenticChatDrainTimeout(consumer.drainTimeoutMs);

	return {
		enabled: true,
		liveVisionEnabled,
		consumptionBillingEnabled,
		consumer,
		publisher,
		providerBudgetMs,
		maxProviderRounds,
		mutationBatchLaneEnabled,
		maxToolCalls,
		maxToolConcurrency,
		provider: loadProviderConfig(environment)
	};
}

function isProductionProfile(value: string | undefined): boolean {
	if (value === undefined) return false;
	if (value === 'production') return true;
	throw new Error('AGENTIC_CHAT_WORKER_PROFILE must be exactly production when set');
}

const PRODUCTION_REQUIRED_CONFIG = Object.freeze([
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
] as const);

function requireExplicitProductionConfig(environment: NodeJS.ProcessEnv): void {
	for (const name of PRODUCTION_REQUIRED_CONFIG) {
		const value = environment[name];
		if (value === undefined || value.trim() === '') {
			throw new Error(`${name} must be explicitly configured for the production profile`);
		}
	}
}

function loadPublisherConfig(environment: NodeJS.ProcessEnv): AgenticChatPublisherConfig {
	const config: AgenticChatPublisherConfig = {
		...DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG,
		turnPendingSoftBytes: parsePositiveInteger(
			environment.CHAT_PUBLISHER_TURN_PENDING_SOFT_BYTES,
			DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG.turnPendingSoftBytes,
			'CHAT_PUBLISHER_TURN_PENDING_SOFT_BYTES'
		),
		turnPendingHardBytes: parsePositiveInteger(
			environment.CHAT_PUBLISHER_TURN_PENDING_HARD_BYTES,
			DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG.turnPendingHardBytes,
			'CHAT_PUBLISHER_TURN_PENDING_HARD_BYTES'
		),
		workerPendingSoftBytes: parsePositiveInteger(
			environment.CHAT_PUBLISHER_WORKER_PENDING_SOFT_BYTES,
			DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG.workerPendingSoftBytes,
			'CHAT_PUBLISHER_WORKER_PENDING_SOFT_BYTES'
		),
		workerPendingHardBytes: parsePositiveInteger(
			environment.CHAT_PUBLISHER_WORKER_PENDING_HARD_BYTES,
			DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG.workerPendingHardBytes,
			'CHAT_PUBLISHER_WORKER_PENDING_HARD_BYTES'
		),
		turnPendingSoftEvents: parsePositiveInteger(
			environment.CHAT_PUBLISHER_TURN_PENDING_SOFT_EVENTS,
			DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG.turnPendingSoftEvents,
			'CHAT_PUBLISHER_TURN_PENDING_SOFT_EVENTS'
		),
		turnPendingHardEvents: parsePositiveInteger(
			environment.CHAT_PUBLISHER_TURN_PENDING_HARD_EVENTS,
			DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG.turnPendingHardEvents,
			'CHAT_PUBLISHER_TURN_PENDING_HARD_EVENTS'
		),
		workerPendingSoftEvents: parsePositiveInteger(
			environment.CHAT_PUBLISHER_WORKER_PENDING_SOFT_EVENTS,
			DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG.workerPendingSoftEvents,
			'CHAT_PUBLISHER_WORKER_PENDING_SOFT_EVENTS'
		),
		workerPendingHardEvents: parsePositiveInteger(
			environment.CHAT_PUBLISHER_WORKER_PENDING_HARD_EVENTS,
			DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG.workerPendingHardEvents,
			'CHAT_PUBLISHER_WORKER_PENDING_HARD_EVENTS'
		)
	};
	validateAgenticChatPublisherConfig(config);
	return Object.freeze(config);
}

function parseBoolean(value: string | undefined, fallback: boolean, name: string): boolean {
	if (value === undefined || value.trim() === '') return fallback;
	if (value === 'true') return true;
	if (value === 'false') return false;
	throw new Error(`${name} must be exactly true or false`);
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
	if (value === undefined || value.trim() === '') return fallback;
	if (!/^\d+$/.test(value)) throw new Error(`${name} must be a positive integer`);
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		throw new Error(`${name} must be a positive safe integer`);
	}
	return parsed;
}

function loadProviderConfig(environment: NodeJS.ProcessEnv): AgenticChatProviderConfig {
	const apiKey = canonicalRequiredValue(
		environment.PRIVATE_OPENROUTER_API_KEY,
		'PRIVATE_OPENROUTER_API_KEY',
		2_048
	);
	const model = canonicalRequiredValue(
		environment.AGENTIC_CHAT_OPENROUTER_MODEL,
		'AGENTIC_CHAT_OPENROUTER_MODEL',
		256
	);
	const fallbackModels = parseFallbackModels(
		environment.AGENTIC_CHAT_OPENROUTER_FALLBACK_MODELS,
		model
	);
	const baseUrl = cleanHttpsBaseUrl(
		environment.AGENTIC_CHAT_OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL
	);
	const route = Object.freeze({
		id: 'openrouter',
		kind: 'openrouter' as const,
		baseUrl,
		apiKey,
		model,
		fallbackModels,
		providerRouting: resolveProviderRouting(environment)
	});
	const reviewerModelValue = environment.AGENTIC_CHAT_REVIEWER_MODEL;
	if (!reviewerModelValue && environment.AGENTIC_CHAT_REVIEWER_FALLBACK_MODELS) {
		throw new Error(
			'AGENTIC_CHAT_REVIEWER_FALLBACK_MODELS requires AGENTIC_CHAT_REVIEWER_MODEL'
		);
	}
	const reviewerModel =
		reviewerModelValue === undefined
			? null
			: canonicalRequiredValue(reviewerModelValue, 'AGENTIC_CHAT_REVIEWER_MODEL', 256);
	return Object.freeze({
		routes: Object.freeze([route]),
		...(reviewerModel
			? {
					reviewer: Object.freeze({
						model: reviewerModel,
						fallbackModels: parseFallbackModels(
							environment.AGENTIC_CHAT_REVIEWER_FALLBACK_MODELS,
							reviewerModel,
							'AGENTIC_CHAT_REVIEWER_FALLBACK_MODELS'
						)
					})
				}
			: {})
	});
}

function parseFallbackModels(
	value: string | undefined,
	primaryModel: string,
	name = 'AGENTIC_CHAT_OPENROUTER_FALLBACK_MODELS'
): readonly string[] {
	if (value === undefined || value === '') return Object.freeze([]);
	const entries = value.split(',');
	if (entries.some((entry) => !entry)) {
		throw new Error(`${name} must be a comma-separated canonical model list`);
	}
	const models = entries.map((entry) => canonicalRequiredValue(entry, name, 256));
	if (models.length > 3) {
		throw new Error(`${name} supports at most three models`);
	}
	if (new Set(models).size !== models.length || models.includes(primaryModel)) {
		throw new Error(`${name} must be unique and exclude the primary model`);
	}
	return Object.freeze(models);
}

function canonicalRequiredValue(
	value: string | undefined,
	name: string,
	maximumLength: number
): string {
	if (
		value === undefined ||
		!value ||
		value !== value.trim() ||
		value.length > maximumLength ||
		/[\r\n]/.test(value)
	) {
		throw new Error(`${name} must be a nonempty canonical value`);
	}
	return value;
}

function cleanHttpsBaseUrl(value: string): string {
	if (!value || value !== value.trim()) {
		throw new Error('AGENTIC_CHAT_OPENROUTER_BASE_URL must be a clean HTTPS base URL');
	}
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error('AGENTIC_CHAT_OPENROUTER_BASE_URL must be a clean HTTPS base URL');
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
		throw new Error('AGENTIC_CHAT_OPENROUTER_BASE_URL must be a clean HTTPS base URL');
	}
	return value.replace(/\/+$/, '');
}
