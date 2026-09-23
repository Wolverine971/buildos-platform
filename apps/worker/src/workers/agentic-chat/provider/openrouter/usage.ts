// apps/worker/src/workers/agentic-chat/provider/openrouter/usage.ts
// Pure usage normalization, cost resolution, and the stable usage-log identity.
import { resolveModelPricingProfile } from '@buildos/smart-llm';
import { stableUuidFromSeed } from '../../shared/identity-hash';
import type { AgenticChatProviderPassRoleV1 } from '../contracts';
import type { AgenticChatProviderUsageObservationV1, ProviderUsage } from './types';
import {
	canonicalProviderAttempt,
	canonicalProviderPassRole,
	finiteNonnegativeNumber,
	nonnegativeInteger,
	requireRecord
} from './canonical';
import { AgenticChatProviderNetworkError } from './errors';

const USAGE_LOG_IDENTITY_VERSION = 'agentic_chat_provider_usage_v2';

export function normalizeProviderUsage(value: unknown): ProviderUsage | null {
	if (value === null || value === undefined) return null;
	const usage = requireRecord(value, 'provider usage');
	const promptTokens = usage.prompt_tokens ?? usage.promptTokens;
	const completionTokens = usage.completion_tokens ?? usage.completionTokens;
	const totalTokens = usage.total_tokens ?? usage.totalTokens;
	const promptTokenDetails = optionalRecord(
		usage.prompt_tokens_details ?? usage.promptTokensDetails,
		'provider prompt-token details'
	);
	const completionTokenDetails = optionalRecord(
		usage.completion_tokens_details ?? usage.completionTokensDetails,
		'provider completion-token details'
	);
	const costDetails = optionalRecord(
		usage.cost_details ?? usage.costDetails,
		'provider cost details'
	);
	if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
		return null;
	}
	if (
		!nonnegativeInteger(promptTokens) ||
		!nonnegativeInteger(completionTokens) ||
		!nonnegativeInteger(totalTokens) ||
		totalTokens !== promptTokens + completionTokens
	) {
		throw new AgenticChatProviderNetworkError(
			'Agentic Chat provider usage payload is malformed',
			false
		);
	}
	const cachedPromptTokens = optionalNonnegativeInteger(
		promptTokenDetails?.cached_tokens ?? promptTokenDetails?.cachedTokens,
		'provider cached prompt tokens'
	);
	return {
		promptTokens,
		completionTokens,
		totalTokens,
		reasoningTokens: optionalNonnegativeInteger(
			completionTokenDetails?.reasoning_tokens ?? completionTokenDetails?.reasoningTokens,
			'provider reasoning tokens'
		),
		cachedPromptTokens,
		cacheWriteTokens: optionalNonnegativeInteger(
			promptTokenDetails?.cache_write_tokens ?? promptTokenDetails?.cacheWriteTokens,
			'provider cache-write tokens'
		),
		cacheStatus: describePromptCacheStatus(promptTokens, cachedPromptTokens),
		cost: finiteNonnegativeNumber(usage.cost) ? usage.cost : null,
		byok: optionalBoolean(usage.is_byok ?? usage.isByok, 'provider BYOK flag'),
		upstreamInferenceCost: optionalNonnegativeNumber(
			costDetails?.upstream_inference_cost ?? costDetails?.upstreamInferenceCost,
			'provider upstream inference cost'
		),
		upstreamPromptCost: optionalNonnegativeNumber(
			costDetails?.upstream_inference_prompt_cost ?? costDetails?.upstreamInferencePromptCost,
			'provider upstream prompt cost'
		),
		upstreamCompletionCost: optionalNonnegativeNumber(
			costDetails?.upstream_inference_completions_cost ??
				costDetails?.upstreamInferenceCompletionsCost,
			'provider upstream completion cost'
		)
	};
}

