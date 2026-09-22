// packages/agentic-chat-runtime/src/loop/completion-receipt.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import type { FastToolExecution } from './shared';
import {
	buildAgenticChatCompletionReceiptV1,
	isAgenticChatRequestFulfilledV1
} from './completion-receipt';
import { type TurnContract, parseDeclaredTurnContract } from './turn-contract';

const PERMIT = 'a1000000-0000-4000-8000-000000000001';
const CABINETS = 'a2000000-0000-4000-8000-000000000002';
const ELECTRICAL = 'a3000000-0000-4000-8000-000000000003';
const PROJECT = 'b0000000-0000-4000-8000-000000000000';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const CONTRACT_SHA = 'c'.repeat(64);

function call(name: string, args: Record<string, unknown>, id: string): ChatToolCall {
	return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

function execution(
	name: string,
	args: Record<string, unknown>,
	id: string,
	result: Partial<ChatToolResult> = {}
): FastToolExecution {
	const toolCall = call(name, args, id);
	return {
		toolCall,
		result: { tool_call_id: id, success: true, result: {}, ...result }
	};
}

function approval(id: string, sha: string): FastToolExecution {
	return execution('approve_mutation_batch_review', { reason: 'ok', batch_sha256: sha }, id, {
		result: { status: 'mutation_batch_review_approved', batch_sha256: sha }
	});
}

function createTask(id: string, taskId: string, title: string, due?: string): FastToolExecution {
	return execution(
		'create_onto_task',
		{ project_id: PROJECT, title, ...(due ? { due_at: due } : {}) },
		id,
		{ result: { task: { id: taskId, title, ...(due ? { due_at: due } : {}) } } }
	);
}

function link(id: string, src: string, dst: string, ok = true): FastToolExecution {
	return execution(
		'link_onto_entities',
		{ src_kind: 'task', src_id: src, rel: 'depends_on', dst_kind: 'task', dst_id: dst },
		id,
		ok
			? { result: { edge_id: `${id}-edge` } }
			: { success: false, result: null, error: 'edge insert failed' }
	);
}

/** Two task creates with due dates, then one dependency between them. */
function contract(): TurnContract {
	const parsed = parseDeclaredTurnContract({
		outcomes: [
			{
				action: 'create',
				entity_kind: 'task',
				label: 'permit',
				changes: [
					{ field: 'title', value: 'QA — Confirm permit requirements' },
					{ field: 'due_at', value: '2026-09-15' }
				],
				minimum_successful_effects: 1
			},
			{
				action: 'create',
				entity_kind: 'task',
				label: 'cabinets',
				changes: [
					{ field: 'title', value: 'QA — Order kitchen cabinets' },
					{ field: 'due_at', value: '2026-09-18' }
				],
				minimum_successful_effects: 1
			},
			{
				action: 'link',
				entity_kind: 'relationship',
				src_label: 'cabinets',
				dst_label: 'permit',
				changes: [{ field: 'rel', value: 'depends_on' }],
				minimum_successful_effects: 1
			}
		]
	});
	if (!parsed) throw new Error('fixture contract did not parse');
	return parsed;
}

const CREATES = [
	createTask('create-1', PERMIT, 'QA — Confirm permit requirements', '2026-09-15'),
	createTask('create-2', CABINETS, 'QA — Order kitchen cabinets', '2026-09-18')
];

describe('buildAgenticChatCompletionReceiptV1', () => {
	it('fulfils only when every reviewed outcome is met across all approved stages', () => {
		const receipt = buildAgenticChatCompletionReceiptV1({
			contract: contract(),
			contractSha256: CONTRACT_SHA,
			toolExecutions: [
				approval('approve-1', SHA_A),
				...CREATES,
				approval('approve-2', SHA_B),
				link('link-1', CABINETS, PERMIT)
			],
			finishedReason: 'stop'
		});
		expect(receipt).toMatchObject({
			version: 1,
			contractSha256: CONTRACT_SHA,
			expectation: 'turn_contract',
			stages: [
				{
					batchSha256: SHA_A,
					approvalCallId: 'approve-1',
					executedCallIds: ['create-1', 'create-2'],
					failedCallIds: [],
					disposition: 'stage_approved'
				},
				{
					batchSha256: SHA_B,
					approvalCallId: 'approve-2',
					executedCallIds: ['link-1'],
					disposition: 'stage_approved'
				}
			],
			unreviewedWriteCallIds: [],
			request: { disposition: 'request_fulfilled', outcomeStatus: 'fulfilled', reasons: [] }
		});
		expect(receipt.request.outcomes.every((outcome) => outcome.fulfilled)).toBe(true);
		expect(isAgenticChatRequestFulfilledV1(receipt)).toBe(true);
	});

	it('keeps an approved create stage from becoming completion when the dependency stage never ran', () => {
		const receipt = buildAgenticChatCompletionReceiptV1({
			contract: contract(),
			contractSha256: CONTRACT_SHA,
			toolExecutions: [approval('approve-1', SHA_A), ...CREATES],
			finishedReason: 'stop'
		});
		expect(receipt.stages).toHaveLength(1);
		expect(receipt.stages[0]?.disposition).toBe('stage_approved');
		expect(receipt.request.disposition).toBe('request_partial');
		expect(receipt.request.outcomeStatus).toBe('unfulfilled');
		expect(receipt.request.reasons).toContain('outcome_unfulfilled');
		expect(receipt.request.outcomes[2]?.fulfilled).toBe(false);
		expect(isAgenticChatRequestFulfilledV1(receipt)).toBe(false);
	});

	it('marks a stage partial when one of its writes failed and keeps the request partial', () => {
		const receipt = buildAgenticChatCompletionReceiptV1({
			contract: contract(),
			contractSha256: CONTRACT_SHA,
			toolExecutions: [
				approval('approve-1', SHA_A),
				...CREATES,
				approval('approve-2', SHA_B),
				link('link-1', CABINETS, PERMIT, false),
				link('link-2', ELECTRICAL, PERMIT)
			],
			finishedReason: 'stop'
		});
		expect(receipt.stages[1]).toMatchObject({
			executedCallIds: ['link-2'],
			failedCallIds: ['link-1'],
			disposition: 'stage_partial'
		});
		expect(receipt.request.disposition).toBe('request_partial');
		expect(isAgenticChatRequestFulfilledV1(receipt)).toBe(false);
	});

	it('does not accept a create with the wrong due date as fulfilment', () => {
		const receipt = buildAgenticChatCompletionReceiptV1({
			contract: contract(),
			contractSha256: CONTRACT_SHA,
			toolExecutions: [
				approval('approve-1', SHA_A),
				createTask('create-1', PERMIT, 'QA — Confirm permit requirements', '2026-09-16'),
				CREATES[1]!,
				approval('approve-2', SHA_B),
				link('link-1', CABINETS, PERMIT)
			],
			finishedReason: 'stop'
		});
		expect(receipt.stages.map((stage) => stage.disposition)).toEqual([
			'stage_approved',
			'stage_approved'
		]);
		expect(receipt.request.disposition).toBe('request_partial');
		expect(receipt.request.outcomes[0]?.fulfilled).toBe(false);
	});

	it('records an approval that no write followed as a failed stage', () => {
		const receipt = buildAgenticChatCompletionReceiptV1({
			contract: contract(),
			contractSha256: CONTRACT_SHA,
			toolExecutions: [approval('approve-1', SHA_A)],
			finishedReason: 'stop'
		});
		expect(receipt.stages).toEqual([
			{
				batchSha256: SHA_A,
				approvalCallId: 'approve-1',
				executedCallIds: [],
				failedCallIds: [],
				disposition: 'stage_failed'
			}
		]);
		expect(receipt.request.disposition).toBe('request_partial');
	});

	it('treats a clarification stop as blocked, never complete', () => {
		const receipt = buildAgenticChatCompletionReceiptV1({
			contract: contract(),
			contractSha256: CONTRACT_SHA,
			toolExecutions: [],
			finishedReason: 'supervisor_question'
		});
		expect(receipt.stages).toEqual([]);
		expect(receipt.request).toMatchObject({
			disposition: 'request_partial',
			outcomeStatus: 'blocked'
		});
	});

	it('never fulfils after a partial post-start failure, even when the ledger looks complete', () => {
		const receipt = buildAgenticChatCompletionReceiptV1({
			contract: contract(),
			contractSha256: CONTRACT_SHA,
			toolExecutions: [
				approval('approve-1', SHA_A),
				...CREATES,
				approval('approve-2', SHA_B),
				link('link-1', CABINETS, PERMIT)
			],
			finishedReason: 'mutation_unfulfilled',
			partialFailureClass: 'timeout_post_start'
		});
		expect(receipt.request.outcomeStatus).toBe('fulfilled');
		expect(receipt.request.disposition).toBe('request_partial');
		expect(receipt.request.reasons).toEqual(['partial_failure:timeout_post_start']);
		expect(isAgenticChatRequestFulfilledV1(receipt)).toBe(false);
	});

	it('reports an uncertain commit as uncertain regardless of the ledger', () => {
		const receipt = buildAgenticChatCompletionReceiptV1({
			contract: contract(),
			contractSha256: CONTRACT_SHA,
			toolExecutions: [approval('approve-1', SHA_A), ...CREATES],
			finishedReason: 'mutation_unfulfilled',
			partialFailureClass: 'uncertain_external_commit'
		});
		expect(receipt.request.disposition).toBe('request_uncertain');
		expect(receipt.request.reasons[0]).toBe('uncertain_external_commit');
	});

	it('leaves a contract-free direct write unverified rather than fulfilled', () => {
		const receipt = buildAgenticChatCompletionReceiptV1({
			contract: null,
			contractSha256: null,
			toolExecutions: [
				execution('update_onto_task', { task_id: PERMIT, state_key: 'done' }, 'update-1', {
					result: { id: PERMIT, state_key: 'done' }
				})
			],
			finishedReason: 'stop'
		});
		expect(receipt).toMatchObject({
			contractSha256: null,
			expectation: 'none',
			stages: [],
			unreviewedWriteCallIds: ['update-1'],
			request: {
				disposition: 'request_unverified',
				outcomeStatus: 'fulfilled',
				reasons: ['no_reviewed_contract']
			}
		});
		expect(isAgenticChatRequestFulfilledV1(receipt)).toBe(false);
	});

	it('ignores forged or failed approvals and rejected proposals', () => {
		const receipt = buildAgenticChatCompletionReceiptV1({
			contract: null,
			contractSha256: null,
			toolExecutions: [
				execution('approve_mutation_batch_review', { batch_sha256: 'nope' }, 'bad-1', {
					result: { status: 'mutation_batch_review_approved', batch_sha256: 'nope' }
				}),
				execution('approve_mutation_batch_review', { batch_sha256: SHA_A }, 'bad-2', {
					success: false,
					result: null,
					error: 'reviewer surface invalid'
				}),
				execution('create_onto_task', { project_id: PROJECT, title: 'x' }, 'rejected-1', {
					success: false,
					result: { execution_status: 'not_executed', failure_kind: 'validation' },
					error: 'Tool validation failed'
				}),
				createTask('create-1', PERMIT, 'Permit')
			],
			finishedReason: 'stop'
		});
		expect(receipt.stages).toEqual([]);
		expect(receipt.unreviewedWriteCallIds).toEqual(['create-1']);
		expect(receipt.failedUnreviewedWriteCallIds).toEqual([]);
	});

	it('is a pure function of the ledger, so a replayed finalize yields the same receipt', () => {
		const input = {
			contract: contract(),
			contractSha256: CONTRACT_SHA,
			toolExecutions: [
				approval('approve-1', SHA_A),
				...CREATES,
				approval('approve-2', SHA_B),
				link('link-1', CABINETS, PERMIT)
			],
			finishedReason: 'stop'
		};
		expect(buildAgenticChatCompletionReceiptV1(input)).toEqual(
			buildAgenticChatCompletionReceiptV1({
				...input,
				toolExecutions: [...input.toolExecutions]
			})
		);
	});
});
