// apps/web/src/lib/services/agentic-chat/analysis/strategy-analyzer.ts
/**
 * Strategy Analyzer Service
 *
 * Analyzes user intent and selects the appropriate execution strategy.
 * This service extracts and consolidates the strategy analysis logic
 * that was previously embedded in the monolithic agent-planner-service.
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md} - Refactoring specification
 * @see {@link ../../../agent-planner-service.ts} - Original implementation reference
 *
 * Key responsibilities:
 * - Analyze message complexity and user intent
 * - Select between simple_research, complex_research, or ask_clarifying strategies
 * - Estimate resource requirements and execution steps
 * - Validate and normalize strategy selections
 *
 * @module agentic-chat/analysis
 */

import { ChatStrategy } from '$lib/types/agent-chat-enhancement';
import type {
	StrategyAnalysis,
	LastTurnContext,
	OntologyContext
} from '$lib/types/agent-chat-enhancement';
import type { ServiceContext, PlannerContext, StreamCallback } from '../shared/types';
import { StrategyError } from '../shared/types';
import { formatToolSummaries } from '$lib/chat/tools.config';

/**
 * Interface for LLM service (subset of SmartLLMService)
 */
interface LLMService {
	generateText(params: {
		systemPrompt: string;
		prompt: string;
		temperature?: number;
		maxTokens?: number;
		userId?: string;
		operationType?: string;
	}): Promise<string>;
}

/**
 * Service for analyzing user intent and selecting execution strategies
 */
export class StrategyAnalyzer {
	// Complexity keywords that indicate multi-step operations
	private readonly COMPLEX_KEYWORDS = [
		'analyze',
		'compare',
		'evaluate',
		'synthesize',
		'generate report',
		'comprehensive',
		'all',
		'every',
		'across',
		'health',
		'audit',
		'review'
	];

	// Simple operation keywords
	private readonly SIMPLE_KEYWORDS = [
		'list',
		'show',
		'get',
		'find',
		'display',
		'view',
		'what',
		'which'
	];

	constructor(private llmService: LLMService) {}

	/**
	 * Analyze user intent and select the best strategy
	 */
	async analyzeUserIntent(
		message: string,
		plannerContext: PlannerContext,
		context: ServiceContext,
		lastTurnContext?: LastTurnContext
	): Promise<StrategyAnalysis> {
		const availableToolNames = this.getAvailableToolNames(plannerContext.availableTools);

		console.log('[StrategyAnalyzer] Analyzing user intent', {
			message: message.substring(0, 100),
			contextType: context.contextType,
			hasOntology: plannerContext.metadata?.hasOntology,
			hasLastTurn: !!lastTurnContext,
			toolCount: availableToolNames.length
		});

		// Handle empty message
		if (!message.trim()) {
			return {
				primary_strategy: ChatStrategy.ASK_CLARIFYING,
				confidence: 1.0,
				reasoning: 'Empty message requires clarification',
				needs_clarification: true,
				clarifying_questions: ['What would you like me to help you with?'],
				estimated_steps: 0,
				required_tools: [],
				can_complete_directly: false
			};
		}

		// Check if we have no tools available
		if (!plannerContext.availableTools || plannerContext.availableTools.length === 0) {
			return {
				primary_strategy: ChatStrategy.SIMPLE_RESEARCH,
				confidence: 0.5,
				reasoning: 'No tools available for execution',
				needs_clarification: false,
				estimated_steps: 0,
				required_tools: [],
				can_complete_directly: false
			};
		}

		try {
			// Use LLM to analyze the intent
			const analysis = await this.performLLMAnalysis(
				message,
				plannerContext,
				context,
				lastTurnContext
			);

			// Validate and normalize the analysis
			const validated = this.validateStrategy(analysis);

			// Ensure simple strategy has concrete tool suggestions so downstream execution can proceed
			if (
				validated.primary_strategy === ChatStrategy.SIMPLE_RESEARCH &&
				(!validated.required_tools || validated.required_tools.length === 0) &&
				availableToolNames.length > 0
			) {
				const heuristicTools = this.estimateRequiredTools(message, availableToolNames);
				if (heuristicTools.length > 0) {
					validated.required_tools = heuristicTools;
				}
			}

			return validated;
		} catch (error) {
			console.error('[StrategyAnalyzer] Failed to analyze intent:', error);

			// Fallback to heuristic-based analysis
			return this.fallbackAnalysis(message, availableToolNames);
		}
	}

