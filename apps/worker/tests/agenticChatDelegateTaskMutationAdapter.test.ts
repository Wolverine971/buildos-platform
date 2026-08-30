// apps/worker/tests/agenticChatDelegateTaskMutationAdapter.test.ts
import { describe, expect, it, vi } from 'vitest';
import { AgenticChatDelegateTaskMutationAdapter } from '../src/workers/agentic-chat/delegateTaskMutationAdapter';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const JOB_ID = '33333333-3333-4333-8333-333333333333';
const EFFECT_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const SESSION_ID = '66666666-6666-4666-8666-666666666666';

function mutationInput(overrides: Record<string, unknown> = {}) {
	return {
		effectId: EFFECT_ID,
		downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
		toolName: 'delegate_task',
		operationName: 'util.agent.delegate',
		downstreamIdempotencySupported: false,
		arguments: {
			goal: 'Prepare the marketing reorientation proposal',
			label: 'Reorient marketing',
			project_id: PROJECT_ID,
			instructions: `Update the exact discovered working set in project ${PROJECT_ID}; stage every change for review.`,
			expected_output: 'One coherent staged change set.',
			max_tool_calls: 32,
			max_cost_usd: 0.75
		},
		providerToolCallId: 'provider-delegate-task',
		executionInput: {
			claim: { userId: USER_ID, sessionId: SESSION_ID },
			requestPayload: {
				message: 'Reorient this project toward weekend hikers',
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
			},
			artifact: {
				prepared: {
					toolSurface: {
						surfaceProfile: 'project_write_document',
						toolNames: ['delegate_task'],
						definitions: [
							{
								type: 'function',
								function: {
									name: 'delegate_task',
									description: 'Prepare a reviewable project proposal',
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

function dispatchReceipt() {
	return {
		data: {
			run: {
				id: RUN_ID,
				user_id: USER_ID,
				project_id: PROJECT_ID,
				context_type: 'project',
				scope_mode: 'read_write',
				review_required: true,
				status: 'queued'
			},
			job_id: JOB_ID
		},
		error: null
	};
}

describe('AgenticChatDelegateTaskMutationAdapter', () => {
	it('atomically dispatches a focused review-required Agent Run without applying changes', async () => {
		const dispatch = vi.fn(async () => dispatchReceipt());
		const assertProjectWriteAccess = vi.fn(async () => undefined);
		const adapter = new AgenticChatDelegateTaskMutationAdapter({} as never, {
			dispatch,
			assertProjectWriteAccess
		});

		await expect(adapter.execute(mutationInput())).resolves.toEqual({
			ok: true,
			run_ids: [RUN_ID],
			queue_job_id: JOB_ID,
			label: 'Reorient marketing',
			status: 'queued',
			context_type: 'project',
			project_id: PROJECT_ID,
			scope_mode: 'read_write',
			effort: 'standard',
			run_template: 'agent',
			max_cost_usd: 0.75,
			review: true,
			requires_user_action: false,
			message:
				'Dispatched background proposal agent "Reorient marketing". It can only stage changes; nothing will be applied until the user approves the resulting change set.'
		});
		expect(assertProjectWriteAccess).toHaveBeenCalledWith(USER_ID, PROJECT_ID);
		expect(dispatch).toHaveBeenCalledOnce();
		expect(dispatch).toHaveBeenCalledWith({
			p_run: expect.objectContaining({
				user_id: USER_ID,
				parent_session_id: SESSION_ID,
				project_id: PROJECT_ID,
				context_type: 'project',
				scope_mode: 'read_write',
				review_required: true,
				budgets: { max_tool_calls: 32, max_cost_usd: 0.75 }
			}),
			p_job_metadata: expect.objectContaining({
				run_id: EFFECT_ID,
				correlationId: EFFECT_ID,
				project_id: PROJECT_ID,
				review_required: true
			}),
			p_priority: 7
		});
	});

	it('rejects a cross-project dispatch before access or database work', async () => {
		const dispatch = vi.fn();
		const assertProjectWriteAccess = vi.fn();
		const adapter = new AgenticChatDelegateTaskMutationAdapter({} as never, {
			dispatch,
			assertProjectWriteAccess
		});
		const input = mutationInput() as any;
		input.arguments.project_id = RUN_ID;

		await expect(adapter.execute(input)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});
		expect(assertProjectWriteAccess).not.toHaveBeenCalled();
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('fails closed on invalid budgets and uncertain atomic dispatch outcomes', async () => {
		const dispatch = vi.fn(async () => {
			throw new Error('response lost');
		});
		const adapter = new AgenticChatDelegateTaskMutationAdapter({} as never, {
			dispatch,
			assertProjectWriteAccess: vi.fn(async () => undefined)
		});
		const invalid = mutationInput() as any;
		invalid.arguments.max_cost_usd = 2;
		await expect(adapter.execute(invalid)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		expect(dispatch).not.toHaveBeenCalled();

		await expect(adapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'delegate_task_dispatch_uncertain'
		});
	});

	it('treats a mismatched atomic receipt as uncertain instead of claiming dispatch', async () => {
		const receipt = dispatchReceipt();
		receipt.data.run.review_required = false;
		const adapter = new AgenticChatDelegateTaskMutationAdapter({} as never, {
			dispatch: vi.fn(async () => receipt),
			assertProjectWriteAccess: vi.fn(async () => undefined)
		});

		await expect(adapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'delegate_task_receipt_invalid'
		});
	});
});
