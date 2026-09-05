// apps/worker/tests/agenticChatEf4ad9aRegressions.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import {
	ONTOLOGY_WRITE_TOOLS,
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
	TURN_CONTRACT_TOOL_DEFINITION
} from '@buildos/agentic-chat-runtime/catalog';
import {
	parseDeclaredTurnContract,
	provideAgenticChatLoopToolCatalog
} from '@buildos/agentic-chat-runtime/loop';
import type { JsonObject } from '@buildos/shared-types';
import {
	AgenticChatProviderExecutionError,
	type AgenticChatTurnProviderRequestV1,
	type AgenticChatTurnProviderToolV1
} from '../src/workers/agentic-chat/provider/contracts';
import { completeTurnContractReviewDecision } from '../src/workers/agentic-chat/provider/review/decision-completion';
import { buildTurnContractReviewRequest } from '../src/workers/agentic-chat/provider/review/turn-contract';
import {
	appendToolCallDelta,
	createToolCallAccumulator
} from '../src/workers/agentic-chat/provider/stream-tool-calls';
import {
	contractSha256,
	validateApprovedTurnContractMutations,
	validateCompletedProviderCalls
} from '../src/workers/agentic-chat/provider/validation';
import { renderWriteReceiptFallback } from '../src/workers/agentic-chat/provider/repair-policy';
import replay from './fixtures/agenticChatEf4ad9aReviewerReplay.json';

const tools = [
	TURN_CONTRACT_TOOL_DEFINITION,
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
	...ONTOLOGY_WRITE_TOOLS
] as AgenticChatTurnProviderToolV1[];
const proposal = parseDeclaredTurnContract({
	outcomes: [{ action: 'update', entity_kind: 'task', minimum_successful_effects: 1 }]
})!;
const sha = contractSha256(proposal);
const request: AgenticChatTurnProviderRequestV1 = {
	tools,
	messages: [{ role: 'user', content: 'Apply the exact requested changes.' }],
	toolChoice: 'auto',
	userId: 'user-1',
	sessionId: 'session-1',
	turnRunId: 'turn-1',
	streamRunId: 'stream-1',
	clientTurnId: 'client-1',
	contextType: 'project',
	projectId: '51000000-0000-4000-8000-000000000051',
	entityId: null,
	queueJobId: 'queue-1',
	processingToken: 'token-1',
	executionGeneration: 1,
	providerRound: 'synthesis',
	logicalProviderRound: 1,
	signal: new AbortController().signal
};
const reviewRequest = buildTurnContractReviewRequest(request, tools, proposal, sha, true, true);
function decide(
	args: JsonObject,
	options: {
		name?: string;
		raw?: string;
		finishedReason?: string;
		finished?: boolean;
		allowRevision?: boolean;
	} = {}
) {
	const calls = createToolCallAccumulator();
	appendToolCallDelta(calls, [
		{
			index: 0,
			id: 'review-1',
			type: 'function',
			function: {
				name: options.name ?? 'request_proposal_revision',
				arguments: options.raw ?? JSON.stringify(args)
			}
		}
	]);
	return completeTurnContractReviewDecision({
		actingRequest: request,
		reviewRequest,
		admittedTools: tools,
		contract: proposal,
		contractReviewSha256: sha,
		allowRevision: options.allowRevision ?? true,
		toolCalls: calls,
		finished: options.finished ?? true,
		finishedReason: options.finishedReason ?? 'tool_calls',
		fallbackReason: null
	});
}
function rejected(args: JsonObject, options: Parameters<typeof decide>[1] = {}) {
	try {
		decide(args, options);
	} catch (error) {
		expect(error).toBeInstanceOf(AgenticChatProviderExecutionError);
		return (error as AgenticChatProviderExecutionError).diagnostic;
	}
	throw new Error('Expected reviewer rejection');
}
beforeAll(() => provideAgenticChatLoopToolCatalog(() => ({ ops: {}, byToolName: {} })));

