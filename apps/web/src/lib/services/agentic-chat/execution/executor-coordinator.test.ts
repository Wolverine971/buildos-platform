// apps/web/src/lib/services/agentic-chat/execution/executor-coordinator.test.ts
/**
 * Test Suite for ExecutorCoordinator
 *
 * Validates executor spawning, execution coordination, and failure handling.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ExecutorCoordinator } from './executor-coordinator';
import type {
	ServiceContext,
	PlannerContext,
	AgentPlan,
	PlanStep,
	ExecutorSpawnParams,
	PersistenceOperations
} from '../shared/types';
import type {
	AgentExecutorService,
	ExecutorResult as AgentExecutorRunResult
} from '../../agent-executor-service';

describe('ExecutorCoordinator', () => {
	let coordinator: ExecutorCoordinator;
	let mockExecutorService: { executeTask: Mock };
	let mockPersistence: PersistenceOperations;
	let baseContext: ServiceContext;
	let plannerContext: PlannerContext;
	let plan: AgentPlan;
	let step: PlanStep;

	beforeEach(() => {
		mockExecutorService = {
			executeTask: vi.fn()
		};

		mockPersistence = {
			createAgent: vi.fn().mockResolvedValue('executor_123'),
			updateAgent: vi.fn().mockResolvedValue(undefined),
			getAgent: vi.fn(),
			createPlan: vi.fn(),
			updatePlan: vi.fn(),
			getPlan: vi.fn(),
			createChatSession: vi.fn(),
			updateChatSession: vi.fn(),
			getChatSession: vi.fn(),
			saveMessage: vi.fn(),
			getMessages: vi.fn().mockResolvedValue([])
		};

		coordinator = new ExecutorCoordinator(
			mockExecutorService as unknown as AgentExecutorService,
			mockPersistence,
			{ defaultExecutorModel: 'deepseek/deepseek-coder' }
		);

		baseContext = {
			sessionId: 'session_123',
			userId: 'user_123',
			plannerAgentId: 'planner_123',
			contextType: 'project',
			entityId: 'project_123',
			conversationHistory: []
		};

		plannerContext = {
			systemPrompt: 'You are a planner',
			conversationHistory: [],
			locationContext: 'Project workspace',
			availableTools: [
				{ name: 'list_onto_tasks', description: 'List ontology tasks', parameters: {} },
				{ name: 'analyze_project', description: 'Analyze project metrics', parameters: {} }
			],
			metadata: {
				sessionId: 'session_123',
				contextType: 'project',
				hasOntology: false,
				totalTokens: 1000,
				plannerAgentId: 'planner_123'
			}
		};

		plan = {
			id: 'plan_123',
			sessionId: 'session_123',
			userId: 'user_123',
			plannerAgentId: 'planner_123',
			userMessage: 'Analyze the project health',
			strategy: 'planner_stream',
			status: 'pending',
			steps: [],
			createdAt: new Date(),
			metadata: {}
		};

		step = {
			stepNumber: 1,
			type: 'analysis',
			description: 'Analyze project performance',
			executorRequired: true,
			tools: ['analyze_project'],
			status: 'pending'
		};
	});

	function buildSpawnParams(previousResults?: Record<number, any>): ExecutorSpawnParams {
		return {
			plan,
			step,
			plannerContext,
			previousStepResults: new Map(
				Object.entries(previousResults ?? {}).map(([key, value]) => [Number(key), value])
			)
		};
	}

	it('spawns executor and returns successful execution result', async () => {
		const mockRunResult: AgentExecutorRunResult = {
			executorId: 'executor_123',
			success: true,
			data: { summary: 'Project health score: 85%' },
			error: undefined,
			durationMs: 1200,
			tokensUsed: 450,
			toolCallsMade: 2
		};

		mockExecutorService.executeTask.mockResolvedValueOnce(mockRunResult);

		const executorId = await coordinator.spawnExecutor(buildSpawnParams(), baseContext);

		expect(executorId).toBe('executor_123');
		expect(mockPersistence.createAgent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'executor',
				permissions: 'read_only',
				created_for_plan: plan.id
			})
		);

		const result = await coordinator.waitForExecutor(executorId);

		expect(result.success).toBe(true);
		expect(result.executorId).toBe('executor_123');
		expect(result.data).toEqual(mockRunResult.data);
		expect(result.metadata).toEqual(
			expect.objectContaining({ tokensUsed: 450, toolCallsMade: 2 })
		);

		expect(mockPersistence.updateAgent).toHaveBeenCalledWith(
			'executor_123',
			expect.objectContaining({ status: 'completed' })
		);
	});

	it('handles executor failures gracefully', async () => {
		mockExecutorService.executeTask.mockRejectedValueOnce(new Error('LLM failure'));

		const executorId = await coordinator.spawnExecutor(buildSpawnParams(), baseContext);
		const result = await coordinator.waitForExecutor(executorId);

		expect(result.success).toBe(false);
		expect(result.error).toBe('LLM failure');

		expect(mockPersistence.updateAgent).toHaveBeenCalledWith(
			'executor_123',
			expect.objectContaining({ status: 'error' })
		);
	});

	it('throws when requesting unknown executor', async () => {
		await expect(coordinator.waitForExecutor('missing')).rejects.toThrow(
			'Executor missing not found'
		);
	});

	it('includes previous step results in executor context', async () => {
		const previousResults = { 1: { data: 'step data' } };

		mockExecutorService.executeTask.mockImplementationOnce(async (params) => {
			expect(params.task.contextData).toMatchObject({
				1: previousResults[1],
				contextType: baseContext.contextType
			});
			return {
				executorId: params.executorId,
				success: true,
				data: {},
				error: undefined,
				durationMs: 0,
				tokensUsed: 0,
				toolCallsMade: 0
			};
		});

		const executorId = await coordinator.spawnExecutor(
			buildSpawnParams(previousResults),
			baseContext
		);
		await coordinator.waitForExecutor(executorId);
	});
});