export function createStableAgenticChatProviderUsageLogIdV1(input: {
	turnRunId: string;
	executionGeneration: number;
	logicalProviderRound: number;
	passRole?: AgenticChatProviderPassRoleV1;
	providerAttempt?: number;
	routeId: string;
}): string {
	const providerAttempt = canonicalProviderAttempt(input.providerAttempt);
	const passRole = canonicalProviderPassRole(input.passRole);
	if (
		!Number.isSafeInteger(input.executionGeneration) ||
		input.executionGeneration < 1 ||
		!Number.isSafeInteger(input.logicalProviderRound) ||
		input.logicalProviderRound < 1 ||
		!input.routeId ||
		input.routeId !== input.routeId.trim()
	) {
		throw new Error('Invalid Agentic Chat provider usage identity');
	}
	return stableUuidFromSeed(
		`${USAGE_LOG_IDENTITY_VERSION}:${input.turnRunId}:${input.executionGeneration}:` +
			`${input.logicalProviderRound}:${passRole}:${input.routeId}` +
			(providerAttempt === 1 ? '' : `:attempt:${providerAttempt}`)
	);
}

export function resolveProviderUsageCosts(input: {
	usage: ProviderUsage | null;
	modelRequested: string | null;
	modelUsed: string | null;
	promptTokens: number;
	completionTokens: number;
}): {
	inputCost: number;
	outputCost: number;
	source: AgenticChatProviderUsageObservationV1['costSource'];
} {
	const pricing = resolveModelPricingProfile(input.modelUsed ?? 'unknown', [
		input.modelRequested ?? 'unknown'
	])?.profile;
	const estimatedInputCost = pricing ? (input.promptTokens / 1_000_000) * pricing.cost : 0;
	const estimatedOutputCost = pricing
		? (input.completionTokens / 1_000_000) * pricing.outputCost
		: 0;
	if (input.usage?.cost === undefined || input.usage.cost === null) {
		return {
			inputCost: estimatedInputCost,
			outputCost: estimatedOutputCost,
			source: pricing ? 'catalog_estimate' : 'unknown'
		};
	}
	if (input.usage.upstreamPromptCost !== null || input.usage.upstreamCompletionCost !== null) {
		return {
			inputCost: input.usage.upstreamPromptCost ?? 0,
			outputCost: input.usage.upstreamCompletionCost ?? 0,
			source: 'provider_reported'
		};
	}
	const estimatedTotalCost = estimatedInputCost + estimatedOutputCost;
	if (estimatedTotalCost > 0) {
		const scale = input.usage.cost / estimatedTotalCost;
		return {
			inputCost: estimatedInputCost * scale,
			outputCost: estimatedOutputCost * scale,
			source: 'provider_reported'
		};
	}
	return { inputCost: 0, outputCost: 0, source: 'provider_reported' };
}

function describePromptCacheStatus(promptTokens: number, cachedPromptTokens: number): string {
	if (cachedPromptTokens <= 0) return 'no cache';
	if (promptTokens <= 0) return `cached ${cachedPromptTokens} prompt tokens`;
	const hitRate = Math.round((cachedPromptTokens / promptTokens) * 1_000) / 10;
	return `${hitRate}% cache hit`;
}

function optionalRecord(value: unknown, label: string): Record<string, unknown> | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'object' || Array.isArray(value)) {
		throw new AgenticChatProviderNetworkError(`${label} is malformed`, false);
	}
	return value as Record<string, unknown>;
}

function optionalNonnegativeInteger(value: unknown, label: string): number {
	if (value === undefined || value === null) return 0;
	if (!nonnegativeInteger(value)) {
		throw new AgenticChatProviderNetworkError(`${label} is malformed`, false);
	}
	return value;
}

function optionalNonnegativeNumber(value: unknown, label: string): number | null {
	if (value === undefined || value === null) return null;
	if (!finiteNonnegativeNumber(value)) {
		throw new AgenticChatProviderNetworkError(`${label} is malformed`, false);
	}
	return value;
}

function optionalBoolean(value: unknown, label: string): boolean | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'boolean') {
		throw new AgenticChatProviderNetworkError(`${label} is malformed`, false);
	}
	return value;
}