describe('recorded live ef4ad9a reviewer output', () => {
	it.each(replay)(
		'$scenario retains the actual correction and discards only inapplicable labels',
		(fixture) => {
			const decision = decide(fixture.decision as unknown as JsonObject)[0]!;
			expect(decision.name).toBe('request_proposal_revision');
			expect(decision.decidedBy).toBe('contract_reviewer');
			expect(validateCompletedProviderCalls([decision], reviewRequest)).toEqual([]);
			const corrected = parseDeclaredTurnContract(decision.arguments.corrected_contract)!;
			expect(corrected).not.toBeNull();
			for (const outcome of corrected.outcomes) {
				expect(outcome).not.toHaveProperty('srcLabel');
				expect(outcome).not.toHaveProperty('dstLabel');
			}
			if (fixture.scenario === 'task')
				expect(corrected.outcomes[0]?.changes).toEqual([
					{ field: 'due_at', value: '2026-09-22T13:00:00Z' },
					{ field: 'props.duration_minutes', value: '120' }
				]);
			if (fixture.scenario === 'document')
				expect(corrected.outcomes[0]?.requiredFields).toEqual(['content']);
			if (fixture.scenario === 'relationships') {
				const mutations = corrected.outcomes.map((outcome, index) => {
					const args = {
						project_id: request.projectId,
						src_kind: 'task',
						dst_kind: 'task',
						...Object.fromEntries(
							outcome.changes!.map((change) => [change.field, change.value])
						)
					} as JsonObject;
					return {
						id: `link-${index}`,
						name: 'link_onto_entities',
						arguments: args,
						canonicalArguments: JSON.stringify(args),
						canonicalProviderArguments: JSON.stringify(args)
					};
				});
				expect(mutations).toHaveLength(3);
				expect(
					validateApprovedTurnContractMutations(
						mutations,
						corrected,
						contractSha256(corrected)
					)
				).toEqual([]);
			}
		}
	);
	it('does not invent IDs to repair unresolved relationship labels', () => {
		const args = structuredClone(replay[2]!.decision) as unknown as JsonObject;
		const outcome = ((args.corrected_contract as JsonObject).outcomes as JsonObject[])[0]!;
		outcome.changes = (outcome.changes as JsonObject[]).filter(
			(change) => change.field !== 'src_id'
		);
		expect(rejected(args)).toMatchObject({ code: 'corrected_contract_invalid' });
	});
	it('preserves conflicting references to real same-turn creates for rejection', () => {
		const args = structuredClone(replay[2]!.decision) as unknown as JsonObject;
		const outcomes = (args.corrected_contract as JsonObject).outcomes as JsonObject[];
		outcomes.push({
			action: 'create',
			entity_kind: 'task',
			minimum_successful_effects: 1,
			label: outcomes[0]!.src_label,
			changes: [{ field: 'title', value: 'New task' }]
		});
		expect(rejected(args)).toMatchObject({ code: 'corrected_contract_invalid' });
	});
	it('continues to clarify actual candidate ambiguity after normalizing a repair', () => {
		const args = structuredClone(replay[0]!.decision) as unknown as JsonObject;
		const groups = args.reference_candidates as JsonObject[];
		(groups[0]!.candidates as JsonObject[]).push({
			id: '41000000-0000-4000-8000-000000000009',
			title: 'Other cabinet task'
		});
		expect(decide(args)[0]).toMatchObject({
			name: 'request_turn_clarification',
			decidedBy: 'harness_candidate_gate'
		});
	});
});

describe('review rejection diagnostics', () => {
	it.each([
		[
			'approval_sha_mismatch',
			{ reason: 'Private marker', reference_candidates: [], contract_sha256: 'wrong' },
			{ name: 'approve_turn_contract_review' }
		],
		[
			'decision_schema_invalid',
			{ contract_sha256: sha, reference_candidates: [] },
			{ name: 'approve_turn_contract_review' }
		],
		[
			'corrected_contract_invalid',
			{
				reason: 'Private marker',
				required_correction: 'Fix it',
				corrected_contract: {},
				reference_candidates: []
			},
			{}
		],
		['decision_truncated', {}, { raw: '{"reason":"Private marker', finishedReason: 'length' }],
		['unreadable_decision', {}, { raw: '{bad json}' }],
		['missing_done', {}, { finished: false }],
		['revision_disallowed', replay[0]!.decision, { allowRevision: false }]
	] as const)('reports %s without retaining private reviewer text', (code, args, options) => {
		const diagnostic = rejected(args as unknown as JsonObject, options);
		expect(diagnostic).toMatchObject({ kind: 'rejected_contract_review', code });
		expect(JSON.stringify(diagnostic)).not.toContain('Private marker');
	});
});

describe('deterministic saved-write receipt', () => {
	it('distinguishes confirmed writes, failures, and unfinished outcomes', () => {
		const text = renderWriteReceiptFallback(
			[
				{
					toolName: 'create_onto_task',
					action: 'create',
					entityKind: 'task',
					title: 'Order cabinets',
					status: 'success'
				},
				{
					toolName: 'link_onto_entities',
					action: 'link',
					entityKind: 'relationship',
					status: 'failure'
				}
			],
			['Create dependency on permit']
		);
		expect(text).toContain('Created task: Order cabinets');
		expect(text).toContain('These changes did not succeed:');
		expect(text).toContain('not confirmed complete');
		expect(text).not.toContain('create_onto_task');
	});
	it('cannot claim success from a failed or absent receipt', () => {
		expect(renderWriteReceiptFallback([], [])).toBeNull();
		expect(
			renderWriteReceiptFallback([{ toolName: 'create_onto_task', status: 'failure' }], [])
		).toBeNull();
	});
});
