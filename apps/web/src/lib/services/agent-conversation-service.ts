// apps/web/src/lib/services/agent-conversation-service.ts
/**
 * Agent Conversation Service - LLM-to-LLM Conversation Orchestrator
 *
 * This service manages iterative conversations between planner and executor agents.
 * It handles message exchange, turn management, termination detection, and result synthesis.
 *
 * Architecture:
 * - Planner spawns executor for a task
 * - Conversation begins with initial task context
 * - Executor can ask questions or return results
 * - Planner evaluates and responds
 * - Loop continues until task complete or max turns reached
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Database,
	ChatToolDefinition,
	LLMMessage,
	Json,
	ChatToolCall
} from '@buildos/shared-types';
import { SmartLLMService } from './smart-llm-service';
import { ChatToolExecutor } from '$lib/services/agentic-chat/tools/core/tool-executor';
import { getToolsForAgent } from '@buildos/shared-types';
import type { ExecutorTask } from './agent-context-service';
import { savePromptForAudit } from '$lib/utils/prompt-audit';

// ============================================
// TYPES
// ============================================

/**
 * Conversation message types
 */
export type ConversationMessageType =
	| 'task_assignment' // Planner → Executor: Initial task
	| 'question' // Executor → Planner: Need clarification
	| 'clarification' // Planner → Executor: Answer to question
	| 'progress_update' // Executor → Planner: Progress report
	| 'partial_result' // Executor → Planner: Intermediate result
	| 'task_complete' // Executor → Planner: Final result
	| 'error'; // Executor → Planner: Error occurred

/**
 * Structured conversation message
 */
export interface ConversationMessage {
	type: ConversationMessageType;
	content: string;
	data?: Json; // Structured data (results, questions, etc.)
	toolCalls?: ChatToolCall[];
	timestamp: Date;
}

/**
 * Conversation session state
 */
export interface ConversationSession {
	id: string;
	plannerAgentId: string;
	executorAgentId: string;
	parentSessionId: string;
	planId: string;
	stepNumber: number;
	task: ExecutorTask;
	tools: ChatToolDefinition[];
	status: 'active' | 'completed' | 'failed';
	turnCount: number;
	maxTurns: number;
	messages: ConversationMessage[];
	result?: any;
	error?: string;
	createdAt: Date;
	completedAt?: Date;
	// Context enrichment for executors
	locationContext?: string; // Current project/task/calendar context (from planner)
	previousResults?: string; // Results from previous executors in the plan
}

/**
 * Conversation result
 */
export interface ConversationResult {
	success: boolean;
	result?: any;
	error?: string;
	turnCount: number;
	tokensUsed: number;
	durationMs: number;
	messages: ConversationMessage[];
}

/**
 * Executor response structure
 */
export interface ExecutorResponse {
	type: 'thinking' | 'tool_call' | 'message';
	content?: string;
	messageType?: ConversationMessageType;
	data?: any;
	toolCall?: any;
}

type ExecutorResponseData = {
	toolResults?: Array<{ tool: string; result?: unknown; error?: string }>;
};

// ============================================
// SERVICE
// ============================================

export class AgentConversationService {
	private smartLLM: SmartLLMService;
	private fetchFn: typeof fetch; // Custom fetch function for API requests

	// Configuration
	private readonly CONFIG = {
		MAX_TURNS: 10, // Maximum conversation turns
		MAX_CONVERSATION_TIME_MS: 300000, // 5 minutes total conversation time
		EXECUTOR_TIMEOUT_MS: 60000, // 60 seconds per executor turn
		PLANNER_TIMEOUT_MS: 30000 // 30 seconds per planner response
	};

	constructor(
		private supabase: SupabaseClient<Database>,
		smartLLM?: SmartLLMService,
		fetchFn?: typeof fetch
	) {
		// Store fetch function (use global fetch as fallback)
		this.fetchFn = fetchFn || fetch;
		this.smartLLM =
			smartLLM ||
			new SmartLLMService({
				supabase,
				httpReferer: 'https://buildos.com',
				appName: 'BuildOS Agent Conversation'
			});
	}

