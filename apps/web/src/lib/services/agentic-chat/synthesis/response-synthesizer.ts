// apps/web/src/lib/services/agentic-chat/synthesis/response-synthesizer.ts
/**
 * Response Synthesizer Service
 *
 * Synthesizes final responses from execution results for the agentic chat system.
 * This service takes raw execution results and transforms them into coherent,
 * user-friendly responses using LLM generation.
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md} - Refactoring specification
 * @see {@link ../../../agent-planner-service.ts} - Original implementation reference
 *
 * Key responsibilities:
 * - Generate natural language responses from tool results
 * - Synthesize complex multi-step execution summaries
 * - Format clarifying questions for user interaction
 * - Handle streaming response generation
 * - Provide error recovery and user-friendly error messages
 *
 * @module agentic-chat/synthesis
 */

import type {
	ServiceContext,
	ExecutionResult,
	ToolExecutionResult,
	AgentPlan,
	BaseService,
	StreamCallback,
	StreamEvent
} from '../shared/types';
import { ChatStrategy } from '$lib/types/agent-chat-enhancement';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';

export interface SynthesisUsage {
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
}

export interface SynthesisResult {
	text: string;
	usage?: SynthesisUsage;
}

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

	generateTextDetailed?(params: {
		systemPrompt: string;
		prompt: string;
		temperature?: number;
		maxTokens?: number;
		userId?: string;
		operationType?: string;
	}): Promise<{ text: string; usage?: SynthesisUsage }>;

	generateStream?(params: {
		systemPrompt: string;
		prompt: string;
		temperature?: number;
		maxTokens?: number;
		userId?: string;
		operationType?: string;
	}): Promise<AsyncGenerator<string, void, unknown>>;
}

interface LLMRequestConfig {
	systemPrompt: string;
	prompt: string;
	temperature: number;
	maxTokens: number;
	operationType: string;
}

/**
 * Service for synthesizing responses from execution results
 */
export class ResponseSynthesizer implements BaseService {
	constructor(private llmService: LLMService) {}

	/**
	 * Synthesize a simple response from tool results
	 */
	async synthesizeSimpleResponse(
		userMessage: string,
		toolResults: ToolExecutionResult[],
		context: ServiceContext
	): Promise<SynthesisResult> {
		console.log('[ResponseSynthesizer] Synthesizing simple response', {
			userMessage: userMessage.substring(0, 100),
			toolCount: toolResults.length,
			successCount: toolResults.filter((r) => r.success).length
		});

		const systemPrompt = this.buildSimpleSystemPrompt(context);
		const prompt = this.buildSimplePrompt(userMessage, toolResults);

		try {
			const result = await this.callLLMWithUsage(
				{
					systemPrompt,
					prompt,
					temperature: 0.7,
					maxTokens: 1000,
					operationType: 'simple_response_synthesis'
				},
				context
			);
			return {
				...result,
				text: this.applyFocusPrefix(result.text, context.projectFocus)
			};
		} catch (error) {
			console.error('[ResponseSynthesizer] Failed to generate simple response:', error);
			return {
				text: this.applyFocusPrefix(
					this.generateFallbackResponse(userMessage, toolResults),
					context.projectFocus
				)
			};
		}
	}

	/**
	 * Synthesize a complex response from plan execution
	 */
	async synthesizeComplexResponse(
		plan: AgentPlan,
		executorResults: ExecutionResult[],
		context: ServiceContext
	): Promise<SynthesisResult> {
		console.log('[ResponseSynthesizer] Synthesizing complex response', {
			planId: plan.id,
			strategy: plan.strategy,
			stepCount: plan.steps.length,
			completedSteps: plan.steps.filter((s) => s.status === 'completed').length,
			executorResultCount: executorResults.length
		});

		const systemPrompt = this.buildComplexSystemPrompt(context);
		const prompt = this.buildComplexPrompt(plan, executorResults);

		try {
			const result = await this.callLLMWithUsage(
				{
					systemPrompt,
					prompt,
					temperature: 0.7,
					maxTokens: 2000,
					operationType: 'complex_response_synthesis'
				},
				context
			);
			return {
				...result,
				text: this.applyFocusPrefix(result.text, context.projectFocus)
			};
		} catch (error) {
			console.error('[ResponseSynthesizer] Failed to generate complex response:', error);
			return {
				text: this.applyFocusPrefix(
					this.generateComplexFallbackResponse(plan, executorResults),
					context.projectFocus
				)
			};
		}
	}

