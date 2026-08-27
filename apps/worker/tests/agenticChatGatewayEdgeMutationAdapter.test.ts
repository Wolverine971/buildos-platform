import { describe, expect, it, vi } from 'vitest';
import { AgenticChatGatewayEdgeMutationAdapter } from '../src/workers/agentic-chat/gatewayEdgeMutationAdapter';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';
const GOAL_ID = '44444444-4444-4444-8444-444444444444';
const PLAN_ID = '55555555-5555-4555-8555-555555555555';
const EDGE_ID = '66666666-6666-4666-8666-666666666666';
const EFFECT_ID = '77777777-7777-4777-8777-777777777777';
const USER_ID = '88888888-8888-4888-8888-888888888888';
const SESSION_ID = '99999999-9999-4999-8999-999999999999';

type ToolCase = {
	toolName: 'link_onto_entities' | 'unlink_onto_edge';
	operationName: 'onto.edge.link' | 'onto.edge.unlink';
	arguments: Record<string, unknown>;
};

const LINK_CASE: ToolCase = {
	toolName: 'link_onto_entities',
	operationName: 'onto.edge.link',
	arguments: {
		src_kind: 'task',
		src_id: TASK_ID,
		dst_kind: 'goal',
		dst_id: GOAL_ID,
		rel: 'Helps With',
		props: { weight: 2 }
	}
};

const UNLINK_CASE: ToolCase = {
	toolName: 'unlink_onto_edge',
	operationName: 'onto.edge.unlink',
	arguments: { edge_id: EDGE_ID }
};

