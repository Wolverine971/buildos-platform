// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import { streamFastChat } from './stream-orchestrator';

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
		expect(result.toolExecutions).toHaveLength(4);
		expect(llm.streamText).toHaveBeenCalledTimes(3);
		expect(toolExecutor).toHaveBeenCalledTimes(4);
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
		// Repeated per-round lead-ins should not flood the UI.
		expect(result.assistantText).toContain('Round 1 lead-in.');
		expect(result.assistantText).not.toContain('Round 2 lead-in.');
		expect(result.assistantText).not.toContain('Round 3 lead-in.');
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
		expect(toolExecutor).toHaveBeenCalledTimes(4);
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

		expect(result.finishedReason).toBe('stop');
		expect(result.assistantText).toContain('organized 2 unlinked document');
		expect(movedIds).toEqual(['doc-a', 'doc-b']);
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
});
