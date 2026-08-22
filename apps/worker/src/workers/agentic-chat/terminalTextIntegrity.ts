// apps/worker/src/workers/agentic-chat/terminalTextIntegrity.ts
import {
	type FastToolExecution,
	collectGatewayWriteIntentOps,
	enforceMutationOutcomeIntegrity,
	resolveTurnContractFromExecutions
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
 * Mutation state comes only from structured control/write executions. Natural
 * language is interpreted by the reviewed semantic-disposition path, not by a
 * second regex classifier at finalization.
 */
export function enforceAgenticChatTerminalTextIntegrityV1(input: {
	assistantText: string;
	finishedReason: string;
	contextType: string;
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
		resolveTurnContractFromExecutions(input.toolExecutions) !== null ||
		collectGatewayWriteIntentOps(input.toolExecutions).length > 0;
	const integrityText = enforceMutationOutcomeIntegrity(input.assistantText, {
		contextType: input.contextType,
		toolExecutions: input.toolExecutions,
		explicitMutationRequested: mutationRequested
	});
	const guard = applyFinalizationGuard({
		finalAssistantText: integrityText,
		assistantText: input.assistantText,
		toolExecutions: input.toolExecutions,
		mutationRequested
	});
	const guardedAssistantText = guard.applied ? guard.text : integrityText;
	const finishedReason =
		guard.finishedReason && input.finishedReason === 'stop'
			? guard.finishedReason
			: input.finishedReason;
	const correctionDelta = buildCorrectionDelta(input.assistantText, guardedAssistantText);
	// Stream text is append-only. When a terminal guard replaces an already-emitted
	// answer, the correction is appended rather than substituted, so finalization
	// must persist the exact resulting stream prefix as well.
	const assistantText =
		correctionDelta === null ? input.assistantText : `${input.assistantText}${correctionDelta}`;

	return {
		assistantText,
		finishedReason,
		correctionDelta,
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
