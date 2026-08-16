// packages/agentic-chat-runtime/src/loop/turn-contract.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import type { FastToolExecution } from './shared';
import {
	buildFastChatPendingTurnContract,
	deriveImplicitTurnContract,
	executeCancelTurnContract,
	executeDeclareReadOnlyTurn,
	executeDeclareTurnContract,
	executeRequestTurnClarification,
	extractDeclaredTurnContract,
	mergeTurnContracts,
	parseDeclaredTurnContract,
	readFastChatPendingTurnContract,
	resolveTurnContractFromExecutions,
	resolveTurnContractOutcome,
	type TurnContract
} from './turn-contract';

function call(name: string, args: Record<string, unknown>, id = `${name}-1`): ChatToolCall {
	return {
		id,
		type: 'function',
		function: { name, arguments: JSON.stringify(args) }
	};
}

function execution(
	name: string,
	args: Record<string, unknown>,
	result: Partial<ChatToolResult> = {},
	id?: string
): FastToolExecution {
	const toolCall = call(name, args, id ?? `${name}-${JSON.stringify(args)}`);
	return {
		toolCall,
		result: {
			tool_call_id: toolCall.id,
			success: true,
			result: {},
			...result
		}
	};
}

describe('semantic turn contracts', () => {
	it('accepts a declared semantic outcome without tool names or curated phrases', () => {
		const toolCall = call('declare_turn_contract', {
			summary: 'Put the loose research into its requested homes',
			outcomes: [
				{
					action: 'organize',
					entity_kind: 'documents',
					target_ids: ['doc-a', 'doc-b'],
					minimum_successful_effects: 2
				}
			]
		});
		const contract = extractDeclaredTurnContract(toolCall);
		expect(contract?.outcomes[0]).toMatchObject({
			action: 'organize',
			entityKind: 'document',
			targetIds: ['doc-a', 'doc-b'],
			minimumSuccessfulEffects: 2
		});
		expect(executeDeclareTurnContract(toolCall).success).toBe(true);
	});

	it('does not treat a containing project id as the target id of a create outcome', () => {
		const contract = parseDeclaredTurnContract({
			outcomes: [
				{
					action: 'create',
					entity_kind: 'task',
					target_ids: ['project-a'],
					required_fields: ['title'],
					minimum_successful_effects: 1
				}
			]
		});

		expect(contract?.outcomes[0]?.targetIds).toEqual([]);
		expect(
			resolveTurnContractOutcome({
				contract,
				toolExecutions: [
					execution(
						'create_onto_task',
						{ project_id: 'project-a', title: 'Enterprise SSO' },
						{ result: { task: { id: 'task-new', title: 'Enterprise SSO' } } }
					)
				]
			}).fulfilled
		).toBe(true);
	});

	it('rejects a malformed declaration rather than silently weakening it', () => {
		const result = executeDeclareTurnContract(
			call('declare_turn_contract', {
				outcomes: [{ action: 'think_about', entity_kind: 'document' }]
			})
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain('validation failed');
	});

	it('rejects oversized or partially invalid declarations instead of truncating them', () => {
		expect(
			executeDeclareTurnContract(
				call('declare_turn_contract', {
					outcomes: Array.from({ length: 21 }, (_, index) => ({
						action: 'update',
						entity_kind: 'task',
						minimum_successful_effects: 1,
						id: `outcome-${index}`
					}))
				})
			).success
		).toBe(false);
		expect(
			executeDeclareTurnContract(
				call('declare_turn_contract', {
					outcomes: [
						{
							action: 'update',
							entity_kind: 'task',
							target_ids: ['task-a', null],
							minimum_successful_effects: 1
						}
					]
				})
			).success
		).toBe(false);
		expect(
			executeDeclareTurnContract(
				call('declare_turn_contract', {
					outcomes: [
						{
							action: 'update',
							entity_kind: 'task',
							target_ids: ['task-a'],
							minimum_successful_effects: 2
						}
					]
				})
			).success
		).toBe(false);
	});

	it('records an explicit read-only semantic disposition without creating a durable contract', () => {
		const disposition = call('declare_read_only_turn', {
			reason: 'The user asked only for an explanation from current project data.'
		});
		expect(executeDeclareReadOnlyTurn(disposition)).toMatchObject({
			success: true,
			result: { status: 'read_only_declared' }
		});
		expect(executeDeclareReadOnlyTurn(call('declare_read_only_turn', {})).success).toBe(false);
		expect(
			resolveTurnContractFromExecutions([
				{ toolCall: disposition, result: executeDeclareReadOnlyTurn(disposition) }
			])
		).toBeNull();
	});

	it('records a clarification disposition as requiring user action without creating a contract', () => {
		const clarification = call('request_turn_clarification', {
			reason: 'More than one accessible task is a plausible referent.',
			question: 'Which of the matching tasks should I update?'
		});
		expect(executeRequestTurnClarification(clarification)).toMatchObject({
			success: true,
			requires_user_action: true,
			result: { status: 'clarification_required', requires_user_action: true }
		});
		expect(
			executeRequestTurnClarification(call('request_turn_clarification', { reason: 'x' }))
				.success
		).toBe(false);
		expect(
			resolveTurnContractFromExecutions([
				{
					toolCall: clarification,
					result: executeRequestTurnClarification(clarification)
				}
			])
		).toBeNull();
		expect(
			resolveTurnContractFromExecutions(
				[
					{
						toolCall: clarification,
						result: executeRequestTurnClarification(clarification)
					}
				],
				{
					version: 1,
					source: 'declared',
					outcomes: [
						{
							id: 'premature',
							action: 'update',
							entityKind: 'task',
							targetIds: [],
							requiredFields: [],
							minimumSuccessfulEffects: 1
						}
					]
				}
			)
		).toBeNull();
	});

	it('cancels a prior contract only through an explicit validated control call', () => {
		const prior: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [
				{
					id: 'prior-write',
					action: 'update',
					entityKind: 'task',
					targetIds: ['task-a'],
					requiredFields: ['title'],
					minimumSuccessfulEffects: 1
				}
			]
		};
		const cancellationCall = call(
			'cancel_turn_contract',
			{ reason: 'The user explicitly said to stop the prior task update.' },
			'cancel-prior'
		);
		expect(executeCancelTurnContract(cancellationCall).success).toBe(true);
		expect(
			resolveTurnContractFromExecutions(
				[
					{
						toolCall: cancellationCall,
						result: executeCancelTurnContract(cancellationCall)
					}
				],
				prior
			)
		).toBeNull();
		expect(executeCancelTurnContract(call('cancel_turn_contract', {})).success).toBe(false);
	});

	it('keeps a new direct write after cancellation as an implicit contract', () => {
		const cancellationCall = call(
			'cancel_turn_contract',
			{ reason: 'The user replaced the prior commission.' },
			'cancel-prior'
		);
		const failedNewWrite = execution(
			'update_onto_task',
			{ task_id: 'task-new', title: 'Replacement title' },
			{ success: false, error: 'temporary failure' },
			'new-write'
		);
		expect(
			resolveTurnContractFromExecutions([
				{
					toolCall: cancellationCall,
					result: executeCancelTurnContract(cancellationCall)
				},
				failedNewWrite
			])
		).toMatchObject({
			source: 'implicit',
			outcomes: [{ targetIds: ['task-new'], requiredFields: ['title'] }]
		});
	});

	it('requires every targeted effect instead of one matching tool name', () => {
		const contract: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [
				{
					id: 'organized',
					action: 'organize',
					entityKind: 'document',
					targetIds: ['doc-a', 'doc-b'],
					requiredFields: [],
					minimumSuccessfulEffects: 2
				}
			]
		};
		const oneMove = [
			execution('move_document_in_tree', {
				document_id: 'doc-a',
				new_parent_id: 'folder-a'
			})
		];
		expect(resolveTurnContractOutcome({ contract, toolExecutions: oneMove })).toMatchObject({
			fulfilled: false,
			outcomes: [{ missingTargetIds: ['doc-b'], matchedEffects: 1 }]
		});
		const bothMoves = [
			...oneMove,
			execution(
				'move_document_in_tree',
				{ document_id: 'doc-b', new_parent_id: 'folder-b' },
				{},
				'move-doc-b'
			)
		];
		expect(resolveTurnContractOutcome({ contract, toolExecutions: bothMoves }).fulfilled).toBe(
			true
		);
	});

	it('uses the reviewed minimum as cardinality within the bounded target set', () => {
		const contract = parseDeclaredTurnContract({
			outcomes: [
				{
					action: 'organize',
					entity_kind: 'document',
					target_ids: ['doc-a', 'doc-b', 'special-context-doc'],
					minimum_successful_effects: 2
				}
			]
		});
		expect(contract?.outcomes[0]?.minimumSuccessfulEffects).toBe(2);
		expect(
			resolveTurnContractOutcome({
				contract,
				toolExecutions: [
					execution('move_document_in_tree', {
						document_id: 'doc-a',
						new_parent_id: 'folder-a'
					}),
					execution('move_document_in_tree', {
						document_id: 'doc-b',
						new_parent_id: 'folder-b'
					}),
					execution('move_document_in_tree', {
						document_id: 'outside-reviewed-scope',
						new_parent_id: 'folder-c'
					})
				]
			})
		).toMatchObject({
			fulfilled: true,
			outcomes: [
				{
					matchedEffects: 2,
					missingTargetIds: ['special-context-doc']
				}
			]
		});
	});

	it('treats create and move tree placement names as one semantic postcondition', () => {
		const parsed = parseDeclaredTurnContract({
			outcomes: [
				{
					action: 'organize',
					entity_kind: 'document',
					target_ids: ['doc-a'],
					required_fields: ['new_parent_id', 'new_position'],
					minimum_successful_effects: 1
				}
			]
		});
		expect(parsed?.outcomes[0]?.requiredFields).toEqual(['parent_id', 'position']);
		expect(
			resolveTurnContractOutcome({
				contract: parsed,
				toolExecutions: [
					execution('move_document_in_tree', {
						document_id: 'doc-a',
						new_parent_id: 'folder-a',
						new_position: 2
					})
				]
			}).fulfilled
		).toBe(true);

		const createContract: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [
				{
					id: 'root-folder',
					action: 'create',
					entityKind: 'document',
					targetIds: [],
					requiredFields: ['parent_id'],
					minimumSuccessfulEffects: 1
				}
			]
		};
		expect(
			resolveTurnContractOutcome({
				contract: createContract,
				toolExecutions: [
					execution('create_onto_document', {
						project_id: 'project-a',
						title: 'Folder',
						description: 'A folder',
						parent_id: null
					})
				]
			}).fulfilled
		).toBe(true);
	});

	it('does not count failed writes or duplicate calls as fulfilled effects', () => {
		const contract: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [
				{
					id: 'two-docs',
					action: 'move',
					entityKind: 'document',
					targetIds: [],
					requiredFields: [],
					minimumSuccessfulEffects: 2
				}
			]
		};
		const firstCall = execution(
			'move_document_in_tree',
			{ document_id: 'doc-a', new_parent_id: 'folder-a' },
			{},
			'first-effect-id'
		);
		const repeatedTarget = execution(
			'move_document_in_tree',
			{ document_id: 'doc-a', new_parent_id: 'folder-b' },
			{},
			'second-effect-id'
		);
		const failed = execution(
			'move_document_in_tree',
			{ document_id: 'doc-b', new_parent_id: 'folder-a' },
			{ success: false, error: 'nope' },
			'failed-effect'
		);
		expect(
			resolveTurnContractOutcome({
				contract,
				toolExecutions: [firstCall, repeatedTarget, failed]
			}).outcomes[0]?.matchedEffects
		).toBe(1);
	});

	it('requires declared fields on every targeted effect', () => {
		const contract: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [
				{
					id: 'complete-both-tasks',
					action: 'update',
					entityKind: 'task',
					targetIds: ['task-a', 'task-b'],
					requiredFields: ['state_key'],
					minimumSuccessfulEffects: 2
				}
			]
		};
		const result = resolveTurnContractOutcome({
			contract,
			toolExecutions: [
				execution('update_onto_task', { task_id: 'task-a', state_key: 'done' }),
				execution('update_onto_task', { task_id: 'task-b', title: 'Renamed only' })
			]
		});
		expect(result).toMatchObject({
			fulfilled: false,
			outcomes: [
				{
					matchedEffects: 1,
					missingTargetIds: ['task-b'],
					missingRequiredFields: ['task-b.state_key']
				}
			]
		});
	});

	it('allows required fields for one target to accumulate across successful writes', () => {
		const contract: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [
				{
					id: 'update-task',
					action: 'update',
					entityKind: 'task',
					targetIds: ['task-a'],
					requiredFields: ['title', 'description'],
					minimumSuccessfulEffects: 1
				}
			]
		};
		expect(
			resolveTurnContractOutcome({
				contract,
				toolExecutions: [
					execution('update_onto_task', { task_id: 'task-a', title: 'New title' }),
					execution('update_onto_task', {
						task_id: 'task-a',
						description: 'New description'
					})
				]
			}).fulfilled
		).toBe(true);
	});

	it.each([
		['assign', 'task', 'assignee_actor_ids', ['actor-a']],
		['complete', 'task', 'state_key', 'done'],
		['archive', 'document', 'state_key', 'archived'],
		['restore', 'document', 'state_key', 'draft']
	] as const)(
		'treats a matching update effect as semantic fulfillment for %s',
		(action, entityKind, field, value) => {
			const contract: TurnContract = {
				version: 1,
				source: 'declared',
				outcomes: [
					{
						id: `${action}-task`,
						action,
						entityKind,
						targetIds: [`${entityKind}-a`],
						requiredFields: [field],
						minimumSuccessfulEffects: 1
					}
				]
			};
			expect(
				resolveTurnContractOutcome({
					contract,
					toolExecutions: [
						execution(`update_onto_${entityKind}`, {
							[`${entityKind}_id`]: `${entityKind}-a`,
							[field]: value
						})
					]
				}).fulfilled
			).toBe(true);
		}
	);

	it('does not confuse an unrelated update with a lifecycle action', () => {
		const contract: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [
				{
					id: 'archive-document',
					action: 'archive',
					entityKind: 'document',
					targetIds: ['document-a'],
					requiredFields: [],
					minimumSuccessfulEffects: 1
				}
			]
		};
		expect(
			resolveTurnContractOutcome({
				contract,
				toolExecutions: [
					execution('update_onto_document', {
						document_id: 'document-a',
						title: 'Only renamed'
					})
				]
			}).fulfilled
		).toBe(false);
	});

	it('keeps a failed lifecycle write as evidence for its declaration', () => {
		const declaration = execution('declare_turn_contract', {
			outcomes: [
				{
					id: 'archive-document',
					action: 'archive',
					entity_kind: 'document',
					target_ids: ['document-a'],
					required_fields: ['state_key'],
					minimum_successful_effects: 1
				}
			]
		});
		const failedArchive = execution(
			'update_onto_document',
			{ document_id: 'document-a', state_key: 'archived' },
			{ success: false, error: 'temporary failure' }
		);

		expect(resolveTurnContractFromExecutions([declaration, failedArchive])).toMatchObject({
			outcomes: [{ id: 'archive-document', action: 'archive' }]
		});
		expect(
			resolveTurnContractFromExecutions([declaration, failedArchive])?.outcomes
		).toHaveLength(1);
	});

	it('does not turn a rejected out-of-contract proposal into future authority', () => {
		const declaration = execution('declare_turn_contract', {
			outcomes: [
				{
					id: 'organize-documents',
					action: 'organize',
					entity_kind: 'document',
					target_ids: ['document-a'],
					minimum_successful_effects: 1
				}
			]
		});
		const rejectedConvenienceEdit = execution(
			'update_onto_document',
			{ document_id: 'special-context-doc', content: 'Unrequested convenience edit' },
			{
				success: false,
				error: 'Mutation is outside the independently approved turn contract.'
			}
		);

		expect(
			resolveTurnContractFromExecutions([declaration, rejectedConvenienceEdit])?.outcomes
		).toEqual([expect.objectContaining({ id: 'organize-documents', action: 'organize' })]);
	});

	it('derives an implicit contract from a direct write call', () => {
		const directWrite = execution(
			'update_onto_task',
			{ task_id: 'task-a', title: 'Ship it', state_key: 'done' },
			{ result: { task: { id: 'task-a', title: 'Ship it', state_key: 'done' } } }
		);
		const contract = deriveImplicitTurnContract([directWrite]);
		expect(contract).toMatchObject({
			source: 'implicit',
			outcomes: [
				{
					action: 'update',
					entityKind: 'task',
					targetIds: ['task-a'],
					requiredFields: ['state_key', 'title']
				}
			]
		});
		expect(
			resolveTurnContractOutcome({ contract, toolExecutions: [directWrite] }).fulfilled
		).toBe(true);
	});

	it('merges read-before-write declarations with direct write evidence', () => {
		const declared: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [
				{
					id: 'move-doc',
					action: 'move',
					entityKind: 'document',
					targetIds: ['doc-a'],
					requiredFields: [],
					minimumSuccessfulEffects: 1
				}
			]
		};
		const implicit: TurnContract = {
			...declared,
			source: 'implicit'
		};
		expect(mergeTurnContracts(declared, implicit)).toMatchObject({
			source: 'combined',
			outcomes: [{ id: 'move-doc' }]
		});
	});

	it('carries forward only unfinished semantic outcomes', () => {
		const contract: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [
				{
					id: 'done',
					action: 'move',
					entityKind: 'document',
					targetIds: ['doc-a'],
					requiredFields: [],
					minimumSuccessfulEffects: 1
				},
				{
					id: 'unfinished',
					action: 'move',
					entityKind: 'document',
					targetIds: ['doc-b'],
					requiredFields: [],
					minimumSuccessfulEffects: 1
				}
			]
		};
		const pending = buildFastChatPendingTurnContract({
			resolution: {
				status: 'unfulfilled',
				fulfilled: false,
				contract,
				outcomes: [
					{
						id: 'done',
						fulfilled: true,
						matchedEffects: 1,
						requiredEffects: 1,
						missingTargetIds: [],
						missingRequiredFields: []
					},
					{
						id: 'unfinished',
						fulfilled: false,
						matchedEffects: 0,
						requiredEffects: 1,
						missingTargetIds: ['doc-b'],
						missingRequiredFields: []
					}
				]
			},
			contextType: 'project',
			projectId: 'project-a',
			turnRunId: 'turn-a',
			now: new Date('2026-08-14T12:00:00.000Z')
		});

		expect(pending?.contract.outcomes).toEqual([contract.outcomes[1]]);
		expect(readFastChatPendingTurnContract(pending)).toMatchObject({
			contextType: 'project',
			projectId: 'project-a',
			contract: { outcomes: [{ id: 'unfinished', targetIds: ['doc-b'] }] }
		});
	});

	it('does not retain a fulfilled bounded organization or a rejected convenience edit', () => {
		const looseDocumentIds = ['doc-a', 'doc-b', 'doc-c', 'doc-d', 'doc-e', 'doc-f'];
		const declaration = execution('declare_turn_contract', {
			outcomes: [
				{
					id: 'organize-loose-documents',
					action: 'organize',
					entity_kind: 'document',
					target_ids: [...looseDocumentIds, 'special-context-doc'],
					minimum_successful_effects: 4
				},
				{
					id: 'create-folders',
					action: 'create',
					entity_kind: 'document',
					minimum_successful_effects: 3
				}
			]
		});
		const writes = [
			...['folder-a', 'folder-b', 'folder-c'].map((id) =>
				execution(
					'create_onto_document',
					{ project_id: 'project-a', title: id },
					{ result: { document: { id, title: id } } },
					`create-${id}`
				)
			),
			...looseDocumentIds.map((id, index) =>
				execution(
					'move_document_in_tree',
					{ document_id: id, new_parent_id: `folder-${index % 3}` },
					{},
					`move-${id}`
				)
			),
			execution(
				'update_onto_document',
				{ document_id: 'special-context-doc', content: 'Unrequested convenience edit' },
				{
					success: false,
					error: 'Mutation is outside the independently approved turn contract.'
				},
				'rejected-convenience-edit'
			)
		];
		const executions = [declaration, ...writes];
		const contract = resolveTurnContractFromExecutions(executions);
		const resolution = resolveTurnContractOutcome({ contract, toolExecutions: executions });

		expect(resolution).toMatchObject({
			fulfilled: true,
			outcomes: [
				{ id: 'organize-loose-documents', matchedEffects: 6 },
				{ id: 'create-folders', matchedEffects: 3 }
			]
		});
		expect(
			buildFastChatPendingTurnContract({
				resolution,
				contextType: 'project',
				projectId: 'project-a',
				turnRunId: 'turn-live-regression'
			})
		).toBeNull();
	});
});
