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

	beforeEach(() => {
		// Setup mock tool executor
		mockToolExecutor = vi.fn();

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
				name: 'list_tasks',
				description: 'List tasks in a project',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' }
					}
				}
			},
			{
				name: 'create_task',
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
				name: 'search_projects',
				description: 'Search for projects',
				parameters: {
					type: 'object',
					properties: {
						query: { type: 'string' }
					}
				}
			}
		];

		service = new ToolExecutionService(mockToolExecutor);
	});

	describe('executeTool', () => {
		it('should execute a tool successfully', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_123',
				name: 'list_tasks',
				arguments: { project_id: 'proj_123' }
			};

			const expectedResult = {
				tasks: [
					{ id: 'task_1', title: 'Task 1' },
					{ id: 'task_2', title: 'Task 2' }
				]
			};

			mockToolExecutor.mockResolvedValueOnce(expectedResult);

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions);

			expect(result.success).toBe(true);
			expect(result.data).toEqual(expectedResult);
			expect(result.toolName).toBe('list_tasks');
			expect(result.toolCallId).toBe('call_123');
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'list_tasks',
				{ project_id: 'proj_123' },
				mockContext
			);
		});

		it('should handle tool execution errors', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_456',
				name: 'create_task',
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
				name: 'create_task',
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
				name: 'list_tasks',
				arguments: { project_id: 'proj_123' }
			};

			const resultWithEntities = {
				tasks: [{ id: 'task_1' }],
				_entities_accessed: ['proj_123', 'task_1']
			};

			mockToolExecutor.mockResolvedValueOnce(resultWithEntities);

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions);

			expect(result.success).toBe(true);
			expect(result.entitiesAccessed).toEqual(['proj_123', 'task_1']);
		});

		it('should handle null/undefined arguments', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_null',
				name: 'search_projects',
				arguments: null as any
			};

			mockToolExecutor.mockResolvedValueOnce({ projects: [] });

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith('search_projects', {}, mockContext);
		});
	});

	describe('executeMultipleTools', () => {
		it('should execute multiple tools in sequence', async () => {
			const toolCalls: ChatToolCall[] = [
				{
					id: 'call_1',
					name: 'list_tasks',
					arguments: { project_id: 'proj_123' }
				},
				{
					id: 'call_2',
					name: 'create_task',
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
			expect(results[0].toolName).toBe('list_tasks');
			expect(results[1].success).toBe(true);
			expect(results[1].toolName).toBe('create_task');
		});

		it('should continue execution even if one tool fails', async () => {
			const toolCalls: ChatToolCall[] = [
				{
					id: 'call_1',
					name: 'list_tasks',
					arguments: { project_id: 'proj_123' }
				},
				{
					id: 'call_2',
					name: 'unknown_tool',
					arguments: {}
				},
				{
					id: 'call_3',
					name: 'search_projects',
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
				name: 'create_task',
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
				name: 'create_task',
				arguments: { description: 'No title' }
			};

			const validation = service.validateToolCall(toolCall, mockToolDefinitions);

			expect(validation.isValid).toBe(false);
			expect(validation.errors[0]).toContain('Missing required parameter: title');
		});

		it('should validate parameter types', () => {
			const toolCall: ChatToolCall = {
				id: 'call_type',
				name: 'list_tasks',
				arguments: { project_id: 123 } // Should be string
			};

			const validation = service.validateToolCall(toolCall, mockToolDefinitions);

			expect(validation.isValid).toBe(false);
			expect(validation.errors[0]).toContain('Invalid type for parameter project_id');
		});
	});

	describe('getToolDefinition', () => {
		it('should return the correct tool definition', () => {
			const definition = service.getToolDefinition('list_tasks', mockToolDefinitions);

			expect(definition).toBeDefined();
			expect(definition?.name).toBe('list_tasks');
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
				toolName: 'list_tasks',
				toolCallId: 'call_123'
			};

			const formatted = service.formatToolResult(result);

			expect(formatted).toContain('list_tasks');
			expect(formatted).toContain('tasks');
			expect(formatted).toContain('Task');
		});

		it('should format error result', () => {
			const result: ToolExecutionResult = {
				success: false,
				error: 'Database connection failed',
				toolName: 'create_task',
				toolCallId: 'call_456'
			};

			const formatted = service.formatToolResult(result);

			expect(formatted).toContain('Error');
			expect(formatted).toContain('create_task');
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
				name: 'list_tasks',
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
