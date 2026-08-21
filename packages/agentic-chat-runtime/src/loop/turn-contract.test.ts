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
	describeDeclaredTurnContractIssues,
	parseDeclaredTurnContract,
	readFastChatPendingTurnContract,
	resolveTurnContractFromExecutions,
	resolveTurnContractOutcome,
	bindTurnContractLabels,
	titleKey,
	type TurnContract,
	type TurnContractOutcome
} from './turn-contract';
import { buildWriteLedger } from './write-ledger';

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

describe('turn contract changes', () => {
	function heterogeneousDeclaration(): Record<string, unknown> {
		return {
			summary: 'Finish two tasks and re-prioritize a third',
			outcomes: [
				{
					id: 'finished',
					action: 'update',
					entity_kind: 'task',
					target_ids: ['resume', 'linkedin'],
					changes: [{ field: 'state_key', value: 'done' }],
					minimum_successful_effects: 2
				},
				{
					id: 'top-priority',
					action: 'update',
					entity_kind: 'task',
					target_ids: ['halcyon'],
					changes: [{ field: 'priority', value: 1 }],
					minimum_successful_effects: 1
				}
			]
		};
	}

	it('parses changes per outcome and unions their fields into required fields', () => {
		const contract = parseDeclaredTurnContract(heterogeneousDeclaration());
		expect(contract?.outcomes[0]).toEqual({
			id: 'finished',
			action: 'update',
			entityKind: 'task',
			targetIds: ['resume', 'linkedin'],
			requiredFields: ['state_key'],
			changes: [{ field: 'state_key', value: 'done' }],
			minimumSuccessfulEffects: 2
		});
		expect(contract?.outcomes[1]).toMatchObject({
			requiredFields: ['priority'],
			changes: [{ field: 'priority', value: '1' }]
		});
		// The reviewer reads the serialized contract, so the values must survive it.
		expect(JSON.stringify(contract)).toContain('"changes":[{"field":"priority","value":"1"}]');
	});

	it('keeps explicit required_fields and omits changes when none were declared', () => {
		const contract = parseDeclaredTurnContract({
			outcomes: [
				{
					action: 'update',
					entity_kind: 'task',
					target_ids: ['task-a'],
					required_fields: ['title'],
					changes: [{ field: 'priority', value: '2' }],
					minimum_successful_effects: 1
				},
				{
					action: 'update',
					entity_kind: 'task',
					target_ids: ['task-b'],
					required_fields: ['title'],
					minimum_successful_effects: 1
				}
			]
		});
		expect(contract?.outcomes[0]?.requiredFields).toEqual(['title', 'priority']);
		expect(contract?.outcomes[1]?.requiredFields).toEqual(['title']);
		expect(contract?.outcomes[1]).not.toHaveProperty('changes');
	});

	it('normalizes change field names, stringifies scalar values, and keeps the last value per field', () => {
		const contract = parseDeclaredTurnContract({
			outcomes: [
				{
					action: 'organize',
					entity_kind: 'document',
					target_ids: ['doc-a'],
					changes: [
						{ field: 'stateKey', value: 'in_progress' },
						{ field: 'new_parent_id', value: 'folder-a' },
						{ field: 'state_key', value: 'done' },
						{ field: 'is_pinned', value: true },
						{ field: 'due_at', value: null }
					],
					minimum_successful_effects: 1
				}
			]
		});
		expect(contract?.outcomes[0]?.changes).toEqual([
			{ field: 'state_key', value: 'done' },
			{ field: 'parent_id', value: 'folder-a' },
			{ field: 'is_pinned', value: 'true' },
			{ field: 'due_at', value: 'null' }
		]);
		expect(contract?.outcomes[0]?.requiredFields).toEqual([
			'state_key',
			'parent_id',
			'is_pinned',
			'due_at'
		]);
	});

	it.each([
		['a non-array', 'state_key=done'],
		['an entry without a value', [{ field: 'state_key' }]],
		['an entry without a field', [{ value: 'done' }]],
		['a blank field', [{ field: '   ', value: 'done' }]],
		['a blank value', [{ field: 'state_key', value: '   ' }]],
		['an object value', [{ field: 'props', value: { nested: true } }]],
		['a non-object entry', ['state_key']],
		[
			'more than twenty entries',
			Array.from({ length: 21 }, (_, index) => ({ field: `field_${index}`, value: 'x' }))
		]
	])('rejects the whole declaration when changes contains %s', (_label, changes) => {
		const result = executeDeclareTurnContract(
			call('declare_turn_contract', {
				outcomes: [
					{
						action: 'update',
						entity_kind: 'task',
						target_ids: ['task-a'],
						changes,
						minimum_successful_effects: 1
					}
				]
			})
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain('validation failed');
	});

	it('treats outcomes that differ only by their changes as distinct when merging', () => {
		const base: Omit<TurnContractOutcome, 'changes'> = {
			id: 'x',
			action: 'update',
			entityKind: 'task',
			targetIds: ['task-a'],
			requiredFields: ['priority'],
			minimumSuccessfulEffects: 1
		};
		const priorityOne: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [{ ...base, changes: [{ field: 'priority', value: '1' }] }]
		};
		const priorityTwo: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [{ ...base, changes: [{ field: 'priority', value: '2' }] }]
		};
		expect(mergeTurnContracts(priorityOne, priorityTwo)?.outcomes).toHaveLength(2);
		expect(mergeTurnContracts(priorityOne, priorityOne)?.outcomes).toHaveLength(1);
	});

	it('fulfills a change only when the target write actually sets that field', () => {
		const contract: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [
				{
					id: 'top-priority',
					action: 'update',
					entityKind: 'task',
					targetIds: ['halcyon'],
					requiredFields: ['priority'],
					changes: [{ field: 'priority', value: '1' }],
					minimumSuccessfulEffects: 1
				}
			]
		};
		expect(
			resolveTurnContractOutcome({
				contract,
				toolExecutions: [
					execution('update_onto_task', { task_id: 'halcyon', state_key: 'done' })
				]
			})
		).toMatchObject({
			fulfilled: false,
			outcomes: [
				{ missingTargetIds: ['halcyon'], missingRequiredFields: ['halcyon.priority'] }
			]
		});
		expect(
			resolveTurnContractOutcome({
				contract,
				toolExecutions: [execution('update_onto_task', { task_id: 'halcyon', priority: 1 })]
			}).fulfilled
		).toBe(true);
	});

	it('fulfills a declared change only when the successful write sets the declared value', () => {
		const contract: TurnContract = {
			version: 1,
			source: 'declared',
			outcomes: [
				{
					id: 'top-priority',
					action: 'update',
					entityKind: 'task',
					targetIds: ['halcyon'],
					requiredFields: ['priority'],
					changes: [{ field: 'priority', value: '1' }],
					minimumSuccessfulEffects: 1
				}
			]
		};

		expect(
			resolveTurnContractOutcome({
				contract,
				toolExecutions: [execution('update_onto_task', { task_id: 'halcyon', priority: 5 })]
			}).fulfilled
		).toBe(false);
		expect(
			resolveTurnContractOutcome({
				contract,
				toolExecutions: [
					execution('update_onto_task', { task_id: 'halcyon', priority: 5 }, {}, 'wrong'),
					execution(
						'update_onto_task',
						{ task_id: 'halcyon', priority: 1 },
						{},
						'correct'
					)
				]
			}).fulfilled
		).toBe(true);
		expect(
			resolveTurnContractOutcome({
				contract,
				toolExecutions: [
					execution(
						'update_onto_task',
						{ task_id: 'halcyon', priority: 1 },
						{},
						'correct'
					),
					execution(
						'update_onto_task',
						{ task_id: 'halcyon', priority: 5 },
						{},
						'overwritten'
					)
				]
			}).fulfilled
		).toBe(false);
	});

	it('resolves a heterogeneous declaration from mixed writes and carries changes forward', () => {
		const declaration = execution('declare_turn_contract', heterogeneousDeclaration());
		const finished = ['resume', 'linkedin'].map((id) =>
			execution('update_onto_task', { task_id: id, state_key: 'done' }, {}, `done-${id}`)
		);
		const contract = resolveTurnContractFromExecutions([declaration, ...finished]);
		const partial = resolveTurnContractOutcome({
			contract,
			toolExecutions: [declaration, ...finished]
		});
		expect(partial).toMatchObject({
			fulfilled: false,
			outcomes: [
				{ id: 'finished', fulfilled: true, matchedEffects: 2 },
				{
					id: 'top-priority',
					fulfilled: false,
					missingRequiredFields: ['halcyon.priority']
				}
			]
		});

		const pending = buildFastChatPendingTurnContract({
			resolution: partial,
			contextType: 'project',
			projectId: 'project-a'
		});
		expect(readFastChatPendingTurnContract(pending)?.contract.outcomes).toEqual([
			expect.objectContaining({
				id: 'top-priority',
				requiredFields: ['priority'],
				changes: [{ field: 'priority', value: '1' }]
			})
		]);

		const reprioritized = execution(
			'update_onto_task',
			{ task_id: 'halcyon', priority: 1 },
			{},
			'priority-halcyon'
		);
		expect(
			resolveTurnContractOutcome({
				contract,
				toolExecutions: [declaration, ...finished, reprioritized]
			}).fulfilled
		).toBe(true);
	});
});

