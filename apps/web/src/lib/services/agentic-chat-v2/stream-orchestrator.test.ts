// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import { streamFastChat } from './stream-orchestrator';
import type { FastChatHistoryMessage } from './types';
import { materializeGatewayTools } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { getToolHelp } from '$lib/services/agentic-chat/tools/registry/tool-help';
import { getToolSchema } from '$lib/services/agentic-chat/tools/registry/tool-schema';

function createGatewayTools(): ChatToolDefinition[] {
	return [
		{
			type: 'function',
			function: {
				name: 'tool_help',
				description: 'Help',
				parameters: {
					type: 'object',
					properties: { path: { type: 'string' } },
					required: ['path']
				}
			}
		},
		{
			type: 'function',
			function: {
				name: 'tool_exec',
				description: 'Exec',
				parameters: {
					type: 'object',
					properties: {
						op: { type: 'string' },
						args: { type: 'object' }
					},
					required: ['op', 'args']
				}
			}
		},
		{
			type: 'function',
			function: {
				name: 'tool_batch',
				description: 'Batch',
				parameters: {
					type: 'object',
					properties: {
						ops: { type: 'array' }
					},
					required: ['ops']
				}
			}
		}
	] as ChatToolDefinition[];
}

function createProgressiveGatewayTools(): ChatToolDefinition[] {
	return materializeGatewayTools(
		[],
		[
			'skill_load',
			'tool_search',
			'tool_schema',
			'create_onto_project',
			'create_onto_task',
			'create_onto_goal',
			'create_onto_milestone',
			'create_onto_plan',
			'update_onto_goal'
		]
	).tools;
}

