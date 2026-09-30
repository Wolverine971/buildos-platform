// packages/agentic-chat-runtime/src/loop/cleanup-manifest.test.ts
import { describe, expect, it } from 'vitest';
import { buildAgenticChatCompletionReceiptV1 } from './completion-receipt';
import {
	buildCleanupManifest,
	describePendingCleanupItems,
	renderAlreadySatisfiedCleanupItems
} from './cleanup-manifest';
import {
	buildRequestCompletionLedger,
	parseRequestExpectation,
	resolveRequestExpectationOutcome
} from './request-expectation';
import { buildWriteLedger } from './write-ledger';
import { serializeTurnContractForDeclaration } from './turn-contract';
import type { FastToolExecution } from './shared';

const IDS = Array.from({ length: 5 }, (_, i) => `10000000-0000-4000-8000-00000000000${i + 1}`);
const PROJECT = '20000000-0000-4000-8000-000000000001';
const SHA = 'a'.repeat(64);
const expectation = () =>
	parseRequestExpectation({
		outcomes: [
			{
				id: 'archives',
				action: 'archive',
				entity_kind: 'task',
				target_ids: IDS,
				required_fields: ['archived'],
				changes: [{ field: 'archived', value: 'true' }],
				minimum_successful_effects: 5
			}
		]
	})!;