	/**
	 * Perform LLM-based analysis of user intent
	 */
	private async performLLMAnalysis(
		message: string,
		plannerContext: PlannerContext,
		context: ServiceContext,
		lastTurnContext?: LastTurnContext
	): Promise<StrategyAnalysis> {
		const systemPrompt = this.buildAnalysisSystemPrompt(plannerContext, context);
		const analysisPrompt = this.buildAnalysisPrompt(message, plannerContext, lastTurnContext);

		const response = await this.llmService.generateText({
			systemPrompt,
			prompt: analysisPrompt,
			temperature: 0.3,
			maxTokens: 500,
			userId: context.userId,
			operationType: 'strategy_analysis'
		});

		try {
			// Extract JSON from markdown code blocks if present
			let jsonString = response.trim();
			if (jsonString.startsWith('```json')) {
				// Remove opening ```json and closing ```
				jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
			} else if (jsonString.startsWith('```')) {
				// Remove opening ``` and closing ```
				jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
			}
			return JSON.parse(jsonString) as StrategyAnalysis;
		} catch (error) {
			console.error('[StrategyAnalyzer] Failed to parse LLM response:', error);
			console.error('[StrategyAnalyzer] Raw response:', response);
			throw new Error('Invalid LLM response format');
		}
	}

	/**
	 * Build system prompt for strategy analysis
	 */
	private buildAnalysisSystemPrompt(
		plannerContext: PlannerContext,
		context: ServiceContext
	): string {
		const hasOntology = plannerContext.metadata?.hasOntology || false;
		const toolNames = this.getAvailableToolNames(plannerContext.availableTools);
		const toolList = toolNames.length > 0 ? toolNames.join(', ') : 'None available';
		const toolSummaries = plannerContext.availableTools.length
			? formatToolSummaries(plannerContext.availableTools)
			: 'No tools available.';

		return `You are a strategy analyzer for BuildOS chat.

Available strategies:
1. simple_research: Can be completed with 1-2 tool calls
   - Direct lookups, lists, simple searches
   - No coordination needed
   - Examples: "Show me X project", "List Y tasks"

2. complex_research: Requires multiple steps or coordination
   - Multi-entity analysis
   - Aggregation across data sources
   - May need executor agents
   - Examples: "Analyze project health", "Generate comprehensive report"

3. ask_clarifying_questions: Ambiguity that research can't resolve
   - Multiple matches for entity names
   - Unclear time ranges or scopes
   - Missing required parameters
   - ONLY after attempting research first

Context available:
- Type: ${context.contextType}
- Has ontology: ${hasOntology}
- Available tools: ${plannerContext.availableTools.length} (${toolList})
- Tool summaries:
${toolSummaries}
- Entity ID: ${context.entityId || 'none'}

IMPORTANT:
- Prefer research strategies over asking questions
- Only suggest clarifying questions if research cannot resolve the ambiguity
- Consider the context type when estimating complexity
- If ontology is available, queries can often be simpler`;
	}

	/**
	 * Build analysis prompt with context
	 */
	private buildAnalysisPrompt(
		message: string,
		plannerContext: PlannerContext,
		lastTurnContext?: LastTurnContext
	): string {
		const previousContext = lastTurnContext
			? `User was ${lastTurnContext.summary}`
			: 'This is the first message';

		return `Analyze this user message and determine the best strategy:

User message: "${message}"

Previous context: ${previousContext}

Consider:
1. How many tools/steps are needed?
2. Is there ambiguity that research can't resolve?
3. Does this need coordination across multiple data sources?
4. Can this be answered with the abbreviated data from LIST tools?

Return a JSON object with:
{
  "primary_strategy": "simple_research" | "complex_research" | "ask_clarifying_questions",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this strategy was chosen",
  "needs_clarification": boolean,
  "clarifying_questions": ["question1", "question2"] or null,
  "estimated_steps": number,
  "required_tools": ["tool1", "tool2"],
  "can_complete_directly": boolean
}`;
	}