describe('streamFastChat final text sanitization', () => {
	it('passes dynamically materialized gateway tools to the executor', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_search:milestone-create',
							type: 'function',
							function: {
								name: 'tool_search',
								arguments: JSON.stringify({
									query: 'create milestone',
									entity: 'milestone'
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				if (streamInvocation === 2) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'create_onto_milestone:january',
							type: 'function',
							function: {
								name: 'create_onto_milestone',
								arguments: JSON.stringify({
									project_id: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
									title: 'January: Complete chapters 1-10'
								})
							}
						} satisfies ChatToolCall
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
				toolCall: ChatToolCall,
				availableTools?: ChatToolDefinition[]
			): Promise<ChatToolResult> => {
				if (toolCall.function.name === 'tool_search') {
					return {
						tool_call_id: toolCall.id,
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
				const isKnownTool = availableToolNames.has(toolCall.function.name);
				return {
					tool_call_id: toolCall.id,
					result: { ok: isKnownTool },
					success: isKnownTool,
					error: isKnownTool ? undefined : `Unknown tool: ${toolCall.function.name}`
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
			tools: materializeGatewayTools([], ['skill_load', 'tool_search', 'tool_schema']).tools,
			toolExecutor,
			onDelta: async () => {}
		});

		const milestoneExecutionCall = toolExecutor.mock.calls.find(
			([toolCall]) => toolCall.function.name === 'create_onto_milestone'
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

	it('repairs global schema-only write success claims even with follow-up questions', async () => {
		let streamInvocation = 0;
		let recoveryPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_schema:project-create-global',
							type: 'function',
							function: {
								name: 'tool_schema',
								arguments: JSON.stringify({
									op: 'onto.project.create',
									include_schema: true
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				if (streamInvocation === 2) {
					yield {
						type: 'text',
						content:
							'Great, I\'ve created the "The Last Ember" project. Which task should we tackle first?'
					};
					yield { type: 'done', finished_reason: 'stop' };
					return;
				}

				if (streamInvocation === 3) {
					recoveryPassMessages = params.messages as FastChatHistoryMessage[];
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'create_onto_project:last-ember',
							type: 'function',
							function: {
								name: 'create_onto_project',
								arguments: JSON.stringify({
									project: {
										name: 'The Last Ember',
										type_key: 'project.creative.book'
									},
									entities: [],
									relationships: []
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Created "The Last Ember" as a new project.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (toolCall: ChatToolCall): Promise<ChatToolResult> => {
			if (toolCall.function.name === 'tool_schema') {
				const args = JSON.parse(toolCall.function.arguments || '{}');
				return {
					tool_call_id: toolCall.id,
					result: getToolSchema(args.op, {
						include_schema: args.include_schema,
						include_examples: true
					}),
					success: true
				};
			}

			return {
				tool_call_id: toolCall.id,
				result: {
					op: 'onto.project.create',
					ok: true,
					result: { project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40' }
				},
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
			tools: materializeGatewayTools([], ['skill_load', 'tool_search', 'tool_schema']).tools,
			toolExecutor,
			onDelta: async () => {}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(4);
		expect(toolExecutor).toHaveBeenCalledTimes(2);
		expect(recoveryPassMessages).toBeDefined();
		const repairMessage = [...(recoveryPassMessages ?? [])]
			.reverse()
			.find(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes('You have not completed any write yet.')
			);
		expect(repairMessage?.content).toContain(
			'Write ops already identified: onto.project.create'
		);
		expect(result.finalAssistantText).toBe('Created "The Last Ember" as a new project.');
		expect(
			result.toolExecutions?.some(
				(execution) =>
					execution.toolCall.function.name === 'create_onto_project' &&
					execution.result.success === true
			)
		).toBe(true);
	});

	it('allows global schema-only write turns to ask a pure clarification', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_schema:project-create-clarify',
							type: 'function',
							function: {
								name: 'tool_schema',
								arguments: JSON.stringify({
									op: 'onto.project.create',
									include_schema: true
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'What should we call this project?' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (toolCall: ChatToolCall): Promise<ChatToolResult> => {
			const args = JSON.parse(toolCall.function.arguments || '{}');
			return {
				tool_call_id: toolCall.id,
				result: getToolSchema(args.op, {
					include_schema: args.include_schema,
					include_examples: true
				}),
				success: true
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'Create a new project.',
			tools: materializeGatewayTools([], ['skill_load', 'tool_search', 'tool_schema']).tools,
			toolExecutor,
			onDelta: async () => {}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(2);
		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(result.finalAssistantText).toBe('What should we call this project?');
	});

	it('strips transcript-style scratchpad leakage from final assistant text', async () => {
		const llm = {
			streamText: vi.fn(async function* () {
				yield {
					type: 'text',
					content: [
						'Assistant: First, the response pattern: always respond before tool calls.',
						'The input is the full history.',
						'Looking back, the conversation flow:',
						'Human: what is next for this?',
						'The user\'s question: "what is next for this?"',
						'The drafted response is good.',
						'Next for the Podcast Launch project: define due dates and owners.'
					].join('\n')
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const deltas: string[] = [];

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			projectId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			history: [],
			message: 'what is next for this?',
			tools: createGatewayTools(),
			onDelta: async (delta) => {
				deltas.push(delta);
			}
		});

		expect(result.assistantText).toBe(
			'Next for the Podcast Launch project: define due dates and owners.'
		);
		expect(result.finalAssistantText).toBe(
			'Next for the Podcast Launch project: define due dates and owners.'
		);
		expect(result.finalAssistantText).not.toContain('Assistant:');
		expect(result.finalAssistantText).not.toContain("The user's question");
		expect(deltas).toEqual([
			'Next for the Podcast Launch project: define due dates and owners.'
		]);
	});

	it('does not allow failed task updates to be narrated as completed', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_exec:update-task',
							type: 'function',
							function: {
								name: 'tool_exec',
								arguments: JSON.stringify({
									op: 'onto.task.update',
									args: {
										task_id: '3cdf0778-5301-43da-a899-a67561b4fa73',
										state_key: 'done'
									}
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield {
					type: 'text',
					content:
						'**Updates confirmed:** - **Invite Phil to BuildOS** (`3cdf0778-5301-43da-a899-a67561b4fa73`) marked done.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: null,
				success: false,
				error: 'Tool validation failed: task write did not execute'
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'mark invite phil task done',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe(
			"I couldn't complete that update because no write call succeeded. I need to retry with the exact ID and valid arguments."
		);
		expect(result.finalAssistantText).not.toContain('marked done');
	});

	it('preserves successful task update summaries', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_exec:update-task-success',
							type: 'function',
							function: {
								name: 'tool_exec',
								arguments: JSON.stringify({
									op: 'onto.task.update',
									args: {
										task_id: '3cdf0778-5301-43da-a899-a67561b4fa73',
										state_key: 'done'
									}
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield {
					type: 'text',
					content:
						'**Updates confirmed:** - **Invite Phil to BuildOS** (`3cdf0778-5301-43da-a899-a67561b4fa73`) marked done.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: {
					op: 'onto.task.update',
					ok: true,
					result: {
						task: {
							id: '3cdf0778-5301-43da-a899-a67561b4fa73',
							state_key: 'done'
						}
					}
				},
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'mark invite phil task done',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toContain('marked done');
	});
});

describe('streamFastChat repetition guard', () => {
	it('stops repeated identical gateway rounds with tool_repetition_limit', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				const toolCall: ChatToolCall = {
					id: `tool_call_${streamInvocation}`,
					type: 'function',
					function: {
						name: 'tool_exec',
						arguments: JSON.stringify({
							op: 'onto.document.tree.move',
							args: {
								project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
								id: 'db0d30bf-e0de-4440-8f96-ed92801ea6eb'
							}
						})
					}
				};

				yield { type: 'tool_call', tool_call: toolCall };
				yield { type: 'done', finished_reason: 'tool_calls' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: null,
				success: false,
				error: 'Missing required parameter: document_id'
			})
		);
		const deltas: string[] = [];

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			projectId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			history: [],
			message: 'organize unlinked docs',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async (delta) => {
				deltas.push(delta);
			}
		});

		expect(result.finishedReason).toBe('tool_repetition_limit');
		expect(result.toolExecutions?.length).toBeGreaterThanOrEqual(3);
		expect(llm.streamText.mock.calls.length).toBeGreaterThanOrEqual(3);
		expect(toolExecutor).not.toHaveBeenCalled();
		expect(result.assistantText).toContain('tool calls kept failing validation');
		expect(deltas.at(-1)).toContain('tool calls kept failing validation');
	});

	it('stops repeated read-only gateway rounds with changing args', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				const includeDocuments = streamInvocation % 2 === 0;
				const toolCall: ChatToolCall = {
					id: `tool_call_read_${streamInvocation}`,
					type: 'function',
					function: {
						name: 'tool_exec',
						arguments: JSON.stringify({
							op: 'onto.document.tree.get',
							args: {
								project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
								include_documents: includeDocuments
							}
						})
					}
				};

				yield { type: 'text', content: `Round ${streamInvocation} lead-in.` };
				yield { type: 'tool_call', tool_call: toolCall };
				yield { type: 'done', finished_reason: 'tool_calls' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: {
					op: 'onto.document.tree.get',
					ok: true,
					result: {
						structure: { root: [] },
						documents: {},
						unlinked: [],
						archived: []
					}
				},
				success: true
			})
		);
		const deltas: string[] = [];

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			projectId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			history: [],
			message: 'organize unlinked docs',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async (delta) => {
				deltas.push(delta);
			}
		});

		expect(result.finishedReason).toBe('tool_repetition_limit');
		expect(toolExecutor).toHaveBeenCalledTimes(3);
		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(result.assistantText).toContain('same tool sequence kept repeating');
		expect(result.assistantText).toContain('Round 1 lead-in.');
		expect(result.assistantText).not.toContain('Round 2 lead-in.');
		expect(result.assistantText).not.toContain('Round 3 lead-in.');
		expect(result.finalAssistantText).toContain('same tool sequence kept repeating');
		expect(result.finalAssistantText).not.toContain('Round 1 lead-in.');
		expect(deltas.at(-1)).toContain('same tool sequence kept repeating');
	});

	it('stops repeated gateway write validation failures even when args change', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				const toolCall: ChatToolCall = {
					id: `tool_call_write_${streamInvocation}`,
					type: 'function',
					function: {
						name: 'tool_exec',
						arguments: JSON.stringify({
							op: 'onto.document.delete',
							args: {
								attempt: streamInvocation
							}
						})
					}
				};

				yield { type: 'tool_call', tool_call: toolCall };
				yield { type: 'done', finished_reason: 'tool_calls' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: {
					op: 'onto.document.delete',
					ok: false,
					error: {
						code: 'VALIDATION_ERROR',
						message: 'Missing required parameter: document_id',
						help_path: 'onto.document.delete'
					}
				},
				success: false,
				error: 'Missing required parameter: document_id'
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			projectId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			history: [],
			message: 'organize unlinked docs',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(result.finishedReason).toBe('tool_repetition_limit');
		expect(toolExecutor).not.toHaveBeenCalled();
		expect(llm.streamText.mock.calls.length).toBeGreaterThanOrEqual(3);
		expect(result.assistantText).toContain('tool calls kept failing validation');
	});

	it('validates tool_exec args against the exact canonical op schema before execution', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield { type: 'text', content: "I'll inspect the 9takes project." };
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_exec:project-graph-missing-id',
							type: 'function',
							function: {
								name: 'tool_exec',
								arguments: JSON.stringify({
									op: 'onto.project.graph.get',
									args: {}
								})
							}
						}
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				if (streamInvocation === 2) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_exec:project-graph-corrected',
							type: 'function',
							function: {
								name: 'tool_exec',
								arguments: JSON.stringify({
									op: 'onto.project.graph.get',
									args: {
										project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40'
									}
								})
							}
						}
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Loaded the 9takes project graph.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: {
					op: 'onto.project.graph.get',
					ok: true,
					result: { project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40' }
				},
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'ok what is going on with my 9takes project',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(result.toolExecutions).toHaveLength(2);
		expect(result.toolExecutions?.[0]?.result.error).toContain(
			'Missing required parameter: project_id'
		);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe('Loaded the 9takes project graph.');
	});

	it('injects project creation repair guidance after invalid onto.project.create payloads', async () => {
		let streamInvocation = 0;
		let secondPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield { type: 'text', content: "I'll create that project." };
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_exec:project-create-missing-payload',
							type: 'function',
							function: {
								name: 'tool_exec',
								arguments: JSON.stringify({
									op: 'onto.project.create',
									args: {}
								})
							}
						}
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				secondPassMessages = params.messages as FastChatHistoryMessage[];
				yield { type: 'text', content: 'Need corrected project create args.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: { ok: true },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project_create',
			history: [],
			message: 'Create a new project for launching a creator course',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(toolExecutor).not.toHaveBeenCalled();
		expect(secondPassMessages).toBeDefined();
		const repairMessage = [...(secondPassMessages ?? [])]
			.reverse()
			.find(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes('onto.project.create')
			);
		expect(repairMessage?.content).toContain(
			'no successful onto.project.create call has happened yet'
		);
		expect(repairMessage?.content).toContain(
			'Do not end the turn with a success summary unless onto.project.create has actually succeeded.'
		);
		expect(repairMessage?.content).toContain(
			'Minimal valid create shape: create_onto_project({ project: { name: "Project Name", type_key: "project.business.initiative" }, entities: [], relationships: [] }).'
		);
		expect(repairMessage?.content).toContain('entities: [], relationships: []');
		expect(repairMessage?.content).toContain(
			'Never replace a prior complete create payload with input:{}.'
		);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe('Need corrected project create args.');
	});

	it('allows a clarifying question after invalid gateway update args', async () => {
		let streamInvocation = 0;
		let secondPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield { type: 'text', content: "I'll update the task." };
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_exec:task-update-empty',
							type: 'function',
							function: {
								name: 'tool_exec',
								arguments: JSON.stringify({
									op: 'onto.task.update',
									args: {}
								})
							}
						}
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				secondPassMessages = params.messages as FastChatHistoryMessage[];
				yield {
					type: 'text',
					content: 'What due dates do you want for these tasks?'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: { ok: true },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			projectId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			history: [],
			message: 'Add due dates and owners.',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(2);
		expect(toolExecutor).not.toHaveBeenCalled();
		const repairMessage = [...(secondPassMessages ?? [])]
			.reverse()
			.find(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes('One or more tool calls failed validation.')
			);
		expect(repairMessage?.content).toContain(
			'If the fix is fully determined from the current context, return only corrected tool calls with arguments.'
		);
		expect(repairMessage?.content).toContain(
			'If a required user value is still missing, do not call a tool; ask one concise clarifying question.'
		);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe('What due dates do you want for these tasks?');
	});

	it('compacts onto.project.create help payloads so the minimal example reaches the model', async () => {
		let streamInvocation = 0;
		let secondPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_help:project-create',
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: JSON.stringify({
									path: 'onto.project.create',
									format: 'full',
									include_schemas: true
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				secondPassMessages = params.messages as FastChatHistoryMessage[];
				yield { type: 'text', content: 'Reviewed project create guidance.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (toolCall: ChatToolCall): Promise<ChatToolResult> => {
			const args = JSON.parse(toolCall.function.arguments || '{}');
			return {
				tool_call_id: toolCall.id,
				result: getToolHelp(args.path, {
					format: args.format,
					include_schemas: args.include_schemas,
					include_examples: true
				}),
				success: true
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project_create',
			history: [],
			message: 'Create a podcast launch project',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(result.finishedReason).toBe('stop');
		expect(secondPassMessages).toBeDefined();
		const toolMessage = [...(secondPassMessages ?? [])]
			.reverse()
			.find((message) => message.role === 'tool');
		expect(toolMessage).toBeDefined();
		const payload = JSON.parse((toolMessage as FastChatHistoryMessage).content || '{}');
		expect(payload.truncated).not.toBe(true);
		expect(payload.type).toBe('op');
		expect(payload.op).toBe('onto.project.create');
		expect(payload.example_execute_op?.input?.project?.name).toBe('<project name>');
		expect(payload.example_execute_op?.input?.entities).toEqual([]);
		expect(payload.example_execute_op?.input?.relationships).toEqual([]);
		expect(payload.schema).toBeUndefined();
	});

	it('does not execute onto.project.create in the same pass as tool_schema for that exact op', async () => {
		let streamInvocation = 0;
		let secondPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield { type: 'text', content: "I'll load the project schema first." };
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_schema:project-create',
							type: 'function',
							function: {
								name: 'tool_schema',
								arguments: JSON.stringify({
									op: 'onto.project.create',
									include_schema: true
								})
							}
						} satisfies ChatToolCall
					};
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'create_onto_project:project-create-empty',
							type: 'function',
							function: {
								name: 'create_onto_project',
								arguments: JSON.stringify({})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				if (streamInvocation === 2) {
					secondPassMessages = params.messages as FastChatHistoryMessage[];
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'create_onto_project:project-create-corrected',
							type: 'function',
							function: {
								name: 'create_onto_project',
								arguments: JSON.stringify({
									project: {
										name: 'The Last Ember',
										type_key: 'project.creative.book'
									},
									entities: [],
									relationships: []
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield {
					type: 'text',
					content: 'Created "The Last Ember" as a new project.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (toolCall: ChatToolCall): Promise<ChatToolResult> => {
			if (toolCall.function.name === 'tool_schema') {
				const args = JSON.parse(toolCall.function.arguments || '{}');
				return {
					tool_call_id: toolCall.id,
					result: getToolSchema(args.op, {
						include_schema: args.include_schema,
						include_examples: true
					}),
					success: true
				};
			}

			const args = JSON.parse(toolCall.function.arguments || '{}');
			return {
				tool_call_id: toolCall.id,
				result: {
					op: 'onto.project.create',
					ok: true,
					result: {
						project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
						args
					}
				},
				success: true
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project_create',
			history: [],
			message: 'Create a project for my fantasy novel The Last Ember',
			tools: createProgressiveGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(toolExecutor).toHaveBeenCalledTimes(2);
		expect(toolExecutor.mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({
				function: expect.objectContaining({ name: 'tool_schema' })
			})
		);
		expect(toolExecutor.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({
				function: expect.objectContaining({ name: 'create_onto_project' })
			})
		);
		expect(secondPassMessages).toBeDefined();
		const blockedExecToolMessage = [...(secondPassMessages ?? [])]
			.reverse()
			.find(
				(message) =>
					message.role === 'tool' &&
					message.tool_call_id === 'create_onto_project:project-create-empty'
			);
		expect(blockedExecToolMessage?.content).toContain(
			'Do not call create_onto_project for onto.project.create in the same response as tool_schema'
		);
		expect(blockedExecToolMessage?.content).toContain(
			'Wait for the discovery result, then retry create_onto_project in the next response.'
		);
		expect(secondPassMessages?.some((message) => message.role === 'tool')).toBe(true);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toContain('Created "The Last Ember"');
	});

	it('injects task-specific repair guidance after repeated missing task fields', async () => {
		let streamInvocation = 0;
		let thirdPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation <= 2) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: `create_onto_task:missing-title-${streamInvocation}`,
							type: 'function',
							function: {
								name: 'create_onto_task',
								arguments: JSON.stringify({
									project_id: '4cfdbed1-840a-4fe4-9751-77c7884daa70'
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				thirdPassMessages = params.messages as FastChatHistoryMessage[];
				yield {
					type: 'text',
					content: 'Need a concrete task title before creating the task.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (): Promise<ChatToolResult> => ({
				tool_call_id: 'unused',
				result: { ok: true },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			projectId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			history: [],
			message: 'finished chapter 2 and need follow-up tasks',
			tools: createProgressiveGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(toolExecutor).not.toHaveBeenCalled();
		expect(thirdPassMessages).toBeDefined();
		expect(
			(thirdPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes(
						'Repeated required-field validation failures detected: onto.task.create -> title.'
					)
			)
		).toBe(true);
		expect(
			(thirdPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes(
						'For onto.task.create, do not emit a blank create. Include a concrete title taken from the user request'
					)
			)
		).toBe(true);
		expect(
			(thirdPassMessages ?? []).some(
				(message) =>
					message.role === 'tool' &&
					typeof message.content === 'string' &&
					message.content.includes('"help_path":"onto.task.create"') &&
					message.content.includes('"field_errors":["Missing required parameter: title"]')
			)
		).toBe(true);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe(
			'Need a concrete task title before creating the task.'
		);
	});

	it('injects goal and milestone create guidance after repeated missing create fields', async () => {
		let streamInvocation = 0;
		let thirdPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation <= 2) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: `create_onto_goal:missing-name-${streamInvocation}`,
							type: 'function',
							function: {
								name: 'create_onto_goal',
								arguments: JSON.stringify({
									project_id: '4cfdbed1-840a-4fe4-9751-77c7884daa70'
								})
							}
						} satisfies ChatToolCall
					};
					yield {
						type: 'tool_call',
						tool_call: {
							id: `create_onto_milestone:missing-title-${streamInvocation}`,
							type: 'function',
							function: {
								name: 'create_onto_milestone',
								arguments: JSON.stringify({
									project_id: '4cfdbed1-840a-4fe4-9751-77c7884daa70'
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				thirdPassMessages = params.messages as FastChatHistoryMessage[];
				yield {
					type: 'text',
					content: 'Need concrete goal and milestone titles before creating them.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (): Promise<ChatToolResult> => ({
				tool_call_id: 'unused',
				result: { ok: true },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			projectId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			history: [],
			message: 'Set up monthly writing milestones and the draft goal.',
			tools: createProgressiveGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(toolExecutor).not.toHaveBeenCalled();
		expect(thirdPassMessages).toBeDefined();
		expect(
			(thirdPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes(
						'Repeated required-field validation failures detected: onto.goal.create -> name, onto.milestone.create -> title.'
					)
			)
		).toBe(true);
		expect(
			(thirdPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes(
						'For onto.goal.create, include project_id and name. Goal titles use name, not title.'
					)
			)
		).toBe(true);
		expect(
			(thirdPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes(
						'For onto.milestone.create, include project_id and title. Milestone titles use title, not name.'
					)
			)
		).toBe(true);
		expect(
			(thirdPassMessages ?? []).some(
				(message) =>
					message.role === 'tool' &&
					typeof message.content === 'string' &&
					message.content.includes('"help_path":"onto.goal.create"') &&
					message.content.includes('"field_errors":["Missing required parameter: name"]')
			)
		).toBe(true);
		expect(
			(thirdPassMessages ?? []).some(
				(message) =>
					message.role === 'tool' &&
					typeof message.content === 'string' &&
					message.content.includes('"help_path":"onto.milestone.create"') &&
					message.content.includes('"field_errors":["Missing required parameter: title"]')
			)
		).toBe(true);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe(
			'Need concrete goal and milestone titles before creating them.'
		);
	});

	it('injects a hard no-progress repair when blank milestone creates repeat in one response', async () => {
		let streamInvocation = 0;
		let secondPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					for (let index = 0; index < 3; index += 1) {
						yield {
							type: 'tool_call',
							tool_call: {
								id: `create_onto_milestone:missing-title-burst-${index + 1}`,
								type: 'function',
								function: {
									name: 'create_onto_milestone',
									arguments: JSON.stringify({
										project_id: '4cfdbed1-840a-4fe4-9751-77c7884daa70'
									})
								}
							} satisfies ChatToolCall
						};
					}
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				secondPassMessages = params.messages as FastChatHistoryMessage[];
				yield {
					type: 'text',
					content: 'Need a concrete milestone title before creating it.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (): Promise<ChatToolResult> => ({
				tool_call_id: 'unused',
				result: { ok: true },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			projectId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			history: [],
			message: 'Set up January, February, and March milestones for the draft.',
			tools: createProgressiveGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(toolExecutor).not.toHaveBeenCalled();
		expect(secondPassMessages).toBeDefined();
		expect(
			(secondPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes(
						'You are repeating create ops without the required user-facing title/name field.'
					)
			)
		).toBe(true);
		expect(
			(secondPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes(
						'For onto.milestone.create, use a concrete milestone title from the user message, for example "Complete chapters 1-10".'
					)
			)
		).toBe(true);
		expect(
			(secondPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes(
						'Your next response must do one of two things only: emit valid direct create-tool calls with concrete title/name values'
					)
			)
		).toBe(true);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe(
			'Need a concrete milestone title before creating it.'
		);
	});

	it('repairs mutation-intent turns that stop after schema discovery only', async () => {
		let streamInvocation = 0;
		let thirdPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_schema:milestone-create',
							type: 'function',
							function: {
								name: 'tool_schema',
								arguments: JSON.stringify({
									op: 'onto.milestone.create',
									include_schema: true
								})
							}
						} satisfies ChatToolCall
					};
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_schema:task-create',
							type: 'function',
							function: {
								name: 'tool_schema',
								arguments: JSON.stringify({
									op: 'onto.task.create',
									include_schema: true
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				if (streamInvocation === 2) {
					yield {
						type: 'text',
						content: 'I mapped out the write operations I need next.'
					};
					yield { type: 'done', finished_reason: 'stop' };
					return;
				}

				thirdPassMessages = params.messages as FastChatHistoryMessage[];
				yield {
					type: 'text',
					content: 'Need to actually execute the writes.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (toolCall: ChatToolCall): Promise<ChatToolResult> => {
			if (toolCall.function.name === 'tool_schema') {
				const args = JSON.parse(toolCall.function.arguments || '{}');
				return {
					tool_call_id: toolCall.id,
					result: getToolSchema(args.op, {
						include_schema: args.include_schema,
						include_examples: true
					}),
					success: true
				};
			}
			return {
				tool_call_id: toolCall.id,
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
			message: 'Set up monthly milestones and supporting writing tasks.',
			tools: createProgressiveGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(thirdPassMessages).toBeDefined();
		expect(
			(thirdPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes('You have not completed any write yet.')
			)
		).toBe(true);
		expect(
			(thirdPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes(
						'Do not stop after schema discovery or failed writes without either retrying correctly or asking a concise blocker question.'
					)
			)
		).toBe(true);
		expect(
			(thirdPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes(
						'Write ops already identified: onto.milestone.create, onto.task.create.'
					)
			)
		).toBe(true);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe('Need to actually execute the writes.');
	});

	it('repairs failed update turns that stop without retrying or asking a blocker question', async () => {
		let streamInvocation = 0;
		let fourthPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_schema:goal-update',
							type: 'function',
							function: {
								name: 'tool_schema',
								arguments: JSON.stringify({
									op: 'onto.goal.update',
									include_schema: true
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				if (streamInvocation === 2) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'update_onto_goal:empty',
							type: 'function',
							function: {
								name: 'update_onto_goal',
								arguments: JSON.stringify({})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				if (streamInvocation === 3) {
					yield {
						type: 'text',
						content: 'I still need to finish applying this.'
					};
					yield { type: 'done', finished_reason: 'stop' };
					return;
				}

				fourthPassMessages = params.messages as FastChatHistoryMessage[];
				yield {
					type: 'text',
					content: 'Need the exact goal update fields before I can finish.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (toolCall: ChatToolCall): Promise<ChatToolResult> => {
			if (toolCall.function.name === 'tool_schema') {
				const args = JSON.parse(toolCall.function.arguments || '{}');
				return {
					tool_call_id: toolCall.id,
					result: getToolSchema(args.op, {
						include_schema: args.include_schema,
						include_examples: true
					}),
					success: true
				};
			}
			return {
				tool_call_id: toolCall.id,
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
			message: 'Update the draft goal to reflect the new writing schedule.',
			tools: createProgressiveGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(4);
		expect(fourthPassMessages).toBeDefined();
		expect(
			(fourthPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes(
						'For update ops, reuse exact *_id values already present in structured context and include at least one concrete field to change. Never emit empty argument objects.'
					)
			)
		).toBe(true);
		expect(
			(fourthPassMessages ?? []).some(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes(
						'For onto.goal.update, copy the exact goal_id from structured context and include a concrete field such as name, description, state_key, or target_date.'
					)
			)
		).toBe(true);
		expect(
			(fourthPassMessages ?? []).some(
				(message) =>
					message.role === 'tool' &&
					typeof message.content === 'string' &&
					message.content.includes('"help_path":"onto.goal.update"') &&
					message.content.includes('Missing required parameter: goal_id') &&
					message.content.includes(
						'No update fields provided for onto.goal.update. Include at least one field to change.'
					)
			)
		).toBe(true);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe(
			'Need the exact goal update fields before I can finish.'
		);
	});

	it('rejects unresolvable project-create relationship shorthand before execution', async () => {
		let streamInvocation = 0;
		let secondPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_exec:project-create-bad-relationship',
							type: 'function',
							function: {
								name: 'tool_exec',
								arguments: JSON.stringify({
									op: 'onto.project.create',
									args: {
										project: {
											name: 'Podcast Launch',
											type_key: 'project.creative.podcast'
										},
										entities: [
											{
												temp_id: 'g1',
												kind: 'goal',
												name: 'Publish the first 3 episodes'
											}
										],
										relationships: [['g1', 't9']]
									}
								})
							}
						}
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				secondPassMessages = params.messages as FastChatHistoryMessage[];
				yield { type: 'text', content: 'Need corrected relationship refs.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (): Promise<ChatToolResult> => ({
				tool_call_id: 'unused',
				result: { ok: true },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project_create',
			history: [],
			message: 'Create the project',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(toolExecutor).not.toHaveBeenCalled();
		expect(secondPassMessages).toBeDefined();
		const toolMessage = [...(secondPassMessages ?? [])]
			.reverse()
			.find(
				(message) =>
					message.role === 'tool' &&
					message.tool_call_id === 'tool_exec:project-create-bad-relationship'
			);
		expect(toolMessage?.content).toContain('relationships[0][1]');
		expect(toolMessage?.content).toContain('must match an entity in args.entities');
		expect(result.finalAssistantText).toBe('Need corrected relationship refs.');
	});

	it('does not allow project_create turns to stop with fake success after help-only discovery', async () => {
		let streamInvocation = 0;
		let recoveryPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;

				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_help:project-create-skill',
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: JSON.stringify({
									path: 'onto.project.create.skill',
									format: 'full'
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				if (streamInvocation === 2) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_help:project-create-op',
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: JSON.stringify({
									path: 'onto.project.create',
									format: 'full',
									include_schemas: true
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				if (streamInvocation === 3) {
					yield {
						type: 'text',
						content:
							'Project "Podcast Launch" created successfully with the initial goal and tasks.'
					};
					yield { type: 'done', finished_reason: 'stop' };
					return;
				}

				if (streamInvocation === 4) {
					recoveryPassMessages = params.messages as FastChatHistoryMessage[];
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_exec:project-create',
							type: 'function',
							function: {
								name: 'tool_exec',
								arguments: JSON.stringify({
									op: 'onto.project.create',
									args: {
										project: {
											name: 'Podcast Launch',
											type_key: 'project.creative.podcast'
										},
										entities: [
											{
												temp_id: 'g1',
												kind: 'goal',
												name: 'Publish the first 3 episodes by June 15'
											},
											{
												temp_id: 't1',
												kind: 'task',
												title: 'Define the show format'
											},
											{
												temp_id: 't2',
												kind: 'task',
												title: 'Book the first 3 guests'
											},
											{
												temp_id: 't3',
												kind: 'task',
												title: 'Record the trailer'
											}
										],
										relationships: []
									}
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield {
					type: 'text',
					content:
						'Project "Podcast Launch" created successfully with the goal and the three initial tasks.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (toolCall: ChatToolCall): Promise<ChatToolResult> => {
			if (toolCall.function.name === 'tool_help') {
				const args = JSON.parse(toolCall.function.arguments || '{}');
				return {
					tool_call_id: toolCall.id,
					result: getToolHelp(args.path, {
						format: args.format,
						include_schemas: args.include_schemas,
						include_examples: true
					}),
					success: true
				};
			}

			return {
				tool_call_id: toolCall.id,
				result: {
					op: 'onto.project.create',
					ok: true,
					result: { project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40' }
				},
				success: true
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project_create',
			history: [],
			message:
				'Create a project called Podcast Launch for BuildOS. The goal is to publish the first 3 episodes by June 15. Tasks I already know about: define the show format, book the first 3 guests, and record the trailer.',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(5);
		expect(toolExecutor).toHaveBeenCalledTimes(3);
		expect(recoveryPassMessages).toBeDefined();
		const repairMessage = [...(recoveryPassMessages ?? [])]
			.reverse()
			.find(
				(message) =>
					message.role === 'system' &&
					typeof message.content === 'string' &&
					message.content.includes(
						'no successful onto.project.create call has happened yet'
					)
			);
		expect(repairMessage?.content).toContain(
			'Do not end the turn with a success summary unless onto.project.create has actually succeeded.'
		);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toContain('created successfully');
		expect(
			result.toolExecutions?.some((execution) => {
				const args = JSON.parse(execution.toolCall.function.arguments || '{}');
				return args.op === 'onto.project.create' && execution.result.success === true;
			})
		).toBe(true);
	});

	it('injects project context into util.project.overview tool_exec calls before execution', async () => {
		let streamInvocation = 0;
		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: {
					op: 'util.project.overview',
					ok: true,
					result: { project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40' }
				},
				success: true
			})
		);
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_exec:project-overview',
							type: 'function',
							function: {
								name: 'tool_exec',
								arguments: JSON.stringify({
									op: 'util.project.overview',
									args: {}
								})
							}
						}
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Loaded the in-scope project overview.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			projectId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			history: [],
			message: "What's blocked?",
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(toolExecutor).toHaveBeenCalledTimes(1);
		const executedArgs = JSON.parse(
			toolExecutor.mock.calls[0]?.[0]?.function?.arguments ?? '{}'
		);
		expect(executedArgs).toEqual({
			op: 'util.project.overview',
			args: {
				project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40'
			}
		});
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe('Loaded the in-scope project overview.');
	});

	it('suppresses scratchpad-like final assistant text after tool rounds', async () => {
		let streamInvocation = 0;
		const deltas: string[] = [];
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield { type: 'text', content: 'Let me look up your 9takes project.' };
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_exec:search-project',
							type: 'function',
							function: {
								name: 'tool_exec',
								arguments: JSON.stringify({
									op: 'onto.search',
									args: {
										query: '9takes',
										types: ['project'],
										limit: 5
									}
								})
							}
						}
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield {
					type: 'text',
					content: `Let me look up your 9takes project.

No, wait, args need query.

Correct that.

Actually, for tool_exec, I need the schema first.

< xai:function_call name="tool_exec">
onto.search
{"query":"9takes","types":["project"],"limit":5}`
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: {
					op: 'onto.search',
					ok: true,
					result: { projects: [{ id: 'proj-1', title: '9takes' }] }
				},
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: "What's going on with my project 9takes?",
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async (delta) => {
				deltas.push(delta);
			}
		});

		expect(result.finishedReason).toBe('stop');
		expect(result.assistantText).toBe('Let me look up your 9takes project.');
		expect(result.assistantText).not.toContain('No, wait');
		expect(result.assistantText).not.toContain('tool_exec');
		expect(result.assistantText).not.toContain('< xai:function_call');
		expect(result.finalAssistantText).toBe('Let me look up your 9takes project.');
		expect(deltas).toEqual(['Let me look up your 9takes project.']);
	});

	it('auto-recovers document organization when gateway keeps missing document_id on deletes', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				const toolCall: ChatToolCall = {
					id: `tool_call_delete_${streamInvocation}`,
					type: 'function',
					function: {
						name: 'tool_exec',
						arguments: JSON.stringify({
							op: 'onto.document.delete',
							args: {}
						})
					}
				};

				yield { type: 'tool_call', tool_call: toolCall };
				yield { type: 'done', finished_reason: 'tool_calls' };
			})
		} as any;

		const movedIds: string[] = [];
		const moveArgs: Array<Record<string, unknown>> = [];
		const toolExecutor = vi.fn(async (toolCall: ChatToolCall): Promise<ChatToolResult> => {
			const parsed = JSON.parse(toolCall.function.arguments || '{}');
			const op = parsed?.op as string | undefined;
			if (op === 'onto.document.delete') {
				return {
					tool_call_id: toolCall.id,
					result: {
						op,
						ok: false,
						error: {
							code: 'VALIDATION_ERROR',
							message: 'Missing required parameter: document_id',
							help_path: 'onto.document.delete'
						}
					},
					success: false,
					error: 'Missing required parameter: document_id'
				};
			}
			if (op === 'onto.document.tree.get') {
				return {
					tool_call_id: toolCall.id,
					result: {
						op,
						ok: true,
						result: {
							structure: {
								root: [{ id: 'root-1' }, { id: 'root-2' }]
							},
							unlinked: ['doc-a', 'doc-b']
						}
					},
					success: true
				};
			}
			if (op === 'onto.document.tree.move') {
				const docId = parsed?.args?.document_id;
				moveArgs.push((parsed?.args as Record<string, unknown>) ?? {});
				if ((parsed?.args as Record<string, unknown>)?.new_parent_id === null) {
					return {
						tool_call_id: toolCall.id,
						result: {
							op,
							ok: false,
							error: {
								code: 'VALIDATION_ERROR',
								message:
									'Invalid type for parameter new_parent_id: expected string, got null'
							}
						},
						success: false,
						error: 'Invalid type for parameter new_parent_id: expected string, got null'
					};
				}
				if (typeof docId === 'string') {
					movedIds.push(docId);
				}
				return {
					tool_call_id: toolCall.id,
					result: { op, ok: true, result: { moved: true } },
					success: true
				};
			}
			return {
				tool_call_id: toolCall.id,
				result: null,
				success: false,
				error: `Unexpected op: ${String(op)}`
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			projectId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			history: [],
			message: 'organize unlinked docs',
			tools: createGatewayTools(),
			allowAutonomousRecovery: true,
			toolExecutor,
			onDelta: async () => {}
		});

		expect(result.finishedReason).toBe('stop');
		expect(result.assistantText).toContain('organized 2 unlinked document');
		expect(movedIds).toEqual(['doc-a', 'doc-b']);
		expect(
			moveArgs.every((args) => !Object.prototype.hasOwnProperty.call(args, 'new_parent_id'))
		).toBe(true);
		expect(llm.streamText).toHaveBeenCalledTimes(2);
		expect(toolExecutor).toHaveBeenCalledTimes(3);
	});

	it('does not auto-recover from repeated read-only tree loads without write-failure evidence', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				const toolCall: ChatToolCall = {
					id: `tool_call_tree_${streamInvocation}`,
					type: 'function',
					function: {
						name: 'tool_exec',
						arguments: JSON.stringify({
							op: 'onto.document.tree.get',
							args: { include_documents: true }
						})
					}
				};

				yield { type: 'tool_call', tool_call: toolCall };
				yield { type: 'done', finished_reason: 'tool_calls' };
			})
		} as any;

		const movedIds: string[] = [];
		const toolExecutor = vi.fn(async (toolCall: ChatToolCall): Promise<ChatToolResult> => {
			const parsed = JSON.parse(toolCall.function.arguments || '{}');
			const op = parsed?.op as string | undefined;
			if (op === 'onto.document.tree.get') {
				return {
					tool_call_id: toolCall.id,
					result: {
						op,
						ok: true,
						result: {
							structure: {
								root: [{ id: 'root-1' }, { id: 'root-2' }]
							},
							documents: {
								'root-1': { title: 'Root 1' },
								'root-2': { title: 'Root 2' },
								'doc-a': { title: 'A' },
								'doc-b': { title: 'B' }
							},
							unlinked: ['doc-a', 'doc-b']
						}
					},
					success: true
				};
			}
			if (op === 'onto.document.tree.move') {
				const docId = parsed?.args?.document_id;
				if (typeof docId === 'string') {
					movedIds.push(docId);
				}
				return {
					tool_call_id: toolCall.id,
					result: { op, ok: true, result: { moved: true } },
					success: true
				};
			}
			return {
				tool_call_id: toolCall.id,
				result: null,
				success: false,
				error: `Unexpected op: ${String(op)}`
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			projectId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			history: [],
			message: 'organize unlinked docs',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(result.finishedReason).toBe('tool_repetition_limit');
		expect(result.assistantText).toContain('same tool sequence kept repeating');
		expect(movedIds).toEqual([]);
		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(toolExecutor).toHaveBeenCalledTimes(3);
	});

	it('compacts onto.document.list payloads into stable summaries for model context', async () => {
		let streamInvocation = 0;
		let secondPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					const toolCall: ChatToolCall = {
						id: 'tool_call_docs_1',
						type: 'function',
						function: {
							name: 'tool_exec',
							arguments: JSON.stringify({
								op: 'onto.document.list',
								args: {
									project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
									limit: 50
								}
							})
						}
					};
					yield { type: 'tool_call', tool_call: toolCall };
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				secondPassMessages = params.messages as FastChatHistoryMessage[];
				yield { type: 'text', content: 'Done.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const docs = Array.from({ length: 6 }, (_, index) => ({
			id: `doc-${index + 1}`,
			title: `Document ${index + 1}`,
			type_key: 'document.context.project',
			state_key: 'draft',
			updated_at: `2026-02-1${index}T00:00:00.000Z`,
			description: `Description ${index + 1}`,
			content: `# Header ${index + 1}\n## Subheader\n${'x'.repeat(3500)}`,
			markdown_outline: {
				counts: { total: 2, h1: 1, h2: 1, h3: 0 },
				headings: [
					{
						level: 1,
						text: `Header ${index + 1}`,
						children: [{ level: 2, text: 'Subheader', children: [] }]
					}
				],
				truncated: false
			}
		}));

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: {
					op: 'onto.document.list',
					ok: true,
					result: {
						documents: docs,
						total: docs.length,
						message: `Found ${docs.length} ontology documents.`
					},
					meta: {}
				},
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			projectId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			history: [],
			message: 'List documents',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(result.finishedReason).toBe('stop');
		expect(secondPassMessages).toBeDefined();
		const toolMessage = [...(secondPassMessages ?? [])]
			.reverse()
			.find((message) => message.role === 'tool');
		expect(toolMessage).toBeDefined();
		const payload = JSON.parse((toolMessage as FastChatHistoryMessage).content || '{}');
		expect(payload?.truncated).not.toBe(true);
		expect(payload?.result?.total).toBe(6);
		expect(Array.isArray(payload?.result?.documents)).toBe(true);
		expect(payload?.result?.documents).toHaveLength(6);
		expect(payload?.result?.documents?.[0]?.content_length).toBeGreaterThan(0);
		expect(payload?.result?.documents?.[0]?.markdown_outline?.counts?.h1).toBe(1);
	});

	it('pairs every tool_call_id with a tool message when validation fails on part of a batch', async () => {
		let streamInvocation = 0;
		let secondPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_help:bad',
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: '0x1 ???'
							}
						} satisfies ChatToolCall
					};
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_help:good',
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: JSON.stringify({ path: 'onto.task' })
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				secondPassMessages = params.messages as FastChatHistoryMessage[];
				yield { type: 'text', content: 'Please send corrected tool calls only.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: { ok: true },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'show tool help',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(2);
		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(secondPassMessages).toBeDefined();

		const assistantMessage = [...(secondPassMessages ?? [])]
			.reverse()
			.find((message) => message.role === 'assistant' && message.tool_calls?.length === 2);
		expect(assistantMessage).toBeDefined();

		const replayBadCall = assistantMessage?.tool_calls?.find(
			(toolCall) => toolCall.id === 'tool_help:bad'
		);
		expect(replayBadCall?.function.arguments).toBe('{}');

		const toolMessages = (secondPassMessages ?? []).filter(
			(message) => message.role === 'tool'
		);
		expect(toolMessages.map((message) => message.tool_call_id)).toEqual([
			'tool_help:bad',
			'tool_help:good'
		]);
		const badToolPayload = JSON.parse(toolMessages[0]?.content ?? '{}');
		const goodToolPayload = JSON.parse(toolMessages[1]?.content ?? '{}');
		expect(badToolPayload.error).toContain('Invalid JSON in tool arguments');
		expect(goodToolPayload.ok).toBe(true);
		expect(result.finishedReason).toBe('stop');
		expect(result.assistantText).toContain('corrected tool calls');
	});

	it('does not count validation-only failures against maxToolCalls', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_help:bad',
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: '0x1 ???'
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				if (streamInvocation === 2) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_help:good',
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: JSON.stringify({ path: 'onto.task' })
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Recovered after validation.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: { ok: true },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'show task help',
			tools: createGatewayTools(),
			toolExecutor,
			maxToolCalls: 1,
			onDelta: async () => {}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(result.finishedReason).toBe('stop');
		expect(result.assistantText).toContain('Recovered after validation.');
	});

	it('allows another validation repair after a successful tool round', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_help:bad-1',
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: 'bad payload'
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				if (streamInvocation === 2) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_help:good',
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: JSON.stringify({ path: 'onto.task' })
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				if (streamInvocation === 3) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_help:bad-2',
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: 'still bad'
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Completed after second repair.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: { ok: true },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'show task help',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(4);
		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(result.finishedReason).toBe('stop');
		expect(result.assistantText).toContain('Completed after second repair.');
	});

	it('defaults tool_help path to root when model omits required path', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_help:0',
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: JSON.stringify({})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Checked project context.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: { ok: true },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: "what's going on with my projects",
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(toolExecutor).toHaveBeenCalledTimes(1);
		const executedCall = toolExecutor.mock.calls[0]?.[0] as ChatToolCall;
		const parsedArgs = JSON.parse(executedCall.function.arguments || '{}');
		expect(parsedArgs.path).toBe('root');
		expect(result.finishedReason).toBe('stop');
		expect(result.assistantText).toContain('Checked project context.');
	});

	it('does not coerce unrecoverable tool_help args to root', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_help:bad',
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: '0x1 ???'
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Please provide a valid help path payload.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: { ok: true },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'show task help',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(toolExecutor).not.toHaveBeenCalled();
		expect(result.toolExecutions.length).toBeGreaterThan(0);
		expect(result.toolExecutions[0]?.result.error).toContain('Invalid JSON in tool arguments');
		expect(result.finishedReason).toBe('stop');
		expect(result.assistantText).toContain('Please provide a valid help path payload.');
	});

	it('recovers split tool_exec JSON fragments before executing tools', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_exec:split',
							type: 'function',
							function: {
								name: 'tool_exec',
								arguments:
									'0{"op":"onto.task.list"} {"args":{"project_id":"05c40ed8-9dbe-4893-bd64-8aeec90eab40","limit":10}}'
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Task list loaded.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const executedArgs: Array<Record<string, any>> = [];
		const toolExecutor = vi.fn(async (toolCall: ChatToolCall): Promise<ChatToolResult> => {
			const parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
			executedArgs.push(parsedArgs);
			return {
				tool_call_id: toolCall.id,
				result: {
					op: parsedArgs.op,
					ok: true,
					result: { tasks: [] }
				},
				success: true
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			projectId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			history: [],
			message: 'list tasks',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(executedArgs[0]).toMatchObject({
			op: 'onto.task.list',
			args: {
				project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
				limit: 10
			}
		});
		expect(result.finishedReason).toBe('stop');
		expect(result.assistantText).toContain('Task list loaded.');
	});

	it('recovers tool_help path from concatenated JSON objects', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_help:concat',
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: '{} {"path":"onto.task","format":"short"}'
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Loaded task help.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (toolCall: ChatToolCall): Promise<ChatToolResult> => {
			const parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
			return {
				tool_call_id: toolCall.id,
				result: {
					path: parsedArgs.path,
					format: parsedArgs.format
				},
				success: true
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'help me with tasks',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(toolExecutor).toHaveBeenCalledTimes(1);
		const executedCall = toolExecutor.mock.calls[0]?.[0] as ChatToolCall;
		const parsedArgs = JSON.parse(executedCall.function.arguments || '{}');
		expect(parsedArgs.path).toBe('onto.task');
		expect(parsedArgs.format).toBe('short');
		expect(result.finishedReason).toBe('stop');
		expect(result.assistantText).toContain('Loaded task help.');
		expect(result.finalAssistantText).toBe('Loaded task help.');
	});

	it('recovers tool_exec args from noisy quoted JSON object segments', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_exec:quoted-segments',
							type: 'function',
							function: {
								name: 'tool_exec',
								arguments:
									'prefix "{\\"op\\":\\"onto.task.list\\"}" middle "{\\"args\\":{\\"project_id\\":\\"05c40ed8-9dbe-4893-bd64-8aeec90eab40\\",\\"limit\\":5}}" suffix'
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Recovered quoted tool args.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: { ok: true },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			projectId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
			history: [],
			message: 'recover quoted exec args',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(toolExecutor).toHaveBeenCalledTimes(1);
		const executedCall = toolExecutor.mock.calls[0]?.[0] as ChatToolCall;
		const parsedArgs = JSON.parse(executedCall.function.arguments || '{}');
		expect(parsedArgs).toMatchObject({
			op: 'onto.task.list',
			args: {
				project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
				limit: 5
			}
		});
		expect(result.finishedReason).toBe('stop');
	});

	it('recovers tool_help path from plain malformed text fallback', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_help:path-fallback',
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: '00 onto.task now'
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Recovered help path fallback.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (toolCall: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: { ok: true },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'recover help path fallback',
			tools: createGatewayTools(),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(toolExecutor).toHaveBeenCalledTimes(1);
		const executedCall = toolExecutor.mock.calls[0]?.[0] as ChatToolCall;
		const parsedArgs = JSON.parse(executedCall.function.arguments || '{}');
		expect(parsedArgs.path).toBe('onto.task');
		expect(result.finishedReason).toBe('stop');
	});

	it('auto-runs project/task listing after repeated tool_help(root) loops', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation <= 2) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: `tool_help:${streamInvocation - 1}`,
							type: 'function',
							function: {
								name: 'tool_help',
								arguments: JSON.stringify({ path: 'root' })
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Here are your active projects and tasks.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const executedGatewayOps: string[] = [];
		const toolExecutor = vi.fn(async (toolCall: ChatToolCall): Promise<ChatToolResult> => {
			if (toolCall.function.name === 'tool_help') {
				return {
					tool_call_id: toolCall.id,
					result: {
						type: 'directory',
						path: 'root',
						groups: ['onto', 'util', 'cal']
					},
					success: true
				};
			}

			const parsed = JSON.parse(toolCall.function.arguments || '{}');
			const op = parsed?.op as string | undefined;
			if (typeof op === 'string') {
				executedGatewayOps.push(op);
			}

			if (op === 'onto.project.list') {
				return {
					tool_call_id: toolCall.id,
					result: {
						op,
						ok: true,
						result: {
							projects: [{ id: 'proj-1', title: 'Alpha' }],
							total: 1
						}
					},
					success: true
				};
			}

			if (op === 'onto.task.list') {
				return {
					tool_call_id: toolCall.id,
					result: {
						op,
						ok: true,
						result: {
							tasks: [{ id: 'task-1', title: 'Write docs' }],
							total: 1
						}
					},
					success: true
				};
			}

			return {
				tool_call_id: toolCall.id,
				result: null,
				success: false,
				error: `Unexpected op: ${String(op)}`
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'what are my current priorities?',
			tools: createGatewayTools(),
			allowAutonomousRecovery: true,
			toolExecutor,
			onDelta: async () => {}
		});

		expect(result.finishedReason).toBe('stop');
		expect(result.assistantText).toContain('active projects and tasks');
		expect(executedGatewayOps).toContain('onto.project.list');
		expect(executedGatewayOps).toContain('onto.task.list');
		expect(llm.streamText).toHaveBeenCalledTimes(3);
	});

	it('returns cancelled with partial assistant text when stream aborts mid-response', async () => {
		const abortController = new AbortController();
		const deltas: string[] = [];
		const llm = {
			streamText: vi.fn(async function* () {
				yield { type: 'text', content: 'Partial answer' };
				abortController.abort();
				const abortError = new Error('The operation was aborted.');
				abortError.name = 'AbortError';
				throw abortError;
			})
		} as any;

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'Tell me something',
			signal: abortController.signal,
			onDelta: async (delta) => {
				deltas.push(delta);
			}
		});

		expect(result.cancelled).toBe(true);
		expect(result.finishedReason).toBe('cancelled');
		expect(result.assistantText).toBe('Partial answer');
		expect(deltas).toEqual(['Partial answer']);
	});

	it('emits a clean lead-in before a tool-call pass closes', async () => {
		let releaseToolCall!: () => void;
		const toolCallGate = new Promise<void>((resolve) => {
			releaseToolCall = resolve;
		});
		let streamInvocation = 0;
		const events: string[] = [];
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield { type: 'text', content: "I'll check the project calendar now." };
					await toolCallGate;
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_exec:calendar',
							type: 'function',
							function: {
								name: 'tool_exec',
								arguments: JSON.stringify({
									op: 'cal.event.list',
									args: {}
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'I found the calendar events.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const resultPromise = streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			history: [],
			message: 'Check the project calendar.',
			tools: createGatewayTools(),
			toolExecutor: async (toolCall): Promise<ChatToolResult> => ({
				tool_call_id: toolCall.id,
				result: { ok: true },
				success: true
			}),
			onToolCall: async () => {
				events.push('tool_call');
			},
			onDelta: async (delta) => {
				events.push(`delta:${delta}`);
			}
		});

		await vi.waitFor(() => {
			expect(events).toEqual(["delta:I'll check the project calendar now."]);
		});

		releaseToolCall();
		const result = await resultPromise;

		expect(result.finishedReason).toBe('stop');
		expect(events).toEqual([
			"delta:I'll check the project calendar now.",
			'tool_call',
			'delta:\n\nI found the calendar events.'
		]);
		expect(result.assistantText).toBe(
			"I'll check the project calendar now.\n\nI found the calendar events."
		);
	});

	it('returns cancelled and preserves tool executions gathered before abort', async () => {
		const abortController = new AbortController();
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: {
							id: 'tool_exec:one',
							type: 'function',
							function: {
								name: 'tool_exec',
								arguments: JSON.stringify({
									op: 'onto.task.list',
									args: { limit: 1 }
								})
							}
						} satisfies ChatToolCall
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				yield { type: 'text', content: 'Should never reach second pass' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (toolCall: ChatToolCall): Promise<ChatToolResult> => {
			abortController.abort();
			return {
				tool_call_id: toolCall.id,
				result: { ok: true },
				success: true
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'List tasks',
			tools: createGatewayTools(),
			toolExecutor,
			signal: abortController.signal,
			onDelta: async () => {}
		});

		expect(result.cancelled).toBe(true);
		expect(result.finishedReason).toBe('cancelled');
		expect(result.toolExecutions).toHaveLength(1);
		expect(result.toolExecutions?.[0]?.toolCall.id).toBe('tool_exec:one');
		expect(toolExecutor).toHaveBeenCalledTimes(1);
	});
});
