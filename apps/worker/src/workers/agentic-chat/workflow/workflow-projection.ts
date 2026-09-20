// apps/worker/src/workers/agentic-chat/workflow/workflow-projection.ts
import {
	PROJECT_REVIEW_SPECIALISTS_V1,
	type SpecialistSnapshotV2
} from '@buildos/agentic-chat-runtime/specialists';
import {
	AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION,
	AGENTIC_CHAT_WORKFLOW_PROGRESS_EVENT_TYPE,
	AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION,
	type AgenticChatWorkflowPhaseV1,
	type AgenticChatWorkflowProjectionV1,
	type AgenticChatWorkflowResultQualityV1,
	type AgenticChatWorkflowRoleReportV1,
	type AgenticChatWorkflowStepKeyV1,
	type AgenticChatWorkflowStepStatusV1,
	type AgenticChatWorkflowTerminalOutcomeV1,
	type JsonObject
} from '@buildos/shared-types';
import { fromDurableWorkflowRoleReport, renderWorkflowRoleReport } from './role-report';
import type {
	AgenticChatWorkflowCheckpointV1,
	AgenticChatWorkflowRunStateV1
} from './workflow-store';

/**
 * The single builder for the frozen `AgenticChatWorkflowProjectionV1` (contract
 * section 9). Tasker 86 writes the `preparing`, `assessing`, and preparation-terminal
 * projections from explicit input; Tasker 87's runner converts durable run truth into
 * the same input (`workflowProjectionInputFromRunV1`), so every workflow write carries
 * one projection shape, one step order, and one label set. It never contains prompts,
 * provider receipts, pricing, cost, processing tokens, or settlement tokens.
 */

/** The existing ordinary stream projection version; kept so current UI surfaces read activity. */
const UI_PROJECTION_VERSION = 'agentic_chat_ui_projection_v1';

export const AGENTIC_CHAT_WORKFLOW_STEP_ORDER_V1: readonly AgenticChatWorkflowStepKeyV1[] = [
	'planner',
	'project_analyst',
	'risk_reviewer',
	'editor'
];

/** Fixed step labels the ordinary-chat progress card renders (Tasker 88). */
export const AGENTIC_CHAT_WORKFLOW_STEP_LABELS_V1: Readonly<
	Record<AgenticChatWorkflowStepKeyV1, string>
> = {
	planner: 'Plan the review',
	project_analyst: PROJECT_REVIEW_SPECIALISTS_V1.project_analyst.label,
	risk_reviewer: PROJECT_REVIEW_SPECIALISTS_V1.risk_reviewer.label,
	editor: 'Combine recommendations'
};

/** The activity line each phase carries on the ordinary stream projection. */
export const AGENTIC_CHAT_WORKFLOW_PHASE_ACTIVITY_V1: Readonly<
	Record<AgenticChatWorkflowPhaseV1, string>
> = {
	preparing: 'Gathering project context',
	assessing: 'Project context ready',
	executing: 'Specialists reviewing the project',
	synthesizing: 'Combining recommendations',
	finished: ''
};

type ProjectionStep = AgenticChatWorkflowProjectionV1['steps'][number];

export type AgenticChatWorkflowDurableStepV1 = {
	key: AgenticChatWorkflowStepKeyV1;
	status: AgenticChatWorkflowStepStatusV1;
	quality: AgenticChatWorkflowResultQualityV1 | null;
	attemptsUsed: number;
	failureCode: string | null;
	/** The first accepted finding of an accepted specialist report, when there is one. */
	acceptedFinding?: ProjectionStep['acceptedFinding'];
};

export type AgenticChatWorkflowProjectionInputV1 = {
	stepLabels?: Partial<Record<AgenticChatWorkflowStepKeyV1, string>>;
	phase: AgenticChatWorkflowPhaseV1;
	terminalOutcome?: AgenticChatWorkflowTerminalOutcomeV1 | null;
	/** Durable step rows; missing keys render as never-started `pending` steps. */
	steps?: readonly AgenticChatWorkflowDurableStepV1[];
	/** Durable answer truth; omitted means no answer has started. */
	answer?: AgenticChatWorkflowProjectionV1['answer'];
	executionState?: AgenticChatWorkflowProjectionV1['transport']['executionState'];
	/** Process-local provider activity; omitted means idle. Never recovery authority. */
	providerActivity?: AgenticChatWorkflowProjectionV1['transport']['providerActivity'];
	/** A user-readable statement of what this review could not cover, or why it stopped. */
	coverageGap?: string | null;
};

export type AgenticChatWorkflowProviderActivityV1 =
	AgenticChatWorkflowProjectionV1['transport']['providerActivity']['state'];

