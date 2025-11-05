// apps/web/src/lib/services/agent-planner-service.ts
/**
 * Agent Planner Service - Orchestration Layer for Multi-Agent System
 *
 * This is the "brain" that decides strategy and coordinates execution.
 * Responsible for:
 * - Analyzing message complexity
 * - Routing to appropriate strategy (simple/tool/complex)
 * - Creating plans for complex queries
 * - Spawning and coordinating executor agents
 * - Synthesizing results into coherent responses
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Database,
	ChatContextType,
	ChatMessage,
	ChatToolDefinition,
	LLMMessage,
	ChatToolCall,
	AgentInsert,
	AgentPlanInsert,
	AgentChatSessionInsert,
	AgentChatMessageInsert,
	PlanningStrategy,
	Json
} from '@buildos/shared-types';
import {
	AgentContextService,
	type PlannerContext,
	type ExecutorTask
} from './agent-context-service';
import { AgentExecutorService, type ExecutorResult } from './agent-executor-service';
import { AgentConversationService } from './agent-conversation-service';
import { SmartLLMService } from './smart-llm-service';
import { ChatCompressionService } from './chat-compression-service';
import { ChatToolExecutor } from '$lib/chat/tool-executor';
import { v4 as uuidv4 } from 'uuid';
import { savePromptForAudit } from '$lib/utils/prompt-audit';
// Add after existing imports
import { ChatStrategy } from '$lib/types/agent-chat-enhancement';
import type {
	StrategyAnalysis,
	ResearchResult,
	EnhancedPlannerContext,
	LastTurnContext
} from '$lib/types/agent-chat-enhancement';
import { ExecutorInstructionGenerator } from './agent-executor-instructions';

// ============================================
// TYPES
// ============================================

/**
 * Complexity analysis result
 */
export interface ComplexityAnalysis {
	strategy: PlanningStrategy;
	reasoning: string;
	estimatedOperations: number;
	requiresTools: boolean;
	requiresExecutors: boolean;
}

/**
 * Plan step definition
 */
export interface PlanStep {
	stepNumber: number;
	type: string; // 'search_project', 'schedule_tasks', etc.
	description: string;
	executorRequired: boolean;
	tools: string[]; // Tool names
	dependsOn?: number[]; // Step dependencies
	status: 'pending' | 'executing' | 'completed' | 'failed';
	result?: any;
	error?: string;
}

/**
 * Agent Plan structure
 */
export interface AgentPlan {
	id: string;
	sessionId: string;
	userId: string;
	userMessage: string;
	strategy: PlanningStrategy;
	steps: PlanStep[];
	status: 'pending' | 'executing' | 'completed' | 'failed';
	createdAt: Date;
	completedAt?: Date;
}

/**
 * Planner event types for streaming
 */
export type PlannerEvent =
	| { type: 'analysis'; analysis: ComplexityAnalysis }
	| { type: 'plan_created'; plan: AgentPlan }
	| { type: 'step_start'; step: PlanStep }
	| { type: 'step_complete'; step: PlanStep }
	| { type: 'executor_spawned'; executorId: string; task: ExecutorTask }
	| { type: 'executor_result'; executorId: string; result: ExecutorResult }
	| { type: 'text'; content: string }
	| { type: 'tool_call'; toolCall: ChatToolCall }
	| { type: 'tool_result'; result: any }
	| { type: 'done'; plan?: AgentPlan; usage?: { total_tokens: number } }
	| { type: 'error'; error: string };

/**
 * Planner response structure
 */
export interface PlannerResponse {
	strategy: PlanningStrategy;
	plan?: AgentPlan;
	response: string;
	executorResults?: ExecutorResult[];
	tokensUsed: number;
	durationMs: number;
}

/**
 * Process message parameters
 */
export interface ProcessMessageParams {
	sessionId: string;
	userId: string;
	message: string;
	contextType: ChatContextType;
	entityId?: string;
	conversationHistory?: ChatMessage[];
	lastTurnContext?: LastTurnContext;
	ontologyContext?: any; // OntologyContext from agent-chat-enhancement types
}

// ============================================
// SERVICE
// ============================================

export class AgentPlannerService {
	private contextService: AgentContextService;
	private executorService: AgentExecutorService;
	private conversationService: AgentConversationService;
	private smartLLM: SmartLLMService;

	// Complexity thresholds for strategy selection
	private readonly COMPLEXITY_THRESHOLDS = {
		SIMPLE: 0, // No tools needed
		TOOL_USE: 2, // 1-2 tools
		COMPLEX: 3 // 3+ operations or parallel execution needed
	};

	constructor(
		private supabase: SupabaseClient<Database>,
		executorService?: AgentExecutorService,
		smartLLM?: SmartLLMService,
		compressionService?: ChatCompressionService
	) {
		// Pass compression service to context service for intelligent history compression
		this.contextService = new AgentContextService(supabase, compressionService);

		// Initialize SmartLLMService if not provided
		this.smartLLM =
			smartLLM ||
			new SmartLLMService({
				supabase,
				httpReferer: 'https://buildos.com',
				appName: 'BuildOS Multi-Agent System'
			});

		// Use injected executor service or create new one
		this.executorService = executorService || new AgentExecutorService(supabase, this.smartLLM);

		// Initialize conversation service for LLM-to-LLM orchestration
		this.conversationService = new AgentConversationService(supabase, this.smartLLM);
	}

	// ============================================
	// MAIN ENTRY POINT
	// ============================================

