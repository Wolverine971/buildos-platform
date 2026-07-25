// packages/agent-orchestrator/src/contracts/model-usage.ts
/**
 * Evaluation roles a paid call can occupy. Recording the role beside the observed model lets a
 * harness verify each pin per role instead of accepting any pin for any call, which is what
 * ADR 0001 actually promises.
 */
export type ModelUsageRole =
	| 'route_primary'
	| 'route_reviewer'
	| 'librarian'
	| 'researcher'
	| 'transition'
	| 'synthesis';

export interface ModelUsageEvent {
	model: string;
	provider: string | null;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	totalCostUsd: number;
	billingDisposition: string | null;
	/** Null only for legacy reports generated before role tagging existed. */
	role?: ModelUsageRole | null;
}
