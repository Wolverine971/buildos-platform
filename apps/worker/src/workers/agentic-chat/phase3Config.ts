// apps/worker/src/workers/agentic-chat/phase3Config.ts

import {
	type AgenticChatConsumerConfig,
	DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG,
	normalizeInternalUserIds,
	validateAgenticChatConsumerConfig,
	validateAgenticChatDrainTimeout
} from './consumer';
import type { AgenticChatOpenAiCompatibleRouteV1 } from './openRouterReadOnlyClient';
import {
	DEFAULT_AGENTIC_CHAT_MAX_TOOL_CALLS,
	DEFAULT_AGENTIC_CHAT_MAX_TOOL_ROUNDS,
	DEFAULT_AGENTIC_CHAT_PROVIDER_BUDGET_MS
} from './fixtureTurnExecutor';
import {
	AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1,
	type AgenticChatProviderMutationCapabilitiesV1
} from './mutationToolCatalog';

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
// Production canaries measured long-tail final synthesis on StreamLake,
// Sail Research, Baidu, and Alibaba. Prefer the faster observed pool, but do
// not use `only`: this route is also cloned for the Gemini semantic reviewer,
// and a cross-model provider allowlist can force an unrelated fallback model.
// Mid-stream recovery is owned by the adapter's atomic buffered-pass retry.
const DEFAULT_OPENROUTER_PROVIDER_POOL = Object.freeze([
	'deepinfra',
	'deepseek',
	'alibaba',
	'cloudflare'
]);
const DEFAULT_OPENROUTER_PROVIDER_ROUTING = Object.freeze({
	allow_fallbacks: true,
	order: DEFAULT_OPENROUTER_PROVIDER_POOL
});

export type AgenticChatPhase3ProviderConfig = {
	routes: readonly AgenticChatOpenAiCompatibleRouteV1[];
};

type AgenticChatPhase3BaseConfig = {
	internalUserIds: readonly string[];
	liveVisionEnabled: boolean;
	supervisorEnabled: boolean;
	consumptionBillingEnabled: boolean;
	mutationProviderCapabilities: Readonly<Partial<AgenticChatProviderMutationCapabilitiesV1>>;
	mutationAdapterCapabilities: Readonly<Partial<AgenticChatProviderMutationCapabilitiesV1>>;
	consumer: AgenticChatConsumerConfig;
	providerBudgetMs: number;
	maxProviderRounds: number;
	maxToolCalls: number;
};

export type AgenticChatPhase3Config =
	| (AgenticChatPhase3BaseConfig & {
			enabled: false;
			provider: null;
	  })
	| (AgenticChatPhase3BaseConfig & {
			enabled: true;
			provider: AgenticChatPhase3ProviderConfig;
	  });

/**
 * Parse the Phase 3 startup envelope without mutating process state.
 *
 * Worker execution is disabled by default. Enabling it requires an explicit
 * canonical-UUID allowlist so a deploy cannot accidentally become a public
 * cohort. The allowlist is intentionally data, not an email/domain heuristic.
 */
