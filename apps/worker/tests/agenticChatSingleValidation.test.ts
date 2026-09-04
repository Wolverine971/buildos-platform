// apps/worker/tests/agenticChatSingleValidation.test.ts
/**
 * One validator, one pass (one-engine stage S9, 2026-09-04).
 *
 * These tests count validator invocations rather than assert their verdicts.
 * Before S9 the contract path put the SAME contract through
 * `validateContractEffectFields` twice — once on the acting pass through
 * `validateCompletedProviderCalls`, then again in the review decision when the
 * reviewer approved it — and a re-reviewed correction paid for a third pass.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalizeAgenticChatJson, type JsonObject } from '@buildos/shared-types';

const spies = vi.hoisted(() => ({
	contractEffectFields: vi.fn(),
	toolCalls: vi.fn()
}));

vi.mock('../src/workers/agentic-chat/provider/contract-fields', async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import('../src/workers/agentic-chat/provider/contract-fields')
		>();
	return {
		...actual,
		validateContractEffectFields: (
			...args: Parameters<typeof actual.validateContractEffectFields>
		) => {
			spies.contractEffectFields(...args);
			return actual.validateContractEffectFields(...args);
		}
	};
});

vi.mock('@buildos/agentic-chat-runtime/loop', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@buildos/agentic-chat-runtime/loop')>();
	return {
		...actual,
		validateToolCalls: (...args: Parameters<typeof actual.validateToolCalls>) => {
			spies.toolCalls(...args);
			return actual.validateToolCalls(...args);
		}
	};
});

const {
	ONTOLOGY_WRITE_TOOLS,
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
	TURN_CONTRACT_TOOL_DEFINITION
} = await import('@buildos/agentic-chat-runtime/catalog');
const { parseDeclaredTurnContract, provideAgenticChatLoopToolCatalog } = await import(
	'@buildos/agentic-chat-runtime/loop'
);
const { validateCompletedProviderCalls, contractSha256 } = await import(
	'../src/workers/agentic-chat/provider/validation'
);
const { buildTurnContractReviewRequest } = await import(
	'../src/workers/agentic-chat/provider/review/turn-contract'
);
const { completeTurnContractReviewDecision } = await import(
	'../src/workers/agentic-chat/provider/review/decision-completion'
);
const { appendToolCallDelta, createToolCallAccumulator } = await import(
	'../src/workers/agentic-chat/provider/stream-tool-calls'
);
const { APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME } = await import(
	'../src/workers/agentic-chat/tools/execution-adapter'
);

type ProviderTool = Parameters<typeof validateCompletedProviderCalls>[1]['tools'][number];

const PROJECT_ID = '51000000-0000-4000-8000-000000000051';

function providerTool(definition: unknown): ProviderTool {
	return definition as ProviderTool;
}

const writeTools = ONTOLOGY_WRITE_TOOLS.filter((tool) =>
	['create_onto_task', 'create_onto_goal'].includes(tool.function.name)
).map(providerTool);
const admittedTools = [
	providerTool(TURN_CONTRACT_TOOL_DEFINITION),
	providerTool(REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION),
	...writeTools
];

const request = {
	messages: [{ role: 'user' as const, content: 'Add two tasks to the launch project.' }],
	tools: admittedTools,
	toolChoice: 'auto' as const,
	contextType: 'project' as const,
	projectId: PROJECT_ID,
	userId: 'user-1',
	sessionId: 'session-1',
	turnRunId: 'turn-1',
	streamRunId: 'stream-1',
	clientTurnId: 'client-1',
	queueJobId: 'queue-1',
	processingToken: 'processing-1',
	executionGeneration: 1,
	providerRound: 'initial' as const,
	logicalProviderRound: 1,
	signal: new AbortController().signal
} as unknown as Parameters<typeof validateCompletedProviderCalls>[1];

function call(id: string, name: string, argumentsValue: JsonObject) {
	return {
		id,
		name,
		arguments: argumentsValue,
		canonicalArguments: canonicalizeAgenticChatJson(argumentsValue),
		canonicalProviderArguments: canonicalizeAgenticChatJson(argumentsValue)
	};
}

const contractArguments: JsonObject = {
	outcomes: [
		{
			action: 'create',
			entity_kind: 'task',
			required_fields: ['title'],
			minimum_successful_effects: 2
		}
	]
};

beforeAll(() => provideAgenticChatLoopToolCatalog(() => ({ ops: {}, byToolName: {} })));
beforeEach(() => {
	spies.contractEffectFields.mockClear();
	spies.toolCalls.mockClear();
});

describe('one schema validation per call', () => {
	it('validates a direct write batch exactly once and never as a contract', () => {
		const calls = [
			call('write-1', 'create_onto_task', {
				project_id: PROJECT_ID,
				title: 'Draft the brief'
			}),
			call('write-2', 'create_onto_task', { project_id: PROJECT_ID, title: 'Book the room' })
		];

		validateCompletedProviderCalls(calls, request, admittedTools);

		// One pass over the whole batch, not one per call.
		expect(spies.toolCalls).toHaveBeenCalledTimes(1);
		expect(spies.toolCalls.mock.calls[0]?.[0]).toHaveLength(2);
		// No contract was declared, so no contract-field validation is paid for.
		expect(spies.contractEffectFields).toHaveBeenCalledTimes(0);
	});

	it('validates a declared contract once on the acting pass and not again on approval', () => {
		const contract = parseDeclaredTurnContract(contractArguments)!;
		const declaration = call('contract-1', 'declare_turn_contract', contractArguments);

		validateCompletedProviderCalls([declaration], request, admittedTools);
		expect(spies.contractEffectFields).toHaveBeenCalledTimes(1);
		expect(spies.toolCalls).toHaveBeenCalledTimes(1);

		const sha = contractSha256(contract);
		const reviewRequest = buildTurnContractReviewRequest(
			request,
			admittedTools,
			contract,
			sha,
			true,
			true
		);
		const accumulator = createToolCallAccumulator();
		appendToolCallDelta(accumulator, [
			{
				index: 0,
				id: 'approval-1',
				type: 'function',
				function: {
					name: APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
					arguments: JSON.stringify({
						reason: 'The contract matches the request exactly.',
						contract_sha256: sha,
						reference_candidates: []
					})
				}
			}
		]);

		const decisions = completeTurnContractReviewDecision({
			actingRequest: request,
			admittedTools,
			reviewRequest,
			toolCalls: accumulator,
			finished: true,
			finishedReason: 'tool_calls',
			fallbackReason: null,
			contract,
			contractReviewSha256: sha,
			allowRevision: true
		});

		expect(decisions[0]?.name).toBe(APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME);
		// The approval reviews the SAME contract the acting pass validated: still one.
		expect(spies.contractEffectFields).toHaveBeenCalledTimes(1);
		// The reviewer's own decision call is schema-validated exactly once.
		expect(spies.toolCalls).toHaveBeenCalledTimes(2);
	});

	it('validates a reviewer-authored correction exactly once', () => {
		const contract = parseDeclaredTurnContract(contractArguments)!;
		const sha = contractSha256(contract);
		const reviewRequest = buildTurnContractReviewRequest(
			request,
			admittedTools,
			contract,
			sha,
			true,
			true
		);
		const accumulator = createToolCallAccumulator();
		appendToolCallDelta(accumulator, [
			{
				index: 0,
				id: 'revision-1',
				type: 'function',
				function: {
					name: 'request_proposal_revision',
					arguments: JSON.stringify({
						reason: 'The user asked for one task, not two.',
						required_correction: 'Lower minimum_successful_effects to 1.',
						corrected_contract: {
							outcomes: [
								{
									action: 'create',
									entity_kind: 'task',
									required_fields: ['title'],
									minimum_successful_effects: 1,
									// An unusable decoration the normalizer strips, which is what
									// used to force a second validation pass.
									parent_label: 'unused'
								}
							]
						},
						reference_candidates: []
					})
				}
			}
		]);

		const decisions = completeTurnContractReviewDecision({
			actingRequest: request,
			admittedTools,
			reviewRequest,
			toolCalls: accumulator,
			finished: true,
			finishedReason: 'tool_calls',
			fallbackReason: null,
			contract,
			contractReviewSha256: sha,
			allowRevision: true
		});

		expect(decisions[0]?.name).toBe('request_proposal_revision');
		// The correction is a NEW contract, so it is validated — once.
		expect(spies.contractEffectFields).toHaveBeenCalledTimes(1);
		expect(spies.toolCalls).toHaveBeenCalledTimes(1);
	});
});
