// apps/web/src/lib/services/agent-executor-service.ts
/**
 * Agent Executor Service - Task Execution Layer for Multi-Agent System
 *
 * This service handles focused, stateless execution of specific tasks.
 * Responsible for:
 * - Executing single, well-defined tasks
 * - Using minimal context and specific tool subsets
 * - Returning structured results (no conversation)
 * - Optimizing for token efficiency
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Database,
	ChatToolDefinition,
	ChatToolCall,
	ChatToolResult,
	LLMMessage,
	AgentInsert,
	AgentChatSessionInsert,
	AgentChatMessageInsert,
	AgentExecutionInsert,
	Json
} from '@buildos/shared-types';
import {
	AgentContextService,
	type ExecutorTask,
	type ExecutorContext
} from './agent-context-service';
import { SmartLLMService } from './smart-llm-service';
import { ChatToolExecutor } from '$lib/chat/tool-executor';
import { getToolsForAgent } from '@buildos/shared-types';
import { v4 as uuidv4 } from 'uuid';
import { savePromptForAudit } from '$lib/utils/prompt-audit';

// ============================================
// TYPES
// ============================================

/**
 * Parameters for executing a task
 */
export interface ExecuteTaskParams {
	executorId: string;
	sessionId: string;
	userId: string;
	task: ExecutorTask;
	tools: ChatToolDefinition[];
	planId?: string;
	contextType?: string;
	entityId?: string;
}

/**
 * Result from executor execution
 */
export interface ExecutorResult {
	executorId: string;
	success: boolean;
	data?: any; // Structured output from the task
	error?: string;
	toolCallsMade: number;
	tokensUsed: number;
	durationMs: number;
}

/**
 * Executor event types for streaming
 */
export type ExecutorEvent =
	| { type: 'start'; executorId: string; task: ExecutorTask }
	| { type: 'thinking'; content: string }
	| { type: 'tool_call'; toolCall: ChatToolCall }
	| { type: 'tool_result'; result: ChatToolResult }
	| { type: 'result'; data: any }
	| { type: 'done'; result: ExecutorResult }
	| { type: 'error'; error: string };

// ============================================
// SERVICE
// ============================================

export class AgentExecutorService {
	private contextService: AgentContextService;
	private smartLLM: SmartLLMService;

	// Execution limits for safety
	private readonly LIMITS = {
		MAX_TOOL_CALLS: 10, // Prevent infinite loops
		MAX_EXECUTION_TIME_MS: 60000, // 60 seconds max
		MAX_RETRIES: 2 // Max retries per tool call
	};

	constructor(
		private supabase: SupabaseClient<Database>,
		smartLLM?: SmartLLMService
	) {
		this.contextService = new AgentContextService(supabase);

		// Initialize SmartLLMService if not provided
		this.smartLLM =
			smartLLM ||
			new SmartLLMService({
				supabase,
				httpReferer: 'https://buildos.com',
				appName: 'BuildOS Executor Agent'
			});
	}

	// ============================================
	// MAIN ENTRY POINT
	// ============================================

	/**
	 * Execute a specific task with given tools
	 * Returns structured result without conversation
	 *
	 * @param params - Task execution parameters
	 * @returns Promise with execution result
	 */
	async executeTask(params: ExecuteTaskParams): Promise<ExecutorResult> {
		const startTime = Date.now();
		const { executorId, sessionId, userId, task, tools, planId } = params;

		try {
			// 1. Build executor context (minimal)
			const context = await this.contextService.buildExecutorContext({
				executorId,
				sessionId,
				userId,
				task,
				tools,
				planId
			});

			// 2. Execute task with LLM + tools
			const result = await this.executeWithContext(context, userId);

			// 3. Return structured result
			return {
				executorId,
				success: true,
				data: result.data,
				toolCallsMade: result.toolCallsMade,
				tokensUsed: result.tokensUsed,
				durationMs: Date.now() - startTime
			};
		} catch (error) {
			console.error('Executor error:', error);

			return {
				executorId,
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				toolCallsMade: 0,
				tokensUsed: 0,
				durationMs: Date.now() - startTime
			};
		}
	}

