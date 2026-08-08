// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/finalization-runner.ts
import type { ChatContextType } from '@buildos/shared-types';
import {
	NO_TOOL_SYNTHESIS_EMPTY_RETRY_MESSAGE,
	NO_TOOL_SYNTHESIS_TOOL_RETRY_MESSAGE
} from '@buildos/agentic-chat-runtime/loop';
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
	buildOrganizeCommissionRepairInstruction,
	buildResearchNoPersistRepairInstruction,
	buildStatedFutureRepairInstruction,
	shouldRepairGatewayMutationNoExecution,
	shouldRepairOrganizeCommissionNoExecution,
	shouldRepairResearchNoPersist,
	shouldRepairStatedFutureNotRecorded,
	shouldRepairProjectCreateNoExecution,
	shouldRepairSkillGateNoLoad
} from './repair-instructions';
import type { FastToolExecution, LLMStreamPassMetadata } from './shared';
import {
	countVisiblyLabeledOptions,
	findMissingExplicitOptionResponseAnchors,
	resolveExplicitOptionCountRequest
} from './synthesis-context';
import { classifyToolExecution, didGatewayExecSucceed } from './tool-classification';

const LENGTH_CONTINUATION_MESSAGE =
	'Your previous message was cut off because it reached the output length limit. Continue the answer from exactly where it stopped. Do not repeat text you already wrote, do not restart, and do not call any tools — just finish the answer.';

function buildNoToolSynthesisConstraintRetryMessage(
	required: number,
	actual: number,
	missingAnchors: string[]
): string {
	const issues = [
		...(actual !== required
			? [
					`it contained ${actual} visibly labeled option${actual === 1 ? '' : 's'}, but ${required} were requested`
				]
			: []),
		...(missingAnchors.length > 0
			? [
					`it omitted the user's explicit request anchor${missingAnchors.length === 1 ? '' : 's'} ${missingAnchors.map((anchor) => `"${anchor}"`).join(', ')}`
				]
			: [])
	];
	return `The previous synthesis attempt did not satisfy the user's response constraints: ${issues.join('; ')}. Rewrite the complete answer with exactly ${required} compact, substantively distinct items labeled Option 1 through Option ${required}. Explicitly frame the focal subject and requested story/work position, retaining the named anchors above instead of relying only on pronouns or implicit context. Present all ${required} options before any extended comparison. Do not call tools.`;
}

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
	| { action: 'failed'; finishedReason: 'synthesis_failed' };

