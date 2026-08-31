// apps/worker/src/workers/agent-run/agentRunPolicy.ts
import type { AgentRunMutationMode, Database } from '@buildos/shared-types';
import type { JSONProfile, ReasoningOptions } from '@buildos/smart-llm';

export type AgentRunEffort = 'standard' | 'deep';

export type AgentRunModelPolicy = {
	profile: JSONProfile;
	reasoning?: ReasoningOptions;
	defaultWallClockMs: number;
};

const STANDARD_WALL_CLOCK_MS = 5 * 60 * 1000;
const DEEP_WALL_CLOCK_MS = 10 * 60 * 1000;

export type AgentRunCancellationSource = 'run' | 'parent' | null;
type AgentRunStatus = Database['public']['Enums']['agent_run_status'];

export const REVIEW_STAGE_NO_CHANGES_ERROR = 'review_run_no_proposed_changes';
export const REVIEW_STAGE_SUBMISSION_REPAIR_LIMIT = 1;

export function buildReviewStageSystemRules(params: {
	mutationMode: AgentRunMutationMode;
	hasWriteOps: boolean;
}): string[] {
	if (params.mutationMode !== 'stage' || !params.hasWriteOps) return [];

	return [
		'- This is a review-required staging run. Every available write operation is intercepted as a ProposedChange and does not mutate the live entity.',
		'- To create the durable reviewable change set, call the relevant create, update, archive, or delete operation once for every proposed entity change. Describing proposed JSON in submit_result does not stage anything.',
		'- Do not submit_result until the required staged write operations have succeeded. Then summarize the durable proposal; never claim a change was staged only because you described it.'
	];
}

export function enforceReviewStageCompletion(params: {
	mutationMode: AgentRunMutationMode;
	proposedChangeCount: number;
	status: AgentRunStatus;
	result: Record<string, unknown>;
}): { status: AgentRunStatus; result: Record<string, unknown> } {
	if (
		params.mutationMode !== 'stage' ||
		params.proposedChangeCount > 0 ||
		params.status !== 'completed'
	) {
		return { status: params.status, result: params.result };
	}

	return {
		status: 'partial',
		result: {
			...params.result,
			reported_answer: params.result.answer ?? null,
			summary:
				'No durable review proposal was created because the agent did not call any staged write operations.',
			answer: 'The run analyzed the request but did not stage a reviewable change set. Retry after ensuring every proposed entity change is expressed through its write operation.',
			error: REVIEW_STAGE_NO_CHANGES_ERROR
		}
	};
}

export function shouldRepairReviewStageSubmission(params: {
	mutationMode: AgentRunMutationMode;
	proposedChangeCount: number;
	status: AgentRunStatus;
	repairAttempts: number;
	forceSubmitResult: boolean;
}): boolean {
	return Boolean(
		params.mutationMode === 'stage' &&
			params.proposedChangeCount === 0 &&
			params.status === 'completed' &&
			params.repairAttempts < REVIEW_STAGE_SUBMISSION_REPAIR_LIMIT &&
			!params.forceSubmitResult
	);
}

export function resolveAgentRunCancellationSource(params: {
	pendingSignalKinds: readonly string[];
	parentRunId: string | null | undefined;
	parentCancelSignalCount: number;
	parentStatus?: string | null;
}): AgentRunCancellationSource {
	if (params.pendingSignalKinds.includes('cancel')) return 'run';
	if (
		params.parentRunId &&
		(params.parentCancelSignalCount > 0 ||
			params.parentStatus === 'cancelled' ||
			params.parentStatus === 'failed' ||
			params.parentStatus === 'completed' ||
			params.parentStatus === 'partial')
	) {
		return 'parent';
	}
	return null;
}

/**
 * Keep model quality routing independent from orchestration shape. A future
 * deep-research template can use this policy for its planner/synthesizer while
 * cheaper child researchers remain on the standard lane.
 */
export function resolveAgentRunModelPolicy(effort: unknown): AgentRunModelPolicy {
	if (effort === 'deep') {
		return {
			profile: 'powerful',
			reasoning: { effort: 'high', exclude: false },
			defaultWallClockMs: DEEP_WALL_CLOCK_MS
		};
	}

	return {
		profile: 'balanced',
		defaultWallClockMs: STANDARD_WALL_CLOCK_MS
	};
}
