// apps/worker/tests/agenticChatCreateOntoTaskMutationAdapter.test.ts
import { describe, expect, it, vi } from 'vitest';
import { AgenticChatCreateOntoTaskMutationAdapter } from '../src/workers/agentic-chat/createOntoTaskMutationAdapter';
import { AgenticChatMutationAdapterError } from '../src/workers/agentic-chat/mutation-executor';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';
const EFFECT_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const SESSION_ID = '66666666-6666-4666-8666-666666666666';

function mutationInput(overrides: Record<string, unknown> = {}) {
	return {
		effectId: EFFECT_ID,
		downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
		toolName: 'create_onto_task',
		operationName: 'onto.task.create',
		downstreamIdempotencySupported: true,
		arguments: {
			project_id: PROJECT_ID,
			title: 'New task',
			assignee_handles: ['@sam'],
			plan_id: '77777777-7777-4777-8777-777777777777'
		},
		providerToolCallId: 'provider-create-1',
		executionInput: {
			claim: { userId: USER_ID, sessionId: SESSION_ID },
			requestPayload: {
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
			},
			artifact: {
				prepared: {
					toolSurface: {
						surfaceProfile: 'test_create_task',
						toolNames: ['create_onto_task'],
						definitions: [
							{
								type: 'function',
								function: {
									name: 'create_onto_task',
									description: 'Create a task',
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

function taskReceipt() {
	return {
		id: TASK_ID,
		project_id: PROJECT_ID,
		title: 'New task',
		description: null,
		type_key: 'task.default',
		state_key: 'todo',
		priority: 3,
		start_at: null,
		due_at: null,
		completed_at: null,
		props: {},
		assignees: [],
		idempotency_key: `chat-effect:${EFFECT_ID}`,
		project_name: 'Fixture project'
	};
}

describe('AgenticChatCreateOntoTaskMutationAdapter', () => {
	it('passes the stable effect key through the project-fenced shared gateway', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: { task: taskReceipt() },
			entityKind: 'task',
			entityId: TASK_ID,
			entityProjectId: PROJECT_ID,
			entityTitle: 'New task'
		}));
		const adapter = new AgenticChatCreateOntoTaskMutationAdapter({} as never, {
			runGateway: runGateway as never,
			taskSync: { syncTaskEvents: vi.fn() }
		});

		await expect(adapter.execute(mutationInput())).resolves.toEqual({
			task: {
				id: TASK_ID,
				project_id: PROJECT_ID,
				title: 'New task',
				description: null,
				type_key: 'task.default',
				state_key: 'todo',
				priority: 3,
				start_at: null,
				due_at: null,
				completed_at: null,
				props: {},
				assignees: []
			},
			message: 'Task created successfully.',
			requires_user_action: false
		});
		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: USER_ID,
				op: 'onto.task.create',
				chatSessionId: SESSION_ID,
				downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
				args: {
					project_id: PROJECT_ID,
					title: 'New task',
					assignee_handles: ['@sam'],
					plan_id: '77777777-7777-4777-8777-777777777777'
				},
				scope: {
					mode: 'read_write',
					allowed_ops: ['onto.task.create'],
					project_ids: [PROJECT_ID],
					write_project_ids: [PROJECT_ID]
				}
			})
		);
	});

	it('fails closed on a project mismatch before dispatch', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatCreateOntoTaskMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const input = mutationInput() as any;
		input.arguments = { project_id: OTHER_PROJECT_ID, title: 'Outside scope' };

		await expect(adapter.execute(input)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects unsupported arguments and absent signed admission', async () => {
		const adapter = new AgenticChatCreateOntoTaskMutationAdapter({} as never, {
			runGateway: vi.fn() as never
		});
		const unsupported = mutationInput() as any;
		unsupported.arguments = {
			project_id: PROJECT_ID,
			title: 'New task',
			archived: true
		};
		await expect(adapter.execute(unsupported)).rejects.toMatchObject({
			failureCode: 'mutation_arguments_not_admitted'
		});

		const absent = mutationInput() as any;
		absent.executionInput.artifact.prepared.toolSurface.toolNames = [];
		await expect(adapter.execute(absent)).rejects.toMatchObject({
			failureCode: 'mutation_tool_not_admitted'
		});
	});

	it('classifies pre-commit gateway failures as known and ambiguous outcomes as uncertain', async () => {
		const knownAdapter = new AgenticChatCreateOntoTaskMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: false,
				error: { code: 'FORBIDDEN', message: 'denied' }
			})) as never
		});
		await expect(knownAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'create_onto_task_forbidden'
		});

		const uncertainAdapter = new AgenticChatCreateOntoTaskMutationAdapter({} as never, {
			runGateway: vi.fn(async () => {
				throw new Error('response lost');
			}) as never
		});
		await expect(uncertainAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'create_onto_task_gateway_threw'
		});
	});

	it('rejects a mismatched task receipt as an uncertain post-dispatch outcome', async () => {
		const adapter = new AgenticChatCreateOntoTaskMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: true,
				data: { task: { ...taskReceipt(), project_id: OTHER_PROJECT_ID } }
			})) as never
		});

		await expect(adapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'create_onto_task_receipt_invalid'
		});
	});

	it('exposes adapter failures with the expected typed boundary', async () => {
		const adapter = new AgenticChatCreateOntoTaskMutationAdapter({} as never, {
			runGateway: vi.fn() as never
		});
		await expect(
			adapter.execute(mutationInput({ downstreamIdempotencyKey: 'changed' }))
		).rejects.toBeInstanceOf(AgenticChatMutationAdapterError);
	});
});