export async function runNoToolSynthesisFinalization(params: {
	assistantBuffer: string;
	carriedTruncatedText: string;
	suppressedNoToolSynthesisToolCallCount: number;
	noToolSynthesisRetryCount: number;
	contextType: ChatContextType;
	toolExecutions: FastToolExecution[];
	latestUserText: string;
	mutationRequested?: boolean;
	expectedWriteToolNames?: string[];
	assistantText: string;
	emitAssistantRemainder: (content: string) => Promise<void>;
	observeSupervisor: (observation: TurnSupervisorObservation) => Promise<void>;
}): Promise<NoToolSynthesisFinalizationResult> {
	const candidateFinalText = sanitizeAssistantFinalText(
		params.carriedTruncatedText + params.assistantBuffer
	);
	const noToolPassStillRequestedTools = params.suppressedNoToolSynthesisToolCallCount > 0;
	const noToolPassProducedNoAnswer = !candidateFinalText;
	const requiredOptionCount = resolveExplicitOptionCountRequest(params.latestUserText);
	const actualOptionCount = requiredOptionCount
		? countVisiblyLabeledOptions(candidateFinalText)
		: 0;
	const noToolPassMissedExactOptionCount = Boolean(
		requiredOptionCount && actualOptionCount !== requiredOptionCount
	);
	const missingOptionResponseAnchors = requiredOptionCount
		? findMissingExplicitOptionResponseAnchors(params.latestUserText, candidateFinalText)
		: [];
	if (
		(noToolPassStillRequestedTools ||
			noToolPassProducedNoAnswer ||
			noToolPassMissedExactOptionCount ||
			missingOptionResponseAnchors.length > 0) &&
		params.noToolSynthesisRetryCount < 1
	) {
		return {
			action: 'retry',
			nextRetryCount: params.noToolSynthesisRetryCount + 1,
			systemMessage: noToolPassStillRequestedTools
				? NO_TOOL_SYNTHESIS_TOOL_RETRY_MESSAGE
				: noToolPassProducedNoAnswer
					? NO_TOOL_SYNTHESIS_EMPTY_RETRY_MESSAGE
					: buildNoToolSynthesisConstraintRetryMessage(
							requiredOptionCount ?? 0,
							actualOptionCount,
							missingOptionResponseAnchors
						),
			forceNoToolSynthesisPass: true
		};
	}

	if (candidateFinalText && params.suppressedNoToolSynthesisToolCallCount === 0) {
		const finalAssistantText = enforceMutationOutcomeIntegrity(candidateFinalText, {
			contextType: params.contextType,
			toolExecutions: params.toolExecutions,
			latestUserText: params.latestUserText,
			explicitMutationRequested: params.mutationRequested,
			expectedWriteToolNames: params.expectedWriteToolNames
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

	return { action: 'failed', finishedReason: 'synthesis_failed' };
}

export type NoToolCallFinalizationResult =
	| {
			action: 'repair';
			kind:
				| 'project_create'
				| 'gateway_mutation'
				| 'skill_gate'
				| 'research_no_persist'
				| 'stated_future'
				| 'organize_commission';
			instruction: string;
	  }
	| { action: 'finalized'; finalAssistantText: string };

export async function runNoToolCallFinalization(params: {
	assistantBuffer: string;
	carriedTruncatedText: string;
	contextType: ChatContextType;
	toolExecutions: FastToolExecution[];
	latestUserText: string;
	mutationRequested?: boolean;
	expectedWriteToolNames?: string[];
	allowClarifyingQuestionWithoutWrite?: boolean;
	minimumSuccessfulWrites?: number;
	commissionedWriteToolNames?: readonly string[];
	gatewayModeActive: boolean;
	projectCreateStopRepairInjected: boolean;
	gatewayMutationStopRepairInjected: boolean;
	skillGateStopRepairInjected: boolean;
	researchNoPersistStopRepairInjected: boolean;
	statedFutureStopRepairInjected: boolean;
	organizeCommissionStopRepairInjected: boolean;
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
			latestUserText: params.latestUserText,
			explicitMutationRequested: params.mutationRequested,
			allowClarifyingQuestionWithoutWrite: params.allowClarifyingQuestionWithoutWrite,
			minimumSuccessfulWrites: params.minimumSuccessfulWrites,
			commissionedWriteToolNames: params.commissionedWriteToolNames
		})
	) {
		return {
			action: 'repair',
			kind: 'gateway_mutation',
			instruction: buildGatewayMutationNoExecutionRepairInstruction(
				params.toolExecutions,
				params.minimumSuccessfulWrites,
				params.commissionedWriteToolNames
			)
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
	// Runs after the skill gate: if a skill is still owed, load it first — the skill's contract
	// shapes what gets written, so repairing the write before the skill would persist
	// un-skill-grounded content and then have to rewrite it.
	if (
		shouldRepairResearchNoPersist({
			finalText: candidateFinalText,
			toolExecutions: params.toolExecutions,
			repairAlreadyInjected: params.researchNoPersistStopRepairInjected
		})
	) {
		return {
			action: 'repair',
			kind: 'research_no_persist',
			instruction: buildResearchNoPersistRepairInstruction(params.toolExecutions)
		};
	}

	// A commissioned reorganization may not end with zero writes: the failure mode is a turn that
	// reads everything, proposes a structure in prose, and moves nothing.
	if (
		shouldRepairOrganizeCommissionNoExecution({
			latestUserText: params.latestUserText,
			toolExecutions: params.toolExecutions,
			repairAlreadyInjected: params.organizeCommissionStopRepairInjected
		})
	) {
		return {
			action: 'repair',
			kind: 'organize_commission',
			instruction: buildOrganizeCommissionRepairInstruction(params.toolExecutions)
		};
	}

	// Last gate: the turn acted, but a future the user stated in the same breath was not recorded.
	if (
		shouldRepairStatedFutureNotRecorded({
			latestUserText: params.latestUserText,
			finalText: candidateFinalText,
			toolExecutions: params.toolExecutions,
			repairAlreadyInjected: params.statedFutureStopRepairInjected
		})
	) {
		return {
			action: 'repair',
			kind: 'stated_future',
			instruction: buildStatedFutureRepairInstruction()
		};
	}

	const finalAssistantText = enforceMutationOutcomeIntegrity(candidateFinalText, {
		contextType: params.contextType,
		toolExecutions: params.toolExecutions,
		latestUserText: params.latestUserText,
		explicitMutationRequested: params.mutationRequested,
		expectedWriteToolNames: params.expectedWriteToolNames
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
	mutationRequested?: boolean;
	expectedWriteToolNames?: string[];
	synthesisTransportFailure?: boolean;
	toolExecutions: FastToolExecution[];
	emitAssistantDelta: (content: string) => Promise<void>;
	emitAssistantRemainder: (content: string) => Promise<void>;
	observeSupervisor: (observation: TurnSupervisorObservation) => Promise<void>;
}): Promise<TerminalFinalizationResult> {
	let finalAssistantText = params.finalAssistantText;
	let finishedReason = params.finishedReason;
	let finalizationGuardResult: FinalizationGuardResult | undefined;
	let assistantText = params.assistantText;

	const mutationRequested =
		params.mutationRequested === true ||
		didTurnHaveUnfulfilledMutationIntent({
			latestUserText: params.latestUserText,
			toolExecutions: params.toolExecutions
		});

	if (params.toolLimitNotice) {
		const toolLimitFinalizationGuard = applyFinalizationGuard({
			finalAssistantText: '',
			assistantText: '',
			toolExecutions: params.toolExecutions,
			mutationRequested,
			expectedWriteToolNames: params.expectedWriteToolNames,
			synthesisTransportFailure: params.synthesisTransportFailure
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
			mutationRequested,
			expectedWriteToolNames: params.expectedWriteToolNames,
			synthesisTransportFailure: params.synthesisTransportFailure
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
