// apps/worker/src/workers/agentic-chat/host/config.ts
import { parseChatWorkflowPrototypeUsers } from '@buildos/shared-types';
import {
	DEEPSEEK_V4_FLASH_ZDR_PROVIDER_ORDER,
	GLM_53_MODEL,
	PARETO_MODEL,
	QWEN_38_27B_FREE_MODEL
} from '@buildos/smart-llm';

import {
	type AgenticChatConsumerConfig,
	DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG,
	validateAgenticChatConsumerConfig,
	validateAgenticChatDrainTimeout
} from './consumer';
import {
	type AgenticChatOpenAiCompatibleRouteV1,
	type AgenticChatOpenRouterProviderRoutingV1,
	DEFAULT_AGENTIC_CHAT_RESPONSE_HEADERS_TIMEOUT_MS
} from '../provider/openrouter-client';
import type { ChatContextFinderMode } from '../provider/chat-context-finder';
import type { JevToolSelectionMode } from '../provider/jev-tool-selector';
import type { AgenticChatWorkflowReasoningPolicyV1 } from '../workflow/contracts';
import {
	DEFAULT_AGENTIC_CHAT_MAX_TOOL_CALLS,
	DEFAULT_AGENTIC_CHAT_MAX_TOOL_CONCURRENCY,
	DEFAULT_AGENTIC_CHAT_MAX_TOOL_ROUNDS,
	DEFAULT_AGENTIC_CHAT_PROVIDER_BUDGET_MS
} from '../turn/executor-contracts';
import {
	type AgenticChatPublisherConfig,
	DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG,
	validateAgenticChatPublisherConfig
} from '../stream/stream-publisher';

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const PARETO_RESPONSE_HEADERS_TIMEOUT_MS = 10_000;
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
// 2026-09-24 (tasker 103): every request now requires ZDR, so the order names
// only hosts on OpenRouter's /endpoints/zdr list for V4 Flash. GMICloud,
// Alibaba, and StreamLake are not on it; NextBit (p50 7.8 s above),
// Open Inference, and Parasail are. DeepInfra, NextBit, and Open Inference
// support tool_choice=required; Parasail does not.
const DEFAULT_OPENROUTER_PROVIDER_POOL = DEEPSEEK_V4_FLASH_ZDR_PROVIDER_ORDER;
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
	const isPareto = environment.AGENTIC_CHAT_OPENROUTER_MODEL?.trim() === PARETO_MODEL;
	// Pareto has one Unbiased endpoint. Do not carry the DeepSeek-specific
	// provider order/ignore policy into this explicit local quality experiment.
	if (isPareto) return { allow_fallbacks: true };

	const isV41 =
		environment.AGENTIC_CHAT_OPENROUTER_MODEL?.trim() === 'deepseek/deepseek-v4.1-flash';
	// Morph took 44.6s on a narrow final answer and exhausted a 90s attempt
	// on another short answer in the Sep 11 QA runs. Other fallbacks stay open.
	// Sep 13: Modal opened promptly but took 58.1s to generate 1,253 tokens.
	// A header timeout cannot catch that outlier. Keep other fallbacks available.
	const ignoredProviders = isV41
		? ['azure', 'morph', 'modal']
		: DEFAULT_OPENROUTER_PROVIDER_IGNORE;
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
	if (
		[GLM_53_MODEL, QWEN_38_27B_FREE_MODEL].some(
			(model) => model === environment.AGENTIC_CHAT_OPENROUTER_MODEL?.trim()
		)
	) {
		return { allow_fallbacks: true, require_parameters: true };
	}
	return DEFAULT_OPENROUTER_PROVIDER_ROUTING;
}

export type AgenticChatProviderConfig = {
	routes: readonly AgenticChatOpenAiCompatibleRouteV1[];
	/** Acting-only response-header budget; reviewer clients keep their own default. */
	responseHeadersTimeoutMs?: number;
	/** Explicit reviewer policy; no implicit model fallbacks when configured. */
	reviewer?: { model: string; fallbackModels: readonly string[] };
};

