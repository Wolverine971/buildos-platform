/**
 * Test Suite for AgentChatOrchestrator
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { AgentChatOrchestrator } from './agent-chat-orchestrator';
import type { AgentChatOrchestratorDependencies } from './agent-chat-orchestrator';
import type { AgentChatRequest, StreamEvent } from '../shared/types';
import { ChatStrategy } from '../../../types/agent-chat-enhancement';

describe('AgentChatOrchestrator', () => {
	let orchestrator: AgentChatOrchestrator;
	let deps: AgentChatOrchestratorDependencies;
	let callbackEvents: StreamEvent[];

	const baseRequest: AgentChatRequest = {
		userId: 'user_123',
		sessionId: 'session_123',
		userMessage: 'Show me my project tasks',
		contextType: 'project',
		entityId: 'proj_123',
		conversationHistory: []
	};

	beforeEach(() => {
		callbackEvents = [];

		deps = {
			strategyAnalyzer: {
				analyzeUserIntent: vi.fn(),
				suggestAlternativeStrategies: vi.fn(),
				explainStrategy: vi.fn(),
				requiresImmediateClarification: vi.fn()
			} as any,
			planOrchestrator: {
				createPlan: vi.fn(),
				executePlan: vi.fn()
			} as any,
			toolExecutionService: {
				executeTool: vi.fn(),
				executeMultipleTools: vi.fn()
			} as any,
			responseSynthesizer: {
				synthesizeSimpleResponse: vi.fn(),
				synthesizeComplexResponse: vi.fn(),
				synthesizeClarifyingQuestions: vi.fn()
			} as any,
			executorCoordinator: {} as any,
			persistenceService: {
				createAgent: vi.fn().mockResolvedValue('planner_123'),
				updateAgent: vi.fn(),
				getAgent: vi.fn(),
				createPlan: vi.fn(),
				updatePlan: vi.fn(),
				getPlan: vi.fn(),
				createChatSession: vi.fn(),
				updateChatSession: vi.fn(),
				getChatSession: vi.fn(),
				saveMessage: vi.fn(),
				getMessages: vi.fn()
			},
			contextService: {
				buildPlannerContext: vi.fn()
			} as any
		} satisfies AgentChatOrchestratorDependencies;

		orchestrator = new AgentChatOrchestrator(deps);
	});

	it('handles simple research strategy with tool execution', async () => {
		const plannerContext = {
			systemPrompt: 'You are a planner',
			conversationHistory: [],
			locationContext: '',
			availableTools: [
				{
					function: {
						name: 'list_tasks',
						description: 'List tasks',
						parameters: {
							type: 'object',
							properties: {
								project_id: { type: 'string' }
							}
						}
					}
				}
			],
			metadata: {
				sessionId: baseRequest.sessionId,
				contextType: baseRequest.contextType,
				totalTokens: 0,
				hasOntology: false
			}
		};

		(deps.contextService.buildPlannerContext as Mock).mockResolvedValue(plannerContext);
		(deps.strategyAnalyzer.analyzeUserIntent as Mock).mockResolvedValue({
			primary_strategy: ChatStrategy.SIMPLE_RESEARCH,
			confidence: 0.9,
			reasoning: 'Simple lookup',
			needs_clarification: false,
			estimated_steps: 1,
			required_tools: ['list_tasks'],
			can_complete_directly: true
		});

		(deps.toolExecutionService.executeTool as Mock).mockResolvedValue({
			success: true,
			toolName: 'list_tasks',
			toolCallId: 'call_1',
			data: { tasks: [] }
		});

		(deps.responseSynthesizer.synthesizeSimpleResponse as Mock).mockResolvedValue(
			'Here are your tasks.'
		);

		const events: StreamEvent[] = [];
		const callback = async (event: StreamEvent) => {
			callbackEvents.push(event);
		};

		for await (const event of orchestrator.streamConversation(baseRequest, callback)) {
			events.push(event);
		}

		const eventTypes = events.map((e) => e.type);
		expect(eventTypes).toContain('analysis');
		expect(eventTypes).toContain('tool_call');
		expect(eventTypes).toContain('tool_result');
		expect(eventTypes).toContain('text');
		expect(eventTypes.at(-1)).toBe('done');

		expect(deps.persistenceService.createAgent).toHaveBeenCalled();
		expect(deps.toolExecutionService.executeTool).toHaveBeenCalled();
		expect(deps.responseSynthesizer.synthesizeSimpleResponse).toHaveBeenCalled();
	});

	it('handles clarifying questions strategy', async () => {
		(deps.contextService.buildPlannerContext as Mock).mockResolvedValue({
			systemPrompt: 'Planner prompt',
			conversationHistory: [],
			locationContext: '',
			availableTools: [],
			metadata: {
				sessionId: baseRequest.sessionId,
				contextType: baseRequest.contextType,
				totalTokens: 0,
				hasOntology: false
			}
		});

		(deps.strategyAnalyzer.analyzeUserIntent as Mock).mockResolvedValue({
			primary_strategy: ChatStrategy.ASK_CLARIFYING,
			confidence: 0.6,
			reasoning: 'Need clarification',
			needs_clarification: true,
			clarifying_questions: ['Which project?'],
			estimated_steps: 0,
			required_tools: [],
			can_complete_directly: false
		});

		(deps.responseSynthesizer.synthesizeClarifyingQuestions as Mock).mockResolvedValue(
			'I need more information.'
		);

		const events: StreamEvent[] = [];
		const callback = async (event: StreamEvent) => {
			callbackEvents.push(event);
		};

		for await (const event of orchestrator.streamConversation(baseRequest, callback)) {
			events.push(event);
		}

		expect(events.map((e) => e.type)).toContain('clarifying_questions');
		expect(deps.responseSynthesizer.synthesizeClarifyingQuestions).toHaveBeenCalled();
	});

	it('handles complex strategy with plan orchestration', async () => {
		const plannerContext = {
			systemPrompt: 'Planner',
			conversationHistory: [],
			locationContext: '',
			availableTools: [],
			metadata: {
				sessionId: baseRequest.sessionId,
				contextType: baseRequest.contextType,
				totalTokens: 0,
				hasOntology: false
			}
		};

		(deps.contextService.buildPlannerContext as Mock).mockResolvedValue(plannerContext);
		(deps.strategyAnalyzer.analyzeUserIntent as Mock).mockResolvedValue({
			primary_strategy: ChatStrategy.COMPLEX_RESEARCH,
			confidence: 0.8,
			reasoning: 'Requires planning',
			needs_clarification: false,
			estimated_steps: 3,
			required_tools: [],
			can_complete_directly: false
		});

		(deps.planOrchestrator.createPlan as Mock).mockResolvedValue({
			id: 'plan_123',
			sessionId: baseRequest.sessionId,
			userId: baseRequest.userId,
			plannerAgentId: 'planner_123',
			userMessage: baseRequest.userMessage,
			strategy: ChatStrategy.COMPLEX_RESEARCH,
			status: 'pending',
			steps: [],
			createdAt: new Date()
		});

		const executionEvents = async function* () {
			yield { type: 'step_start', step: { stepNumber: 1 } } as StreamEvent;
			yield {
				type: 'executor_result',
				executorId: 'exec_123',
				result: { executorId: 'exec_123', taskId: 'task_1', success: true }
			} as StreamEvent;
			yield { type: 'done' } as StreamEvent;
		};

		(deps.planOrchestrator.executePlan as Mock).mockReturnValue(executionEvents());
		(deps.responseSynthesizer.synthesizeComplexResponse as Mock).mockResolvedValue(
			'Here is the synthesized response.'
		);

		const events: StreamEvent[] = [];
		const callback = async (event: StreamEvent) => {
			callbackEvents.push(event);
		};

		for await (const event of orchestrator.streamConversation(baseRequest, callback)) {
			events.push(event);
		}

		expect(events.map((e) => e.type)).toContain('plan_created');
		expect(events.map((e) => e.type)).toContain('executor_result');
		expect(deps.responseSynthesizer.synthesizeComplexResponse).toHaveBeenCalled();
	});
});
