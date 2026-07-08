// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/finalization-runner.ts
import type { ChatContextType } from '@buildos/shared-types';
import {
	applyFinalizationGuard,
	type FinalizationGuardResult,
	type TurnSupervisorObservation
} from '../turn-supervisor';
import { sanitizeAssistantFinalText } from './assistant-text-sanitization';
import {
	buildGatewayMutationNoExecutionRepairInstruction,
	buildProjectCreateNoExecutionRepairInstruction,
	buildSkillGateNoLoadRepairInstruction,
	collectGatewayWriteIntentOps,
	enforceMutationOutcomeIntegrity,
	looksLikeExplicitMutationRequest,
	shouldRepairGatewayMutationNoExecution,
	shouldRepairProjectCreateNoExecution,
	shouldRepairSkillGateNoLoad
} from './repair-instructions';
import type { FastToolExecution, LLMStreamPassMetadata } from './shared';
import { classifyToolExecution, didGatewayExecSucceed } from './tool-classification';

const LENGTH_CONTINUATION_MESSAGE =
	'Your previous message was cut off because it reached the output length limit. Continue the answer from exactly where it stopped. Do not repeat text you already wrote, do not restart, and do not call any tools — just finish the answer.';

const NO_TOOL_SYNTHESIS_TOOL_RETRY_MESSAGE =
	'The previous synthesis attempt still requested tool calls even though tools are unavailable. Ignore all pending or implied tool calls and write the final user-facing answer now from the existing tool results. Do not say you will check, search, pull up, inspect, load, or update anything else.';

const NO_TOOL_SYNTHESIS_EMPTY_RETRY_MESSAGE =
	'The previous synthesis attempt produced no visible answer. Write the final user-facing answer now from the existing tool results. Include the concrete entities you found (with their titles and states) and directly answer any definition question the user asked. Do not call tools.';

function shouldAdoptFinalizationGuardFinishedReason(
	currentFinishedReason: string | undefined,
	guardResult: FinalizationGuardResult
): boolean {
	return (
		guardResult.finishedReason !== undefined &&
		(currentFinishedReason === undefined || currentFinishedReason === 'stop')
	);
}

export type LengthContinuationDecision =
	| {
			action: 'continue';
			nextLengthContinuationCount: number;
			nextCarriedTruncatedText: string;
			systemMessage: string;
			partialAssistantText: string;
			forceNoToolSynthesisPass: boolean;
	  }
	| { action: 'exhausted'; answerTruncated: true }
	| { action: 'none' };

export function resolveLengthContinuation(params: {
	llmPassMeta: LLMStreamPassMetadata;
	pendingToolCallCount: number;
	assistantBuffer: string;
	carriedTruncatedText: string;
	lengthContinuationCount: number;
	maxLengthContinuations: number;
	noToolSynthesisPass: boolean;
}): LengthContinuationDecision {
	if (params.llmPassMeta.finishedReason !== 'length' || params.pendingToolCallCount > 0) {
		return { action: 'none' };
	}

	if (params.lengthContinuationCount < params.maxLengthContinuations) {
		return {
			action: 'continue',
			nextLengthContinuationCount: params.lengthContinuationCount + 1,
			nextCarriedTruncatedText: params.carriedTruncatedText + params.assistantBuffer,
			systemMessage: LENGTH_CONTINUATION_MESSAGE,
			partialAssistantText: sanitizeAssistantFinalText(params.assistantBuffer),
			forceNoToolSynthesisPass: params.noToolSynthesisPass
		};
	}

	return { action: 'exhausted', answerTruncated: true };
}

export type NoToolSynthesisFinalizationResult =
	| {
			action: 'retry';
			nextRetryCount: number;
			systemMessage: string;
			forceNoToolSynthesisPass: true;
	  }
	| { action: 'finalized'; finalAssistantText: string; finishedReason: 'stop' }
	| { action: 'tool_limit'; kind: 'round' };

