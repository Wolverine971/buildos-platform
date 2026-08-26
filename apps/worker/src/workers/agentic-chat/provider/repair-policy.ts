// apps/worker/src/workers/agentic-chat/provider/repair-policy.ts

import { READ_LOOP_REPAIR_RANK } from '@buildos/agentic-chat-runtime/loop';
import {
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	APPROVE_READ_ONLY_TURN_REVIEW_TOOL_NAME,
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME
} from '../tools/execution-adapter';
import type { AgenticChatTurnProviderRequestV1, AgenticChatTurnProviderToolV1 } from './contracts';
import { appendSystemInstruction } from './request-builders';
import { canRequirePreMutationSemanticDisposition } from './review/disposition';
import type { CompletedProviderToolCall } from './stream-tool-calls';

const UNAVAILABLE_SKILL_REPAIR_TOOL_NAMES = new Set(['skill_load', 'skill_search']);
const REVIEWER_ONLY_CONTROL_TOOL_NAMES = new Set([
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	APPROVE_READ_ONLY_TURN_REVIEW_TOOL_NAME,
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME
]);

export function buildUnavailableSkillRepairRequest(
	request: AgenticChatTurnProviderRequestV1,
	calls: readonly CompletedProviderToolCall[],
	admittedTools: readonly AgenticChatTurnProviderToolV1[]
): AgenticChatTurnProviderRequestV1 | null {
	if (request.unavailableSkillRepairAttempted || calls.length === 0) return null;
	const advertisedNames = new Set(request.tools.map((tool) => tool.function.name));
	const rejectedCalls = calls.filter((call) => !advertisedNames.has(call.name));
	if (
		rejectedCalls.length === 0 ||
		!rejectedCalls.every((call) => UNAVAILABLE_SKILL_REPAIR_TOOL_NAMES.has(call.name))
	) {
		return null;
	}
	const rejectedSkillNames = Array.from(new Set(rejectedCalls.map((call) => call.name))).sort();
	const unavailableSkillDescription =
		rejectedSkillNames.length === 1
			? `${rejectedSkillNames[0]} is not callable in this turn and the call was rejected without execution.`
			: `${rejectedSkillNames.join(', ')} are not callable in this turn and the calls were rejected without execution.`;
	const restoredRequest: AgenticChatTurnProviderRequestV1 = {
		...request,
		tools: admittedTools,
		toolChoice: 'required',
		providerRound: 'synthesis',
		semanticDispositionGate: false
	};
	if (!canRequirePreMutationSemanticDisposition(restoredRequest)) return null;
	return appendSystemInstruction(
		{
			...restoredRequest,
			logicalProviderRound: request.logicalProviderRound + 1,
			unavailableSkillRepairAttempted: true
		},
		[
			`Unavailable worker skill repair: the previous pass called an unavailable skill tool, but ${unavailableSkillDescription}`,
			`Do not call ${rejectedSkillNames.join(' or ')} again. The exact admitted worker surface has been restored; use only the tools present in this request.`,
			'Choose a semantic disposition control before any mutation. Use an available read only when durable context is genuinely missing, and request clarification only when a required user choice remains unresolved.'
		].join(' ')
	);
}

/**
 * The acting model sees reviewer approvals in its own transcript and may
 * imitate them. One bounded repair restores the acting surface and makes the
 * reviewer/actor ownership explicit without discarding an approved contract.
 */
export function buildReviewerMimicryRepairRequest(
	request: AgenticChatTurnProviderRequestV1,
	calls: readonly CompletedProviderToolCall[]
): AgenticChatTurnProviderRequestV1 | null {
	if (request.unavailableSkillRepairAttempted || calls.length === 0) return null;
	const advertisedNames = new Set(request.tools.map((tool) => tool.function.name));
	const rejectedCalls = calls.filter((call) => !advertisedNames.has(call.name));
	if (
		rejectedCalls.length === 0 ||
		!rejectedCalls.every((call) => REVIEWER_ONLY_CONTROL_TOOL_NAMES.has(call.name))
	) {
		return null;
	}
	const names = Array.from(new Set(rejectedCalls.map((call) => call.name))).sort();
	return appendSystemInstruction(
		{
			...request,
			logicalProviderRound: request.logicalProviderRound + 1,
			unavailableSkillRepairAttempted: true
		},
		[
			`${names.join(', ')} ${names.length === 1 ? 'is a reviewer-only control and was' : 'are reviewer-only controls and were'} rejected without execution: the independent reviewer calls it, never you.`,
			'You propose mutation calls; the reviewer approves them. Continue with the tools present in this request: propose the remaining mutations for the approved contract, or finish with your answer if every outcome is already executed.'
		].join(' ')
	);
}

export function contextSaturationRepairRank(
	status: 'open' | 'narrowing' | 'saturated' | 'must_synthesize'
): number {
	if (status === 'narrowing') return READ_LOOP_REPAIR_RANK.nudge;
	if (status === 'saturated') return READ_LOOP_REPAIR_RANK.stop_and_answer;
	if (status === 'must_synthesize') return READ_LOOP_REPAIR_RANK.must_synthesize;
	return 0;
}
