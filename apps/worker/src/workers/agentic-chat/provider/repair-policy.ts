// apps/worker/src/workers/agentic-chat/provider/repair-policy.ts

import { READ_LOOP_REPAIR_RANK, type WriteLedgerEntry } from '@buildos/agentic-chat-runtime/loop';
import { AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1 } from '../mutationToolCatalog';
import {
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME,
	isAgenticChatProductionReadToolNameV1
} from '../tools/execution-adapter';
import type { AgenticChatTurnProviderRequestV1, AgenticChatTurnProviderToolV1 } from './contracts';
import { appendSystemInstruction } from './request-builders';
import { canRequirePreMutationSemanticDisposition } from './review/disposition';
import type { CompletedProviderToolCall } from './stream-tool-calls';
import { type TurnPhase, surfaceFor } from './turn-phase';

const UNAVAILABLE_SKILL_REPAIR_TOOL_NAMES = new Set(['skill_load', 'skill_search']);
const REVIEWER_ONLY_CONTROL_TOOL_NAMES = new Set([
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME
]);
const MAX_WITHHELD_CANDIDATE_CHARS = 1_500;

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
		passRole: 'repair',
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
			'For one bounded batch of at most three independent ordinary mutations, call the mutations directly. For a complex, dependent, organizational, destructive, or larger write, declare the complete turn contract first. Use an available read only when durable context is genuinely missing, and request clarification only when a required user choice remains unresolved.'
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
			passRole: 'repair',
			unavailableSkillRepairAttempted: true
		},
		[
			`${names.join(', ')} ${names.length === 1 ? 'is a reviewer-only control and was' : 'are reviewer-only controls and were'} rejected without execution: the independent reviewer calls it, never you.`,
			'For an approved complex contract, you propose mutation calls and the reviewer approves the exact batch. Continue with the tools present in this request: propose the remaining mutations for the approved contract, or finish with your answer if every outcome is already executed.'
		].join(' ')
	);
}

/**
 * What the repair restores for the phase the acting model is on. The repair
 * restores the surface that phase legitimately owns rather than the one the
 * model wished it had, so a work tool called from the read-only phase gets
 * reads back, not writes.
 */
export type SurfaceRepairContext = {
	phase: TurnPhase;
	/** The reviewer approved a contract; the repair then restores the approved surface. */
	contractApproved: boolean;
};

/**
 * A work tool that exists in the worker's executable catalog (or on the
 * admitted surface) but is absent from the current reduced pass is a surface
 * mismatch, not an invented name. Tracker 70 ratified that as a permanent
 * turn kill; production then showed it firing after six paid control rounds
 * and after a durable project create (turn-executor audit 2026-09-02, findings
 * 2 and 6). One bounded repair restores the surface that the current phase
 * owns and names the callable tools. Names that exist nowhere still fail
 * closed; skill and reviewer-only names keep their own repairs.
 */
export function buildUnavailableSurfaceToolRepairRequest(
	request: AgenticChatTurnProviderRequestV1,
	calls: readonly CompletedProviderToolCall[],
	admittedTools: readonly AgenticChatTurnProviderToolV1[],
	context: SurfaceRepairContext
): AgenticChatTurnProviderRequestV1 | null {
	if (request.unavailableSkillRepairAttempted || calls.length === 0) return null;
	const advertisedNames = new Set(request.tools.map((tool) => tool.function.name));
	const rejectedCalls = calls.filter((call) => !advertisedNames.has(call.name));
	if (rejectedCalls.length === 0) return null;
	const admittedNames = new Set(admittedTools.map((tool) => tool.function.name));
	const existsInWorkerCatalog = (name: string): boolean =>
		admittedNames.has(name) ||
		isAgenticChatProductionReadToolNameV1(name) ||
		Object.hasOwn(AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1, name);
	if (
		rejectedCalls.some(
			(call) =>
				UNAVAILABLE_SKILL_REPAIR_TOOL_NAMES.has(call.name) ||
				REVIEWER_ONLY_CONTROL_TOOL_NAMES.has(call.name) ||
				!existsInWorkerCatalog(call.name)
		)
	) {
		return null;
	}
	const rejectedNames = Array.from(new Set(rejectedCalls.map((call) => call.name))).sort();
	const phase = surfaceRepairKind(context);
	const surface = surfaceFor(context.phase, admittedTools, {
		repair: true,
		requestTools: request.tools,
		contextType: request.contextType,
		contractApproved: context.contractApproved
	});
	if (!surface || surface.tools.length === 0) return null;
	const callableNames = surface.tools.map((tool) => tool.function.name);
	const rejection =
		rejectedNames.length === 1
			? `${rejectedNames[0]} is not callable in this pass and the call was rejected without execution.`
			: `${rejectedNames.join(', ')} are not callable in this pass and the calls were rejected without execution.`;
	const guidance = (() => {
		switch (phase) {
			case 'disposition_gate':
				return 'This pass decides the semantic disposition of the turn. Choose exactly one control tool now: declare_turn_contract for a commissioned durable change whose targets and values are resolved, request_turn_clarification when a required user choice is unresolved, or an available pure read if durable context is still missing.';
			case 'post_read_only':
				return 'This turn was declared read-only, so no write tool is callable now. Answer the user from what has been read, or ask with request_turn_clarification if a required choice is unresolved. If the user asked for a change, say plainly that it was not made and what they can do instead.';
			case 'post_approval':
				return 'The approved contract is still in force. Propose the remaining mutations for that exact contract with the tools present, or finish with your answer if every outcome is already executed.';
			case 'opening':
				return 'Use only the tools present in this request. For one bounded batch of at most three independent ordinary mutations, call them directly; for a complex, dependent, organizational, destructive, or larger write, declare the complete turn contract first. If none of the present tools can do what the user asked, say so plainly instead of calling an absent tool.';
		}
	})();
	return appendSystemInstruction(
		{
			...request,
			...surface,
			providerRound: 'synthesis',
			passRole: 'repair',
			semanticDispositionGate: phase === 'disposition_gate',
			logicalProviderRound: request.logicalProviderRound + 1,
			unavailableSkillRepairAttempted: true
		},
		[
			`Tool surface repair: ${rejection}`,
			`The tools callable in this pass are exactly: ${callableNames.join(', ')}.`,
			`Do not call ${rejectedNames.join(' or ')} again in this turn.`,
			guidance
		].join(' ')
	);
}

