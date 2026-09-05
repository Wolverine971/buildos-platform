// apps/web/src/lib/services/admin/llm-usage-costs.ts
import { resolveModelPricingProfile } from '@buildos/smart-llm';
import { numberValue } from './analytics-primitives';

type UsageCostRow = {
	model_used?: string | null;
	model_requested?: string | null;
	prompt_tokens?: number | string | null;
	completion_tokens?: number | string | null;
	input_cost_usd?: number | string | null;
	output_cost_usd?: number | string | null;
	total_cost_usd?: number | string | null;
	openrouter_usage_cost_usd?: number | string | null;
	metadata?: unknown;
};

const objectValue = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const hasNumericValue = (value: unknown): boolean => {
	if (typeof value === 'number') return Number.isFinite(value);
	if (typeof value === 'string' && value.trim().length > 0) {
		return Number.isFinite(Number(value));
	}
	return false;
};

export function resolveUsageLogCostBreakdown(row: UsageCostRow): {
	inputCost: number;
	outputCost: number;
	totalCost: number;
	pricingModel: string | null;
	wasEstimated: boolean;
} {
	const promptTokens = numberValue(row.prompt_tokens);
	const completionTokens = numberValue(row.completion_tokens);
	let inputCost = numberValue(row.input_cost_usd);
	let outputCost = numberValue(row.output_cost_usd);
	let totalCost = numberValue(row.total_cost_usd);
	if (hasNumericValue(row.openrouter_usage_cost_usd)) {
		totalCost = numberValue(row.openrouter_usage_cost_usd);
	}
	let wasEstimated = false;

	const metadata = objectValue(row.metadata);
	const metadataModels = Array.isArray(metadata.modelsAttempted)
		? metadata.modelsAttempted.filter((model): model is string => typeof model === 'string')
		: [];
	const pricing = resolveModelPricingProfile(row.model_used, [
		row.model_requested,
		typeof metadata.requestedModel === 'string' ? metadata.requestedModel : null,
		...metadataModels
	]);
	const profile = pricing?.profile;
	const hasReportedTotal =
		hasNumericValue(row.openrouter_usage_cost_usd) ||
		(metadata.costSource === 'provider_reported' && hasNumericValue(row.total_cost_usd));
	// A provider receipt of zero is a measured value, not a missing price.
	// In particular, don't replace a fully cached/free call with catalog rates.
	if (hasReportedTotal && totalCost === 0) {
		return {
			inputCost: 0,
			outputCost: 0,
			totalCost: 0,
			pricingModel: pricing?.modelId ?? null,
			wasEstimated: false
		};
	}

	if (profile) {
		const estimatedInput = promptTokens > 0 ? (promptTokens / 1_000_000) * profile.cost : 0;
		const estimatedOutput =
			completionTokens > 0 ? (completionTokens / 1_000_000) * profile.outputCost : 0;

		if (inputCost === 0 && estimatedInput > 0) {
			inputCost = estimatedInput;
			wasEstimated = true;
		}
		if (outputCost === 0 && estimatedOutput > 0) {
			outputCost = estimatedOutput;
			wasEstimated = true;
		}
	}

	if (totalCost === 0 && inputCost + outputCost > 0) {
		totalCost = inputCost + outputCost;
		wasEstimated = true;
	}

	return {
		inputCost,
		outputCost,
		totalCost,
		pricingModel: pricing?.modelId ?? null,
		wasEstimated
	};
}