const NO_ANSWER: AgenticChatWorkflowProjectionV1['answer'] = {
	answerId: null,
	status: 'not_started',
	durableBytes: 0,
	textSha256: null,
	editorStepAttemptId: null,
	acceptedAt: null
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
				label: input.stepLabels?.[key] ?? AGENTIC_CHAT_WORKFLOW_STEP_LABELS_V1[key],
				status: step?.status ?? 'pending',
				quality: step?.quality ?? null,
				attemptsUsed: step?.attemptsUsed ?? 0,
				acceptedFinding: step?.acceptedFinding ?? null,
				failureCode: step?.failureCode ?? null
			};
		}),
		answer: input.answer ?? { ...NO_ANSWER },
		transport: {
			executionState:
				input.executionState ?? (input.phase === 'finished' ? 'terminal' : 'active'),
			// Reconciliation derives ages from database time; the writer never guesses one.
			lastDurableProgressAt: null,
			providerActivity: input.providerActivity ?? { state: 'idle', lastObservedAt: null },
			delivery: { state: 'connected', lastObservedAt: null }
		},
		coverageGap: input.coverageGap ?? null
	};
}

/** Converts durable run truth into the builder's input (Tasker 87 runner checkpoints). */
export function workflowProjectionInputFromRunV1(
	state: AgenticChatWorkflowRunStateV1,
	options: {
		phase: AgenticChatWorkflowPhaseV1;
		providerActivity: AgenticChatWorkflowProviderActivityV1;
		observedAt: string;
		terminalOutcome?: AgenticChatWorkflowTerminalOutcomeV1 | null;
		coverageGap?: string | null;
	}
): AgenticChatWorkflowProjectionInputV1 {
	const steps = AGENTIC_CHAT_WORKFLOW_STEP_ORDER_V1.flatMap((key) => {
		const step = state.steps[key];
		if (!step) return [];
		const report =
			key === 'project_analyst' || key === 'risk_reviewer'
				? acceptedReport(state, key)
				: null;
		return [
			{
				key,
				status: step.status,
				quality: step.status === 'accepted' ? step.quality : null,
				attemptsUsed: step.attemptsUsed,
				failureCode: step.status === 'accepted' ? null : step.failureCode,
				acceptedFinding: report
					? {
							summary: report.summary,
							evidence: (report.findings[0]?.evidence ?? []).slice(0, 4)
						}
					: null
			}
		];
	});
	return {
		phase: options.phase,
		stepLabels: specialistStepLabels(state.specialistSnapshot),
		terminalOutcome:
			options.terminalOutcome === undefined ? state.terminalOutcome : options.terminalOutcome,
		steps,
		answer: {
			answerId: state.answer.answerId,
			status: state.answer.status,
			durableBytes: utf8Bytes(state.answer.text),
			textSha256: state.answer.textSha256,
			editorStepAttemptId: state.answer.editorStepAttemptId,
			acceptedAt: state.answer.acceptedAt
		},
		providerActivity: {
			state: options.providerActivity,
			lastObservedAt: options.observedAt
		},
		coverageGap:
			options.coverageGap === undefined ? workflowCoverageGap(state) : options.coverageGap
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

/** One atomic checkpoint: the stream projection plus its progress event. */
export function workflowCheckpointV1(
	transitionId: string,
	workflow: AgenticChatWorkflowProjectionV1,
	currentActivity: string = AGENTIC_CHAT_WORKFLOW_PHASE_ACTIVITY_V1[workflow.phase]
): AgenticChatWorkflowCheckpointV1 {
	return {
		transitionId,
		projection: buildAgenticChatWorkflowStreamProjectionV1(workflow, currentActivity),
		eventPayload: buildAgenticChatWorkflowProgressEventV1(workflow)
	};
}

/**
 * A plain statement of missing coverage; null when both specialists were accepted.
 * While the run can continue, only failed or skipped specialists are missing. At a
 * terminal decision (`terminal: true`), a specialist that never finished is missing too.
 */
export function workflowCoverageGap(
	state: AgenticChatWorkflowRunStateV1,
	options: { terminal?: boolean } = {}
): string | null {
	const missing = (['project_analyst', 'risk_reviewer'] as const).filter((key) => {
		const status = state.steps[key]?.status;
		return options.terminal
			? status !== 'accepted'
			: status === 'failed' || status === 'skipped';
	});
	if (!missing.length) return null;
	const names = missing.map((key) =>
		(
			specialistStepLabels(state.specialistSnapshot)[key] ??
			AGENTIC_CHAT_WORKFLOW_STEP_LABELS_V1[key]
		).toLowerCase()
	);
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
	attempts_exhausted: 'the combined answer could not be written after its allowed attempts',
	worker_interrupted:
		'the review was interrupted and could not safely resume before the combined answer was written',
	finalize_failed:
		'the review was interrupted and could not safely resume before the combined answer was written'
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
		MODEL_FREE_REASONS[reasonCode.replace(/^(dispatch_|workflow_)/, '')] ??
		'the combined answer could not be written';
	const sections = (['project_analyst', 'risk_reviewer'] as const).map((key) => {
		const report = acceptedReport(state, key);
		const label =
			specialistStepLabels(state.specialistSnapshot)[key] ??
			AGENTIC_CHAT_WORKFLOW_STEP_LABELS_V1[key];
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

export function specialistStepLabels(
	snapshot?: SpecialistSnapshotV2
): Partial<Record<AgenticChatWorkflowStepKeyV1, string>> {
	return snapshot
		? {
				project_analyst: snapshot.slots.project_analyst.definition.label,
				risk_reviewer: snapshot.slots.risk_reviewer.definition.label
			}
		: {};
}
