// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import { streamFastChat } from './stream-orchestrator/index';
import { REDACTED_DURABLE_TEXT } from './stream-orchestrator/tool-arguments';
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
	it('adds dynamic tool budget guidance to each LLM pass', async () => {
		let streamInvocation = 0;
		const passMessages: FastChatHistoryMessage[][] = [];
		const llm = {
			streamText: vi.fn(async function* (params: { messages: FastChatHistoryMessage[] }) {
				streamInvocation += 1;
				passMessages.push(params.messages);
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_onto_projects',
							{ query: 'BuildOS' },
							'search:buildos'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'I found the BuildOS project.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;
		const toolExecutor = vi.fn(
			async (call: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: call.id,
				result: { projects: [{ id: 'project-1', type: 'project', name: 'BuildOS' }] },
				success: true
			})
		);

		await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'What is happening with my projects?',
			tools: tools(['search_onto_projects']),
			toolExecutor,
			onDelta: async () => {},
			maxToolRounds: 3,
			maxToolCalls: 5
		});

		const firstBudgetMessage = passMessages[0]?.at(-1)?.content;
		const secondBudgetMessage = passMessages[1]?.at(-1)?.content;
		expect(firstBudgetMessage).toContain('Runtime tool budget: 3 of 3 tool rounds remain');
		expect(firstBudgetMessage).toContain('Batch independent read calls');
		expect(secondBudgetMessage).toContain('Runtime tool budget: 2 of 3 tool rounds remain');
		expect(secondBudgetMessage).toContain('With two or fewer tool rounds remaining');
	});

	it('emits terminal failed results for tool calls skipped by the call limit', async () => {
		const onToolResult = vi.fn();
		const llm = {
			streamText: vi.fn(async function* () {
				yield {
					type: 'tool_call',
					tool_call: toolCall(
						'search_onto_projects',
						{ query: 'first project' },
						'search:first'
					)
				};
				yield {
					type: 'tool_call',
					tool_call: toolCall(
						'search_onto_projects',
						{ query: 'second project' },
						'search:second'
					)
				};
				yield {
					type: 'tool_call',
					tool_call: toolCall(
						'search_onto_projects',
						{ query: 'third project' },
						'search:third'
					)
				};
				yield { type: 'done', finished_reason: 'tool_calls' };
			})
		} as any;
		const toolExecutor = vi.fn(
			async (call: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: call.id,
				result: { projects: [{ id: 'project-1', type: 'project', name: 'BuildOS' }] },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'Search several project names.',
			tools: tools(['search_onto_projects']),
			toolExecutor,
			onToolResult,
			onDelta: async () => {},
			maxToolCalls: 1
		});

		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(toolExecutor.mock.calls[0]?.[0].id).toBe('search:first');
		expect(onToolResult).toHaveBeenCalledTimes(3);
		expect(result.finishedReason).toBe('tool_call_limit');
		expect(result.toolExecutions).toHaveLength(3);
		expect(result.toolExecutions?.[0]?.result.success).toBe(true);
		expect(result.toolExecutions?.[1]?.toolCall.id).toBe('search:second');
		expect(result.toolExecutions?.[1]?.result).toMatchObject({
			success: false,
			error: expect.stringContaining('tool-call safety limit')
		});
		expect(result.toolExecutions?.[2]?.toolCall.id).toBe('search:third');
		expect(result.toolExecutions?.[2]?.result).toMatchObject({
			success: false,
			error: expect.stringContaining('tool-call safety limit')
		});
	});

	it('batches contiguous independent read tools and records results in model order', async () => {
		let streamInvocation = 0;
		const passMessages: FastChatHistoryMessage[][] = [];
		const onToolResult = vi.fn();
		const llm = {
			streamText: vi.fn(async function* (params: { messages: FastChatHistoryMessage[] }) {
				streamInvocation += 1;
				passMessages.push(params.messages);
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_onto_projects',
							{ query: 'slow first' },
							'read:first'
						)
					};
					yield {
						type: 'tool_call',
						tool_call: toolCall('list_onto_projects', {}, 'read:second')
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				yield { type: 'text', content: 'Loaded both reads.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;
		const toolExecutor = vi.fn(async (): Promise<ChatToolResult> => {
			throw new Error('single executor should not run for batched reads');
		});
		const batchToolExecutor = vi.fn(
			async (calls: ChatToolCall[]): Promise<ChatToolResult[]> =>
				calls.map((call) => ({
					tool_call_id: call.id,
					result: { tool: call.function.name },
					success: true
				}))
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'Search then list projects.',
			tools: tools(['search_onto_projects', 'list_onto_projects']),
			toolExecutor,
			batchToolExecutor,
			onToolResult,
			onDelta: async () => {}
		});

		expect(batchToolExecutor).toHaveBeenCalledTimes(1);
		expect(batchToolExecutor.mock.calls[0]?.[0].map((call) => call.id)).toEqual([
			'read:first',
			'read:second'
		]);
		expect(toolExecutor).not.toHaveBeenCalled();
		expect(onToolResult.mock.calls.map(([execution]) => execution.toolCall.id)).toEqual([
			'read:first',
			'read:second'
		]);
		const secondPassToolMessages = (passMessages[1] ?? []).filter(
			(message) => message.role === 'tool'
		);
		expect(secondPassToolMessages.map((message) => (message as any).tool_call_id)).toEqual([
			'read:first',
			'read:second'
		]);
		expect(result.finalAssistantText).toBe('Loaded both reads.');
	});

	it('does not batch reads across a write boundary', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_onto_projects',
							{ query: 'before' },
							'read:before'
						)
					};
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'update_onto_task',
							{
								task_id: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
								title: 'Renamed task'
							},
							'write:update'
						)
					};
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_onto_projects',
							{ query: 'after' },
							'read:after'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				yield { type: 'text', content: 'Done.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;
		const toolExecutor = vi.fn(
			async (call: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: call.id,
				result: { tool: call.function.name },
				success: true
			})
		);
		const batchToolExecutor = vi.fn(
			async (calls: ChatToolCall[]): Promise<ChatToolResult[]> =>
				calls.map((call) => ({
					tool_call_id: call.id,
					result: { tool: call.function.name },
					success: true
				}))
		);

		await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			projectId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			history: [],
			message: 'Read, write, then read again.',
			tools: tools(['search_onto_projects', 'update_onto_task']),
			toolExecutor,
			batchToolExecutor,
			onDelta: async () => {}
		});

		expect(batchToolExecutor).not.toHaveBeenCalled();
		expect(toolExecutor.mock.calls.map(([call]) => call.function.name)).toEqual([
			'search_onto_projects',
			'update_onto_task',
			'search_onto_projects'
		]);
	});

	it('applies the tool-call limit before extending a read batch', async () => {
		const onToolResult = vi.fn();
		const llm = {
			streamText: vi.fn(async function* () {
				yield {
					type: 'tool_call',
					tool_call: toolCall('search_onto_projects', { query: 'first' }, 'read:first')
				};
				yield {
					type: 'tool_call',
					tool_call: toolCall('search_onto_projects', { query: 'second' }, 'read:second')
				};
				yield {
					type: 'tool_call',
					tool_call: toolCall('search_onto_projects', { query: 'third' }, 'read:third')
				};
				yield { type: 'done', finished_reason: 'tool_calls' };
			})
		} as any;
		const toolExecutor = vi.fn(
			async (call: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: call.id,
				result: { projects: [] },
				success: true
			})
		);
		const batchToolExecutor = vi.fn(
			async (calls: ChatToolCall[]): Promise<ChatToolResult[]> =>
				calls.map((call) => ({
					tool_call_id: call.id,
					result: { projects: [] },
					success: true
				}))
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'Search several project names.',
			tools: tools(['search_onto_projects']),
			toolExecutor,
			batchToolExecutor,
			onToolResult,
			onDelta: async () => {},
			maxToolCalls: 2
		});

		expect(batchToolExecutor).toHaveBeenCalledTimes(1);
		expect(batchToolExecutor.mock.calls[0]?.[0].map((call) => call.id)).toEqual([
			'read:first',
			'read:second'
		]);
		expect(onToolResult).toHaveBeenCalledTimes(3);
		expect(result.finishedReason).toBe('tool_call_limit');
		expect(result.toolExecutions).toHaveLength(3);
		expect(result.toolExecutions?.[2]?.toolCall.id).toBe('read:third');
		expect(result.toolExecutions?.[2]?.result).toMatchObject({
			success: false,
			error: expect.stringContaining('tool-call safety limit')
		});
	});

	it('does not let onToolCall callback failures crash orchestration', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_onto_projects',
							{ query: 'BuildOS' },
							'search:callback'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				yield { type: 'text', content: 'Found BuildOS.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;
		const toolExecutor = vi.fn(
			async (call: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: call.id,
				result: { projects: [{ id: 'project-1', type: 'project', name: 'BuildOS' }] },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'Find BuildOS.',
			tools: tools(['search_onto_projects']),
			toolExecutor,
			onToolCall: async () => {
				throw new Error('callback failed');
			},
			onDelta: async () => {}
		});

		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(result.finalAssistantText).toBe('Found BuildOS.');
	});

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

	// Lean discovery (Tier 2 item 4): when only skill_search + domain_search mount at
	// launch, a skill_load call must still resolve via on-miss materialization. This
	// fails under the pre-2026-06-14 gatewayModeActive definition (which keyed only off
	// tool_search/tool_schema/skill_load and would be false for a lean launch surface).
	it('materializes skill_load on miss when only the lean discovery surface is mounted', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation <= 2) {
					// First call misses (not preloaded); second is the retry after the
					// orchestrator materializes it.
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'skill_load',
							{ skill: 'task_management' },
							`skill_load:attempt-${streamInvocation}`
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				yield { type: 'text', content: 'Loaded the task_management skill.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const executedSkillLoadWithTools: boolean[] = [];
		const toolExecutor = vi.fn(
			async (
				call: ChatToolCall,
				availableTools?: ChatToolDefinition[]
			): Promise<ChatToolResult> => {
				const availableToolNames = new Set(
					(availableTools ?? [])
						.map((tool) => tool.function?.name)
						.filter((name): name is string => Boolean(name))
				);
				if (call.function.name === 'skill_load') {
					executedSkillLoadWithTools.push(availableToolNames.has('skill_load'));
					return {
						tool_call_id: call.id,
						result: { type: 'skill', skill: 'task_management' },
						success: true
					};
				}
				return { tool_call_id: call.id, result: { ok: true }, success: true };
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
			message: 'Load the task management skill.',
			// Lean launch surface — the other discovery tools are NOT preloaded.
			tools: tools(['skill_search', 'domain_search']),
			toolExecutor,
			onDelta: async () => {}
		});

		// skill_load reached the executor (it was materialized on miss) and was present
		// on the surface at execution time.
		expect(toolExecutor.mock.calls.some(([call]) => call.function.name === 'skill_load')).toBe(
			true
		);
		expect(executedSkillLoadWithTools.some((present) => present)).toBe(true);
		expect(result.finalAssistantText).toBe('Loaded the task_management skill.');
	});

	it('auto-executes materialized tool aliases through the actual callable tool name', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'work_capability_search',
							{ query: 'document writing' },
							'alias-call'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				yield { type: 'text', content: 'Found the matching capability.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;
		const toolExecutor = vi.fn(
			async (call: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: call.id,
				result: { ok: true, matches: [] },
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'Find a writing capability.',
			tools: tools(['skill_search']),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(toolExecutor.mock.calls[0]?.[0].function.name).toBe('outcome_card_search');
		expect(result.toolExecutions?.[0]?.toolCall.function.name).toBe('outcome_card_search');
		expect(result.toolExecutions?.[0]?.result.tool_call_id).toBe('alias-call');
		expect(result.finalAssistantText).toBe('Found the matching capability.');
	});

	it('validates tools that become available earlier in the same round before executing them', async () => {
		let streamInvocation = 0;
		const onToolResult = vi.fn();
		const projectId = '4cfdbed1-840a-4fe4-9751-77c7884daa70';
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'skill_load',
							{ skill: 'project_documents' },
							'skill-load-call'
						)
					};
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'create_onto_document',
							{ project_id: projectId, content: 'Missing title.' },
							'create-doc-call'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				yield { type: 'text', content: 'I need a document title before creating it.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;
		const toolExecutor = vi.fn(
			async (call: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: call.id,
				result: {
					ok: true,
					materialized_tools:
						call.function.name === 'skill_load' ? ['create_onto_document'] : []
				},
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: projectId,
			projectId,
			history: [],
			message: 'Create a document.',
			tools: tools(['skill_load']),
			toolExecutor,
			onToolResult,
			onDelta: async () => {}
		});

		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(toolExecutor.mock.calls[0]?.[0].function.name).toBe('skill_load');
		expect(onToolResult).toHaveBeenCalledTimes(2);
		expect(result.toolExecutions?.[1]?.toolCall.function.name).toBe('create_onto_document');
		expect(result.toolExecutions?.[1]?.result).toMatchObject({
			success: false,
			error: expect.stringContaining('Missing required parameter: title')
		});
		expect(result.finalAssistantText).toContain('I need a document title before creating it.');
		expect(result.finalAssistantText).toContain('One write did not complete');
	});

	// BUG-1 (2026-06-15): skill_load surfaces canonical op names (related_ops) such
	// as "onto.milestone.create" alongside the callable tool name
	// "create_onto_milestone". The on-miss path resolves op -> callable tool and
	// runs it in the same round. If the next pass still retries the direct tool,
	// the orchestrator must close that retry without executing the write twice.
	it('auto-executes canonical op names through the direct tool and skips exact duplicate retries', async () => {
		const projectId = '4cfdbed1-840a-4fe4-9751-77c7884daa70';
		let streamInvocation = 0;
		const passMessages: FastChatHistoryMessage[][] = [];
		const llm = {
			streamText: vi.fn(async function* (params: { messages: FastChatHistoryMessage[] }) {
				passMessages.push(params.messages);
				streamInvocation += 1;
				if (streamInvocation === 1) {
					// Model calls the op name, which is NOT a mounted tool.
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'onto.milestone.create',
							{ project_id: projectId, title: 'January: Complete chapters 1-10' },
							'op-name-call'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}
				if (streamInvocation === 2) {
					// A stubborn model retries with the callable tool name even though
					// the op-name call was already executed by the orchestrator.
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'create_onto_milestone',
							{ project_id: projectId, title: 'January: Complete chapters 1-10' },
							'tool-name-call'
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
			async (call: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: call.id,
				result: {
					ok: true,
					milestone: {
						id: '66ff3a5d-6b08-424a-9135-7c33011d1084',
						title: 'January: Complete chapters 1-10'
					}
				},
				success: true
			})
		);

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: projectId,
			projectId,
			history: [],
			message: 'Create a January milestone.',
			// Lean launch surface — neither the op name nor the tool is preloaded.
			tools: tools(['skill_search', 'domain_search']),
			toolExecutor,
			onDelta: async () => {}
		});

		const executedNames = toolExecutor.mock.calls.map(([call]) => call.function.name);
		// The op-name call never reaches the executor under its canonical-op name.
		// It is executed once through the resolved direct tool, and the direct retry
		// receives a terminal duplicate-skipped result without a second write.
		expect(executedNames).not.toContain('onto.milestone.create');
		expect(executedNames).toEqual(['create_onto_milestone']);
		expect(result.toolExecutions?.[0]?.toolCall.function.name).toBe('create_onto_milestone');
		expect(result.toolExecutions?.[0]?.toolCall.id).toBe('op-name-call');
		expect(result.toolExecutions?.[0]?.result.tool_call_id).toBe('op-name-call');
		expect(result.toolExecutions?.[1]?.toolCall.function.name).toBe('create_onto_milestone');
		expect(result.toolExecutions?.[1]?.result.result).toMatchObject({
			status: 'duplicate_write_skipped',
			skipped_duplicate_write: true,
			previous_tool_call_id: 'op-name-call'
		});
		const secondPassMessages = passMessages[1] ?? [];
		const assistantToolCallIndex = secondPassMessages.findIndex(
			(msg) =>
				msg.role === 'assistant' &&
				Array.isArray((msg as any).tool_calls) &&
				(msg as any).tool_calls.some((call: ChatToolCall) => call.id === 'op-name-call')
		);
		expect(assistantToolCallIndex).toBeGreaterThanOrEqual(0);
		expect(secondPassMessages[assistantToolCallIndex + 1]?.role).toBe('tool');
		expect(result.finalAssistantText).toBe('Created the January milestone.');
	});

	it('emits a finalization guard summary when tools ran but the model gives no final text', async () => {
		let streamInvocation = 0;
		const emittedDeltas: string[] = [];
		const supervisorRecords: string[] = [];
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'update_onto_task',
							{
								task_id: '881823a4-e74e-48d2-bf3e-b77db7e47b5f',
								state_key: 'done'
							},
							'update_onto_task:done'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

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
			onDelta: async (delta) => {
				emittedDeltas.push(delta);
			},
			onSupervisorDecision: async ({ decision }) => {
				supervisorRecords.push(decision.action);
			}
		});

		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(emittedDeltas.join('')).toContain('I completed the requested change.');
		expect(result.finalAssistantText).toBe('I completed the requested change.');
		expect(result.finalizationGuard).toMatchObject({
			applied: true,
			reason: 'empty_after_successful_writes'
		});
		expect(supervisorRecords).toContain('flag_eval');
	});

	it('emits a supervisor status during long model silence', async () => {
		vi.useFakeTimers();
		try {
			const statusMessages: string[] = [];
			const llm = {
				streamText: vi.fn(async function* () {
					await new Promise((resolve) => setTimeout(resolve, 13_000));
					yield { type: 'text', content: 'Done after thinking.' };
					yield { type: 'done', finished_reason: 'stop' };
				})
			} as any;

			const resultPromise = streamFastChat({
				llm,
				userId: 'user_1',
				sessionId: 'session_1',
				contextType: 'project',
				entityId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
				projectId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
				history: [],
				message: 'Think for a bit, then answer.',
				tools: [],
				onDelta: async () => {},
				onSupervisorDecision: async ({ decision }) => {
					if (decision.action === 'emit_status') {
						statusMessages.push(decision.message);
					}
				}
			});

			await vi.advanceTimersByTimeAsync(12_000);
			expect(statusMessages).toEqual(['BuildOS is still working through the request.']);

			await vi.advanceTimersByTimeAsync(1_000);
			const result = await resultPromise;
			expect(result.finalAssistantText).toBe('Done after thinking.');
		} finally {
			vi.useRealTimers();
		}
	});

	it('synthesizes instead of showing the safety-limit notice after the final discovery round', async () => {
		let streamInvocation = 0;
		const streamParams: Array<{ toolChoice?: string; toolNames: string[] }> = [];
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				streamParams.push({
					toolChoice: params.tool_choice,
					toolNames: (params.tools ?? [])
						.map((tool: ChatToolDefinition) => tool.function?.name)
						.filter((name: string | undefined): name is string => Boolean(name))
				});

				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'tool_search',
							{ query: 'web search and fetch content', capability: 'web_research' },
							'tool_search:web'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				if (params.tools) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'web_visit',
							{ url: 'https://example.com', max_chars: 8000 },
							'web_visit:late'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'I can draft from the loaded context.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			return {
				tool_call_id: call.id,
				result: {
					type: 'tool_search_results',
					matches: [{ op: 'util.web.visit', tool_name: 'web_visit' }]
				},
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
			message: 'Draft outreach after checking this URL.',
			tools: tools(['skill_load', 'tool_search', 'tool_schema']),
			toolExecutor,
			onDelta: async () => {},
			maxToolRounds: 1
		});

		expect(llm.streamText).toHaveBeenCalledTimes(2);
		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(streamParams[1]?.toolChoice).toBeUndefined();
		expect(streamParams[1]?.toolNames).toEqual([]);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe('I can draft from the loaded context.');
		expect(result.finalAssistantText).not.toContain('safety limit');
		expect(result.llmPasses?.[1]?.forcedNoToolSynthesis).toBe(true);
	});

	it('retries final synthesis when a no-tool pass still emits tool calls', async () => {
		let streamInvocation = 0;
		const streamParams: Array<{ toolChoice?: string; toolNames: string[] }> = [];
		const onToolCall = vi.fn();
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				streamParams.push({
					toolChoice: params.tool_choice,
					toolNames: (params.tools ?? [])
						.map((tool: ChatToolDefinition) => tool.function?.name)
						.filter((name: string | undefined): name is string => Boolean(name))
				});

				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_project',
							{
								project_id: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
								query: 'email sequence'
							},
							'search_project:email-sequence'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				if (streamInvocation === 2) {
					yield {
						type: 'text',
						content:
							'I found some good context. Let me also check the task workspace docs.'
					};
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_project',
							{
								project_id: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
								query: '3-email'
							},
							'search_project:invalid-no-tool-pass'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield {
					type: 'text',
					content:
						'I noted the instructor bios in the project context and found the email sequence task to revisit.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			return {
				tool_call_id: call.id,
				result: {
					results: [{ id: 'task_1', type: 'task', title: 'Set up email sequence' }]
				},
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
			message: 'Please note these instructor bios somewhere.',
			tools: tools(['skill_load', 'tool_search', 'tool_schema', 'search_project']),
			toolExecutor,
			onToolCall,
			onDelta: async () => {},
			maxToolRounds: 1
		});

		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(onToolCall).toHaveBeenCalledTimes(1);
		expect(onToolCall.mock.calls[0]?.[0].id).toBe('search_project:email-sequence');
		expect(streamParams[1]?.toolChoice).toBeUndefined();
		expect(streamParams[1]?.toolNames).toEqual([]);
		expect(streamParams[2]?.toolChoice).toBeUndefined();
		expect(streamParams[2]?.toolNames).toEqual([]);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe(
			'I noted the instructor bios in the project context and found the email sequence task to revisit.'
		);
		expect(result.llmPasses?.[1]?.forcedNoToolSynthesis).toBe(true);
		expect(result.llmPasses?.[1]?.suppressedNoToolSynthesisToolCalls).toBe(1);
		expect(result.llmPasses?.[2]?.forcedNoToolSynthesis).toBe(true);
	});

	it('retries final synthesis when a no-tool pass reports tool_calls without a tool payload', async () => {
		let streamInvocation = 0;
		const streamParams: Array<{ toolChoice?: string; toolNames: string[] }> = [];
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				streamParams.push({
					toolChoice: params.tool_choice,
					toolNames: (params.tools ?? [])
						.map((tool: ChatToolDefinition) => tool.function?.name)
						.filter((name: string | undefined): name is string => Boolean(name))
				});

				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_project',
							{
								project_id: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
								query: 'Tim Ferriss'
							},
							'search_project:tim'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				if (streamInvocation === 2) {
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield {
					type: 'text',
					content:
						'Here are a few interesting Tim Ferriss facts from the gathered context.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			return {
				tool_call_id: call.id,
				result: {
					results: [{ id: 'doc_1', type: 'document', title: 'Tim Ferriss notes' }]
				},
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
			message: 'Find interesting facts about Tim Ferriss.',
			tools: tools(['skill_load', 'tool_search', 'tool_schema', 'search_project']),
			toolExecutor,
			onDelta: async () => {},
			maxToolRounds: 1
		});

		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(streamParams[1]?.toolChoice).toBeUndefined();
		expect(streamParams[1]?.toolNames).toEqual([]);
		expect(streamParams[2]?.toolChoice).toBeUndefined();
		expect(streamParams[2]?.toolNames).toEqual([]);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe(
			'Here are a few interesting Tim Ferriss facts from the gathered context.'
		);
		expect(result.finalAssistantText).not.toContain('turn ended before a final response');
	});

	it('falls back to a finalization guard when no-tool synthesis keeps emitting tool calls', async () => {
		let streamInvocation = 0;
		const emittedDeltas: string[] = [];
		const streamParams: Array<{ toolChoice?: string; toolNames: string[] }> = [];
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				streamParams.push({
					toolChoice: params.tool_choice,
					toolNames: (params.tools ?? [])
						.map((tool: ChatToolDefinition) => tool.function?.name)
						.filter((name: string | undefined): name is string => Boolean(name))
				});

				yield {
					type: 'tool_call',
					tool_call: toolCall(
						'search_project',
						{
							project_id: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
							query: `round ${streamInvocation}`
						},
						`search_project:${streamInvocation}`
					)
				};
				yield { type: 'done', finished_reason: 'tool_calls' };
			})
		} as any;

		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			return {
				tool_call_id: call.id,
				result: {
					results: [{ id: 'doc_1', type: 'document', title: 'Meeting prep notes' }]
				},
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
			message: 'Prep me for the meeting.',
			tools: tools(['skill_load', 'tool_search', 'tool_schema', 'search_project']),
			toolExecutor,
			onDelta: async (delta) => {
				emittedDeltas.push(delta);
			},
			maxToolRounds: 1
		});

		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(streamParams[1]?.toolChoice).toBeUndefined();
		expect(streamParams[1]?.toolNames).toEqual([]);
		expect(streamParams[2]?.toolChoice).toBeUndefined();
		expect(streamParams[2]?.toolNames).toEqual([]);
		expect(result.finishedReason).toBe('tool_round_limit');
		expect(result.finalAssistantText).toContain('I gathered context before the turn ended.');
		expect(result.finalAssistantText).toContain('document "Meeting prep notes"');
		expect(emittedDeltas.join('')).toBe(result.finalAssistantText);
		expect(result.finalAssistantText).not.toContain('safety limit');
		expect(result.finalizationGuard).toMatchObject({
			applied: true,
			reason: 'empty_after_reads'
		});
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

	it('repairs explicit write success claims when no write tool ran', async () => {
		let streamInvocation = 0;
		let repairPassMessages: FastChatHistoryMessage[] | undefined;
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 2) {
					repairPassMessages = params.messages as FastChatHistoryMessage[];
				}

				yield {
					type: 'text',
					content: 'Done — Safe Write Target is back to todo status.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (): Promise<ChatToolResult> => {
			throw new Error('Tool executor should not run when no tool call is emitted');
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			projectId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			history: [],
			message: 'Set the task named A Safe Write Target back to todo/open.',
			tools: tools(['skill_load', 'tool_search', 'tool_schema', 'update_onto_task']),
			toolExecutor,
			onDelta: async () => {}
		});

		const repairSystemText = (repairPassMessages ?? [])
			.filter((message) => message.role === 'system')
			.map((message) => message.content)
			.join('\n');

		expect(llm.streamText).toHaveBeenCalledTimes(2);
		expect(toolExecutor).not.toHaveBeenCalled();
		expect(repairSystemText).toContain('You have not completed any write yet.');
		expect(result.finalAssistantText).toBe(
			'I was unable to complete that change because no write call ran. Nothing changed yet; I need to retry with the exact target and valid arguments.'
		);
	});

	it('pauses with a supervisor question after repeated write validation failures', async () => {
		let streamInvocation = 0;
		const emittedDeltas: string[] = [];
		const supervisorActions: string[] = [];
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				yield {
					type: 'tool_call',
					tool_call: toolCall(
						'update_onto_task',
						{ state_key: 'done' },
						`update_onto_task:missing-id-${streamInvocation}`
					)
				};
				yield { type: 'done', finished_reason: 'tool_calls' };
			})
		} as any;

		const toolExecutor = vi.fn(async (): Promise<ChatToolResult> => {
			throw new Error('Tool executor should not run for invalid calls');
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
			onDelta: async (delta) => {
				emittedDeltas.push(delta);
			},
			onSupervisorDecision: async ({ decision }) => {
				supervisorActions.push(decision.action);
			}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(2);
		expect(toolExecutor).not.toHaveBeenCalled();
		expect(result.finishedReason).toBe('supervisor_question');
		expect(result.finalAssistantText).toBe(
			'Which exact task should I use? Send the name or ID, and I will continue from here.'
		);
		expect(emittedDeltas.join('')).toContain('Which exact task should I use?');
		expect(supervisorActions).toContain('ask_user');
		const askRecord = result.supervisorDecisions?.find(
			(record) => record.decision.action === 'ask_user'
		);
		expect(askRecord?.decision).toMatchObject({
			action: 'ask_user',
			reason: 'repeated_validation_failures'
		});
		expect(result.toolExecutions).toHaveLength(2);
	});

	it('preserves a supervisor question instead of replacing it with read evidence', async () => {
		let streamInvocation = 0;
		const projectId = '4cfdbed1-840a-4fe4-9751-77c7884daa70';
		const emittedDeltas: string[] = [];
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_project',
							{ project_id: projectId, query: 'launch task' },
							'search_project:launch-task'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield {
					type: 'tool_call',
					tool_call: toolCall(
						'update_onto_task',
						{ state_key: 'done' },
						`update_onto_task:missing-id-${streamInvocation}`
					)
				};
				yield { type: 'done', finished_reason: 'tool_calls' };
			})
		} as any;
		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			if (call.function.name !== 'search_project') {
				throw new Error('Only the read call should execute');
			}
			return {
				tool_call_id: call.id,
				result: {
					results: [
						{
							id: 'task_1',
							type: 'task',
							title: 'Launch task',
							state_key: 'todo'
						}
					]
				},
				success: true
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: projectId,
			projectId,
			history: [],
			message: 'Mark the task done.',
			tools: tools([
				'skill_load',
				'tool_search',
				'tool_schema',
				'search_project',
				'update_onto_task'
			]),
			toolExecutor,
			onDelta: async (delta) => {
				emittedDeltas.push(delta);
			}
		});

		const question =
			'Which exact task should I use? Send the name or ID, and I will continue from here.';
		expect(result.finishedReason).toBe('supervisor_question');
		expect(result.finalAssistantText).toBe(question);
		expect(emittedDeltas.join('')).toContain(question);
		expect(result.finalizationGuard).toBeUndefined();
		expect(result.toolExecutions).toHaveLength(3);
	});

	it('annotates deterministic supervisor decisions with a telemetry trigger', async () => {
		let streamInvocation = 0;
		const supervisorRecords: Array<{ action: string; source?: string; trigger?: string }> = [];
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				yield {
					type: 'tool_call',
					tool_call: toolCall(
						'update_onto_task',
						{ state_key: 'done' },
						`update_onto_task:trigger-missing-id-${streamInvocation}`
					)
				};
				yield { type: 'done', finished_reason: 'tool_calls' };
			})
		} as any;

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
			toolExecutor: async () => {
				throw new Error('Tool executor should not run for invalid calls');
			},
			onDelta: async () => {},
			onSupervisorDecision: async ({ decision, source, trigger }) => {
				supervisorRecords.push({ action: decision.action, source, trigger });
			}
		});

		expect(result.finishedReason).toBe('supervisor_question');
		expect(supervisorRecords).toEqual([
			{
				action: 'ask_user',
				source: 'monitor',
				trigger: 'repeated_failures'
			}
		]);
	});

	it('injects failed-write recovery and blocks an exact repeated not_found write', async () => {
		const projectId = '4cfdbed1-840a-4fe4-9751-77c7884daa70';
		const goalId = 'ccbbc592-7138-46a5-9aa9-7d4549e1fa50';
		let streamInvocation = 0;
		const streamParams: Array<{ messages: FastChatHistoryMessage[] }> = [];
		const supervisorRecords: Array<{ action: string; reason?: string; trigger?: string }> = [];
		const badArgs = {
			task_id: goalId,
			title: 'Complete The Last Ember First Draft',
			state_key: 'in_progress'
		};
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				streamParams.push({
					messages: JSON.parse(JSON.stringify(params.messages))
				});

				if (streamInvocation <= 2) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'update_onto_task',
							badArgs,
							`update_onto_task:bad-goal-id-${streamInvocation}`
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield {
					type: 'text',
					content:
						'I was unable to update that task because the id I tried was not a task id. Nothing changed.'
				};
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			return {
				tool_call_id: call.id,
				result: null,
				success: false,
				error: 'API PATCH /api/onto/tasks/' + goalId + ' failed: Task not found'
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: projectId,
			projectId,
			history: [],
			message: 'Create a writing schedule and update the first draft task.',
			tools: tools(['skill_load', 'tool_search', 'tool_schema', 'update_onto_task']),
			supervisorContextData: {
				project: { id: projectId, name: 'The Last Ember' },
				goals: [
					{
						id: goalId,
						name: 'Complete The Last Ember Novel Development'
					}
				],
				tasks: [
					{
						id: 'c7441a46-a892-429d-ac1d-8814db45c650',
						title: 'Outline the first three chapters'
					}
				]
			},
			toolExecutor,
			onDelta: async () => {},
			onSupervisorDecision: async ({ decision, trigger }) => {
				supervisorRecords.push({
					action: decision.action,
					reason: 'reason' in decision ? decision.reason : undefined,
					trigger
				});
			}
		});

		const passTwoSystemText = (streamParams[1]?.messages ?? [])
			.filter((message) => message.role === 'system')
			.map((message) => message.content)
			.join('\n');
		const passThreeSystemText = (streamParams[2]?.messages ?? [])
			.filter((message) => message.role === 'system')
			.map((message) => message.content)
			.join('\n');

		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(passTwoSystemText).toContain('identifies that UUID as a goal');
		expect(passTwoSystemText).toContain('needs a task id');
		expect(passThreeSystemText).toContain('Supervisor blocked an exact retry');
		expect(result.toolExecutions).toHaveLength(2);
		expect(result.toolExecutions?.[1]?.result.error).toContain(
			'Supervisor blocked this exact write retry'
		);
		expect(supervisorRecords).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					action: 'inject_recovery_instruction',
					reason: 'wrong_entity_kind_failed_write',
					trigger: 'failed_write_recovery'
				}),
				expect.objectContaining({
					action: 'inject_recovery_instruction',
					reason: 'blocked_repeated_failed_write',
					trigger: 'failed_write_recovery'
				})
			])
		);
		expect(result.finalAssistantText).toContain('Nothing changed');
	});

	it('allows a corrected write after failed-write recovery', async () => {
		const projectId = '4cfdbed1-840a-4fe4-9751-77c7884daa70';
		const goalId = 'ccbbc592-7138-46a5-9aa9-7d4549e1fa50';
		const taskId = 'c7441a46-a892-429d-ac1d-8814db45c650';
		let streamInvocation = 0;
		const streamParams: Array<{ messages: FastChatHistoryMessage[] }> = [];
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				streamParams.push({
					messages: JSON.parse(JSON.stringify(params.messages))
				});

				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'update_onto_task',
							{
								task_id: goalId,
								title: 'Complete The Last Ember First Draft',
								state_key: 'in_progress'
							},
							'update_onto_task:bad-goal-id'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				if (streamInvocation === 2) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'update_onto_task',
							{
								task_id: taskId,
								title: 'Complete The Last Ember First Draft',
								state_key: 'in_progress'
							},
							'update_onto_task:corrected-task-id'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Updated the first draft task.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
			if (args.task_id === goalId) {
				return {
					tool_call_id: call.id,
					result: null,
					success: false,
					error: 'API PATCH /api/onto/tasks/' + goalId + ' failed: Task not found'
				};
			}
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
			entityId: projectId,
			projectId,
			history: [],
			message: 'Update the first draft task.',
			tools: tools(['skill_load', 'tool_search', 'tool_schema', 'update_onto_task']),
			supervisorContextData: {
				project: { id: projectId, name: 'The Last Ember' },
				goals: [{ id: goalId, name: 'Complete The Last Ember Novel Development' }],
				tasks: [{ id: taskId, title: 'Outline the first three chapters' }]
			},
			toolExecutor,
			onDelta: async () => {}
		});

		const passTwoSystemText = (streamParams[1]?.messages ?? [])
			.filter((message) => message.role === 'system')
			.map((message) => message.content)
			.join('\n');
		const allSystemText = streamParams
			.flatMap((params) => params.messages)
			.filter((message) => message.role === 'system')
			.map((message) => message.content)
			.join('\n');

		expect(toolExecutor).toHaveBeenCalledTimes(2);
		expect(toolExecutor.mock.calls[1]?.[0].function.arguments).toContain(taskId);
		expect(passTwoSystemText).toContain('identifies that UUID as a goal');
		expect(allSystemText).not.toContain('Supervisor blocked an exact retry');
		expect(result.toolExecutions?.map((execution) => execution.result.success)).toEqual([
			false,
			true
		]);
		expect(result.finalAssistantText).toBe('Updated the first draft task.');
	});

	it('redacts invalid durable text from repair replay before retry', async () => {
		let streamInvocation = 0;
		let repairPassMessages: FastChatHistoryMessage[] | undefined;
		const taskId = '881823a4-e74e-48d2-bf3e-b77db7e47b5f';
		const invalidDescription =
			'Chapter 2 notes\n<parameter name="update_strategy">replace</parameter>';
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'update_onto_task',
							{ task_id: taskId, description: invalidDescription },
							'update_onto_task:bad-durable-text'
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
							{ task_id: taskId, description: 'Chapter 2 notes' },
							'update_onto_task:corrected-durable-text'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Updated the task description.' };
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
			message: 'Update the task description.',
			tools: tools(['skill_load', 'tool_search', 'tool_schema', 'update_onto_task']),
			toolExecutor,
			onDelta: async () => {}
		});

		const serializedRepairMessages = JSON.stringify(repairPassMessages ?? []);
		expect(toolExecutor).toHaveBeenCalledTimes(1);
		expect(serializedRepairMessages).not.toContain('<parameter');
		expect(serializedRepairMessages).toContain(REDACTED_DURABLE_TEXT);
		expect(serializedRepairMessages).toContain(
			'Tool validation failed: args.description contains internal tool-call markup'
		);
		expect(result.finalAssistantText).toBe('Updated the task description.');
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

	it('forces a final no-tool synthesis pass before read-only tools hit the round cap', async () => {
		const projectId = '4cfdbed1-840a-4fe4-9751-77c7884daa70';
		let streamInvocation = 0;
		const streamParams: Array<{
			toolChoice?: string;
			toolNames: string[];
			messages: FastChatHistoryMessage[];
		}> = [];
		const supervisorRecords: Array<{ action: string; source?: string; trigger?: string }> = [];
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				streamParams.push({
					toolChoice: params.tool_choice,
					toolNames: (params.tools ?? [])
						.map((tool: ChatToolDefinition) => tool.function?.name)
						.filter((name: string | undefined): name is string => Boolean(name)),
					messages: JSON.parse(JSON.stringify(params.messages))
				});

				if (streamInvocation <= 2) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_project',
							{
								project_id: projectId,
								query: streamInvocation === 1 ? 'Rod Chamberlin' : 'Beyond Exit',
								limit: 5
							},
							`search_project:${streamInvocation}`
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Rod meeting prep answer from gathered context.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			return {
				tool_call_id: call.id,
				result: {
					results: [
						{
							id: `document-${toolExecutor.mock.calls.length}`,
							entity_type: 'document',
							title: 'Rod Chamberlin notes',
							snippet: 'Meeting prep context.'
						}
					]
				},
				success: true
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: projectId,
			projectId,
			history: [],
			message: 'Prep me for my Rod meeting.',
			tools: tools(['skill_load', 'tool_search', 'tool_schema', 'search_project']),
			toolExecutor,
			onDelta: async () => {},
			onSupervisorDecision: async ({ decision, source, trigger }) => {
				supervisorRecords.push({ action: decision.action, source, trigger });
			},
			maxToolRounds: 4
		});

		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(toolExecutor).toHaveBeenCalledTimes(2);
		expect(streamParams[2]?.toolChoice).toBeUndefined();
		expect(streamParams[2]?.toolNames).toEqual([]);
		expect(result.toolRounds).toBe(2);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe('Rod meeting prep answer from gathered context.');
		expect(result.finalAssistantText).not.toContain('safety limit');
		expect(result.llmPasses?.[2]?.forcedNoToolSynthesis).toBe(true);
		expect(supervisorRecords).toEqual([]);
	});

	it('re-injects read-loop repair instructions with escalating guidance', async () => {
		const projectId = '4cfdbed1-840a-4fe4-9751-77c7884daa70';
		let streamInvocation = 0;
		const streamParams: Array<{
			toolChoice?: string;
			messages: FastChatHistoryMessage[];
		}> = [];
		const readCalls = [
			toolCall(
				'search_project',
				{ project_id: projectId, query: 'Rod Chamberlin', limit: 5 },
				'search_project:rod'
			),
			toolCall(
				'get_onto_project_details',
				{ project_id: projectId },
				'get_onto_project_details:project-1'
			),
			toolCall(
				'search_project',
				{ project_id: projectId, query: 'Beyond Exit Planning', limit: 5 },
				'search_project:beyond-exit'
			),
			toolCall(
				'get_onto_project_details',
				{ project_id: projectId },
				'get_onto_project_details:project-2'
			),
			toolCall(
				'search_project',
				{ project_id: projectId, query: 'Rod Chamberlin compliance', limit: 5 },
				'search_project:compliance'
			),
			toolCall(
				'get_onto_project_details',
				{ project_id: projectId },
				'get_onto_project_details:project-3'
			)
		];
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				streamParams.push({
					toolChoice: params.tool_choice,
					messages: JSON.parse(JSON.stringify(params.messages))
				});

				const nextToolCall = readCalls[streamInvocation - 1];
				if (nextToolCall) {
					yield { type: 'tool_call', tool_call: nextToolCall };
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Final answer from the accumulated reads.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			if (call.function.name === 'get_onto_project_details') {
				return {
					tool_call_id: call.id,
					result: { project: { id: projectId, name: 'Rod Chamberlin prep' } },
					success: true
				};
			}
			return {
				tool_call_id: call.id,
				result: {
					results: [
						{
							id: `document-${toolExecutor.mock.calls.length}`,
							entity_type: 'document',
							title: 'Meeting prep notes',
							snippet: 'Useful context.'
						}
					]
				},
				success: true
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: projectId,
			projectId,
			history: [],
			message: 'Prep me for my Rod meeting.',
			tools: tools([
				'skill_load',
				'tool_search',
				'tool_schema',
				'search_project',
				'get_onto_project_details'
			]),
			toolExecutor,
			onDelta: async () => {},
			maxToolRounds: 10
		});

		const passFourSystemText = (streamParams[3]?.messages ?? [])
			.filter((message) => message.role === 'system')
			.map((message) => message.content)
			.join('\n');
		const passSevenSystemText = (streamParams[6]?.messages ?? [])
			.filter((message) => message.role === 'system')
			.map((message) => message.content)
			.join('\n');

		expect(llm.streamText).toHaveBeenCalledTimes(7);
		expect(passFourSystemText).toContain('Read-loop nudge');
		expect(passSevenSystemText).toContain('Read-loop nudge');
		expect(passSevenSystemText).toContain('Read-loop escalation');
		expect(passSevenSystemText).toContain('Tool rounds remaining before the safety cap: 4.');
		expect(streamParams[6]?.toolChoice).toBe('auto');
		expect(result.finalAssistantText).toBe('Final answer from the accumulated reads.');
	});

	it('keeps read-loop controls armed after a validation-only write mixed with reads', async () => {
		const projectId = '4cfdbed1-840a-4fe4-9751-77c7884daa70';
		let streamInvocation = 0;
		const streamParams: Array<{
			toolChoice?: string;
			messages: FastChatHistoryMessage[];
		}> = [];
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				streamParams.push({
					toolChoice: params.tool_choice,
					messages: JSON.parse(JSON.stringify(params.messages))
				});

				if (streamInvocation === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'update_onto_task',
							{ state_key: 'done' },
							'update_onto_task:missing-id'
						)
					};
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_project',
							{ project_id: projectId, query: 'Rod Chamberlin', limit: 5 },
							'search_project:rod'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				if (streamInvocation === 2) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'get_onto_project_details',
							{ project_id: projectId },
							'get_onto_project_details:project'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				if (streamInvocation === 3) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_project',
							{
								project_id: projectId,
								query: 'Rod Chamberlin compliance',
								limit: 5
							},
							'search_project:compliance'
						)
					};
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Final answer from the reads.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			if (call.function.name === 'update_onto_task') {
				throw new Error('Validation-only write should not execute');
			}
			if (call.function.name === 'get_onto_project_details') {
				return {
					tool_call_id: call.id,
					result: { project: { id: projectId, name: 'Rod Chamberlin prep' } },
					success: true
				};
			}
			return {
				tool_call_id: call.id,
				result: {
					results: [
						{
							id: `document-${toolExecutor.mock.calls.length}`,
							entity_type: 'document',
							title: 'Meeting prep notes',
							snippet: 'Useful context.'
						}
					]
				},
				success: true
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: projectId,
			projectId,
			history: [],
			message: 'Prep me for my Rod meeting.',
			tools: tools([
				'skill_load',
				'tool_search',
				'tool_schema',
				'search_project',
				'get_onto_project_details',
				'update_onto_task'
			]),
			toolExecutor,
			onDelta: async () => {},
			maxToolRounds: 8
		});

		const passFourSystemText = (streamParams[3]?.messages ?? [])
			.filter((message) => message.role === 'system')
			.map((message) => message.content)
			.join('\n');

		expect(toolExecutor).toHaveBeenCalledTimes(3);
		expect(passFourSystemText).toContain('Read-loop nudge');
		expect(result.finalAssistantText).toContain('Final answer from the reads.');
	});

	it('uses the context ledger to synthesize when read rounds stop adding new evidence', async () => {
		const projectId = '4cfdbed1-840a-4fe4-9751-77c7884daa70';
		const documentId = '3e9432fb-90e1-4404-a480-c73186b1337d';
		let streamInvocation = 0;
		const streamParams: Array<{
			toolChoice?: string;
			messages: FastChatHistoryMessage[];
		}> = [];
		const readCalls = [
			toolCall(
				'search_project',
				{ project_id: projectId, query: 'Rod Chamberlin', limit: 5 },
				'search_project:first'
			),
			toolCall(
				'get_onto_document_details',
				{ document_id: documentId },
				'get_onto_document_details:first'
			),
			toolCall(
				'search_all_projects',
				{ query: 'Beyond Exit Planning', limit: 5 },
				'search_all_projects:first'
			),
			toolCall(
				'get_onto_document_details',
				{ document_id: documentId },
				'get_onto_document_details:second'
			),
			toolCall(
				'get_onto_document_details',
				{ document_id: documentId },
				'get_onto_document_details:third'
			)
		];
		const llm = {
			streamText: vi.fn(async function* (params: any) {
				streamInvocation += 1;
				streamParams.push({
					toolChoice: params.tool_choice,
					messages: JSON.parse(JSON.stringify(params.messages))
				});

				const nextToolCall = readCalls[streamInvocation - 1];
				if (nextToolCall) {
					yield { type: 'tool_call', tool_call: nextToolCall };
					yield { type: 'done', finished_reason: 'tool_calls' };
					return;
				}

				yield { type: 'text', content: 'Synthesized answer from saturated context.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;

		const toolExecutor = vi.fn(async (call: ChatToolCall): Promise<ChatToolResult> => {
			if (call.function.name === 'get_onto_document_details') {
				return {
					tool_call_id: call.id,
					result: { document: { id: documentId, title: 'Rod notes' } },
					success: true
				};
			}
			return {
				tool_call_id: call.id,
				result: {
					results: [{ id: documentId, type: 'document', title: 'Rod notes' }]
				},
				success: true
			};
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'project',
			entityId: projectId,
			projectId,
			history: [],
			message: 'Prep me for my Rod meeting.',
			tools: tools([
				'skill_load',
				'tool_search',
				'tool_schema',
				'search_project',
				'search_all_projects',
				'get_onto_document_details'
			]),
			toolExecutor,
			onDelta: async () => {},
			maxToolRounds: 8
		});

		const finalPassSystemText = (streamParams[5]?.messages ?? [])
			.filter((message) => message.role === 'system')
			.map((message) => message.content)
			.join('\n');

		expect(llm.streamText).toHaveBeenCalledTimes(6);
		expect(toolExecutor).toHaveBeenCalledTimes(5);
		expect(streamParams[5]?.toolChoice).toBeUndefined();
		expect(finalPassSystemText).toContain('Context gathering: must synthesize.');
		expect(finalPassSystemText).toContain('Read-loop hard stop: synthesize now.');
		expect(result.toolRounds).toBe(5);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toBe('Synthesized answer from saturated context.');
	});

	it('stops alternating repeated tool rounds using a recent fingerprint window', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				if (streamInvocation % 2 === 1) {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'search_onto_projects',
							{ query: 'buildos' },
							`search_onto_projects:${streamInvocation}`
						)
					};
				} else {
					yield {
						type: 'tool_call',
						tool_call: toolCall(
							'list_onto_projects',
							{ limit: 5 },
							`list_onto_projects:${streamInvocation}`
						)
					};
				}
				yield { type: 'done', finished_reason: 'tool_calls' };
			})
		} as any;

		const toolExecutor = vi.fn(
			async (call: ChatToolCall): Promise<ChatToolResult> => ({
				tool_call_id: call.id,
				result: {
					projects: [{ id: 'project-1', type: 'project', name: 'BuildOS' }]
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
			message: 'Find the BuildOS project.',
			tools: tools(['search_onto_projects', 'list_onto_projects']),
			toolExecutor,
			onDelta: async () => {},
			maxToolRounds: 10,
			maxToolCalls: 20
		});

		expect(result.finishedReason).toBe('tool_repetition_limit');
		expect(result.toolRounds).toBeLessThan(10);
		expect(toolExecutor).toHaveBeenCalledTimes(7);
		expect(result.toolExecutions).toHaveLength(7);
	});

	it('surfaces a provider abort-message error as a real failure when the signal never fired (O8)', async () => {
		const llm = {
			// Real provider timeout: the message contains "aborted" but the user
			// never cancelled. Pre-fix this was swallowed as a cancellation.
			streamText: vi.fn(async function* () {
				throw new Error('The operation was aborted');
			})
		} as any;
		const toolExecutor = vi.fn(async (): Promise<ChatToolResult> => {
			throw new Error('Tool executor should not run');
		});

		await expect(
			streamFastChat({
				llm,
				userId: 'user_1',
				sessionId: 'session_1',
				contextType: 'global',
				history: [],
				message: 'What is happening with my projects?',
				tools: tools(['search_onto_projects']),
				toolExecutor,
				onDelta: async () => {}
			})
		).rejects.toThrow('The operation was aborted');
	});

	it('classifies a genuinely aborted signal as cancelled (O8)', async () => {
		const controller = new AbortController();
		controller.abort();
		const llm = {
			streamText: vi.fn(async function* () {
				yield { type: 'text', content: 'should not run' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;
		const toolExecutor = vi.fn(async (): Promise<ChatToolResult> => {
			throw new Error('Tool executor should not run');
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'Cancel this turn.',
			tools: tools(['search_onto_projects']),
			toolExecutor,
			onDelta: async () => {},
			signal: controller.signal
		});

		expect(result.cancelled).toBe(true);
		expect(result.finishedReason).toBe('cancelled');
		expect(llm.streamText).not.toHaveBeenCalled();
	});

	it('continues a length-truncated answer and assembles the full text (D8)', async () => {
		let streamInvocation = 0;
		const passMessages: FastChatHistoryMessage[][] = [];
		const llm = {
			streamText: vi.fn(async function* (params: { messages: FastChatHistoryMessage[] }) {
				streamInvocation += 1;
				passMessages.push(params.messages);
				if (streamInvocation === 1) {
					yield { type: 'text', content: 'Part one of the answer.' };
					yield { type: 'done', finished_reason: 'length' };
					return;
				}
				yield { type: 'text', content: ' Part two finishes it.' };
				yield { type: 'done', finished_reason: 'stop' };
			})
		} as any;
		const toolExecutor = vi.fn(async (): Promise<ChatToolResult> => {
			throw new Error('Tool executor should not run');
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'Give me the long answer.',
			tools: tools(['search_onto_projects']),
			toolExecutor,
			onDelta: async () => {}
		});

		expect(llm.streamText).toHaveBeenCalledTimes(2);
		expect(result.finishedReason).toBe('stop');
		expect(result.finalAssistantText).toContain('Part one of the answer.');
		expect(result.finalAssistantText).toContain('Part two finishes it.');

		const firstCallArgs = (llm.streamText as any).mock.calls[0][0];
		expect(firstCallArgs.maxTokens).toBeGreaterThanOrEqual(8000);

		const secondPassSystem = (passMessages[1] ?? [])
			.filter((message) => message.role === 'system')
			.map((message) => message.content)
			.join('\n');
		expect(secondPassSystem).toContain('cut off');
	});

	it('flags the turn as truncated when length continuations are exhausted (D8)', async () => {
		let streamInvocation = 0;
		const llm = {
			streamText: vi.fn(async function* () {
				streamInvocation += 1;
				yield { type: 'text', content: `chunk ${streamInvocation}.` };
				yield { type: 'done', finished_reason: 'length' };
			})
		} as any;
		const toolExecutor = vi.fn(async (): Promise<ChatToolResult> => {
			throw new Error('Tool executor should not run');
		});

		const result = await streamFastChat({
			llm,
			userId: 'user_1',
			sessionId: 'session_1',
			contextType: 'global',
			history: [],
			message: 'Keep going forever.',
			tools: tools(['search_onto_projects']),
			toolExecutor,
			onDelta: async () => {}
		});

		// 1 initial pass + MAX_LENGTH_CONTINUATIONS (default 2) continuations.
		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(result.finishedReason).toBe('length');
		expect(result.finalAssistantText).toContain('chunk 1.');
	});
});
