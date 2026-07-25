export interface ModelUsageEvent {
	model: string;
	provider: string | null;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	totalCostUsd: number;
	billingDisposition: string | null;
}
