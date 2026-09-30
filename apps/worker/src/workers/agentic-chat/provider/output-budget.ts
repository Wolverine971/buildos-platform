// apps/worker/src/workers/agentic-chat/provider/output-budget.ts
// Structured output-budget policy. Reasoning bytes are not token counts.
import type {
	AgenticChatOutputBudgetSignal,
	AgenticChatProviderStepV1,
	AgenticChatTurnProviderRequestV1,
	AgenticChatTurnProviderClientRequestV1
} from './contracts';
import { createStableAgenticChatReadToolTransitionIdV1 } from '../tools/read-tool-identity';

export const ACTING_OUTPUT_TOKENS = 12_000;
export const MUTATIONS_PER_STAGE = 8;
export const OUTPUT_RECOVERY_TIMEOUT_MS = 45_000;
export const OUTPUT_RECOVERY_FIRST_PROGRESS_MS = 15_000;

export function buildOutputBudgetRecoveryProgress(
	request: AgenticChatTurnProviderRequestV1,
	providerAttempt: number
): AgenticChatProviderStepV1 {
	const activity =
		request.toolChoice === 'none'
			? 'Finishing the cleanup summary...'
			: 'Splitting this cleanup into smaller batches...';
	return {
		type: 'semantic',
		phase: 'stream',
		eventType: 'agent_state',
		transitionId: createStableAgenticChatReadToolTransitionIdV1({
			turnRunId: request.turnRunId,
			providerToolCallId: `output-recovery:${request.logicalProviderRound}:${providerAttempt}`,
			stage: 'planning'
		}),
		currentActivity: activity,
		eventPayload: {
			type: 'agent_state',
			state: 'thinking',
			contextType: request.contextType,
			details: activity,
			activity_visibility: 'activity_log',
			output_budget_recovery: { provider_attempt: providerAttempt }
		}
	};
}

export function isActingOutputPass(
	input: Pick<AgenticChatTurnProviderClientRequestV1, 'passRole'>
) {
	return !input.passRole || ['acting', 'repair', 'final_response'].includes(input.passRole);
}

export function outputBudgetSignal(
	limit: number,
	finishReason: string,
	usage: { completionTokens: number; reasoningTokens?: number } | null
): AgenticChatOutputBudgetSignal | undefined {
	const completion = usage?.completionTokens ?? null;
	const reasoning = usage?.reasoningTokens ?? null;
	const exhausted = finishReason === 'length' || (completion !== null && completion >= limit);
	const pressure =
		completion !== null &&
		(completion >= Math.min(10_000, (limit * 5) / 6) ||
			(reasoning !== null && reasoning >= 6_000 && reasoning >= completion * 0.8));
	return exhausted || pressure
		? {
				kind: exhausted ? 'exhausted' : 'pressure',
				limit,
				completionTokens: completion,
				reasoningTokens: reasoning
			}
		: undefined;
}

/** Preserve unavailable reasoning usage instead of presenting it as a measured zero. */
export function reportedReasoningTokens(usage: unknown): number | undefined {
	if (!usage || typeof usage !== 'object') return undefined;
	const record = usage as Record<string, unknown>;
	const details = record.completion_tokens_details ?? record.completionTokensDetails;
	if (!details || typeof details !== 'object') return undefined;
	const fields = details as Record<string, unknown>;
	const value = fields.reasoning_tokens ?? fields.reasoningTokens;
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
		? value
		: undefined;
}

export function outputBudgetInstruction(limit: number): string {
	return `Output budget: this pass has at most ${limit} completion tokens, shared by reasoning, text, and tool arguments. Propose at most ${MUTATIONS_PER_STAGE} independent mutations in this stage, fewer for large document bodies. Preserve the whole user commission across stages; every stage is independently reviewed. Wait for returned IDs before dependent calls. Reuse complete reads already in the conversation; read only missing facts. Never substitute completing work for archiving it.`;
}
