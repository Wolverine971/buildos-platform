// apps/worker/src/workers/agentic-chat/workflow/workflow-projection.ts
import {
	AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION,
	AGENTIC_CHAT_WORKFLOW_PROGRESS_EVENT_TYPE,
	AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION,
	type AgenticChatWorkflowPhaseV1,
	type AgenticChatWorkflowProjectionV1,
	type AgenticChatWorkflowRoleReportV1,
	type AgenticChatWorkflowStepKeyV1,
	type JsonObject
} from '@buildos/shared-types';
import { fromDurableWorkflowRoleReport, renderWorkflowRoleReport } from './role-report';
import type {
	AgenticChatWorkflowCheckpointV1,
	AgenticChatWorkflowRunStateV1
} from './workflow-store';

/** Fixed step order and labels the ordinary-chat progress card renders (Tasker 88). */
export const AGENTIC_CHAT_WORKFLOW_STEP_LABELS_V1: Readonly<
	Record<AgenticChatWorkflowStepKeyV1, string>
> = Object.freeze({
	planner: 'Plan the review',
	project_analyst: 'Project analyst',
	risk_reviewer: 'Risk and alternatives reviewer',
	editor: 'Combine recommendations'
});

const STEP_ORDER: readonly AgenticChatWorkflowStepKeyV1[] = [
	'planner',
	'project_analyst',
	'risk_reviewer',
	'editor'
];

export type AgenticChatWorkflowProviderActivityV1 =
	AgenticChatWorkflowProjectionV1['transport']['providerActivity']['state'];

/**
 * Builds the privacy-safe projection from durable truth. It never contains prompts,
 * provider receipts, pricing, cost, processing tokens, or settlement tokens. Delivery
 * and progress ages belong to the server reconciliation read model, so the worker
 * leaves them unset rather than guessing.
 */
export function buildAgenticChatWorkflowProjectionV1(
	state: AgenticChatWorkflowRunStateV1,
	options: {
		phase: AgenticChatWorkflowPhaseV1;
		providerActivity: AgenticChatWorkflowProviderActivityV1;
		observedAt: string;
	}
): AgenticChatWorkflowProjectionV1 {
	const steps = STEP_ORDER.map((key) => {
		const step = state.steps[key];
		const report =
			key === 'project_analyst' || key === 'risk_reviewer'
				? acceptedReport(state, key)
				: null;
		return {
			key,
			label: AGENTIC_CHAT_WORKFLOW_STEP_LABELS_V1[key],
			status: step?.status ?? 'pending',
			quality: step?.status === 'accepted' ? step.quality : null,
			attemptsUsed: step?.attemptsUsed ?? 0,
			acceptedFinding: report
				? {
						summary: report.summary,
						evidence: (report.findings[0]?.evidence ?? []).slice(0, 4)
					}
				: null,
			failureCode: step?.status === 'accepted' ? null : (step?.failureCode ?? null)
		};
	});
	return {
		version: AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION,
		workflowVersion: AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION,
		reviewIntent: 'project_review',
		phase: options.phase,
		terminalOutcome: state.terminalOutcome,
		steps,
		answer: {
			answerId: state.answer.answerId,
			status: state.answer.status,
			durableBytes: utf8Bytes(state.answer.text),
			textSha256: state.answer.textSha256,
			editorStepAttemptId: state.answer.editorStepAttemptId,
			acceptedAt: state.answer.acceptedAt
		},
		transport: {
			executionState: 'active',
			lastDurableProgressAt: null,
			providerActivity: {
				state: options.providerActivity,
				lastObservedAt: options.observedAt
			},
			delivery: { state: 'connected', lastObservedAt: null }
		},
		coverageGap: workflowCoverageGap(state)
	};
}

