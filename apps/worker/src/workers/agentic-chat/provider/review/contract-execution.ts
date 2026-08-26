// apps/worker/src/workers/agentic-chat/provider/review/contract-execution.ts
import {
	type TurnContract,
	getSafeWriteToolNamesForTurnContract,
	resolveTurnContractOutcome
} from '@buildos/agentic-chat-runtime/loop';
import type { AgenticChatTurnProviderRequestV1, AgenticChatTurnProviderToolV1 } from '../contracts';
import { appendSystemInstruction } from '../request-builders';

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
	const safeToolNames = new Set(getSafeWriteToolNamesForTurnContract(unfinishedContract));
	const writeTools = availableTools.filter((tool) => safeToolNames.has(tool.function.name));
	if (writeTools.length === 0) return null;
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
		return `- ${outcome.id}: ${outcome.action} ${outcome.entityKind}${targets}${destination}${missing}`;
	});
	return {
		...appendSystemInstruction(
			request,
			[
				'The independently approved contract is not finished: the outcomes below have no durable effect yet. Your previous prose was withheld.',
				unfinished.join('\n'),
				`Execute them now with the available contract write tools (${writeTools.map((tool) => tool.function.name).join(', ')}), one call per target, using the resolved ids above. Do not restate the plan, do not re-declare the contract, and do not finish until every listed outcome has been executed or you have named the exact blocker.`
			].join('\n')
		),
		tools: writeTools,
		toolChoice: 'auto',
		providerRound: 'synthesis'
	};
}

export function buildTurnContractWriteCarveOutRequest(
	request: AgenticChatTurnProviderRequestV1,
	availableTools: readonly AgenticChatTurnProviderToolV1[],
	contract: TurnContract
): AgenticChatTurnProviderRequestV1 | null {
	const safeToolNames = new Set(getSafeWriteToolNamesForTurnContract(contract));
	// Child creates require the durable project id returned by the shell. Keep
	// the first approved mutation phase structurally incapable of inventing that
	// id or racing goal/task calls alongside create_onto_project. Completion
	// routing mounts only the unresolved child tools after the shell succeeds.
	const firstPhaseToolNames =
		request.contextType === 'project_create' && safeToolNames.has('create_onto_project')
			? new Set(['create_onto_project'])
			: safeToolNames;
	const writeTools = availableTools.filter((tool) => firstPhaseToolNames.has(tool.function.name));
	if (writeTools.length === 0) return null;

	const next = appendSystemInstruction(
		request,
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
		tools: writeTools,
		toolChoice: 'auto',
		providerRound: 'synthesis'
	};
}
