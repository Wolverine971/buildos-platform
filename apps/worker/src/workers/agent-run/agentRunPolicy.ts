// apps/worker/src/workers/agent-run/agentRunPolicy.ts
import type { AgentRunMutationMode, Database, ProposedChange } from '@buildos/shared-types';
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

const REPLACEABLE_STAGED_CREATE_OPS = new Set(['onto.task.create', 'onto.document.create']);

function stagedCreateIdentity(change: Omit<ProposedChange, 'id'> | ProposedChange): string | null {
	if (change.action !== 'create' || !REPLACEABLE_STAGED_CREATE_OPS.has(change.op)) return null;
	if (!change.after || typeof change.after !== 'object' || Array.isArray(change.after))
		return null;
	const after = change.after as Record<string, unknown>;
	const projectId =
		typeof after.project_id === 'string' ? after.project_id.trim().toLowerCase() : '';
	const title = typeof after.title === 'string' ? after.title.trim().toLowerCase() : '';
	if (!projectId || !title) return null;
	return `${change.op}:${projectId}:${title}`;
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
	if (left === right) return true;
	if (Array.isArray(left) || Array.isArray(right)) {
		return (
			Array.isArray(left) &&
			Array.isArray(right) &&
			left.length === right.length &&
			left.every((value, index) => jsonValuesEqual(value, right[index]))
		);
	}
	if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
	const leftRecord = left as Record<string, unknown>;
	const rightRecord = right as Record<string, unknown>;
	const leftKeys = Object.keys(leftRecord);
	const rightKeys = Object.keys(rightRecord);
	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every(
			(key) =>
				Object.prototype.hasOwnProperty.call(rightRecord, key) &&
				jsonValuesEqual(leftRecord[key], rightRecord[key])
		)
	);
}

function isStrictStagedCreateRefinement(
	existing: ProposedChange,
	candidate: Omit<ProposedChange, 'id'>
): boolean {
	const existingAfter = existing.after as Record<string, unknown>;
	const candidateAfter = candidate.after as Record<string, unknown>;
	const existingKeys = Object.keys(existingAfter);
	const candidateKeys = Object.keys(candidateAfter);
	if (candidateKeys.length <= existingKeys.length) return false;
	return existingKeys.every((key) => {
		if (key === 'project_id' || key === 'title') return true;
		return (
			Object.prototype.hasOwnProperty.call(candidateAfter, key) &&
			jsonValuesEqual(existingAfter[key], candidateAfter[key])
		);
	});
}

export function findReplaceableStagedCreateIndex(
	existing: readonly ProposedChange[],
	candidate: Omit<ProposedChange, 'id'>
): number {
	const identity = stagedCreateIdentity(candidate);
	if (!identity) return -1;
	return existing.findIndex(
		(change) =>
			stagedCreateIdentity(change) === identity &&
			isStrictStagedCreateRefinement(change, candidate)
	);
}

export function buildReviewStageSystemRules(params: {
	mutationMode: AgentRunMutationMode;
	hasWriteOps: boolean;
}): string[] {
	if (params.mutationMode !== 'stage' || !params.hasWriteOps) return [];

	return [
		'- This is a review-required staging run. Every available write operation is intercepted as a ProposedChange and does not mutate the live entity.',
		'- To create the durable reviewable change set, call the relevant create, update, archive, or delete operation once for every proposed entity change. Describing proposed JSON in submit_result does not stage anything.',
		'- Staged creates do not receive live entity UUIDs before approval. Never invent UUIDs or placeholders and never use onto.edge.link to connect a staged create. Put known relationships directly on the create call: task plan_id, goal_id, and supporting_milestone_id; document parent_document_id.',
		'- Validate each create completely before staging it. If a successful task/document create omitted a required relationship, repeat that same op with the same project_id and title, preserve every prior field, and add the omitted canonical relationship fields; that strict refinement replaces the earlier draft instead of creating a duplicate.',
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