function approval(): FastToolExecution {
	const request_expectation = serializeTurnContractForDeclaration(expectation());
	return {
		toolCall: {
			id: 'approval',
			type: 'function',
			function: {
				name: 'approve_mutation_batch_review',
				arguments: JSON.stringify({ batch_sha256: SHA, request_expectation })
			}
		},
		result: {
			tool_call_id: 'approval',
			success: true,
			result: {
				status: 'mutation_batch_review_approved',
				batch_sha256: SHA,
				request_expectation,
				archive_postconditions: {
					version: 1,
					status: 'verified',
					targets: IDS.map((id, i) => ({
						entity_kind: 'task',
						id,
						status: ['archived', 'active', 'active', 'inconsistent', 'unavailable'][i],
						project_id: PROJECT,
						title: `Task ${i + 1}`,
						...(i === 0 ? { archived_at: '2026-09-29T00:00:00Z' } : {})
					}))
				}
			}
		}
	};
}
function archive(id: string, success = true): FastToolExecution {
	return {
		toolCall: {
			id: `write-${id}`,
			type: 'function',
			function: {
				name: 'update_onto_task',
				arguments: JSON.stringify({ task_id: id, archived: true })
			}
		},
		result: {
			tool_call_id: `write-${id}`,
			success,
			result: success ? { task: { id, title: 'Newly archived', state_key: 'todo' } } : null,
			...(success ? {} : { error: 'Write outcome unavailable' })
		}
	};
}
describe('cleanup manifest', () => {
	it('retains global create-label bindings when checking future links and missing creates', () => {
		const contract = parseRequestExpectation({
			outcomes: [
				{
					id: 'first',
					action: 'create',
					entity_kind: 'task',
					label: 'first',
					changes: [{ field: 'title', value: 'First' }]
				},
				{
					id: 'second',
					action: 'create',
					entity_kind: 'task',
					label: 'second',
					changes: [{ field: 'title', value: 'Second' }]
				},
				{
					id: 'link',
					action: 'link',
					entity_kind: 'relationship',
					src_label: 'first',
					dst_label: 'second',
					changes: [{ field: 'rel', value: 'depends_on' }]
				}
			]
		})!;
		const create = (id: string, title: string): FastToolExecution => ({
			toolCall: {
				id: `create-${id}`,
				type: 'function',
				function: {
					name: 'create_onto_task',
					arguments: JSON.stringify({ project_id: PROJECT, title })
				}
			},
			result: { tool_call_id: `create-${id}`, success: true, result: { task: { id, title } } }
		});
		const first = create(IDS[0]!, 'First');
		expect(
			buildCleanupManifest({ contract, toolExecutions: [first] }).items.map((i) => i.status)
		).toEqual(['saved', 'pending', 'pending']);
		const link: FastToolExecution = {
			toolCall: {
				id: 'link',
				type: 'function',
				function: {
					name: 'link_onto_entities',
					arguments: JSON.stringify({
						src_kind: 'task',
						src_id: IDS[0],
						dst_kind: 'task',
						dst_id: IDS[1],
						rel: 'depends_on'
					})
				}
			},
			result: { tool_call_id: 'link', success: true, result: { edge_id: IDS[2] } }
		};
		const manifest = buildCleanupManifest({
			contract,
			toolExecutions: [first, create(IDS[1]!, 'Second'), link]
		});
		expect(manifest).toMatchObject({
			fulfilled: true,
			items: [
				{ status: 'saved', targetId: IDS[0], title: 'First' },
				{ status: 'saved', targetId: IDS[1], title: 'Second' },
				{ status: 'saved' }
			]
		});
	});
	it('does not reuse an earlier archive success after a later failed attempt', () => {
		const executions = [approval(), ...IDS.map((id) => archive(id)), archive(IDS[1]!, false)];
		expect(
			resolveRequestExpectationOutcome({
				contract: expectation(),
				toolExecutions: executions
			}).fulfilled
		).toBe(false);
		expect(
			buildCleanupManifest({
				contract: expectation(),
				toolExecutions: executions,
				partialFailureClass: 'uncertain_external_commit'
			}).items[1]!.status
		).toBe('blocked');
	});
	it.each(['archive_children', 'promote_children'])(
		'carries uncertain descendants only when %s actually archives them',
		(mode) => {
			const contract = parseRequestExpectation({
				outcomes: [
					{
						id: 'docs',
						action: 'archive',
						entity_kind: 'document',
						target_ids: IDS.slice(0, 3),
						required_fields: ['state_key'],
						changes: [{ field: 'state_key', value: 'archived' }],
						minimum_successful_effects: 3
					}
				]
			})!;
			const call: FastToolExecution = {
				toolCall: {
					id: 'uncertain-doc',
					type: 'function',
					function: {
						name: 'update_onto_document',
						arguments: JSON.stringify({
							document_id: IDS[0],
							state_key: 'archived',
							archive_mode: mode,
							_archive_review: {
								archived_document_ids:
									mode === 'archive_children' ? IDS.slice(0, 2) : [IDS[0]],
								documents: IDS.slice(0, 2).map((id) => ({ id, title: 'Doc' }))
							}
						})
					}
				},
				result: {
					tool_call_id: 'uncertain-doc',
					success: false,
					result: { effect_outcome: 'uncertain', effect_id: 'effect' }
				}
			};
			expect(
				buildCleanupManifest({
					contract,
					toolExecutions: [call],
					partialFailureClass: 'uncertain_external_commit'
				}).items.map((i) => i.status)
			).toEqual(
				mode === 'archive_children'
					? ['uncertain', 'uncertain', 'pending']
					: ['uncertain', 'pending', 'pending']
			);
		}
	);
	it('marks only the unsettled attempted target uncertain, leaving known failures blocked and unattempted work pending', () => {
		const unsettled = archive(IDS[3]!, false);
		unsettled.result.result = { effect_outcome: 'uncertain', effect_id: 'effect' };
		const executions = [approval(), archive(IDS[1]!), archive(IDS[2]!, false), unsettled];
		const receipt = buildAgenticChatCompletionReceiptV1({
			contract: null,
			contractSha256: null,
			toolExecutions: executions,
			finishedReason: 'error',
			partialFailureClass: 'uncertain_external_commit'
		});
		expect(receipt.request.disposition).toBe('request_uncertain');
		expect(receipt.cleanupManifest!.items.map((i) => i.status)).toEqual([
			'already_satisfied',
			'saved',
			'blocked',
			'uncertain',
			'pending'
		]);
	});
	it('persists saved, verified no-op, pending and blocked targets separately', () => {
		const executions = [approval(), archive(IDS[1]!), archive(IDS[2]!, false)];
		const manifest = buildCleanupManifest({
			contract: expectation(),
			toolExecutions: executions
		});
		expect(manifest.items.map((i) => i.status)).toEqual([
			'already_satisfied',
			'saved',
			'blocked',
			'blocked',
			'pending'
		]);
		expect(buildWriteLedger(executions)).toHaveLength(2);
		expect(buildRequestCompletionLedger(executions).alreadySatisfied).toHaveLength(1);
		expect(renderAlreadySatisfiedCleanupItems(manifest)).toContain('Task 1');
		expect(describePendingCleanupItems(manifest).join('; ')).not.toContain('Task 1');
		const receipt = buildAgenticChatCompletionReceiptV1({
			contract: null,
			contractSha256: null,
			toolExecutions: executions,
			finishedReason: 'stop'
		});
		expect(receipt.cleanupManifest).toEqual(manifest);
		expect(receipt.request.disposition).toBe('request_partial');
		expect(receipt.stages[0]!.executedCallIds).toHaveLength(1);
	});
	it('fulfills the immutable commission with one verified preexisting archive and four actual writes', () => {
		const executions = [approval(), ...IDS.slice(1).map((id) => archive(id))];
		expect(
			resolveRequestExpectationOutcome({
				contract: expectation(),
				toolExecutions: executions
			}).fulfilled
		).toBe(true);
		expect(buildWriteLedger(executions)).toHaveLength(4);
		expect(
			buildAgenticChatCompletionReceiptV1({
				contract: null,
				contractSha256: null,
				toolExecutions: executions,
				finishedReason: 'stop'
			}).request.disposition
		).toBe('request_fulfilled');
	});
	it('invalidates a preexisting archive read after any later attempt on that target', () => {
		const executions = [approval(), archive(IDS[0]!, false)];
		expect(buildRequestCompletionLedger(executions).alreadySatisfied).toHaveLength(0);
		expect(
			buildCleanupManifest({ contract: expectation(), toolExecutions: executions }).items[0]!
				.status
		).toBe('blocked');
		expect(
			buildCleanupManifest({
				contract: expectation(),
				toolExecutions: executions,
				partialFailureClass: 'uncertain_external_commit'
			}).items[0]!.status
		).toBe('blocked');
	});
	it.each(['argument', 'later', 'mismatched', 'malformed'])(
		'rejects untrusted or stale no-op evidence: %s',
		(source) => {
			const approved = approval();
			const facts = approved.result.result!.archive_postconditions!;
			let executions = [approved];
			if (source === 'argument') {
				const args = JSON.parse(approved.toolCall.function.arguments);
				approved.toolCall.function.arguments = JSON.stringify({
					...args,
					archive_postconditions: facts
				});
				delete approved.result.result!.archive_postconditions;
			} else if (source === 'later') {
				delete approved.result.result!.archive_postconditions;
				executions = [approved, archive(IDS[1]!), approval()];
			} else if (source === 'mismatched') {
				approved.result.result!.batch_sha256 = 'b'.repeat(64);
			} else {
				approved.result.result!.archive_postconditions = {
					version: 1,
					status: 'verified',
					targets: [{ entity_kind: 'task', id: PROJECT, status: 'archived' }]
				};
			}
			expect(buildRequestCompletionLedger(executions).alreadySatisfied).toHaveLength(0);
		}
	);
	it('never credits archive evidence as task completion or as another required field', () => {
		const contract = expectation();
		contract.outcomes[0]!.action = 'complete';
		contract.outcomes[0]!.requiredFields = ['state_key'];
		contract.outcomes[0]!.changes = [{ field: 'state_key', value: 'done' }];
		expect(
			resolveRequestExpectationOutcome({ contract, toolExecutions: [approval()] })
				.outcomes[0]!.matchedEffects
		).toBe(0);
		const archiveContract = expectation();
		archiveContract.outcomes[0]!.requiredFields.push('description');
		expect(
			resolveRequestExpectationOutcome({
				contract: archiveContract,
				toolExecutions: [approval()]
			}).outcomes[0]!.matchedEffects
		).toBe(0);
	});
});
