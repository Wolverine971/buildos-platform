// apps/worker/tests/agenticChatReviewDecisionCompletion.test.ts
//
// The approval tool schemas are static (no per-review `const` SHA), so the
// binding between an approval and the proposal the reviewer saw is enforced
// here, in code, and fails closed to the clarification fallback.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	DECLARE_READ_ONLY_TURN_TOOL_DEFINITION,
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
	TURN_CONTRACT_TOOL_DEFINITION
} from '@buildos/agentic-chat-runtime/catalog';
import type { TurnContract } from '@buildos/agentic-chat-runtime/loop';
import type { JsonObject } from '@buildos/shared-types';
import type {
	AgenticChatTurnProviderRequestV1,
	AgenticChatTurnProviderToolV1
} from '../src/workers/agentic-chat/provider/contracts';
import {
	approvalShaMatches,
	completeTurnContractReviewDecision
} from '../src/workers/agentic-chat/provider/review/decision-completion';
import { buildTurnContractReviewRequest } from '../src/workers/agentic-chat/provider/review/turn-contract';
import {
	appendToolCallDelta,
	createToolCallAccumulator
} from '../src/workers/agentic-chat/provider/stream-tool-calls';

const PROJECT_ID = '51000000-0000-4000-8000-000000000051';
const TASK_ID = '41000000-0000-4000-8000-000000000041';

function tool(definition: unknown): AgenticChatTurnProviderToolV1 {
	return definition as AgenticChatTurnProviderToolV1;
}

const TOOLS: AgenticChatTurnProviderToolV1[] = [
	tool(TURN_CONTRACT_TOOL_DEFINITION),
	tool(DECLARE_READ_ONLY_TURN_TOOL_DEFINITION),
	tool(REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION),
	{
		type: 'function',
		function: {
			name: 'update_onto_task',
			description: 'Update an existing task.',
			parameters: {
				type: 'object',
				additionalProperties: false,
				required: ['task_id'],
				properties: { task_id: { type: 'string' }, state_key: { type: 'string' } }
			}
		}
	}
];

const CONTRACT: TurnContract = {
	version: 1,
	source: 'declared',
	outcomes: [
		{
			id: 'outcome_1',
			action: 'complete',
			entityKind: 'task',
			targetIds: [TASK_ID],
			requiredFields: ['state_key'],
			minimumSuccessfulEffects: 1
		}
	]
};
const CONTRACT_SHA = createHash('sha256').update('contract').digest('hex');

function actingRequest(): AgenticChatTurnProviderRequestV1 {
	return {
		messages: [
			{
				role: 'system',
				content: '# BuildOS Agentic Chat\n\n## Location and Loaded Context\n\nTask loaded.'
			},
			{ role: 'user', content: 'I finished the intro call' }
		],
		tools: TOOLS,
		toolChoice: 'auto',
		userId: 'user-1',
		sessionId: 'session-1',
		turnRunId: 'turn-1',
		streamRunId: 'stream-1',
		clientTurnId: 'client-1',
		contextType: 'project',
		entityId: PROJECT_ID,
		projectId: PROJECT_ID,
		queueJobId: 'job-1',
		processingToken: 'token-1',
		executionGeneration: 1,
		providerRound: 'synthesis',
		logicalProviderRound: 3,
		signal: new AbortController().signal
	};
}

function reviewerCalls(name: string, argumentsValue: JsonObject) {
	const toolCalls = createToolCallAccumulator();
	appendToolCallDelta(toolCalls, [
		{
			index: 0,
			id: 'reviewer-1',
			type: 'function',
			function: { name, arguments: JSON.stringify(argumentsValue) }
		}
	]);
	return toolCalls;
}

function contractDecision(argumentsValue: JsonObject) {
	const request = actingRequest();
	const reviewRequest = buildTurnContractReviewRequest(
		request,
		TOOLS,
		CONTRACT,
		CONTRACT_SHA,
		true,
		true
	);
	return completeTurnContractReviewDecision({
		actingRequest: request,
		reviewRequest,
		toolCalls: reviewerCalls('approve_turn_contract_review', argumentsValue),
		finished: true,
		finishedReason: 'tool_calls',
		fallbackReason: null,
		contract: CONTRACT,
		contractReviewSha256: CONTRACT_SHA,
		allowRevision: true
	});
}

describe('approvalShaMatches', () => {
	it('accepts only the exact expected string', () => {
		expect(approvalShaMatches('a'.repeat(64), 'a'.repeat(64))).toBe(true);
		expect(approvalShaMatches('b'.repeat(64), 'a'.repeat(64))).toBe(false);
		expect(approvalShaMatches(undefined, 'a'.repeat(64))).toBe(false);
		expect(approvalShaMatches(null, 'a'.repeat(64))).toBe(false);
		expect(approvalShaMatches(['a'.repeat(64)], 'a'.repeat(64))).toBe(false);
		expect(approvalShaMatches('', '')).toBe(false);
	});
});

describe('contract review SHA binding', () => {
	it('passes an approval whose SHA matches the reviewed contract', () => {
		const calls = contractDecision({
			reason: 'The user reported the only loaded task complete.',
			contract_sha256: CONTRACT_SHA,
			reference_candidates: []
		});
		expect(calls).toEqual([
			expect.objectContaining({
				name: 'approve_turn_contract_review',
				decidedBy: 'contract_reviewer',
				arguments: expect.objectContaining({ contract_sha256: CONTRACT_SHA })
			})
		]);
	});

	it('fails closed to clarification when the SHA does not match', () => {
		const calls = contractDecision({
			reason: 'Approved.',
			contract_sha256: 'f'.repeat(64),
			reference_candidates: []
		});
		expect(calls).toEqual([
			expect.objectContaining({
				name: 'request_turn_clarification',
				decidedBy: 'harness_review_fallback',
				arguments: expect.objectContaining({
					reason: expect.stringContaining('invalid or unbound')
				})
			})
		]);
	});

	it('fails closed to clarification when the SHA is missing', () => {
		const calls = contractDecision({ reason: 'Approved.', reference_candidates: [] });
		expect(calls).toEqual([
			expect.objectContaining({
				name: 'request_turn_clarification',
				decidedBy: 'harness_review_fallback'
			})
		]);
	});
});
