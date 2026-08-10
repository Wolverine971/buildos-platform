import { describe, expect, it, vi } from 'vitest';
import { AgenticChatFixtureMutationAdapterError } from '../src/workers/agentic-chat/fixtureMutationExecutor';
import { AgenticChatUpdateOntoTaskMutationAdapter } from '../src/workers/agentic-chat/updateOntoTaskMutationAdapter';

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
		toolName: 'update_onto_task',
		operationName: 'onto.task.update',
		arguments: {
			project_id: PROJECT_ID,
			task_id: TASK_ID,
			title: 'Updated task',
			state_key: 'in_progress'
		},
		providerToolCallId: 'provider-call-1',
		executionInput: {
			claim: { userId: USER_ID, sessionId: SESSION_ID },
			requestPayload: {
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
			},
			artifact: {
				prepared: {
					toolSurface: {
						toolNames: ['update_onto_task'],
						definitions: [
							{
								type: 'function',
								function: {
									name: 'update_onto_task',
									description: 'Update a task',
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

function gatewayTask() {
	return {
		id: TASK_ID,
		project_id: PROJECT_ID,
		title: 'Updated task',
		description: 'Fixture task',
		type_key: 'task.default',
		state_key: 'in_progress',
		priority: 2,
		start_at: null,
		due_at: null,
		completed_at: null,
		props: {},
		project_name: 'Fixture project'
	};
}

function realGatewayClient() {
	const existingTask = {
		...gatewayTask(),
		title: 'Original task',
		state_key: 'todo',
		created_at: '2026-08-01T00:00:00.000Z',
		updated_at: '2026-08-01T00:00:00.000Z',
		archived_at: null
	};
	delete (existingTask as Record<string, unknown>).project_name;
	const updatedTask = {
		...existingTask,
		title: 'Updated task',
		state_key: 'in_progress',
		updated_at: '2026-08-09T18:00:00.000Z'
	};
	const calls: Array<{ table?: string; operation: string; value?: unknown }> = [];

	class Query {
		private updatePayload: Record<string, unknown> | null = null;

		constructor(private readonly table: string) {}

		select() {
			return this;
		}

		eq() {
			return this;
		}

		in() {
			return this;
		}

		is() {
			return this;
		}

		update(value: Record<string, unknown>) {
			this.updatePayload = value;
			calls.push({ table: this.table, operation: 'update', value });
			return this;
		}

		async maybeSingle() {
			return { data: existingTask, error: null };
		}

		async single() {
			return {
				data: { ...updatedTask, ...(this.updatePayload ?? {}) },
				error: null
			};
		}
	}

	const client = {
		rpc: vi.fn(async (name: string) => {
			if (name === 'ensure_actor_for_user') return { data: 'actor-1', error: null };
			if (name === 'get_onto_project_summaries_v1') {
				return {
					data: [
						{
							id: PROJECT_ID,
							name: 'Fixture project',
							description: null,
							icon_svg: null,
							icon_concept: null,
							icon_generated_at: null,
							icon_generation_source: null,
							icon_generation_prompt: null,
							type_key: 'project.default',
							state_key: 'active',
							props: {},
							facet_context: null,
							facet_scale: null,
							facet_stage: null,
							created_at: '2026-08-01T00:00:00.000Z',
							updated_at: '2026-08-01T00:00:00.000Z',
							task_count: 1,
							goal_count: 0,
							plan_count: 0,
							document_count: 0,
							owner_actor_id: 'actor-1',
							access_role: 'owner',
							access_level: 'write',
							is_shared: false,
							next_step_short: null,
							next_step_long: null,
							next_step_source: null,
							next_step_updated_at: null
						}
					],
					error: null
				};
			}
			throw new Error(`unexpected rpc ${name}`);
		}),
		from: vi.fn((table: string) => {
			if (table === 'onto_tasks') return new Query(table);
			if (table === 'onto_project_logs') {
				return {
					insert: vi.fn(async (value: unknown) => {
						calls.push({ table, operation: 'insert', value });
						return { error: null };
					})
				};
			}
			throw new Error(`unexpected table ${table}`);
		})
	};
	return { client, calls };
}

describe('AgenticChatUpdateOntoTaskMutationAdapter', () => {
	it('crosses the real shared gateway handler and records its activity side effect', async () => {
		const { client, calls } = realGatewayClient();
		const taskSync = { syncTaskEvents: vi.fn(async () => undefined) };
		const adapter = new AgenticChatUpdateOntoTaskMutationAdapter(client as never, {
			taskSync
		});

		await expect(adapter.execute(mutationInput())).resolves.toMatchObject({
			task: {
				id: TASK_ID,
				project_id: PROJECT_ID,
				title: 'Updated task',
				state_key: 'in_progress'
			},
			message: 'Task updated successfully.',
			requires_user_action: false
		});
		expect(calls).toContainEqual({
			table: 'onto_tasks',
			operation: 'update',
			value: expect.objectContaining({ title: 'Updated task', state_key: 'in_progress' })
		});
		expect(calls).toContainEqual({
			table: 'onto_project_logs',
			operation: 'insert',
			value: expect.objectContaining({
				project_id: PROJECT_ID,
				entity_type: 'task',
				entity_id: TASK_ID,
				action: 'updated',
				change_source: 'agent_call',
				agent_call_session_id: SESSION_ID
			})
		});
		expect(taskSync.syncTaskEvents).toHaveBeenCalledWith(
			USER_ID,
			'actor-1',
			expect.objectContaining({ id: TASK_ID, title: 'Updated task' }),
			{
				activityLog: {
					changeSource: 'agent_call',
					actorContext: {
						externalAgentCallerId: null,
						agentCallSessionId: SESSION_ID
					}
				}
			}
		);
	});

	it('executes the admitted canonical op through the project-fenced shared gateway', async () => {
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: { task: gatewayTask() },
			entityKind: 'task',
			entityId: TASK_ID,
			entityProjectId: PROJECT_ID,
			entityTitle: 'Updated task'
		}));
		const adapter = new AgenticChatUpdateOntoTaskMutationAdapter({} as never, {
			runGateway: runGateway as never
		});

		await expect(adapter.execute(mutationInput())).resolves.toEqual({
			task: {
				id: TASK_ID,
				project_id: PROJECT_ID,
				title: 'Updated task',
				description: 'Fixture task',
				type_key: 'task.default',
				state_key: 'in_progress',
				priority: 2,
				start_at: null,
				due_at: null,
				completed_at: null,
				props: {}
			},
			message: 'Task updated successfully.',
			requires_user_action: false
		});
		expect(runGateway).toHaveBeenCalledOnce();
		expect(runGateway).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: USER_ID,
				op: 'onto.task.update',
				callSessionId: SESSION_ID,
				args: {
					task_id: TASK_ID,
					title: 'Updated task',
					state_key: 'in_progress'
				},
				scope: {
					mode: 'read_write',
					allowed_ops: ['onto.task.update'],
					project_ids: [PROJECT_ID],
					write_project_ids: [PROJECT_ID]
				},
				taskSync: expect.objectContaining({ syncTaskEvents: expect.any(Function) })
			})
		);
	});

	it('keeps the committed task receipt when best-effort calendar synchronization fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const { client, calls } = realGatewayClient();
		const taskSync = {
			syncTaskEvents: vi.fn(async () => {
				throw new Error('calendar queue unavailable');
			})
		};
		const adapter = new AgenticChatUpdateOntoTaskMutationAdapter(client as never, {
			taskSync
		});

		await expect(adapter.execute(mutationInput())).resolves.toMatchObject({
			task: { id: TASK_ID, title: 'Updated task' },
			message: 'Task updated successfully.'
		});
		expect(taskSync.syncTaskEvents).toHaveBeenCalledOnce();
		expect(calls).toContainEqual({
			table: 'onto_project_logs',
			operation: 'insert',
			value: expect.objectContaining({ entity_id: TASK_ID, action: 'updated' })
		});
		warn.mockRestore();
	});

	it('rejects a changed effect key before dispatch', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatUpdateOntoTaskMutationAdapter({} as never, {
			runGateway: runGateway as never
		});

		await expect(
			adapter.execute(
				mutationInput({ downstreamIdempotencyKey: 'chat-effect:not-the-effect' })
			)
		).rejects.toMatchObject<Partial<AgenticChatFixtureMutationAdapterError>>({
			disposition: 'known_failed',
			failureCode: 'mutation_effect_identity_invalid'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects a tool absent from the immutable admitted surface before dispatch', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatUpdateOntoTaskMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const input = mutationInput() as any;
		input.executionInput.artifact.prepared.toolSurface.toolNames = [];

		await expect(adapter.execute(input)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_tool_not_admitted'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects an argument project outside the admitted project context', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatUpdateOntoTaskMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const input = mutationInput() as any;
		input.arguments.project_id = OTHER_PROJECT_ID;

		await expect(adapter.execute(input)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('rejects fields outside the reviewed adapter subset before dispatch', async () => {
		const runGateway = vi.fn();
		const adapter = new AgenticChatUpdateOntoTaskMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const input = mutationInput() as any;
		input.arguments.archived = true;

		await expect(adapter.execute(input)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});

	it('classifies pre-commit gateway rejections as known failures', async () => {
		const adapter = new AgenticChatUpdateOntoTaskMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: false,
				error: { code: 'FORBIDDEN', message: 'Task is outside the writable scope' }
			})) as never
		});

		await expect(adapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'update_onto_task_forbidden'
		});
	});

	it('classifies internal or thrown gateway outcomes as uncertain', async () => {
		const internal = new AgenticChatUpdateOntoTaskMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: false,
				error: { code: 'INTERNAL', message: 'response lost' }
			})) as never
		});
		const thrown = new AgenticChatUpdateOntoTaskMutationAdapter({} as never, {
			runGateway: vi.fn(async () => {
				throw new Error('connection closed');
			}) as never
		});

		await expect(internal.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_task_outcome_uncertain'
		});
		await expect(thrown.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_task_gateway_threw'
		});
	});

	it('treats a successful but mismatched receipt as an uncertain commit', async () => {
		const adapter = new AgenticChatUpdateOntoTaskMutationAdapter({} as never, {
			runGateway: vi.fn(async () => ({
				ok: true,
				data: { task: { ...gatewayTask(), id: '77777777-7777-4777-8777-777777777777' } }
			})) as never
		});

		await expect(adapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_task_receipt_invalid'
		});
	});

	it('does not dispatch when cancellation is already visible', async () => {
		const runGateway = vi.fn();
		const controller = new AbortController();
		controller.abort(new Error('cancelled'));
		const adapter = new AgenticChatUpdateOntoTaskMutationAdapter({} as never, {
			runGateway: runGateway as never
		});

		await expect(
			adapter.execute(mutationInput({ signal: controller.signal }))
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_cancelled_before_dispatch'
		});
		expect(runGateway).not.toHaveBeenCalled();
	});
});