	/**
	 * Format clarifying questions for the user
	 */
	async synthesizeClarifyingQuestions(
		questions: string[],
		context: ServiceContext
	): Promise<SynthesisResult> {
		console.log('[ResponseSynthesizer] Formatting clarifying questions', {
			questionCount: questions.length
		});

		if (questions.length === 0) {
			return {
				text: "I need more information to help you. Could you please provide more details about what you're looking for?"
			};
		}

		const prompt = this.buildClarifyingPrompt(questions);

		try {
			return await this.callLLMWithUsage(
				{
					systemPrompt:
						'You are a helpful assistant asking clarifying questions so you can complete the user request.',
					prompt,
					temperature: 0.4,
					maxTokens: 600,
					operationType: 'clarifying_questions'
				},
				context
			);
		} catch (error) {
			console.error('[ResponseSynthesizer] Failed to format clarifying questions:', error);
			let response = 'I need to clarify a few things to provide the best assistance:\n\n';

			questions.forEach((question, index) => {
				response += `${index + 1}. ${question}\n`;
			});

			response += '\nPlease provide answers to help me understand your request better.';

			return { text: response };
		}
	}

	/**
	 * Generate streaming response
	 */
	async *synthesizeStreamingResponse(
		userMessage: string,
		toolResults: ToolExecutionResult[],
		context: ServiceContext,
		callback: StreamCallback
	): AsyncGenerator<StreamEvent, void, unknown> {
		console.log('[ResponseSynthesizer] Starting streaming response synthesis');

		// Check if streaming is supported
		if (!this.llmService.generateStream) {
			// Fallback to non-streaming
			const response = await this.synthesizeSimpleResponse(userMessage, toolResults, context);

			yield { type: 'text', content: response.text };
			await callback({ type: 'text', content: response.text });
			yield {
				type: 'done',
				usage: this.mapUsageToStreamUsage(response.usage) ?? {
					total_tokens: response.text.length
				}
			};
			return;
		}

		const systemPrompt = this.buildSimpleSystemPrompt(context);
		const prompt = this.buildSimplePrompt(userMessage, toolResults);

		try {
			const stream = await this.llmService.generateStream({
				systemPrompt,
				prompt,
				temperature: 0.7,
				maxTokens: 1000,
				userId: context.userId,
				operationType: 'streaming_response_synthesis'
			});

			let totalContent = '';

			for await (const chunk of stream) {
				totalContent += chunk;
				const event: StreamEvent = { type: 'text', content: chunk };
				yield event;
				await callback(event);
			}

			yield {
				type: 'done',
				usage: { total_tokens: totalContent.length }
			};
		} catch (error) {
			console.error('[ResponseSynthesizer] Streaming error:', error);
			const errorEvent: StreamEvent = {
				type: 'error',
				error: error instanceof Error ? error.message : 'Streaming failed'
			};
			yield errorEvent;
			await callback(errorEvent);
		}
	}

	private mapUsageToStreamUsage(usage?: SynthesisUsage): { total_tokens: number } | undefined {
		if (!usage || typeof usage.totalTokens !== 'number') {
			return undefined;
		}

		return { total_tokens: usage.totalTokens };
	}

	private async callLLMWithUsage(
		config: LLMRequestConfig,
		context: ServiceContext
	): Promise<SynthesisResult> {
		if (typeof this.llmService.generateTextDetailed === 'function') {
			const result = await this.llmService.generateTextDetailed({
				systemPrompt: config.systemPrompt,
				prompt: config.prompt,
				temperature: config.temperature,
				maxTokens: config.maxTokens,
				userId: context.userId,
				operationType: config.operationType
			});

			return {
				text: result.text,
				usage: result.usage
			};
		}

		const text = await this.llmService.generateText({
			systemPrompt: config.systemPrompt,
			prompt: config.prompt,
			temperature: config.temperature,
			maxTokens: config.maxTokens,
			userId: context.userId,
			operationType: config.operationType
		});

		return { text };
	}

