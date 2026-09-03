// apps/worker/src/workers/agentic-chat/terminalTextIntegrity.ts
import {
	type FastToolExecution,
	type FinalizationGuardResult,
	type TurnContract,
	type UnfulfilledMutationOutcomeDisclosureV1,
	applyFinalizationGuard,
	collectGatewayWriteIntentOps,
	enforceMutationOutcomeIntegrity,
	resolveTurnContractFromExecutions,
	resolveTurnContractOutcome
} from '@buildos/agentic-chat-runtime/loop';

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
	const turnContract = resolveTurnContractFromExecutions(input.toolExecutions);
	const mutationRequested =
		turnContract !== null || collectGatewayWriteIntentOps(input.toolExecutions).length > 0;
	// Declared outcomes the ledger cannot prove complete are computed here, before
	// the text floors run, so partial fulfilment (2 of 6 moves) is disclosed to the
	// user and marks the turn instead of living only in message metadata.
	const unfulfilledOutcomes = collectUnfulfilledOutcomeDisclosures(
		turnContract,
		input.toolExecutions,
		input.finishedReason
	);
	const integrityText = enforceMutationOutcomeIntegrity(input.assistantText, {
		contextType: input.contextType,
		toolExecutions: input.toolExecutions,
		explicitMutationRequested: mutationRequested,
		unfulfilledOutcomes
	});
	const guard = applyFinalizationGuard({
		finalAssistantText: integrityText,
		assistantText: input.assistantText,
		toolExecutions: input.toolExecutions,
		mutationRequested,
		unfulfilledOutcomes
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

/**
 * Pair every unfulfilled declared outcome with the ids the contract matcher
 * could not match, named by title when any tool result in this turn carried
 * one. Titles come only from durable tool evidence, never from prose.
 */
function collectUnfulfilledOutcomeDisclosures(
	contract: TurnContract | null,
	toolExecutions: FastToolExecution[],
	finishedReason: string
): UnfulfilledMutationOutcomeDisclosureV1[] {
	if (!contract) return [];
	const resolution = resolveTurnContractOutcome({ contract, toolExecutions, finishedReason });
	if (resolution.fulfilled) return [];
	const outcomesById = new Map(contract.outcomes.map((outcome) => [outcome.id, outcome]));
	let titles: Map<string, string> | null = null;
	const disclosures: UnfulfilledMutationOutcomeDisclosureV1[] = [];
	for (const result of resolution.outcomes) {
		if (result.fulfilled) continue;
		const outcome = outcomesById.get(result.id);
		if (!outcome) continue;
		titles ??= collectEntityTitlesFromToolExecutions(toolExecutions);
		disclosures.push({
			action: outcome.action,
			entityKind: outcome.entityKind,
			...(outcome.description ? { description: outcome.description } : {}),
			declaredTargetCount: outcome.targetIds.length,
			completedTargetCount: result.matchedEffects,
			requiredEffects: result.requiredEffects,
			missingTargets: result.missingTargetIds.map((id) => ({
				id,
				title: titles?.get(id) ?? null
			}))
		});
	}
	return disclosures;
}

const MAX_TITLE_WALK_DEPTH = 6;
const MAX_TITLE_ENTRIES = 2000;

function collectEntityTitlesFromToolExecutions(
	toolExecutions: FastToolExecution[]
): Map<string, string> {
	const titles = new Map<string, string>();
	for (const execution of toolExecutions) {
		if (execution.result.success !== true) continue;
		collectEntityTitles(execution.result.result, titles, 0);
		if (titles.size >= MAX_TITLE_ENTRIES) break;
	}
	return titles;
}

function collectEntityTitles(payload: unknown, titles: Map<string, string>, depth: number): void {
	if (!payload || typeof payload !== 'object' || depth > MAX_TITLE_WALK_DEPTH) return;
	if (titles.size >= MAX_TITLE_ENTRIES) return;
	if (Array.isArray(payload)) {
		for (const item of payload) collectEntityTitles(item, titles, depth + 1);
		return;
	}
	const record = payload as Record<string, unknown>;
	const id = typeof record.id === 'string' ? record.id.trim() : '';
	const title =
		typeof record.title === 'string'
			? record.title.trim()
			: typeof record.name === 'string'
				? record.name.trim()
				: '';
	if (id && title && !titles.has(id)) titles.set(id, title);
	for (const nested of Object.values(record)) {
		if (nested && typeof nested === 'object') collectEntityTitles(nested, titles, depth + 1);
	}
}
