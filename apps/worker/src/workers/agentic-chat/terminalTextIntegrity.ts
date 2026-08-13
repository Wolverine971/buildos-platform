// apps/worker/src/workers/agentic-chat/terminalTextIntegrity.ts
import {
	type FastToolExecution,
	collectGatewayWriteIntentOps,
	enforceMutationOutcomeIntegrity,
	looksLikeExplicitMutationRequest
} from '@buildos/agentic-chat-runtime/loop';
import {
	type FinalizationGuardResult,
	applyFinalizationGuard
} from '@buildos/agentic-chat-runtime/supervisor';

export type AgenticChatTerminalTextIntegrityResultV1 = {
	assistantText: string;
	finishedReason: string;
	correctionDelta: string | null;
	finalizationGuard: FinalizationGuardResult | null;
};

/**
 * Apply the same deterministic terminal safety floors as the legacy loop after
 * every provider/tool round is durable and before the worker's terminal CAS.
 *
 * The worker artifact does not yet carry the legacy turn-intent write minimum
 * or commissioned tool list, so this deliberately uses only facts available
 * without prompt-text reconstruction: the raw admitted user message, context,
 * and the generation-fenced tool ledger.
 */
export function enforceAgenticChatTerminalTextIntegrityV1(input: {
	assistantText: string;
	finishedReason: string;
	contextType: string;
	userMessage: string;
	toolExecutions: FastToolExecution[];
}): AgenticChatTerminalTextIntegrityResultV1 {
	if (input.finishedReason === 'supervisor_question') {
		return {
			assistantText: input.assistantText,
			finishedReason: input.finishedReason,
			correctionDelta: null,
			finalizationGuard: null
		};
	}

	const mutationRequested =
		looksLikeExplicitMutationRequest(input.userMessage) ||
		collectGatewayWriteIntentOps(input.toolExecutions).length > 0;
	const integrityText = enforceMutationOutcomeIntegrity(input.assistantText, {
		contextType: input.contextType,
		toolExecutions: input.toolExecutions,
		latestUserText: input.userMessage,
		explicitMutationRequested: mutationRequested
	});
	const guard = applyFinalizationGuard({
		finalAssistantText: integrityText,
		assistantText: input.assistantText,
		toolExecutions: input.toolExecutions,
		mutationRequested
	});
	const assistantText = guard.applied ? guard.text : integrityText;
	const finishedReason =
		guard.finishedReason && input.finishedReason === 'stop'
			? guard.finishedReason
			: input.finishedReason;

	return {
		assistantText,
		finishedReason,
		correctionDelta: buildCorrectionDelta(input.assistantText, assistantText),
		finalizationGuard: guard.applied ? guard : null
	};
}

function buildCorrectionDelta(emittedText: string, finalText: string): string | null {
	const emitted = emittedText.trim();
	const final = finalText.trim();
	if (!final || final === emitted) return null;
	if (!emitted) return final;
	if (final.startsWith(emitted)) {
		const remainder = final.slice(emitted.length);
		return remainder.trim() ? remainder : null;
	}
	return `\n\n${final}`;
}