type AgenticChatBaseConfig = {
	/**
	 * AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS: the durable project-review cohort. Web admission
	 * applies it before writing a v4 turn; worker preparation re-checks it. The name predates
	 * the retired `/workflow` prototype and is kept because web reads the same variable.
	 */
	workflowPrototypeUserIds?: string[];
	/** Tasker 86: worker preparation for raw v4 review turns. Default off. */
	workflowV4PreparationEnabled?: boolean;
	/** Tasker 87: durable workflow model execution. Default off; requires preparation. */
	workflowV4ExecutionEnabled?: boolean;
	specialistWorkflowsEnabled?: boolean;
	documentReadToolsEnabled?: boolean;
	documentEvidenceHandoffEnabled?: boolean;
	publishedSpecialistsEnabled?: boolean;
	projectReviewV2Enabled?: boolean;
	projectReviewV3Enabled?: boolean;
	/** Jev ranks project records and sections for published specialist reviews. Default off. */
	contextFinderEnabled?: boolean;
	/** Workflow steps whose hidden reasoning is off. Default: none (definitions' `low`). */
	workflowReasoning?: AgenticChatWorkflowReasoningPolicyV1;
	/** Ordinary project chat: Jev-ranked "Working from" chips (off|shadow|chips|on). */
	contextFinderChat?: ChatContextFinderMode;
	/** Users whose chats are ranked: ids, or 'all' (env value `*`); empty ranks nobody. */
	contextFinderChatUserIds?: string[] | 'all';
	/**
	 * Global chat (no project in focus): Jev picks the projects a message is about, and digs
	 * into them only when it looks for something specific. Same user allowlist as project chat.
	 */
	contextFinderGlobal?: ChatContextFinderMode;
	liveVisionEnabled: boolean;
	consumptionBillingEnabled: boolean;
	consumer: AgenticChatConsumerConfig;
	publisher: AgenticChatPublisherConfig;
	providerBudgetMs: number;
	maxProviderRounds: number;
	mutationBatchLaneEnabled: boolean;
	/**
	 * AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT: a simple direct write that fully landed
	 * closes on ledger receipt text instead of a tool-free model pass. Default off.
	 */
	directWriteReceiptTextEnabled?: boolean;
	/** Jev opening-pass tool narrowing: on (default), shadow (log only), or off. */
	jevToolSelection: 'off' | JevToolSelectionMode;
	maxToolCalls: number;
	maxToolConcurrency: number;
	/**
	 * AGENTIC_CHAT_LIVE_TEXT_PREVIEW: broadcast a display-only preview of the answer
	 * while a user-facing pass streams. Default off; off is byte-identical to before.
	 */
	liveTextPreviewEnabled?: boolean;
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
	const workflowV4PreparationEnabled = parseBoolean(
		environment.AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED,
		false,
		'AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED'
	);
	const documentEvidenceHandoffEnabled = parseBoolean(
		environment.AGENTIC_CHAT_DOCUMENT_EVIDENCE_HANDOFF_ENABLED,
		false,
		'AGENTIC_CHAT_DOCUMENT_EVIDENCE_HANDOFF_ENABLED'
	);
	const projectReviewV3Enabled = parseBoolean(
		environment.AGENTIC_CHAT_PROJECT_REVIEW_V3_ENABLED,
		false,
		'AGENTIC_CHAT_PROJECT_REVIEW_V3_ENABLED'
	);
	const projectReviewV2Enabled = parseBoolean(
		environment.AGENTIC_CHAT_PROJECT_REVIEW_V2_ENABLED,
		false,
		'AGENTIC_CHAT_PROJECT_REVIEW_V2_ENABLED'
	);
	const publishedSpecialistsEnabled = parseBoolean(
		environment.AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED,
		false,
		'AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED'
	);
	const documentReadToolsEnabled = parseBoolean(
		environment.AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED,
		false,
		'AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED'
	);
	// AGENTIC_CHAT_JEV_SPECIALIST_SELECTION (the retired specialist-selection shadow) is
	// deliberately not read: a value left on a deployed service must not fail startup.
	const contextFinderEnabled = parseBoolean(
		environment.AGENTIC_CHAT_CONTEXT_FINDER_ENABLED,
		false,
		'AGENTIC_CHAT_CONTEXT_FINDER_ENABLED'
	);
	const workflowReasoning = parseWorkflowReasoningOffSteps(
		environment.AGENTIC_CHAT_WORKFLOW_REASONING_OFF_STEPS
	);
	const contextFinderChat = parseContextFinderChat(
		environment.AGENTIC_CHAT_CONTEXT_FINDER_CHAT,
		'AGENTIC_CHAT_CONTEXT_FINDER_CHAT'
	);
	const contextFinderGlobal = parseContextFinderChat(
		environment.AGENTIC_CHAT_CONTEXT_FINDER_GLOBAL,
		'AGENTIC_CHAT_CONTEXT_FINDER_GLOBAL'
	);
	// `*` opens the context finder to every user; otherwise a comma-separated id allowlist.
	const contextFinderChatUserIds: string[] | 'all' =
		environment.AGENTIC_CHAT_CONTEXT_FINDER_CHAT_USER_IDS?.trim() === '*'
			? 'all'
			: parseChatWorkflowPrototypeUsers(
					environment.AGENTIC_CHAT_CONTEXT_FINDER_CHAT_USER_IDS
				);
	const specialistWorkflowsEnabled = parseBoolean(
		environment.AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED,
		false,
		'AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED'
	);
	const workflowV4ExecutionEnabled = parseBoolean(
		environment.AGENTIC_CHAT_WORKFLOW_EXECUTION_ENABLED,
		false,
		'AGENTIC_CHAT_WORKFLOW_EXECUTION_ENABLED'
	);
	if (workflowV4ExecutionEnabled && !workflowV4PreparationEnabled) {
		throw new Error(
			'AGENTIC_CHAT_WORKFLOW_EXECUTION_ENABLED requires AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED'
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
		idlePollIntervalMs: parsePositiveInteger(
			environment.CHAT_IDLE_POLL_INTERVAL_MS,
			DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.idlePollIntervalMs,
			'CHAT_IDLE_POLL_INTERVAL_MS'
		),
		workerTimeoutMs: parsePositiveInteger(
			environment.CHAT_WORKER_TIMEOUT_MS,
			DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.workerTimeoutMs,
			'CHAT_WORKER_TIMEOUT_MS'
		),
		drainTimeoutMs: parsePositiveInteger(
			environment.CHAT_DRAIN_TIMEOUT_MS,
			DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.drainTimeoutMs,
			'CHAT_DRAIN_TIMEOUT_MS'
		),
		// Turn-lease timing is one policy with the database's thresholds
		// (AGENTIC_CHAT_TURN_LEASE_POLICY_V1), not deployment configuration.
		// CHAT_STALLED_TIMEOUT_MS is retired: the database decides when a turn is dead.
		leaseRenewIntervalMs: DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.leaseRenewIntervalMs,
		leaseSelfFenceAfterMs: DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.leaseSelfFenceAfterMs,
		recoverySweepIntervalMs: DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG.recoverySweepIntervalMs
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
	// Skips the tool-free closing pass after a simple direct write that fully
	// landed (one billed pass, ~2–5 s). Off until the gate judges the copy.
	const directWriteReceiptTextEnabled = parseBoolean(
		environment.AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT,
		false,
		'AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT'
	);
	// Jev opening-pass tool narrowing (docs/research/jev-tool-selection-2026-09-18).
	// On by default: 0/64 eval misses, fail-open to the full surface, and the one-shot
	// surface repair restores omitted tools. `shadow` logs the selection without
	// changing the turn; `off` is the kill switch.
	const jevToolSelection = parseJevToolSelection(environment.AGENTIC_CHAT_JEV_TOOL_SELECTION);
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
	const liveTextPreviewEnabled = parseBoolean(
		environment.AGENTIC_CHAT_LIVE_TEXT_PREVIEW,
		false,
		'AGENTIC_CHAT_LIVE_TEXT_PREVIEW'
	);
	validateAgenticChatDrainTimeout(consumer.drainTimeoutMs);

	return {
		enabled: true,
		workflowPrototypeUserIds: parseChatWorkflowPrototypeUsers(
			environment.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS
		),
		workflowV4PreparationEnabled,
		workflowV4ExecutionEnabled,
		specialistWorkflowsEnabled,
		documentReadToolsEnabled,
		publishedSpecialistsEnabled,
		projectReviewV2Enabled,
		projectReviewV3Enabled,
		documentEvidenceHandoffEnabled,
		contextFinderEnabled,
		workflowReasoning,
		contextFinderChat,
		contextFinderGlobal,
		contextFinderChatUserIds,
		liveVisionEnabled,
		consumptionBillingEnabled,
		consumer,
		publisher,
		providerBudgetMs,
		maxProviderRounds,
		mutationBatchLaneEnabled,
		directWriteReceiptTextEnabled,
		jevToolSelection,
		maxToolCalls,
		maxToolConcurrency,
		liveTextPreviewEnabled,
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

const WORKFLOW_STEP_KEYS = ['planner', 'project_analyst', 'risk_reviewer', 'editor'] as const;

/** `all`, or a comma list of workflow steps whose hidden reasoning is switched off. */
function parseWorkflowReasoningOffSteps(
	value: string | undefined
): AgenticChatWorkflowReasoningPolicyV1 {
	const trimmed = value?.trim() ?? '';
	if (!trimmed) return Object.freeze({});
	const steps = trimmed === 'all' ? WORKFLOW_STEP_KEYS : trimmed.split(',').map((s) => s.trim());
	const policy: Partial<Record<(typeof WORKFLOW_STEP_KEYS)[number], 'none'>> = {};
	for (const step of steps) {
		if (!(WORKFLOW_STEP_KEYS as readonly string[]).includes(step))
			throw new Error(
				'AGENTIC_CHAT_WORKFLOW_REASONING_OFF_STEPS must be all or a comma list of planner, project_analyst, risk_reviewer, editor'
			);
		policy[step as (typeof WORKFLOW_STEP_KEYS)[number]] = 'none';
	}
	return Object.freeze(policy);
}

function parseContextFinderChat(value: string | undefined, name: string): ChatContextFinderMode {
	const mode = value?.trim() || 'off';
	if (mode === 'off' || mode === 'shadow' || mode === 'chips' || mode === 'on') return mode;
	throw new Error(`${name} must be exactly off, shadow, chips, or on`);
}

function parseJevToolSelection(value: string | undefined): 'off' | JevToolSelectionMode {
	const normalized = value?.trim() ?? '';
	if (normalized === '') return 'on';
	if (normalized === 'off' || normalized === 'shadow' || normalized === 'on') return normalized;
	throw new Error('AGENTIC_CHAT_JEV_TOOL_SELECTION must be exactly off, shadow, or on');
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
		responseHeadersTimeoutMs:
			model === PARETO_MODEL
				? PARETO_RESPONSE_HEADERS_TIMEOUT_MS
				: DEFAULT_AGENTIC_CHAT_RESPONSE_HEADERS_TIMEOUT_MS,
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
