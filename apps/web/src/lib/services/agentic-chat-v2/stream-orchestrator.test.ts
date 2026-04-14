// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import { streamFastChat } from './stream-orchestrator';
import type { FastChatHistoryMessage } from './types';
import { materializeGatewayTools } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { getToolSchema } from '$lib/services/agentic-chat/tools/registry/tool-schema';

function tools(names: string[]): ChatToolDefinition[] {
	return materializeGatewayTools([], names).tools;
}

function toolCall(name: string, args: Record<string, unknown>, id = name): ChatToolCall {
	return {
		id,
		type: 'function',
		function: {
			name,
			arguments: JSON.stringify(args)
		}
	};
}

describe('streamFastChat direct tool orchestration', () => {
	it('passes dynamically materialized direct tools to the executor after discovery', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'tool_search',
							{ query: 'create milestone', entity: 'milestone' },
							'tool_search:milestone-create'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				if (streamInvocation === 2) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'create_onto_milestone',
							{
								project_id: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
								title: 'January: Complete chapters 1-10'
							},
							'create_onto_milestone:january'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Created the January milestone.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (
				call: ChatToolCall,
				availableTools?: ChatToolDefinition[]
			): Promise<ChatToolResult> => {
				if (call.function.name === 'tool_search') {
					return {
						tool_call_id: call.id,
						result: {
							type: 'tool_search_results',
							matches: [
								{
									op: 'onto.milestone.create',
									tool_name: 'create_onto_milestone'
								}
							]
						},
						success: true
					};
				}

				const availableToolNames = new Set(
					(availableTools ?? [])
						.map((tool) => tool.function?.name)
						.filter((name): name is string => Boolean(name))
				);
				const isKnownTool = availableToolNames.has(call.function.name);
				return {
					tool_call_id: call.id,
					result: { ok: isKnownTool },
					success: isKnownTool,
					error: isKnownTool ? undefined : `Unknown tool: ${call.function.name}`
				};
			}
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			projectId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			history: [],
			message: 'Create a January milestone.',
			tools: tools(['skill_load', 'tool_search', 'tool_schema']),
			toolExecutor,
			onDelta: async () => {}
		});

		const milestoneExecutionCall = toolExecutor.mock.calls.find(
			([call]) => call.function.name === 'create_onto_milestone'
		);
		const executionToolNames = new Set(
			((milestoneExecutionCall?.[1] as ChatToolDefinition[] | undefined) ?? [])
				.map((tool) => tool.function?.name)
				.filter((name): name is string => Boolean(name))
		);

		expect(milestoneExecutionCall).toBeDefined();
		expect(executionToolNames.has('create_onto_milestone')).toBe(true);
		expect(result.finalAssistantText).toBe('Created the January milestone.');
	});

	it('validates direct tool arguments before execution and retries after repair', async () => {
		let streamInvocation = 0;
		let repairPassMessages: FastChatHistoryMessage[] | undefined;
		const taskId = '881823a4-e74e-48d2-bf3e-b77db7e47b5f';
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'update_onto_task',
							{ state_key: 'done' },
							'update_onto_task:missing-id'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				if (streamInvocation === 2) {
					repairPassMessages = params.messages as FastChatHistoryMessage[];
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'update_onto_task',
							{ task_id: taskId, state_key: 'done' },
							'update_onto_task:corrected'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Marked the task done.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			return {
				tool_call_id: call.id,
				result: { ok: true },
				success: true
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			projectId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			history: [],
			message: 'Mark the task done.',
			tools: tools(['skill_load', 'tool_search', 'tool_schema', 'update_onto_task']),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(toolExecutor.mock.calls[0]?.[0].function.name).toBe('update_onto_task');
		expect(toolExecutor.mock.calls[0]?.[0].function.arguments).toContain(taskId);
		expect(repairPassMessages).toBeDefined();
		expect(
			(repairPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					message.content.includes('Missing required parameter: task_id')
			)
		).toBe(true);
		expect(result.finalAssistantText).toBe('Marked the task done.');
	});

	it('repairs schema-only write success claims by requiring the direct create tool', async () => {
		let streamInvocation = 0;
		let recoveryPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'tool_schema',
							{ op: 'onto.project.create', include_schema: true },
							'tool_schema:project-create'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				if (streamInvocation === 2) {
					yield {
						type: 'text',
						content:
							'Great, I created the "The Last Ember" project. Which task should we tackle first?'
					};
					yield { type: 'done', finished_reason: 'stop' };
					return;
				}

				if (streamInvocation === 3) {
					recoveryPassMessages = params.messages as FastChatHistoryMessage[];
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'create_onto_project',
							{
								project: {
									name: 'The Last Ember',
									type_key: 'project.creative.book'
								},
								entities: [],
								relationships: []
							},
							'create_onto_project:last-ember'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Created "The Last Ember" as a new project.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			if (call.function.name === 'tool_schema') {
				const args = JSON.parse(call.function.arguments || '{}');
				return {
					tool_call_id: call.id,
					result: getToolSchema(args.op, {
						include_schema: args.include_schema,
						include_examples: true
					}),
					success: true
				};
			}

			return {
				tool_call_id: call.id,
				result: { project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40' },
				success: true
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'Create a project for my fantasy novel The Last Ember.',
			tools: tools(['skill_load', 'tool_search', 'tool_schema']),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(4);
		expect(toolExecutor).toHaveBeenCalledTimes(2);
		expect(recoveryPassMessages).toBeDefined();
		expect(
			(recoveryPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					message.content.includes('You have not completed any write yet.')
			)
		).toBe(true);
		expect(result.finalAssistantText).toBe('Created "The Last Ember" as a new project.');
		expect(
			result.toolExecutions?.some(
				(execution) =>
					execution.toolCall.function.name === 'create_onto_project' &&
					execution.result.success === true
			)
		).toBe(true);
	});
});