export async function runNoToolSynthesisFinalization(params: {
	assistantBuffer: string;
	carriedTruncatedText: string;
	suppressedNoToolSynthesisToolCallCount: number;
	noToolSynthesisRetryCount: number;
	contextType: ChatContextType;
	toolExecutions: FastToolExecution[];
	latestUserText: string;
	assistantText: string;
	emitAssistantRemainder: (content: string) => Promise<void>;
	observeSupervisor: (observation: TurnSupervisorObservation) => Promise<void>;
}): Promise<NoToolSynthesisFinalizationResult> {
	const candidateFinalText = sanitizeAssistantFinalText(
		params.carriedTruncatedText + params.assistantBuffer
	);
	const noToolPassStillRequestedTools = params.suppressedNoToolSynthesisToolCallCount > 0;
	const noToolPassProducedNoAnswer = !candidateFinalText;
	if (
		(noToolPassStillRequestedTools || noToolPassProducedNoAnswer) &&
		params.noToolSynthesisRetryCount < 1
	) {
		return {
			action: 'retry',
			nextRetryCount: params.noToolSynthesisRetryCount + 1,
			systemMessage: noToolPassStillRequestedTools
				? NO_TOOL_SYNTHESIS_TOOL_RETRY_MESSAGE
				: NO_TOOL_SYNTHESIS_EMPTY_RETRY_MESSAGE,
			forceNoToolSynthesisPass: true
		};
	}

	if (candidateFinalText && params.suppressedNoToolSynthesisToolCallCount === 0) {
		const finalAssistantText = enforceMutationOutcomeIntegrity(candidateFinalText, {
			contextType: params.contextType,
			toolExecutions: params.toolExecutions,
			latestUserText: params.latestUserText
		});
		await params.observeSupervisor({
			type: 'final_candidate',
			text: finalAssistantText,
			finishedReason: 'stop'
		});
		if (finalAssistantText && finalAssistantText !== params.assistantText.trim()) {
			await params.emitAssistantRemainder(finalAssistantText);
		}
		return {
			action: 'finalized',
			finalAssistantText,
			finishedReason: 'stop'
		};
	}

	return { action: 'tool_limit', kind: 'round' };
}

export type NoToolCallFinalizationResult =
	| {
			action: 'repair';
			kind: 'project_create' | 'gateway_mutation' | 'skill_gate';
			instruction: string;
	  }
	| { action: 'finalized'; finalAssistantText: string };

export async function runNoToolCallFinalization(params: {
	assistantBuffer: string;
	carriedTruncatedText: string;
	contextType: ChatContextType;
	toolExecutions: FastToolExecution[];
	latestUserText: string;
	gatewayModeActive: boolean;
	projectCreateStopRepairInjected: boolean;
	gatewayMutationStopRepairInjected: boolean;
	skillGateStopRepairInjected: boolean;
	skillGate?: {
		required: boolean;
		recommendedSkillIds: string[];
		acceptableSkillIds: string[];
		historyLoadedSkillIds: string[];
	} | null;
	assistantText: string;
	finishedReason?: string;
	emitAssistantRemainder: (content: string) => Promise<void>;
	observeSupervisor: (observation: TurnSupervisorObservation) => Promise<void>;
}): Promise<NoToolCallFinalizationResult> {
	const candidateFinalText = sanitizeAssistantFinalText(
		params.carriedTruncatedText + params.assistantBuffer
	);
	if (
		shouldRepairProjectCreateNoExecution({
			contextType: params.contextType,
			finalText: candidateFinalText,
			toolExecutions: params.toolExecutions,
			repairAlreadyInjected: params.projectCreateStopRepairInjected
		})
	) {
		return {
			action: 'repair',
			kind: 'project_create',
			instruction: buildProjectCreateNoExecutionRepairInstruction()
		};
	}
	if (
		shouldRepairGatewayMutationNoExecution({
			gatewayModeActive: params.gatewayModeActive,
			contextType: params.contextType,
			finalText: candidateFinalText,
			toolExecutions: params.toolExecutions,
			repairAlreadyInjected: params.gatewayMutationStopRepairInjected,
			latestUserText: params.latestUserText
		})
	) {
		return {
			action: 'repair',
			kind: 'gateway_mutation',
			instruction: buildGatewayMutationNoExecutionRepairInstruction(params.toolExecutions)
		};
	}
	if (
		shouldRepairSkillGateNoLoad({
			skillLoadRequired: params.skillGate?.required === true,
			acceptableSkillIds: params.skillGate?.acceptableSkillIds ?? [],
			historyLoadedSkillIds: params.skillGate?.historyLoadedSkillIds ?? [],
			finalText: candidateFinalText,
			toolExecutions: params.toolExecutions,
			repairAlreadyInjected: params.skillGateStopRepairInjected
		})
	) {
		return {
			action: 'repair',
			kind: 'skill_gate',
			instruction: buildSkillGateNoLoadRepairInstruction(
				params.skillGate?.recommendedSkillIds ?? []
			)
		};
	}

	const finalAssistantText = enforceMutationOutcomeIntegrity(candidateFinalText, {
		contextType: params.contextType,
		toolExecutions: params.toolExecutions,
		latestUserText: params.latestUserText
	});
	await params.observeSupervisor({
		type: 'final_candidate',
		text: finalAssistantText,
		finishedReason: params.finishedReason
	});
	if (finalAssistantText && finalAssistantText !== params.assistantText.trim()) {
		await params.emitAssistantRemainder(finalAssistantText);
	}
	return { action: 'finalized', finalAssistantText };
}