export function loadAgenticChatPhase3Config(
	environment: NodeJS.ProcessEnv = process.env
): AgenticChatPhase3Config {
	const enabled = parseBoolean(
		environment.AGENTIC_CHAT_WORKER_ENABLED,
		false,
		'AGENTIC_CHAT_WORKER_ENABLED'
	);
	const liveVisionEnabled = parseBoolean(
		environment.AGENTIC_CHAT_WORKER_LIVE_VISION_ENABLED,
		false,
		'AGENTIC_CHAT_WORKER_LIVE_VISION_ENABLED'
	);
	const supervisorEnabled = parseBoolean(
		environment.AGENTIC_CHAT_WORKER_SUPERVISOR_ENABLED,
		false,
		'AGENTIC_CHAT_WORKER_SUPERVISOR_ENABLED'
	);
	const consumptionBillingEnabled = parseBoolean(
		environment.PRIVATE_ENABLE_CONSUMPTION_BILLING_GATE,
		false,
		'PRIVATE_ENABLE_CONSUMPTION_BILLING_GATE'
	);
	const mutationProviderCapabilities = parseMutationCapabilities(
		environment.AGENTIC_CHAT_MUTATION_PROVIDER_CAPABILITIES,
		'AGENTIC_CHAT_MUTATION_PROVIDER_CAPABILITIES'
	);
	const mutationAdapterCapabilities = parseMutationCapabilities(
		environment.AGENTIC_CHAT_MUTATION_ADAPTER_CAPABILITIES,
		'AGENTIC_CHAT_MUTATION_ADAPTER_CAPABILITIES'
	);
	for (const [capability, toolName] of AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1) {
		if (mutationProviderCapabilities[capability] && !mutationAdapterCapabilities[capability]) {
			throw new Error(`${toolName} provider capability requires its mutation adapter`);
		}
	}
	const internalUserIds = parseInternalUserIds(environment.AGENTIC_CHAT_INTERNAL_USER_IDS);
	if (enabled && internalUserIds.length === 0) {
		throw new Error(
			'AGENTIC_CHAT_INTERNAL_USER_IDS must contain at least one canonical UUID when the Agentic Chat worker is enabled'
		);
	}

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
	const maxToolCalls = parsePositiveInteger(
		environment.CHAT_MAX_TOOL_CALLS,
		DEFAULT_AGENTIC_CHAT_MAX_TOOL_CALLS,
		'CHAT_MAX_TOOL_CALLS'
	);

	if (!enabled) {
		return {
			enabled: false,
			internalUserIds,
			liveVisionEnabled,
			supervisorEnabled,
			consumptionBillingEnabled,
			mutationProviderCapabilities,
			mutationAdapterCapabilities,
			consumer,
			providerBudgetMs,
			maxProviderRounds,
			maxToolCalls,
			provider: null
		};
	}
	validateAgenticChatDrainTimeout(consumer.drainTimeoutMs);

	return {
		enabled: true,
		internalUserIds,
		liveVisionEnabled,
		supervisorEnabled,
		consumptionBillingEnabled,
		mutationProviderCapabilities,
		mutationAdapterCapabilities,
		consumer,
		providerBudgetMs,
		maxProviderRounds,
		maxToolCalls,
		provider: loadProviderConfig(environment)
	};
}

export function isAgenticChatInternalUser(
	config: Pick<AgenticChatPhase3Config, 'internalUserIds'>,
	userId: string
): boolean {
	return config.internalUserIds.includes(userId.toLowerCase());
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

function parseInternalUserIds(value: string | undefined): string[] {
	if (value === undefined || value.trim() === '') return [];
	try {
		return normalizeInternalUserIds(value.split(',').map((entry) => entry.trim()));
	} catch (error) {
		if (error instanceof Error && error.message.includes('duplicates')) throw error;
		throw new Error(
			'AGENTIC_CHAT_INTERNAL_USER_IDS must be a comma-separated canonical UUID list'
		);
	}
}

function parseMutationCapabilities(
	value: string | undefined,
	name: string
): Readonly<Partial<AgenticChatProviderMutationCapabilitiesV1>> {
	if (value === undefined || value === '') return Object.freeze({});
	const entries = value.split(',');
	if (entries.some((entry) => !entry || entry !== entry.trim())) {
		throw new Error(`${name} must be a comma-separated canonical capability list`);
	}
	if (entries.length > AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.length) {
		throw new Error(
			`${name} supports at most ${AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.length} capabilities`
		);
	}
	if (new Set(entries).size !== entries.length) {
		throw new Error(`${name} must not contain duplicates`);
	}
	const allowedCapabilities = new Set<string>(
		AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.map(([capability]) => capability)
	);
	if (entries.some((entry) => !allowedCapabilities.has(entry))) {
		throw new Error(`${name} contains an unknown capability`);
	}
	return Object.freeze(
		Object.fromEntries(
			entries.map((entry) => [entry, true])
		) as Partial<AgenticChatProviderMutationCapabilitiesV1>
	);
}

function loadProviderConfig(environment: NodeJS.ProcessEnv): AgenticChatPhase3ProviderConfig {
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
		providerRouting: DEFAULT_OPENROUTER_PROVIDER_ROUTING
	});
	return Object.freeze({ routes: Object.freeze([route]) });
}

function parseFallbackModels(value: string | undefined, primaryModel: string): readonly string[] {
	if (value === undefined || value === '') return Object.freeze([]);
	const entries = value.split(',');
	if (entries.some((entry) => !entry)) {
		throw new Error(
			'AGENTIC_CHAT_OPENROUTER_FALLBACK_MODELS must be a comma-separated canonical model list'
		);
	}
	const models = entries.map((entry) =>
		canonicalRequiredValue(entry, 'AGENTIC_CHAT_OPENROUTER_FALLBACK_MODELS', 256)
	);
	if (models.length > 3) {
		throw new Error('AGENTIC_CHAT_OPENROUTER_FALLBACK_MODELS supports at most three models');
	}
	if (new Set(models).size !== models.length || models.includes(primaryModel)) {
		throw new Error(
			'AGENTIC_CHAT_OPENROUTER_FALLBACK_MODELS must be unique and exclude the primary model'
		);
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