	// ============================================
	// CONVERSATION LIFECYCLE
	// ============================================

	/**
	 * Start a new conversation between planner and executor
	 */
	async startConversation(params: {
		plannerAgentId: string;
		executorAgentId: string;
		parentSessionId: string;
		userId: string;
		planId: string;
		stepNumber: number;
		task: ExecutorTask;
		tools: ChatToolDefinition[];
		contextType?: string;
		entityId?: string;
		locationContext?: string; // Current project/task/calendar context
		previousResults?: string; // Results from previous executors
	}): Promise<ConversationSession> {
		const {
			plannerAgentId,
			executorAgentId,
			parentSessionId,
			userId,
			planId,
			stepNumber,
			task,
			tools,
			contextType,
			entityId,
			locationContext,
			previousResults
		} = params;

		// Create agent chat session in database
		const { data: dbSession, error } = await this.supabase
			.from('agent_chat_sessions')
			.insert({
				parent_session_id: parentSessionId,
				plan_id: planId,
				step_number: stepNumber,
				planner_agent_id: plannerAgentId,
				executor_agent_id: executorAgentId,
				session_type: 'planner_executor',
				initial_context: this.toJson({
					task,
					tools: tools.map((t) => t.function.name),
					timestamp: new Date().toISOString()
				}),
				context_type: contextType,
				entity_id: entityId,
				user_id: userId,
				status: 'active'
			})
			.select()
			.single();

		if (error) {
			throw new Error(`Failed to create conversation session: ${error.message}`);
		}

		// Create conversation session object
		const session: ConversationSession = {
			id: dbSession.id,
			plannerAgentId,
			executorAgentId,
			parentSessionId,
			planId,
			stepNumber,
			task,
			tools,
			status: 'active',
			turnCount: 0,
			maxTurns: this.CONFIG.MAX_TURNS,
			messages: [],
			createdAt: new Date(),
			// Context enrichment for executor
			locationContext,
			previousResults
		};

		return session;
	}

