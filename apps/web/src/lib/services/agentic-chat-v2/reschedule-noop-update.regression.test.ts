// apps/web/src/lib/services/agentic-chat-v2/reschedule-noop-update.regression.test.ts
//
// Deterministic reproduction of the 2026-07-31 Phase 1 gate failure
// `task-reschedule-cold-reference` / repetition 1: the model issued the same
// schema-valid `update_onto_task` echo (task_id + current title + current
// type_key, no `due_at`) three times, each PATCH "succeeded" without changing
// anything, and the repetition guard ended the turn with the seeded date
// intact.
//
// The corrected path: while the user's own words request a re-date and no call
// in the turn carries a scheduling field, the echo call fails validation with
// a repair message naming `due_at`, is never executed, and the model's
// corrected call is the only PATCH that runs.

import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import { materializeGatewayTools } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { streamFastChat } from './stream-orchestrator/index';

const TASK_ID = '0b19a1af-6d5b-4b58-9f6a-1de1a58f2f7a';
const PROJECT_ID = 'b7f5c9e2-4a31-4d0a-9be6-0f2f8f4f9d3a';
const INCIDENT_MESSAGE =
	"push the beta list email thing to friday, i'm not gonna get to it before then";
const RESCHEDULE_CONTRACT = {
	version: 1 as const,
	source: 'declared' as const,
	outcomes: [
		{
			id: 'reschedule-task',
			action: 'update' as const,
			entityKind: 'task' as const,
			targetIds: [TASK_ID],
			requiredFields: ['due_at'],
			minimumSuccessfulEffects: 1
		}
	]
};

function tools(names: string[]): ChatToolDefinition[] {
	return materializeGatewayTools([], names).tools;
}

function toolCall(name: string, args: Record<string, unknown>, id: string): ChatToolCall {
	return {
		id,
		type: 'function',
		function: { name, arguments: JSON.stringify(args) }
	};
}

describe('reschedule no-op update loop (incident 2026-07-31)', () => {
	it('blocks the observed no-op echo before execution and repairs to a dated update', async () => {
		const streamInvocations: Array<{ messages: unknown[] }> = [];
		const llm = {
			streamText: vi.fn(async function* (params: { messages: unknown[] }) {
				streamInvocations.push({ messages: params.messages });
				const invocation = streamInvocations.length;

				if (invocation === 1) {
					// The observed incident call: identity echo, no scheduling field.
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'update_onto_task',
							{
								task_id: TASK_ID,
								title: 'Send the launch announcement to the beta list',
								type_key: 'task.default'
							},
							'noop-echo-1'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				if (invocation === 2) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'update_onto_task',
							{
								task_id: TASK_ID,
								due_at: '2026-08-07T15:00:00Z'
							},
							'repaired-update-1'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield {
					type: 'text',
					content:
						'Moved "Send the launch announcement to the beta list" to Friday, August 7.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const executedCalls: Array<Record<string, unknown>> = [];
		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
			executedCalls.push(args);
			return {
				tool_call_id: call.id,
				success: true,
				result: {
					task: { id: TASK_ID, title: 'Send the launch announcement to the beta list' },
					message: 'Updated ontology task "Send the launch announcement to the beta list"'
				}
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'synthetic-user',
			sessionId: 'synthetic-session',
			contextType: 'project',
			entityId: PROJECT_ID,
			projectId: PROJECT_ID,
			history: [],
			message: INCIDENT_MESSAGE,
			initialTurnContract: RESCHEDULE_CONTRACT,
			tools: tools(['update_onto_task']),
			toolExecutor,
			onDelta: async () => {}
		});

		// The echo never reached the executor; only the dated update ran.
		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(executedCalls).toHaveLength(1);
		expect(executedCalls[0]?.due_at).toBe('2026-08-07T15:00:00Z');
		expect(executedCalls[0]?.task_id).toBe(TASK_ID);

		// The model saw a repair message naming the missing scheduling field.
		const secondInvocationPayload = JSON.stringify(streamInvocations[1]?.messages ?? []);
		expect(secondInvocationPayload).toContain('scheduling request');
		expect(secondInvocationPayload).toContain('due_at');
		expect(secondInvocationPayload).toContain(TASK_ID);

		expect(result.finalAssistantText).toContain('Friday');
		expect(result.finishedReason).not.toBe('tool_repetition_limit');
	});

	it('does not flag sibling calls once one call in the round carries the scheduling field', async () => {
		const llm = {
			streamText: vi.fn(async function* () {
				const invocation = (llm.streamText as ReturnType<typeof vi.fn>).mock.calls.length;
				if (invocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'update_onto_task',
							{ task_id: TASK_ID, due_at: '2026-08-07T15:00:00Z' },
							'dated-update'
						)
					};
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'update_onto_task',
							{ task_id: TASK_ID, title: 'Send the beta email (moved)' },
							'rename-update'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				yield { type: 'text', content: 'Rescheduled and renamed the task.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (call: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: call.id,
				success: true,
				result: { task: { id: TASK_ID }, message: 'Updated ontology task' }
			})
		);

		await streamFastChat({
			llm,
			userId: 'synthetic-user',
			sessionId: 'synthetic-session',
			contextType: 'project',
			entityId: PROJECT_ID,
			projectId: PROJECT_ID,
			history: [],
			message: INCIDENT_MESSAGE,
			initialTurnContract: RESCHEDULE_CONTRACT,
			tools: tools(['update_onto_task']),
			toolExecutor,
			onDelta: async () => {}
		});

		// Both calls execute: the round already satisfies the scheduling floor.
		expect(toolExecutor).toHaveBeenCalledTimes(2);
	});
});
