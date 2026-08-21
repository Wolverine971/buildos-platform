import { describe, expect, it, vi } from 'vitest';
import { AgenticChatGatewayDocumentRelationshipMutationAdapter } from '../src/workers/agentic-chat/gatewayDocumentRelationshipMutationAdapter';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
const PARENT_ID = '44444444-4444-4444-8444-444444444444';
const TASK_ID = '55555555-5555-4555-8555-555555555555';
const EDGE_ID = '66666666-6666-4666-8666-666666666666';
const EFFECT_ID = '77777777-7777-4777-8777-777777777777';
const USER_ID = '88888888-8888-4888-8888-888888888888';
const SESSION_ID = '99999999-9999-4999-8999-999999999999';

type ToolCase = {
	toolName: 'move_document_in_tree' | 'create_task_document';
	operationName: 'onto.document.tree.move' | 'onto.task.docs.create_or_attach';
	downstreamIdempotencySupported: boolean;
	arguments: Record<string, unknown>;
};

const MOVE_CASE: ToolCase = {
	toolName: 'move_document_in_tree',
	operationName: 'onto.document.tree.move',
	downstreamIdempotencySupported: false,
	arguments: {
		project_id: PROJECT_ID,
		document_id: DOCUMENT_ID,
		new_parent_id: PARENT_ID,
		new_position: 4
	}
};

const ATTACH_CASE: ToolCase = {
	toolName: 'create_task_document',
	operationName: 'onto.task.docs.create_or_attach',
	downstreamIdempotencySupported: true,
	arguments: {
		task_id: TASK_ID,
		document_id: DOCUMENT_ID,
		role: ' primary '
	}
};