export type CancellationFinalizationResult = {
	finalAssistantText: string;
};

export async function runCancellationFinalization(params: {
	activePendingToolCallCount: number;
	activeAssistantBuffer: string;
	assistantText: string;
	finalAssistantText: string;
	emitAssistantRemainder: (content: string) => Promise<void>;
}): Promise<CancellationFinalizationResult> {
	let finalAssistantText = params.finalAssistantText;
	if (params.activePendingToolCallCount === 0) {
		const partialAssistantText = sanitizeAssistantFinalText(params.activeAssistantBuffer);
		if (partialAssistantText && partialAssistantText !== params.assistantText.trim()) {
			await params.emitAssistantRemainder(partialAssistantText);
			if (!finalAssistantText) {
				finalAssistantText = partialAssistantText;
			}
		}
	}
	return { finalAssistantText };
}

export type TerminalFinalizationResult = {
	finalAssistantText: string;
	finishedReason?: string;
	finalizationGuardResult?: FinalizationGuardResult;
};

export async function runTerminalFinalization(params: {
	assistantText: string;
	finalAssistantText: string;
	finishedReason?: string;
	toolLimitNotice: string | null;
	answerTruncated: boolean;
	latestUserText: string;
	toolExecutions: FastToolExecution[];
	emitAssistantDelta: (content: string) => Promise<void>;
	emitAssistantRemainder: (content: string) => Promise<void>;
	observeSupervisor: (observation: TurnSupervisorObservation) => Promise<void>;
}): Promise<TerminalFinalizationResult> {
	let finalAssistantText = params.finalAssistantText;
	let finishedReason = params.finishedReason;
	let finalizationGuardResult: FinalizationGuardResult | undefined;
	let assistantText = params.assistantText;

	const mutationRequested = didTurnHaveUnfulfilledMutationIntent({
		latestUserText: params.latestUserText,
		toolExecutions: params.toolExecutions
	});

	if (params.toolLimitNotice) {
		const toolLimitFinalizationGuard = applyFinalizationGuard({
			finalAssistantText: '',
			assistantText: '',
			toolExecutions: params.toolExecutions,
			mutationRequested
		});
		const finalToolLimitText = toolLimitFinalizationGuard.applied
			? toolLimitFinalizationGuard.text
			: params.toolLimitNotice;
		const prefix = assistantText.trim().length > 0 ? '\n\n' : '';
		const noticeDelta = `${prefix}${finalToolLimitText}`;
		assistantText += noticeDelta;
		await params.emitAssistantDelta(noticeDelta);
		finalAssistantText = finalToolLimitText;
		if (toolLimitFinalizationGuard.applied) {
			finalizationGuardResult = toolLimitFinalizationGuard;
			if (
				shouldAdoptFinalizationGuardFinishedReason(finishedReason, finalizationGuardResult)
			) {
				finishedReason = finalizationGuardResult.finishedReason;
			}
			await params.observeSupervisor({
				type: 'final_candidate',
				text: finalAssistantText,
				finishedReason
			});
		}
	}

	if (finishedReason !== 'supervisor_question') {
		const candidateFinalizationGuard = applyFinalizationGuard({
			finalAssistantText,
			assistantText,
			toolExecutions: params.toolExecutions,
			mutationRequested
		});
		if (candidateFinalizationGuard.applied) {
			finalizationGuardResult = candidateFinalizationGuard;
			finalAssistantText = finalizationGuardResult.text;
			if (
				shouldAdoptFinalizationGuardFinishedReason(finishedReason, finalizationGuardResult)
			) {
				finishedReason = finalizationGuardResult.finishedReason;
			}
			await params.observeSupervisor({
				type: 'final_candidate',
				text: finalAssistantText,
				finishedReason
			});
			if (finalAssistantText && finalAssistantText !== assistantText.trim()) {
				await params.emitAssistantRemainder(finalAssistantText);
			}
		}
	}

	if (params.answerTruncated && (finishedReason === 'stop' || finishedReason === undefined)) {
		finishedReason = 'length';
	}

	return {
		finalAssistantText,
		finishedReason,
		finalizationGuardResult
	};
}

function didTurnHaveUnfulfilledMutationIntent(params: {
	latestUserText: string;
	toolExecutions: FastToolExecution[];
}): boolean {
	return (
		(looksLikeExplicitMutationRequest(params.latestUserText) ||
			collectGatewayWriteIntentOps(params.toolExecutions).length > 0) &&
		!params.toolExecutions.some(
			(execution) =>
				classifyToolExecution(execution) === 'write' && didGatewayExecSucceed(execution)
		)
	);
}