	/**
	 * Execute iterative conversation until task complete
	 * This is the main orchestration loop
	 */
	async *executeConversation(
		session: ConversationSession,
		userId: string
	): AsyncGenerator<ExecutorResponse> {
		const startTime = Date.now();
		let totalTokens = 0;

		try {
			// 1. Send initial task to executor
			const initialMessage: ConversationMessage = {
				type: 'task_assignment',
				content: this.formatTaskAssignment(session.task),
				data: this.toJson({ task: session.task }),
				timestamp: new Date()
			};

			session.messages.push(initialMessage);
			await this.saveConversationMessage(session, 'planner', initialMessage, userId);

			yield {
				type: 'message',
				content: `Starting conversation with executor for: ${session.task.description}`,
				messageType: 'task_assignment'
			};

			// 2. ITERATIVE CONVERSATION LOOP
			while (session.turnCount < session.maxTurns && session.status === 'active') {
				session.turnCount++;

				// Check for conversation timeout
				const elapsedTime = Date.now() - startTime;
				if (elapsedTime > this.CONFIG.MAX_CONVERSATION_TIME_MS) {
					session.status = 'failed';
					session.error = `Conversation timeout: exceeded ${this.CONFIG.MAX_CONVERSATION_TIME_MS / 1000}s limit`;
					session.completedAt = new Date();

					await this.updateConversationSession(
						session.id,
						session.status,
						undefined,
						session.error
					);

					yield {
						type: 'message',
						content: `Conversation timed out after ${Math.round(elapsedTime / 1000)}s. The task may be too complex or require manual intervention.`,
						messageType: 'error'
					};

					break;
				}

				yield {
					type: 'thinking',
					content: `Turn ${session.turnCount}/${session.maxTurns}: Executor processing...`
				};

				// 3. Get executor response
				const executorResponse = await this.getExecutorTurn(session, userId);

				// Track tokens
				totalTokens += executorResponse.tokensUsed || 0;

				// 4. Process executor response
				const executorMessage: ConversationMessage = {
					type: executorResponse.messageType,
					content: executorResponse.content,
					data: executorResponse.data ? this.toJson(executorResponse.data) : undefined,
					toolCalls: executorResponse.toolCalls,
					timestamp: new Date()
				};

				session.messages.push(executorMessage);
				await this.saveConversationMessage(session, 'executor', executorMessage, userId);

				yield {
					type: 'message',
					content: executorResponse.content,
					messageType: executorResponse.messageType,
					data: executorResponse.data
				};

				// 5. Check termination conditions
				const shouldEnd = this.shouldEndConversation(session, executorMessage);

				if (shouldEnd.end) {
					session.status = shouldEnd.success ? 'completed' : 'failed';
					session.result = executorResponse.data;
					session.completedAt = new Date();

					// Update session in DB
					await this.updateConversationSession(
						session.id,
						session.status,
						session.result
					);

					yield {
						type: 'message',
						content: shouldEnd.reason,
						messageType: 'task_complete',
						data: session.result
					};

					break;
				}

				// 6. Executor needs clarification - planner responds
				if (executorMessage.type === 'question') {
					yield {
						type: 'thinking',
						content: 'Planner evaluating question...'
					};

					const plannerResponse = await this.getPlannerResponse(
						session,
						executorMessage,
						userId
					);

					totalTokens += plannerResponse.tokensUsed || 0;

					const plannerMessage: ConversationMessage = {
						type: 'clarification',
						content: plannerResponse.content,
						data: plannerResponse.data ? this.toJson(plannerResponse.data) : undefined,
						timestamp: new Date()
					};

					session.messages.push(plannerMessage);
					await this.saveConversationMessage(session, 'planner', plannerMessage, userId);

					yield {
						type: 'message',
						content: plannerResponse.content,
						messageType: 'clarification',
						data: plannerResponse.data
					};
				}

				// Safety: Check max turns
				if (session.turnCount >= session.maxTurns) {
					session.status = 'failed';
					session.error = `Max turns (${session.maxTurns}) reached without completion`;
					session.completedAt = new Date();

					await this.updateConversationSession(
						session.id,
						session.status,
						undefined,
						session.error
					);

					yield {
						type: 'message',
						content: session.error,
						messageType: 'error'
					};

					break;
				}
			}

			// Yield final result as last message (generators don't pass return values to callers)
			yield {
				type: 'message',
				content: 'Conversation complete',
				messageType: 'task_complete',
				data: {
					success: session.status === 'completed',
					result: session.result,
					error: session.error,
					turnCount: session.turnCount,
					tokensUsed: totalTokens,
					durationMs: Date.now() - startTime
				}
			};
		} catch (error) {
			session.status = 'failed';
			session.error = error instanceof Error ? error.message : 'Unknown error';
			session.completedAt = new Date();

			await this.updateConversationSession(session.id, 'failed', undefined, session.error);

			throw error;
		}
	}

	// ============================================
	// EXECUTOR TURN
	// ============================================