describe('AgenticChatCreateOntoTaskMutationAdapter calendar receipt', () => {
	it('reports the calendar events the gateway actually created', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				task: taskReceipt(),
				calendar_sync: 'synced',
				calendar_events: [
					{
						id: '88888888-8888-4888-8888-888888888888',
						title: 'Due: New task',
						start_at: '2026-09-19T03:29:59.000Z',
						end_at: '2026-09-19T03:59:59.000Z'
					}
				]
			},
			entityKind: 'task',
			entityId: TASK_ID,
			entityProjectId: PROJECT_ID,
			entityTitle: 'New task'
		}));
		const adapter = new AgenticChatCreateOntoTaskMutationAdapter({} as never, {
			runGateway: runGateway as never,
			taskSync: { syncTaskEvents: vi.fn() }
		});

		const receipt = (await adapter.execute(mutationInput())) as Record<string, unknown>;
		expect(receipt.calendar_sync).toBe('synced');
		expect(receipt.calendar_events).toEqual([
			{
				id: '88888888-8888-4888-8888-888888888888',
				title: 'Due: New task',
				start_at: '2026-09-19T03:29:59.000Z',
				end_at: '2026-09-19T03:59:59.000Z'
			}
		]);
	});

	it('admits calendar_sync as a reviewed argument and reports the skip', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: { task: taskReceipt(), calendar_sync: 'skipped' },
			entityKind: 'task',
			entityId: TASK_ID,
			entityProjectId: PROJECT_ID,
			entityTitle: 'New task'
		}));
		const adapter = new AgenticChatCreateOntoTaskMutationAdapter({} as never, {
			runGateway: runGateway as never,
			taskSync: { syncTaskEvents: vi.fn() }
		});

		const receipt = (await adapter.execute(
			mutationInput({
				arguments: {
					project_id: PROJECT_ID,
					title: 'New task',
					due_at: '2026-09-18',
					calendar_sync: 'none'
				}
			})
		)) as Record<string, unknown>;

		expect(runGateway.mock.calls[0]?.[0]).toMatchObject({
			args: expect.objectContaining({ calendar_sync: 'none' })
		});
		expect(receipt.calendar_sync).toBe('skipped');
		expect(receipt).not.toHaveProperty('calendar_events');
	});
});