	/**
	 * Format plan progress for display
	 */
	formatPlanProgress(plan: AgentPlan): string {
		const totalSteps = plan.steps.length;
		const completedSteps = plan.steps.filter((s) => s.status === 'completed').length;
		const failedSteps = plan.steps.filter((s) => s.status === 'failed').length;
		const percentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

		let summary = `Plan Status: ${plan.status}\n`;
		summary += `Progress: ${completedSteps} of ${totalSteps} steps completed (${percentage}%)\n`;

		if (failedSteps > 0) {
			summary += `Failed Steps: ${failedSteps}\n`;
		}

		if (plan.status === 'executing') {
			const currentStep = plan.steps.find((s) => s.status === 'executing');
			if (currentStep) {
				summary += `Currently executing: ${currentStep.description}\n`;
			}
		}

		return summary;
	}

	/**
	 * Generate user-friendly error response
	 */
	async generateErrorResponse(
		error: Error | string,
		operation: string,
		context: ServiceContext
	): Promise<string> {
		console.log('[ResponseSynthesizer] Generating error response', {
			operation,
			error: error instanceof Error ? error.message : error
		});

		const errorMessage = error instanceof Error ? error.message : error;

		try {
			const response = await this.llmService.generateText({
				systemPrompt:
					'You are a helpful assistant explaining errors to users in a friendly way.',
				prompt: `The user tried to: ${operation}\n\nAn error occurred: ${errorMessage}\n\nGenerate a user-friendly explanation and suggest next steps.`,
				temperature: 0.7,
				maxTokens: 200,
				userId: context.userId,
				operationType: 'error_response'
			});

			return response;
		} catch (llmError) {
			// Fallback if LLM fails
			return `I encountered an error while ${operation}. Error details: ${errorMessage}. Please try again or contact support if the issue persists.`;
		}
	}

	/**
	 * Summarize executor results
	 */
	summarizeExecutorResults(results: ExecutionResult[]): string {
		if (results.length === 0) {
			return 'No executor results to summarize.';
		}

		const successful = results.filter((r) => r.success);
		const failed = results.filter((r) => !r.success);

		let summary = `Executor Results Summary:\n`;

		if (successful.length > 0) {
			summary += `- ${successful.length} successful executions\n`;
			successful.forEach((result) => {
				if (result.data) {
					const preview = JSON.stringify(result.data, null, 2).substring(0, 100);
					summary += `  • ${preview}${preview.length >= 100 ? '...' : ''}\n`;
				}
			});
		}

		if (failed.length > 0) {
			summary += `- ${failed.length} failed executions\n`;
			failed.forEach((result) => {
				if (result.error) {
					summary += `  • Error: ${result.error}\n`;
				}
			});
		}

		return summary;
	}

	// ============================================
	// PRIVATE HELPER METHODS
	// ============================================

	/**
	 * Build system prompt for simple response
	 */
	private buildSimpleSystemPrompt(context: ServiceContext): string {
		return `You are a helpful AI assistant working within BuildOS.
Context type: ${context.contextType}
${context.entityId ? `Entity: ${context.entityId}` : ''}

Your task is to synthesize tool execution results into a clear, concise response.
Be factual and helpful. Format the response in a user-friendly way.
If there were errors, explain them clearly and suggest next steps.`;
	}

	/**
	 * Build prompt for simple response
	 */
	private buildSimplePrompt(userMessage: string, toolResults: ToolExecutionResult[]): string {
		let prompt = `User request: "${userMessage}"\n\n`;

		if (toolResults.length > 0) {
			prompt += 'Tool execution results:\n';
			toolResults.forEach((result) => {
				prompt += `\nTool: ${result.toolName}\n`;
				prompt += `Success: ${result.success}\n`;
				if (result.success && result.data) {
					prompt += `Data: ${JSON.stringify(result.data, null, 2).substring(0, 1000)}\n`;
				} else if (result.error) {
					prompt += `Error: ${result.error}\n`;
				}
			});
		} else {
			prompt += 'No tools were executed.\n';
		}

		prompt += '\nGenerate a natural, helpful response based on these results.';

		return prompt;
	}

