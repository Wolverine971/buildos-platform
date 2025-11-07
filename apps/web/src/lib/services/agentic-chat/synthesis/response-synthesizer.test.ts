// apps/web/src/lib/services/agentic-chat/synthesis/response-synthesizer.test.ts
/**
 * Test Suite for ResponseSynthesizer
 *
 * Tests the response synthesis and formatting logic for the agentic chat system.
 * Validates response generation, streaming, and error handling.
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md}
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ResponseSynthesizer } from './response-synthesizer';
import { ChatStrategy } from '$lib/types/agent-chat-enhancement';
import type {
	ServiceContext,
	ExecutionResult,
	ToolExecutionResult,
	AgentPlan,
	PlanStep,
	StreamCallback
} from '../shared/types';

describe('ResponseSynthesizer', () => {
	let synthesizer: ResponseSynthesizer;
	let mockLLMService: {
		generateText: Mock;
		generateStream: Mock;
	};
	let mockContext: ServiceContext;

	beforeEach(() => {
		// Setup mock LLM service
		mockLLMService = {
			generateText: vi.fn(),
			generateStream: vi.fn()
		};

		synthesizer = new ResponseSynthesizer(mockLLMService as any);

		// Setup mock context
		mockContext = {
			sessionId: 'session_123',
			userId: 'user_123',
			contextType: 'project',
			entityId: 'proj_123',
			plannerAgentId: 'planner_123',
			conversationHistory: []
		};
	});

	describe('synthesizeSimpleResponse', () => {
		it('should synthesize response from successful tool results', async () => {
			const toolResults: ToolExecutionResult[] = [
				{
					success: true,
					data: { tasks: [{ id: 'task_1', title: 'Task 1' }] },
					toolName: 'list_onto_tasks',
					toolCallId: 'call_1'
				}
			];

			mockLLMService.generateText.mockResolvedValueOnce(
				'I found 1 task in your project: Task 1'
			);

			const response = await synthesizer.synthesizeSimpleResponse(
				'Show me my tasks',
				toolResults,
				mockContext
			);

			expect(response.text).toContain('Task 1');
			expect(mockLLMService.generateText).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: expect.stringContaining('Show me my tasks')
				})
			);
		});

		it('should handle failed tool results', async () => {
			const toolResults: ToolExecutionResult[] = [
				{
					success: false,
					error: 'Database connection failed',
					toolName: 'list_onto_tasks',
					toolCallId: 'call_1'
				}
			];

			mockLLMService.generateText.mockResolvedValueOnce(
				'I encountered an error while fetching your tasks. Please try again.'
			);

			const response = await synthesizer.synthesizeSimpleResponse(
				'Show me my tasks',
				toolResults,
				mockContext
			);

			expect(response.text).toContain('error');
			expect(mockLLMService.generateText).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: expect.stringContaining('Database connection failed')
				})
			);
		});

		it('should handle mixed success/failure results', async () => {
			const toolResults: ToolExecutionResult[] = [
				{
					success: true,
					data: { projects: [{ id: 'proj_1', name: 'Project 1' }] },
					toolName: 'list_onto_projects',
					toolCallId: 'call_1'
				},
				{
					success: false,
					error: 'Insufficient permissions',
					toolName: 'list_onto_tasks',
					toolCallId: 'call_2'
				}
			];

			mockLLMService.generateText.mockResolvedValueOnce(
				'I found 1 project, but encountered an error fetching tasks.'
			);

			const response = await synthesizer.synthesizeSimpleResponse(
				'Show me my projects and tasks',
				toolResults,
				mockContext
			);

			expect(response.text).toBeDefined();
			expect(response.text.length).toBeGreaterThan(0);
		});

		it('should handle empty tool results', async () => {
			mockLLMService.generateText.mockResolvedValueOnce('I can help you with that.');

			const response = await synthesizer.synthesizeSimpleResponse('Hello', [], mockContext);

			expect(response.text).toBeDefined();
			expect(mockLLMService.generateText).toHaveBeenCalled();
		});
	});

	describe('synthesizeComplexResponse', () => {
		it('should synthesize response from completed plan', async () => {
			const plan: AgentPlan = {
				id: 'plan_123',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Analyze project health',
				strategy: ChatStrategy.COMPLEX_RESEARCH,
				status: 'completed',
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Fetch project data',
						executorRequired: false,
						tools: ['get_project'],
						status: 'completed',
						result: { project: { health: 'good' } }
					},
					{
						stepNumber: 2,
						type: 'analysis',
						description: 'Analyze metrics',
						executorRequired: true,
						tools: ['analyze_metrics'],
						status: 'completed',
						result: { score: 85 }
					}
				],
				createdAt: new Date(),
				completedAt: new Date()
			};

			const executorResults: ExecutionResult[] = [
				{
					success: true,
					data: { analysis: 'Project is healthy with 85% score' }
				}
			];

			mockLLMService.generateText.mockResolvedValueOnce(
				'Your project is in good health with a score of 85%.'
			);

			const response = await synthesizer.synthesizeComplexResponse(
				plan,
				executorResults,
				mockContext
			);

			expect(response.text).toContain('85');
			expect(mockLLMService.generateText).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: expect.stringContaining('Analyze project health')
				})
			);
		});

		it('should handle partially completed plans', async () => {
			const plan: AgentPlan = {
				id: 'plan_456',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Generate report',
				strategy: ChatStrategy.COMPLEX_RESEARCH,
				status: 'executing',
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Fetch data',
						executorRequired: false,
						tools: ['get_data'],
						status: 'completed',
						result: { data: 'test' }
					},
					{
						stepNumber: 2,
						type: 'analysis',
						description: 'Analyze data',
						executorRequired: true,
						tools: ['analyze'],
						status: 'failed',
						error: 'Timeout'
					},
					{
						stepNumber: 3,
						type: 'report',
						description: 'Generate report',
						executorRequired: false,
						tools: ['generate_report'],
						status: 'pending'
					}
				],
				createdAt: new Date()
			};

			mockLLMService.generateText.mockResolvedValueOnce(
				'I completed the data fetch but encountered an issue during analysis.'
			);

			const response = await synthesizer.synthesizeComplexResponse(plan, [], mockContext);

			expect(response.text).toBeDefined();
			expect(mockLLMService.generateText).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: expect.stringContaining('failed')
				})
			);
		});

		it('should handle plans with no completed steps', async () => {
			const plan: AgentPlan = {
				id: 'plan_789',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Do something complex',
				strategy: ChatStrategy.COMPLEX_RESEARCH,
				status: 'failed',
				steps: [
					{
						stepNumber: 1,
						type: 'research',
						description: 'Step 1',
						executorRequired: false,
						tools: ['tool1'],
						status: 'failed',
						error: 'Network error'
					}
				],
				createdAt: new Date()
			};

			mockLLMService.generateText.mockResolvedValueOnce(
				'I was unable to complete the requested task due to errors.'
			);

			const response = await synthesizer.synthesizeComplexResponse(plan, [], mockContext);

			expect(response.text).toContain('unable');
		});
	});

	describe('synthesizeClarifyingQuestions', () => {
		it('should format clarifying questions properly', async () => {
			const questions = [
				'Which project are you referring to?',
				'What time period should I analyze?',
				'Do you want a detailed or summary report?'
			];

			mockLLMService.generateText.mockResolvedValueOnce(
				'I need to clarify a few things:\n1. Which project are you referring to?\n2. What time period should I analyze?\n3. Do you want a detailed or summary report?'
			);

			const response = await synthesizer.synthesizeClarifyingQuestions(
				questions,
				mockContext
			);

			expect(response.text).toContain('clarify');
			questions.forEach((q) => {
				expect(response.text).toContain(q);
			});
		});

		it('should handle single question', async () => {
			const questions = ['Which project do you mean?'];

			mockLLMService.generateText.mockResolvedValueOnce(
				'Please clarify which project you mean so I can continue.'
			);

			const response = await synthesizer.synthesizeClarifyingQuestions(
				questions,
				mockContext
			);

			expect(response.text).toContain('Which project');
		});

		it('should handle empty questions array', async () => {
			const response = await synthesizer.synthesizeClarifyingQuestions([], mockContext);

			expect(response.text).toContain('provide more details');
		});
	});

	describe('synthesizeStreamingResponse', () => {
		it('should stream response chunks', async () => {
			const chunks: string[] = [];
			const callback: StreamCallback = async (event) => {
				if (event.type === 'text') {
					chunks.push(event.content);
				}
			};

			const mockStream = async function* () {
				yield 'Hello ';
				yield 'world!';
			};

			mockLLMService.generateStream.mockResolvedValueOnce(mockStream());

			const generator = synthesizer.synthesizeStreamingResponse(
				'Test message',
				[],
				mockContext,
				callback
			);

			for await (const event of generator) {
				// Process events
			}

			expect(chunks).toEqual(['Hello ', 'world!']);
		});

		it('should handle stream errors gracefully', async () => {
			const events: any[] = [];
			const callback: StreamCallback = async (event) => {
				events.push(event);
			};

			const mockStream = async function* () {
				yield 'Start';
				throw new Error('Stream error');
			};

			mockLLMService.generateStream.mockResolvedValueOnce(mockStream());

			const generator = synthesizer.synthesizeStreamingResponse(
				'Test message',
				[],
				mockContext,
				callback
			);

			for await (const event of generator) {
				events.push(event);
			}

			const errorEvent = events.find((e) => e.type === 'error');
			expect(errorEvent).toBeDefined();
			expect(errorEvent.error).toContain('Stream error');
		});

		it('should include tool results in streaming context', async () => {
			const toolResults: ToolExecutionResult[] = [
				{
					success: true,
					data: { result: 'test' },
					toolName: 'test_tool',
					toolCallId: 'call_1'
				}
			];

			const mockStream = async function* () {
				yield 'Based on the results...';
			};

			mockLLMService.generateStream.mockResolvedValueOnce(mockStream());

			const generator = synthesizer.synthesizeStreamingResponse(
				'Test with tools',
				toolResults,
				mockContext,
				async () => {}
			);

			const events = [];
			for await (const event of generator) {
				events.push(event);
			}

			expect(mockLLMService.generateStream).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: expect.stringContaining('test_tool')
				})
			);
		});
	});

	describe('formatPlanProgress', () => {
		it('should format plan progress summary', () => {
			const plan: AgentPlan = {
				id: 'plan_123',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Test plan',
				strategy: ChatStrategy.COMPLEX_RESEARCH,
				status: 'executing',
				steps: [
					{ stepNumber: 1, status: 'completed' } as PlanStep,
					{ stepNumber: 2, status: 'completed' } as PlanStep,
					{ stepNumber: 3, status: 'executing' } as PlanStep,
					{ stepNumber: 4, status: 'pending' } as PlanStep,
					{ stepNumber: 5, status: 'pending' } as PlanStep
				],
				createdAt: new Date()
			};

			const summary = synthesizer.formatPlanProgress(plan);

			expect(summary).toContain('2 of 5');
			expect(summary).toContain('40%');
			expect(summary).toContain('executing');
		});

		it('should handle completed plans', () => {
			const plan: AgentPlan = {
				id: 'plan_456',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Test plan',
				strategy: ChatStrategy.COMPLEX_RESEARCH,
				status: 'completed',
				steps: [
					{ stepNumber: 1, status: 'completed' } as PlanStep,
					{ stepNumber: 2, status: 'completed' } as PlanStep
				],
				createdAt: new Date(),
				completedAt: new Date()
			};

			const summary = synthesizer.formatPlanProgress(plan);

			expect(summary).toContain('2 of 2');
			expect(summary).toContain('100%');
			expect(summary).toContain('completed');
		});

		it('should handle failed plans', () => {
			const plan: AgentPlan = {
				id: 'plan_789',
				sessionId: 'session_123',
				userId: 'user_123',
				plannerAgentId: 'planner_123',
				userMessage: 'Test plan',
				strategy: ChatStrategy.COMPLEX_RESEARCH,
				status: 'failed',
				steps: [
					{ stepNumber: 1, status: 'completed' } as PlanStep,
					{ stepNumber: 2, status: 'failed', error: 'Error' } as PlanStep,
					{ stepNumber: 3, status: 'pending' } as PlanStep
				],
				createdAt: new Date()
			};

			const summary = synthesizer.formatPlanProgress(plan);

			expect(summary).toContain('failed');
			expect(summary).toContain('1 of 3');
		});
	});

	describe('generateErrorResponse', () => {
		it('should generate user-friendly error message', async () => {
			const error = new Error('Database connection timeout');

			mockLLMService.generateText.mockResolvedValueOnce(
				'I apologize, but I encountered a connection issue. Please try again.'
			);

			const response = await synthesizer.generateErrorResponse(
				error,
				'Fetch data',
				mockContext
			);

			expect(response).toContain('apologize');
			expect(mockLLMService.generateText).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: expect.stringContaining('Database connection timeout')
				})
			);
		});

		it('should handle string errors', async () => {
			mockLLMService.generateText.mockResolvedValueOnce(
				'An error occurred. Please try again.'
			);

			const response = await synthesizer.generateErrorResponse(
				'Something went wrong',
				'Process request',
				mockContext
			);

			expect(response).toBeDefined();
		});

		it('should provide fallback for LLM failures', async () => {
			mockLLMService.generateText.mockRejectedValueOnce(new Error('LLM service down'));

			const response = await synthesizer.generateErrorResponse(
				new Error('Original error'),
				'Test operation',
				mockContext
			);

			expect(response).toContain('encountered an error');
			expect(response).toContain('Original error');
		});
	});

	describe('summarizeExecutorResults', () => {
		it('should summarize multiple executor results', () => {
			const results: ExecutionResult[] = [
				{
					success: true,
					data: { analysis: 'Good health' }
				},
				{
					success: true,
					data: { score: 85 }
				},
				{
					success: false,
					error: 'Timeout on task 3'
				}
			];

			const summary = synthesizer.summarizeExecutorResults(results);

			expect(summary).toContain('2 successful');
			expect(summary).toContain('1 failed');
			expect(summary).toContain('Good health');
			expect(summary).toContain('85');
			expect(summary).toContain('Timeout');
		});

		it('should handle all successful results', () => {
			const results: ExecutionResult[] = [
				{ success: true, data: { result: 'A' } },
				{ success: true, data: { result: 'B' } }
			];

			const summary = synthesizer.summarizeExecutorResults(results);

			expect(summary).toContain('2 successful');
			expect(summary).not.toContain('failed');
		});

		it('should handle all failed results', () => {
			const results: ExecutionResult[] = [
				{ success: false, error: 'Error 1' },
				{ success: false, error: 'Error 2' }
			];

			const summary = synthesizer.summarizeExecutorResults(results);

			expect(summary).toContain('2 failed');
			expect(summary).not.toContain('successful');
		});

		it('should handle empty results', () => {
			const summary = synthesizer.summarizeExecutorResults([]);

			expect(summary).toContain('No executor results');
		});
	});
});
