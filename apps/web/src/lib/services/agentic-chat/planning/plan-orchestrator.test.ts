// apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.test.ts
/**
 * Test Suite for PlanOrchestrator
 *
 * Tests the plan creation and orchestration logic for the agentic chat system.
 * Validates plan generation, step coordination, and execution flow.
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md}
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { PlanOrchestrator, type PlanIntent } from './plan-orchestrator';
import { ChatStrategy } from '$lib/types/agent-chat-enhancement';
import type {
	ServiceContext,
	PlannerContext,
	AgentPlan,
	PlanStep,
	StreamCallback,
	StreamEvent,
	ToolExecutionResult,
	ExecutorResult
} from '../shared/types';

describe('PlanOrchestrator', () => {
	let orchestrator: PlanOrchestrator;
	let mockLLMService: {
		generateText: Mock;
		generateStream: Mock;
	};
	let mockToolExecutor: Mock;
	let mockExecutorCoordinator: {
		spawnExecutor: Mock;
		waitForExecutor: Mock;
	};
	let mockPersistence: {
		createPlan: Mock;
		updatePlan: Mock;
		getPlan: Mock;
		updatePlanStep: Mock;
	};
	let mockContext: ServiceContext;
	let mockPlannerContext: PlannerContext;

	beforeEach(() => {
		// Setup mocks
		mockLLMService = {
			generateText: vi.fn(),
			generateStream: vi.fn()
		};

		mockToolExecutor = vi.fn();

		mockExecutorCoordinator = {
			spawnExecutor: vi.fn(),
			waitForExecutor: vi.fn()
		};

		mockPersistence = {
			createPlan: vi.fn(),
			updatePlan: vi.fn(),
			getPlan: vi.fn(),
			updatePlanStep: vi.fn()
		};

		orchestrator = new PlanOrchestrator(
			mockLLMService as any,
			mockToolExecutor,
			mockExecutorCoordinator as any,
			mockPersistence as any,
			undefined
		);

		// Setup contexts
		mockContext = {
			sessionId: 'session_123',
			userId: 'user_123',
			contextType: 'project',
			entityId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
			plannerAgentId: 'planner_123',
			conversationHistory: []
		};

		mockPlannerContext = {
			systemPrompt: 'You are an AI assistant',
			conversationHistory: [],
			locationContext: 'Project: Test Project',
			availableTools: [
				{
					name: 'list_onto_tasks',
					description: 'List tasks',
					parameters: {
						type: 'object',
						properties: {
							project_id: { type: 'string' },
							state_key: { type: 'string' },
							limit: { type: 'number' }
						}
					}
				},
				{
					name: 'create_onto_task',
					description: 'Create task',
					parameters: {
						type: 'object',
						properties: {
							project_id: { type: 'string' },
							title: { type: 'string' },
							description: { type: 'string' }
						},
						required: ['project_id', 'title']
					}
				},
				{
					name: 'create_onto_project',
					description: 'Create project',
					parameters: {
						type: 'object',
						properties: {
							name: { type: 'string' }
						},
						required: ['name']
					}
				},
				{
					name: 'get_linked_entities',
					description: 'Get linked entities',
					parameters: {
						type: 'object',
						properties: {
							entity_id: { type: 'string' },
							entity_kind: { type: 'string' },
							filter_kind: { type: 'string' }
						},
						required: ['entity_id', 'entity_kind']
					}
				}
			],
			metadata: {
				sessionId: 'session_123',
				contextType: 'project',
				totalTokens: 1000,
				hasOntology: false,
				plannerAgentId: 'planner_123'
			}
		};
	});

	describe('createPlan', () => {
		it('should create a simple research plan', async () => {
			const mockPlanResponse = {
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'List all tasks',
						tools: ['list_onto_tasks'],
						executorRequired: false
					}
				],
				reasoning: 'Simple query that needs one tool call'
			};

			mockLLMService.generateText.mockResolvedValueOnce(JSON.stringify(mockPlanResponse));

			mockPersistence.createPlan.mockResolvedValueOnce('plan_123');

			const plan = await orchestrator.createPlan(
				'Show me all tasks',
				ChatStrategy.PLANNER_STREAM,
				mockPlannerContext,
				mockContext
			);

			expect(plan).toBeDefined();
			expect(plan.strategy).toBe(ChatStrategy.PLANNER_STREAM);
			expect(plan.steps).toHaveLength(1);
			expect(plan.steps[0].tools).toContain('list_onto_tasks');
			expect(mockPersistence.createPlan).toHaveBeenCalled();
			expect(mockPersistence.createPlan).toHaveBeenCalledWith(
				expect.objectContaining({ strategy: 'planner_stream' })
			);
		});

		it('should create a complex research plan with multiple steps', async () => {
			const mockPlanResponse = {
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Gather project data',
						tools: ['get_onto_project_details', 'list_onto_tasks'],
						executorRequired: false
					},
					{
						stepNumber: 2,
						type: 'analysis',
						description: 'Analyze project health',
						tools: [],
						executorRequired: true,
						dependsOn: [1]
					},
					{
						stepNumber: 3,
						type: 'synthesis',
						description: 'Generate report',
						tools: ['generate_report'],
						executorRequired: false,
						dependsOn: [2]
					}
				],
				reasoning: 'Complex analysis requiring multiple steps and coordination'
			};

			mockLLMService.generateText.mockResolvedValueOnce(JSON.stringify(mockPlanResponse));

			mockPersistence.createPlan.mockResolvedValueOnce('plan_456');

			const plan = await orchestrator.createPlan(
				'Analyze project health and generate report',
				ChatStrategy.PLANNER_STREAM,
				mockPlannerContext,
				mockContext
			);

			expect(plan.strategy).toBe(ChatStrategy.PLANNER_STREAM);
			expect(plan.steps).toHaveLength(3);
			expect(plan.steps[1].executorRequired).toBe(true);
			expect(plan.steps[2].dependsOn).toContain(2);
			expect(mockPersistence.createPlan).toHaveBeenCalledWith(
				expect.objectContaining({ strategy: 'planner_stream' })
			);
		});

		it('should handle invalid plan generation', async () => {
			mockLLMService.generateText.mockResolvedValueOnce('Invalid JSON');

			await expect(
				orchestrator.createPlan(
					'Test message',
					ChatStrategy.PLANNER_STREAM,
					mockPlannerContext,
					mockContext
				)
			).rejects.toThrow();
		});

		it('should validate plan steps', async () => {
			const mockPlanResponse = {
				steps: [
					{
						// Missing required fields
						stepNumber: 1,
						description: 'Test step'
					}
				]
			};

			mockLLMService.generateText.mockResolvedValueOnce(JSON.stringify(mockPlanResponse));

			const plan = await orchestrator.createPlan(
				'Test',
				ChatStrategy.PLANNER_STREAM,
				mockPlannerContext,
				mockContext
			);

			// Should have defaults filled in
			expect(plan.steps[0].type).toBeDefined();
			expect(plan.steps[0].tools).toBeDefined();
			expect(plan.steps[0].executorRequired).toBeDefined();
			expect(plan.steps[0].status).toBe('pending');
		});
	});

	describe('createPlanFromIntent', () => {
		it('applies execution metadata from intent', async () => {
			const mockPlanResponse = {
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Collect requirements',
						tools: ['list_onto_tasks'],
						executorRequired: false
					},
					{
						stepNumber: 2,
						type: 'action',
						description: 'Create project',
						tools: ['create_onto_project'],
						executorRequired: true
					}
				],
				reasoning: 'Plan with template selection and creation'
			};

			mockLLMService.generateText.mockResolvedValueOnce(JSON.stringify(mockPlanResponse));

			const intent: PlanIntent = {
				objective: 'Launch a new project',
				contextType: 'project',
				sessionId: mockContext.sessionId,
				userId: mockContext.userId,
				plannerAgentId: 'planner_123',
				executionMode: 'draft_only',
				requestedOutputs: ['context doc'],
				priorityEntities: ['proj_alpha']
			};

			const plan = await orchestrator.createPlanFromIntent(
				intent,
				mockPlannerContext,
				mockContext
			);

			expect(plan.metadata?.executionMode).toBe('draft_only');
			expect(plan.metadata?.requestedOutputs).toContain('context doc');
			expect(plan.steps).toHaveLength(2);
		});

		it('enforces project_create requirements', async () => {
			const invalidPlan = {
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Collect context only',
						tools: ['list_onto_tasks'],
						executorRequired: false
					}
				]
			};

			mockLLMService.generateText.mockResolvedValueOnce(JSON.stringify(invalidPlan));

			const intent: PlanIntent = {
				objective: 'Start a new project',
				contextType: 'project_create',
				sessionId: mockContext.sessionId,
				userId: mockContext.userId,
				plannerAgentId: 'planner_123'
			};

			await expect(
				orchestrator.createPlanFromIntent(intent, mockPlannerContext, mockContext)
			).rejects.toThrow('create_onto_project');
		});
	});

	describe('executePlan', () => {
		let mockPlan: AgentPlan;

		beforeEach(() => {
			mockPlan = {
				id: 'plan_123',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Test message',
				strategy: ChatStrategy.PLANNER_STREAM,
				status: 'pending',
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'List tasks',
						executorRequired: false,
						tools: ['list_onto_tasks'],
						status: 'pending'
					},
					{
						stepNumber: 2,
						type: 'action',
						description: 'Create task',
						executorRequired: false,
						tools: ['create_onto_task'],
						status: 'pending',
						dependsOn: [1]
					}
				],
				createdAt: new Date()
			};
		});

		it('should execute plan steps in order', async () => {
			const events: StreamEvent[] = [];
			const callback: StreamCallback = async (event) => {
				events.push(event);
			};

			// Mock tool executions
			mockToolExecutor
				.mockResolvedValueOnce({
					data: { tasks: [{ id: 'task_1', title: 'Task 1' }] }
				})
				.mockResolvedValueOnce({
					data: { task_id: 'task_new' }
				});

			mockPersistence.updatePlan.mockResolvedValue(undefined);

			const generator = orchestrator.executePlan(
				mockPlan,
				mockPlannerContext,
				mockContext,
				callback
			);

			const results = [];
			for await (const event of generator) {
				results.push(event);
			}

			// Verify step execution events
			const stepStartEvents = events.filter((e) => e.type === 'step_start');
			expect(stepStartEvents).toHaveLength(2);

			const stepCompleteEvents = events.filter((e) => e.type === 'step_complete');
			expect(stepCompleteEvents).toHaveLength(2);

			// Verify persistence updates
			expect(mockPersistence.updatePlan).toHaveBeenCalled();
		});

		it('uses project focus when context scope is missing', async () => {
			const projectId = '9f3c2e7a-5d5b-4db6-8a4a-6c6b41f29d9b';
			const focusContext: ServiceContext = {
				...mockContext,
				contextType: 'general',
				entityId: undefined,
				projectFocus: {
					projectId,
					projectName: 'Focused Project',
					focusType: 'project-wide',
					focusEntityId: null,
					focusEntityName: null
				},
				contextScope: undefined
			};

			const focusPlan: AgentPlan = {
				id: 'plan_focus',
				sessionId: focusContext.sessionId,
				userId: focusContext.userId,
				plannerAgentId: 'planner_123',
				userMessage: 'List tasks',
				strategy: ChatStrategy.PLANNER_STREAM,
				status: 'pending',
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'List tasks',
						executorRequired: false,
						tools: ['list_onto_tasks'],
						status: 'pending'
					}
				],
				createdAt: new Date()
			};

			mockToolExecutor.mockResolvedValueOnce({ data: { tasks: [] } });
			mockPersistence.updatePlan.mockResolvedValue(undefined);

			const generator = orchestrator.executePlan(
				focusPlan,
				mockPlannerContext,
				focusContext,
				async () => {}
			);

			for await (const event of generator) {
				// Consume stream
			}

			expect(mockToolExecutor).toHaveBeenCalled();
			const [toolName, args] = mockToolExecutor.mock.calls[0];
			expect(toolName).toBe('list_onto_tasks');
			expect(args.project_id).toBe(projectId);
		});

		it('does not inject project_id for get_linked_entities', async () => {
			const projectId = '4d7d1e9c-6fd5-4c4e-8fa6-2b9dfe18d5f6';
			const entityId = '0c7bdb4f-934c-4e75-a6b0-3b9b36fa4b1d';
			const focusContext: ServiceContext = {
				...mockContext,
				contextType: 'general',
				entityId: undefined,
				projectFocus: {
					projectId,
					projectName: 'Focused Project',
					focusType: 'task',
					focusEntityId: entityId,
					focusEntityName: 'Test Task'
				},
				contextScope: {
					projectId
				}
			};

			const focusPlan: AgentPlan = {
				id: 'plan_links',
				sessionId: focusContext.sessionId,
				userId: focusContext.userId,
				plannerAgentId: 'planner_123',
				userMessage: 'Show linked entities',
				strategy: ChatStrategy.PLANNER_STREAM,
				status: 'pending',
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Get linked entities',
						executorRequired: false,
						tools: ['get_linked_entities'],
						status: 'pending',
						metadata: {
							toolArguments: {
								entity_id: entityId,
								entity_kind: 'task'
							}
						}
					}
				],
				createdAt: new Date()
			};

			mockToolExecutor.mockResolvedValueOnce({ data: { linked_entities: [] } });
			mockPersistence.updatePlan.mockResolvedValue(undefined);

			const generator = orchestrator.executePlan(
				focusPlan,
				mockPlannerContext,
				focusContext,
				async () => {}
			);

			for await (const event of generator) {
				// Consume stream
			}

			expect(mockToolExecutor).toHaveBeenCalled();
			const [, args] = mockToolExecutor.mock.calls[0];
			expect(args).not.toHaveProperty('project_id');
		});

		it('should emit tool events for direct tool steps', async () => {
			const events: StreamEvent[] = [];
			mockToolExecutor
				.mockResolvedValueOnce({ data: { tasks: [] } })
				.mockResolvedValueOnce({ data: { task_id: 'task_new' } });

			const generator = orchestrator.executePlan(
				mockPlan,
				mockPlannerContext,
				mockContext,
				async (event) => events.push(event)
			);

			const yielded: StreamEvent[] = [];
			for await (const event of generator) {
				yielded.push(event);
			}

			const allEvents = [...events, ...yielded];
			const toolCallEvents = allEvents.filter((event) => event.type === 'tool_call');
			const toolResultEvents = allEvents.filter((event) => event.type === 'tool_result');

			expect(toolCallEvents.length).toBeGreaterThan(0);
			expect(toolResultEvents.length).toBeGreaterThan(0);
		});

		it('should handle executor-required steps', async () => {
			mockPlan.steps[0].executorRequired = true;

			const callback: StreamCallback = async () => {};

			mockExecutorCoordinator.spawnExecutor.mockResolvedValueOnce('executor_123');
			mockExecutorCoordinator.waitForExecutor.mockResolvedValueOnce({
				success: true,
				data: { analysis: 'Complete' },
				executorId: 'executor_123',
				taskId: 'task_123'
			});

			const generator = orchestrator.executePlan(
				mockPlan,
				mockPlannerContext,
				mockContext,
				callback
			);

			const events = [];
			for await (const event of generator) {
				events.push(event);
			}

			expect(mockExecutorCoordinator.spawnExecutor).toHaveBeenCalledWith(
				expect.objectContaining({
					plan: mockPlan,
					step: mockPlan.steps[0]
				}),
				mockContext
			);

			expect(mockExecutorCoordinator.spawnExecutor).toHaveBeenCalled();
			expect(mockExecutorCoordinator.waitForExecutor).toHaveBeenCalledWith('executor_123');

			const executorEvent = events.find((e) => e.type === 'executor_spawned');
			expect(executorEvent).toBeDefined();
		});

		it('should handle step failures gracefully', async () => {
			const events: StreamEvent[] = [];
			const callback: StreamCallback = async (event) => {
				events.push(event);
			};

			// First tool fails
			mockToolExecutor.mockRejectedValueOnce(new Error('Tool execution failed'));

			const generator = orchestrator.executePlan(
				mockPlan,
				mockPlannerContext,
				mockContext,
				callback
			);

			const results = [];
			for await (const event of generator) {
				results.push(event);
			}

			// Should have failure event
			const stepCompleteEvents = events.filter((e) => e.type === 'step_complete');
			expect(stepCompleteEvents[0].step.status).toBe('failed');
			expect(stepCompleteEvents[0].step.error).toContain('Tool execution failed');

			// Should stop execution after failure (step 2 depends on step 1)
			expect(stepCompleteEvents).toHaveLength(1);
		});

		it('should respect step dependencies', async () => {
			mockPlan.steps.push({
				stepNumber: 3,
				type: 'synthesis',
				description: 'Synthesize results',
				executorRequired: false,
				tools: [],
				status: 'pending',
				dependsOn: [1, 2]
			});

			const executionOrder: number[] = [];

			mockToolExecutor.mockImplementation(async (toolName) => {
				const stepNumber =
					toolName === 'list_onto_tasks' ? 1 : toolName === 'create_onto_task' ? 2 : 3;
				executionOrder.push(stepNumber);
				return { data: { result: 'success' } };
			});

			const generator = orchestrator.executePlan(
				mockPlan,
				mockPlannerContext,
				mockContext,
				async () => {}
			);

			for await (const event of generator) {
				// Process events
			}

			// Verify execution order respects dependencies
			expect(executionOrder[0]).toBe(1); // Step 1 first
			expect(executionOrder[1]).toBe(2); // Step 2 depends on 1
			// Step 3 would execute after both 1 and 2
		});
	});

	describe('persistDraft', () => {
		it('marks plan as pending review and persists metadata', async () => {
			const plan: AgentPlan = {
				id: 'plan_pending',
				sessionId: mockContext.sessionId,
				userId: mockContext.userId,
				plannerAgentId: 'planner_123',
				userMessage: 'Test',
				strategy: ChatStrategy.PLANNER_STREAM,
				status: 'pending',
				steps: [],
				createdAt: new Date()
			};

			await orchestrator.persistDraft(plan);

			expect(plan.status).toBe('pending_review');
			expect(plan.metadata?.draftSavedAt).toBeDefined();
			expect(mockPersistence.updatePlan).toHaveBeenCalledWith(
				plan.id,
				expect.objectContaining({
					status: 'pending_review',
					metadata: expect.objectContaining({
						draftSavedAt: expect.any(String)
					})
				})
			);
		});
	});

	describe('reviewPlan', () => {
		it('returns reviewer verdict from LLM output', async () => {
			mockLLMService.generateText.mockResolvedValueOnce(
				JSON.stringify({ verdict: 'approved', notes: 'Looks solid.' })
			);

			const plan: AgentPlan = {
				id: 'plan_review',
				sessionId: mockContext.sessionId,
				userId: mockContext.userId,
				plannerAgentId: 'planner_123',
				userMessage: 'Test',
				strategy: ChatStrategy.PLANNER_STREAM,
				status: 'pending',
				steps: [],
				createdAt: new Date()
			};

			const intent: PlanIntent = {
				objective: 'Review me',
				contextType: 'project',
				sessionId: mockContext.sessionId,
				userId: mockContext.userId,
				plannerAgentId: 'planner_123'
			};

			const verdict = await orchestrator.reviewPlan(plan, intent, mockContext);

			expect(verdict.verdict).toBe('approved');
			expect(verdict.notes).toContain('Looks solid');
		});

		it('falls back to approval when reviewer fails', async () => {
			mockLLMService.generateText.mockRejectedValueOnce(new Error('LLM offline'));

			const plan: AgentPlan = {
				id: 'plan_review_error',
				sessionId: mockContext.sessionId,
				userId: mockContext.userId,
				plannerAgentId: 'planner_123',
				userMessage: 'Test',
				strategy: ChatStrategy.PLANNER_STREAM,
				status: 'pending',
				steps: [],
				createdAt: new Date()
			};

			const intent: PlanIntent = {
				objective: 'Review me',
				contextType: 'project',
				sessionId: mockContext.sessionId,
				userId: mockContext.userId,
				plannerAgentId: 'planner_123'
			};

			const verdict = await orchestrator.reviewPlan(plan, intent, mockContext);
			expect(verdict.verdict).toBe('approved');
			expect(verdict.notes).toContain('approving');
		});
	});

	describe('validatePlan', () => {
		it('should validate a correct plan', () => {
			const plan: AgentPlan = {
				id: 'plan_123',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Test',
				strategy: ChatStrategy.PLANNER_STREAM,
				status: 'pending',
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Valid step',
						executorRequired: false,
						tools: ['tool1'],
						status: 'pending'
					}
				],
				createdAt: new Date()
			};

			const validation = orchestrator.validatePlan(plan);

			expect(validation.isValid).toBe(true);
			expect(validation.errors).toHaveLength(0);
		});

		it('should detect missing steps', () => {
			const plan: AgentPlan = {
				id: 'plan_456',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Test',
				strategy: ChatStrategy.PLANNER_STREAM,
				status: 'pending',
				steps: [],
				createdAt: new Date()
			};

			const validation = orchestrator.validatePlan(plan);

			expect(validation.isValid).toBe(false);
			expect(validation.errors).toContain('Plan has no steps');
		});

		it('should detect duplicate step numbers', () => {
			const plan: AgentPlan = {
				id: 'plan_789',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Test',
				strategy: ChatStrategy.PLANNER_STREAM,
				status: 'pending',
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Step 1',
						executorRequired: false,
						tools: [],
						status: 'pending'
					},
					{
						stepNumber: 1, // Duplicate
						type: 'action',
						description: 'Also Step 1',
						executorRequired: false,
						tools: [],
						status: 'pending'
					}
				],
				createdAt: new Date()
			};

			const validation = orchestrator.validatePlan(plan);

			expect(validation.isValid).toBe(false);
			expect(validation.errors).toContain('Duplicate step number: 1');
		});

		it('should detect invalid dependencies', () => {
			const plan: AgentPlan = {
				id: 'plan_dep',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Test',
				strategy: ChatStrategy.PLANNER_STREAM,
				status: 'pending',
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Step 1',
						executorRequired: false,
						tools: [],
						status: 'pending',
						dependsOn: [2] // Depends on future step
					},
					{
						stepNumber: 2,
						type: 'action',
						description: 'Step 2',
						executorRequired: false,
						tools: [],
						status: 'pending'
					}
				],
				createdAt: new Date()
			};

			const validation = orchestrator.validatePlan(plan);

			expect(validation.isValid).toBe(false);
			expect(validation.errors[0]).toContain('invalid dependency');
		});

		it('should detect circular dependencies', () => {
			const plan: AgentPlan = {
				id: 'plan_circular',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Test',
				strategy: ChatStrategy.PLANNER_STREAM,
				status: 'pending',
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Step 1',
						executorRequired: false,
						tools: [],
						status: 'pending',
						dependsOn: [2]
					},
					{
						stepNumber: 2,
						type: 'action',
						description: 'Step 2',
						executorRequired: false,
						tools: [],
						status: 'pending',
						dependsOn: [1] // Circular dependency
					}
				],
				createdAt: new Date()
			};

			const validation = orchestrator.validatePlan(plan);

			expect(validation.isValid).toBe(false);
		});
	});

	describe('optimizePlan', () => {
		it('should identify parallelizable steps', async () => {
			const plan: AgentPlan = {
				id: 'plan_opt',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Test',
				strategy: ChatStrategy.PLANNER_STREAM,
				status: 'pending',
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Fetch data A',
						executorRequired: false,
						tools: ['tool_a'],
						status: 'pending'
					},
					{
						stepNumber: 2,
						type: 'research',
						description: 'Fetch data B',
						executorRequired: false,
						tools: ['tool_b'],
						status: 'pending'
						// No dependency on step 1, can run in parallel
					},
					{
						stepNumber: 3,
						type: 'synthesis',
						description: 'Combine results',
						executorRequired: false,
						tools: ['combine'],
						status: 'pending',
						dependsOn: [1, 2]
					}
				],
				createdAt: new Date()
			};

			const optimized = await orchestrator.optimizePlan(plan);

			// Steps 1 and 2 should be marked as parallelizable
			const parallelGroups = orchestrator.getParallelExecutionGroups(optimized);
			expect(parallelGroups[0]).toContain(1);
			expect(parallelGroups[0]).toContain(2);
			expect(parallelGroups[1]).toContain(3);
		});

		it('should respect dependencies when optimizing', async () => {
			const plan: AgentPlan = {
				id: 'plan_dep_opt',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Test',
				strategy: ChatStrategy.PLANNER_STREAM,
				status: 'pending',
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Step 1',
						executorRequired: false,
						tools: ['tool1'],
						status: 'pending'
					},
					{
						stepNumber: 2,
						type: 'action',
						description: 'Step 2',
						executorRequired: false,
						tools: ['tool2'],
						status: 'pending',
						dependsOn: [1]
					},
					{
						stepNumber: 3,
						type: 'action',
						description: 'Step 3',
						executorRequired: false,
						tools: ['tool3'],
						status: 'pending',
						dependsOn: [2]
					}
				],
				createdAt: new Date()
			};

			const optimized = await orchestrator.optimizePlan(plan);
			const parallelGroups = orchestrator.getParallelExecutionGroups(optimized);

			// All steps must execute sequentially
			expect(parallelGroups).toHaveLength(3);
			expect(parallelGroups[0]).toEqual([1]);
			expect(parallelGroups[1]).toEqual([2]);
			expect(parallelGroups[2]).toEqual([3]);
		});
	});

	describe('getParallelExecutionGroups', () => {
		it('should group independent steps', () => {
			const plan: AgentPlan = {
				id: 'plan_group',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Test',
				strategy: ChatStrategy.PLANNER_STREAM,
				status: 'pending',
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Independent 1',
						executorRequired: false,
						tools: [],
						status: 'pending'
					},
					{
						stepNumber: 2,
						type: 'research',
						description: 'Independent 2',
						executorRequired: false,
						tools: [],
						status: 'pending'
					},
					{
						stepNumber: 3,
						type: 'synthesis',
						description: 'Depends on both',
						executorRequired: false,
						tools: [],
						status: 'pending',
						dependsOn: [1, 2]
					}
				],
				createdAt: new Date()
			};

			const groups = orchestrator.getParallelExecutionGroups(plan);

			expect(groups).toHaveLength(2);
			expect(groups[0]).toContain(1);
			expect(groups[0]).toContain(2);
			expect(groups[1]).toContain(3);
		});
	});
});