function mutationInput(testCase: ToolCase, overrides: Record<string, unknown> = {}) {
	return {
		effectId: EFFECT_ID,
		downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
		toolName: testCase.toolName,
		operationName: testCase.operationName,
		downstreamIdempotencySupported: false,
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
						surfaceProfile: 'test_gateway_edge',
						toolNames: [testCase.toolName],
						definitions: [
							{
								type: 'function',
								function: {
									name: testCase.toolName,
									description: 'Mutation fixture',
									parameters: { type: 'object', properties: {} }
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

function edge(overrides: Record<string, unknown> = {}) {
	return {
		id: EDGE_ID,
		project_id: PROJECT_ID,
		src_kind: 'task',
		src_id: TASK_ID,
		dst_kind: 'goal',
		dst_id: GOAL_ID,
		rel: 'supports_goal',
		props: { weight: 2, original_rel: 'helps_with' },
		...overrides
	};
}

describe('AgenticChatGatewayEdgeMutationAdapter', () => {
	it('normalizes and links one exact non-project relationship with a legacy receipt', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: { created: 1, edge: edge() }
		}));
		const adapter = new AgenticChatGatewayEdgeMutationAdapter({} as never, {
			runGateway: runGateway as never
		});

		await expect(adapter.execute(mutationInput(LINK_CASE))).resolves.toEqual({
			created: 1,
			message: 'Linked entities successfully.'
		});
		expect(runGateway).toHaveBeenCalledWith({
			admin: {},
			userId: USER_ID,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.edge.link'],
				project_ids: [PROJECT_ID],
				write_project_ids: [PROJECT_ID]
			},
			op: 'onto.edge.link',
			args: {
				src_kind: 'task',
				src_id: TASK_ID,
				dst_kind: 'goal',
				dst_id: GOAL_ID,
				rel: 'supports_goal',
				props: { weight: 2, original_rel: 'helps_with' }
			},
			chatSessionId: SESSION_ID
		});
	});

	it('canonicalizes deprecated relationship direction before dispatch', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				created: 0,
				edge: edge({
					src_kind: 'plan',
					src_id: PLAN_ID,
					dst_kind: 'task',
					dst_id: TASK_ID,
					rel: 'has_task',
					props: { existing: true }
				})
			}
		}));
		const adapter = new AgenticChatGatewayEdgeMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const input = mutationInput(LINK_CASE) as any;
		input.arguments = {
			src_kind: 'task',
			src_id: TASK_ID,
			dst_kind: 'plan',
			dst_id: PLAN_ID,
			rel: 'belongs_to_plan'
		};

		await expect(adapter.execute(input)).resolves.toEqual({
			created: 0,
			message: 'Linked entities successfully.'
		});
		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({
				args: {
					src_kind: 'plan',
					src_id: PLAN_ID,
					dst_kind: 'task',
					dst_id: TASK_ID,
					rel: 'has_task',
					props: {}
				}
			})
		);
	});

	it('deletes one exact edge and returns the legacy public receipt', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				deleted: true,
				edge_id: EDGE_ID,
				edge: edge()
			}
		}));
		const adapter = new AgenticChatGatewayEdgeMutationAdapter({} as never, {
			runGateway: runGateway as never
		});

		await expect(adapter.execute(mutationInput(UNLINK_CASE))).resolves.toEqual({
			deleted: true,
			message: 'Unlinked entities successfully.'
		});
		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({
				op: 'onto.edge.unlink',
				args: { edge_id: EDGE_ID },
				scope: expect.objectContaining({ project_ids: [PROJECT_ID] })
			})
		);
	});

	it('rejects project endpoints, self-links, malformed props, and invalid edge IDs before dispatch', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatGatewayEdgeMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const projectEdge = mutationInput(LINK_CASE) as any;
		projectEdge.arguments = { ...LINK_CASE.arguments, src_kind: 'project' };
		await expect(adapter.execute(projectEdge)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		const selfEdge = mutationInput(LINK_CASE) as any;
		selfEdge.arguments = { ...LINK_CASE.arguments, dst_id: TASK_ID };
		await expect(adapter.execute(selfEdge)).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});

		const malformedProps = mutationInput(LINK_CASE) as any;
		malformedProps.arguments = { ...LINK_CASE.arguments, props: [] };
		await expect(adapter.execute(malformedProps)).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});

		const invalidEdge = mutationInput(UNLINK_CASE) as any;
		invalidEdge.arguments = { edge_id: 'edge-1' };
		await expect(adapter.execute(invalidEdge)).rejects.toMatchObject({
			failureCode: 'mutation_scope_invalid'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('requires an admitted project context and the one-attempt idempotency contract', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatGatewayEdgeMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const workspaceInput = mutationInput(LINK_CASE) as any;
		workspaceInput.executionInput.requestPayload.context = {
			type: 'workspace',
			entityId: null,
			projectId: null
		};
		await expect(adapter.execute(workspaceInput)).rejects.toMatchObject({
			failureCode: 'mutation_context_invalid'
		});

		const idempotencyMismatch = mutationInput(LINK_CASE) as any;
		idempotencyMismatch.downstreamIdempotencySupported = true;
		await expect(adapter.execute(idempotencyMismatch)).rejects.toMatchObject({
			failureCode: 'mutation_idempotency_contract_invalid'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('treats mismatched successful link and unlink receipts as uncertain', async () => {
		const wrongLink = new AgenticChatGatewayEdgeMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: true,
				data: { created: 1, edge: edge({ rel: 'references' }) }
			})) as never
		});
		await expect(wrongLink.execute(mutationInput(LINK_CASE))).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'link_onto_entities_receipt_invalid'
		});

		const wrongUnlink = new AgenticChatGatewayEdgeMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: true,
				data: {
					deleted: true,
					edge_id: EDGE_ID,
					edge: edge({ project_id: OTHER_PROJECT_ID })
				}
			})) as never
		});
		await expect(wrongUnlink.execute(mutationInput(UNLINK_CASE))).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'unlink_onto_edge_receipt_invalid'
		});
	});

	it('keeps gateway validation failures known and thrown outcomes uncertain', async () => {
		const knownAdapter = new AgenticChatGatewayEdgeMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: false,
				error: { code: 'NOT_FOUND', message: 'Edge not found' }
			})) as never
		});
		await expect(knownAdapter.execute(mutationInput(UNLINK_CASE))).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'unlink_onto_edge_not_found'
		});

		const uncertainAdapter = new AgenticChatGatewayEdgeMutationAdapter({} as never, {
			runGateway: vi.fn(async () => {
				throw new Error('response lost');
			}) as never
		});
		await expect(uncertainAdapter.execute(mutationInput(LINK_CASE))).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'link_onto_entities_gateway_threw'
		});
	});
});
