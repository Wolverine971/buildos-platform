// apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.test.ts
/**
 * Test Suite for ToolExecutionService
 *
 * Tests the tool execution logic for the agentic chat system.
 * Validates tool invocation, result handling, and error management.
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md}
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ToolExecutionService } from './tool-execution-service';
import type { ServiceContext, ToolExecutionResult } from '../shared/types';
import { ToolExecutionError } from '../shared/types';
import type { ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';

describe('ToolExecutionService', () => {
	let service: ToolExecutionService;
	let mockToolExecutor: Mock;
	let mockContext: ServiceContext;
	let mockToolDefinitions: ChatToolDefinition[];
	let telemetryHook: Mock;

	beforeEach(() => {
		// Setup mock tool executor
		mockToolExecutor = vi.fn();
		telemetryHook = vi.fn();

		// Setup mock context
		mockContext = {
			sessionId: 'session_123',
			userId: 'user_123',
			contextType: 'project',
			entityId: 'proj_123',
			plannerAgentId: 'planner_123',
			conversationHistory: []
		};

		// Setup mock tool definitions
		mockToolDefinitions = [
			{
				name: 'list_onto_tasks',
				description: 'List tasks in a project',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' }
					}
				}
			},
			{
				name: 'create_onto_task',
				description: 'Create a new task',
				parameters: {
					type: 'object',
					properties: {
						title: { type: 'string' },
						description: { type: 'string' }
					},
					required: ['title']
				}
			},
			{
				name: 'list_onto_projects',
				description: 'Search for projects',
				parameters: {
					type: 'object',
					properties: {
						query: { type: 'string' }
					}
				}
			}
		];

		service = new ToolExecutionService(mockToolExecutor, telemetryHook);
	});

	describe('executeTool', () => {
		it('should execute a tool successfully', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_123',
				name: 'list_onto_tasks',
				arguments: { project_id: 'proj_123' }
			};

			const expectedResult = {
				tasks: [
					{ id: 'task_1', title: 'Task 1' },
					{ id: 'task_2', title: 'Task 2' }
				]
			};

			mockToolExecutor.mockResolvedValueOnce({ data: expectedResult });

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions);

			expect(result.success).toBe(true);
			expect(result.data).toEqual(expectedResult);
			expect(result.toolName).toBe('list_onto_tasks');
			expect(result.toolCallId).toBe('call_123');
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'list_onto_tasks',
				{ project_id: 'proj_123' },
				mockContext
			);
		});

		it('should coerce raw string arguments for web_search into query', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_web_search',
				name: 'web_search',
				arguments: 'openai latest news'
			};
			const webSearchDefinition: ChatToolDefinition = {
				name: 'web_search',
				description: 'Web search',
				parameters: {
					type: 'object',
					properties: {
						query: { type: 'string' }
					},
					required: ['query']
				}
			};

			mockToolExecutor.mockResolvedValueOnce({ results: [] });

			const result = await service.executeTool(toolCall, mockContext, [webSearchDefinition]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'web_search',
				{ query: 'openai latest news' },
				mockContext
			);
		});

		it('should coerce JSON string arguments for web_visit into url', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_web_visit',
				name: 'web_visit',
				arguments: '"https://example.com"'
			};
			const webVisitDefinition: ChatToolDefinition = {
				name: 'web_visit',
				description: 'Web visit',
				parameters: {
					type: 'object',
					properties: {
						url: { type: 'string' }
					},
					required: ['url']
				}
			};

			mockToolExecutor.mockResolvedValueOnce({ ok: true });

			const result = await service.executeTool(toolCall, mockContext, [webVisitDefinition]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'web_visit',
				{ url: 'https://example.com' },
				mockContext
			);
		});

		it('should alias query to search when tool schema requires search', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_search_alias',
				name: 'search_onto_tasks',
				arguments: { query: 'launch checklist' }
			};
			const searchToolDefinition: ChatToolDefinition = {
				name: 'search_onto_tasks',
				description: 'Search ontology tasks',
				parameters: {
					type: 'object',
					properties: {
						search: { type: 'string' },
						project_id: { type: 'string' }
					},
					required: ['search']
				}
			};

			mockToolExecutor.mockResolvedValueOnce({ tasks: [] });

			const result = await service.executeTool(toolCall, mockContext, [searchToolDefinition]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'search_onto_tasks',
				{ query: 'launch checklist', search: 'launch checklist' },
				mockContext
			);
		});

		it('should alias search to query when tool schema requires query', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_query_alias',
				name: 'web_search',
				arguments: { search: 'buildos docs' }
			};
			const webSearchDefinition: ChatToolDefinition = {
				name: 'web_search',
				description: 'Web search',
				parameters: {
					type: 'object',
					properties: {
						query: { type: 'string' }
					},
					required: ['query']
				}
			};

			mockToolExecutor.mockResolvedValueOnce({ results: [] });

			const result = await service.executeTool(toolCall, mockContext, [webSearchDefinition]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'web_search',
				{ search: 'buildos docs', query: 'buildos docs' },
				mockContext
			);
		});

		it('should alias id to document_id for move_document_in_tree', async () => {
			const documentId = '3f4c1f6f-77c6-45ab-9159-686dc2d92bc5';
			const toolCall: ChatToolCall = {
				id: 'call_move_doc_alias',
				name: 'move_document_in_tree',
				arguments: {
					project_id: 'proj_123',
					id: documentId,
					new_position: 2
				}
			};
			const moveDefinition: ChatToolDefinition = {
				name: 'move_document_in_tree',
				description: 'Move document in tree',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						document_id: { type: 'string' },
						new_position: { type: 'number' }
					},
					required: ['project_id', 'document_id']
				}
			};

			mockToolExecutor.mockResolvedValueOnce({ ok: true });

			const result = await service.executeTool(toolCall, mockContext, [moveDefinition]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'move_document_in_tree',
				expect.objectContaining({
					project_id: 'proj_123',
					document_id: documentId,
					new_position: 2
				}),
				mockContext
			);
		});

		it('should alias nested document.id to document_id for delete_onto_document', async () => {
			const documentId = '7aa6df76-dd9d-4824-96ed-d6441a8d1644';
			const toolCall: ChatToolCall = {
				id: 'call_delete_doc_alias',
				name: 'delete_onto_document',
				arguments: {
					document: { id: documentId }
				}
			};
			const deleteDefinition: ChatToolDefinition = {
				name: 'delete_onto_document',
				description: 'Delete ontology document',
				parameters: {
					type: 'object',
					properties: {
						document_id: { type: 'string' }
					},
					required: ['document_id']
				}
			};

			mockToolExecutor.mockResolvedValueOnce({ ok: true });

			const result = await service.executeTool(toolCall, mockContext, [deleteDefinition]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'delete_onto_document',
				expect.objectContaining({ document_id: documentId }),
				mockContext
			);
		});

		it('should default include_documents=true for get_document_tree', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_get_tree_defaults',
				name: 'get_document_tree',
				arguments: {
					project_id: 'proj_123'
				}
			};
			const treeDefinition: ChatToolDefinition = {
				name: 'get_document_tree',
				description: 'Get document tree',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						include_documents: { type: 'boolean' },
						include_content: { type: 'boolean' }
					},
					required: ['project_id']
				}
			};

			mockToolExecutor.mockResolvedValueOnce({ data: { structure: { root: [] } } });

			const result = await service.executeTool(toolCall, mockContext, [treeDefinition]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'get_document_tree',
				expect.objectContaining({
					project_id: 'proj_123',
					include_documents: true,
					include_content: false
				}),
				mockContext
			);
		});

		it('should mark tool_batch as failed when any exec op fails', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_tool_batch_partial_failure',
				name: 'tool_batch',
				arguments: {
					ops: [
						{ type: 'exec', op: 'util.web.search', args: { query: 'buildos' } },
						{ type: 'exec', op: 'util.web.visit', args: {} }
					]
				}
			};

			mockToolExecutor.mockResolvedValueOnce({ results: [] });

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions);

			expect(result.success).toBe(false);
			expect(result.error).toContain('tool_batch completed with 1 failed operation');
			expect(result.data).toMatchObject({
				ok: false,
				summary: {
					total_ops: 2,
					succeeded_ops: 1,
					failed_ops: 1
				}
			});
			expect(mockToolExecutor).toHaveBeenCalledTimes(1);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'web_search',
				expect.objectContaining({ query: 'buildos' }),
				mockContext
			);
		});

		it('should trim whitespace in tool names', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_trim',
				name: '  list_onto_tasks  ',
				arguments: { project_id: 'proj_123' }
			};

			mockToolExecutor.mockResolvedValueOnce({ tasks: [] });

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions);

			expect(result.success).toBe(true);
			expect(result.toolName).toBe('list_onto_tasks');
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'list_onto_tasks',
				{ project_id: 'proj_123' },
				mockContext
			);
		});

		it('should handle tool execution errors', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_456',
				name: 'create_onto_task',
				arguments: { title: 'New Task' }
			};

			mockToolExecutor.mockRejectedValueOnce(new Error('Database error'));

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions);

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
			expect(result.error).toContain('Database error');
		});

		it('should validate required parameters', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_789',
				name: 'create_onto_task',
				arguments: { description: 'Missing title' } // Missing required 'title'
			};

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Missing required parameter');
			expect(result.error).toContain('title');
		});

		it('should handle unknown tools', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_unknown',
				name: 'unknown_tool',
				arguments: {}
			};

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Unknown tool');
			expect(result.error).toContain('unknown_tool');
		});

		it('should track entities accessed during execution', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_entities',
				name: 'list_onto_tasks',
				arguments: { project_id: 'proj_123' }
			};

			const resultWithEntities = {
				tasks: [{ id: 'task_1' }],
				_entities_accessed: ['proj_123', 'task_1']
			};

			mockToolExecutor.mockResolvedValueOnce({ data: resultWithEntities });

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions);

			expect(result.success).toBe(true);
			expect(result.entitiesAccessed).toEqual(['proj_123', 'task_1']);
		});

		it('should handle null/undefined arguments', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_null',
				name: 'list_onto_projects',
				arguments: null as any
			};

			mockToolExecutor.mockResolvedValueOnce({ projects: [] });

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith('list_onto_projects', {}, mockContext);
		});

		it('should route virtual tools through provided handler', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_virtual',
				name: 'agent_create_plan',
				arguments: { objective: 'Do something' }
			};

			const virtualHandler = vi.fn().mockResolvedValue({
				success: true,
				data: { status: 'drafted' }
			} satisfies Partial<ToolExecutionResult>);

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions, {
				virtualHandlers: {
					agent_create_plan: virtualHandler
				}
			});

			expect(result.success).toBe(true);
			expect(result.toolName).toBe('agent_create_plan');
			expect(mockToolExecutor).not.toHaveBeenCalled();
			expect(virtualHandler).toHaveBeenCalledWith({
				toolCall,
				toolName: 'agent_create_plan',
				args: { objective: 'Do something' },
				context: mockContext,
				availableTools: mockToolDefinitions
			});
		});

		it('should default document title when blank', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_doc',
				name: 'create_onto_document',
				arguments: {
					project_id: 'proj_123',
					title: '   ',
					description: 'Short summary',
					type_key: ' '
				}
			};

			const toolDefs = [
				...mockToolDefinitions,
				{
					name: 'create_onto_document',
					description: 'Create a document',
					parameters: {
						type: 'object',
						properties: {
							project_id: { type: 'string' },
							title: { type: 'string' },
							type_key: { type: 'string' }
						},
						required: ['project_id', 'title', 'type_key']
					}
				}
			];

			mockToolExecutor.mockResolvedValueOnce({ document: { id: 'doc-1' } });

			const result = await service.executeTool(toolCall, mockContext, toolDefs);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'create_onto_document',
				{
					project_id: 'proj_123',
					title: 'Untitled Document',
					description: 'Short summary',
					type_key: 'document.default'
				},
				mockContext
			);
		});

		it('should use name as title for documents', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_doc_name',
				name: 'create_onto_document',
				arguments: {
					project_id: 'proj_123',
					name: 'Design Brief',
					description: 'Brief for the new design',
					type_key: 'document.context.brief'
				}
			};

			const toolDefs = [
				...mockToolDefinitions,
				{
					name: 'create_onto_document',
					description: 'Create a document',
					parameters: {
						type: 'object',
						properties: {
							project_id: { type: 'string' },
							title: { type: 'string' },
							type_key: { type: 'string' }
						},
						required: ['project_id', 'title', 'type_key']
					}
				}
			];

			mockToolExecutor.mockResolvedValueOnce({ document: { id: 'doc-2' } });

			const result = await service.executeTool(toolCall, mockContext, toolDefs);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'create_onto_document',
				expect.objectContaining({
					project_id: 'proj_123',
					title: 'Design Brief',
					description: 'Brief for the new design',
					type_key: 'document.context.brief'
				}),
				mockContext
			);
		});

		it('should use nested document content when provided', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_doc_nested',
				name: 'create_onto_document',
				arguments: {
					project_id: 'proj_123',
					document: {
						title: 'Research Notes',
						description: 'Key findings from discovery',
						content: '# Findings\n\n- Item one'
					},
					type_key: 'document.knowledge.research'
				}
			};

			const toolDefs = [
				...mockToolDefinitions,
				{
					name: 'create_onto_document',
					description: 'Create a document',
					parameters: {
						type: 'object',
						properties: {
							project_id: { type: 'string' },
							title: { type: 'string' },
							type_key: { type: 'string' }
						},
						required: ['project_id', 'title', 'type_key']
					}
				}
			];

			mockToolExecutor.mockResolvedValueOnce({ document: { id: 'doc-3' } });

			const result = await service.executeTool(toolCall, mockContext, toolDefs);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'create_onto_document',
				expect.objectContaining({
					project_id: 'proj_123',
					title: 'Research Notes',
					description: 'Key findings from discovery',
					type_key: 'document.knowledge.research',
					content: '# Findings\n\n- Item one'
				}),
				mockContext
			);
		});

		it('should parse double-encoded JSON arguments with newlines', async () => {
			const rawArgs = JSON.stringify(
				JSON.stringify({
					project_id: 'proj_123',
					title: 'Double Encoded',
					description: 'Encoded document',
					type_key: 'document.spec.technical',
					content: 'Hello\nWorld'
				})
			);

			const toolCall: ChatToolCall = {
				id: 'call_doc_double',
				name: 'create_onto_document',
				arguments: rawArgs
			};

			const toolDefs = [
				...mockToolDefinitions,
				{
					name: 'create_onto_document',
					description: 'Create a document',
					parameters: {
						type: 'object',
						properties: {
							project_id: { type: 'string' },
							title: { type: 'string' },
							type_key: { type: 'string' }
						},
						required: ['project_id', 'title', 'type_key']
					}
				}
			];

			mockToolExecutor.mockResolvedValueOnce({ document: { id: 'doc-4' } });

			const result = await service.executeTool(toolCall, mockContext, toolDefs);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'create_onto_document',
				expect.objectContaining({
					project_id: 'proj_123',
					title: 'Double Encoded',
					description: 'Encoded document',
					type_key: 'document.spec.technical',
					content: 'Hello\nWorld'
				}),
				mockContext
			);
		});

		it('should emit telemetry data for each execution', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_telemetry',
				name: 'list_onto_tasks',
				arguments: { project_id: 'proj_123' }
			};

			mockToolExecutor.mockResolvedValueOnce({ tasks: [] });

			await service.executeTool(toolCall, mockContext, mockToolDefinitions);

			expect(telemetryHook).toHaveBeenCalledTimes(1);
			const [resultArg, telemetryArg] = telemetryHook.mock.calls[0];
			expect(resultArg.toolName).toBe('list_onto_tasks');
			expect(telemetryArg.toolName).toBe('list_onto_tasks');
			expect(typeof telemetryArg.durationMs).toBe('number');
			expect(telemetryArg.virtual).toBe(false);
		});
	});

	describe('executeMultipleTools', () => {
		it('should execute multiple tools in sequence', async () => {
			const toolCalls: ChatToolCall[] = [
				{
					id: 'call_1',
					name: 'list_onto_tasks',
					arguments: { project_id: 'proj_123' }
				},
				{
					id: 'call_2',
					name: 'create_onto_task',
					arguments: { title: 'New Task', description: 'Description' }
				}
			];

			mockToolExecutor
				.mockResolvedValueOnce({ tasks: [] })
				.mockResolvedValueOnce({ task_id: 'task_new' });

			const results = await service.executeMultipleTools(
				toolCalls,
				mockContext,
				mockToolDefinitions
			);

			expect(results).toHaveLength(2);
			expect(results[0].success).toBe(true);
			expect(results[0].toolName).toBe('list_onto_tasks');
			expect(results[1].success).toBe(true);
			expect(results[1].toolName).toBe('create_onto_task');
		});

		it('should continue execution even if one tool fails', async () => {
			const toolCalls: ChatToolCall[] = [
				{
					id: 'call_1',
					name: 'list_onto_tasks',
					arguments: { project_id: 'proj_123' }
				},
				{
					id: 'call_2',
					name: 'unknown_tool',
					arguments: {}
				},
				{
					id: 'call_3',
					name: 'list_onto_projects',
					arguments: { query: 'test' }
				}
			];

			mockToolExecutor
				.mockResolvedValueOnce({ tasks: [] })
				.mockResolvedValueOnce({ projects: [] });

			const results = await service.executeMultipleTools(
				toolCalls,
				mockContext,
				mockToolDefinitions
			);

			expect(results).toHaveLength(3);
			expect(results[0].success).toBe(true);
			expect(results[1].success).toBe(false); // Unknown tool
			expect(results[2].success).toBe(true);
		});

		it('should handle empty tool calls array', async () => {
			const results = await service.executeMultipleTools(
				[],
				mockContext,
				mockToolDefinitions
			);

			expect(results).toEqual([]);
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});
	});

	describe('validateToolCall', () => {
		it('should validate a correct tool call', () => {
			const toolCall: ChatToolCall = {
				id: 'call_valid',
				name: 'create_onto_task',
				arguments: { title: 'Task', description: 'Desc' }
			};

			const validation = service.validateToolCall(toolCall, mockToolDefinitions);

			expect(validation.isValid).toBe(true);
			expect(validation.errors).toEqual([]);
		});

		it('should detect unknown tools', () => {
			const toolCall: ChatToolCall = {
				id: 'call_unknown',
				name: 'unknown_tool',
				arguments: {}
			};

			const validation = service.validateToolCall(toolCall, mockToolDefinitions);

			expect(validation.isValid).toBe(false);
			expect(validation.errors).toContain('Unknown tool: unknown_tool');
		});

		it('should detect missing required parameters', () => {
			const toolCall: ChatToolCall = {
				id: 'call_missing',
				name: 'create_onto_task',
				arguments: { description: 'No title' }
			};

			const validation = service.validateToolCall(toolCall, mockToolDefinitions);

			expect(validation.isValid).toBe(false);
			expect(validation.errors[0]).toContain('Missing required parameter: title');
		});

		it('should enforce minItems when provided', () => {
			const toolDefs: ChatToolDefinition[] = [
				{
					name: 'reorganize_onto_project_graph',
					description: 'Reorganize project graph',
					parameters: {
						type: 'object',
						properties: {
							project_id: { type: 'string' },
							nodes: { type: 'array', minItems: 1 }
						},
						required: ['project_id', 'nodes']
					}
				}
			];

			const toolCall: ChatToolCall = {
				id: 'call_reorg',
				name: 'reorganize_onto_project_graph',
				arguments: { project_id: 'proj_123', nodes: [] }
			};

			const validation = service.validateToolCall(toolCall, toolDefs);

			expect(validation.isValid).toBe(false);
			expect(validation.errors[0]).toContain('expected at least 1 items');
		});

		it('should validate UUIDs for reorganize_onto_project_graph nodes', () => {
			const toolDefs: ChatToolDefinition[] = [
				{
					name: 'reorganize_onto_project_graph',
					description: 'Reorganize project graph',
					parameters: {
						type: 'object',
						properties: {
							project_id: { type: 'string' },
							nodes: { type: 'array', minItems: 1 }
						},
						required: ['project_id', 'nodes']
					}
				}
			];

			const toolCall: ChatToolCall = {
				id: 'call_reorg_invalid',
				name: 'reorganize_onto_project_graph',
				arguments: {
					project_id: '153dea7b-1fc7-4f68-b014-cd2b00c572ec',
					nodes: [
						{
							id: 'business-plan-folder',
							kind: 'document',
							connections: [{ kind: 'document', id: 'marketing-folder' }]
						}
					]
				}
			};

			const validation = service.validateToolCall(toolCall, toolDefs);

			expect(validation.isValid).toBe(false);
			expect(validation.errors.some((error) => error.includes('expected UUID'))).toBe(true);
			expect(
				validation.errors.some((error) => error.includes('reorganize_onto_project_graph'))
			).toBe(true);
		});

		it('should reject document nodes for reorganize_onto_project_graph', () => {
			const toolDefs: ChatToolDefinition[] = [
				{
					name: 'reorganize_onto_project_graph',
					description: 'Reorganize project graph',
					parameters: {
						type: 'object',
						properties: {
							project_id: { type: 'string' },
							nodes: { type: 'array', minItems: 1 }
						},
						required: ['project_id', 'nodes']
					}
				}
			];

			const toolCall: ChatToolCall = {
				id: 'call_reorg_document_node',
				name: 'reorganize_onto_project_graph',
				arguments: {
					project_id: '153dea7b-1fc7-4f68-b014-cd2b00c572ec',
					nodes: [
						{
							id: 'dc6c356e-9fe3-4784-b571-d0c1a26a95d2',
							kind: 'document',
							connections: []
						}
					]
				}
			};

			const validation = service.validateToolCall(toolCall, toolDefs);

			expect(validation.isValid).toBe(false);
			expect(
				validation.errors.some((error) => error.includes('Document nodes are not allowed'))
			).toBe(true);
		});

		it('should reject document connections for reorganize_onto_project_graph', () => {
			const toolDefs: ChatToolDefinition[] = [
				{
					name: 'reorganize_onto_project_graph',
					description: 'Reorganize project graph',
					parameters: {
						type: 'object',
						properties: {
							project_id: { type: 'string' },
							nodes: { type: 'array', minItems: 1 }
						},
						required: ['project_id', 'nodes']
					}
				}
			];

			const toolCall: ChatToolCall = {
				id: 'call_reorg_document_conn',
				name: 'reorganize_onto_project_graph',
				arguments: {
					project_id: '153dea7b-1fc7-4f68-b014-cd2b00c572ec',
					nodes: [
						{
							id: '1d2d5d90-3a0a-4a2c-8f68-2e7154392d75',
							kind: 'task',
							connections: [
								{
									kind: 'document',
									id: 'dc6c356e-9fe3-4784-b571-d0c1a26a95d2'
								}
							]
						}
					]
				}
			};

			const validation = service.validateToolCall(toolCall, toolDefs);

			expect(validation.isValid).toBe(false);
			expect(
				validation.errors.some((error) =>
					error.includes('Document connections are not allowed')
				)
			).toBe(true);
		});

		it('should validate parameter types', () => {
			const toolCall: ChatToolCall = {
				id: 'call_type',
				name: 'list_onto_tasks',
				arguments: { project_id: 123 } // Should be string
			};

			const validation = service.validateToolCall(toolCall, mockToolDefinitions);

			expect(validation.isValid).toBe(false);
			expect(validation.errors[0]).toContain('Invalid type for parameter project_id');
		});
	});

	describe('getToolDefinition', () => {
		it('should return the correct tool definition', () => {
			const definition = service.getToolDefinition('list_onto_tasks', mockToolDefinitions);

			expect(definition).toBeDefined();
			expect(definition?.name).toBe('list_onto_tasks');
			expect(definition?.description).toContain('List tasks');
		});

		it('should return undefined for unknown tools', () => {
			const definition = service.getToolDefinition('unknown_tool', mockToolDefinitions);

			expect(definition).toBeUndefined();
		});
	});

	describe('formatToolResult', () => {
		it('should format successful result', () => {
			const result: ToolExecutionResult = {
				success: true,
				data: { tasks: [{ id: '1', title: 'Task' }] },
				toolName: 'list_onto_tasks',
				toolCallId: 'call_123'
			};

			const formatted = service.formatToolResult(result);

			expect(formatted).toContain('list_onto_tasks');
			expect(formatted).toContain('tasks');
			expect(formatted).toContain('Task');
		});

		it('should format error result', () => {
			const result: ToolExecutionResult = {
				success: false,
				error: 'Database connection failed',
				toolName: 'create_onto_task',
				toolCallId: 'call_456'
			};

			const formatted = service.formatToolResult(result);

			expect(formatted).toContain('Error');
			expect(formatted).toContain('create_onto_task');
			expect(formatted).toContain('Database connection failed');
		});

		it('should truncate large results', () => {
			const largeData = {
				items: Array.from({ length: 1000 }, (_, i) => ({
					id: i,
					data: 'x'.repeat(1000)
				}))
			};

			const result: ToolExecutionResult = {
				success: true,
				data: largeData,
				toolName: 'list_items',
				toolCallId: 'call_large'
			};

			const formatted = service.formatToolResult(result);

			expect(formatted.length).toBeLessThan(5000);
			expect(formatted).toContain('...');
		});
	});

	describe('extractEntitiesFromResult', () => {
		it('should extract entity IDs from tool results', () => {
			const result = {
				project: { id: 'proj_123', name: 'Project' },
				tasks: [
					{ id: 'task_1', title: 'Task 1' },
					{ id: 'task_2', title: 'Task 2' }
				],
				user_id: 'user_456'
			};

			const entities = service.extractEntitiesFromResult(result);

			expect(entities).toContain('proj_123');
			expect(entities).toContain('task_1');
			expect(entities).toContain('task_2');
			expect(entities).toContain('user_456');
		});

		it('should handle nested objects', () => {
			const result = {
				project: {
					id: 'proj_1',
					owner: {
						id: 'user_1',
						profile: {
							id: 'profile_1'
						}
					}
				}
			};

			const entities = service.extractEntitiesFromResult(result);

			expect(entities).toContain('proj_1');
			expect(entities).toContain('user_1');
			expect(entities).toContain('profile_1');
		});

		it('should deduplicate entity IDs', () => {
			const result = {
				items: [
					{ id: 'item_1', related_id: 'item_1' },
					{ id: 'item_1', parent_id: 'item_1' }
				]
			};

			const entities = service.extractEntitiesFromResult(result);

			expect(entities).toEqual(['item_1']);
		});
	});

	describe('Error Handling', () => {
		it('should throw ToolExecutionError for critical failures', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_critical',
				name: 'critical_tool',
				arguments: {}
			};

			// Add critical_tool to definitions
			const criticalToolDef: ChatToolDefinition = {
				name: 'critical_tool',
				description: 'Critical operation',
				parameters: {}
			};

			mockToolExecutor.mockImplementationOnce(() => {
				throw new Error('Critical system failure');
			});

			await expect(
				service.executeTool(toolCall, mockContext, [
					...mockToolDefinitions,
					criticalToolDef
				])
			).resolves.toMatchObject({
				success: false,
				error: expect.stringContaining('Critical system failure')
			});
		});

		it('should handle timeout scenarios', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_timeout',
				name: 'list_onto_tasks',
				arguments: { project_id: 'proj_123' }
			};

			// Simulate timeout
			mockToolExecutor.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						setTimeout(() => resolve({ tasks: [] }), 35000);
					})
			);

			const resultPromise = service.executeTool(
				toolCall,
				mockContext,
				mockToolDefinitions,
				{ timeout: 100 } // 100ms timeout
			);

			await expect(resultPromise).resolves.toMatchObject({
				success: false,
				error: expect.stringContaining('timeout')
			});
		});
	});
});
