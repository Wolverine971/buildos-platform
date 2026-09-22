// apps/worker/tests/agenticChatRepairPolicy.test.ts
//
// Direct unit cover for the bounded repairs in `provider/repair-policy.ts`.
// The turn-provider suite drives these through whole turns, which only ever
// reaches the `opening` guidance. The phase machine can also land a surface
// repair on the disposition gate, on a declared read-only turn, and after a
// reviewer approval; those three guidance texts are reachable and are pinned
// here so the repair cannot silently hand a phase the wrong instruction.
import { describe, expect, it } from 'vitest';
import {
	DECLARE_TURN_CONTRACT_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import type { WriteLedgerEntry } from '@buildos/agentic-chat-runtime/loop';
import type {
	AgenticChatTurnProviderRequestV1,
	AgenticChatTurnProviderToolV1
} from '../src/workers/agentic-chat/provider/contracts';
import {
	buildBatchPromiseRepairRequest,
	hasUnfinishedBatchAction,
	buildEmptyReplyRepairRequest,
	buildProviderPassBudgetSynthesisInstruction,
	buildRequiredPassProseFallbackRequest,
	buildReviewerMimicryRepairRequest,
	buildUnavailableSkillRepairRequest,
	buildUnavailableSurfaceToolRepairRequest
} from '../src/workers/agentic-chat/provider/repair-policy';
import type { CompletedProviderToolCall } from '../src/workers/agentic-chat/provider/stream-tool-calls';

describe('unfinished batch action', () => {
	it.each([
		"All five tasks are created. Now I'll propose the dependency stage.",
		'Next, I will link the saved tasks.',
		'Let me update the remaining task.',
		// 2026-09-22 gate, case 2 repetition 2: delivered as the final answer, links never proposed.
		'The five task creates were approved and executed successfully. The remaining commissioned work is the three dependency relationships using the returned task IDs. Proposing that stage for independent review:',
		'Saved all five tasks. Now proposing the dependency links.',
		'Tasks are saved. Next step: the three depends_on links for review:'
	])('recognizes an execution promise: %s', (text) => {
		expect(hasUnfinishedBatchAction(text)).toBe(true);
	});
	it.each([
		'Created and linked all five tasks.',
		'I can link these later if you want.',
		'I will keep this in mind.',
		'Your note says: "I will create a launch plan."',
		'The dependency was not saved. Please choose its target.',
		'Proposing nothing further; every requested change is saved.',
		'Creating the link is not possible: the target task does not exist.',
		'I saved the changes below, but the additional step was not completed. The remaining work is still pending.',
		'Summary of saved tasks:\n- Order kitchen cabinets\n- Confirm permit requirements'
	])('leaves completed answers, offers and quoted source alone: %s', (text) => {
		expect(hasUnfinishedBatchAction(text)).toBe(false);
	});
	it('re-asks once after an empty completion and never twice', () => {
		const original = request([tool(MUTATION_TOOL_NAME)]);
		const repair = buildEmptyReplyRepairRequest(original);
		expect(repair).not.toBeNull();
		expect(repair!.tools).toBe(original.tools);
		expect(repair!.passRole).toBe('repair');
		expect(repair!.emptyReplyRepairAttempted).toBe(true);
		expect(repair!.logicalProviderRound).toBe(original.logicalProviderRound + 1);
		expect(lastInstruction(repair!)).toContain('Never replay successful writes');
		expect(buildEmptyReplyRepairRequest(repair!)).toBeNull();
	});
	it('keeps the exact permitted surface and the existing turn budget', () => {
		const original = request([tool(MUTATION_TOOL_NAME)]);
		const result = buildBatchPromiseRepairRequest(original);
		expect(result.tools).toBe(original.tools);
		expect(result.signal).toBe(original.signal);
		expect(result.logicalProviderRound).toBe(original.logicalProviderRound + 1);
		expect(lastInstruction(result)).toContain('grants no additional permission');
	});
});

const READ_TOOL_NAME = 'get_project_overview';
const MUTATION_TOOL_NAME = 'create_onto_task';
const SECOND_MUTATION_TOOL_NAME = 'update_onto_task';

function tool(name: string): AgenticChatTurnProviderToolV1 {
	return {
		type: 'function',
		function: { name, description: `${name} description`, parameters: { type: 'object' } }
	};
}

function call(name: string): CompletedProviderToolCall {
	return {
		id: `call_${name}`,
		name,
		arguments: {},
		canonicalArguments: '{}',
		canonicalProviderArguments: '{}'
	};
}

function request(
	tools: readonly AgenticChatTurnProviderToolV1[],
	overrides: Partial<AgenticChatTurnProviderRequestV1> = {}
): AgenticChatTurnProviderRequestV1 {
	return {
		messages: [{ role: 'user', content: 'do the thing' }],
		tools,
		toolChoice: 'auto',
		userId: 'user_1',
		sessionId: 'session_1',
		turnRunId: 'turn_1',
		streamRunId: 'stream_1',
		clientTurnId: 'client_1',
		contextType: 'project',
		entityId: null,
		projectId: null,
		queueJobId: 'job_1',
		processingToken: 'token_1',
		executionGeneration: 1,
		providerRound: 'initial',
		logicalProviderRound: 1,
		signal: new AbortController().signal,
		...overrides
	};
}

function lastInstruction(result: AgenticChatTurnProviderRequestV1 | null): string {
	expect(result).not.toBeNull();
	return String(result?.messages.at(-1)?.content ?? '');
}

describe('agentic chat surface repair guidance', () => {
	it('sends a mutation called from the disposition gate back to the gate controls', () => {
		const gateTools = [
			tool(DECLARE_TURN_CONTRACT_TOOL_NAME),
			tool(REQUEST_TURN_CLARIFICATION_TOOL_NAME)
		];
		const repair = buildUnavailableSurfaceToolRepairRequest(
			request(gateTools, { semanticDispositionGate: true, toolChoice: 'required' }),
			[call(MUTATION_TOOL_NAME)],
			[...gateTools, tool(MUTATION_TOOL_NAME)],
			{ phase: 'disposition_gate', contractApproved: false }
		);
		const instruction = lastInstruction(repair);
		expect(instruction).toContain('This pass decides the semantic disposition of the turn');
		expect(instruction).toContain(
			`${MUTATION_TOOL_NAME} is not callable in this pass and the call was rejected without execution.`
		);
		expect(repair?.semanticDispositionGate).toBe(true);
		expect(repair?.tools.map((entry) => entry.function.name)).toEqual([
			DECLARE_TURN_CONTRACT_TOOL_NAME,
			REQUEST_TURN_CLARIFICATION_TOOL_NAME
		]);
	});

	it('tells a declared read-only turn plainly that no write tool is callable', () => {
		const admitted = [
			tool(READ_TOOL_NAME),
			tool(REQUEST_TURN_CLARIFICATION_TOOL_NAME),
			tool(MUTATION_TOOL_NAME)
		];
		const repair = buildUnavailableSurfaceToolRepairRequest(
			request([tool(READ_TOOL_NAME)]),
			[call(MUTATION_TOOL_NAME)],
			admitted,
			{ phase: 'read_only_declared', contractApproved: false }
		);
		const instruction = lastInstruction(repair);
		expect(instruction).toContain('This turn was declared read-only');
		expect(repair?.semanticDispositionGate).toBe(false);
		expect(repair?.tools.map((entry) => entry.function.name)).toEqual([
			READ_TOOL_NAME,
			REQUEST_TURN_CLARIFICATION_TOOL_NAME
		]);
	});

	it('keeps an approved contract in force and names every rejected tool once', () => {
		const admitted = [
			tool(READ_TOOL_NAME),
			tool(MUTATION_TOOL_NAME),
			tool(SECOND_MUTATION_TOOL_NAME)
		];
		const repair = buildUnavailableSurfaceToolRepairRequest(
			request([tool(READ_TOOL_NAME)]),
			[call(MUTATION_TOOL_NAME), call(SECOND_MUTATION_TOOL_NAME), call(MUTATION_TOOL_NAME)],
			admitted,
			{ phase: 'mutating', contractApproved: true }
		);
		const instruction = lastInstruction(repair);
		expect(instruction).toContain('The approved contract is still in force');
		// Plural rejection phrasing, de-duplicated and sorted.
		expect(instruction).toContain(
			`${MUTATION_TOOL_NAME}, ${SECOND_MUTATION_TOOL_NAME} are not callable in this pass and the calls were rejected without execution.`
		);
	});

	it('declines the repair when the phase owns no callable tool', () => {
		expect(
			buildUnavailableSurfaceToolRepairRequest(
				request([tool(READ_TOOL_NAME)]),
				[call(MUTATION_TOOL_NAME)],
				[tool(MUTATION_TOOL_NAME)],
				{ phase: 'read_only_declared', contractApproved: false }
			)
		).toBeNull();
	});
});

describe('agentic chat unavailable skill repair', () => {
	it('names both unavailable skill tools when the pass called each of them', () => {
		const admitted = [
			tool(DECLARE_TURN_CONTRACT_TOOL_NAME),
			tool(REQUEST_TURN_CLARIFICATION_TOOL_NAME),
			tool(MUTATION_TOOL_NAME)
		];
		const repair = buildUnavailableSkillRepairRequest(
			request(admitted),
			[call('skill_load'), call('skill_search')],
			admitted
		);
		const instruction = lastInstruction(repair);
		expect(instruction).toContain(
			'skill_load, skill_search are not callable in this turn and the calls were rejected without execution.'
		);
		expect(repair?.unavailableSkillRepairAttempted).toBe(true);
	});

	it('declines the repair when the restored surface cannot carry a disposition', () => {
		const admitted = [tool(MUTATION_TOOL_NAME)];
		expect(
			buildUnavailableSkillRepairRequest(request(admitted), [call('skill_load')], admitted)
		).toBeNull();
	});
});

describe('agentic chat reviewer mimicry repair', () => {
	// Stored transcripts still carry `approve_mutation_batch_review` calls from
	// the retired batch-review lane, so the acting model can still imitate the
	// whole reviewer vocabulary in one pass. Both names are rejected together
	// and named back to it as reviewer-only controls.
	it('rejects a whole imitated reviewer vocabulary in one bounded repair', () => {
		const admitted = [tool(READ_TOOL_NAME), tool(MUTATION_TOOL_NAME)];
		const repair = buildReviewerMimicryRepairRequest(request(admitted), [
			call('approve_turn_contract_review'),
			call('approve_mutation_batch_review')
		]);
		const instruction = lastInstruction(repair);
		expect(instruction).toContain(
			'approve_mutation_batch_review, approve_turn_contract_review are reviewer-only controls and were rejected without execution'
		);
		expect(repair?.passRole).toBe('repair');
		expect(repair?.unavailableSkillRepairAttempted).toBe(true);
		// The acting surface is untouched; only the guidance changes.
		expect(repair?.tools).toEqual(admitted);
	});
});

describe('agentic chat receipt-grounded closing passes', () => {
	it('states plainly that nothing was recorded and which outcomes were not made', () => {
		const instruction = buildProviderPassBudgetSynthesisInstruction(
			[],
			['  ', 'move six tasks into the new plan']
		);
		expect(instruction).toContain('No durable change was recorded in this turn.');
		expect(instruction).toContain(
			'Commissioned outcomes with no successful effect: move six tasks into the new plan.'
		);
	});

	it('labels each receipt by outcome and falls back through the target identity', () => {
		const ledger: WriteLedgerEntry[] = [
			{ toolName: 'create_onto_task', status: 'success', title: 'Draft the brief' },
			{ toolName: 'update_onto_task', status: 'failure', entityId: 'task_9' },
			{ toolName: 'create_onto_goal', status: 'success', entityKind: 'goal' },
			{ toolName: 'tag_onto_entity', status: 'failure' }
		];
		const instruction = buildProviderPassBudgetSynthesisInstruction(ledger, []);
		expect(instruction).toContain(
			'Durable effects actually recorded this turn: succeeded: create_onto_task (Draft the brief); failed: update_onto_task (task_9); succeeded: create_onto_goal (goal); failed: tag_onto_entity.'
		);
		expect(instruction).not.toContain('Commissioned outcomes with no successful effect');
	});
});

describe('agentic chat required-pass prose fallback', () => {
	it('omits the withheld draft when the pass returned no reusable prose', () => {
		const instruction = lastInstruction(
			buildRequiredPassProseFallbackRequest(request([tool(READ_TOOL_NAME)]), '   ')
		);
		expect(instruction).not.toContain('Withheld draft');
		expect(instruction).toContain('no durable change was made in this turn');
	});
});