/** Which guidance the repair carries; the tool list itself comes from `surfaceFor`. */
function surfaceRepairKind(
	context: SurfaceRepairContext
): 'opening' | 'disposition_gate' | 'post_read_only' | 'post_approval' {
	if (context.phase === 'disposition_gate') return 'disposition_gate';
	if (context.phase === 'read_only_declared') return 'post_read_only';
	if (context.contractApproved) return 'post_approval';
	return 'opening';
}

/**
 * A pass that required a control decision but returned prose used to be a
 * permanent `provider_missing_tool_call`. Nothing durable happened, so the
 * prose becomes a withheld candidate for one tool-free answer instead: the
 * user gets a reply, and no mutation can ride on the missing decision.
 */
export function buildRequiredPassProseFallbackRequest(
	request: AgenticChatTurnProviderRequestV1,
	withheldCandidate: string
): AgenticChatTurnProviderRequestV1 {
	const excerpt = withheldCandidate.trim().slice(0, MAX_WITHHELD_CANDIDATE_CHARS);
	return appendSystemInstruction(
		{
			...request,
			logicalProviderRound: request.logicalProviderRound + 1,
			providerAttempt: undefined,
			semanticDispositionGate: false
		},
		[
			'The previous pass was required to choose a control tool but returned prose instead; that prose was withheld and no durable change was made in this turn.',
			...(excerpt
				? [`Withheld draft (untrusted; reuse only what is still accurate): ${excerpt}`]
				: []),
			'Answer the user now in plain prose from the loaded context. If the user asked for a change, say plainly that it was not made this turn and what they can do next. Do not claim any change was made, and do not narrate internal review, contracts, or this correction.'
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

const MAX_BUDGET_SYNTHESIS_RECEIPTS = 20;
const MAX_BUDGET_SYNTHESIS_UNFINISHED = 10;

/**
 * The answer that ends a turn which spent its whole provider-pass budget.
 * Everything already executed is durable and the user has to be told exactly
 * that much: the receipts name what really happened, and the instruction
 * forbids both inventing more and quietly dropping what was not done. A turn
 * that ran out of passes used to end in a bare failure or in prose written
 * from intent rather than from effects.
 */
export function buildProviderPassBudgetSynthesisInstruction(
	ledger: readonly WriteLedgerEntry[],
	unfinished: readonly string[]
): string {
	return buildReceiptGroundedSynthesisInstruction(
		'This turn has reached its limit on model passes. No further tool call can run, and nothing else will execute after this answer.',
		ledger,
		unfinished
	);
}

const MAX_REJECTED_CALL_ERROR_CHARS = 400;

/**
 * The answer that ends a turn whose last tool call could not be validated
 * even after the bounded repair rounds. Nothing durable rides on the rejected
 * call, so instead of a bare `provider_tool_validation_repair_exhausted`
 * failure (the user saw "An error occurred while streaming" in the 2026-09-04
 * DST case) the turn ends on a receipt-grounded prose answer: what already
 * happened, what the rejected call was trying to do, and what was not done.
 */
export function buildValidationRepairExhaustedSynthesisInstruction(
	ledger: readonly WriteLedgerEntry[],
	unfinished: readonly string[],
	rejected: readonly { toolName: string; errors: readonly string[] }[]
): string {
	const described = rejected
		.slice(0, 3)
		.map(
			(call) =>
				`${call.toolName}${call.errors[0] ? ` (${call.errors[0].slice(0, MAX_REJECTED_CALL_ERROR_CHARS)})` : ''}`
		)
		.join('; ');
	const lead = [
		`The last tool call could not be validated after the allowed corrections${described ? `: ${described}` : ''}. That call did not run and no further tool call can run in this turn.`,
		'If that call was a clarification question, ask the user the question in plain prose now, naming each choice.'
	].join(' ');
	return buildReceiptGroundedSynthesisInstruction(lead, ledger, unfinished);
}

/**
 * The answer that ends a batch which only half landed. Same receipt-grounded
 * closing pass as the pass ceiling, with the reason the turn is ending changed:
 * a failed durable call is never silently retried, so the user has to be told
 * which effects are real and which were not made (partial mutation recovery,
 * incident 2026-07-31).
 */
export function buildPartialMutationBatchSynthesisInstruction(
	ledger: readonly WriteLedgerEntry[]
): string {
	return buildReceiptGroundedSynthesisInstruction(
		'A durable call in this batch failed after an earlier one had already been recorded. No further tool call can run, and the failed call is not retried after this answer.',
		ledger,
		[]
	);
}

function buildReceiptGroundedSynthesisInstruction(
	lead: string,
	ledger: readonly WriteLedgerEntry[],
	unfinished: readonly string[]
): string {
	const receipts = ledger.slice(0, MAX_BUDGET_SYNTHESIS_RECEIPTS).map(describeWriteReceipt);
	const remaining = unfinished
		.filter((entry) => entry.trim().length > 0)
		.slice(0, MAX_BUDGET_SYNTHESIS_UNFINISHED);
	return [
		lead,
		receipts.length > 0
			? `Durable effects actually recorded this turn: ${receipts.join('; ')}.`
			: 'No durable change was recorded in this turn.',
		...(remaining.length > 0
			? [`Commissioned outcomes with no successful effect: ${remaining.join('; ')}.`]
			: []),
		'Answer the user now in plain prose. State exactly what was done using those receipts and nothing beyond them, and say plainly which part of the request was not done. Do not claim or imply an unrecorded change, do not promise to continue in the background, and do not narrate internal review, contracts, or limits.'
	].join(' ');
}

function describeWriteReceipt(entry: WriteLedgerEntry): string {
	const target = entry.title ?? entry.entityId ?? entry.entityKind ?? '';
	return [
		entry.status === 'success' ? 'succeeded' : 'failed',
		`${entry.toolName}${target ? ` (${target})` : ''}`
	].join(': ');
}

/** Last-resort user receipt, rendered only from this turn's durable ledger. */
export function renderWriteReceiptFallback(
	ledger: readonly WriteLedgerEntry[],
	unfinished: readonly string[]
): string | null {
	const succeeded = ledger.filter((entry) => entry.status === 'success');
	if (succeeded.length === 0) return null;
	const clean = (text: string) =>
		text
			.replace(/[\r\n]+/g, ' ')
			.replace(/[\\`*_<>[\]]/g, '')
			.trim()
			.slice(0, 240);
	const verbs: Record<string, string> = {
		create: 'Created',
		update: 'Updated',
		delete: 'Deleted',
		move: 'Moved',
		link: 'Linked',
		unlink: 'Unlinked',
		set: 'Set',
		tag: 'Tagged',
		reorganize: 'Reorganized'
	};
	const receipt = (entry: WriteLedgerEntry) => {
		const target = clean(entry.title ?? entry.entityId ?? entry.entityKind ?? 'item');
		return `${verbs[entry.action ?? ''] ?? 'Saved'} ${entry.entityKind ?? 'item'}: ${target}`;
	};
	const failed = ledger.filter((entry) => entry.status === 'failure');
	return [
		'I saved these changes, but could not finish the response:',
		'',
		...succeeded.map((entry) => `- ${receipt(entry)}`),
		...(failed.length
			? [
					'',
					'These changes did not succeed:',
					...failed.map(
						(entry) =>
							`- ${clean(entry.title ?? entry.entityId ?? entry.entityKind ?? 'item')}`
					)
				]
			: []),
		...(unfinished.length
			? [
					'',
					'These requested outcomes are not confirmed complete:',
					...unfinished.map((text) => `- ${clean(text)}`)
				]
			: []),
		'',
		'No further work is running. Check the saved items before retrying the remaining work.'
	].join('\n');
}
