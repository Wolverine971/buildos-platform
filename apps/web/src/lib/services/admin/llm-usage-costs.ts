// apps/web/src/lib/services/admin/llm-usage-costs.ts
import { resolveModelPricingProfile } from '@buildos/smart-llm';

type UsageCostRow = {
	model_used?: string | null;
	model_requested?: string | null;
	prompt_tokens?: number | string | null;
	completion_tokens?: number | string | null;
	input_cost_usd?: number | string | null;
	output_cost_usd?: number | string | null;
	total_cost_usd?: number | string | null;
	metadata?: unknown;
};

const numberValue = (value: unknown): number => {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};

const objectValue = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

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