	/**
	 * Process a user message through the planning system
	 * Analyzes complexity and routes to appropriate strategy
	 *
	 * @param params - Message processing parameters
	 * @returns Async generator yielding planner events
	 */
	async *processUserMessage(params: ProcessMessageParams): AsyncGenerator<PlannerEvent> {
		const startTime = Date.now();
		const {
			sessionId,
			userId,
			message,
			contextType,
			entityId,
			conversationHistory = [],
			lastTurnContext,
			ontologyContext
		} = params;

		// Get real user_id from chat_sessions
		const realUserId = await this.getUserIdFromSession(sessionId);

		// Create planner agent in database
		let plannerAgentId: string | undefined;

		try {
			// 1. Build planner context (with optional ontology enhancement)
			const plannerContext = await this.contextService.buildPlannerContext({
				sessionId,
				userId,
				conversationHistory,
				userMessage: message,
				contextType,
				entityId,
				lastTurnContext,
				ontologyContext
			});

			// 2. Create planner agent
			try {
				plannerAgentId = await this.createPlannerAgent(
					sessionId,
					realUserId,
					plannerContext.systemPrompt,
					plannerContext.availableTools
				);
			} catch (error) {
				console.error(
					'Failed to create planner agent, continuing without DB persistence:',
					error
				);
			}

			// 3. Check if we have enhanced ontology context
			const hasOntology =
				'metadata' in plannerContext &&
				plannerContext.metadata?.hasOntology &&
				'ontologyContext' in plannerContext;

			if (hasOntology) {
				// ========================================
				// NEW: Enhanced Strategy Analysis Flow
				// ========================================

				// 3a. Analyze user intent with ontology awareness
				const strategyAnalysis = await this.analyzeUserIntent(
					{message, context: plannerContext, lastTurnContext, userId});

				// Yield strategy selection event
				yield {
					type: 'strategy_selected' as any,
					strategy: strategyAnalysis.primary_strategy,
					confidence: strategyAnalysis.confidence
				};

				// 3b. Execute strategy
				// Note: executeStrategy doesn't support streaming yet, so we execute and then yield
				const researchResult = await this.executeStrategy(
					strategyAnalysis,
					plannerContext,
					message,
					async (event: any) => {
						// Note: Can't yield inside callback, events are logged internally
						// Future enhancement: Make this properly streaming
					},
					userId
				);

				// 3c. Generate final response
				const finalResponse = await this.generateResponse(researchResult, plannerContext, userId);
				yield { type: 'text', content: finalResponse };
			} else {
				// ========================================
				// EXISTING: Legacy Complexity Analysis Flow
				// ========================================

				// 3a. Analyze message complexity (legacy)
				const analysis = await this.analyzeMessageComplexity(
					message,
					plannerContext,
					realUserId
				);
				yield { type: 'analysis', analysis };

				// 3b. Route to appropriate strategy (legacy)
				switch (analysis.strategy) {
					case 'direct':
						// Direct query with tools available - LLM decides if it needs them
						for await (const event of this.handleToolQuery(
							message,
							plannerContext,
							sessionId,
							realUserId,
							plannerAgentId
						)) {
							yield event;
						}
						break;

					case 'complex':
						// Multi-step query - create plan and spawn executors
						for await (const event of this.handleComplexQuery(
							message,
							plannerContext,
							sessionId,
							realUserId,
							plannerAgentId,
							contextType,
							entityId
						)) {
							yield event;
						}
						break;
				}
			}

			// 5. Mark planner agent as completed
			if (plannerAgentId) {
				await this.updatePlannerAgent(plannerAgentId, 'completed');
			}

			// 6. Completion - no need to yield 'done' here
			// The API endpoint will send the final 'done' event with usage stats
		} catch (error) {
			console.error('Planner error:', error);

			// Mark planner agent as failed
			if (plannerAgentId) {
				await this.updatePlannerAgent(plannerAgentId, 'failed');
			}

			yield {
				type: 'error',
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ============================================
	// COMPLEXITY ANALYSIS
	// ============================================

	/**
	 * Analyze message complexity to determine routing strategy
	 * Uses a fast LLM call to classify the user's query semantically
	 * - Direct: Single operation that can be handled by one agent with tools
	 * - Complex: Multi-step operations requiring planning and multiple executors
	 */
	private async analyzeMessageComplexity(
		message: string,
		context: PlannerContext,
		userId: string
	): Promise<ComplexityAnalysis> {
		const systemPrompt = `You are a query complexity analyzer. Your job is to classify user queries for a multi-agent system.

Available Tools: ${context.availableTools.map((t) => t.function.name).join(', ')}

Classification Criteria:

**DIRECT** (strategy: "direct"):
- Single operation or simple request
- Can be handled by one agent with available tools
- Conversational queries (greetings, questions about capabilities)
- Simple data retrieval or updates
- Examples:
  - "Show me my active projects"
  - "What tasks do I have due today?"
  - "Update the deadline for task X"
  - "Hello, how can you help me?"

**COMPLEX** (strategy: "complex"):
- Multiple sequential operations with dependencies
- Requires breaking down into steps
- Needs coordination between multiple executors
- Explicit sequential language ("first...then", "after that")
- Examples:
  - "Find project X and then schedule all its tasks for next week"
  - "Create a new project and add these 5 tasks to it"
  - "Show me my tasks and then update the ones that are overdue"

Respond with JSON only.`;

		const userPrompt = `Analyze this user query and classify its complexity:

User Query: "${message}"

Context Type: ${context.metadata.contextType}
${context.metadata.entityId ? `Entity ID: ${context.metadata.entityId}` : ''}

Respond with JSON in this exact format:
{
  "strategy": "direct" | "complex",
  "reasoning": "brief explanation of classification",
  "estimatedOperations": number,
  "requiresTools": boolean,
  "requiresExecutors": boolean
}`;

		// Save prompt for audit
		await savePromptForAudit({
			systemPrompt,
			userPrompt,
			scenarioType: 'agent-planner-complexity-analysis',
			metadata: {
				userMessage: message,
				contextType: context.metadata.contextType,
				entityId: context.metadata.entityId,
				availableTools: context.availableTools.map((t) => t.function.name),
				userId
			}
		});

		try {
			// Use fast profile for quick classification
			const result = await this.smartLLM.getJSONResponse<ComplexityAnalysis>({
				systemPrompt,
				userPrompt,
				userId,
				profile: 'fast', // Use fastest model for classification
				temperature: 0.3, // Lower temperature for consistent classification
				operationType: 'agent_query_classification'
			});

			return result;
		} catch (error) {
			console.error('LLM classification failed, falling back to heuristic:', error);

			// Fallback: Simple heuristic if LLM fails
			const hasSequentialWords = /\b(and then|after that|first.*then|step \d+)\b/i.test(
				message
			);
			const wordCount = message.split(/\s+/).length;

			if (hasSequentialWords || wordCount > 50) {
				return {
					strategy: 'complex',
					reasoning: 'Fallback heuristic: detected sequential language or long query',
					estimatedOperations: 3,
					requiresTools: true,
					requiresExecutors: true
				};
			}

			return {
				strategy: 'direct',
				reasoning: 'Fallback heuristic: simple query',
				estimatedOperations: 1,
				requiresTools: true,
				requiresExecutors: false
			};
		}
	}

	// ============================================
	// STRATEGY HANDLERS
	// ============================================

	/**
	 * Handle direct queries (with tools available)
	 * Planner has access to tools - LLM decides if it needs to use them
	 * For conversational queries, LLM responds directly without tools
	 * For data queries, LLM uses appropriate tools
	 */
	private async *handleToolQuery(
		message: string,
		context: PlannerContext,
		sessionId: string,
		userId: string,
		plannerAgentId?: string
	): AsyncGenerator<PlannerEvent> {
		// Create agent chat session for this tool query
		let agentSessionId: string | undefined;
		if (plannerAgentId) {
			try {
				agentSessionId = await this.createAgentChatSession(
					sessionId,
					userId,
					plannerAgentId
				);
			} catch (error) {
				console.error('Failed to create agent chat session:', error);
			}
		}

		// Build messages for LLM with tools
		const messages: LLMMessage[] = [
			{ role: 'system', content: context.systemPrompt },
			...context.conversationHistory.map((m) => ({
				role: m.role as 'user' | 'assistant' | 'system' | 'tool',
				content: m.content,
				tool_calls: m.tool_calls,
				tool_call_id: m.tool_call_id
			}))
		];

		// Save system message
		if (agentSessionId && plannerAgentId) {
			await this.saveAgentChatMessage(
				agentSessionId,
				sessionId,
				userId,
				plannerAgentId,
				'system',
				context.systemPrompt
			);
		}

		// Create tool executor (planner has read-write access)
		const toolExecutor = new ChatToolExecutor(
			this.supabase,
			userId,
			context.metadata.sessionId
		);

		// Save prompt for audit (initial state before multi-turn loop)
		const systemPrompt = context.systemPrompt;
		const conversationHistory = context.conversationHistory
			.map((m) => `${m.role}: ${m.content}`)
			.join('\n\n');
		await savePromptForAudit({
			systemPrompt,
			userPrompt: conversationHistory || message,
			scenarioType: 'agent-planner-tool-query',
			metadata: {
				sessionId,
				userMessage: message,
				contextType: context.metadata.contextType,
				entityId: context.metadata.entityId,
				availableTools: context.availableTools.map((t) => t.function.name),
				conversationLength: context.conversationHistory.length,
				userId
			}
		});

		let totalTokens = 0;

		// Multi-turn loop for tool calling
		// LLM may call tools, we execute them, then call LLM again with results
		const MAX_TURNS = 10;
		let currentTurn = 0;
		let shouldContinue = true;

		while (shouldContinue && currentTurn < MAX_TURNS) {
			currentTurn++;
			let assistantContent = '';
			let toolCalls: ChatToolCall[] = [];

			// Stream from LLM with tools
			for await (const event of this.smartLLM.streamText({
				messages,
				tools: context.availableTools,
				tool_choice: 'auto',
				userId: userId,
				profile: 'balanced', // Use balanced model for planner
				temperature: 0.7,
				maxTokens: 2000,
				sessionId: context.metadata.sessionId
			})) {
				switch (event.type) {
					case 'text':
						assistantContent += event.content || '';
						yield { type: 'text', content: event.content! };
						break;

					case 'tool_call':
						// Collect tool call (may be multiple in one message)
						toolCalls.push(event.tool_call!);
						yield { type: 'tool_call', toolCall: event.tool_call! };
						break;

					case 'done':
						totalTokens += event.usage?.total_tokens || 0;
						break;

					case 'error':
						console.error('LLM error:', event.error);
						throw new Error(event.error);
				}
			}

			// After streaming completes, check if we had tool calls
			if (toolCalls.length > 0) {
				// Execute all tool calls in parallel for 3x speed improvement
				const toolExecutionPromises = toolCalls.map((toolCall) =>
					toolExecutor
						.execute(toolCall)
						.then((result) => ({ toolCall, result: result.result, success: true }))
						.catch((error) => {
							console.error('Tool execution error:', error);
							return {
								toolCall,
								result: {
									error: error instanceof Error ? error.message : 'Unknown error'
								},
								success: false,
								errorMessage:
									error instanceof Error ? error.message : 'Unknown error'
							};
						})
				);

				// Wait for all tools to complete
				const toolResults = await Promise.all(toolExecutionPromises);

				// Yield results as they're ready
				for (const result of toolResults) {
					if (result.success) {
						yield { type: 'tool_result', result: result.result };
					} else {
						yield {
							type: 'error',
							error: `Tool execution failed: ${result.errorMessage}`
						};
					}
				}

				// Add assistant message with tool calls
				const assistantMsg = {
					role: 'assistant',
					content: assistantContent || '',
					tool_calls: toolCalls
				};
				messages.push(assistantMsg);

				// Save assistant message with tool calls
				if (agentSessionId && plannerAgentId) {
					await this.saveAgentChatMessage(
						agentSessionId,
						sessionId,
						userId,
						plannerAgentId,
						'assistant',
						assistantContent || '',
						toolCalls
					);
				}

				// Add tool result messages
				for (const { toolCall, result } of toolResults) {
					const toolMsg = {
						role: 'tool',
						content: JSON.stringify(result),
						tool_call_id: toolCall.id
					};
					messages.push(toolMsg);

					// Save tool result message
					if (agentSessionId && plannerAgentId) {
						await this.saveAgentChatMessage(
							agentSessionId,
							sessionId,
							userId,
							plannerAgentId,
							'tool',
							JSON.stringify(result),
							undefined,
							toolCall.id
						);
					}
				}

				// Continue loop - call LLM again with tool results
				continue;
			} else {
				// No tool calls - we're done
				shouldContinue = false;

				// Save final assistant message if there's content
				if (assistantContent && agentSessionId && plannerAgentId) {
					await this.saveAgentChatMessage(
						agentSessionId,
						sessionId,
						userId,
						plannerAgentId,
						'assistant',
						assistantContent,
						undefined,
						undefined,
						totalTokens
					);
				}
			}
		}

		// Yield done event with token usage
		yield {
			type: 'done',
			usage: { total_tokens: totalTokens }
		};

		// Mark session as completed
		if (agentSessionId) {
			await this.updateAgentChatSession(agentSessionId, 'completed');
		}
	}

	/**
	 * Handle complex queries requiring plan creation and executor coordination
	 * Creates multi-step plan and spawns executors
	 */
	private async *handleComplexQuery(
		message: string,
		context: PlannerContext,
		sessionId: string,
		userId: string,
		plannerAgentId?: string,
		contextType?: ChatContextType,
		entityId?: string
	): AsyncGenerator<PlannerEvent> {
		// 1. Create plan
		const plan = await this.createPlan(message, context, sessionId, userId);
		yield { type: 'plan_created', plan };

		// 2. Persist plan to database
		let dbPlanId: string | undefined;
		if (plannerAgentId) {
			try {
				dbPlanId = await this.persistPlanToDatabase(plan, plannerAgentId);
				await this.updatePlanStatus(dbPlanId, 'executing');
			} catch (error) {
				console.error('Failed to persist plan:', error);
			}
		}

		// 3. Execute plan steps with real executors
		// NEW: Accumulate results as we go for sequential context sharing
		const accumulatedResults: Map<number, ExecutorResult> = new Map();
		const executorResults: ExecutorResult[] = [];

		for (const step of plan.steps) {
			if (step.executorRequired && plannerAgentId && dbPlanId) {
				// Spawn executor for this step (streaming)
				yield { type: 'step_start', step };

				// NEW: Build context from previous results
				const previousResults = this.buildPreviousResultsContext(step, accumulatedResults);

				// Stream executor conversation events
				let result: ExecutorResult | undefined;
				for await (const event of this.spawnExecutor(
					step,
					sessionId,
					userId,
					dbPlanId,
					plannerAgentId,
					contextType,
					entityId,
					previousResults // NEW: Pass previous results
				)) {
					// Forward all executor events to user
					yield event;

					// Capture final result
					if (event.type === 'executor_result') {
						result = event.result;
					}
				}

				// Update step with result
				if (result) {
					step.status = result.success ? 'completed' : 'failed';
					step.result = result.data;
					step.error = result.error;

					// NEW: Store result for next executors
					accumulatedResults.set(step.stepNumber, result);
					executorResults.push(result);
				} else {
					step.status = 'failed';
					step.error = 'No result from executor';
				}

				yield { type: 'step_complete', step };

				// Update plan with step progress
				if (dbPlanId) {
					await this.updatePlanStatus(dbPlanId, 'executing', plan.steps);
				}
			} else {
				// Planner executes this step directly
				step.status = 'completed';
				yield { type: 'step_complete', step };

				// Update plan with step progress
				if (dbPlanId) {
					await this.updatePlanStatus(dbPlanId, 'executing', plan.steps);
				}
			}
		}

		// 4. Synthesize results with LLM
		const synthesis = await this.synthesizeResults(plan, executorResults);
		yield {
			type: 'text',
			content: '\n\n' + synthesis
		};

		plan.status = 'completed';
		plan.completedAt = new Date();

		// 5. Mark plan as completed in database
		if (dbPlanId) {
			await this.updatePlanStatus(dbPlanId, 'completed', plan.steps);
		}
	}

	// ============================================
	// PLAN CREATION
	// ============================================

	/**
	 * Create a structured plan for complex queries
	 * For now, uses heuristic-based plan generation
	 * Future: LLM-generated plans for flexibility
	 */
	private async createPlan(
		message: string,
		context: PlannerContext,
		sessionId: string,
		userId: string
	): Promise<AgentPlan> {
		const lowerMessage = message.toLowerCase();
		const steps: PlanStep[] = [];
		let stepNumber = 1;

		// Detect operations and create steps
		// This is a simple heuristic - will be replaced with LLM plan generation

		// Search/Find operations
		if (/find|search|show|get/i.test(message)) {
			if (/project/i.test(message)) {
				steps.push({
					stepNumber: stepNumber++,
					type: 'find_project',
					description: 'Find the requested project',
					executorRequired: true,
					tools: ['search_projects', 'get_project_details'],
					status: 'pending'
				});
			}
			if (/task/i.test(message)) {
				steps.push({
					stepNumber: stepNumber++,
					type: 'find_tasks',
					description: 'Find the requested tasks',
					executorRequired: true,
					tools: ['list_tasks', 'get_task_details'],
					status: 'pending'
				});
			}
		}

		// Update operations
		if (/update|change|modify/i.test(message)) {
			if (/project/i.test(message)) {
				steps.push({
					stepNumber: stepNumber++,
					type: 'update_project',
					description: 'Update project details',
					executorRequired: true,
					tools: ['update_project'],
					dependsOn: steps.length > 0 ? [1] : undefined,
					status: 'pending'
				});
			}
			if (/task/i.test(message)) {
				steps.push({
					stepNumber: stepNumber++,
					type: 'update_task',
					description: 'Update task details',
					executorRequired: true,
					tools: ['update_task'],
					dependsOn: steps.length > 0 ? [1] : undefined,
					status: 'pending'
				});
			}
		}

		// Schedule operations
		if (/schedule|calendar/i.test(message)) {
			steps.push({
				stepNumber: stepNumber++,
				type: 'schedule_tasks',
				description: 'Schedule tasks on calendar',
				executorRequired: true,
				tools: ['find_available_slots', 'schedule_task'],
				dependsOn: steps.length > 0 ? [1] : undefined,
				status: 'pending'
			});
		}

		// Always add synthesis step
		steps.push({
			stepNumber: stepNumber++,
			type: 'synthesize',
			description: 'Synthesize results and respond to user',
			executorRequired: false,
			tools: [],
			dependsOn: steps.length > 0 ? steps.map((s) => s.stepNumber) : undefined,
			status: 'pending'
		});

		const plan: AgentPlan = {
			id: uuidv4(),
			sessionId,
			userId,
			userMessage: message,
			strategy: 'complex',
			steps,
			status: 'pending',
			createdAt: new Date()
		};

		return plan;
	}

	// ============================================
	// EXECUTOR MANAGEMENT
	// ============================================

	/**
	 * Spawn an executor for a specific plan step with iterative conversation
	 * Creates task, starts LLM-to-LLM conversation, returns result
	 */
	private async *spawnExecutor(
		step: PlanStep,
		sessionId: string,
		userId: string,
		planId: string,
		plannerAgentId: string,
		contextType?: ChatContextType,
		entityId?: string,
		previousResults?: string
	): AsyncGenerator<PlannerEvent> {
		const startTime = Date.now();

		// Create executor task from step
		const task: ExecutorTask = {
			id: uuidv4(),
			description: step.description,
			goal: `Complete step ${step.stepNumber}: ${step.type}`,
			constraints: []
		};

		// Get tools for this task
		const tools = await this.getToolsForStep(step);

		// Load location context for executor (abbreviated, token-efficient)
		let locationContext: string | undefined;
		if (contextType && entityId) {
			try {
				// Use ChatContextService to load abbreviated context
				const chatContextService = new (
					await import('./chat-context-service')
				).ChatContextService(this.supabase);
				const context = await chatContextService.loadLocationContext(
					contextType,
					entityId,
					true, // abbreviated = true for token efficiency
					userId
				);
				locationContext = context.content;
			} catch (error) {
				console.error('Failed to load location context for executor:', error);
				// Continue without context - executor will use tools
			}
		}

		// Create executor agent
		const systemPrompt = `You are an executor agent. Your job is to complete this specific task using the available tools.

Task: ${task.description}
Goal: ${task.goal}

You have READ-ONLY access to tools. Focus on gathering information and reporting back.`;

		let executorAgentId: string;
		try {
			executorAgentId = await this.executorService.createExecutorAgent(
				sessionId,
				userId,
				systemPrompt,
				tools,
				planId
			);
		} catch (error) {
			console.error('Failed to create executor agent:', error);

			// Return error result
			const errorResult: ExecutorResult = {
				executorId: task.id,
				success: false,
				error: error instanceof Error ? error.message : 'Failed to create executor',
				toolCallsMade: 0,
				tokensUsed: 0,
				durationMs: Date.now() - startTime
			};

			yield { type: 'executor_result', executorId: task.id, result: errorResult };
			return errorResult;
		}

		yield { type: 'executor_spawned', executorId: executorAgentId, task };

		try {
			// Start conversation session with context enrichment
			const conversationSession = await this.conversationService.startConversation({
				plannerAgentId,
				executorAgentId,
				parentSessionId: sessionId,
				userId,
				planId,
				stepNumber: step.stepNumber,
				task,
				tools,
				contextType,
				entityId,
				locationContext, // Pass location context to executor
				previousResults // Pass previous executor results
			});

			// Execute iterative conversation
			let conversationResult: any;
			for await (const response of this.conversationService.executeConversation(
				conversationSession,
				userId
			)) {
				// Yield conversation events to user
				if (response.type === 'message') {
					yield {
						type: 'text',
						content: `[Executor] ${response.content}`
					};
				}

				// Store final result
				if (response.messageType === 'task_complete') {
					conversationResult = response.data;
				}
			}

			// Build executor result from conversation
			const result: ExecutorResult = {
				executorId: executorAgentId,
				success: conversationSession.status === 'completed',
				data: conversationResult || conversationSession.result,
				error: conversationSession.error,
				toolCallsMade: 0, // TODO: Track from conversation
				tokensUsed: 0, // TODO: Track from conversation
				durationMs: Date.now() - startTime
			};

			// Update executor agent status
			await this.executorService.updateExecutorAgent(
				executorAgentId,
				result.success ? 'completed' : 'failed'
			);

			yield { type: 'executor_result', executorId: executorAgentId, result };
			return result;
		} catch (error) {
			console.error('Executor conversation error:', error);

			// Update executor as failed
			await this.executorService.updateExecutorAgent(executorAgentId, 'failed');

			const errorResult: ExecutorResult = {
				executorId: executorAgentId,
				success: false,
				error: error instanceof Error ? error.message : 'Conversation failed',
				toolCallsMade: 0,
				tokensUsed: 0,
				durationMs: Date.now() - startTime
			};

			yield { type: 'executor_result', executorId: executorAgentId, result: errorResult };
			return errorResult;
		}
	}

	/**
	 * Execute multiple executors in parallel
	 * For independent steps that don't depend on each other
	 *
	 * NOTE: Currently not implemented - requires proper handling of async generators.
	 * When implementing, need to:
	 * 1. Collect all yielded events from multiple generators
	 * 2. Merge them into a single stream
	 * 3. Wait for all to complete
	 *
	 * For now, executors run sequentially via handleComplexQuery.
	 */
	private async executeParallelExecutors(
		steps: PlanStep[],
		sessionId: string,
		userId: string,
		planId: string,
		plannerAgentId: string
	): Promise<ExecutorResult[]> {
		// TODO: Implement proper parallel execution with generator merging
		// For now, run sequentially
		const results: ExecutorResult[] = [];

		for (const step of steps) {
			let result: ExecutorResult | undefined;
			for await (const event of this.spawnExecutor(
				step,
				sessionId,
				userId,
				planId,
				plannerAgentId
			)) {
				if (event.type === 'executor_result') {
					result = event.result;
				}
			}
			if (result) {
				results.push(result);
			}
		}

		return results;
	}

	// ============================================
	// RESULT SYNTHESIS
	// ============================================

	/**
	 * Synthesize executor results into a coherent response
	 * Uses LLM to combine executor outputs into natural, user-friendly response
	 */
	private async synthesizeResults(
		plan: AgentPlan,
		executorResults: ExecutorResult[]
	): Promise<string> {
		// Build comprehensive context from all plan steps and results
		const resultsContext = plan.steps
			.map((step, idx) => {
				const result = executorResults[idx];
				let stepSummary = `**Step ${step.stepNumber}: ${step.description}**\n`;
				stepSummary += `- Type: ${step.type}\n`;
				stepSummary += `- Status: ${step.status}\n`;

				if (result) {
					stepSummary += `- Success: ${result.success}\n`;
					if (result.data) {
						stepSummary += `- Results:\n\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\`\n`;
					}
					if (result.error) {
						stepSummary += `- Error: ${result.error}\n`;
					}
				} else {
					stepSummary += `- No executor result (planner executed directly)\n`;
				}

				return stepSummary;
			})
			.join('\n\n');

		// Use LLM to synthesize natural response
		const systemPrompt =
			'You synthesize multi-agent task results into clear, natural user responses.';
		const userPrompt = `You are synthesizing the results of a multi-step plan execution.

**User's Original Request:**
"${plan.userMessage}"

**Plan Execution Results:**
${resultsContext}

**Your Task:**
Provide a clear, natural language summary of what was accomplished. Focus on answering the user's original question/request.

**Guidelines:**
- Be concise but informative (2-4 sentences)
- Focus on the outcome, not the process
- If any steps failed, mention it briefly
- Present data naturally, not as raw JSON
- Sound conversational and helpful

Synthesized response:`;

		// Save prompt for audit
		await savePromptForAudit({
			systemPrompt,
			userPrompt,
			scenarioType: 'agent-planner-synthesis',
			metadata: {
				planId: plan.id,
				sessionId: plan.sessionId,
				strategy: plan.strategy,
				stepCount: plan.steps.length,
				completedSteps: plan.steps.filter((s) => s.status === 'completed').length,
				failedSteps: plan.steps.filter((s) => s.status === 'failed').length,
				executorResultCount: executorResults.length,
				userId: plan.userId
			}
		});

		try {
			// Stream synthesis from smart model
			let synthesizedText = '';
			for await (const event of this.smartLLM.streamText({
				messages: [
					{
						role: 'system',
						content: systemPrompt
					},
					{
						role: 'user',
						content: userPrompt
					}
				],
				tools: [],
				temperature: 0.7,
				maxTokens: 500,
				userId: plan.userId,
				profile: 'balanced', // Use balanced model for synthesis
				sessionId: plan.sessionId
			})) {
				if (event.type === 'text') {
					synthesizedText += event.content || '';
				}
			}

			return synthesizedText || 'Plan execution completed successfully.';
		} catch (error) {
			console.error('Failed to synthesize results with LLM:', error);

			// Fallback to simple synthesis
			let fallback = `I've completed your request: "${plan.userMessage}"\n\n`;
			const completedSteps = plan.steps.filter((s) => s.status === 'completed').length;
			fallback += `Successfully completed ${completedSteps} of ${plan.steps.length} steps.`;

			if (executorResults.some((r) => r.data)) {
				fallback += '\n\nResults are available in the step details above.';
			}

			return fallback;
		}
	}

	// ============================================
	// HELPER METHODS
	// ============================================

	/**
	 * Get tool definitions for a specific plan step
	 * Converts tool names to actual tool definitions
	 */
	private async getToolsForStep(step: PlanStep): Promise<ChatToolDefinition[]> {
		// Import CHAT_TOOLS dynamically
		const { CHAT_TOOLS } = await import('$lib/chat/tools.config');

		// Filter tools that match the step's tool list
		return CHAT_TOOLS.filter((tool) => step.tools.includes(tool.function.name));
	}

	/**
	 * Build context string from previous executor results for sequential steps
	 * @param currentStep - The current step being executed
	 * @param accumulatedResults - Map of step number to executor results
	 * @returns Formatted context string or undefined if no previous results
	 */
	private buildPreviousResultsContext(
		currentStep: PlanStep,
		accumulatedResults: Map<number, ExecutorResult>
	): string | undefined {
		// Check if current step depends on previous steps
		if (!currentStep.dependsOn || currentStep.dependsOn.length === 0) {
			return undefined;
		}

		// Build context from dependency results
		let context = '**Previous Step Results:**\n\n';
		let hasResults = false;

		for (const stepNum of currentStep.dependsOn) {
			const result = accumulatedResults.get(stepNum);
			if (result && result.success && result.data) {
				hasResults = true;
				context += `**Step ${stepNum}:**\n`;
				context += `\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\`\n\n`;
			}
		}

		return hasResults ? context : undefined;
	}

	/**
	 * Persist plan to database (for tracking and analytics)
	 */
	private async persistPlan(plan: AgentPlan): Promise<void> {
		// Database persistence will be implemented later
		// For now, just log
		console.log('Plan created:', plan.id);
	}

	// ============================================
	// DATABASE PERSISTENCE METHODS
	// ============================================

	/**
	 * Extract real user_id from chat_sessions table
	 * The sessionId parameter is actually a chat_sessions.id
	 */
	private async getUserIdFromSession(sessionId: string): Promise<string> {
		const { data: session, error } = await this.supabase
			.from('chat_sessions')
			.select('user_id')
			.eq('id', sessionId)
			.single();

		if (error || !session) {
			console.error('Failed to get user_id from session:', error);
			// Fallback to sessionId (temporary)
			return sessionId;
		}

		return session.user_id;
	}

	/**
	 * Create planner agent in database
	 */
	private async createPlannerAgent(
		sessionId: string,
		userId: string,
		systemPrompt: string,
		availableTools: ChatToolDefinition[]
	): Promise<string> {
		const agent: AgentInsert = {
			type: 'planner',
			name: `Planner-${sessionId.slice(0, 8)}`,
			model_preference: 'deepseek/deepseek-chat',
			available_tools: availableTools.map((t) => t.function.name),
			permissions: 'read_write',
			system_prompt: systemPrompt,
			created_for_session: sessionId,
			user_id: userId,
			status: 'active'
		};

		const { data, error } = await this.supabase.from('agents').insert(agent).select().single();

		if (error) {
			console.error('Failed to create planner agent:', error);
			throw new Error(`Failed to create planner agent: ${error.message}`);
		}

		return data.id;
	}

	/**
	 * Update planner agent status
	 */
	private async updatePlannerAgent(
		agentId: string,
		status: 'active' | 'completed' | 'failed',
		error?: string
	): Promise<void> {
		const updates: {
			status: 'active' | 'completed' | 'failed';
			completed_at?: string;
		} = {
			status,
			completed_at: status !== 'active' ? new Date().toISOString() : undefined
		};

		const { error: updateError } = await this.supabase
			.from('agents')
			.update(updates)
			.eq('id', agentId);

		if (updateError) {
			console.error('Failed to update planner agent:', updateError);
			// Don't throw - this is not critical
		}
	}

	/**
	 * Persist agent plan to database
	 */
	private async persistPlanToDatabase(plan: AgentPlan, plannerAgentId: string): Promise<string> {
		const planInsert: any = {
			session_id: plan.sessionId,
			user_id: plan.userId,
			planner_agent_id: plannerAgentId,
			user_message: plan.userMessage,
			strategy: plan.strategy,
			steps: plan.steps, // JSONB field
			status: 'pending'
		};

		const { data, error } = await this.supabase
			.from('agent_plans')
			.insert(planInsert)
			.select()
			.single();

		if (error) {
			console.error('Failed to persist plan:', error);
			throw new Error(`Failed to persist plan: ${error.message}`);
		}

		return data.id;
	}

	/**
	 * Update plan status in database
	 */
	private async updatePlanStatus(
		planId: string,
		status: 'pending' | 'executing' | 'completed' | 'failed',
		steps?: PlanStep[]
	): Promise<void> {
		const updates: {
			status: 'pending' | 'executing' | 'completed' | 'failed';
			updated_at: string;
			steps?: Json;
			completed_at?: string;
		} = {
			status,
			updated_at: new Date().toISOString()
		};

		if (steps) {
			updates.steps = steps as unknown as Json;
		}

		if (status === 'completed' || status === 'failed') {
			updates.completed_at = new Date().toISOString();
		}

		const { error } = await this.supabase.from('agent_plans').update(updates).eq('id', planId);

		if (error) {
			console.error('Failed to update plan status:', error);
			// Don't throw - this is not critical
		}
	}

	/**
	 * Create agent chat session for tool query execution
	 */
	private async createAgentChatSession(
		parentSessionId: string,
		userId: string,
		plannerAgentId: string,
		planId?: string,
		stepNumber?: number
	): Promise<string> {
		const session: any = {
			parent_session_id: parentSessionId,
			plan_id: planId || undefined,
			step_number: stepNumber || undefined,
			planner_agent_id: plannerAgentId,
			executor_agent_id: undefined,
			session_type: 'planner_thinking',
			initial_context: {
				type: 'planner_tool_query',
				timestamp: new Date().toISOString()
			},
			user_id: userId,
			status: 'active'
		};

		const { data, error } = await this.supabase
			.from('agent_chat_sessions')
			.insert(session)
			.select()
			.single();

		if (error) {
			console.error('Failed to create agent chat session:', error);
			throw new Error(`Failed to create agent chat session: ${error.message}`);
		}

		return data.id;
	}

	/**
	 * Save agent chat message
	 */
	private async saveAgentChatMessage(
		agentSessionId: string,
		parentSessionId: string,
		userId: string,
		plannerAgentId: string,
		role: 'system' | 'user' | 'assistant' | 'tool',
		content: string,
		toolCalls?: Json,
		toolCallId?: string,
		tokensUsed?: number,
		modelUsed?: string
	): Promise<void> {
		const message: {
			agent_session_id: string;
			sender_type: string;
			sender_agent_id: string;
			role: string;
			content: string;
			tool_calls?: Json;
			tool_call_id?: string;
			tokens_used: number;
			model_used: string;
			parent_user_session_id: string;
			user_id: string;
		} = {
			agent_session_id: agentSessionId,
			sender_type: 'planner',
			sender_agent_id: plannerAgentId,
			role,
			content,
			tool_calls: toolCalls || undefined,
			tool_call_id: toolCallId || undefined,
			tokens_used: tokensUsed || 0,
			model_used: modelUsed || 'deepseek/deepseek-chat',
			parent_user_session_id: parentSessionId,
			user_id: userId
		};

		const { error } = await this.supabase.from('agent_chat_messages').insert(message);

		if (error) {
			console.error('Failed to save agent chat message:', error);
			// Don't throw - message persistence failure shouldn't block the flow
		}
	}

	/**
	 * Update agent chat session status
	 */
	private async updateAgentChatSession(
		sessionId: string,
		status: 'active' | 'completed' | 'failed'
	): Promise<void> {
		const updates: {
			status: 'active' | 'completed' | 'failed';
			completed_at?: string;
		} = {
			status
		};

		if (status === 'completed' || status === 'failed') {
			updates.completed_at = new Date().toISOString();
		}

		const { error } = await this.supabase
			.from('agent_chat_sessions')
			.update(updates)
			.eq('id', sessionId);

		if (error) {
			console.error('Failed to update agent chat session:', error);
			// Don't throw - this is not critical
		}
	}

	/**
	 * Analyze user intent and select strategy
	 */
	async analyzeUserIntent({message, context, lastTurnContext, userId}: {
		message: string,
		context: EnhancedPlannerContext | PlannerContext,
		lastTurnContext?: LastTurnContext,
		userId: string
	}
	): Promise<StrategyAnalysis> {
		console.log('[Planner] Analyzing user intent', {
			message: message.substring(0, 100),
			contextType: context.metadata.contextType,
			hasOntology: 'hasOntology' in context.metadata ? context.metadata.hasOntology : false,
			hasLastTurn: !!lastTurnContext
		});

		const systemPrompt = `You are a strategy analyzer for BuildOS chat.

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
- Type: ${context.metadata.contextType}
- Has ontology: ${'hasOntology' in context.metadata ? context.metadata.hasOntology : false}
- Previous turn: ${lastTurnContext?.summary || 'First message'}
- Available tools: ${context.availableTools.length}
- Entities from last turn: ${JSON.stringify(lastTurnContext?.entities || {})}

IMPORTANT:
- Prefer research strategies over asking questions
- Only suggest clarifying questions if research cannot resolve the ambiguity
- Consider the context type when estimating complexity`;

		const analysisPrompt = `Analyze this user message and determine the best strategy:

User message: "${message}"

Previous context: ${lastTurnContext ? `User was ${lastTurnContext.summary}` : 'This is the first message'}

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

		try {
			const response = await this.smartLLM.generateText({
				systemPrompt,
				prompt: analysisPrompt,
				temperature: 0.3,
				maxTokens: 500,
				userId: userId,
				operationType: 'strategy_analysis'
			});

			const analysis = JSON.parse(response) as StrategyAnalysis;

			// Validate and normalize
			return this.validateStrategyAnalysis(analysis);
		} catch (error) {
			console.error('[Planner] Failed to analyze intent:', error);

			// Fallback to simple research
			return {
				primary_strategy: ChatStrategy.SIMPLE_RESEARCH,
				confidence: 0.5,
				reasoning: 'Defaulting to simple research due to analysis error',
				needs_clarification: false,
				estimated_steps: 1,
				required_tools: [],
				can_complete_directly: true
			};
		}
	}

	/**
	 * Execute the selected strategy
	 */
	async executeStrategy(
		analysis: StrategyAnalysis,
		context: EnhancedPlannerContext | PlannerContext,
		userMessage: string,
		streamCallback: (event: any) => void,
		userId: string,
	): Promise<ResearchResult> {
		console.log('[Planner] Executing strategy:', {
			strategy: analysis.primary_strategy,
			confidence: analysis.confidence,
			steps: analysis.estimated_steps
		});

		// Send strategy selection event
		streamCallback({
			type: 'strategy_selected',
			strategy: analysis.primary_strategy,
			confidence: analysis.confidence
		});

		switch (analysis.primary_strategy) {
			case ChatStrategy.SIMPLE_RESEARCH:
				return await this.executeSimpleResearch(
					analysis,
					context,
					userMessage,
					streamCallback
				);

			case ChatStrategy.COMPLEX_RESEARCH:
				return await this.executeComplexResearch(
					analysis,
					context,
					userMessage,
					streamCallback,
					userId
				);

			case ChatStrategy.ASK_CLARIFYING:
				return await this.executeClarifyingQuestions(analysis, context, streamCallback);

			default:
				throw new Error(`Unknown strategy: ${analysis.primary_strategy}`);
		}
	}

	/**
	 * Execute simple research (1-2 tool calls)
	 */
	private async executeSimpleResearch(
		analysis: StrategyAnalysis,
		context: EnhancedPlannerContext | PlannerContext,
		userMessage: string,
		streamCallback: (event: any) => void
	): Promise<ResearchResult> {
		console.log('[Planner] Executing simple research with tools:', analysis.required_tools);

		const tools = analysis.required_tools.slice(0, 2); // Max 2 tools
		const results: any[] = [];
		const entitiesAccessed: string[] = [];
		const toolsUsed: string[] = [];

		// Initialize tool executor
		const toolExecutor = new ChatToolExecutor(this.supabase, context.metadata.sessionId, );

		// Execute tools directly (no executor agent needed)
		for (const toolName of tools) {
			streamCallback({
				type: 'tool_call',
				tool_call: {
					function: {
						name: toolName,
						arguments: this.generateToolArguments(toolName, userMessage, context)
					}
				}
			});

			try {
				// Execute tool via tool executor
				const toolResult = await toolExecutor.executeTool(
					toolName,
					this.generateToolArguments(toolName, userMessage, context),
					context.metadata.sessionId // Use session ID as user context
				);

				results.push(toolResult);
				toolsUsed.push(toolName);

				// Extract entity IDs from result
				const entityIds = this.extractEntityIds(toolResult);
				entitiesAccessed.push(...entityIds);

				streamCallback({
					type: 'tool_result',
					result: {
						tool: toolName,
						success: true,
						preview: this.getResultPreview(toolResult),
						entity_count: entityIds.length
					}
				});
			} catch (error) {
				console.error(`[Planner] Tool ${toolName} failed:`, error);
				streamCallback({
					type: 'tool_result',
					result: {
						tool: toolName,
						success: false,
						error: error.message
					}
				});
			}
		}

		// Check if clarification is needed after research
		if (analysis.needs_clarification && !this.hasEnoughInfo(results)) {
			console.log('[Planner] Research incomplete, need clarification');
			return {
				strategy_used: ChatStrategy.SIMPLE_RESEARCH,
				data_found: results,
				entities_accessed: entitiesAccessed,
				tools_used: toolsUsed,
				needs_followup: true,
				followup_questions: analysis.clarifying_questions,
				success: true
			};
		}

		return {
			strategy_used: ChatStrategy.SIMPLE_RESEARCH,
			data_found: results,
			entities_accessed: entitiesAccessed,
			tools_used: toolsUsed,
			needs_followup: false,
			success: true
		};
	}

	/**
	 * Execute complex research (multi-step with possible executors)
	 */
	private async executeComplexResearch(
		analysis: StrategyAnalysis,
		context: EnhancedPlannerContext | PlannerContext,
		userMessage: string,
		streamCallback: (event: any) => void,
		userId: string
	): Promise<ResearchResult> {
		console.log('[Planner] Executing complex research');

		// Create multi-step plan
		const plan = await this.createResearchPlan(analysis, context, userMessage);

		streamCallback({
			type: 'plan_created',
			plan: {
				steps: plan.steps.map((s) => ({
					stepNumber: s.stepNumber,
					description: s.description,
					status: 'pending'
				}))
			}
		});

		// Check if we need executors
		if (plan.steps.some((s) => s.requiresExecutor)) {
			// Generate just-in-time instructions
			const instructionGen = new ExecutorInstructionGenerator();
			const instructions = instructionGen.generateInstructions(
				plan,
				context as EnhancedPlannerContext
			);

			streamCallback({
				type: 'executor_instructions',
				instructions
			});

			// Execute with executors
			return await this.executeWithExecutors(plan, context, userMessage, streamCallback);
		}

		// Execute sequentially without executors
		const results: any[] = [];
		const entitiesAccessed: string[] = [];
		const toolsUsed: string[] = [];
		const toolExecutor = new ChatToolExecutor(this.supabase, userId);

		for (const step of plan.steps) {
			streamCallback({
				type: 'step_start',
				step: {
					stepNumber: step.stepNumber,
					description: step.description
				}
			});

			// Execute step
			for (const tool of step.requiredTools) {
				try {
					const stepResult = await toolExecutor.executeTool(
						tool,
						this.generateToolArguments(tool, userMessage, context),
						context.metadata.sessionId
					);

					results.push(stepResult);
					entitiesAccessed.push(...this.extractEntityIds(stepResult));
					toolsUsed.push(tool);
				} catch (error) {
					console.error(`[Planner] Step ${step.stepNumber} tool ${tool} failed:`, error);
				}
			}

			streamCallback({
				type: 'step_complete',
				step: {
					stepNumber: step.stepNumber,
					success: true
				}
			});
		}

		return {
			strategy_used: ChatStrategy.COMPLEX_RESEARCH,
			data_found: results,
			entities_accessed: entitiesAccessed,
			tools_used: toolsUsed,
			needs_followup: false,
			success: true
		};
	}

	/**
	 * Execute clarifying questions strategy
	 */
	private async executeClarifyingQuestions(
		analysis: StrategyAnalysis,
		context: EnhancedPlannerContext | PlannerContext,
		streamCallback: (event: any) => void
	): Promise<ResearchResult> {
		console.log('[Planner] Asking clarifying questions');

		const questions = analysis.clarifying_questions || [
			'Could you provide more specific details about what you are looking for?',
			'Which project or timeframe are you interested in?'
		];

		streamCallback({
			type: 'clarifying_questions',
			questions
		});

		return {
			strategy_used: ChatStrategy.ASK_CLARIFYING,
			data_found: null,
			entities_accessed: [],
			tools_used: [],
			needs_followup: true,
			followup_questions: questions,
			success: true
		};
	}

	/**
	 * Generate response from research results
	 */
	async generateResponse(
		result: ResearchResult,
		context: EnhancedPlannerContext | PlannerContext,
		userId: string
	): Promise<string> {
		if (!result.success || !result.data_found) {
			return 'I encountered an issue while researching your request. Please try again.';
		}

		const systemPrompt = `You are presenting research results to the user.
Context type: ${context.metadata.contextType}
Strategy used: ${result.strategy_used}
Tools used: ${result.tools_used.join(', ')}

Format the response clearly and concisely.
If abbreviated data was retrieved, mention that more details are available.`;

		const dataPrompt = `Research results:
${JSON.stringify(result.data_found, null, 2)}

Entities accessed: ${result.entities_accessed.join(', ') || 'none'}

Generate a helpful response that:
1. Answers the user's question
2. Mentions if more detailed information is available
3. References specific entities by name and ID
4. Is formatted with markdown for readability`;

		const response = await this.smartLLM.generateText({
			systemPrompt,
			prompt: dataPrompt,
			temperature: 0.7,
			maxTokens: 1000,
			userId: userId,
			operationType: 'response_generation'
		});

		return response;
	}

	// === Helper Methods ===

	private validateStrategyAnalysis(analysis: any): StrategyAnalysis {
		// Map string strategies to enum
		let strategy: ChatStrategy;
		if (analysis.primary_strategy === 'simple_research') {
			strategy = ChatStrategy.SIMPLE_RESEARCH;
		} else if (analysis.primary_strategy === 'complex_research') {
			strategy = ChatStrategy.COMPLEX_RESEARCH;
		} else if (
			analysis.primary_strategy === 'ask_clarifying_questions' ||
			analysis.primary_strategy === 'clarifying'
		) {
			strategy = ChatStrategy.ASK_CLARIFYING;
		} else {
			strategy = ChatStrategy.SIMPLE_RESEARCH; // Default
		}

		return {
			primary_strategy: strategy,
			confidence: Math.max(0, Math.min(1, analysis.confidence || 0.5)),
			reasoning: analysis.reasoning || 'No reasoning provided',
			needs_clarification: !!analysis.needs_clarification,
			clarifying_questions: Array.isArray(analysis.clarifying_questions)
				? analysis.clarifying_questions
				: undefined,
			estimated_steps: Math.max(1, analysis.estimated_steps || 1),
			required_tools: Array.isArray(analysis.required_tools) ? analysis.required_tools : [],
			can_complete_directly: analysis.can_complete_directly !== false
		};
	}

	private generateToolArguments(toolName: string, userMessage: string, context: any): string {
		// Generate appropriate arguments based on tool name
		const args: any = {};

		if (toolName.includes('list') || toolName.includes('search')) {
			if (context.metadata.entityId) {
				args.project_id = context.metadata.entityId;
			}
			if (toolName.includes('search')) {
				// Extract search terms from user message
				args.query = userMessage.substring(0, 100);
			}
		} else if (toolName.includes('get') && toolName.includes('details')) {
			// Need specific ID
			if (context.lastTurnContext?.entities) {
				const entities = context.lastTurnContext.entities;
				if (toolName.includes('project') && entities.project_id) {
					args.id = entities.project_id;
				} else if (toolName.includes('task') && entities.task_ids?.length) {
					args.id = entities.task_ids[0];
				}
			}
		}

		return JSON.stringify(args);
	}

	private extractEntityIds(result: any): string[] {
		const ids: string[] = [];

		// Extract IDs from various result formats
		if (Array.isArray(result)) {
			result.forEach((item) => {
				if (item?.id) ids.push(item.id);
			});
		} else if (result?.data && Array.isArray(result.data)) {
			result.data.forEach((item) => {
				if (item?.id) ids.push(item.id);
			});
		} else if (result?.id) {
			ids.push(result.id);
		}

		// Also check for nested entities
		if (result?.tasks) {
			result.tasks.forEach((task) => {
				if (task?.id) ids.push(task.id);
			});
		}
		if (result?.goals) {
			result.goals.forEach((goal) => {
				if (goal?.id) ids.push(goal.id);
			});
		}

		return [...new Set(ids)]; // Deduplicate
	}

	private hasEnoughInfo(results: any[]): boolean {
		// Check if results contain enough information
		if (!results || results.length === 0) return false;

		// Check if we have actual data
		const hasData = results.some((r) => {
			if (!r) return false;
			if (Array.isArray(r) && r.length > 0) return true;
			if (r.data && Array.isArray(r.data) && r.data.length > 0) return true;
			if (typeof r === 'object' && Object.keys(r).length > 1) return true;
			return false;
		});

		return hasData;
	}

	private getResultPreview(result: any): string {
		if (Array.isArray(result)) {
			return `Found ${result.length} items`;
		} else if (result?.data && Array.isArray(result.data)) {
			return `Retrieved ${result.data.length} ${result.type || 'items'}`;
		} else if (result?.id) {
			return `Retrieved ${result.type || 'entity'} ${result.id}`;
		}
		return 'Data retrieved';
	}

	private async createResearchPlan(
		analysis: StrategyAnalysis,
		context: EnhancedPlannerContext | PlannerContext,
		userMessage: string
	): Promise<any> {
		// Create a plan based on analysis
		const steps = [];

		for (let i = 0; i < analysis.estimated_steps; i++) {
			const toolsForStep = analysis.required_tools.slice(i * 2, (i + 1) * 2);

			steps.push({
				stepNumber: i + 1,
				description: `Execute ${toolsForStep.join(' and ')}`,
				requiresExecutor: analysis.estimated_steps > 3 && i > 0,
				requiredTools: toolsForStep,
				successCriteria: 'Return valid data',
				requiresProjectContext: context.metadata.entityId != null,
				requiresHistoricalData: i > 0 // Later steps may need earlier results
			});
		}

		return {
			steps,
			requiresParallelExecution: analysis.estimated_steps > 3
		};
	}

	private async executeWithExecutors(
		plan: any,
		context: EnhancedPlannerContext | PlannerContext,
		userMessage: string,
		streamCallback: (event: any) => void
	): Promise<ResearchResult> {
		// This is where we would spawn actual executor agents
		// For now, we'll simulate the execution
		console.log('[Planner] Would spawn executors for plan', plan);

		const executorService = new AgentExecutorService(this.supabase, this.smartLLM);
		const results = [];
		const entitiesAccessed = [];
		const toolsUsed = [];

		for (const step of plan.steps.filter((s) => s.requiresExecutor)) {
			streamCallback({
				type: 'executor_spawned',
				task: {
					description: step.description
				}
			});

			// Create executor task
			const task = {
				description: step.description,
				tools: step.requiredTools,
				context: {
					projectId: context.metadata.entityId,
					userMessage
				}
			};

			// Execute (simplified)
			try {
				const result = await executorService.executeTask(
					task,
					step.requiredTools,
					context.metadata.sessionId
				);

				results.push(result);
				if (result.entitiesAccessed) {
					entitiesAccessed.push(...result.entitiesAccessed);
				}
				toolsUsed.push(...step.requiredTools);

				streamCallback({
					type: 'executor_result',
					result: {
						success: result.success
					}
				});
			} catch (error) {
				console.error('[Planner] Executor failed:', error);
			}
		}

		return {
			strategy_used: ChatStrategy.COMPLEX_RESEARCH,
			data_found: results,
			entities_accessed: entitiesAccessed,
			tools_used: toolsUsed,
			needs_followup: false,
			success: true
		};
	}
}