	/**
	 * Execute one turn from the executor agent
	 * Executor processes current context and returns response
	 */
	private async getExecutorTurn(
		session: ConversationSession,
		userId: string
	): Promise<{
		messageType: ConversationMessageType;
		content: string;
		data?: Json;
		toolCalls?: ChatToolCall[];
		tokensUsed: number;
	}> {
		// Build conversation history for executor
		const messages = this.buildExecutorMessages(session);

		// Filter to READ-ONLY tools
		const readOnlyTools = getToolsForAgent(session.tools, 'read_only');
		const toolExecutor = new ChatToolExecutor(this.supabase, userId, undefined, this.fetchFn);
		toolExecutor.setSessionId(session.parentSessionId); // Use parent user chat session for logging

		// Save prompt for audit
		const systemPrompt = messages.find((m) => m.role === 'system')?.content || '';
		const conversationHistory = messages
			.filter((m) => m.role !== 'system')
			.map((m) => `${m.role}: ${m.content}`)
			.join('\n\n');
		await savePromptForAudit({
			systemPrompt,
			userPrompt: conversationHistory || 'Starting executor conversation',
			scenarioType: 'agent-conversation-executor-turn',
			metadata: {
				sessionId: session.id,
				executorAgentId: session.executorAgentId,
				turnCount: session.turnCount,
				taskDescription: session.task.description,
				availableTools: readOnlyTools.map((t) => t.function.name),
				userId
			}
		});

		let responseContent = '';
		let toolCalls: ChatToolCall[] = [];
		let tokensUsed = 0;
		let responseData: ExecutorResponseData | null = null;

		// Stream from executor LLM
		for await (const event of this.smartLLM.streamText({
			messages,
			tools: readOnlyTools,
			tool_choice: 'auto',
			userId,
			profile: 'speed', // Fast executor model
			temperature: 0.3,
			maxTokens: 1500,
			sessionId: session.parentSessionId
		})) {
			switch (event.type) {
				case 'text':
					responseContent += event.content || '';
					break;

				case 'tool_call':
					toolCalls.push(event.tool_call);

					// Execute tool with error handling
					try {
						const result = await toolExecutor.execute(event.tool_call!);

						// Add to messages for context
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

						if (!responseData) responseData = {};
						if (!responseData.toolResults) responseData.toolResults = [];
						responseData.toolResults.push({
							tool: event.tool_call!.function.name,
							result: result.result
						});
					} catch (toolError) {
						console.error('Tool execution failed:', toolError);

						// Add error to message history so LLM knows what happened
						const errorMessage =
							toolError instanceof Error ? toolError.message : 'Unknown error';
						messages.push({
							role: 'assistant',
							content: '',
							tool_calls: [event.tool_call!]
						});
						messages.push({
							role: 'tool',
							content: JSON.stringify({ error: errorMessage }),
							tool_call_id: event.tool_call!.id
						});

						if (!responseData) responseData = {};
						if (!responseData.toolResults) responseData.toolResults = [];
						responseData.toolResults.push({
							tool: event.tool_call!.function.name,
							error: errorMessage
						});
					}
					break;

				case 'done':
					tokensUsed = event.usage?.total_tokens || 0;
					break;

				case 'error':
					throw new Error(event.error);
			}
		}

		// Parse executor response to determine message type
		const { messageType, parsedData } = this.parseExecutorResponse(
			responseContent,
			responseData
		);

		return {
			messageType,
			content: responseContent,
			data: parsedData,
			toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
			tokensUsed
		};
	}

	/**
	 * Build message array for executor with full conversation context
	 */
	private buildExecutorMessages(session: ConversationSession): LLMMessage[] {
		const messages: LLMMessage[] = [];

		// System prompt
		messages.push({
			role: 'system',
			content: this.getExecutorSystemPrompt(session)
		});

		// Conversation history
		for (const msg of session.messages) {
			if (msg.type === 'task_assignment' || msg.type === 'clarification') {
				// From planner
				messages.push({
					role: 'user',
					content: msg.content
				});
			} else {
				// From executor (previous turns)
				messages.push({
					role: 'assistant',
					content: msg.content
				});
			}
		}

		return messages;
	}

	/**
	 * Parse executor response to determine message type and extract data
	 */
	private parseExecutorResponse(
		content: string,
		data: any
	): {
		messageType: ConversationMessageType;
		parsedData: any;
	} {
		const lowerContent = content.toLowerCase();

		// Check for explicit signals
		if (
			lowerContent.includes('task complete') ||
			lowerContent.includes('completed successfully')
		) {
			return {
				messageType: 'task_complete',
				parsedData: data || { completed: true }
			};
		}

		if (lowerContent.includes('question:') || lowerContent.includes('need clarification')) {
			return {
				messageType: 'question',
				parsedData: { question: content }
			};
		}

		if (lowerContent.includes('error') || lowerContent.includes('failed')) {
			return {
				messageType: 'error',
				parsedData: { error: content }
			};
		}

		if (lowerContent.includes('progress:') || lowerContent.includes('working on')) {
			return {
				messageType: 'progress_update',
				parsedData: data || { progress: content }
			};
		}

		// Default: partial result
		return {
			messageType: 'partial_result',
			parsedData: data || { result: content }
		};
	}

