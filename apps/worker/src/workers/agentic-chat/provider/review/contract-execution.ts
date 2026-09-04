// apps/worker/src/workers/agentic-chat/provider/review/contract-execution.ts
import { type TurnContract, resolveTurnContractOutcome } from '@buildos/agentic-chat-runtime/loop';
import type { AgenticChatTurnProviderRequestV1, AgenticChatTurnProviderToolV1 } from '../contracts';
import { TOOL_EXECUTION_BATCHING_INSTRUCTION, appendSystemInstruction } from '../request-builders';
import { surfaceFor } from '../turn-phase';

export function buildContractCompletionRequest(
	request: AgenticChatTurnProviderRequestV1,
	availableTools: readonly AgenticChatTurnProviderToolV1[],
	contract: TurnContract,
	resolution: ReturnType<typeof resolveTurnContractOutcome>,
	labelBindings: ReadonlyMap<string, string>
): AgenticChatTurnProviderRequestV1 | null {
	const unfinishedOutcomes = contract.outcomes
		.map((outcome, index) => ({ outcome, result: resolution.outcomes[index] }))
		.filter(({ result }) => result && !result.fulfilled);
	if (unfinishedOutcomes.length === 0) return null;
	const unfinishedContract: TurnContract = {
		...contract,
		outcomes: unfinishedOutcomes.map(({ outcome }) => outcome)
	};
	const surface = surfaceFor('completion', availableTools, { contract: unfinishedContract });
	if (!surface) return null;
	const writeTools = surface.tools;
	const declaredTitle = (label: string | undefined): string | undefined =>
		label
			? contract.outcomes
					.find((outcome) => outcome.label === label)
					?.changes?.find((change) => change.field === 'title')?.value
			: undefined;
	const unfinished = unfinishedOutcomes.map(({ outcome, result }) => {
		const destination = outcome.parentLabel
			? ` into the folder labelled "${outcome.parentLabel}"` +
				(labelBindings.get(outcome.parentLabel)
					? ` (new_parent_id ${labelBindings.get(outcome.parentLabel)}` +
						(declaredTitle(outcome.parentLabel)
							? `, title "${declaredTitle(outcome.parentLabel)}")`
							: ')')
					: declaredTitle(outcome.parentLabel)
						? ` (not created yet; use new_parent_title "${declaredTitle(outcome.parentLabel)}")`
						: '')
			: '';
		const targets =
			outcome.targetIds.length > 0 ? ` targets [${outcome.targetIds.join(', ')}]` : '';
		const missing = result?.missingTargetIds.length
			? ` still missing [${result.missingTargetIds.join(', ')}]`
			: '';
		const endpoints = [
			['src_id', outcome.srcLabel],
			['dst_id', outcome.dstLabel]
		]
			.filter(([, label]) => label)
			.map(
				([field, label]) =>
					`${field}=${labelBindings.get(label!) ?? `pending create ${label}`}`
			)
			.join(', ');
		return `- ${outcome.id}: ${outcome.action} ${outcome.entityKind}${targets}${destination}${missing}${endpoints ? ` (${endpoints})` : ''}`;
	});
	return {
		...appendSystemInstruction(
			// The sidecars below are the only reason the batching instruction is
			// mounted; the base surface no longer carries either. It precedes the
			// phase instruction so the last system message stays the phase order.
			appendSystemInstruction(request, TOOL_EXECUTION_BATCHING_INSTRUCTION),
			[
				'The independently approved contract is not finished: the outcomes below have no durable effect yet. Your previous prose was withheld.',
				unfinished.join('\n'),
				`Execute them now with the available contract write tools (${writeTools.map((tool) => tool.function.name).join(', ')}), one call per target, using the resolved ids above. Do not restate the plan, do not re-declare the contract, and do not finish until every listed outcome has been executed or you have named the exact blocker.`
			].join('\n')
		),
		// Scheduling sidecars (call_ref/after) exist only for multi-write passes;
		// this is one of the two places they are legal (Finding 9, 2026-09-02).
		...surface,
		providerRound: 'synthesis',
		passRole: 'acting'
	};
}

export function buildTurnContractWriteCarveOutRequest(
	request: AgenticChatTurnProviderRequestV1,
	availableTools: readonly AgenticChatTurnProviderToolV1[],
	contract: TurnContract
): AgenticChatTurnProviderRequestV1 | null {
	const surface = surfaceFor('contract_carve_out', availableTools, {
		contract,
		contextType: request.contextType
	});
	if (!surface) return null;
	const writeTools = surface.tools;

	const next = appendSystemInstruction(
		appendSystemInstruction(request, TOOL_EXECUTION_BATCHING_INSTRUCTION),
		[
			'Supervisor exception: the model declared durable turn outcomes and no mutation has reached execution yet.',
			'Any earlier instruction to stop calling tools is superseded for exactly this one pass.',
			`Use only the available contract write tools (${writeTools.map((tool) => tool.function.name).join(', ')}) and execute the declared outcomes now; make every distinct effect the contract requires.`,
			`Declared semantic contract: ${JSON.stringify(contract)}`,
			'Use only canonical target identifiers returned by completed reads. Never invent an identifier.',
			'Do not call reads, searches, schemas, skills, or any other discovery tool in this pass.'
		].join(' ')
	);
	return {
		...next,
		...surface,
		providerRound: 'synthesis',
		passRole: 'acting'
	};
}