	/**
	 * Execute task with streaming events
	 * Allows caller to monitor progress in real-time
	 *
	 * @param params - Task execution parameters
	 * @returns Async generator yielding executor events
	 */
	async *executeTaskStream(params: ExecuteTaskParams): AsyncGenerator<ExecutorEvent> {
		const startTime = Date.now();
		const { executorId, sessionId, userId, task, tools, planId } = params;

		yield { type: 'start', executorId, task };

		try {
			// 1. Build executor context
			const context = await this.contextService.buildExecutorContext({
				executorId,
				sessionId,
				userId,
				task,
				tools,
				planId
			});

			// 2. Execute with streaming
			let toolCallsMade = 0;
			let tokensUsed = 0;
			let resultData: any = null;

			// For now, yield placeholder events
			// This will be replaced with actual LLM streaming
			yield { type: 'thinking', content: 'Analyzing task...' };

			// Simulate task execution
			yield {
				type: 'thinking',
				content: `Task: ${task.description}\nGoal: ${task.goal}\n`
			};

			// Placeholder for tool execution
			if (tools.length > 0) {
				yield {
					type: 'thinking',
					content: `Available tools: ${tools.map((t) => t.function.name).join(', ')}\n`
				};
			}

			// Return result
			resultData = {
				message: 'Task execution will be implemented with actual LLM streaming',
				task: task.description,
				toolsAvailable: tools.length
			};

			yield { type: 'result', data: resultData };

			// Final result
			const finalResult: ExecutorResult = {
				executorId,
				success: true,
				data: resultData,
				toolCallsMade,
				tokensUsed,
				durationMs: Date.now() - startTime
			};

			yield { type: 'done', result: finalResult };
		} catch (error) {
			console.error('Executor stream error:', error);
			yield {
				type: 'error',
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ============================================
	// EXECUTION LOGIC
	// ============================================

	/**
	 * Execute task using built context
	 * Core execution loop: LLM → Tool Calls → Results → Synthesis
	 */
	private async executeWithContext(
		context: ExecutorContext,
		userId: string
	): Promise<{
		data: any;
		toolCallsMade: number;
		tokensUsed: number;
	}> {
		// Build messages for LLM
		const systemPrompt = context.systemPrompt;
		const userPrompt = this.formatTaskForLLM(context.task);

		const messages: any[] = [
			{ role: 'system', content: systemPrompt },
			{
				role: 'user',
				content: userPrompt
			}
		];

		// Add relevant data if available
		if (context.relevantData) {
			messages.push({
				role: 'system',
				content: `Relevant context:\n${JSON.stringify(context.relevantData, null, 2)}`
			});
		}

		// Create tool executor with READ-ONLY permission
		// Filter tools to only READ-ONLY
		const readOnlyTools = getToolsForAgent(context.tools, 'read_only');
		const toolExecutor = new ChatToolExecutor(
			this.supabase,
			userId,
			context.metadata.sessionId
		);

		// Save prompt for audit
		await savePromptForAudit({
			systemPrompt,
			userPrompt,
			scenarioType: 'agent-executor-task-execution',
			metadata: {
				executorId: context.metadata.executorId,
				sessionId: context.metadata.sessionId,
				taskDescription: context.task.description,
				taskGoal: context.task.goal,
				availableTools: readOnlyTools.map((t) => t.function.name),
				hasRelevantData: !!context.relevantData,
				userId
			}
		});

		let toolCallsMade = 0;
		let tokensUsed = 0;
		let resultData: any = null;

		// Stream from LLM with READ-ONLY tools
		for await (const event of this.smartLLM.streamText({
			messages,
			tools: readOnlyTools,
			tool_choice: 'auto',
			userId: context.metadata.sessionId,
			profile: 'speed', // Use fast model for executor
			temperature: 0.3,
			maxTokens: 1500,
			sessionId: context.metadata.sessionId
		})) {
			switch (event.type) {
				case 'text':
					// Accumulate response text
					if (!resultData) resultData = { response: '' };
					resultData.response += event.content || '';
					break;

				case 'tool_call':
					// Execute READ-ONLY tool
					toolCallsMade++;
					try {
						const result = await toolExecutor.execute(event.tool_call!);

						// Add tool result to messages
						messages.push({
							role: 'assistant',
							content: '',
							tool_calls: [event.tool_call!]
						});
						messages.push({
							role: 'tool',
							content: JSON.stringify(result.result),
							tool_call_id: event.tool_call!.id
						});

						// Store tool results
						if (!resultData) resultData = {};
						if (!resultData.toolResults) resultData.toolResults = [];
						resultData.toolResults.push({
							tool: event.tool_call!.function.name,
							result: result.result
						});
					} catch (error) {
						console.error('Executor tool execution error:', error);
						if (!resultData) resultData = {};
						if (!resultData.errors) resultData.errors = [];
						resultData.errors.push({
							tool: event.tool_call!.function.name,
							error: error instanceof Error ? error.message : 'Unknown error'
						});
					}
					break;

				case 'done':
					tokensUsed = event.usage?.total_tokens || 0;
					break;

				case 'error':
					console.error('Executor streaming error:', event.error);
					throw new Error(event.error);
			}
		}

		const result = {
			data: resultData || { message: 'Task executed with no output' },
			toolCallsMade,
			tokensUsed
		};

		// Persist execution record
		await this.persistExecution(context, result);

		return result;
	}

	/**
	 * Format task into clear prompt for executor LLM
	 */
	private formatTaskForLLM(task: ExecutorTask): string {
		let prompt = `Execute this task:\n\n`;
		prompt += `**Description:** ${task.description}\n`;
		prompt += `**Goal:** ${task.goal}\n`;

		if (task.constraints && task.constraints.length > 0) {
			prompt += `\n**Constraints:**\n`;
			task.constraints.forEach((constraint) => {
				prompt += `- ${constraint}\n`;
			});
		}

		prompt += `\nUse the available tools to complete this task. Return structured results.`;

		return prompt;
	}

	// ============================================
	// TOOL EXECUTION
	// ============================================

	/**
	 * Execute a single tool call
	 * Reuses ChatToolExecutor for actual tool execution
	 */
	private async executeTool(toolCall: ChatToolCall, userId: string): Promise<ChatToolResult> {
		// This will delegate to ChatToolExecutor
		// For now, return placeholder
		return {
			tool_call_id: toolCall.id,
			result: {
				message: 'Tool execution will be delegated to ChatToolExecutor'
			},
			success: true,
			duration_ms: 100
		};
	}

	/**
	 * Execute multiple tool calls in sequence
	 * Handles dependencies and retries
	 */
	private async executeToolChain(
		toolCalls: ChatToolCall[],
		userId: string
	): Promise<ChatToolResult[]> {
		const results: ChatToolResult[] = [];

		for (const toolCall of toolCalls) {
			let attempt = 0;
			let success = false;
			let result: ChatToolResult | null = null;

			while (attempt < this.LIMITS.MAX_RETRIES && !success) {
				try {
					result = await this.executeTool(toolCall, userId);
					success = result.success;

					if (success) {
						results.push(result);
					}
				} catch (error) {
					console.error(`Tool execution failed (attempt ${attempt + 1}):`, error);
					attempt++;
				}
			}

			// If all retries failed, add error result
			if (!success && result) {
				results.push({
					tool_call_id: toolCall.id,
					result: null,
					success: false,
					error: `Tool execution failed after ${this.LIMITS.MAX_RETRIES} attempts`
				});
			}

			// Check if we've exceeded max tool calls
			if (results.length >= this.LIMITS.MAX_TOOL_CALLS) {
				console.warn(
					`Executor reached max tool calls limit (${this.LIMITS.MAX_TOOL_CALLS})`
				);
				break;
			}
		}

		return results;
	}

	// ============================================
	// RESULT FORMATTING
	// ============================================

	/**
	 * Format execution result into structured output
	 * Extracts key data and organizes for planner consumption
	 */
	private formatResult(toolResults: ChatToolResult[], task: ExecutorTask): any {
		// Extract successful results
		const successfulResults = toolResults.filter((r) => r.success);
		const failedResults = toolResults.filter((r) => !r.success);

		// Build structured result based on task type
		const formattedResult = {
			taskId: task.id,
			taskDescription: task.description,
			goal: task.goal,
			status: failedResults.length === 0 ? 'completed' : 'partial',
			results: successfulResults.map((r) => ({
				toolCallId: r.tool_call_id,
				data: r.result
			})),
			errors: failedResults.map((r) => ({
				toolCallId: r.tool_call_id,
				error: r.error
			})),
			summary: this.generateResultSummary(successfulResults, task)
		};

		return formattedResult;
	}

	/**
	 * Generate human-readable summary of execution results
	 */
	private generateResultSummary(results: ChatToolResult[], task: ExecutorTask): string {
		if (results.length === 0) {
			return `Task "${task.description}" completed with no tool calls.`;
		}

		const summary = `Task "${task.description}" completed with ${results.length} successful operation(s).`;

		return summary;
	}

	// ============================================
	// PERSISTENCE & LOGGING
	// ============================================

	/**
	 * Persist execution record to database (for tracking and analytics)
	 */
	private async persistExecution(
		context: ExecutorContext,
		result: {
			data: any;
			toolCallsMade: number;
			tokensUsed: number;
		}
	): Promise<void> {
		// This will be called with full execution details when integrated into the flow
		console.log('Executor completed:', {
			executorId: context.metadata.executorId,
			task: context.task.description,
			toolsUsed: result.toolCallsMade,
			tokensUsed: result.tokensUsed
		});
	}

	// ============================================
	// DATABASE PERSISTENCE METHODS
	// ============================================

	/**
	 * Extract real user_id from chat_sessions table
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
	 * Create executor agent in database
	 */
	async createExecutorAgent(
		sessionId: string,
		userId: string,
		systemPrompt: string,
		availableTools: ChatToolDefinition[],
		planId?: string
	): Promise<string> {
		const agent: AgentInsert = {
			type: 'executor',
			name: `Executor-${Date.now()}`,
			model_preference: 'deepseek/deepseek-coder',
			available_tools: availableTools.map((t) => t.function.name),
			permissions: 'read_only',
			system_prompt: systemPrompt,
			created_for_session: sessionId,
			created_for_plan: planId || undefined,
			user_id: userId,
			status: 'active'
		};

		const { data, error } = await this.supabase.from('agents').insert(agent).select().single();

		if (error) {
			console.error('Failed to create executor agent:', error);
			throw new Error(`Failed to create executor agent: ${error.message}`);
		}

		return data.id;
	}

	/**
	 * Update executor agent status
	 */
	async updateExecutorAgent(
		agentId: string,
		status: 'active' | 'completed' | 'failed'
	): Promise<void> {
		const updates: {
			status: 'active' | 'completed' | 'failed';
			completed_at?: string;
		} = {
			status
		};

		// Only set completed_at if status is not active
		if (status !== 'active') {
			updates.completed_at = new Date().toISOString();
		}

		const { error } = await this.supabase.from('agents').update(updates).eq('id', agentId);

		if (error) {
			console.error('Failed to update executor agent:', error);
			// Don't throw - this is not critical
		}
	}

	/**
	 * Create agent chat session for executor execution
	 */
	async createAgentChatSession(
		parentSessionId: string,
		userId: string,
		plannerAgentId: string,
		executorAgentId: string,
		planId?: string,
		stepNumber?: number,
		task?: ExecutorTask
	): Promise<string> {
		const session: any = {
			parent_session_id: parentSessionId,
			plan_id: planId || undefined,
			step_number: stepNumber || undefined,
			planner_agent_id: plannerAgentId,
			executor_agent_id: executorAgentId,
			session_type: 'planner_executor',
			initial_context: {
				type: 'executor_task',
				task: task || {},
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
	async saveAgentChatMessage(
		agentSessionId: string,
		parentSessionId: string,
		userId: string,
		executorAgentId: string,
		role: 'system' | 'user' | 'assistant' | 'tool',
		content: string,
		toolCalls?: Json,
		toolCallId?: string,
		tokensUsed?: number
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
			sender_type: 'executor',
			sender_agent_id: executorAgentId,
			role,
			content,
			tool_calls: toolCalls || undefined,
			tool_call_id: toolCallId || undefined,
			tokens_used: tokensUsed || 0,
			model_used: 'deepseek/deepseek-coder',
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
	async updateAgentChatSession(
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
	 * Create agent execution record
	 */
	async createAgentExecution(
		planId: string,
		stepNumber: number,
		executorAgentId: string,
		agentSessionId: string,
		task: ExecutorTask,
		toolsAvailable: string[],
		userId: string
	): Promise<string> {
		const execution: any = {
			plan_id: planId,
			step_number: stepNumber,
			executor_agent_id: executorAgentId,
			agent_session_id: agentSessionId,
			task: task,
			tools_available: toolsAvailable,
			success: false,
			status: 'pending',
			tokens_used: 0,
			duration_ms: 0,
			tool_calls_made: 0,
			message_count: 0,
			user_id: userId
		};

		const { data, error } = await this.supabase
			.from('agent_executions')
			.insert(execution)
			.select()
			.single();

		if (error) {
			console.error('Failed to create agent execution:', error);
			throw new Error(`Failed to create agent execution: ${error.message}`);
		}

		return data.id;
	}

	/**
	 * Update agent execution with results
	 */
	async updateAgentExecution(
		executionId: string,
		result: any,
		success: boolean,
		tokensUsed: number,
		durationMs: number,
		toolCallsMade: number,
		messageCount: number,
		error?: string
	): Promise<void> {
		const updates: {
			result: Json | null;
			success: boolean;
			tokens_used: number;
			duration_ms: number;
			tool_calls_made: number;
			message_count: number;
			status: string;
			completed_at: string;
			error?: string | null;
		} = {
			result: result,
			success,
			tokens_used: tokensUsed,
			duration_ms: durationMs,
			tool_calls_made: toolCallsMade,
			message_count: messageCount,
			status: success ? 'completed' : 'failed',
			completed_at: new Date().toISOString(),
			error: error || undefined
		};

		const { error: updateError } = await this.supabase
			.from('agent_executions')
			.update(updates)
			.eq('id', executionId);

		if (updateError) {
			console.error('Failed to update agent execution:', updateError);
			// Don't throw - this is not critical
		}
	}

	/**
	 * Log tool execution for debugging and analytics
	 */
	private async logToolExecution(
		executorId: string,
		toolCall: ChatToolCall,
		result: ChatToolResult
	): Promise<void> {
		// Tool execution logging will be implemented later
		console.log('Tool executed:', {
			executorId,
			tool: toolCall.function.name,
			success: result.success,
			duration: result.duration_ms
		});
	}

	// ============================================
	// HELPER METHODS
	// ============================================

	/**
	 * Check if execution time limit has been exceeded
	 */
	private checkTimeLimit(startTime: number): boolean {
		return Date.now() - startTime > this.LIMITS.MAX_EXECUTION_TIME_MS;
	}

	/**
	 * Validate tool is in allowed tool list
	 */
	private validateTool(toolCall: ChatToolCall, allowedTools: ChatToolDefinition[]): boolean {
		return allowedTools.some((tool) => tool.function.name === toolCall.function.name);
	}

	/**
	 * Estimate tokens used by executor
	 * For cost tracking and optimization
	 */
	private estimateTokens(messages: LLMMessage[], toolResults: ChatToolResult[]): number {
		// Rough estimation: 4 chars per token
		let total = 0;

		messages.forEach((msg) => {
			total += Math.ceil(msg.content.length / 4);
		});

		toolResults.forEach((result) => {
			total += Math.ceil(JSON.stringify(result).length / 4);
		});

		return total;
	}
}
