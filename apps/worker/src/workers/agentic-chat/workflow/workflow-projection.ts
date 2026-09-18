// apps/worker/src/workers/agentic-chat/workflow/workflow-projection.ts
import {
	AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION,
	AGENTIC_CHAT_WORKFLOW_PROGRESS_EVENT_TYPE,
	AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION,
	type AgenticChatWorkflowPhaseV1,
	type AgenticChatWorkflowProjectionV1,
	type AgenticChatWorkflowResultQualityV1,
	type AgenticChatWorkflowStepKeyV1,
	type AgenticChatWorkflowStepStatusV1,
	type AgenticChatWorkflowTerminalOutcomeV1,
	type JsonObject
} from '@buildos/shared-types';

/**
 * Builders for the frozen `AgenticChatWorkflowProjectionV1` (contract section 9).
 * Tasker 86 writes the `preparing`, `assessing`, and preparation-terminal
 * projections; Tasker 87 extends the same builder for plan/step/synthesis
 * checkpoints so every workflow write carries one projection shape.
 */

/** The existing ordinary stream projection version; kept so current UI surfaces read activity. */
const UI_PROJECTION_VERSION = 'agentic_chat_ui_projection_v1';

export const AGENTIC_CHAT_WORKFLOW_STEP_ORDER_V1: readonly AgenticChatWorkflowStepKeyV1[] = [
	'planner',
	'project_analyst',
	'risk_reviewer',
	'editor'
];

export const AGENTIC_CHAT_WORKFLOW_STEP_LABELS_V1: Readonly<
	Record<AgenticChatWorkflowStepKeyV1, string>
> = {
	planner: 'Plan the review',
	project_analyst: 'Project analyst',
	risk_reviewer: 'Risk and alternatives reviewer',
	editor: 'Combine recommendations'
};

export type AgenticChatWorkflowDurableStepV1 = {
	key: AgenticChatWorkflowStepKeyV1;
	status: AgenticChatWorkflowStepStatusV1;
	quality: AgenticChatWorkflowResultQualityV1 | null;
	attemptsUsed: number;
	failureCode: string | null;
};

export type AgenticChatWorkflowProjectionInputV1 = {
	phase: AgenticChatWorkflowPhaseV1;
	terminalOutcome?: AgenticChatWorkflowTerminalOutcomeV1 | null;
	/** Durable step rows; missing keys render as never-started `pending` steps. */
	steps?: readonly AgenticChatWorkflowDurableStepV1[];
	executionState?: AgenticChatWorkflowProjectionV1['transport']['executionState'];
	/** A user-readable statement of what this review could not cover, or why it stopped. */
	coverageGap?: string | null;
};

export function buildAgenticChatWorkflowProjectionV1(
	input: AgenticChatWorkflowProjectionInputV1
): AgenticChatWorkflowProjectionV1 {
	const durable = new Map((input.steps ?? []).map((step) => [step.key, step]));
	return {
		version: AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION,
		workflowVersion: AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION,
		reviewIntent: 'project_review',
		phase: input.phase,
		terminalOutcome: input.terminalOutcome ?? null,
		steps: AGENTIC_CHAT_WORKFLOW_STEP_ORDER_V1.map((key) => {
			const step = durable.get(key);
			return {
				key,
				label: AGENTIC_CHAT_WORKFLOW_STEP_LABELS_V1[key],
				status: step?.status ?? 'pending',
				quality: step?.quality ?? null,
				attemptsUsed: step?.attemptsUsed ?? 0,
				acceptedFinding: null,
				failureCode: step?.failureCode ?? null
			};
		}),
		answer: {
			answerId: null,
			status: 'not_started',
			durableBytes: 0,
			textSha256: null,
			editorStepAttemptId: null,
			acceptedAt: null
		},
		transport: {
			executionState:
				input.executionState ?? (input.phase === 'finished' ? 'terminal' : 'active'),
			// Reconciliation derives ages from database time; the writer never guesses one.
			lastDurableProgressAt: null,
			providerActivity: { state: 'idle', lastObservedAt: null },
			delivery: { state: 'connected', lastObservedAt: null }
		},
		coverageGap: input.coverageGap ?? null
	};
}

/**
 * The stream projection stored by every workflow checkpoint. `workflow` is the
 * frozen UI read model; the ordinary activity line keeps existing surfaces truthful.
 */
export function buildAgenticChatWorkflowStreamProjectionV1(
	workflow: AgenticChatWorkflowProjectionV1,
	currentActivity: string
): JsonObject {
	return {
		version: UI_PROJECTION_VERSION,
		current_activity: currentActivity,
		semantic_events: [],
		workflow: workflow as unknown as JsonObject
	};
}

export function buildAgenticChatWorkflowProgressEventV1(
	workflow: AgenticChatWorkflowProjectionV1
): JsonObject {
	return {
		type: AGENTIC_CHAT_WORKFLOW_PROGRESS_EVENT_TYPE,
		workflow: workflow as unknown as JsonObject
	};
}
