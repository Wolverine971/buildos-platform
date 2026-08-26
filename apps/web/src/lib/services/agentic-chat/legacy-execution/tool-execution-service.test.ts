// apps/web/src/lib/services/agentic-chat/legacy-execution/tool-execution-service.test.ts
/**
 * Test Suite for ToolExecutionService
 *
 * Tests the tool execution logic for the agentic chat system.
 * Validates tool invocation, result handling, and error management.
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md}
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ToolExecutionService, type VirtualToolHandler } from './tool-execution-service';
import type { ServiceContext, ToolExecutionResult } from '../shared/types';
import type { ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';

const contextLike = (context: ServiceContext) => expect.objectContaining(context);

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
				contextLike(mockContext)
			);
		});

		it('propagates canonical token counts from executor responses', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_tokens',
				name: 'list_onto_tasks',
				arguments: { project_id: 'proj_123' }
			};

			mockToolExecutor.mockResolvedValueOnce({
				data: { tasks: [] },
				tokens_consumed: 17
			});

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions);

			expect(result.success).toBe(true);
			expect(result.tokensUsed).toBe(17);
		});

		it('rejects a different UUID project_id when the turn is project-scoped', async () => {
			const scopedProjectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const otherProjectId = '972064c0-c2aa-4c74-a735-313802ffd456';
			const toolCall: ChatToolCall = {
				id: 'call_cross_project',
				name: 'list_onto_tasks',
				arguments: { project_id: otherProjectId }
			};
			const scopedContext: ServiceContext = {
				...mockContext,
				contextScope: { projectId: scopedProjectId }
			};

			const result = await service.executeTool(toolCall, scopedContext, mockToolDefinitions);

			expect(result).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining('does not match the current project focus')
			});
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('rejects an invalid explicit project_id instead of replacing it with scoped context', async () => {
			const scopedProjectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const toolCall: ChatToolCall = {
				id: 'call_invalid_scoped_project',
				name: 'list_onto_tasks',
				arguments: { project_id: 'not-a-uuid' }
			};
			const scopedContext: ServiceContext = {
				...mockContext,
				contextScope: { projectId: scopedProjectId }
			};

			const result = await service.executeTool(toolCall, scopedContext, mockToolDefinitions);

			expect(result).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining('project_id must be a valid UUID')
			});
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('rejects a known task_id from a different project when project_id is context-injected', async () => {
			const scopedProjectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const otherProjectId = '972064c0-c2aa-4c74-a735-313802ffd456';
			const taskId = 'f914f9dc-a7a7-4f9e-9a3e-477c6975f259';
			const updateTaskDefinition: ChatToolDefinition = {
				name: 'update_onto_task',
				description: 'Update task',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						task_id: { type: 'string' },
						title: { type: 'string' }
					},
					required: ['task_id']
				}
			};
			const scopedContext: ServiceContext = {
				...mockContext,
				contextScope: { projectId: scopedProjectId },
				ontologyContext: {
					type: 'project',
					entities: {
						tasks: [
							{
								id: taskId,
								title: 'Task from another project',
								project_id: otherProjectId
							}
						]
					},
					metadata: {},
					scope: { projectId: otherProjectId }
				} as any
			};
			const toolCall: ChatToolCall = {
				id: 'call_cross_project_task',
				name: 'update_onto_task',
				arguments: { task_id: taskId, title: 'Rename task' }
			};

			const result = await service.executeTool(toolCall, scopedContext, [
				updateTaskDefinition
			]);

			expect(result).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining('task_id belongs to a different project')
			});
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('rejects an unknown task_id mutation in a project-scoped turn', async () => {
			const scopedProjectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const taskId = 'f914f9dc-a7a7-4f9e-9a3e-477c6975f259';
			const updateTaskDefinition: ChatToolDefinition = {
				name: 'update_onto_task',
				description: 'Update task',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						task_id: { type: 'string' },
						title: { type: 'string' }
					},
					required: ['task_id']
				}
			};
			const scopedContext: ServiceContext = {
				...mockContext,
				contextScope: { projectId: scopedProjectId },
				ontologyContext: {
					type: 'project',
					entities: { tasks: [] },
					metadata: {},
					scope: { projectId: scopedProjectId }
				} as any
			};
			const toolCall: ChatToolCall = {
				id: 'call_unknown_project_task',
				name: 'update_onto_task',
				arguments: { task_id: taskId, title: 'Rename task' }
			};

			const result = await service.executeTool(toolCall, scopedContext, [
				updateTaskDefinition
			]);

			expect(result).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining('task_id is not known to belong')
			});
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('allows a task to reference a goal created earlier in the same turn', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const goalId = 'b4724346-2b1b-4e71-a9c8-1e25f1aa9b8e';
			const taskId = 'e1038564-6e3e-4e18-aa0a-a460fd2e3f80';
			const scopedContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				ontologyContext: {
					type: 'project',
					entities: { goals: [], tasks: [] },
					metadata: {},
					scope: { projectId }
				} as any
			};
			const createGoalDefinition: ChatToolDefinition = {
				name: 'create_onto_goal',
				description: 'Create goal',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						name: { type: 'string' }
					},
					required: ['project_id', 'name']
				}
			};
			const createTaskDefinition: ChatToolDefinition = {
				name: 'create_onto_task',
				description: 'Create task',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						goal_id: { type: 'string' }
					},
					required: ['project_id', 'title']
				}
			};
			mockToolExecutor
				.mockResolvedValueOnce({
					data: { goal: { id: goalId, project_id: projectId, name: 'Validate demand' } }
				})
				.mockResolvedValueOnce({
					data: {
						task: { id: taskId, project_id: projectId, title: 'Interview parents' }
					}
				});

			const goalResult = await service.executeTool(
				{
					id: 'call_create_goal_same_turn',
					name: 'create_onto_goal',
					arguments: { project_id: projectId, name: 'Validate demand' }
				},
				scopedContext,
				[createGoalDefinition]
			);
			const taskResult = await service.executeTool(
				{
					id: 'call_create_task_for_same_turn_goal',
					name: 'create_onto_task',
					arguments: {
						project_id: projectId,
						title: 'Interview parents',
						goal_id: goalId
					}
				},
				scopedContext,
				[createTaskDefinition]
			);

			expect(goalResult.success).toBe(true);
			expect(taskResult.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledTimes(2);
			expect(mockToolExecutor.mock.calls[1]?.[1]).toMatchObject({ goal_id: goalId });
		});

		it('registers every child returned by project instantiation for later same-turn writes', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const otherProjectId = '972064c0-c2aa-4c74-a735-313802ffd456';
			const goalId = 'b4724346-2b1b-4e71-a9c8-1e25f1aa9b8e';
			const inconsistentGoalId = '0848bf8c-b7f4-405d-9d7c-f4d29679943e';
			const taskId = 'e1038564-6e3e-4e18-aa0a-a460fd2e3f80';
			const createProjectDefinition: ChatToolDefinition = {
				name: 'create_onto_project',
				description: 'Create project graph',
				parameters: {
					type: 'object',
					properties: {
						project: { type: 'object' },
						entities: { type: 'array', items: { type: 'object' } },
						relationships: { type: 'array', items: { type: 'array' } }
					},
					required: ['project', 'entities', 'relationships']
				}
			};
			const createTaskDefinition: ChatToolDefinition = {
				name: 'create_onto_task',
				description: 'Create task',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						goal_id: { type: 'string' }
					},
					required: ['project_id', 'title']
				}
			};
			const projectContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				ontologyContext: {
					type: 'project',
					entities: { goals: [], tasks: [] },
					metadata: {},
					scope: { projectId }
				} as any
			};
			mockToolExecutor
				.mockResolvedValueOnce({
					data: {
						project_id: projectId,
						counts: { goals: 1 },
						created_entities: [
							{ kind: 'project', id: projectId, project_id: projectId },
							{
								kind: 'goal',
								id: goalId,
								project_id: projectId,
								temp_id: 'launch-goal'
							},
							{
								kind: 'goal',
								id: inconsistentGoalId,
								project_id: otherProjectId,
								temp_id: 'wrong-project-goal'
							}
						]
					}
				})
				.mockResolvedValueOnce({
					data: { task: { id: taskId, project_id: projectId } }
				});

			const projectResult = await service.executeTool(
				{
					id: 'call_create_project_with_children',
					name: 'create_onto_project',
					arguments: {
						project: {
							name: 'Launch',
							type_key: 'project.business.initiative'
						},
						entities: [
							{ temp_id: 'launch-goal', kind: 'goal', name: 'Validate demand' }
						],
						relationships: []
					}
				},
				mockContext,
				[createProjectDefinition]
			);
			const taskResult = await service.executeTool(
				{
					id: 'call_create_task_for_instantiated_goal',
					name: 'create_onto_task',
					arguments: {
						project_id: projectId,
						title: 'Interview customers',
						goal_id: goalId
					}
				},
				projectContext,
				[createTaskDefinition]
			);
			const inconsistentTaskResult = await service.executeTool(
				{
					id: 'call_create_task_for_inconsistent_instantiated_goal',
					name: 'create_onto_task',
					arguments: {
						project_id: projectId,
						title: 'Should not execute',
						goal_id: inconsistentGoalId
					}
				},
				projectContext,
				[createTaskDefinition]
			);

			expect(projectResult.success).toBe(true);
			expect(taskResult.success).toBe(true);
			expect(inconsistentTaskResult).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining('goal_id is not known to belong')
			});
			expect(mockToolExecutor).toHaveBeenCalledTimes(2);
		});

		it('does not register a created entity when its project ownership is inconsistent', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const otherProjectId = '972064c0-c2aa-4c74-a735-313802ffd456';
			const goalId = 'b4724346-2b1b-4e71-a9c8-1e25f1aa9b8e';
			const scopedContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				ontologyContext: {
					type: 'project',
					entities: { goals: [], tasks: [] },
					metadata: {},
					scope: { projectId }
				} as any
			};
			const createGoalDefinition: ChatToolDefinition = {
				name: 'create_onto_goal',
				description: 'Create goal',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						name: { type: 'string' }
					},
					required: ['project_id', 'name']
				}
			};
			const createTaskDefinition: ChatToolDefinition = {
				name: 'create_onto_task',
				description: 'Create task',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						goal_id: { type: 'string' }
					},
					required: ['project_id', 'title']
				}
			};
			mockToolExecutor.mockResolvedValueOnce({
				data: { goal: { id: goalId, project_id: otherProjectId } }
			});

			const goalResult = await service.executeTool(
				{
					id: 'call_create_inconsistent_goal',
					name: 'create_onto_goal',
					arguments: { project_id: projectId, name: 'Validate demand' }
				},
				scopedContext,
				[createGoalDefinition]
			);
			const taskResult = await service.executeTool(
				{
					id: 'call_task_with_inconsistent_goal',
					name: 'create_onto_task',
					arguments: {
						project_id: projectId,
						title: 'Interview parents',
						goal_id: goalId
					}
				},
				scopedContext,
				[createTaskDefinition]
			);

			expect(goalResult.success).toBe(true);
			expect(taskResult).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining('goal_id is not known to belong')
			});
			expect(mockToolExecutor).toHaveBeenCalledTimes(1);
		});

		it.each([
			{
				kind: 'task',
				createTool: 'create_onto_task',
				updateTool: 'update_onto_task',
				resultKey: 'task',
				idArg: 'task_id',
				createArgs: { title: 'First task' },
				updateArgs: { title: 'Renamed task' }
			},
			{
				kind: 'goal',
				createTool: 'create_onto_goal',
				updateTool: 'update_onto_goal',
				resultKey: 'goal',
				idArg: 'goal_id',
				createArgs: { name: 'First goal' },
				updateArgs: { name: 'Renamed goal' }
			},
			{
				kind: 'plan',
				createTool: 'create_onto_plan',
				updateTool: 'update_onto_plan',
				resultKey: 'plan',
				idArg: 'plan_id',
				createArgs: { name: 'First plan' },
				updateArgs: { name: 'Renamed plan' }
			},
			{
				kind: 'document',
				createTool: 'create_onto_document',
				updateTool: 'update_onto_document',
				resultKey: 'document',
				idArg: 'document_id',
				createArgs: {
					title: 'First document',
					description: 'Initial document description',
					type_key: 'document.default'
				},
				updateArgs: { title: 'Renamed document' }
			},
			{
				kind: 'milestone',
				createTool: 'create_onto_milestone',
				updateTool: 'update_onto_milestone',
				resultKey: 'milestone',
				idArg: 'milestone_id',
				createArgs: { title: 'First milestone' },
				updateArgs: { title: 'Renamed milestone' }
			},
			{
				kind: 'risk',
				createTool: 'create_onto_risk',
				updateTool: 'update_onto_risk',
				resultKey: 'risk',
				idArg: 'risk_id',
				createArgs: { title: 'First risk' },
				updateArgs: { title: 'Renamed risk' }
			}
		])('registers a newly created $kind for later same-turn mutations', async (scenario) => {
			const projectId = '153dea7b-1fc7-4f77-a79f-d0ef7f40124a';
			const entityId = '3f7bd6d2-0a9a-447e-ab3b-f48518f40f04';
			const scopedContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				ontologyContext: {
					type: 'project',
					entities: {},
					metadata: {},
					scope: { projectId }
				} as any
			};
			const createDefinition: ChatToolDefinition = {
				name: scenario.createTool,
				description: `Create ${scenario.kind}`,
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						name: { type: 'string' },
						description: { type: 'string' },
						type_key: { type: 'string' }
					},
					required: ['project_id']
				}
			};
			const updateDefinition: ChatToolDefinition = {
				name: scenario.updateTool,
				description: `Update ${scenario.kind}`,
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						[scenario.idArg]: { type: 'string' },
						title: { type: 'string' },
						name: { type: 'string' }
					},
					required: [scenario.idArg]
				}
			};
			mockToolExecutor
				.mockResolvedValueOnce({
					data: {
						[scenario.resultKey]: { id: entityId, project_id: projectId }
					}
				})
				.mockResolvedValueOnce({
					data: {
						[scenario.resultKey]: { id: entityId, project_id: projectId }
					}
				});

			const createResult = await service.executeTool(
				{
					id: `call_create_same_turn_${scenario.kind}`,
					name: scenario.createTool,
					arguments: { project_id: projectId, ...scenario.createArgs }
				},
				scopedContext,
				[createDefinition]
			);
			const updateResult = await service.executeTool(
				{
					id: `call_update_same_turn_${scenario.kind}`,
					name: scenario.updateTool,
					arguments: {
						project_id: projectId,
						[scenario.idArg]: entityId,
						...scenario.updateArgs
					}
				},
				scopedContext,
				[updateDefinition]
			);

			expect(createResult.success).toBe(true);
			expect(updateResult.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledTimes(2);
		});

		it('registers a document created by create_task_document', async () => {
			const projectId = '153dea7b-1fc7-4f77-a79f-d0ef7f40124a';
			const taskId = 'f914f9dc-a7a7-4f9e-9a3e-477c6975f259';
			const documentId = 'c16bbfc1-c8f6-433f-9d84-f7ed17861757';
			const scopedContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				ontologyContext: {
					type: 'project',
					entities: {
						tasks: [{ id: taskId, project_id: projectId }],
						documents: []
					},
					metadata: {},
					scope: { projectId }
				} as any
			};
			const createTaskDocumentDefinition: ChatToolDefinition = {
				name: 'create_task_document',
				description: 'Create and link a task document',
				parameters: {
					type: 'object',
					properties: {
						task_id: { type: 'string' },
						title: { type: 'string' },
						description: { type: 'string' },
						type_key: { type: 'string' }
					},
					required: ['task_id']
				}
			};
			const updateDocumentDefinition: ChatToolDefinition = {
				name: 'update_onto_document',
				description: 'Update document',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						document_id: { type: 'string' },
						title: { type: 'string' }
					},
					required: ['document_id']
				}
			};
			mockToolExecutor
				.mockResolvedValueOnce({
					data: {
						document: {
							id: documentId,
							project_id: projectId,
							title: 'Launch brief'
						}
					}
				})
				.mockResolvedValueOnce({
					data: { document: { id: documentId, project_id: projectId } }
				});

			const createResult = await service.executeTool(
				{
					id: 'call_create_task_document_same_turn',
					name: 'create_task_document',
					arguments: {
						task_id: taskId,
						title: 'Launch brief',
						description: 'Brief linked to the launch task.',
						type_key: 'document.default'
					}
				},
				scopedContext,
				[createTaskDocumentDefinition]
			);
			const updateResult = await service.executeTool(
				{
					id: 'call_update_task_document_same_turn',
					name: 'update_onto_document',
					arguments: {
						project_id: projectId,
						document_id: documentId,
						title: 'Updated launch brief'
					}
				},
				scopedContext,
				[updateDocumentDefinition]
			);

			expect(createResult.success).toBe(true);
			expect(updateResult.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledTimes(2);
		});

		it('allows a goal loaded in the current project to be mutated later in the same turn', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const goalId = 'b4724346-2b1b-4e71-a9c8-1e25f1aa9b8e';
			const taskId = 'e1038564-6e3e-4e18-aa0a-a460fd2e3f80';
			const scopedContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				ontologyContext: {
					type: 'project',
					entities: { goals: [], tasks: [] },
					metadata: {},
					scope: { projectId }
				} as any
			};
			const loadGoalDefinition: ChatToolDefinition = {
				name: 'get_onto_goal_details',
				description: 'Load goal',
				parameters: {
					type: 'object',
					properties: { goal_id: { type: 'string' } },
					required: ['goal_id']
				}
			};
			const createTaskDefinition: ChatToolDefinition = {
				name: 'create_onto_task',
				description: 'Create task',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						goal_id: { type: 'string' }
					},
					required: ['project_id', 'title']
				}
			};
			mockToolExecutor
				.mockResolvedValueOnce({
					data: { goal: { id: goalId, project_id: projectId, name: 'Validate demand' } }
				})
				.mockResolvedValueOnce({
					data: { task: { id: taskId, project_id: projectId } }
				});

			const loadResult = await service.executeTool(
				{
					id: 'call_load_goal_scope',
					name: 'get_onto_goal_details',
					arguments: { goal_id: goalId }
				},
				scopedContext,
				[loadGoalDefinition]
			);
			const createResult = await service.executeTool(
				{
					id: 'call_create_for_loaded_goal',
					name: 'create_onto_task',
					arguments: { title: 'Interview parents', goal_id: goalId }
				},
				scopedContext,
				[createTaskDefinition]
			);

			expect(loadResult.success).toBe(true);
			expect(createResult.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledTimes(2);
		});

		it('rejects a current-project mutation after loading the entity from another project', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const otherProjectId = '972064c0-c2aa-4c74-a735-313802ffd456';
			const goalId = 'b4724346-2b1b-4e71-a9c8-1e25f1aa9b8e';
			const scopedContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				ontologyContext: {
					type: 'project',
					entities: { goals: [], tasks: [] },
					metadata: {},
					scope: { projectId }
				} as any
			};
			const loadGoalDefinition: ChatToolDefinition = {
				name: 'get_onto_goal_details',
				description: 'Load goal',
				parameters: {
					type: 'object',
					properties: { goal_id: { type: 'string' } },
					required: ['goal_id']
				}
			};
			const createTaskDefinition: ChatToolDefinition = {
				name: 'create_onto_task',
				description: 'Create task',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						goal_id: { type: 'string' }
					},
					required: ['project_id', 'title']
				}
			};
			mockToolExecutor.mockResolvedValueOnce({
				data: { goal: { id: goalId, project_id: otherProjectId } }
			});

			await service.executeTool(
				{
					id: 'call_load_cross_project_goal',
					name: 'get_onto_goal_details',
					arguments: { goal_id: goalId }
				},
				scopedContext,
				[loadGoalDefinition]
			);
			const createResult = await service.executeTool(
				{
					id: 'call_create_for_cross_project_goal',
					name: 'create_onto_task',
					arguments: { title: 'Interview parents', goal_id: goalId }
				},
				scopedContext,
				[createTaskDefinition]
			);

			expect(createResult).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining('goal_id belongs to a different project')
			});
			expect(mockToolExecutor).toHaveBeenCalledTimes(1);
		});

		it('allows a typed search result to resolve entity ownership for a later mutation', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const goalId = 'b4724346-2b1b-4e71-a9c8-1e25f1aa9b8e';
			const taskId = 'e1038564-6e3e-4e18-aa0a-a460fd2e3f80';
			const scopedContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				ontologyContext: {
					type: 'project',
					entities: { goals: [], tasks: [] },
					metadata: {},
					scope: { projectId }
				} as any
			};
			const searchDefinition: ChatToolDefinition = {
				name: 'search_ontology',
				description: 'Search ontology',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						query: { type: 'string' }
					},
					required: ['query']
				}
			};
			const createTaskDefinition: ChatToolDefinition = {
				name: 'create_onto_task',
				description: 'Create task',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						goal_id: { type: 'string' }
					},
					required: ['project_id', 'title']
				}
			};
			mockToolExecutor
				.mockResolvedValueOnce({
					data: {
						results: [{ type: 'goal', id: goalId, project_id: projectId }]
					}
				})
				.mockResolvedValueOnce({
					data: { task: { id: taskId, project_id: projectId } }
				});

			await service.executeTool(
				{
					id: 'call_resolve_goal_scope',
					name: 'search_ontology',
					arguments: { query: 'validate demand' }
				},
				scopedContext,
				[searchDefinition]
			);
			const createResult = await service.executeTool(
				{
					id: 'call_create_for_resolved_goal',
					name: 'create_onto_task',
					arguments: { title: 'Interview parents', goal_id: goalId }
				},
				scopedContext,
				[createTaskDefinition]
			);

			expect(createResult.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledTimes(2);
		});

		it('allows an exact calendar event loaded in this project to be deleted in the same turn', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const eventId = '288c1d31-4d47-40f7-a50a-e116cccedc62';
			const scopedContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				ontologyContext: {
					type: 'project',
					entities: {},
					metadata: {},
					scope: { projectId }
				} as any
			};
			const getEventDefinition: ChatToolDefinition = {
				name: 'get_calendar_event_details',
				description: 'Get an exact calendar event',
				parameters: {
					type: 'object',
					properties: {
						onto_event_id: { type: 'string' },
						project_id: { type: 'string' }
					},
					required: ['onto_event_id']
				}
			};
			const deleteEventDefinition: ChatToolDefinition = {
				name: 'delete_calendar_event',
				description: 'Delete an exact calendar event',
				parameters: {
					type: 'object',
					properties: {
						onto_event_id: { type: 'string' },
						project_id: { type: 'string' }
					},
					required: ['onto_event_id']
				}
			};
			mockToolExecutor
				.mockResolvedValueOnce({
					data: {
						event: {
							id: eventId,
							project_id: projectId,
							title: 'Precision Hunter Prep'
						}
					}
				})
				.mockResolvedValueOnce({
					data: { source: 'ontology', event: { id: eventId, project_id: projectId } }
				});

			const readResult = await service.executeTool(
				{
					id: 'call_load_event_scope',
					name: 'get_calendar_event_details',
					arguments: { onto_event_id: eventId, project_id: projectId }
				},
				scopedContext,
				[getEventDefinition]
			);
			const deleteResult = await service.executeTool(
				{
					id: 'call_delete_loaded_event',
					name: 'delete_calendar_event',
					arguments: { onto_event_id: eventId, project_id: projectId }
				},
				scopedContext,
				[deleteEventDefinition]
			);

			expect(readResult.success).toBe(true);
			expect(deleteResult.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledTimes(2);
		});

		it('blocks an unknown ontology calendar event delete in a project-scoped turn', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const eventId = '288c1d31-4d47-40f7-a50a-e116cccedc62';
			const scopedContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				ontologyContext: {
					type: 'project',
					entities: {},
					metadata: {},
					scope: { projectId }
				} as any
			};
			const definition: ChatToolDefinition = {
				name: 'delete_calendar_event',
				description: 'Delete an exact calendar event',
				parameters: {
					type: 'object',
					properties: {
						onto_event_id: { type: 'string' },
						project_id: { type: 'string' }
					},
					required: ['onto_event_id']
				}
			};

			const result = await service.executeTool(
				{
					id: 'call_delete_unknown_event',
					name: 'delete_calendar_event',
					arguments: { onto_event_id: eventId, project_id: projectId }
				},
				scopedContext,
				[definition]
			);

			expect(result).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining('onto_event_id is not known to belong')
			});
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('registers entities returned by a full project-detail load', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const goalId = 'b4724346-2b1b-4e71-a9c8-1e25f1aa9b8e';
			const taskId = 'e1038564-6e3e-4e18-aa0a-a460fd2e3f80';
			const scopedContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				ontologyContext: {
					type: 'project',
					entities: { goals: [], tasks: [] },
					metadata: {},
					scope: { projectId }
				} as any
			};
			const projectDetailsDefinition: ChatToolDefinition = {
				name: 'get_onto_project_details',
				description: 'Load project details',
				parameters: {
					type: 'object',
					properties: { project_id: { type: 'string' } },
					required: ['project_id']
				}
			};
			const createTaskDefinition: ChatToolDefinition = {
				name: 'create_onto_task',
				description: 'Create task',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						goal_id: { type: 'string' }
					},
					required: ['project_id', 'title']
				}
			};
			mockToolExecutor
				.mockResolvedValueOnce({
					data: {
						project: { id: projectId },
						goals: [{ id: goalId, project_id: projectId }]
					}
				})
				.mockResolvedValueOnce({
					data: { task: { id: taskId, project_id: projectId } }
				});

			await service.executeTool(
				{
					id: 'call_load_project_entities',
					name: 'get_onto_project_details',
					arguments: { project_id: projectId }
				},
				scopedContext,
				[projectDetailsDefinition]
			);
			const createResult = await service.executeTool(
				{
					id: 'call_create_for_project_loaded_goal',
					name: 'create_onto_task',
					arguments: { title: 'Interview parents', goal_id: goalId }
				},
				scopedContext,
				[createTaskDefinition]
			);

			expect(createResult.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledTimes(2);
		});

		it('fails closed when same-turn read results disagree about entity ownership', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const otherProjectId = '972064c0-c2aa-4c74-a735-313802ffd456';
			const goalId = 'b4724346-2b1b-4e71-a9c8-1e25f1aa9b8e';
			const scopedContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				ontologyContext: {
					type: 'project',
					entities: { goals: [], tasks: [] },
					metadata: {},
					scope: { projectId }
				} as any
			};
			const loadGoalDefinition: ChatToolDefinition = {
				name: 'get_onto_goal_details',
				description: 'Load goal',
				parameters: {
					type: 'object',
					properties: { goal_id: { type: 'string' } },
					required: ['goal_id']
				}
			};
			const createTaskDefinition: ChatToolDefinition = {
				name: 'create_onto_task',
				description: 'Create task',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						goal_id: { type: 'string' }
					},
					required: ['project_id', 'title']
				}
			};
			mockToolExecutor
				.mockResolvedValueOnce({
					data: { goal: { id: goalId, project_id: projectId } }
				})
				.mockResolvedValueOnce({
					data: { goal: { id: goalId, project_id: otherProjectId } }
				});

			for (const [index, expectedProjectId] of [projectId, otherProjectId].entries()) {
				const loadResult = await service.executeTool(
					{
						id: `call_conflicting_goal_load_${index}`,
						name: 'get_onto_goal_details',
						arguments: { goal_id: goalId }
					},
					scopedContext,
					[loadGoalDefinition]
				);
				expect(loadResult.data).toMatchObject({
					goal: { project_id: expectedProjectId }
				});
			}
			const createResult = await service.executeTool(
				{
					id: 'call_create_after_conflicting_loads',
					name: 'create_onto_task',
					arguments: { title: 'Interview parents', goal_id: goalId }
				},
				scopedContext,
				[createTaskDefinition]
			);

			expect(createResult).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining('goal_id is not known to belong')
			});
			expect(mockToolExecutor).toHaveBeenCalledTimes(2);
		});

		it('tombstones a deleted entity instead of falling back to stale turn-start context', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const goalId = 'b4724346-2b1b-4e71-a9c8-1e25f1aa9b8e';
			const scopedContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				ontologyContext: {
					type: 'project',
					entities: { goals: [{ id: goalId, project_id: projectId }], tasks: [] },
					metadata: {},
					scope: { projectId }
				} as any
			};
			const deleteGoalDefinition: ChatToolDefinition = {
				name: 'delete_onto_goal',
				description: 'Delete goal',
				parameters: {
					type: 'object',
					properties: { goal_id: { type: 'string' } },
					required: ['goal_id']
				}
			};
			const createTaskDefinition: ChatToolDefinition = {
				name: 'create_onto_task',
				description: 'Create task',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						goal_id: { type: 'string' }
					},
					required: ['project_id', 'title']
				}
			};
			mockToolExecutor.mockResolvedValueOnce({ data: { success: true } });

			const deleteResult = await service.executeTool(
				{
					id: 'call_delete_goal_scope',
					name: 'delete_onto_goal',
					arguments: { goal_id: goalId }
				},
				scopedContext,
				[deleteGoalDefinition]
			);
			const createResult = await service.executeTool(
				{
					id: 'call_create_for_deleted_goal',
					name: 'create_onto_task',
					arguments: { title: 'Interview parents', goal_id: goalId }
				},
				scopedContext,
				[createTaskDefinition]
			);

			expect(deleteResult.success).toBe(true);
			expect(createResult).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining('goal_id is not known to belong')
			});
			expect(mockToolExecutor).toHaveBeenCalledTimes(1);
		});

		it('allows a known task_id from the current project after injecting project_id', async () => {
			const scopedProjectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const taskId = 'f914f9dc-a7a7-4f9e-9a3e-477c6975f259';
			const updateTaskDefinition: ChatToolDefinition = {
				name: 'update_onto_task',
				description: 'Update task',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						task_id: { type: 'string' },
						title: { type: 'string' }
					},
					required: ['task_id']
				}
			};
			const scopedContext: ServiceContext = {
				...mockContext,
				contextScope: { projectId: scopedProjectId },
				ontologyContext: {
					type: 'project',
					entities: {
						tasks: [
							{
								id: taskId,
								title: 'Task from current project',
								project_id: scopedProjectId
							}
						]
					},
					metadata: {},
					scope: { projectId: scopedProjectId }
				} as any
			};
			const toolCall: ChatToolCall = {
				id: 'call_current_project_task',
				name: 'update_onto_task',
				arguments: { task_id: taskId, title: 'Rename task' }
			};

			mockToolExecutor.mockResolvedValueOnce({ data: { task: { id: taskId } } });

			const result = await service.executeTool(toolCall, scopedContext, [
				updateTaskDefinition
			]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'update_onto_task',
				expect.objectContaining({
					project_id: scopedProjectId,
					task_id: taskId,
					title: 'Rename task'
				}),
				contextLike(scopedContext)
			);
		});

		it('allows the dedicated task move to name another destination project', async () => {
			const scopedProjectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const destinationProjectId = '972064c0-c2aa-4c74-a735-313802ffd456';
			const taskId = 'f914f9dc-a7a7-4f9e-9a3e-477c6975f259';
			const moveTaskDefinition: ChatToolDefinition = {
				name: 'move_onto_task',
				description: 'Move task between projects',
				parameters: {
					type: 'object',
					properties: {
						task_id: { type: 'string' },
						expected_source_project_id: { type: 'string' },
						destination_project_id: { type: 'string' }
					},
					required: ['task_id', 'expected_source_project_id', 'destination_project_id']
				}
			};
			const updateTaskDefinition: ChatToolDefinition = {
				name: 'update_onto_task',
				description: 'Update task',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						task_id: { type: 'string' },
						title: { type: 'string' }
					},
					required: ['task_id', 'title']
				}
			};
			const scopedContext: ServiceContext = {
				...mockContext,
				contextScope: { projectId: scopedProjectId },
				ontologyContext: {
					type: 'project',
					entities: {
						tasks: [{ id: taskId, title: 'Move me', project_id: scopedProjectId }]
					},
					metadata: {},
					scope: { projectId: scopedProjectId }
				} as any
			};
			const toolCall: ChatToolCall = {
				id: 'call_move_task',
				name: 'move_onto_task',
				arguments: {
					task_id: taskId,
					expected_source_project_id: scopedProjectId,
					destination_project_id: destinationProjectId
				}
			};

			mockToolExecutor
				.mockResolvedValueOnce({ data: { status: 'moved' } })
				.mockResolvedValueOnce({
					data: { task: { id: taskId, project_id: destinationProjectId } }
				});
			const result = await service.executeTool(toolCall, scopedContext, [moveTaskDefinition]);
			const staleSourceUpdate = await service.executeTool(
				{
					id: 'call_update_moved_task_from_source',
					name: 'update_onto_task',
					arguments: { task_id: taskId, title: 'Stale source update' }
				},
				scopedContext,
				[updateTaskDefinition]
			);
			const destinationContext: ServiceContext = {
				...scopedContext,
				entityId: destinationProjectId,
				contextScope: { projectId: destinationProjectId },
				ontologyContext: {
					type: 'project',
					entities: { tasks: [] },
					metadata: {},
					scope: { projectId: destinationProjectId }
				} as any
			};
			const destinationUpdate = await service.executeTool(
				{
					id: 'call_update_moved_task_from_destination',
					name: 'update_onto_task',
					arguments: { task_id: taskId, title: 'Destination update' }
				},
				destinationContext,
				[updateTaskDefinition]
			);

			expect(result.success).toBe(true);
			expect(staleSourceUpdate).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining('task_id belongs to a different project')
			});
			expect(destinationUpdate.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'move_onto_task',
				toolCall.arguments,
				contextLike(scopedContext)
			);
			expect(mockToolExecutor).toHaveBeenCalledTimes(2);
		});

		it('requires the dedicated task move source to match project focus', async () => {
			const scopedProjectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const otherProjectId = '972064c0-c2aa-4c74-a735-313802ffd456';
			const destinationProjectId = '31021625-1377-4715-9fb4-f93102974628';
			const taskId = 'f914f9dc-a7a7-4f9e-9a3e-477c6975f259';
			const definition: ChatToolDefinition = {
				name: 'move_onto_task',
				description: 'Move task between projects',
				parameters: {
					type: 'object',
					properties: {
						task_id: { type: 'string' },
						expected_source_project_id: { type: 'string' },
						destination_project_id: { type: 'string' }
					},
					required: ['task_id', 'expected_source_project_id', 'destination_project_id']
				}
			};
			const result = await service.executeTool(
				{
					id: 'call_bad_move_source',
					name: 'move_onto_task',
					arguments: {
						task_id: taskId,
						expected_source_project_id: otherProjectId,
						destination_project_id: destinationProjectId
					}
				},
				{ ...mockContext, contextScope: { projectId: scopedProjectId } },
				[definition]
			);

			expect(result).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining('must match the current project focus')
			});
			expect(mockToolExecutor).not.toHaveBeenCalled();
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
				contextLike(mockContext)
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
				contextLike(mockContext)
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
				contextLike(mockContext)
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
				contextLike(mockContext)
			);
		});

		it('should alias q to query for list_calendar_events', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_calendar_query_alias',
				name: 'list_calendar_events',
				arguments: { q: 'roadmap' }
			};
			const listCalendarDefinition: ChatToolDefinition = {
				name: 'list_calendar_events',
				description: 'List calendar events',
				parameters: {
					type: 'object',
					properties: {
						query: { type: 'string' }
					},
					required: ['query']
				}
			};

			mockToolExecutor.mockResolvedValueOnce({ events: [] });

			const result = await service.executeTool(toolCall, mockContext, [
				listCalendarDefinition
			]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'list_calendar_events',
				{ q: 'roadmap', query: 'roadmap' },
				contextLike(mockContext)
			);
		});

		it('should validate gateway tools against canonical gateway schemas', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_gateway_missing_op',
				name: 'tool_schema',
				arguments: { include_examples: true }
			};
			const permissiveSuppliedDefinition: ChatToolDefinition = {
				name: 'tool_schema',
				description: 'Permissive stale schema',
				parameters: {
					type: 'object',
					properties: {
						include_examples: { type: 'boolean' }
					}
				}
			};

			const result = await service.executeTool(toolCall, mockContext, [
				permissiveSuppliedDefinition
			]);

			expect(result).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining('Missing required parameter: op')
			});
			expect(mockToolExecutor).not.toHaveBeenCalled();

			const directValidation = service.validateToolCall(
				'tool_schema',
				{ include_examples: true },
				[permissiveSuppliedDefinition]
			);
			expect(directValidation).toMatchObject({
				isValid: false,
				errors: expect.arrayContaining(['Missing required parameter: op'])
			});
		});

		it('should execute gateway tools with canonical schemas outside the selected tool list', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_gateway_search',
				name: 'tool_search',
				arguments: { query: 'update task', kind: 'write', limit: 1 }
			};

			const result = await service.executeTool(toolCall, mockContext, []);

			expect(result.success).toBe(true);
			expect(result.toolName).toBe('tool_search');
			expect(result.toolCallId).toBe('call_gateway_search');
			expect(result.data).toMatchObject({
				type: 'tool_search_results'
			});
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('should apply gateway aliases before canonical schema validation', async () => {
			const toolCalls: Array<{
				call: ChatToolCall;
				expectedData: Record<string, unknown>;
			}> = [
				{
					call: {
						id: 'call_gateway_domain_alias',
						name: 'domain_load',
						arguments: { id: 'sales_and_growth.cold_email' }
					},
					expectedData: { type: 'domain', domain_id: 'sales_and_growth.cold_email' }
				},
				{
					call: {
						id: 'call_gateway_schema_alias',
						name: 'tool_schema',
						arguments: { path: 'onto.task.update' }
					},
					expectedData: { type: 'tool_schema', op: 'onto.task.update' }
				},
				{
					call: {
						id: 'call_gateway_skill_alias',
						name: 'skill_load',
						arguments: { id: 'google_calendar', include_examples: false }
					},
					expectedData: {
						type: 'skill',
						id: 'google_calendar',
						format: 'full',
						recommended_load_format: 'full'
					}
				},
				{
					call: {
						id: 'call_gateway_reference_alias',
						name: 'skill_reference_load',
						arguments: {
							path: 'google_calendar',
							module: 'google_calendar.public_safe_write_rules'
						}
					},
					expectedData: {
						type: 'skill_reference',
						skill_id: 'google_calendar',
						reference_id: 'google_calendar.public_safe_write_rules'
					}
				}
			];

			for (const { call, expectedData } of toolCalls) {
				const result = await service.executeTool(call, mockContext, []);

				expect(result.success).toBe(true);
				expect(result.data).toMatchObject(expectedData);
			}
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('should reject invalid gateway enum values before execution', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_gateway_enum',
				name: 'tool_search',
				arguments: { query: 'update task', kind: 'delete' }
			};

			const result = await service.executeTool(toolCall, mockContext, []);

			expect(result).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining(
					'Invalid value for parameter kind: expected one of "read", "write", got "delete"'
				)
			});
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('should cancel gateway tools before execution when aborted', async () => {
			const controller = new AbortController();
			controller.abort();
			const toolCall: ChatToolCall = {
				id: 'call_gateway_aborted',
				name: 'tool_schema',
				arguments: { op: 'onto.task.update' }
			};

			const result = await service.executeTool(toolCall, mockContext, [], {
				abortSignal: controller.signal
			});

			expect(result).toMatchObject({
				success: false,
				errorType: 'cancelled',
				error: 'Operation cancelled'
			});
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('repairs nested project collections before create_onto_project execution', async () => {
			const createContext: ServiceContext = {
				...mockContext,
				contextType: 'project_create',
				entityId: undefined
			};
			const nestedEntities = [
				{ temp_id: 'goal-1', kind: 'goal', name: 'Validate demand' },
				{ temp_id: 'task-1', kind: 'task', title: 'Interview parents' }
			];
			const nestedRelationships = [
				{
					from: { temp_id: 'goal-1', kind: 'goal' },
					to: { temp_id: 'task-1', kind: 'task' },
					rel: 'contains'
				}
			];
			const toolCall: ChatToolCall = {
				id: 'call_create_nested_project_graph',
				name: 'create_onto_project',
				arguments: {
					project: {
						name: 'Christian School Launch',
						type_key: 'project.nonprofit.school_launch',
						entities: nestedEntities,
						relationships: nestedRelationships
					}
				}
			};
			const createProjectDefinition: ChatToolDefinition = {
				name: 'create_onto_project',
				description: 'Create project',
				parameters: {
					type: 'object',
					properties: {
						project: { type: 'object' },
						entities: { type: 'array' },
						relationships: { type: 'array' }
					},
					required: ['project', 'entities', 'relationships']
				}
			};
			mockToolExecutor.mockResolvedValueOnce({ data: { project_id: 'project-1' } });

			const result = await service.executeTool(toolCall, createContext, [
				createProjectDefinition
			]);

			expect(result.success).toBe(true);
			const executedArgs = mockToolExecutor.mock.calls[0]?.[1];
			expect(executedArgs.project).not.toHaveProperty('entities');
			expect(executedArgs.project).not.toHaveProperty('relationships');
			expect(executedArgs.entities).toEqual(nestedEntities);
			expect(executedArgs.relationships).toEqual(nestedRelationships);
		});

		it('rejects conflicting nested and top-level project collections', async () => {
			const createContext: ServiceContext = {
				...mockContext,
				contextType: 'project_create',
				entityId: undefined
			};
			const toolCall: ChatToolCall = {
				id: 'call_create_conflicting_project_graph',
				name: 'create_onto_project',
				arguments: {
					project: {
						name: 'Launch',
						type_key: 'project.business.launch',
						entities: [{ temp_id: 'nested-goal', kind: 'goal', name: 'Nested goal' }]
					},
					entities: [{ temp_id: 'top-goal', kind: 'goal', name: 'Top goal' }],
					relationships: []
				}
			};
			const createProjectDefinition: ChatToolDefinition = {
				name: 'create_onto_project',
				description: 'Create project',
				parameters: {
					type: 'object',
					properties: {
						project: { type: 'object' },
						entities: { type: 'array' },
						relationships: { type: 'array' }
					},
					required: ['project', 'entities', 'relationships']
				}
			};

			const result = await service.executeTool(toolCall, createContext, [
				createProjectDefinition
			]);

			expect(result).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining(
					'entities and project.entities contain different non-empty arrays'
				)
			});
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('adds the server-selected fiction workspace profile before project creation', async () => {
			const createContext: ServiceContext = {
				...mockContext,
				contextType: 'project_create',
				entityId: undefined,
				conversationHistory: [
					{
						role: 'user',
						content:
							'Create an ongoing workspace for my novel and keep it organized whenever I add story details.'
					} as any
				]
			};
			const toolCall: ChatToolCall = {
				id: 'call_create_fiction_workspace',
				name: 'create_onto_project',
				arguments: {
					project: {
						name: 'The Glass Harbor',
						type_key: 'project.creative.novel',
						props: { facets: { stage: 'discovery' } }
					},
					entities: [],
					relationships: []
				}
			};
			const createProjectDefinition: ChatToolDefinition = {
				name: 'create_onto_project',
				description: 'Create project',
				parameters: {
					type: 'object',
					properties: {
						project: { type: 'object' },
						entities: { type: 'array' },
						relationships: { type: 'array' }
					},
					required: ['project', 'entities', 'relationships']
				}
			};
			mockToolExecutor.mockResolvedValueOnce({ data: { project_id: 'project-1' } });

			const result = await service.executeTool(toolCall, createContext, [
				createProjectDefinition
			]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'create_onto_project',
				expect.objectContaining({
					project: expect.objectContaining({
						props: expect.objectContaining({
							facets: { stage: 'discovery' },
							agent_workspace: {
								mode: 'living_reference',
								domain_profile: 'fiction_story',
								domain_affinity: 'writing.fiction'
							}
						})
					})
				}),
				contextLike(createContext)
			);
		});

		it('retains creation evidence across a multi-turn project-create clarification', async () => {
			const createContext: ServiceContext = {
				...mockContext,
				contextType: 'project_create',
				entityId: undefined,
				conversationHistory: [
					{
						role: 'user',
						content:
							'Create an ongoing workspace for my novel. Finish Part I by March 1, 2027.'
					} as any,
					{ role: 'assistant', content: 'What should I call it?' } as any,
					{ role: 'user', content: 'The Glass Harbor.' } as any
				]
			};
			const toolCall: ChatToolCall = {
				id: 'call_create_after_clarification',
				name: 'create_onto_project',
				arguments: {
					project: {
						name: 'The Glass Harbor',
						type_key: 'project.creative.novel'
					},
					entities: [
						{
							kind: 'milestone',
							temp_id: 'part-one',
							title: 'Part I',
							due_at: '2027-03-01T17:00:00Z'
						}
					],
					relationships: []
				}
			};
			const createProjectDefinition: ChatToolDefinition = {
				name: 'create_onto_project',
				description: 'Create project',
				parameters: {
					type: 'object',
					properties: {
						project: { type: 'object' },
						entities: { type: 'array' },
						relationships: { type: 'array' }
					},
					required: ['project', 'entities', 'relationships']
				}
			};
			mockToolExecutor.mockResolvedValueOnce({ data: { project_id: 'project-1' } });

			const result = await service.executeTool(toolCall, createContext, [
				createProjectDefinition
			]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'create_onto_project',
				expect.objectContaining({
					project: expect.objectContaining({
						props: expect.objectContaining({
							agent_workspace: expect.objectContaining({
								mode: 'living_reference',
								domain_profile: 'fiction_story'
							})
						})
					})
				}),
				contextLike(createContext)
			);
		});

		it('removes fiction milestones whose dates were not grounded in the user message', async () => {
			const createContext: ServiceContext = {
				...mockContext,
				contextType: 'project_create',
				entityId: undefined,
				conversationHistory: [
					{
						role: 'user',
						content: 'Create an ongoing workspace for my novel.'
					} as any
				]
			};
			const toolCall: ChatToolCall = {
				id: 'call_create_with_invented_milestone',
				name: 'create_onto_project',
				arguments: {
					project: {
						name: 'The Glass Harbor',
						type_key: 'project.creative.novel'
					},
					entities: [
						{
							kind: 'milestone',
							temp_id: 'part-one',
							title: 'Part I',
							due_at: '2027-03-01T17:00:00Z'
						}
					],
					relationships: []
				}
			};
			const createProjectDefinition: ChatToolDefinition = {
				name: 'create_onto_project',
				description: 'Create project',
				parameters: {
					type: 'object',
					properties: {
						project: { type: 'object' },
						entities: { type: 'array' },
						relationships: { type: 'array' }
					},
					required: ['project', 'entities', 'relationships']
				}
			};
			mockToolExecutor.mockResolvedValueOnce({ data: { project_id: 'project-1' } });

			const result = await service.executeTool(toolCall, createContext, [
				createProjectDefinition
			]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'create_onto_project',
				expect.objectContaining({ entities: [], relationships: [] }),
				contextLike(createContext)
			);
		});

		it('removes unrequested operational scaffolding in a canon-only fiction project', async () => {
			const createContext: ServiceContext = {
				...mockContext,
				contextType: 'project_create',
				entityId: undefined,
				conversationHistory: [
					{
						role: 'user',
						content:
							'Create an ongoing novel workspace. Part I is The Missing Street and Part II is The Salt Archive.'
					} as any
				]
			};
			const toolCall: ChatToolCall = {
				id: 'call_create_with_invented_goal',
				name: 'create_onto_project',
				arguments: {
					project: {
						name: 'The Glass Harbor',
						type_key: 'project.creative.novel'
					},
					entities: [
						{
							kind: 'goal',
							temp_id: 'finish-book',
							name: 'Complete the first draft'
						}
					],
					relationships: []
				}
			};
			const createProjectDefinition: ChatToolDefinition = {
				name: 'create_onto_project',
				description: 'Create project',
				parameters: {
					type: 'object',
					properties: {
						project: { type: 'object' },
						entities: { type: 'array' },
						relationships: { type: 'array' }
					},
					required: ['project', 'entities', 'relationships']
				}
			};
			mockToolExecutor.mockResolvedValueOnce({ data: { project_id: 'project-1' } });

			const result = await service.executeTool(toolCall, createContext, [
				createProjectDefinition
			]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'create_onto_project',
				expect.objectContaining({ entities: [], relationships: [] }),
				contextLike(createContext)
			);
		});

		it('should warn before creating a second project from an existing project turn', async () => {
			const projectId = '06691c72-8c01-4f77-a79f-d0ef7f40124a';
			const guardedContext: ServiceContext = {
				...mockContext,
				contextType: 'global',
				entityId: undefined,
				originalTurnContext: {
					contextType: 'project',
					entityId: projectId,
					entityName: 'The Last Ember'
				},
				conversationHistory: [
					{
						role: 'user',
						content:
							'Start a blog project for a productivity tips series. I want to write 10 articles over the next 3 months.'
					} as any
				]
			};
			const toolCall: ChatToolCall = {
				id: 'call_create_project_guard',
				name: 'create_onto_project',
				arguments: {
					project: {
						name: 'Productivity Tips Blog Series',
						type_key: 'project.content.blog'
					},
					entities: [],
					relationships: []
				}
			};
			const createProjectDefinition: ChatToolDefinition = {
				name: 'create_onto_project',
				description: 'Create project',
				parameters: {
					type: 'object',
					properties: {
						project: { type: 'object' },
						entities: { type: 'array' },
						relationships: { type: 'array' }
					},
					required: ['project', 'entities', 'relationships']
				}
			};

			const result = await service.executeTool(toolCall, guardedContext, [
				createProjectDefinition
			]);

			expect(result.success).toBe(false);
			expect(result.error).toBe(
				"You're already in this project. Are you sure you want to create a new project?"
			);
			expect(result.data).toMatchObject({
				type: 'project_creation_confirmation_required',
				context_shift: {
					new_context: 'project',
					entity_id: projectId,
					entity_name: 'The Last Ember'
				}
			});
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('should warn before zooming out to create another project from a project turn', async () => {
			const guardedContext: ServiceContext = {
				...mockContext,
				originalTurnContext: {
					contextType: 'project',
					entityId: '06691c72-8c01-4f77-a79f-d0ef7f40124a',
					entityName: 'The Last Ember'
				},
				conversationHistory: [
					{
						role: 'user',
						content:
							'Start a blog project for a productivity tips series. I want to write 10 articles over the next 3 months.'
					} as any
				]
			};
			const toolCall: ChatToolCall = {
				id: 'call_context_guard',
				name: 'change_chat_context',
				arguments: {
					target: 'global',
					reason: 'User wants to create a new blog project'
				}
			};
			const changeContextDefinition: ChatToolDefinition = {
				name: 'change_chat_context',
				description: 'Change chat context',
				parameters: {
					type: 'object',
					properties: {
						target: { type: 'string' },
						reason: { type: 'string' }
					},
					required: ['target']
				}
			};

			const result = await service.executeTool(toolCall, guardedContext, [
				changeContextDefinition
			]);

			expect(result.success).toBe(false);
			expect(result.error).toBe(
				"You're already in this project. Are you sure you want to create a new project?"
			);
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('should allow new project creation after the user confirms the warning', async () => {
			const confirmedContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: '06691c72-8c01-4f77-a79f-d0ef7f40124a',
				originalTurnContext: {
					contextType: 'project',
					entityId: '06691c72-8c01-4f77-a79f-d0ef7f40124a',
					entityName: 'The Last Ember'
				},
				conversationHistory: [
					{
						role: 'assistant',
						content:
							"You're already in this project. Are you sure you want to create a new project?"
					} as any,
					{ role: 'user', content: 'Yes, create it as a new project.' } as any
				]
			};
			const toolCall: ChatToolCall = {
				id: 'call_confirmed_create_project',
				name: 'create_onto_project',
				arguments: {
					project: {
						name: 'Productivity Tips Blog Series',
						type_key: 'project.content.blog'
					},
					entities: [],
					relationships: []
				}
			};
			const createProjectDefinition: ChatToolDefinition = {
				name: 'create_onto_project',
				description: 'Create project',
				parameters: {
					type: 'object',
					properties: {
						project: { type: 'object' },
						entities: { type: 'array' },
						relationships: { type: 'array' }
					},
					required: ['project', 'entities', 'relationships']
				}
			};
			mockToolExecutor.mockResolvedValueOnce({
				data: { project_id: '972064c0-c2aa-4c74-a735-313802ffd456' }
			});

			const result = await service.executeTool(toolCall, confirmedContext, [
				createProjectDefinition
			]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'create_onto_project',
				{
					project: {
						name: 'Productivity Tips Blog Series',
						type_key: 'project.content.blog'
					},
					entities: [],
					relationships: []
				},
				contextLike(confirmedContext)
			);
		});

		it('should alias external_event_id to event_id for calendar update', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_calendar_external_event_alias',
				name: 'update_calendar_event',
				arguments: {
					external_event_id: 'evt_123',
					title: 'Rescheduled meeting'
				}
			};
			const updateCalendarDefinition: ChatToolDefinition = {
				name: 'update_calendar_event',
				description: 'Update calendar event',
				parameters: {
					type: 'object',
					properties: {
						onto_event_id: { type: 'string' },
						event_id: { type: 'string' },
						title: { type: 'string' }
					}
				}
			};

			mockToolExecutor.mockResolvedValueOnce({ success: true });

			const result = await service.executeTool(toolCall, mockContext, [
				updateCalendarDefinition
			]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'update_calendar_event',
				expect.objectContaining({
					external_event_id: 'evt_123',
					event_id: 'evt_123',
					title: 'Rescheduled meeting'
				}),
				contextLike(mockContext)
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
				contextLike(mockContext)
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
				contextLike(mockContext)
			);
		});

		it('should reject document append updates with empty props and no content', async () => {
			const documentId = '3e9432fb-90e1-4404-a480-c73186b1337d';
			const toolCall: ChatToolCall = {
				id: 'call_bad_doc_append',
				name: 'update_onto_document',
				arguments: {
					document_id: documentId,
					update_strategy: 'append',
					merge_instructions: 'Append under Progress Updates.',
					props: {}
				}
			};
			const updateDefinition: ChatToolDefinition = {
				name: 'update_onto_document',
				description: 'Update ontology document',
				parameters: {
					type: 'object',
					properties: {
						document_id: { type: 'string' },
						content: { type: 'string' },
						update_strategy: { type: 'string' },
						merge_instructions: { type: 'string' },
						props: { type: 'object' }
					},
					required: ['document_id']
				}
			};

			const result = await service.executeTool(toolCall, mockContext, [updateDefinition]);

			expect(result.success).toBe(false);
			expect(result.error).toContain(
				'update_onto_document append requires non-empty content.'
			);
			expect(result.error).toContain('No update fields provided for update_onto_document');
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		// Durable-text markup rejection is covered by:
		// - stream-orchestrator/tool-validation.test.ts (pre-execution, model feedback)
		// - ontology-write-executor throws via assertNoDurableTextViolations (pre-DB)
		// The service layer intentionally does not duplicate this check.

		it('should allow document append updates with content aliases', async () => {
			const documentId = '3e9432fb-90e1-4404-a480-c73186b1337d';
			const toolCall: ChatToolCall = {
				id: 'call_good_doc_append',
				name: 'update_onto_document',
				arguments: {
					document_id: documentId,
					update_strategy: 'append',
					body: '## Progress Updates\n\n- Chapter 2 complete.',
					merge_instructions: 'Append under Progress Updates.',
					props: {}
				}
			};
			const updateDefinition: ChatToolDefinition = {
				name: 'update_onto_document',
				description: 'Update ontology document',
				parameters: {
					type: 'object',
					properties: {
						document_id: { type: 'string' },
						content: { type: 'string' },
						update_strategy: { type: 'string' },
						merge_instructions: { type: 'string' },
						props: { type: 'object' }
					},
					required: ['document_id']
				}
			};

			mockToolExecutor.mockResolvedValueOnce({ ok: true });

			const result = await service.executeTool(toolCall, mockContext, [updateDefinition]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'update_onto_document',
				expect.objectContaining({
					document_id: documentId,
					content: '## Progress Updates\n\n- Chapter 2 complete.',
					update_strategy: 'append'
				}),
				contextLike(mockContext)
			);
		});

		it('should allow normal markdown angle brackets in durable text', async () => {
			const documentId = '3e9432fb-90e1-4404-a480-c73186b1337d';
			const toolCall: ChatToolCall = {
				id: 'call_good_doc_markup',
				name: 'update_onto_document',
				arguments: {
					document_id: documentId,
					content: 'Use <aside> for notes and keep x < y as an example.'
				}
			};
			const updateDefinition: ChatToolDefinition = {
				name: 'update_onto_document',
				description: 'Update ontology document',
				parameters: {
					type: 'object',
					properties: {
						document_id: { type: 'string' },
						content: { type: 'string' }
					},
					required: ['document_id']
				}
			};

			mockToolExecutor.mockResolvedValueOnce({ ok: true });

			const result = await service.executeTool(toolCall, mockContext, [updateDefinition]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'update_onto_document',
				expect.objectContaining({
					document_id: documentId,
					content: 'Use <aside> for notes and keep x < y as an example.'
				}),
				contextLike(mockContext)
			);
		});

		it('should preserve schema defaults for get_document_tree', async () => {
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
						include_documents: { type: 'boolean', default: false },
						include_content: { type: 'boolean', default: false }
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
					include_documents: false,
					include_content: false
				}),
				contextLike(mockContext)
			);
		});

		it('applies schema defaults before required-field validation', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_required_default',
				name: 'defaulted_tool',
				arguments: {}
			};
			const defaultedDefinition: ChatToolDefinition = {
				name: 'defaulted_tool',
				description: 'Tool with a required defaulted mode',
				parameters: {
					type: 'object',
					properties: {
						mode: { type: 'string', default: 'summary' }
					},
					required: ['mode']
				}
			};
			mockToolExecutor.mockResolvedValueOnce({ data: { ok: true } });

			const result = await service.executeTool(toolCall, mockContext, [defaultedDefinition]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'defaulted_tool',
				{ mode: 'summary' },
				contextLike(mockContext)
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
				contextLike(mockContext)
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

		it('should require onto_event_id or event_id for calendar update', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_calendar_missing_id',
				name: 'update_calendar_event',
				arguments: {
					title: 'Rename only'
				}
			};
			const updateCalendarDefinition: ChatToolDefinition = {
				name: 'update_calendar_event',
				description: 'Update calendar event',
				parameters: {
					type: 'object',
					properties: {
						onto_event_id: { type: 'string' },
						event_id: { type: 'string' },
						title: { type: 'string' }
					}
				}
			};

			const result = await service.executeTool(toolCall, mockContext, [
				updateCalendarDefinition
			]);

			expect(result.success).toBe(false);
			expect(result.error).toContain('onto_event_id or event_id');
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
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'list_onto_projects',
				{},
				contextLike(mockContext)
			);
		});

		it('should route virtual tools through provided handler', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_virtual',
				name: 'agent_create_plan',
				arguments: { objective: 'Do something' }
			};

			const virtualHandler = vi.fn().mockResolvedValue({
				success: true,
				data: { status: 'drafted' },
				streamEvents: [{ type: 'text', content: 'Plan drafted.' }],
				tokensUsed: 7,
				metadata: { durationMs: 12 }
			} satisfies Partial<ToolExecutionResult>);

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions, {
				virtualHandlers: {
					agent_create_plan: virtualHandler
				}
			});

			expect(result.success).toBe(true);
			expect(result.toolName).toBe('agent_create_plan');
			expect(result.toolCallId).toBe('call_virtual');
			expect(result.streamEvents).toEqual([{ type: 'text', content: 'Plan drafted.' }]);
			expect(result.tokensUsed).toBe(7);
			expect(result.metadata).toEqual({ durationMs: 12 });
			expect(mockToolExecutor).not.toHaveBeenCalled();
			expect(virtualHandler).toHaveBeenCalledWith({
				toolCall,
				toolName: 'agent_create_plan',
				args: { objective: 'Do something' },
				context: contextLike(mockContext),
				availableTools: mockToolDefinitions
			});
		});

		it('propagates cancellation into virtual handlers and returns the standard envelope', async () => {
			const controller = new AbortController();
			let capturedSignal: AbortSignal | undefined;
			const toolCall: ChatToolCall = {
				id: 'call_virtual_cancelled',
				name: 'agent_create_plan',
				arguments: { objective: 'Do something' }
			};
			const virtualHandler: VirtualToolHandler = vi.fn(
				({ context }: { context: ServiceContext }) =>
					new Promise<ToolExecutionResult>((_resolve, reject) => {
						capturedSignal = context.abortSignal;
						context.abortSignal?.addEventListener(
							'abort',
							() => reject(new DOMException('Tool execution aborted', 'AbortError')),
							{ once: true }
						);
					})
			);

			const resultPromise = service.executeTool(toolCall, mockContext, mockToolDefinitions, {
				virtualHandlers: { agent_create_plan: virtualHandler },
				abortSignal: controller.signal
			});
			await vi.waitFor(() => expect(capturedSignal).toBeDefined());
			controller.abort();

			await expect(resultPromise).resolves.toMatchObject({
				success: false,
				error: 'Operation cancelled',
				errorType: 'cancelled',
				toolName: 'agent_create_plan',
				toolCallId: 'call_virtual_cancelled'
			});
			expect(capturedSignal?.aborted).toBe(true);
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('returns the standard timeout envelope when a virtual handler exceeds its deadline', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_virtual_timeout',
				name: 'agent_create_plan',
				arguments: { objective: 'Do something' }
			};
			const virtualHandler: VirtualToolHandler = vi.fn(
				() => new Promise<ToolExecutionResult>(() => undefined)
			);

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions, {
				virtualHandlers: { agent_create_plan: virtualHandler },
				timeout: 10
			});

			expect(result).toMatchObject({
				success: false,
				errorType: 'timeout',
				toolName: 'agent_create_plan',
				toolCallId: 'call_virtual_timeout'
			});
			expect(result.error).toEqual(expect.stringContaining('timeout'));
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('preserves lane-specific classification of handler timeout messages', async () => {
			const virtualToolCall: ChatToolCall = {
				id: 'call_virtual_timeout_message',
				name: 'agent_create_plan',
				arguments: { objective: 'Do something' }
			};
			const virtualHandler: VirtualToolHandler = vi.fn(async () => {
				throw new Error('dependency timeout');
			});

			const virtualResult = await service.executeTool(
				virtualToolCall,
				mockContext,
				mockToolDefinitions,
				{ virtualHandlers: { agent_create_plan: virtualHandler } }
			);
			expect(virtualResult).toMatchObject({
				success: false,
				error: 'dependency timeout',
				errorType: 'execution_error'
			});

			mockToolExecutor.mockRejectedValueOnce(new Error('dependency timeout'));
			const coreResult = await service.executeTool(
				{
					id: 'call_core_timeout_message',
					name: 'list_onto_tasks',
					arguments: { project_id: 'proj_123' }
				},
				mockContext,
				mockToolDefinitions
			);
			expect(coreResult).toMatchObject({
				success: false,
				error: "Tool 'list_onto_tasks' failed: dependency timeout",
				errorType: 'timeout'
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
				contextLike(mockContext)
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
				contextLike(mockContext)
			);
		});

		it('blocks an accidental duplicate document and returns the exact update target', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const documentId = '9da52903-4bb5-4c3f-af32-cb4a2c623dec';
			const createContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				conversationHistory: [
					{ role: 'user', content: 'Add this new canon detail about Ilyan.' } as any
				],
				ontologyContext: {
					type: 'project',
					entities: {
						documents: [
							{
								id: documentId,
								project_id: projectId,
								title: 'Ilyan Rook — Character Sheet'
							} as any
						]
					},
					metadata: {},
					scope: { projectId }
				}
			};
			const toolCall: ChatToolCall = {
				id: 'call_duplicate_doc',
				name: 'create_onto_document',
				arguments: {
					project_id: projectId,
					title: 'Ilyan Rook - Character Sheet',
					description: 'Character canon',
					type_key: 'document.creative.character',
					content: 'New Ilyan detail.'
				}
			};
			const createDocumentDefinition: ChatToolDefinition = {
				name: 'create_onto_document',
				description: 'Create document',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						description: { type: 'string' },
						type_key: { type: 'string' },
						content: { type: 'string' }
					},
					required: ['project_id', 'title', 'description', 'type_key']
				}
			};

			const result = await service.executeTool(toolCall, createContext, [
				createDocumentDefinition
			]);

			expect(result).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining(documentId)
			});
			expect(result.error).toContain('use update_onto_document');
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('allows a same-title document when the user explicitly requests a duplicate', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const createContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				conversationHistory: [
					{
						role: 'user',
						content: 'Create a duplicate copy of the Ilyan character sheet.'
					} as any
				],
				ontologyContext: {
					type: 'project',
					entities: {
						documents: [
							{
								id: '9da52903-4bb5-4c3f-af32-cb4a2c623dec',
								project_id: projectId,
								title: 'Ilyan Rook — Character Sheet'
							} as any
						]
					},
					metadata: {},
					scope: { projectId }
				}
			};
			const args = {
				project_id: projectId,
				title: 'Ilyan Rook — Character Sheet',
				description: 'Explicit duplicate',
				type_key: 'document.creative.character',
				content: 'Duplicate content.'
			};
			const toolCall: ChatToolCall = {
				id: 'call_explicit_duplicate_doc',
				name: 'create_onto_document',
				arguments: args
			};
			const createDocumentDefinition: ChatToolDefinition = {
				name: 'create_onto_document',
				description: 'Create document',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						description: { type: 'string' },
						type_key: { type: 'string' },
						content: { type: 'string' }
					},
					required: ['project_id', 'title', 'description', 'type_key']
				}
			};
			mockToolExecutor.mockResolvedValueOnce({ data: { document_id: 'doc-copy' } });

			const result = await service.executeTool(toolCall, createContext, [
				createDocumentDefinition
			]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'create_onto_document',
				args,
				contextLike(createContext)
			);
		});

		it('does not infer living-fiction document content from conversation history', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const documentId = '9da52903-4bb5-4c3f-af32-cb4a2c623dec';
			const source =
				'I think the last beat of Part I happens at the end of chapter 4: Ilyan catches Mara hiding a forbidden map and chooses not to report her. Mara reads that as loyalty, but privately he is using her to reach the Salt Archive. Chapter 5 opens Part II on the morning after that choice.';
			const updateContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				conversationHistory: [{ role: 'user', content: source } as any],
				ontologyContext: {
					type: 'project',
					entities: {
						project: {
							id: projectId,
							props: {
								agent_workspace: {
									mode: 'living_reference',
									domain_profile: 'fiction_story',
									domain_affinity: 'writing.fiction'
								}
							}
						} as any,
						documents: [
							{
								id: documentId,
								project_id: projectId,
								title: "The Cartographer's Debt — Structure",
								type_key: 'document.creative.structure'
							} as any
						]
					},
					metadata: {},
					scope: { projectId }
				}
			};
			const toolCall: ChatToolCall = {
				id: 'call_update_structure',
				name: 'update_onto_document',
				arguments: {
					document_id: documentId,
					content:
						'## Chapter 4\n\nMara interprets Ilyan as loyal.\n\n## Chapter 5\n\nPart II begins the next morning.',
					update_strategy: 'append'
				}
			};
			const updateDocumentDefinition: ChatToolDefinition = {
				name: 'update_onto_document',
				description: 'Update document',
				parameters: {
					type: 'object',
					properties: {
						document_id: { type: 'string' },
						content: { type: 'string' },
						update_strategy: {
							type: 'string',
							enum: ['replace', 'append', 'merge_llm'],
							default: 'replace'
						}
					},
					required: ['document_id']
				}
			};
			mockToolExecutor.mockResolvedValueOnce({ data: { document_id: documentId } });

			const result = await service.executeTool(toolCall, updateContext, [
				updateDocumentDefinition
			]);

			expect(result.success).toBe(true);
			expect(mockToolExecutor).toHaveBeenCalledWith(
				'update_onto_document',
				{
					document_id: documentId,
					update_strategy: 'append',
					content:
						'## Chapter 4\n\nMara interprets Ilyan as loyal.\n\n## Chapter 5\n\nPart II begins the next morning.'
				},
				contextLike(updateContext)
			);
		});

		it('hoists a nested document alias without inferring conversation content', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const documentId = '9da52903-4bb5-4c3f-af32-cb4a2c623dec';
			const source =
				'Chapter 5 opens Part II on the morning after Ilyan chooses not to report Mara.';
			const updateContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				conversationHistory: [{ role: 'user', content: source } as any],
				ontologyContext: {
					type: 'project',
					entities: {
						project: {
							id: projectId,
							props: {
								agent_workspace: {
									mode: 'living_reference',
									domain_profile: 'fiction_story',
									domain_affinity: 'writing.fiction'
								}
							}
						} as any,
						documents: [
							{
								id: documentId,
								project_id: projectId,
								title: "The Cartographer's Debt — Structure",
								type_key: 'document.creative.structure'
							} as any
						]
					},
					metadata: {},
					scope: { projectId }
				}
			};
			const toolCall: ChatToolCall = {
				id: 'call_update_structure_nested',
				name: 'update_onto_document',
				arguments: {
					document_id: documentId,
					document: { body_markdown: 'MODEL CONTENT UNDER A NESTED ALIAS' },
					update_strategy: 'append'
				}
			};
			const updateDocumentDefinition: ChatToolDefinition = {
				name: 'update_onto_document',
				description: 'Update document',
				parameters: {
					type: 'object',
					properties: {
						document_id: { type: 'string' },
						content: { type: 'string' },
						document: { type: 'object' },
						update_strategy: {
							type: 'string',
							enum: ['replace', 'append', 'merge_llm'],
							default: 'replace'
						}
					},
					required: ['document_id']
				}
			};
			mockToolExecutor.mockResolvedValueOnce({ data: { document_id: documentId } });

			const result = await service.executeTool(toolCall, updateContext, [
				updateDocumentDefinition
			]);

			expect(result.success).toBe(true);
			const dispatchedArgs = mockToolExecutor.mock.calls.at(-1)?.[1] as Record<string, any>;
			expect(dispatchedArgs.content).toBe('MODEL CONTENT UNDER A NESTED ALIAS');
			expect(dispatchedArgs.content).not.toContain(source);
		});

		it('blocks a same-title create repeated within one turn', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const createdDocumentId = '7b1e5f7c-2f4a-4f6e-9d2b-8a1c3e5f7a9b';
			const createContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				conversationHistory: [
					{ role: 'user', content: 'Add this new canon detail about Ilyan.' } as any
				],
				ontologyContext: {
					type: 'project',
					entities: { documents: [] },
					metadata: {},
					scope: { projectId }
				}
			};
			const createDocumentDefinition: ChatToolDefinition = {
				name: 'create_onto_document',
				description: 'Create document',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						description: { type: 'string' },
						type_key: { type: 'string' },
						content: { type: 'string' }
					},
					required: ['project_id', 'title', 'description', 'type_key']
				}
			};
			const buildCall = (id: string): ChatToolCall => ({
				id,
				name: 'create_onto_document',
				arguments: {
					project_id: projectId,
					title: 'Ilyan Rook — Character Sheet',
					description: 'Character canon',
					type_key: 'document.creative.character',
					content: 'Ilyan detail.'
				}
			});
			mockToolExecutor.mockResolvedValueOnce({
				data: { document_id: createdDocumentId }
			});

			const first = await service.executeTool(buildCall('call_create_once'), createContext, [
				createDocumentDefinition
			]);
			const second = await service.executeTool(
				buildCall('call_create_twice'),
				createContext,
				[createDocumentDefinition]
			);

			expect(first.success).toBe(true);
			expect(second).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining(createdDocumentId)
			});
			expect(second.error).toContain('already created earlier in this turn');
			expect(mockToolExecutor).toHaveBeenCalledTimes(1);
		});

		it('never leaks same-turn duplicate state across service instances', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const createContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				conversationHistory: [
					{
						role: 'user',
						content: 'Add this new canon detail about Ilyan.'
					} as ServiceContext['conversationHistory'][number]
				],
				ontologyContext: {
					type: 'project',
					entities: { documents: [] },
					metadata: {},
					scope: { projectId }
				}
			};
			const createDocumentDefinition: ChatToolDefinition = {
				name: 'create_onto_document',
				description: 'Create document',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						description: { type: 'string' },
						type_key: { type: 'string' },
						content: { type: 'string' }
					},
					required: ['project_id', 'title', 'description', 'type_key']
				}
			};
			const firstExecutor = vi.fn().mockResolvedValue({
				data: { document_id: '7b1e5f7c-2f4a-4f6e-9d2b-8a1c3e5f7a9b' }
			});
			const secondExecutor = vi.fn().mockResolvedValue({
				data: { document_id: '2860f74f-c3ec-4823-8fcb-66c9d85673a6' }
			});
			const firstService = new ToolExecutionService(firstExecutor);
			const secondService = new ToolExecutionService(secondExecutor);
			const buildCall = (id: string): ChatToolCall => ({
				id,
				name: 'create_onto_document',
				arguments: {
					project_id: projectId,
					title: 'Ilyan Rook — Character Sheet',
					description: 'Character canon',
					type_key: 'document.creative.character',
					content: 'Ilyan detail.'
				}
			});

			const first = await firstService.executeTool(
				buildCall('call_first_instance'),
				createContext,
				[createDocumentDefinition]
			);
			const second = await secondService.executeTool(
				buildCall('call_second_instance'),
				createContext,
				[createDocumentDefinition]
			);

			expect(first.success).toBe(true);
			expect(second.success).toBe(true);
			expect(firstExecutor).toHaveBeenCalledTimes(1);
			expect(secondExecutor).toHaveBeenCalledTimes(1);
		});

		it('keeps the duplicate guard armed when the user forbids duplication', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const documentId = '9da52903-4bb5-4c3f-af32-cb4a2c623dec';
			const createContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				conversationHistory: [
					{
						role: 'user',
						content:
							"Add the whistle detail and please don't create a duplicate document for Ilyan."
					} as any
				],
				ontologyContext: {
					type: 'project',
					entities: {
						documents: [
							{
								id: documentId,
								project_id: projectId,
								title: 'Ilyan Rook — Character Sheet'
							} as any
						]
					},
					metadata: {},
					scope: { projectId }
				}
			};
			const toolCall: ChatToolCall = {
				id: 'call_negated_duplicate',
				name: 'create_onto_document',
				arguments: {
					project_id: projectId,
					title: 'Ilyan Rook — Character Sheet',
					description: 'Character canon',
					type_key: 'document.creative.character',
					content: 'Whistle detail.'
				}
			};
			const createDocumentDefinition: ChatToolDefinition = {
				name: 'create_onto_document',
				description: 'Create document',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						title: { type: 'string' },
						description: { type: 'string' },
						type_key: { type: 'string' },
						content: { type: 'string' }
					},
					required: ['project_id', 'title', 'description', 'type_key']
				}
			};

			const result = await service.executeTool(toolCall, createContext, [
				createDocumentDefinition
			]);

			expect(result).toMatchObject({
				success: false,
				errorType: 'validation_error',
				error: expect.stringContaining(documentId)
			});
			expect(mockToolExecutor).not.toHaveBeenCalled();
		});

		it('strips model-supplied agent_workspace props on document and project updates', async () => {
			const projectId = '153dea7b-1fc7-4f68-b014-cd2b00c572ec';
			const documentId = '9da52903-4bb5-4c3f-af32-cb4a2c623dec';
			const updateContext: ServiceContext = {
				...mockContext,
				contextType: 'project',
				entityId: projectId,
				contextScope: { projectId },
				conversationHistory: [
					{ role: 'user', content: 'Tidy the notes document metadata.' } as any
				],
				ontologyContext: {
					type: 'project',
					entities: {
						documents: [
							{ id: documentId, project_id: projectId, title: 'Notes' } as any
						]
					},
					metadata: {},
					scope: { projectId }
				}
			};
			const updateDocumentDefinition: ChatToolDefinition = {
				name: 'update_onto_document',
				description: 'Update document',
				parameters: {
					type: 'object',
					properties: {
						document_id: { type: 'string' },
						content: { type: 'string' },
						props: { type: 'object' }
					},
					required: ['document_id']
				}
			};
			const updateProjectDefinition: ChatToolDefinition = {
				name: 'update_onto_project',
				description: 'Update project',
				parameters: {
					type: 'object',
					properties: {
						project_id: { type: 'string' },
						props: { type: 'object' }
					},
					required: ['project_id']
				}
			};
			mockToolExecutor.mockResolvedValue({ data: { ok: true } });

			await service.executeTool(
				{
					id: 'call_doc_props',
					name: 'update_onto_document',
					arguments: {
						document_id: documentId,
						props: {
							agent_workspace: { mode: 'living_reference' },
							reviewed: true
						}
					}
				},
				updateContext,
				[updateDocumentDefinition]
			);
			await service.executeTool(
				{
					id: 'call_project_props',
					name: 'update_onto_project',
					arguments: {
						project_id: projectId,
						props: {
							agent_workspace: {
								mode: 'living_reference',
								domain_profile: 'fiction_story'
							},
							color: 'blue'
						}
					}
				},
				updateContext,
				[updateProjectDefinition]
			);

			const documentArgs = mockToolExecutor.mock.calls[0]?.[1] as Record<string, any>;
			const projectArgs = mockToolExecutor.mock.calls[1]?.[1] as Record<string, any>;
			expect(documentArgs.props).toEqual({ reviewed: true });
			expect(projectArgs.props).toEqual({ color: 'blue' });
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
				contextLike(mockContext)
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
				contextLike(mockContext)
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

		it('returns the original result when the telemetry hook rejects', async () => {
			const rejectingTelemetryHook = vi
				.fn()
				.mockRejectedValue(new Error('telemetry sink unavailable'));
			const isolatedService = new ToolExecutionService(
				mockToolExecutor,
				rejectingTelemetryHook
			);
			const toolCall: ChatToolCall = {
				id: 'call_telemetry_rejection',
				name: 'list_onto_tasks',
				arguments: { project_id: 'proj_123' }
			};
			mockToolExecutor.mockResolvedValueOnce({ data: { tasks: [] } });

			const result = await isolatedService.executeTool(
				toolCall,
				mockContext,
				mockToolDefinitions
			);
			await Promise.resolve();

			expect(result).toEqual({
				success: true,
				data: { tasks: [] },
				toolName: 'list_onto_tasks',
				toolCallId: 'call_telemetry_rejection',
				entitiesAccessed: undefined,
				streamEvents: undefined,
				tokensUsed: undefined,
				metadata: undefined
			});
			expect(rejectingTelemetryHook).toHaveBeenCalledTimes(1);
		});

		it('does not implicitly retry executeTool when retry options are present', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_execute_without_retry',
				name: 'list_onto_tasks',
				arguments: { project_id: 'proj_123' }
			};
			mockToolExecutor.mockRejectedValue(new Error('Transient failure'));

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions, {
				retryCount: 3,
				retryDelay: 0
			});

			expect(result).toMatchObject({
				success: false,
				errorType: 'execution_error',
				toolName: 'list_onto_tasks',
				toolCallId: 'call_execute_without_retry'
			});
			expect(mockToolExecutor).toHaveBeenCalledTimes(1);
			expect(telemetryHook).toHaveBeenCalledTimes(1);
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

	describe('batchExecuteTools', () => {
		it('bounds concurrency while preserving input result order', async () => {
			const toolCalls: ChatToolCall[] = ['first', 'second', 'third'].map((query) => ({
				id: `call_${query}`,
				name: 'list_onto_projects',
				arguments: { query }
			}));
			let activeCount = 0;
			let peakActiveCount = 0;
			const releases = new Map<string, () => void>();
			mockToolExecutor.mockImplementation(
				(_toolName: string, args: Record<string, unknown>) =>
					new Promise((resolve) => {
						activeCount += 1;
						peakActiveCount = Math.max(peakActiveCount, activeCount);
						const query = String(args.query);
						releases.set(query, () => {
							activeCount -= 1;
							resolve({ data: { query } });
						});
					})
			);

			const resultsPromise = service.batchExecuteTools(
				toolCalls,
				mockContext,
				mockToolDefinitions,
				2
			);
			await vi.waitFor(() => expect(releases.size).toBe(2));
			releases.get('first')?.();
			await vi.waitFor(() => expect(releases.has('third')).toBe(true));
			releases.get('third')?.();
			releases.get('second')?.();

			const results = await resultsPromise;

			expect(peakActiveCount).toBe(2);
			expect(results.map((result) => result.toolCallId)).toEqual([
				'call_first',
				'call_second',
				'call_third'
			]);
			expect(results.map((result) => result.data)).toEqual([
				{ query: 'first' },
				{ query: 'second' },
				{ query: 'third' }
			]);
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

		it('should accept integer schema values and reject non-integers', () => {
			const toolDefs: ChatToolDefinition[] = [
				{
					name: 'search_things',
					description: 'Search things',
					parameters: {
						type: 'object',
						properties: {
							limit: { type: 'integer' }
						}
					}
				}
			];

			expect(
				service.validateToolCall(
					{ id: 'call_integer_ok', name: 'search_things', arguments: { limit: 3 } },
					toolDefs
				).isValid
			).toBe(true);

			const validation = service.validateToolCall(
				{ id: 'call_integer_bad', name: 'search_things', arguments: { limit: 2.5 } },
				toolDefs
			);

			expect(validation.isValid).toBe(false);
			expect(validation.errors).toContain(
				'Invalid type for parameter limit: expected integer, got number'
			);
		});

		it('should reject values outside schema enums', () => {
			const toolDefs: ChatToolDefinition[] = [
				{
					name: 'filter_things',
					description: 'Filter things',
					parameters: {
						type: 'object',
						properties: {
							kind: { type: 'string', enum: ['read', 'write'] }
						}
					}
				}
			];

			const validation = service.validateToolCall(
				{ id: 'call_enum_bad', name: 'filter_things', arguments: { kind: 'delete' } },
				toolDefs
			);

			expect(validation.isValid).toBe(false);
			expect(validation.errors).toContain(
				'Invalid value for parameter kind: expected one of "read", "write", got "delete"'
			);
		});

		it('should reject invalid project_id for create_calendar_event', () => {
			const toolDefs: ChatToolDefinition[] = [
				{
					name: 'create_calendar_event',
					description: 'Create calendar event',
					parameters: {
						type: 'object',
						properties: {
							title: { type: 'string' },
							start_at: { type: 'string' },
							project_id: { type: 'string' },
							calendar_scope: { type: 'string' }
						},
						required: ['title', 'start_at']
					}
				}
			];

			const toolCall: ChatToolCall = {
				id: 'call_calendar_invalid_project',
				name: 'create_calendar_event',
				arguments: {
					title: 'Project planning',
					start_at: '2026-03-03T10:00:00Z',
					calendar_scope: 'project',
					project_id: 'f'
				}
			};

			const validation = service.validateToolCall(toolCall, toolDefs);

			expect(validation.isValid).toBe(false);
			expect(validation.errors).toContain('Invalid project_id: expected UUID');
		});

		it('should reject invalid calendar_source_id for create_calendar_event', () => {
			const toolDefs: ChatToolDefinition[] = [
				{
					name: 'create_calendar_event',
					description: 'Create calendar event',
					parameters: {
						type: 'object',
						properties: {
							title: { type: 'string' },
							start_at: { type: 'string' },
							calendar_source_id: { type: 'string' }
						},
						required: ['title', 'start_at']
					}
				}
			];

			const validation = service.validateToolCall(
				{
					id: 'call_calendar_invalid_source',
					name: 'create_calendar_event',
					arguments: {
						title: 'Project planning',
						start_at: '2026-08-12T10:00:00Z',
						calendar_source_id: 'not-a-source-id'
					}
				},
				toolDefs
			);

			expect(validation.isValid).toBe(false);
			expect(validation.errors).toContain('Invalid calendar_source_id: expected UUID');
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

		it('does not mutate nested-format definitions (tasker/39 double-serialization regression)', () => {
			const nestedDefinition = {
				type: 'function',
				function: {
					name: 'update_onto_task',
					description: 'Update an existing task',
					parameters: {
						type: 'object',
						properties: { task_id: { type: 'string' } },
						required: ['task_id']
					}
				}
			} as unknown as ChatToolDefinition;
			const serializedBefore = JSON.stringify(nestedDefinition);

			const definition = service.getToolDefinition('update_onto_task', [nestedDefinition]);

			expect(definition).toBe(nestedDefinition);
			// The old normalizer copied function.name/description/parameters onto
			// the root of the shared singleton, doubling its serialized size for
			// every later prompt payload. The definition must round-trip untouched.
			expect(JSON.stringify(nestedDefinition)).toBe(serializedBefore);
			expect(Object.keys(nestedDefinition)).toEqual(['type', 'function']);
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

		it('should abort the executor context when tool execution times out', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_timeout_abort',
				name: 'list_onto_tasks',
				arguments: { project_id: 'proj_123' }
			};
			let capturedSignal: AbortSignal | undefined;

			mockToolExecutor.mockImplementationOnce(
				(_toolName: string, _args: Record<string, any>, context: ServiceContext) => {
					capturedSignal = context.abortSignal;
					return new Promise((_resolve, reject) => {
						context.abortSignal?.addEventListener(
							'abort',
							() => reject(new DOMException('Tool execution aborted', 'AbortError')),
							{ once: true }
						);
					});
				}
			);

			const result = await service.executeTool(toolCall, mockContext, mockToolDefinitions, {
				timeout: 10
			});

			expect(result).toMatchObject({
				success: false,
				errorType: 'timeout',
				error: expect.stringContaining('timeout')
			});
			expect(capturedSignal).toBeDefined();
			expect(capturedSignal?.aborted).toBe(true);
		});

		it('emits telemetry exactly once for every executeWithRetry attempt', async () => {
			const toolCall: ChatToolCall = {
				id: 'call_retry_telemetry',
				name: 'list_onto_tasks',
				arguments: { project_id: 'proj_123' }
			};
			mockToolExecutor
				.mockRejectedValueOnce(new Error('Transient failure one'))
				.mockRejectedValueOnce(new Error('Transient failure two'))
				.mockResolvedValueOnce({ data: { tasks: [] } });

			const result = await service.executeWithRetry(
				toolCall,
				mockContext,
				mockToolDefinitions,
				{ retryCount: 2, retryDelay: 0 }
			);

			expect(result).toMatchObject({
				success: true,
				data: { tasks: [] },
				toolName: 'list_onto_tasks',
				toolCallId: 'call_retry_telemetry'
			});
			expect(mockToolExecutor).toHaveBeenCalledTimes(3);
			expect(telemetryHook).toHaveBeenCalledTimes(3);
			expect(
				telemetryHook.mock.calls.map(([attemptResult]) => attemptResult.success)
			).toEqual([false, false, true]);
		});

		it('should cancel retry waits without starting another attempt', async () => {
			const controller = new AbortController();
			const toolCall: ChatToolCall = {
				id: 'call_retry_abort',
				name: 'list_onto_tasks',
				arguments: { project_id: 'proj_123' }
			};

			mockToolExecutor.mockImplementationOnce(async () => {
				controller.abort();
				throw new Error('Transient failure');
			});

			const result = await service.executeWithRetry(
				toolCall,
				mockContext,
				mockToolDefinitions,
				{
					retryCount: 2,
					retryDelay: 1000,
					abortSignal: controller.signal
				}
			);

			expect(result).toMatchObject({
				success: false,
				errorType: 'cancelled',
				error: 'Operation cancelled'
			});
			expect(mockToolExecutor).toHaveBeenCalledTimes(1);
		});
	});
});
