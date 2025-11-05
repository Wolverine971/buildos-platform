// apps/web/src/lib/services/agentic-chat/analysis/strategy-analyzer.test.ts
/**
 * Test Suite for StrategyAnalyzer
 *
 * Tests the strategy analysis and selection logic for the agentic chat system.
 * Validates intent recognition, complexity estimation, and strategy selection.
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md}
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { StrategyAnalyzer } from './strategy-analyzer';
import { ChatStrategy } from '$lib/types/agent-chat-enhancement';
import type { ServiceContext, PlannerContext } from '../shared/types';
import { StrategyError } from '../shared/types';

describe('StrategyAnalyzer', () => {
	let analyzer: StrategyAnalyzer;
	let mockLLMService: {
		generateText: Mock;
		generateStream: Mock;
	};
	let mockContext: ServiceContext;
	let mockPlannerContext: PlannerContext;

	beforeEach(() => {
		// Setup mock LLM service
		mockLLMService = {
			generateText: vi.fn(),
			generateStream: vi.fn()
		};

		analyzer = new StrategyAnalyzer(mockLLMService as any);

		// Setup mock contexts
		mockContext = {
			sessionId: 'session_123',
			userId: 'user_123',
			contextType: 'project',
			entityId: 'proj_123',
			plannerAgentId: 'planner_123',
			conversationHistory: []
		};

		mockPlannerContext = {
			systemPrompt: 'You are an AI assistant',
			conversationHistory: [],
			locationContext: 'Project: Test Project',
			availableTools: [
				{ name: 'list_tasks', description: 'List tasks', parameters: {} },
				{ name: 'create_task', description: 'Create a task', parameters: {} },
				{ name: 'search_projects', description: 'Search projects', parameters: {} }
			],
			metadata: {
				sessionId: 'session_123',
				contextType: 'project',
				entityId: 'proj_123',
				totalTokens: 1000,
				hasOntology: true,
				plannerAgentId: 'planner_123'
			}
		};
	});

	describe('analyzeUserIntent', () => {
		it('should select simple_research for straightforward queries', async () => {
			mockLLMService.generateText.mockResolvedValueOnce(
				JSON.stringify({
					primary_strategy: 'simple_research',
					confidence: 0.9,
					reasoning: 'Direct lookup query that can be answered with list_tasks',
					needs_clarification: false,
					estimated_steps: 1,
					required_tools: ['list_tasks'],
					can_complete_directly: true
				})
			);

			const result = await analyzer.analyzeUserIntent(
				'Show me the tasks in this project',
				mockPlannerContext,
				mockContext
			);

			expect(result.primary_strategy).toBe(ChatStrategy.SIMPLE_RESEARCH);
			expect(result.confidence).toBeGreaterThanOrEqual(0.9);
			expect(result.estimated_steps).toBe(1);
			expect(result.required_tools).toContain('list_tasks');
			expect(result.can_complete_directly).toBe(true);
		});

		it('should select complex_research for multi-step queries', async () => {
			mockLLMService.generateText.mockResolvedValueOnce(
				JSON.stringify({
					primary_strategy: 'complex_research',
					confidence: 0.85,
					reasoning: 'Requires analysis across multiple data sources and aggregation',
					needs_clarification: false,
					estimated_steps: 4,
					required_tools: [
						'list_tasks',
						'search_projects',
						'analyze_data',
						'generate_report'
					],
					can_complete_directly: false
				})
			);

			const result = await analyzer.analyzeUserIntent(
				'Generate a comprehensive health report for all active projects',
				mockPlannerContext,
				mockContext
			);

			expect(result.primary_strategy).toBe(ChatStrategy.COMPLEX_RESEARCH);
			expect(result.confidence).toBeGreaterThanOrEqual(0.8);
			expect(result.estimated_steps).toBeGreaterThan(1);
			expect(result.required_tools.length).toBeGreaterThan(2);
			expect(result.can_complete_directly).toBe(false);
		});

		it('should identify need for clarification when query is ambiguous', async () => {
			mockLLMService.generateText.mockResolvedValueOnce(
				JSON.stringify({
					primary_strategy: 'ask_clarifying_questions',
					confidence: 0.6,
					reasoning: 'Multiple projects match the criteria, need user to specify',
					needs_clarification: true,
					clarifying_questions: [
						'Which project are you referring to?',
						'What time period should I consider?'
					],
					estimated_steps: 0,
					required_tools: [],
					can_complete_directly: false
				})
			);

			const result = await analyzer.analyzeUserIntent(
				'Show me the tasks',
				mockPlannerContext,
				{ ...mockContext, contextType: 'global', entityId: undefined }
			);

			expect(result.primary_strategy).toBe(ChatStrategy.ASK_CLARIFYING);
			expect(result.needs_clarification).toBe(true);
			expect(result.clarifying_questions).toBeDefined();
			expect(result.clarifying_questions?.length).toBeGreaterThan(0);
		});

		it('should handle LLM parsing errors gracefully', async () => {
			mockLLMService.generateText.mockResolvedValueOnce('Invalid JSON response');

			const result = await analyzer.analyzeUserIntent(
				'Show me tasks',
				mockPlannerContext,
				mockContext
			);

			// Should fall back to simple_research
			expect(result.primary_strategy).toBe(ChatStrategy.SIMPLE_RESEARCH);
			expect(result.confidence).toBeLessThan(0.7); // Lower confidence for fallback
		});

		it('should handle LLM service errors', async () => {
			mockLLMService.generateText.mockRejectedValueOnce(new Error('LLM service unavailable'));

			const result = await analyzer.analyzeUserIntent(
				'Show me tasks',
				mockPlannerContext,
				mockContext
			);

			// Should return fallback strategy
			expect(result.primary_strategy).toBe(ChatStrategy.SIMPLE_RESEARCH);
			expect(result.reasoning).toContain('fallback');
		});
	});

	describe('estimateComplexity', () => {
		it('should estimate low complexity for simple queries', () => {
			const complexity = analyzer.estimateComplexity('List all tasks', ['list_tasks']);

			expect(complexity).toBeLessThanOrEqual(2);
		});

		it('should estimate high complexity for analytical queries', () => {
			const complexity = analyzer.estimateComplexity(
				'Analyze project health across all dimensions and generate a comprehensive report with recommendations',
				['list_tasks', 'analyze_data', 'generate_report', 'create_recommendations']
			);

			expect(complexity).toBeGreaterThan(3);
		});

		it('should consider tool count in complexity estimation', () => {
			const simpleComplexity = analyzer.estimateComplexity('Do something', ['tool1']);
			const complexComplexity = analyzer.estimateComplexity('Do something', [
				'tool1',
				'tool2',
				'tool3',
				'tool4',
				'tool5'
			]);

			expect(complexComplexity).toBeGreaterThan(simpleComplexity);
		});

		it('should recognize complex keywords', () => {
			const keywords = ['analyze', 'compare', 'generate report', 'synthesize', 'evaluate'];

			keywords.forEach((keyword) => {
				const complexity = analyzer.estimateComplexity(`Please ${keyword} the data`, [
					'tool1'
				]);
				expect(complexity).toBeGreaterThanOrEqual(2);
			});
		});
	});

	describe('validateStrategy', () => {
		it('should validate a correct strategy analysis', () => {
			const analysis = {
				primary_strategy: ChatStrategy.SIMPLE_RESEARCH,
				confidence: 0.9,
				reasoning: 'Valid reasoning',
				needs_clarification: false,
				estimated_steps: 1,
				required_tools: ['tool1'],
				can_complete_directly: true
			};

			const validated = analyzer.validateStrategy(analysis);

			expect(validated).toEqual(analysis);
		});

		it('should normalize invalid confidence values', () => {
			const analysis = {
				primary_strategy: ChatStrategy.SIMPLE_RESEARCH,
				confidence: 1.5, // Invalid: > 1
				reasoning: 'Test',
				needs_clarification: false,
				estimated_steps: 1,
				required_tools: [],
				can_complete_directly: true
			};

			const validated = analyzer.validateStrategy(analysis);

			expect(validated.confidence).toBeLessThanOrEqual(1);
			expect(validated.confidence).toBeGreaterThanOrEqual(0);
		});

		it('should provide default values for missing fields', () => {
			const analysis = {
				primary_strategy: ChatStrategy.COMPLEX_RESEARCH
				// Missing all other fields
			} as any;

			const validated = analyzer.validateStrategy(analysis);

			expect(validated.confidence).toBeDefined();
			expect(validated.reasoning).toBeDefined();
			expect(validated.needs_clarification).toBeDefined();
			expect(validated.estimated_steps).toBeDefined();
			expect(validated.required_tools).toBeDefined();
			expect(validated.can_complete_directly).toBeDefined();
		});

		it('should validate strategy consistency', () => {
			const analysis = {
				primary_strategy: ChatStrategy.ASK_CLARIFYING,
				confidence: 0.6,
				reasoning: 'Need clarification',
				needs_clarification: false, // Inconsistent
				clarifying_questions: ['Question 1'],
				estimated_steps: 5, // Should be 0 for clarifying
				required_tools: ['tool1'], // Should be empty for clarifying
				can_complete_directly: true // Should be false
			};

			const validated = analyzer.validateStrategy(analysis);

			expect(validated.needs_clarification).toBe(true); // Fixed
			expect(validated.estimated_steps).toBe(0); // Fixed
			expect(validated.required_tools).toEqual([]); // Fixed
			expect(validated.can_complete_directly).toBe(false); // Fixed
		});
	});

	describe('analyzeWithContext', () => {
		it('should consider last turn context in analysis', async () => {
			const lastTurnContext = {
				summary: 'User viewed project tasks',
				entities: {
					project_id: 'proj_123',
					task_ids: ['task_1', 'task_2']
				},
				context_type: 'project' as const,
				data_accessed: ['list_tasks'],
				timestamp: new Date().toISOString()
			};

			mockLLMService.generateText.mockResolvedValueOnce(
				JSON.stringify({
					primary_strategy: 'simple_research',
					confidence: 0.95,
					reasoning: 'Following up on previous task view with specific query',
					needs_clarification: false,
					estimated_steps: 1,
					required_tools: ['get_task_details'],
					can_complete_directly: true
				})
			);

			const result = await analyzer.analyzeUserIntent(
				'Show me details for the first task',
				mockPlannerContext,
				mockContext,
				lastTurnContext
			);

			expect(result.confidence).toBeGreaterThan(0.9);
			expect(mockLLMService.generateText).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: expect.stringContaining('viewed project tasks')
				})
			);
		});

		it('should consider ontology context in analysis', async () => {
			const ontologyContext = {
				type: 'project' as const,
				data: { id: 'proj_123', name: 'Test Project' },
				metadata: {
					entity_count: { tasks: 10, goals: 3 },
					facets: { priority: 'high', status: 'active' }
				}
			};

			const contextWithOntology = {
				...mockPlannerContext,
				ontologyContext
			};

			mockLLMService.generateText.mockResolvedValueOnce(
				JSON.stringify({
					primary_strategy: 'simple_research',
					confidence: 0.92,
					reasoning: 'Can use ontology data for efficient lookup',
					needs_clarification: false,
					estimated_steps: 1,
					required_tools: ['query_ontology'],
					can_complete_directly: true
				})
			);

			const result = await analyzer.analyzeUserIntent(
				'Show me high priority tasks',
				contextWithOntology,
				mockContext
			);

			expect(result.required_tools).toContain('query_ontology');
		});
	});

	describe('suggestAlternativeStrategies', () => {
		it('should suggest alternatives for low confidence primary strategy', async () => {
			const analysis = {
				primary_strategy: ChatStrategy.SIMPLE_RESEARCH,
				confidence: 0.55, // Low confidence
				reasoning: 'Uncertain about intent',
				needs_clarification: false,
				estimated_steps: 1,
				required_tools: ['tool1'],
				can_complete_directly: true
			};

			const alternatives = await analyzer.suggestAlternativeStrategies(analysis);

			expect(alternatives).toBeDefined();
			expect(alternatives.length).toBeGreaterThan(0);
			expect(alternatives[0]).not.toBe(analysis.primary_strategy);
		});

		it('should not suggest alternatives for high confidence strategy', async () => {
			const analysis = {
				primary_strategy: ChatStrategy.SIMPLE_RESEARCH,
				confidence: 0.95,
				reasoning: 'Very clear intent',
				needs_clarification: false,
				estimated_steps: 1,
				required_tools: ['tool1'],
				can_complete_directly: true
			};

			const alternatives = await analyzer.suggestAlternativeStrategies(analysis);

			expect(alternatives).toEqual([]);
		});
	});

	describe('explainStrategy', () => {
		it('should provide human-readable explanation for simple_research', () => {
			const explanation = analyzer.explainStrategy(ChatStrategy.SIMPLE_RESEARCH);

			expect(explanation).toContain('simple');
			expect(explanation.toLowerCase()).toContain('tool');
		});

		it('should provide human-readable explanation for complex_research', () => {
			const explanation = analyzer.explainStrategy(ChatStrategy.COMPLEX_RESEARCH);

			expect(explanation).toContain('complex');
			expect(explanation.toLowerCase()).toContain('multiple');
		});

		it('should provide human-readable explanation for ask_clarifying', () => {
			const explanation = analyzer.explainStrategy(ChatStrategy.ASK_CLARIFYING);

			expect(explanation.toLowerCase()).toContain('clarif');
			expect(explanation.toLowerCase()).toContain('question');
		});
	});

	describe('Error Handling', () => {
		it('should throw StrategyError for invalid strategy type', () => {
			const analysis = {
				primary_strategy: 'INVALID_STRATEGY' as any,
				confidence: 0.9,
				reasoning: 'Test',
				needs_clarification: false,
				estimated_steps: 1,
				required_tools: [],
				can_complete_directly: true
			};

			expect(() => analyzer.validateStrategy(analysis)).toThrow(StrategyError);
		});

		it('should handle empty message gracefully', async () => {
			const result = await analyzer.analyzeUserIntent('', mockPlannerContext, mockContext);

			expect(result.primary_strategy).toBe(ChatStrategy.ASK_CLARIFYING);
			expect(result.needs_clarification).toBe(true);
		});

		it('should handle missing tools array', async () => {
			const contextWithoutTools = {
				...mockPlannerContext,
				availableTools: []
			};

			mockLLMService.generateText.mockResolvedValueOnce(
				JSON.stringify({
					primary_strategy: 'simple_research',
					confidence: 0.5,
					reasoning: 'No tools available',
					needs_clarification: false,
					estimated_steps: 0,
					required_tools: [],
					can_complete_directly: false
				})
			);

			const result = await analyzer.analyzeUserIntent(
				'Do something',
				contextWithoutTools,
				mockContext
			);

			expect(result.can_complete_directly).toBe(false);
			expect(result.reasoning).toContain('tools');
		});
	});
});