	// ============================================
	// PLANNER TURN
	// ============================================

	/**
	 * Get planner's response to executor's question
	 */
	private async getPlannerResponse(
		session: ConversationSession,
		executorQuestion: ConversationMessage,
		userId: string
	): Promise<{
		content: string;
		data?: any;
		tokensUsed: number;
	}> {
		// Build context for planner evaluation
		const systemPrompt = this.getPlannerEvaluationPrompt(session);
		const userPrompt = `Executor asks: ${executorQuestion.content}\n\nPlease provide a clear answer to help the executor complete the task.`;

		// Save prompt for audit
		await savePromptForAudit({
			systemPrompt,
			userPrompt,
			scenarioType: 'agent-conversation-planner-response',
			metadata: {
				sessionId: session.id,
				plannerAgentId: session.plannerAgentId,
				executorAgentId: session.executorAgentId,
				turnCount: session.turnCount,
				taskDescription: session.task.description,
				questionType: executorQuestion.type,
				userId
			}
		});

		const messages: LLMMessage[] = [
			{
				role: 'system',
				content: systemPrompt
			},
			{
				role: 'user',
				content: userPrompt
			}
		];

		let responseContent = '';
		let tokensUsed = 0;

		// Stream from planner LLM
		for await (const event of this.smartLLM.streamText({
			messages,
			userId,
			profile: 'balanced', // Smart planner model
			temperature: 0.7,
			maxTokens: 1000,
			sessionId: session.parentSessionId
		})) {
			switch (event.type) {
				case 'text':
					responseContent += event.content || '';
					break;

				case 'done':
					tokensUsed = event.usage?.total_tokens || 0;
					break;

				case 'error':
					throw new Error(event.error);
			}
		}

		return {
			content: responseContent,
			tokensUsed
		};
	}

	// ============================================
	// TERMINATION LOGIC
	// ============================================

	/**
	 * Determine if conversation should end
	 */
	private shouldEndConversation(
		session: ConversationSession,
		lastMessage: ConversationMessage
	): {
		end: boolean;
		success: boolean;
		reason: string;
	} {
		// Task completed successfully
		if (lastMessage.type === 'task_complete') {
			return {
				end: true,
				success: true,
				reason: 'Task completed successfully'
			};
		}

		// Error occurred
		if (lastMessage.type === 'error') {
			return {
				end: true,
				success: false,
				reason: `Task failed: ${lastMessage.content}`
			};
		}

		// Max turns reached
		if (session.turnCount >= session.maxTurns) {
			return {
				end: true,
				success: false,
				reason: `Max turns (${session.maxTurns}) reached`
			};
		}

		// Continue conversation
		return {
			end: false,
			success: false,
			reason: 'Conversation continues'
		};
	}

	// ============================================
	// SYSTEM PROMPTS
	// ============================================

	/**
	 * System prompt for executor in conversation mode
	 */
	private getExecutorSystemPrompt(session: ConversationSession): string {
		// Build context sections
		let locationContextSection = '';
		if (session.locationContext) {
			locationContextSection = `

## Current Context

${session.locationContext}

**Note:** This context is provided to help you complete your task efficiently.
Use it to avoid unnecessary tool calls. The planner has already loaded this information for you.`;
		}

		let previousResultsSection = '';
		if (session.previousResults) {
			previousResultsSection = `

## Results from Previous Steps

${session.previousResults}

**Note:** Previous executors have already gathered this information.
Use it to build on their work without repeating searches.`;
		}

		return `You are a Task Executor Agent in BuildOS, working with a Planner Agent to complete a task.

## Your Role

You execute ONE specific task using the tools available to you. You have READ-ONLY access.

## Current Task

${session.task.description}

**Goal:** ${session.task.goal}

${session.task.constraints ? `**Constraints:**\n${session.task.constraints.map((c) => `- ${c}`).join('\n')}` : ''}
${locationContextSection}
${previousResultsSection}

## Conversation Protocol

You are in an ITERATIVE conversation with the Planner Agent. You can:

1. **Ask Questions** - If you need clarification, ask the planner
   Format: "QUESTION: [your question]"

2. **Report Progress** - Keep planner informed of progress
   Format: "PROGRESS: [what you're working on]"

3. **Return Results** - When you have the answer
   Format: "TASK COMPLETE: [summary]\\n\\nResults: [structured data]"

4. **Report Errors** - If you encounter issues
   Format: "ERROR: [description]"

## Guidelines

- Use tools to gather information (but check the context first - you may already have what you need!)
- Be specific in questions (which project? which tasks?)
- When you have the answer, say "TASK COMPLETE"
- If blocked, explain what you need
- Don't make assumptions - ask for clarification

## Important

Current turn: ${session.turnCount}/${session.maxTurns}
Previous messages: ${session.messages.length}

Focus on completing the task efficiently. The planner is available to help.`;
	}

