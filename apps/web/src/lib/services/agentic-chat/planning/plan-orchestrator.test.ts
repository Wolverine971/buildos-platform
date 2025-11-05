/**
 * Test Suite for PlanOrchestrator
 *
 * Tests the plan creation and orchestration logic for the agentic chat system.
 * Validates plan generation, step coordination, and execution flow.
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md}
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { PlanOrchestrator } from './plan-orchestrator';
import { ChatStrategy, PlanningStrategy } from '$lib/types/agent-chat-enhancement';
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
			mockPersistence as any
		);

		// Setup contexts
		mockContext = {
			sessionId: 'session_123',
			userId: 'user_123',
			contextType: 'project',
			entityId: 'proj_123',
			conversationHistory: []
		};

		mockPlannerContext = {
			systemPrompt: 'You are an AI assistant',
			conversationHistory: [],
			locationContext: 'Project: Test Project',
			availableTools: [
				{ name: 'list_tasks', description: 'List tasks', parameters: {} },
				{ name: 'create_task', description: 'Create task', parameters: {} }
			],
			metadata: {
				sessionId: 'session_123',
				contextType: 'project',
				totalTokens: 1000,
				hasOntology: false
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
						tools: ['list_tasks'],
						executorRequired: false
					}
				],
				reasoning: 'Simple query that needs one tool call'
			};

			mockLLMService.generateText.mockResolvedValueOnce(JSON.stringify(mockPlanResponse));

			mockPersistence.createPlan.mockResolvedValueOnce('plan_123');

			const plan = await orchestrator.createPlan(
				'Show me all tasks',
				ChatStrategy.SIMPLE_RESEARCH,
				mockPlannerContext,
				mockContext
			);

			expect(plan).toBeDefined();
			expect(plan.strategy).toBe(ChatStrategy.SIMPLE_RESEARCH);
			expect(plan.steps).toHaveLength(1);
			expect(plan.steps[0].tools).toContain('list_tasks');
			expect(mockPersistence.createPlan).toHaveBeenCalled();
		});

		it('should create a complex research plan with multiple steps', async () => {
			const mockPlanResponse = {
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Gather project data',
						tools: ['get_project', 'list_tasks'],
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
				ChatStrategy.COMPLEX_RESEARCH,
				mockPlannerContext,
				mockContext
			);

			expect(plan.strategy).toBe(ChatStrategy.COMPLEX_RESEARCH);
			expect(plan.steps).toHaveLength(3);
			expect(plan.steps[1].executorRequired).toBe(true);
			expect(plan.steps[2].dependsOn).toContain(2);
		});

		it('should handle invalid plan generation', async () => {
			mockLLMService.generateText.mockResolvedValueOnce('Invalid JSON');

			await expect(
				orchestrator.createPlan(
					'Test message',
					ChatStrategy.SIMPLE_RESEARCH,
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
				ChatStrategy.SIMPLE_RESEARCH,
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

	describe('executePlan', () => {
		let mockPlan: AgentPlan;

		beforeEach(() => {
			mockPlan = {
				id: 'plan_123',
				sessionId: 'session_123',
				userId: 'user_123',
				userMessage: 'Test message',
				strategy: ChatStrategy.SIMPLE_RESEARCH,
				status: 'pending',
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'List tasks',
						executorRequired: false,
						tools: ['list_tasks'],
						status: 'pending'
					},
					{
						stepNumber: 2,
						type: 'action',
						description: 'Create task',
						executorRequired: false,
						tools: ['create_task'],
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
					tasks: [{ id: 'task_1', title: 'Task 1' }]
				})
				.mockResolvedValueOnce({
					task_id: 'task_new'
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
					toolName === 'list_tasks' ? 1 : toolName === 'create_task' ? 2 : 3;
				executionOrder.push(stepNumber);
				return { result: 'success' };
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

	describe('validatePlan', () => {
		it('should validate a correct plan', () => {
			const plan: AgentPlan = {
				id: 'plan_123',
				sessionId: 'session_123',
				userId: 'user_123',
				userMessage: 'Test',
				strategy: ChatStrategy.SIMPLE_RESEARCH,
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
				userMessage: 'Test',
				strategy: ChatStrategy.SIMPLE_RESEARCH,
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
				userMessage: 'Test',
				strategy: ChatStrategy.COMPLEX_RESEARCH,
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
				userMessage: 'Test',
				strategy: ChatStrategy.COMPLEX_RESEARCH,
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
				userMessage: 'Test',
				strategy: ChatStrategy.COMPLEX_RESEARCH,
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
				userMessage: 'Test',
				strategy: ChatStrategy.COMPLEX_RESEARCH,
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
				userMessage: 'Test',
				strategy: ChatStrategy.COMPLEX_RESEARCH,
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
				userMessage: 'Test',
				strategy: ChatStrategy.COMPLEX_RESEARCH,
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