/**
 * Live evidence: Agentic Chat worker Phase 6 / Phase 4 rerun 2026-08-20,
 * scenario `task-multi-update` rep 2 (stream run 5536abdd, turn run 731d8b08).
 * The acting model declared the same contract three times and the turn died with
 * `provider_tool_validation_repair_exhausted`. The sole defect was outcome 3:
 * one target with two declared `changes` and `minimum_successful_effects: 2`.
 * The model counted changed fields as effects; the parser counts targets.
 * Rejection is correct — the opaque single-sentence error is not, because the
 * bounded repair loop had nothing specific to correct.
 */
describe('declared turn contract rejection reasons', () => {
	const liveFailedContract = {
		summary: 'Mark resume and LinkedIn tasks done, bump Halcyon prep to top priority',
		outcomes: [
			{
				action: 'update',
				changes: [{ field: 'state_key', value: 'done' }],
				target_ids: ['439660c0-127d-4a0c-9d1e-7680a7e62991'],
				entity_kind: 'task',
				minimum_successful_effects: 1
			},
			{
				action: 'update',
				changes: [{ field: 'state_key', value: 'done' }],
				target_ids: ['0ecb4ca9-c291-4177-932e-83da7dcdd66a'],
				entity_kind: 'task',
				minimum_successful_effects: 1
			},
			{
				action: 'update',
				changes: [
					{ field: 'priority', value: '1' },
					{ field: 'state_key', value: 'in_progress' }
				],
				target_ids: ['85a6eccc-6a72-449e-83ac-0fd06c0faa93'],
				entity_kind: 'task',
				minimum_successful_effects: 2
			}
		]
	};

	it('still rejects the live contract that exhausted validation repair', () => {
		expect(parseDeclaredTurnContract(liveFailedContract)).toBeNull();
	});

	it('names the exact outcome and property instead of listing every possible cause', () => {
		const issues = describeDeclaredTurnContractIssues(liveFailedContract);
		expect(issues).toHaveLength(1);
		const [issue] = issues;
		expect(issue).toContain('Outcome 3');
		expect(issue).toContain('minimum_successful_effects');
		// The repair prompt must carry both observed numbers, not just the rule.
		expect(issue).toContain('2');
		expect(issue).toContain('1');
		// And it must say which reading was wrong, since counting declared
		// `changes` as effects is exactly what the live model did.
		expect(issue).toMatch(/target/i);
	});

	it('reports no issues once minimum_successful_effects matches the target count', () => {
		const repaired = {
			...liveFailedContract,
			outcomes: liveFailedContract.outcomes.map((outcome, index) =>
				index === 2 ? { ...outcome, minimum_successful_effects: 1 } : outcome
			)
		};
		expect(describeDeclaredTurnContractIssues(repaired)).toEqual([]);
		expect(parseDeclaredTurnContract(repaired)).not.toBeNull();
	});

	it('names unsupported actions, entity kinds, and out-of-range minimums separately', () => {
		expect(
			describeDeclaredTurnContractIssues({
				outcomes: [
					{ action: 'frobnicate', entity_kind: 'task', minimum_successful_effects: 1 }
				]
			}).join(' ')
		).toMatch(/action/i);
		expect(
			describeDeclaredTurnContractIssues({
				outcomes: [
					{ action: 'update', entity_kind: 'sandwich', minimum_successful_effects: 1 }
				]
			}).join(' ')
		).toMatch(/entity_kind/i);
		expect(
			describeDeclaredTurnContractIssues({
				outcomes: [{ action: 'create', entity_kind: 'task', minimum_successful_effects: 0 }]
			}).join(' ')
		).toMatch(/minimum_successful_effects/i);
		expect(describeDeclaredTurnContractIssues({ outcomes: [] }).join(' ')).toMatch(/outcome/i);
	});
});