/** Wraps a projection as one atomic checkpoint: `projection.workflow` plus its event. */
export function workflowCheckpointV1(
	transitionId: string,
	projection: AgenticChatWorkflowProjectionV1
): AgenticChatWorkflowCheckpointV1 {
	const workflow = projection as unknown as JsonObject;
	return {
		transitionId,
		projection: { workflow },
		eventPayload: { type: AGENTIC_CHAT_WORKFLOW_PROGRESS_EVENT_TYPE, workflow }
	};
}

/** A plain statement of missing coverage; null when both specialists were accepted. */
export function workflowCoverageGap(state: AgenticChatWorkflowRunStateV1): string | null {
	const missing = (['project_analyst', 'risk_reviewer'] as const).filter((key) => {
		const status = state.steps[key]?.status;
		return status === 'failed' || status === 'skipped';
	});
	if (!missing.length) return null;
	const names = missing.map((key) => AGENTIC_CHAT_WORKFLOW_STEP_LABELS_V1[key].toLowerCase());
	return `The ${names.join(' and the ')} did not finish, so this review is partial.`;
}

/** Accepted durable reports, in step order. Results that fail the shape check are ignored. */
export function acceptedWorkflowReports(
	state: AgenticChatWorkflowRunStateV1
): AgenticChatWorkflowRoleReportV1[] {
	return (['project_analyst', 'risk_reviewer'] as const).flatMap((key) => {
		const report = acceptedReport(state, key);
		return report ? [report] : [];
	});
}

const MODEL_FREE_REASONS: Readonly<Record<string, string>> = {
	budget_exhausted:
		'this review reached its spending limit before the combined answer could be written',
	synthesis_headroom_required:
		'this review reached its spending limit before the combined answer could be written',
	dispatch_limit:
		'this review used all of its model requests before the combined answer could be written',
	deadline_expired: 'this review ran out of time before the combined answer could be written',
	attempts_exhausted: 'the combined answer could not be written after its allowed attempts'
};

/**
 * Bounded, deterministic answer built only from accepted specialist reports, used when
 * no synthesis request can be admitted. It makes no model call and claims no new facts.
 */
export function renderModelFreeWorkflowAnswer(
	state: AgenticChatWorkflowRunStateV1,
	reasonCode: string
): string {
	const reason =
		MODEL_FREE_REASONS[reasonCode] ??
		MODEL_FREE_REASONS[reasonCode.replace(/^dispatch_/, '')] ??
		'the combined answer could not be written';
	const sections = (['project_analyst', 'risk_reviewer'] as const).map((key) => {
		const report = acceptedReport(state, key);
		const label = AGENTIC_CHAT_WORKFLOW_STEP_LABELS_V1[key];
		if (!report) return `## ${label}\n\nThis part of the review did not finish.`;
		const rendered = renderWorkflowRoleReport(fromDurableWorkflowRoleReport(report), 1);
		return `## ${label}\n\n${boundText(rendered, 12_000)}`;
	});
	return `Partial review: ${reason}. These are the accepted specialist findings, shown without a combined summary.\n\n${sections.join('\n\n')}`;
}

/** Appended once when an editor stream stops after some answer text is durable. */
export const AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE =
	'\n\n_Partial review: the combined answer stopped before it finished. The text above is what was completed._';

function acceptedReport(
	state: AgenticChatWorkflowRunStateV1,
	key: 'project_analyst' | 'risk_reviewer'
): AgenticChatWorkflowRoleReportV1 | null {
	const step = state.steps[key];
	const result = step?.status === 'accepted' ? step.result : null;
	if (
		!result ||
		result.version !== 'chat_workflow_role_report_v1' ||
		result.role !== key ||
		typeof result.summary !== 'string' ||
		!Array.isArray(result.findings)
	) {
		return null;
	}
	return result as unknown as AgenticChatWorkflowRoleReportV1;
}

function boundText(text: string, maximum: number): string {
	return text.length > maximum ? `${text.slice(0, maximum)}\n[Shortened]` : text;
}

export function utf8Bytes(value: string): number {
	return Buffer.byteLength(value, 'utf8');
}
