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
 * - Select between planner_stream, project_creation, or ask_clarifying strategies
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
import { formatToolSummaries } from '$lib/services/agentic-chat/tools/core/tools.config';
import {
	ProjectCreationAnalyzer,
	type ClarificationRoundMetadata,
	type ProjectCreationIntentAnalysis
} from './project-creation-analyzer';

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
	private projectCreationAnalyzer: ProjectCreationAnalyzer;

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

	constructor(private llmService: LLMService) {
		this.projectCreationAnalyzer = new ProjectCreationAnalyzer(llmService);
	}

	/**
	 * Analyze user intent and select the best strategy
	 *
	 * @param clarificationMetadata - Optional metadata for tracking project creation clarification rounds
	 */
	async analyzeUserIntent(
		message: string,
		plannerContext: PlannerContext,
		context: ServiceContext,
		lastTurnContext?: LastTurnContext,
		clarificationMetadata?: ClarificationRoundMetadata
	): Promise<StrategyAnalysis> {
		const availableToolNames = this.getAvailableToolNames(plannerContext.availableTools);

		console.log('[StrategyAnalyzer] Analyzing user intent', {
			message: message.substring(0, 100),
			contextType: context.contextType,
			hasOntology: plannerContext.metadata?.hasOntology,
			hasLastTurn: !!lastTurnContext,
			toolCount: availableToolNames.length,
			clarificationRound: clarificationMetadata?.roundNumber ?? 0
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

		// Project creation context: analyze intent sufficiency before deciding strategy
		if (context.contextType === 'project_create') {
			return this.analyzeProjectCreationIntent(
				message,
				context.userId,
				clarificationMetadata
			);
		}

		// Check if we have no tools available
		if (!plannerContext.availableTools || plannerContext.availableTools.length === 0) {
			return {
				primary_strategy: ChatStrategy.PLANNER_STREAM,
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
				validated.primary_strategy === ChatStrategy.PLANNER_STREAM &&
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
	 * Analyze project creation intent and determine if clarifying questions are needed
	 *
	 * Flow:
	 * 1. If max rounds reached (2), proceed with PROJECT_CREATION strategy
	 * 2. Analyze if user message has sufficient context
	 * 3. If sufficient, return PROJECT_CREATION strategy
	 * 4. If insufficient, return ASK_CLARIFYING strategy with generated questions
	 */
	private async analyzeProjectCreationIntent(
		message: string,
		userId: string,
		clarificationMetadata?: ClarificationRoundMetadata
	): Promise<StrategyAnalysis> {
		const roundNumber = clarificationMetadata?.roundNumber ?? 0;

		console.log('[StrategyAnalyzer] Analyzing project creation intent', {
			messageLength: message.length,
			roundNumber,
			hasAccumulatedContext: !!clarificationMetadata?.accumulatedContext
		});

		try {
			const analysis = await this.projectCreationAnalyzer.analyzeIntent(
				message,
				userId,
				clarificationMetadata
			);

			console.log('[StrategyAnalyzer] Project creation analysis result', {
				hasSufficientContext: analysis.hasSufficientContext,
				confidence: analysis.confidence,
				missingInfo: analysis.missingInfo,
				hasQuestions: !!analysis.clarifyingQuestions?.length,
				inferredType: analysis.inferredProjectType
			});

			// If sufficient context, proceed with project creation
			if (analysis.hasSufficientContext) {
				return {
					primary_strategy: ChatStrategy.PROJECT_CREATION,
					confidence: analysis.confidence,
					reasoning: analysis.reasoning,
					needs_clarification: false,
					estimated_steps: 3,
					required_tools: ['list_onto_templates', 'create_onto_project'],
					can_complete_directly: false,
					project_creation_analysis: analysis
				};
			}

			// Insufficient context: ask clarifying questions
			return {
				primary_strategy: ChatStrategy.ASK_CLARIFYING,
				confidence: analysis.confidence,
				reasoning: analysis.reasoning,
				needs_clarification: true,
				clarifying_questions: analysis.clarifyingQuestions ?? [
					"Could you tell me more about what kind of project you'd like to create?"
				],
				estimated_steps: 0,
				required_tools: [],
				can_complete_directly: false,
				project_creation_analysis: analysis
			};
		} catch (error) {
			console.error('[StrategyAnalyzer] Project creation analysis failed:', error);

			// Fallback: if we've had at least one round, proceed; otherwise ask generic question
			if (roundNumber >= 1) {
				return {
					primary_strategy: ChatStrategy.PROJECT_CREATION,
					confidence: 0.6,
					reasoning:
						'Analysis failed but clarification was attempted. Proceeding with inference.',
					needs_clarification: false,
					estimated_steps: 3,
					required_tools: ['list_onto_templates', 'create_onto_project'],
					can_complete_directly: false
				};
			}

			return {
				primary_strategy: ChatStrategy.ASK_CLARIFYING,
				confidence: 0.3,
				reasoning: 'Unable to analyze project creation intent. Asking for clarification.',
				needs_clarification: true,
				clarifying_questions: [
					'What type of project would you like to create? For example, is this a software project, a writing project, a business initiative, or something else?'
				],
				estimated_steps: 0,
				required_tools: [],
				can_complete_directly: false
			};
		}
	}

	/**
	 * Create initial clarification metadata for project creation flow
	 */
	createProjectClarificationMetadata(): ClarificationRoundMetadata {
		return this.projectCreationAnalyzer.createInitialMetadata();
	}

	/**
	 * Update clarification metadata after a round of questions
	 */
	updateProjectClarificationMetadata(
		current: ClarificationRoundMetadata,
		userResponse: string,
		questionsAsked: string[]
	): ClarificationRoundMetadata {
		return this.projectCreationAnalyzer.updateMetadataAfterRound(
			current,
			userResponse,
			questionsAsked
		);
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
			// Extract JSON from response - handle various LLM response formats
			let jsonString = response.trim();

			// Try 1: Handle markdown code blocks (```json ... ``` or ``` ... ```)
			if (jsonString.includes('```json')) {
				const match = jsonString.match(/```json\s*([\s\S]*?)\s*```/);
				if (match?.[1]) {
					jsonString = match[1].trim();
				}
			} else if (jsonString.includes('```')) {
				const match = jsonString.match(/```\s*([\s\S]*?)\s*```/);
				if (match?.[1]) {
					jsonString = match[1].trim();
				}
			}

			// Try 2: If still not valid JSON, extract JSON object from response
			// This handles cases where LLM adds preamble text like "Here's my analysis:"
			if (!jsonString.startsWith('{')) {
				const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
				if (jsonMatch) {
					jsonString = jsonMatch[0];
				}
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
1. planner_stream: Default autonomous planner loop
   - Handles research, tool usage, and plan meta-tool calls inside the streaming session
   - Provide estimated steps and required tools so downstream components can budget tokens

2. ask_clarifying_questions: Ambiguity that research can't resolve
   - Multiple entity matches, missing parameters, unclear scope/time range
   - ONLY after attempting reasoning/research first, and include concrete questions

3. project_creation: ONLY when context_type === project_create (or the user explicitly asks to start a new project)
   - Select the best template, infer missing details, then call create_onto_project immediately
   - Optionally call request_template_creation ONCE if the catalog lacks a suitable template
   - Do not perform additional planning/research until the project is instantiated

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
  "primary_strategy": "planner_stream" | "ask_clarifying_questions" | "project_creation",
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
		const strategy = ChatStrategy.PLANNER_STREAM;
		const reasoning =
			complexity <= 2
				? 'Planner stream can handle this with a couple of tool calls (fallback analysis)'
				: 'Planner stream should orchestrate multiple steps to resolve this (fallback analysis)';

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
			case ChatStrategy.PLANNER_STREAM:
				if (analysis.confidence < 0.6) {
					alternatives.push(ChatStrategy.ASK_CLARIFYING);
				}
				break;

			case ChatStrategy.PROJECT_CREATION:
				if (analysis.confidence < 0.7) {
					alternatives.push(ChatStrategy.PLANNER_STREAM);
				}
				break;

			case ChatStrategy.ASK_CLARIFYING:
				alternatives.push(ChatStrategy.PLANNER_STREAM);
				break;
		}

		return alternatives;
	}

	/**
	 * Explain a strategy in human-readable terms
	 */
	explainStrategy(strategy: ChatStrategy): string {
		switch (strategy) {
			case ChatStrategy.PLANNER_STREAM:
				return 'Run the autonomous planner stream: research, call tools, and invoke the plan meta tool as needed.';

			case ChatStrategy.ASK_CLARIFYING:
				return "I need to ask clarifying questions to better understand what you're looking for";

			case ChatStrategy.PROJECT_CREATION:
				return 'This is a project creation request. Select a template, infer details, then create the project immediately.';

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