const STRUCTURE = {
	version: 7,
	root: [
		{
			id: PARENT_ID,
			order: 0,
			children: [
				{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', order: 0 },
				{ id: DOCUMENT_ID, order: 1 }
			]
		}
	]
};

function mutationInput(testCase: ToolCase, overrides: Record<string, unknown> = {}) {
	return {
		effectId: EFFECT_ID,
		downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
		toolName: testCase.toolName,
		operationName: testCase.operationName,
		downstreamIdempotencySupported: testCase.downstreamIdempotencySupported,
		arguments: testCase.arguments,
		providerToolCallId: `provider-${testCase.toolName}`,
		executionInput: {
			claim: { userId: USER_ID, sessionId: SESSION_ID },
			requestPayload: {
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
			},
			artifact: {
				prepared: {
					toolSurface: {
						toolNames: [testCase.toolName],
						definitions: [
							{
								type: 'function',
								function: {
									name: testCase.toolName,
									description: 'Mutation fixture',
									parameters: { type: 'object' }
								}
							}
						]
					}
				}
			}
		},
		signal: new AbortController().signal,
		...overrides
	} as never;
}

describe('AgenticChatGatewayDocumentRelationshipMutationAdapter', () => {
	it('moves one exact document and proves its returned parent and clamped position', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				project_id: PROJECT_ID,
				document_id: DOCUMENT_ID,
				structure: STRUCTURE
			}
		}));
		const adapter = new AgenticChatGatewayDocumentRelationshipMutationAdapter({} as never, {
			runGateway: runGateway as never
		});

		await expect(adapter.execute(mutationInput(MOVE_CASE))).resolves.toEqual({
			structure: STRUCTURE,
			parent_id: PARENT_ID,
			parent_title: null,
			parent_created: false,
			message: `Moved document ${DOCUMENT_ID} under "${PARENT_ID}".`
		});
		expect(runGateway).toHaveBeenCalledOnce();
		expect(runGateway).toHaveBeenCalledWith({
			admin: {},
			userId: USER_ID,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.document.tree.move'],
				project_ids: [PROJECT_ID],
				write_project_ids: [PROJECT_ID]
			},
			op: 'onto.document.tree.move',
			args: MOVE_CASE.arguments,
			callSessionId: SESSION_ID
		});
	});

	it('attaches an existing document through the exact replayable edge identity', async () => {
		const edge = {
			id: EDGE_ID,
			project_id: PROJECT_ID,
			src_kind: 'task',
			src_id: TASK_ID,
			dst_kind: 'document',
			dst_id: DOCUMENT_ID,
			rel: 'task_has_document',
			props: { role: 'primary', created_at: '2026-08-10T12:00:00.000Z' }
		};
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				document: {
					id: DOCUMENT_ID,
					project_id: PROJECT_ID,
					title: 'Launch notes',
					project_name: 'Fixture project'
				},
				edge
			}
		}));
		const adapter = new AgenticChatGatewayDocumentRelationshipMutationAdapter({} as never, {
			runGateway: runGateway as never
		});

		await expect(adapter.execute(mutationInput(ATTACH_CASE))).resolves.toEqual({
			document: {
				id: DOCUMENT_ID,
				project_id: PROJECT_ID,
				title: 'Launch notes'
			},
			edge: {
				src_kind: 'task',
				src_id: TASK_ID,
				dst_kind: 'document',
				dst_id: DOCUMENT_ID,
				rel: 'task_has_document',
				props: edge.props
			},
			message: 'Linked document "Launch notes" to task.'
		});
		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({
				op: 'onto.task.docs.create_or_attach',
				args: { task_id: TASK_ID, document_id: DOCUMENT_ID, role: 'primary' }
			})
		);
	});

	it('rejects the task-document create branch and invalid placement before dispatch', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatGatewayDocumentRelationshipMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const blankTitle = mutationInput(MOVE_CASE) as any;
		blankTitle.arguments = {
			...MOVE_CASE.arguments,
			new_parent_id: null,
			new_parent_title: '   '
		};
		await expect(adapter.execute(blankTitle)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		const longTitle = mutationInput(MOVE_CASE) as any;
		longTitle.arguments = {
			...MOVE_CASE.arguments,
			new_parent_id: null,
			new_parent_title: 'x'.repeat(121)
		};
		await expect(adapter.execute(longTitle)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});

		const createBranch = mutationInput(ATTACH_CASE) as any;
		createBranch.arguments = { task_id: TASK_ID, title: 'New document' };
		await expect(adapter.execute(createBranch)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});

		const invalidPosition = mutationInput(MOVE_CASE) as any;
		invalidPosition.arguments = { ...MOVE_CASE.arguments, new_position: 1.5 };
		await expect(adapter.execute(invalidPosition)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('requires the admitted project fence and rejects a mismatched move project', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatGatewayDocumentRelationshipMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const mismatchedMove = mutationInput(MOVE_CASE) as any;
		mismatchedMove.arguments = { ...MOVE_CASE.arguments, project_id: OTHER_PROJECT_ID };
		await expect(adapter.execute(mismatchedMove)).rejects.toMatchObject({
			failureCode: 'mutation_project_scope_mismatch'
		});

		const workspaceAttach = mutationInput(ATTACH_CASE) as any;
		workspaceAttach.executionInput.requestPayload.context = {
			type: 'workspace',
			entityId: null,
			projectId: null
		};
		await expect(adapter.execute(workspaceAttach)).rejects.toMatchObject({
			failureCode: 'mutation_context_invalid'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('treats an unproven tree placement or mismatched edge as uncertain', async () => {
		const wrongTreeAdapter = new AgenticChatGatewayDocumentRelationshipMutationAdapter(
			{} as never,
			{
				runGateway: vi.fn(async () => ({
					ok: true,
					data: {
						project_id: PROJECT_ID,
						document_id: DOCUMENT_ID,
						structure: {
							version: 7,
							root: [{ id: DOCUMENT_ID, order: 0 }]
						}
					}
				})) as never
			}
		);
		await expect(wrongTreeAdapter.execute(mutationInput(MOVE_CASE))).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'move_document_in_tree_receipt_invalid'
		});

		const wrongEdgeAdapter = new AgenticChatGatewayDocumentRelationshipMutationAdapter(
			{} as never,
			{
				runGateway: vi.fn(async () => ({
					ok: true,
					data: {
						document: {
							id: DOCUMENT_ID,
							project_id: PROJECT_ID,
							title: 'Launch notes'
						},
						edge: {
							id: EDGE_ID,
							project_id: PROJECT_ID,
							src_kind: 'task',
							src_id: TASK_ID,
							dst_kind: 'document',
							dst_id: DOCUMENT_ID,
							rel: 'task_has_document',
							props: { role: 'scratch' }
						}
					}
				})) as never
			}
		);
		await expect(wrongEdgeAdapter.execute(mutationInput(ATTACH_CASE))).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'create_task_document_receipt_invalid'
		});
	});

	it('keeps gateway validation failures known and thrown outcomes uncertain', async () => {
		const knownAdapter = new AgenticChatGatewayDocumentRelationshipMutationAdapter(
			{} as never,
			{
				runGateway: vi.fn(async () => ({
					ok: false,
					error: { code: 'NOT_FOUND', message: 'Document not found' }
				})) as never
			}
		);
		await expect(knownAdapter.execute(mutationInput(MOVE_CASE))).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'move_document_in_tree_not_found'
		});

		const uncertainAdapter = new AgenticChatGatewayDocumentRelationshipMutationAdapter(
			{} as never,
			{
				runGateway: vi.fn(async () => {
					throw new Error('response lost');
				}) as never
			}
		);
		await expect(uncertainAdapter.execute(mutationInput(ATTACH_CASE))).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'create_task_document_gateway_threw'
		});
	});
	it('groups by title: passes new_parent_title through and proves the receipt parent', async () => {
		const titledStructure = {
			version: 8,
			root: [
				{
					id: PARENT_ID,
					title: 'Planning',
					order: 0,
					children: [{ id: DOCUMENT_ID, order: 0 }]
				}
			]
		};
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				project_id: PROJECT_ID,
				document_id: DOCUMENT_ID,
				parent_id: PARENT_ID,
				parent_created: true,
				structure: titledStructure
			}
		}));
		const adapter = new AgenticChatGatewayDocumentRelationshipMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const titled = mutationInput(MOVE_CASE) as any;
		titled.arguments = {
			project_id: PROJECT_ID,
			document_id: DOCUMENT_ID,
			new_parent_title: '  planning ',
			new_position: 0
		};

		await expect(adapter.execute(titled)).resolves.toEqual({
			structure: titledStructure,
			parent_id: PARENT_ID,
			parent_title: 'Planning',
			parent_created: true,
			message: `Moved document ${DOCUMENT_ID} under "Planning" (parent document created).`
		});
		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({
				args: {
					project_id: PROJECT_ID,
					document_id: DOCUMENT_ID,
					new_parent_id: null,
					new_parent_title: 'planning',
					new_position: 0
				}
			})
		);
	});

	it('lets an exact parent UUID win over a title and drops the title from dispatch', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				project_id: PROJECT_ID,
				document_id: DOCUMENT_ID,
				parent_id: PARENT_ID,
				parent_created: false,
				structure: STRUCTURE
			}
		}));
		const adapter = new AgenticChatGatewayDocumentRelationshipMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const both = mutationInput(MOVE_CASE) as any;
		both.arguments = { ...MOVE_CASE.arguments, new_parent_title: 'Planning' };

		await expect(adapter.execute(both)).resolves.toMatchObject({
			parent_id: PARENT_ID,
			parent_created: false
		});
		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({ args: MOVE_CASE.arguments })
		);
	});

	it('fails closed when a title move returns no resolved parent or a differently titled one', async () => {
		const adapterFor = (data: Record<string, unknown>) =>
			new AgenticChatGatewayDocumentRelationshipMutationAdapter({} as never, {
				runGateway: vi.fn(async () => ({ ok: true, data })) as never
			});
		const titled = () => {
			const input = mutationInput(MOVE_CASE) as any;
			input.arguments = {
				project_id: PROJECT_ID,
				document_id: DOCUMENT_ID,
				new_parent_title: 'Planning',
				new_position: 0
			};
			return input;
		};
		const placed = {
			version: 8,
			root: [
				{
					id: PARENT_ID,
					title: 'Pricing',
					order: 0,
					children: [{ id: DOCUMENT_ID, order: 0 }]
				}
			]
		};

		await expect(
			adapterFor({
				project_id: PROJECT_ID,
				document_id: DOCUMENT_ID,
				structure: placed
			}).execute(titled())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'move_document_in_tree_receipt_invalid'
		});
		await expect(
			adapterFor({
				project_id: PROJECT_ID,
				document_id: DOCUMENT_ID,
				parent_id: PARENT_ID,
				parent_created: false,
				structure: placed
			}).execute(titled())
		).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'move_document_in_tree_receipt_invalid'
		});
	});

	it('classifies a gateway failure on the title branch as uncertain, never known', async () => {
		const adapter = new AgenticChatGatewayDocumentRelationshipMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: false,
				error: { code: 'VALIDATION_ERROR', message: 'Parent document is not linked.' }
			})) as never
		});
		const titled = mutationInput(MOVE_CASE) as any;
		titled.arguments = {
			project_id: PROJECT_ID,
			document_id: DOCUMENT_ID,
			new_parent_title: 'Planning',
			new_position: 0
		};

		await expect(adapter.execute(titled)).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'move_document_in_tree_title_branch_uncertain'
		});
	});
});
