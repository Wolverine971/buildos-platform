// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import { streamFastChat } from './stream-orchestrator';
import type { FastChatHistoryMessage } from './types';

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
		expect(result.toolExecutions).toHaveLength(3);
		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(toolExecutor).toHaveBeenCalledTimes(3);
		expect(result.assistantText).toContain('same tool sequence kept repeating');
		expect(deltas.at(-1)).toContain('same tool sequence kept repeating');
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
						unlinked: []
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
		expect(result.assistantText).toContain('Round 2 lead-in.');
		expect(result.assistantText).toContain('Round 3 lead-in.');
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
		expect(toolExecutor).toHaveBeenCalledTimes(3);
		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(result.assistantText).toContain('same tool sequence kept repeating');
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
		expect(toolExecutor).toHaveBeenCalledTimes(5);
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
		expect(toolExecutor).not.toHaveBeenCalled();
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
		expect(goodToolPayload.error).toContain(
			'skipped because another tool call in the same response failed validation'
		);
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