	/**
	 * System prompt for planner when evaluating executor questions
	 */
	private getPlannerEvaluationPrompt(session: ConversationSession): string {
		return `You are a Planning Agent in BuildOS, supervising an Executor Agent.

## Current Task Context

The executor is working on: ${session.task.description}

Goal: ${session.task.goal}

## Your Role

The executor has asked you a question. Your job:

1. **Understand** what the executor needs
2. **Provide** a clear, specific answer
3. **Help** the executor make progress

## Guidelines

- Be specific and actionable
- Reference the original user request if relevant
- If you don't know, say so and suggest alternatives
- Keep responses concise (1-2 sentences)

Conversation turn: ${session.turnCount}/${session.maxTurns}`;
	}

	// ============================================
	// HELPER METHODS
	// ============================================

	/**
	 * Format task assignment message
	 */
	private formatTaskAssignment(task: ExecutorTask): string {
		let message = `Please complete this task:\n\n`;
		message += `**Description:** ${task.description}\n`;
		message += `**Goal:** ${task.goal}\n`;

		if (task.constraints && task.constraints.length > 0) {
			message += `\n**Constraints:**\n`;
			task.constraints.forEach((constraint) => {
				message += `- ${constraint}\n`;
			});
		}

		if (task.contextData) {
			message += `\n**Context Data:**\n${JSON.stringify(task.contextData, null, 2)}\n`;
		}

		message += `\nUse the available tools. Ask questions if needed. Reply "TASK COMPLETE" when done.`;

		return message;
	}

	/**
	 * Save conversation message to database
	 */
	private async saveConversationMessage(
		session: ConversationSession,
		senderType: 'planner' | 'executor',
		message: ConversationMessage,
		userId: string
	): Promise<void> {
		const senderAgentId =
			senderType === 'planner' ? session.plannerAgentId : session.executorAgentId;

		const { error } = await this.supabase.from('agent_chat_messages').insert({
			agent_session_id: session.id,
			sender_type: senderType,
			sender_agent_id: senderAgentId,
			role: senderType === 'planner' ? 'user' : 'assistant',
			content: message.content,
			tool_calls: message.toolCalls ? this.toJson(message.toolCalls) : undefined,
			parent_user_session_id: session.parentSessionId,
			user_id: userId
		});

		if (error) {
			console.error('Failed to save conversation message:', error);
			// Don't throw - message persistence shouldn't block flow
		}
	}

	/**
	 * Update conversation session status
	 */
	private async updateConversationSession(
		sessionId: string,
		status: 'active' | 'completed' | 'failed',
		result?: Json,
		error?: string
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

		// Note: result and error aren't in the schema, but we can add them to initial_context
		// or create a new JSONB field in a future migration

		const { error: updateError } = await this.supabase
			.from('agent_chat_sessions')
			.update(updates)
			.eq('id', sessionId);

		if (updateError) {
			console.error('Failed to update conversation session:', updateError);
		}
	}

	private toJson(value: unknown): Json {
		return JSON.parse(JSON.stringify(value)) as Json;
	}
}