	/**
	 * Fallback analysis using heuristics
	 */
	private fallbackAnalysis(message: string, availableToolNames: string[]): StrategyAnalysis {
		const complexity = this.estimateComplexity(message, availableToolNames);

		// Determine strategy based on complexity
		let strategy: ChatStrategy;
		let reasoning: string;

		if (complexity <= 2) {
			strategy = ChatStrategy.SIMPLE_RESEARCH;
			reasoning =
				'Simple query that can be handled with direct tool calls (fallback analysis)';
		} else {
			strategy = ChatStrategy.COMPLEX_RESEARCH;
			reasoning = 'Complex query requiring multiple steps (fallback analysis)';
		}

		return {
			primary_strategy: strategy,
			confidence: 0.5, // Lower confidence for fallback
			reasoning,
			needs_clarification: false,
			estimated_steps: complexity,
			required_tools: this.estimateRequiredTools(message, availableToolNames),
			can_complete_directly: complexity <= 2
		};
	}

	/**
	 * Estimate complexity of a query
	 */
	estimateComplexity(message: string, availableTools: string[]): number {
		const lowerMessage = message.toLowerCase();
		let complexity = 1;

		// Check for complex keywords
		const hasComplexKeywords = this.COMPLEX_KEYWORDS.some((keyword) =>
			lowerMessage.includes(keyword)
		);
		if (hasComplexKeywords) {
			complexity += 2;
		}

		// Check for simple keywords (reduces complexity)
		const hasSimpleKeywords = this.SIMPLE_KEYWORDS.some((keyword) =>
			lowerMessage.includes(keyword)
		);
		if (hasSimpleKeywords && !hasComplexKeywords) {
			complexity = Math.max(1, complexity - 1);
		}

		// Check for multiple entities mentioned
		const entityMentions = ['project', 'task', 'goal', 'plan', 'document'].filter((entity) =>
			lowerMessage.includes(entity)
		);
		if (entityMentions.length > 1) {
			complexity += entityMentions.length - 1;
		}

		// Consider available tools
		if (availableTools.length > 4) {
			complexity += 1;
		}

		// Check for temporal complexity - but not for simple "all" with list keyword
		const hasTemporalComplexity =
			/every|across|between|range/i.test(message) ||
			(/all/i.test(message) && !hasSimpleKeywords && !lowerMessage.includes('list'));
		if (hasTemporalComplexity) {
			complexity += 1;
		}

		return Math.min(complexity, 10); // Cap at 10
	}

	/**
	 * Estimate which tools might be required
	 */
	private estimateRequiredTools(message: string, availableTools: string[]): string[] {
		const lowerMessage = message.toLowerCase();
		const requiredTools: string[] = [];

		// Map keywords to tool patterns
		const toolPatterns: Record<string, string[]> = {
			list: ['list_', 'get_all_'],
			create: ['create_', 'add_'],
			update: ['update_', 'modify_', 'edit_'],
			delete: ['delete_', 'remove_'],
			search: ['search_', 'find_'],
			analyze: ['analyze_', 'evaluate_'],
			schedule: ['schedule_', 'calendar_']
		};

		// Match tools based on message content
		for (const [keyword, patterns] of Object.entries(toolPatterns)) {
			if (lowerMessage.includes(keyword)) {
				const matchingTools = availableTools.filter((tool) =>
					patterns.some((pattern) => tool.includes(pattern))
				);
				requiredTools.push(...matchingTools);
			}
		}

		// Remove duplicates
		return [...new Set(requiredTools)];
	}

