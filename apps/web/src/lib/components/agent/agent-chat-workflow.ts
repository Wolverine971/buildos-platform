// apps/web/src/lib/components/agent/agent-chat-workflow.ts
import {
	AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION,
	AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION,
	readChatWorkflowProgress,
	type AgenticChatWorkflowProjectionV1,
	type ChatWorkflowProgress
} from '@buildos/shared-types';
import type { ThinkingBlockMessage } from './agent-chat.types';

export type AgentChatWorkflowProgress = ChatWorkflowProgress | AgenticChatWorkflowProjectionV1;

const STEP_KEYS = ['planner', 'project_analyst', 'risk_reviewer', 'editor'];
const TURN_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, max = 6_000): value is string {
	return typeof value === 'string' && value.length <= max;
}

function nullableText(value: unknown): boolean {
	return value === null || text(value);
}

function oneOf(value: unknown, values: readonly string[]): boolean {
	return typeof value === 'string' && values.includes(value);
}

/** Accept only the bounded, privacy-safe read model, never workflow execution inputs. */
export function readDurableChatWorkflowProgress(
	value: unknown
): AgenticChatWorkflowProjectionV1 | null {
	if (
		!record(value) ||
		value.version !== AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION ||
		value.workflowVersion !== AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION ||
		value.reviewIntent !== 'project_review' ||
		!oneOf(value.phase, ['preparing', 'assessing', 'executing', 'synthesizing', 'finished']) ||
		(value.terminalOutcome !== null &&
			!oneOf(value.terminalOutcome, ['complete', 'partial', 'failed', 'cancelled'])) ||
		!nullableText(value.coverageGap) ||
		!Array.isArray(value.steps) ||
		value.steps.length !== STEP_KEYS.length
	) {
		return null;
	}
	for (const [index, step] of value.steps.entries()) {
		if (
			!record(step) ||
			step.key !== STEP_KEYS[index] ||
			!text(step.label, 100) ||
			!oneOf(step.status, ['pending', 'claimed', 'accepted', 'failed', 'skipped']) ||
			(step.quality !== null && !oneOf(step.quality, ['complete', 'partial'])) ||
			!Number.isSafeInteger(step.attemptsUsed) ||
			Number(step.attemptsUsed) < 0 ||
			!nullableText(step.failureCode)
		) {
			return null;
		}
		if (step.acceptedFinding !== null) {
			const finding = step.acceptedFinding;
			if (
				!record(finding) ||
				!text(finding.summary) ||
				!Array.isArray(finding.evidence) ||
				finding.evidence.length > 256 ||
				!finding.evidence.every(
					(ref) =>
						record(ref) &&
						ref.kind === 'project_record' &&
						text(ref.id) &&
						text(ref.version) &&
						text(ref.label)
				)
			) {
				return null;
			}
		}
	}
	const answer = value.answer;
	const transport = value.transport;
	if (
		!record(answer) ||
		!oneOf(answer.status, ['not_started', 'streaming', 'accepted']) ||
		!Number.isSafeInteger(answer.durableBytes) ||
		Number(answer.durableBytes) < 0 ||
		!['answerId', 'textSha256', 'editorStepAttemptId', 'acceptedAt'].every((key) =>
			nullableText(answer[key])
		) ||
		!record(transport) ||
		!oneOf(transport.executionState, ['queued', 'active', 'recovering', 'terminal']) ||
		!nullableText(transport.lastDurableProgressAt) ||
		!record(transport.providerActivity) ||
		!oneOf(transport.providerActivity.state, [
			'idle',
			'waiting_for_capacity',
			'request_active',
			'settling'
		]) ||
		!nullableText(transport.providerActivity.lastObservedAt) ||
		!record(transport.delivery) ||
		!oneOf(transport.delivery.state, [
			'connected',
			'delayed',
			'reconcile_pending',
			'disconnected'
		]) ||
		!nullableText(transport.delivery.lastObservedAt)
	) {
		return null;
	}
	// The session endpoint uses this reader across the service-role/browser
	// boundary. Rebuild every nested object so future storage-only properties do
	// not become public merely because the known UI fields are still valid.
	const projection = value as AgenticChatWorkflowProjectionV1;
	return {
		version: projection.version,
		workflowVersion: projection.workflowVersion,
		reviewIntent: projection.reviewIntent,
		phase: projection.phase,
		terminalOutcome: projection.terminalOutcome,
		steps: projection.steps.map((step) => ({
			key: step.key,
			label: step.label,
			status: step.status,
			quality: step.quality,
			attemptsUsed: step.attemptsUsed,
			acceptedFinding: step.acceptedFinding
				? {
						summary: step.acceptedFinding.summary,
						evidence: step.acceptedFinding.evidence.map((ref) => ({
							kind: ref.kind,
							id: ref.id,
							version: ref.version,
							label: ref.label
						}))
					}
				: null,
			failureCode: step.failureCode
		})),
		answer: {
			answerId: projection.answer.answerId,
			status: projection.answer.status,
			durableBytes: projection.answer.durableBytes,
			textSha256: projection.answer.textSha256,
			editorStepAttemptId: projection.answer.editorStepAttemptId,
			acceptedAt: projection.answer.acceptedAt
		},
		transport: {
			executionState: projection.transport.executionState,
			lastDurableProgressAt: projection.transport.lastDurableProgressAt,
			providerActivity: {
				state: projection.transport.providerActivity.state,
				lastObservedAt: projection.transport.providerActivity.lastObservedAt
			},
			delivery: {
				state: projection.transport.delivery.state,
				lastObservedAt: projection.transport.delivery.lastObservedAt
			}
		},
		coverageGap: projection.coverageGap
	};
}

export function readAgentChatWorkflowProgress(value: unknown): AgentChatWorkflowProgress | null {
	return readDurableChatWorkflowProgress(value) ?? readChatWorkflowProgress(value);
}

/** Admission stores the turn identity on the user row before an answer exists. */
export function workflowMessageTurnId(metadata: unknown): string | null {
	if (!record(metadata)) return null;
	if (typeof metadata.turn_run_id === 'string' && TURN_ID_PATTERN.test(metadata.turn_run_id)) {
		return metadata.turn_run_id;
	}
	if (
		metadata.review_intent !== 'project_review' ||
		typeof metadata.idempotency_key !== 'string'
	) {
		return null;
	}
	const id = /^chat-turn:([^:]+):user$/.exec(metadata.idempotency_key)?.[1];
	return id && TURN_ID_PATTERN.test(id) ? id : null;
}

export function workflowProgressActivity(progress: AgenticChatWorkflowProjectionV1): string {
	if (progress.terminalOutcome) {
		return {
			complete: 'Project review ready',
			partial: 'Partial review ready',
			failed: 'Review failed',
			cancelled: 'Review stopped'
		}[progress.terminalOutcome];
	}
	if (progress.transport.executionState === 'recovering') return 'Resuming project review';
	return {
		preparing: 'Gathering project context',
		assessing: 'Planning the project review',
		executing: 'Specialists reviewing the project',
		synthesizing: 'Combining recommendations',
		finished: 'Review incomplete'
	}[progress.phase];
}

export function workflowThinkingStatus(
	progress: AgentChatWorkflowProgress,
	fallback: ThinkingBlockMessage['status']
): ThinkingBlockMessage['status'] {
	if (progress.version !== AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION) return fallback;
	switch (progress.terminalOutcome) {
		case 'complete':
		case 'partial':
			return 'completed';
		case 'failed':
			return 'error';
		case 'cancelled':
			return 'cancelled';
		default:
			return fallback;
	}
}
