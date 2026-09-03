// apps/worker/src/workers/agentic-chat/provider/review/disposition.ts
import {
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	DECLARE_TURN_CONTRACT_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import { isPureReadToolName } from '@buildos/agentic-chat-runtime/loop';
import { reviewedAgenticChatMutationSpecV1 } from '../../mutationToolCatalog';
import type { AgenticChatTurnProviderRequestV1, AgenticChatTurnProviderToolV1 } from '../contracts';
import { providerError } from '../protocol';
import { appendSystemInstruction, forceToolFreeRequest } from '../request-builders';
import type { CompletedProviderToolCall } from '../stream-tool-calls';
import { surfaceFor } from '../turn-phase';
import { ACTOR_COMMISSION_GUIDANCE } from './controls';
import { projectCreateShellGuidance } from './turn-contract';

export function canRequirePreMutationSemanticDisposition(
	request: AgenticChatTurnProviderRequestV1
): boolean {
	const toolNames = new Set(request.tools.map((tool) => tool.function.name));
	return (
		toolNames.has(DECLARE_TURN_CONTRACT_TOOL_NAME) &&
		toolNames.has(REQUEST_TURN_CLARIFICATION_TOOL_NAME) &&
		request.tools.some((tool) => reviewedAgenticChatMutationSpecV1(tool.function.name))
	);
}

export function buildProjectCreateInitialContractGateRequest(
	request: AgenticChatTurnProviderRequestV1
): AgenticChatTurnProviderRequestV1 | null {
	if (
		request.contextType !== 'project_create' ||
		!request.tools.some((tool) => tool.function.name === 'create_onto_project')
	) {
		return null;
	}
	const gate = buildSemanticTurnDispositionGateRequest(request, request.tools, {
		allowReads: false
	});
	if (!gate) return null;
	return appendSystemInstruction(
		gate,
		projectCreateShellGuidance(request.contextType, request.tools).join(' ')
	);
}

export function buildSemanticTurnDispositionGateRequest(
	request: AgenticChatTurnProviderRequestV1,
	availableTools: readonly AgenticChatTurnProviderToolV1[],
	options: { allowReads?: boolean } = {}
): AgenticChatTurnProviderRequestV1 | null {
	const allowReads = options.allowReads !== false;
	const surface = surfaceFor('disposition_gate', availableTools, { allowReads });
	if (!surface) return null;
	return {
		...appendSystemInstruction(
			request,
			[
				'Semantic disposition gate: when the evidence is sufficient, choose exactly one control tool from the meaning of the current user request and loaded context.',
				...(allowReads
					? [
							'If more durable context is required for that decision, call only the available pure-read tools, then return to this gate. Never guess, call a mutation, or mix a disposition control with reads in one pass.'
						]
					: [
							'Context gathering is over for this turn. Choose a disposition now; no more read tools are available in this gate. Never guess or call a mutation.'
						]),
				'Call declare_turn_contract only when the user commissioned a durable data change and every required target and value is resolved enough for safe execution.',
				'Call request_turn_clarification when a durable change was commissioned but a required user choice remains unresolved after reading, including multiple plausible targets. Never guess among plausible choices. When loaded context identifies a finite candidate set, include every candidate with its stable ID when available and name every candidate label in the question.',
				'A descriptive reference is safely resolved only when the user message and loaded context identify one plausible target. If several loaded entities fit, a prior assistant mention, ordering, or proposed tool target does not choose one for the user.',
				// The acting gate gets the five-line actor register; the full
				// reviewer-register guidance stays in reviewer prompts only.
				...ACTOR_COMMISSION_GUIDANCE,
				'A proposal or request for approval is not read-only when the user already commissioned the action.',
				'Describe semantic outcomes and real cardinality, not implementation steps or tool names. Declare one outcome per distinct change: targets that receive different values belong in separate outcomes.'
			].join(' ')
		),
		...surface,
		providerRound: 'synthesis',
		passRole: 'acting',
		semanticDispositionGate: true
	};
}

export function buildPostSemanticDispositionRequest(
	request: AgenticChatTurnProviderRequestV1,
	availableTools: readonly AgenticChatTurnProviderToolV1[],
	dispositionToolName: string
): AgenticChatTurnProviderRequestV1 {
	if (dispositionToolName === DECLARE_TURN_CONTRACT_TOOL_NAME) {
		return {
			...request,
			...surfaceFor('contract_declared', availableTools)!,
			semanticDispositionGate: false
		};
	}
	if (dispositionToolName === DECLARE_READ_ONLY_TURN_TOOL_NAME) {
		return {
			...request,
			...surfaceFor('read_only_declared', availableTools)!,
			providerRound: 'synthesis',
			semanticDispositionGate: false
		};
	}
	return appendSystemInstruction(
		forceToolFreeRequest({ ...request, semanticDispositionGate: false }),
		'Clarification is required. Ask the unresolved question now and wait for the user; do not perform a durable mutation in this turn. Ask it plainly as your own question in one or two sentences; do not narrate internal review, contracts, approvals, or self-corrections.'
	);
}

export function requestOffersSemanticDisposition(
	request: AgenticChatTurnProviderRequestV1
): boolean {
	return request.tools.some((tool) => isSemanticDispositionToolName(tool.function.name));
}

export function callsIncludeSemanticDisposition(
	calls: readonly CompletedProviderToolCall[]
): boolean {
	return calls.some((call) => isSemanticDispositionToolName(call.name));
}

/**
 * Two dispositions in one pass used to be a permanent
 * `provider_semantic_disposition_invalid`. The first one is the model's
 * decision; the rest are dropped without execution and the model is told so
 * on its next pass. Mixing reads with a disposition on a gate pass, or a gate
 * pass with no disposition at all, still fails closed below.
 */
export function reconcileSemanticDispositionCalls(
	calls: readonly CompletedProviderToolCall[],
	gateRequired: boolean
): { calls: readonly CompletedProviderToolCall[]; notice: string | null } {
	const dispositions = calls.filter((call) => isSemanticDispositionToolName(call.name));
	if (dispositions.length <= 1) {
		assertSemanticDispositionCalls(calls, gateRequired);
		return { calls, notice: null };
	}
	const kept = dispositions[0]!;
	const dropped = new Set(dispositions.slice(1));
	const reconciled = calls.filter((call) => !dropped.has(call));
	assertSemanticDispositionCalls(reconciled, gateRequired);
	const droppedNames = Array.from(new Set([...dropped].map((call) => call.name))).sort();
	return {
		calls: reconciled,
		notice: [
			`Disposition repair: the previous pass called ${dispositions.map((call) => call.name).join(' and ')} together.`,
			`Exactly one disposition is allowed per pass; only the first, ${kept.name}, was taken and ${droppedNames.join(', ')} ${droppedNames.length === 1 ? 'was' : 'were'} rejected without execution.`,
			'Continue from that disposition and do not call another disposition control in this turn unless the harness asks for one.'
		].join(' ')
	};
}

export function assertSemanticDispositionCalls(
	calls: readonly CompletedProviderToolCall[],
	gateRequired: boolean
): void {
	const dispositions = calls.filter((call) => isSemanticDispositionToolName(call.name));
	const pureReadContinuation =
		calls.length > 0 &&
		dispositions.length === 0 &&
		calls.every((call) => isPureReadToolName(call.name));
	if (
		dispositions.length > 1 ||
		(gateRequired && !pureReadContinuation && (calls.length !== 1 || dispositions.length !== 1))
	) {
		throw providerError('provider_semantic_disposition_invalid', 'permanent');
	}
}

export function isSemanticDispositionToolName(toolName: string): boolean {
	return (
		toolName === DECLARE_TURN_CONTRACT_TOOL_NAME ||
		toolName === DECLARE_READ_ONLY_TURN_TOOL_NAME ||
		toolName === REQUEST_TURN_CLARIFICATION_TOOL_NAME
	);
}
