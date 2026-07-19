// packages/smart-llm/src/spend-guard.ts
import { resolveModelPricingProfile } from './model-config';

const DEFAULT_SAFETY_MULTIPLIER = 1.25;
const DEFAULT_MIN_OUTPUT_TOKENS = 128;
const PROMPT_TOKEN_OVERHEAD = 1_024;

export interface JSONRequestSpendPlan {
	model: string;
	maxTokens: number;
	estimatedInputTokens: number;
	reservedCostUsd: number;
	providerMaxPrice: {
		prompt: number;
		completion: number;
	};
}

export interface PlanJSONRequestSpendOptions {
	models: string[];
	systemPrompt: string;
	userPrompt: string;
	requestedMaxTokens: number;
	maxCostUsd: number;
	minOutputTokens?: number;
	safetyMultiplier?: number;
}

function finitePositive(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * This intentionally estimates one token per UTF-8 byte, plus fixed overhead.
 * It is much more conservative than the usual chars/4 heuristic and gives the
 * output-token cap room for provider-added/special tokens.
 */
export function estimatePromptTokensForReservation(
	systemPrompt: string,
	userPrompt: string
): number {
	return (
		new TextEncoder().encode(`${systemPrompt}\n${userPrompt}`).byteLength +
		PROMPT_TOKEN_OVERHEAD
	);
}

/**
 * Select one catalog-priced model and cap its output so the estimated
 * input+maximum-output charge, including a safety multiplier, fits inside the
 * caller's per-attempt reservation. The service uses this plan with no model
 * fallback and no parse retry.
 */
export function planJSONRequestSpend(options: PlanJSONRequestSpendOptions): JSONRequestSpendPlan {
	const maxCostUsd = finitePositive(options.maxCostUsd, 0);
	if (maxCostUsd <= 0) {
		throw new Error('A positive maxCostUsd is required for a budgeted LLM request.');
	}

	const requestedMaxTokens = Math.max(1, Math.floor(options.requestedMaxTokens));
	const minOutputTokens = Math.max(
		1,
		Math.min(
			requestedMaxTokens,
			Math.floor(finitePositive(options.minOutputTokens, DEFAULT_MIN_OUTPUT_TOKENS))
		)
	);
	const safetyMultiplier = Math.max(
		1,
		finitePositive(options.safetyMultiplier, DEFAULT_SAFETY_MULTIPLIER)
	);
	const estimatedInputTokens = estimatePromptTokensForReservation(
		options.systemPrompt,
		options.userPrompt
	);

	for (const candidate of options.models) {
		const pricing = resolveModelPricingProfile(candidate);
		if (!pricing) continue;
		const inputRate = pricing.profile.cost;
		const outputRate = pricing.profile.outputCost;
		if (!(inputRate >= 0) || !(outputRate > 0)) continue;

		const preSafetyBudgetUsd = maxCostUsd / safetyMultiplier;
		const inputCostUsd = (estimatedInputTokens / 1_000_000) * inputRate;
		const outputBudgetUsd = preSafetyBudgetUsd - inputCostUsd;
		const affordableOutputTokens = Math.floor((outputBudgetUsd / outputRate) * 1_000_000);
		const maxTokens = Math.min(requestedMaxTokens, affordableOutputTokens);
		if (maxTokens < minOutputTokens) continue;

		const reservedCostUsd =
			((estimatedInputTokens * inputRate + maxTokens * outputRate) / 1_000_000) *
			safetyMultiplier;
		return {
			model: pricing.modelId,
			maxTokens,
			estimatedInputTokens,
			reservedCostUsd,
			providerMaxPrice: {
				prompt: inputRate,
				completion: outputRate
			}
		};
	}

	throw new Error(
		`No priced model can satisfy the $${maxCostUsd.toFixed(4)} request reservation.`
	);
}
