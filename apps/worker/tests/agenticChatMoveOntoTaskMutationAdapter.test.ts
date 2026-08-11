// apps/worker/tests/agenticChatMoveOntoTaskMutationAdapter.test.ts
import { TaskMoveServiceError } from '@buildos/shared-agent-ops/ontology/task-move.service';
import { describe, expect, it, vi } from 'vitest';
import { AgenticChatMoveOntoTaskMutationAdapter } from '../src/workers/agentic-chat/moveOntoTaskMutationAdapter';
import { reviewedAgenticChatGatewayMutationSpecV1 } from '../src/workers/agentic-chat/mutationToolCatalog';

const TASK_ID = '10000000-0000-4000-8000-000000000001';
const SOURCE_ID = '20000000-0000-4000-8000-000000000002';
const DESTINATION_ID = '30000000-0000-4000-8000-000000000003';
const OTHER_PROJECT_ID = '40000000-0000-4000-8000-000000000004';
const EFFECT_ID = '50000000-0000-4000-8000-000000000005';
const USER_ID = '60000000-0000-4000-8000-000000000006';
const SESSION_ID = '70000000-0000-4000-8000-000000000007';

function mutationInput(overrides: Record<string, unknown> = {}) {
	return {
		effectId: EFFECT_ID,
		downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
		toolName: 'move_onto_task',
		operationName: 'onto.task.move',
		downstreamIdempotencySupported: false,
		arguments: {
			task_id: TASK_ID,
			expected_source_project_id: SOURCE_ID,
			destination_project_id: DESTINATION_ID
		},
		providerToolCallId: 'provider-move-task',
		executionInput: {
			claim: { userId: USER_ID, sessionId: SESSION_ID },
			requestPayload: {
				context: { type: 'project', entityId: SOURCE_ID, projectId: SOURCE_ID }
			},
			artifact: {
				prepared: {
					toolSurface: {
						toolNames: ['move_onto_task'],
						definitions: [
							{
								type: 'function',
								function: {
									name: 'move_onto_task',
									description: 'Move task',
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

function movedResult() {
	return {
		status: 'moved' as const,
		requires_user_action: false,
		task: { id: TASK_ID, title: 'Move me', project_id: DESTINATION_ID, props: {} },
		task_before: { id: TASK_ID, title: 'Move me', project_id: SOURCE_ID },
		source_project: { id: SOURCE_ID, name: 'Source' },
		destination_project: { id: DESTINATION_ID, name: 'Destination' },
		impact: { relationships_to_detach: 0 },
		applied: { relationships_detached: 0 }
	};
}

describe('AgenticChatMoveOntoTaskMutationAdapter', () => {
	it('keeps the worker-only move operation outside the external gateway allowlist', () => {
		expect(reviewedAgenticChatGatewayMutationSpecV1('move_onto_task')).toBeNull();
		expect(reviewedAgenticChatGatewayMutationSpecV1('update_onto_task')).toMatchObject({
			operationName: 'onto.task.update'
		});
	});

	it('dispatches one worker-authorized move and restores the compact legacy receipt', async () => {
		const moveTask = vi.fn(async () => movedResult());
		const adapter = new AgenticChatMoveOntoTaskMutationAdapter({} as never, {
			moveTask: moveTask as never
		});

		await expect(adapter.execute(mutationInput())).resolves.toEqual({
			status: 'moved',
			requires_user_action: false,
			task: { id: TASK_ID, title: 'Move me', project_id: DESTINATION_ID },
			source_project: { id: SOURCE_ID, name: 'Source' },
			destination_project: { id: DESTINATION_ID, name: 'Destination' },
			impact: { relationships_to_detach: 0 },
			applied: { relationships_detached: 0 },
			message: 'Moved task "Move me" to "Destination"',
			context_shift: {
				new_context: 'project',
				entity_id: DESTINATION_ID,
				entity_name: 'Destination',
				entity_type: 'project',
				message: 'Focused the destination project "Destination" after moving the task.'
			}
		});
		expect(moveTask).toHaveBeenCalledOnce();
		expect(moveTask).toHaveBeenCalledWith({
			client: {},
			taskId: TASK_ID,
			expectedSourceProjectId: SOURCE_ID,
			destinationProjectId: DESTINATION_ID,
			confirmationToken: null,
			caller: { kind: 'worker', userId: USER_ID },
			activity: {
				changedBy: USER_ID,
				changeSource: 'chat',
				chatSessionId: SESSION_ID
			}
		});
	});

	it('returns confirmation and blocked receipts without a context shift', async () => {
		const preview = {
			status: 'confirmation_required' as const,
			requires_user_action: true,
			confirmation_token: 'preview-token',
			message: 'Confirm exact cleanup.',
			task: { id: TASK_ID, title: 'Move me', project_id: SOURCE_ID },
			source_project: { id: SOURCE_ID, name: 'Source' },
			destination_project: { id: DESTINATION_ID, name: 'Destination' },
			impact: { relationships_to_detach: 1 }
		};
		const previewAdapter = new AgenticChatMoveOntoTaskMutationAdapter({} as never, {
			moveTask: vi.fn(async () => preview)
		});
		await expect(previewAdapter.execute(mutationInput())).resolves.toEqual(preview);

		const blocked = {
			status: 'blocked' as const,
			requires_user_action: true,
			blocker: 'scheduled_task_not_supported',
			message: 'Scheduled tasks cannot be moved yet.',
			task: { id: TASK_ID, title: 'Move me', project_id: SOURCE_ID },
			source_project: { id: SOURCE_ID, name: 'Source' },
			destination_project: { id: DESTINATION_ID, name: 'Destination' },
			impact: { is_scheduled: true }
		};
		const blockedAdapter = new AgenticChatMoveOntoTaskMutationAdapter({} as never, {
			moveTask: vi.fn(async () => blocked)
		});
		await expect(blockedAdapter.execute(mutationInput())).resolves.toEqual(blocked);
	});

	it('passes a confirmed token only when it is canonical', async () => {
		const moveTask = vi.fn(async () => movedResult());
		const adapter = new AgenticChatMoveOntoTaskMutationAdapter({} as never, {
			moveTask: moveTask as never
		});
		const confirmed = mutationInput() as any;
		confirmed.arguments.confirmation_token = 'confirmed-token';

		await adapter.execute(confirmed);
		expect(moveTask.mock.calls[0]?.[0]).toMatchObject({
			confirmationToken: 'confirmed-token'
		});

		const invalid = mutationInput() as any;
		invalid.arguments.confirmation_token = ' confirmed-token ';
		await expect(adapter.execute(invalid)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_arguments_not_admitted'
		});
	});

	it('rejects source-scope mismatches before dispatch', async () => {
		const moveTask = vi.fn();
		const adapter = new AgenticChatMoveOntoTaskMutationAdapter({} as never, {
			moveTask: moveTask as never
		});
		const mismatched = mutationInput() as any;
		mismatched.executionInput.requestPayload.context = {
			type: 'project',
			entityId: OTHER_PROJECT_ID,
			projectId: OTHER_PROJECT_ID
		};

		await expect(adapter.execute(mismatched)).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_project_scope_mismatch'
		});
		expect(moveTask).not.toHaveBeenCalled();
	});

	it('separates atomic rollback failures from uncertain post-dispatch outcomes', async () => {
		const knownAdapter = new AgenticChatMoveOntoTaskMutationAdapter({} as never, {
			moveTask: vi.fn(async () => {
				throw new TaskMoveServiceError('impact_changed', 'Impact changed');
			})
		});
		await expect(knownAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'move_onto_task_impact_changed'
		});

		const thrownAdapter = new AgenticChatMoveOntoTaskMutationAdapter({} as never, {
			moveTask: vi.fn(async () => {
				throw new Error('response lost');
			})
		});
		await expect(thrownAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'move_onto_task_outcome_uncertain'
		});

		const malformedAdapter = new AgenticChatMoveOntoTaskMutationAdapter({} as never, {
			moveTask: vi.fn(async () => ({
				...movedResult(),
				task: { id: TASK_ID, project_id: SOURCE_ID }
			})) as never
		});
		await expect(malformedAdapter.execute(mutationInput())).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'move_onto_task_receipt_invalid'
		});
	});
});