describe('turn contract symbolic references (label / parent_label)', () => {
	const DOC_A = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
	const DOC_B = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';
	const FOLDER = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';

	function organizeContract(): TurnContract {
		const contract = parseDeclaredTurnContract({
			outcomes: [
				{
					action: 'create',
					entity_kind: 'document',
					label: 'meeting-notes',
					changes: [{ field: 'title', value: '📋 Meeting Notes' }],
					minimum_successful_effects: 1
				},
				{
					action: 'move',
					entity_kind: 'document',
					target_ids: [DOC_A, DOC_B],
					parent_label: 'meeting-notes',
					minimum_successful_effects: 2
				}
			]
		});
		if (!contract) throw new Error('fixture contract must parse');
		return contract;
	}

	it('normalizes titles to an identity key', () => {
		expect(titleKey('📋 Planning & Tasks')).toBe('planningtasks');
		expect(titleKey('planning-&-tasks')).toBe('planningtasks');
		expect(titleKey('  Planning Tasks ')).toBe('planningtasks');
	});

	it('parses label and parent_label and adds parent_id as the move postcondition', () => {
		const contract = organizeContract();
		expect(contract.outcomes[0]).toMatchObject({
			action: 'create',
			label: 'meeting-notes',
			minimumSuccessfulEffects: 1
		});
		expect(contract.outcomes[1]).toMatchObject({
			action: 'move',
			parentLabel: 'meeting-notes',
			requiredFields: ['parent_id']
		});
	});

	it('rejects a labelled create that is not single-effect or has no declared title', () => {
		expect(
			describeDeclaredTurnContractIssues({
				outcomes: [
					{
						action: 'create',
						entity_kind: 'document',
						label: 'folders',
						changes: [{ field: 'title', value: 'Folders' }],
						minimum_successful_effects: 3
					}
				]
			})
		).toEqual([expect.stringContaining('minimum_successful_effects must be 1 (received 3)')]);
		expect(
			describeDeclaredTurnContractIssues({
				outcomes: [
					{
						action: 'create',
						entity_kind: 'document',
						label: 'folder',
						minimum_successful_effects: 1
					}
				]
			})
		).toEqual([expect.stringContaining('must declare its title in changes')]);
		expect(
			describeDeclaredTurnContractIssues({
				outcomes: [
					{
						action: 'update',
						entity_kind: 'task',
						label: 'nope',
						target_ids: [DOC_A],
						minimum_successful_effects: 1
					}
				]
			})
		).toEqual([expect.stringContaining('label is only meaningful on a create outcome')]);
	});

	it('rejects a parent_label that resolves to nothing, a duplicate label, and two destinations for one document', () => {
		expect(
			describeDeclaredTurnContractIssues({
				outcomes: [
					{
						action: 'move',
						entity_kind: 'document',
						target_ids: [DOC_A],
						parent_label: 'ghost',
						minimum_successful_effects: 1
					}
				]
			})
		).toEqual([expect.stringContaining('does not match the label of any create outcome')]);
		const labelled = (label: string) => ({
			action: 'create',
			entity_kind: 'document',
			label,
			changes: [{ field: 'title', value: label }],
			minimum_successful_effects: 1
		});
		expect(
			describeDeclaredTurnContractIssues({
				outcomes: [labelled('dup'), labelled('dup')]
			})
		).toEqual([expect.stringContaining('labels must be unique')]);
		expect(
			describeDeclaredTurnContractIssues({
				outcomes: [
					labelled('one'),
					labelled('two'),
					{
						action: 'move',
						entity_kind: 'document',
						target_ids: [DOC_A],
						parent_label: 'one',
						minimum_successful_effects: 1
					},
					{
						action: 'move',
						entity_kind: 'document',
						target_ids: [DOC_A],
						parent_label: 'two',
						minimum_successful_effects: 1
					}
				]
			})
		).toEqual([expect.stringContaining('a document has one destination')]);
	});

	it('binds a label by title key despite emoji and case, then fulfills dependent moves', () => {
		const contract = organizeContract();
		const executions = [
			execution(
				'create_onto_document',
				{ project_id: 'p', title: 'Meeting notes', description: 'grouping' },
				{ result: { document: { id: FOLDER, title: 'Meeting notes' } } }
			),
			execution(
				'move_document_in_tree',
				{ project_id: 'p', document_id: DOC_A, new_parent_id: FOLDER },
				{ result: { parent_id: FOLDER, structure: { version: 1, root: [] } } }
			),
			execution(
				'move_document_in_tree',
				{ project_id: 'p', document_id: DOC_B, new_parent_id: FOLDER },
				{ result: { parent_id: FOLDER, structure: { version: 1, root: [] } } }
			)
		];
		const bindings = bindTurnContractLabels(contract, buildWriteLedger(executions));
		expect(Object.fromEntries(bindings)).toEqual({ 'meeting-notes': FOLDER });

		const resolution = resolveTurnContractOutcome({ contract, toolExecutions: executions });
		expect(resolution.status).toBe('fulfilled');
		expect(resolution.outcomes.map((outcome) => outcome.fulfilled)).toEqual([true, true]);
	});

	it('does not count a move into a different parent against a labelled destination', () => {
		const contract = organizeContract();
		const other = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e';
		const executions = [
			execution(
				'create_onto_document',
				{ project_id: 'p', title: 'Meeting notes', description: 'grouping' },
				{ result: { document: { id: FOLDER, title: 'Meeting notes' } } }
			),
			execution(
				'move_document_in_tree',
				{ project_id: 'p', document_id: DOC_A, new_parent_id: other },
				{ result: { parent_id: other, structure: { version: 1, root: [] } } }
			)
		];
		const resolution = resolveTurnContractOutcome({ contract, toolExecutions: executions });
		expect(resolution.outcomes[1]).toMatchObject({
			fulfilled: false,
			matchedEffects: 0,
			missingTargetIds: [DOC_A, DOC_B]
		});
	});

	it('reports an unbound parent_label when the create never happened', () => {
		const contract = organizeContract();
		const resolution = resolveTurnContractOutcome({ contract, toolExecutions: [] });
		expect(resolution.outcomes[0]).toMatchObject({ fulfilled: false, matchedEffects: 0 });
		expect(resolution.outcomes[1]).toMatchObject({
			fulfilled: false,
			unboundParentLabel: 'meeting-notes',
			missingRequiredFields: ['parent_id']
		});
	});

	it('binds a label from a parent-by-title move and fulfills the create outcome without a create call', () => {
		const contract = organizeContract();
		const executions = [
			execution(
				'move_document_in_tree',
				{ project_id: 'p', document_id: DOC_A, new_parent_title: 'Meeting notes' },
				{
					result: {
						parent_id: FOLDER,
						parent_title: 'Meeting notes',
						parent_created: true,
						structure: { version: 1, root: [] }
					}
				}
			),
			execution(
				'move_document_in_tree',
				{ project_id: 'p', document_id: DOC_B, new_parent_title: 'Meeting notes' },
				{
					result: {
						parent_id: FOLDER,
						parent_title: 'Meeting notes',
						parent_created: false,
						structure: { version: 1, root: [] }
					}
				}
			)
		];
		const resolution = resolveTurnContractOutcome({ contract, toolExecutions: executions });
		expect(resolution.status).toBe('fulfilled');
	});

	it('binds by elimination when one label and one unmatched create remain', () => {
		const contract = organizeContract();
		const executions = [
			execution(
				'create_onto_document',
				{ project_id: 'p', title: 'Notes from meetings', description: 'grouping' },
				{ result: { document: { id: FOLDER, title: 'Notes from meetings' } } }
			)
		];
		expect(
			Object.fromEntries(bindTurnContractLabels(contract, buildWriteLedger(executions)))
		).toEqual({ 'meeting-notes': FOLDER });
	});

	it('strips a dangling parent_label from the carried-forward pending contract', () => {
		const contract = organizeContract();
		const executions = [
			execution(
				'create_onto_document',
				{ project_id: 'p', title: 'Meeting notes', description: 'grouping' },
				{ result: { document: { id: FOLDER, title: 'Meeting notes' } } }
			)
		];
		const resolution = resolveTurnContractOutcome({ contract, toolExecutions: executions });
		const pending = buildFastChatPendingTurnContract({
			resolution,
			contextType: 'project',
			projectId: 'p'
		});
		expect(pending?.contract.outcomes).toHaveLength(1);
		expect(pending?.contract.outcomes[0]).not.toHaveProperty('parentLabel');
		expect(pending?.contract.outcomes[0]?.requiredFields).toContain('parent_id');
		expect(readFastChatPendingTurnContract(pending)).not.toBeNull();
	});
});