	/**
	 * Validate and normalize a strategy analysis
	 */
	validateStrategy(analysis: any): StrategyAnalysis {
		// Ensure we have a valid strategy
		if (
			!analysis.primary_strategy ||
			!Object.values(ChatStrategy).includes(analysis.primary_strategy)
		) {
			throw new StrategyError(`Invalid strategy: ${analysis.primary_strategy}`, { analysis });
		}

		// Normalize confidence
		const confidence = Math.max(0, Math.min(1, analysis.confidence || 0.5));

		// Build validated analysis
		const validated: StrategyAnalysis = {
			primary_strategy: analysis.primary_strategy,
			confidence,
			reasoning: analysis.reasoning || 'No reasoning provided',
			needs_clarification: !!analysis.needs_clarification,
			estimated_steps: Math.max(0, analysis.estimated_steps || 1),
			required_tools: Array.isArray(analysis.required_tools) ? analysis.required_tools : [],
			can_complete_directly: !!analysis.can_complete_directly
		};

		// Add clarifying questions if needed
		if (analysis.clarifying_questions && Array.isArray(analysis.clarifying_questions)) {
			validated.clarifying_questions = analysis.clarifying_questions;
		}

		// Ensure consistency
		if (validated.primary_strategy === ChatStrategy.ASK_CLARIFYING) {
			validated.needs_clarification = true;
			validated.estimated_steps = 0;
			validated.required_tools = [];
			validated.can_complete_directly = false;
		}

		return validated;
	}

	/**
	 * Suggest alternative strategies for low confidence selections
	 */
	async suggestAlternativeStrategies(analysis: StrategyAnalysis): Promise<ChatStrategy[]> {
		if (analysis.confidence >= 0.8) {
			return []; // High confidence, no alternatives needed
		}

		const alternatives: ChatStrategy[] = [];

		// Suggest alternatives based on primary strategy
		switch (analysis.primary_strategy) {
			case ChatStrategy.SIMPLE_RESEARCH:
				if (analysis.estimated_steps > 2) {
					alternatives.push(ChatStrategy.COMPLEX_RESEARCH);
				}
				if (analysis.confidence < 0.6) {
					alternatives.push(ChatStrategy.ASK_CLARIFYING);
				}
				break;

			case ChatStrategy.COMPLEX_RESEARCH:
				if (analysis.estimated_steps <= 2) {
					alternatives.push(ChatStrategy.SIMPLE_RESEARCH);
				}
				if (analysis.confidence < 0.6) {
					alternatives.push(ChatStrategy.ASK_CLARIFYING);
				}
				break;

			case ChatStrategy.ASK_CLARIFYING:
				alternatives.push(ChatStrategy.SIMPLE_RESEARCH);
				break;
		}

		return alternatives;
	}

	/**
	 * Explain a strategy in human-readable terms
	 */
	explainStrategy(strategy: ChatStrategy): string {
		switch (strategy) {
			case ChatStrategy.SIMPLE_RESEARCH:
				return 'This is a straightforward query that can be answered with 1-2 simple tool calls';

			case ChatStrategy.COMPLEX_RESEARCH:
				return 'This requires complex analysis across multiple data sources and may need several coordinated steps';

			case ChatStrategy.ASK_CLARIFYING:
				return "I need to ask clarifying questions to better understand what you're looking for";

			default:
				return 'Unknown strategy';
		}
	}

	/**
	 * Check if a message requires immediate clarification
	 */
	requiresImmediateClarification(message: string): boolean {
		// Check for extremely vague messages
		const vaguePatterns = [
			/^(it|this|that|these|those)$/i,
			/^(yes|no|ok|okay|sure)$/i,
			/^(help|assist|please)$/i
		];

		return vaguePatterns.some((pattern) => pattern.test(message.trim()));
	}

	/**
	 * Extract tool names from planner context definitions
	 */
	private getAvailableToolNames(availableTools: PlannerContext['availableTools']): string[] {
		const names = new Set<string>();

		for (const tool of availableTools ?? []) {
			if (!tool) continue;
			const directName =
				typeof (tool as any).name === 'string' && (tool as any).name.trim().length > 0
					? (tool as any).name.trim()
					: undefined;
			const functionName =
				typeof (tool as any)?.function?.name === 'string' &&
				(tool as any).function.name.trim().length > 0
					? (tool as any).function.name.trim()
					: undefined;

			const resolved = directName ?? functionName;
			if (resolved) {
				names.add(resolved);
			}
		}

		return [...names];
	}
}
