// apps/worker/src/workers/agentic-chat/workerSupervisorDecisions.ts
import type { JsonObject } from '@buildos/shared-types';
import type { AgenticChatProviderStepV1 } from './provider/contracts';
import type { AgenticChatWorkerSupervisorDecisionRecordV1 } from './workerSupervisor';

import { AGENTIC_CHAT_SUPERVISOR_BLOCKED_RETRY_ERROR_V1 } from '@buildos/agentic-chat-runtime/supervisor';

export const AGENTIC_CHAT_SUPERVISOR_BLOCKED_RETRY_ERROR =
	AGENTIC_CHAT_SUPERVISOR_BLOCKED_RETRY_ERROR_V1;

export type AgenticChatSupervisorBlockedToolCallV1 = {
	providerToolCallId: string;
	error: string;
	modelPayload: JsonObject;
};

export type AgenticChatSupervisorTerminalRequestV1 =
	| {
			kind: 'ask_user';
			transitionId: string;
			sequence: number;
			executionGeneration: number;
			reason: string;
			question: string;
			supervisorDecision: JsonObject;
			checkpoint: Extract<
				AgenticChatWorkerSupervisorDecisionRecordV1['decision'],
				{ action: 'ask_user' }
			>['checkpoint'];
			finishedReason: 'supervisor_question';
	  }
	| { kind: 'stop'; message: string; finishedReason: string };

export type AgenticChatWorkerSupervisorEffectsV1 = {
	records: readonly AgenticChatWorkerSupervisorDecisionRecordV1[];
	semanticSteps: readonly Extract<AgenticChatProviderStepV1, { type: 'semantic' }>[];
	providerInstructions: readonly string[];
	forceSynthesis: boolean;
	blockedToolCalls: readonly AgenticChatSupervisorBlockedToolCallV1[];
	evaluationFlags: readonly Extract<
		AgenticChatProviderStepV1,
		{ type: 'supervisor_evaluation' }
	>[];
	terminalRequest: AgenticChatSupervisorTerminalRequestV1 | null;
};

/**
 * Exhaustively translate deterministic supervisor actions into worker-host
 * effects. The executor/provider coordinator applies this batch; this reducer
 * intentionally has no permissive fallback for a newly introduced action.
 */
export function reduceAgenticChatWorkerSupervisorDecisionsV1(
	records: readonly AgenticChatWorkerSupervisorDecisionRecordV1[]
): AgenticChatWorkerSupervisorEffectsV1 {
	const semanticSteps: Extract<AgenticChatProviderStepV1, { type: 'semantic' }>[] = [];
	const providerInstructions: string[] = [];
	const blockedToolCalls: AgenticChatSupervisorBlockedToolCallV1[] = [];
	const evaluationFlags: Extract<AgenticChatProviderStepV1, { type: 'supervisor_evaluation' }>[] =
		[];
	let terminalRequest: AgenticChatSupervisorTerminalRequestV1 | null = null;
	let forceSynthesis = false;
	let priorSequence: number | null = null;
	let executionGeneration: number | null = null;

	for (const record of records) {
		assertDecisionRecordOrder(record, priorSequence, executionGeneration);
		priorSequence = record.sequence;
		executionGeneration ??= record.executionGeneration;
		const decision = record.decision;

		switch (decision.action) {
			case 'continue':
				throw new Error(
					'Agentic Chat worker supervisor effect batch cannot contain continue'
				);
			case 'emit_status':
				semanticSteps.push(buildStatusStep(record, decision.message, decision.reason));
				break;
			case 'force_synthesis':
				providerInstructions.push(decision.instruction);
				forceSynthesis = true;
				break;
			case 'inject_recovery_instruction':
				providerInstructions.push(decision.instruction);
				if (decision.blockToolCall) {
					if (!decision.toolCallId) {
						throw new Error(
							'Agentic Chat supervisor blocked retry is missing its tool-call id'
						);
					}
					blockedToolCalls.push({
						providerToolCallId: decision.toolCallId,
						error: AGENTIC_CHAT_SUPERVISOR_BLOCKED_RETRY_ERROR,
						modelPayload: {
							error: AGENTIC_CHAT_SUPERVISOR_BLOCKED_RETRY_ERROR,
							supervisor_recovery: { blocked_exact_retry: true }
						}
					});
				}
				break;
			case 'flag_eval':
				evaluationFlags.push({
					type: 'supervisor_evaluation',
					transitionId: record.transitionId,
					reason: decision.reason,
					sequence: record.sequence,
					executionGeneration: record.executionGeneration
				});
				break;
			case 'ask_user':
				terminalRequest = setSingleTerminalRequest(terminalRequest, {
					kind: 'ask_user',
					transitionId: record.transitionId,
					sequence: record.sequence,
					executionGeneration: record.executionGeneration,
					reason: decision.reason,
					question: decision.question,
					supervisorDecision: decision as unknown as JsonObject,
					checkpoint: decision.checkpoint,
					finishedReason: 'supervisor_question'
				});
				break;
			case 'stop_with_message':
				terminalRequest = setSingleTerminalRequest(terminalRequest, {
					kind: 'stop',
					message: decision.message,
					finishedReason: decision.finishedReason
				});
				break;
			default:
				assertNever(decision);
		}
	}

	return {
		records: [...records],
		semanticSteps,
		providerInstructions,
		forceSynthesis,
		blockedToolCalls,
		evaluationFlags,
		terminalRequest
	};
}

function buildStatusStep(
	record: AgenticChatWorkerSupervisorDecisionRecordV1,
	message: string,
	reason: string
): Extract<AgenticChatProviderStepV1, { type: 'semantic' }> {
	return {
		type: 'semantic',
		transitionId: record.transitionId,
		phase: 'stream',
		eventType: 'agent_state',
		currentActivity: message,
		eventPayload: {
			type: 'agent_state',
			state: 'thinking',
			contextType: record.digest.contextType,
			details: message,
			activity_visibility: 'activity_log',
			supervisor: {
				action: 'emit_status',
				reason,
				sequence: record.sequence,
				execution_generation: record.executionGeneration
			}
		}
	};
}

function assertDecisionRecordOrder(
	record: AgenticChatWorkerSupervisorDecisionRecordV1,
	priorSequence: number | null,
	executionGeneration: number | null
): void {
	if (
		!Number.isSafeInteger(record.sequence) ||
		record.sequence < 1 ||
		(priorSequence !== null && record.sequence !== priorSequence + 1)
	) {
		throw new Error('Agentic Chat worker supervisor decision records must be contiguous');
	}
	if (
		!Number.isSafeInteger(record.executionGeneration) ||
		record.executionGeneration < 1 ||
		(executionGeneration !== null && record.executionGeneration !== executionGeneration)
	) {
		throw new Error('Agentic Chat worker supervisor decision generation is inconsistent');
	}
}

function setSingleTerminalRequest(
	current: AgenticChatSupervisorTerminalRequestV1 | null,
	next: AgenticChatSupervisorTerminalRequestV1
): AgenticChatSupervisorTerminalRequestV1 {
	if (current) {
		throw new Error('Agentic Chat worker supervisor emitted conflicting terminal requests');
	}
	return next;
}

function assertNever(value: never): never {
	throw new Error(`Unhandled Agentic Chat worker supervisor decision: ${String(value)}`);
}