	/**
	 * Build system prompt for complex response
	 */
	private buildComplexSystemPrompt(context: ServiceContext): string {
		return `You are a helpful AI assistant working within BuildOS.
Context type: ${context.contextType}
${context.entityId ? `Entity: ${context.entityId}` : ''}

Your task is to synthesize a complex multi-step plan execution into a comprehensive response.
Explain what was accomplished, what failed (if anything), and provide insights.
Be clear about the overall outcome and any next steps needed.`;
	}

	/**
	 * Build prompt for complex response
	 */
	private buildComplexPrompt(plan: AgentPlan, executorResults: ExecutionResult[]): string {
		let prompt = `User request: "${plan.userMessage}"\n`;
		prompt += `Strategy used: ${plan.strategy}\n`;
		prompt += `Plan status: ${plan.status}\n\n`;

		prompt += 'Plan execution steps:\n';
		plan.steps.forEach((step) => {
			prompt += `\nStep ${step.stepNumber}: ${step.description}\n`;
			prompt += `Status: ${step.status}\n`;
			if (step.result) {
				prompt += `Result: ${JSON.stringify(step.result, null, 2).substring(0, 500)}\n`;
			}
			if (step.error) {
				prompt += `Error: ${step.error}\n`;
			}
		});

		if (executorResults.length > 0) {
			prompt += '\nExecutor results:\n';
			executorResults.forEach((result, index) => {
				prompt += `\nExecutor ${index + 1}:\n`;
				prompt += `Success: ${result.success}\n`;
				if (result.data) {
					prompt += `Data: ${JSON.stringify(result.data, null, 2).substring(0, 500)}\n`;
				}
				if (result.error) {
					prompt += `Error: ${result.error}\n`;
				}
			});
		}

		prompt += '\nSynthesize these results into a comprehensive, helpful response.';

		return prompt;
	}

	/**
	 * Build prompt for clarifying questions response
	 */
	private buildClarifyingPrompt(questions: string[]): string {
		const formatted = questions
			.map((question, index) => `${index + 1}. ${question}`)
			.join('\n');

		return `The assistant needs additional information before proceeding. Present the following clarifying questions in a friendly tone and encourage the user to respond to each one individually.

Clarifying questions:
${formatted}

Format the response as a short introduction followed by a numbered list of the questions.`;
	}

	/**
	 * Generate fallback response for simple synthesis
	 */
	private generateFallbackResponse(
		userMessage: string,
		toolResults: ToolExecutionResult[]
	): string {
		const successCount = toolResults.filter((r) => r.success).length;
		const failCount = toolResults.filter((r) => !r.success).length;

		let response = `Regarding your request: "${userMessage}"\n\n`;

		if (successCount > 0) {
			response += `I successfully executed ${successCount} operation${successCount > 1 ? 's' : ''}.\n`;
		}

		if (failCount > 0) {
			response += `However, ${failCount} operation${failCount > 1 ? 's' : ''} failed.\n`;
			const errors = toolResults
				.filter((r) => !r.success && r.error)
				.map((r) => `- ${r.toolName}: ${r.error}`)
				.join('\n');
			if (errors) {
				response += `\nErrors encountered:\n${errors}\n`;
			}
		}

		if (successCount === 0 && failCount === 0) {
			response += 'I processed your request but no specific operations were performed.';
		}

		return response;
	}

	/**
	 * Generate fallback response for complex synthesis
	 */
	private generateComplexFallbackResponse(
		plan: AgentPlan,
		executorResults: ExecutionResult[]
	): string {
		const progress = this.formatPlanProgress(plan);
		const executorSummary = this.summarizeExecutorResults(executorResults);

		let response = `Plan Execution Summary:\n\n`;
		response += progress + '\n';
		response += executorSummary + '\n';

		if (plan.status === 'completed') {
			response += '\nThe plan has been completed successfully.';
		} else if (plan.status === 'failed') {
			response += '\nThe plan encountered errors and could not be completed.';
		} else {
			response += '\nThe plan is still in progress.';
		}

		return response;
	}

	private applyFocusPrefix(text: string, focus?: ProjectFocus | null): string {
		if (!text || !focus || focus.focusType === 'project-wide') {
			return text;
		}
		const entityName = focus.focusEntityName ?? 'focused entity';
		return `**Focus: ${entityName} (${focus.focusType})**\n\n${text}`;
	}
}
