// apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts
/**
 * Tool Execution Service
 *
 * Handles the execution of tools within the agentic chat system.
 * This service manages tool validation, execution, and result formatting,
 * providing a clean abstraction over the actual tool implementations.
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md} - Refactoring specification
 * @see {@link ../../../tool-executor.ts} - Actual tool implementations
 *
 * Key responsibilities:
 * - Validate tool calls against available definitions
 * - Execute tools with proper error handling
 * - Format tool results for LLM consumption
 * - Extract entity references from tool outputs
 * - Manage timeouts and retries
 *
 * @module agentic-chat/execution
 */

import { ToolExecutionError } from '../shared/types';
import type { ServiceContext, ToolExecutionResult, BaseService } from '../shared/types';
import type { ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';

/**
 * Tool executor function type
 */
export type ToolExecutorFunction = (
	toolName: string,
	args: Record<string, any>,
	context: ServiceContext
) => Promise<any>;

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
	timeout?: number;
	retryCount?: number;
	retryDelay?: number;
}

/**
 * Tool validation result
 */
export interface ToolValidation {
	isValid: boolean;
	errors: string[];
}

/**
 * Service for executing tools
 */
export class ToolExecutionService implements BaseService {
	private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
	private static readonly DEFAULT_RETRY_COUNT = 0;
	private static readonly DEFAULT_RETRY_DELAY = 1000;
	private static readonly MAX_FORMATTED_LENGTH = 4000;

	constructor(private toolExecutor: ToolExecutorFunction) {}

	/**
	 * Execute a single tool
	 */
	async executeTool(
		toolCall: ChatToolCall,
		context: ServiceContext,
		availableTools: ChatToolDefinition[],
		options: ToolExecutionOptions = {}
	): Promise<ToolExecutionResult> {
		console.log('[ToolExecutionService] Executing tool', {
			toolName: toolCall.name,
			callId: toolCall.id,
			hasArgs: !!toolCall.arguments
		});

		// Validate the tool call
		const validation = this.validateToolCall(toolCall, availableTools);
		if (!validation.isValid) {
			return {
				success: false,
				error: validation.errors.join('; '),
				toolName: toolCall.name,
				toolCallId: toolCall.id
			};
		}

		// Normalize arguments
		const args = this.normalizeArguments(toolCall.arguments);

		try {
			// Execute with timeout if specified
			const timeout = options.timeout ?? ToolExecutionService.DEFAULT_TIMEOUT;
			const result = await this.executeWithTimeout(
				() => this.toolExecutor(toolCall.name, args, context),
				timeout
			);

			// Extract entities if present
			const entitiesAccessed = this.extractEntitiesFromResult(result);

			// Clean up internal properties
			const cleanedResult = this.cleanResult(result);

			return {
				success: true,
				data: cleanedResult,
				toolName: toolCall.name,
				toolCallId: toolCall.id,
				entitiesAccessed: entitiesAccessed.length > 0 ? entitiesAccessed : undefined
			};
		} catch (error) {
			console.error('[ToolExecutionService] Tool execution failed', {
				toolName: toolCall.name,
				error: error instanceof Error ? error.message : error
			});

			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				toolName: toolCall.name,
				toolCallId: toolCall.id
			};
		}
	}

	/**
	 * Execute multiple tools in sequence
	 */
	async executeMultipleTools(
		toolCalls: ChatToolCall[],
		context: ServiceContext,
		availableTools: ChatToolDefinition[],
		options: ToolExecutionOptions = {}
	): Promise<ToolExecutionResult[]> {
		console.log('[ToolExecutionService] Executing multiple tools', {
			count: toolCalls.length,
			tools: toolCalls.map((t) => t.name)
		});

		const results: ToolExecutionResult[] = [];

		for (const toolCall of toolCalls) {
			const result = await this.executeTool(toolCall, context, availableTools, options);
			results.push(result);
		}

		return results;
	}

	/**
	 * Validate a tool call
	 */
	validateToolCall(toolCall: ChatToolCall, availableTools: ChatToolDefinition[]): ToolValidation {
		const errors: string[] = [];

		// Check if tool exists
		const toolDef = this.getToolDefinition(toolCall.name, availableTools);
		if (!toolDef) {
			errors.push(`Unknown tool: ${toolCall.name}`);
			return { isValid: false, errors };
		}

		// Validate parameters if defined
		if (toolDef.parameters && typeof toolDef.parameters === 'object') {
			const params = toolDef.parameters as any;
			const args = this.normalizeArguments(toolCall.arguments);

			// Check required parameters
			if (params.required && Array.isArray(params.required)) {
				for (const required of params.required) {
					if (!(required in args)) {
						errors.push(`Missing required parameter: ${required}`);
					}
				}
			}

			// Check parameter types
			if (params.properties) {
				for (const [key, value] of Object.entries(args)) {
					const paramDef = params.properties[key];
					if (!paramDef) continue;

					const expectedType = (paramDef as any).type;
					const actualType = typeof value;

					// Basic type checking
					if (expectedType === 'string' && actualType !== 'string') {
						errors.push(
							`Invalid type for parameter ${key}: expected string, got ${actualType}`
						);
					} else if (expectedType === 'number' && actualType !== 'number') {
						errors.push(
							`Invalid type for parameter ${key}: expected number, got ${actualType}`
						);
					} else if (expectedType === 'boolean' && actualType !== 'boolean') {
						errors.push(
							`Invalid type for parameter ${key}: expected boolean, got ${actualType}`
						);
					}
				}
			}
		}

		return {
			isValid: errors.length === 0,
			errors
		};
	}

	/**
	 * Get tool definition by name
	 */
	getToolDefinition(
		toolName: string,
		availableTools: ChatToolDefinition[]
	): ChatToolDefinition | undefined {
		return availableTools.find((t) => t.name === toolName);
	}

	/**
	 * Format tool result for display/LLM consumption
	 */
	formatToolResult(result: ToolExecutionResult): string {
		if (!result.success) {
			return `Error executing ${result.toolName}: ${result.error}`;
		}

		// Format the data
		let formatted = `Tool: ${result.toolName}\n`;

		if (result.data) {
			const dataStr = JSON.stringify(result.data, null, 2);

			// Truncate if too large
			if (dataStr.length > ToolExecutionService.MAX_FORMATTED_LENGTH) {
				const truncated = dataStr.substring(0, ToolExecutionService.MAX_FORMATTED_LENGTH);
				formatted += `Result (truncated):\n${truncated}\n...`;
			} else {
				formatted += `Result:\n${dataStr}`;
			}
		} else {
			formatted += 'Result: Success (no data)';
		}

		if (result.entitiesAccessed && result.entitiesAccessed.length > 0) {
			formatted += `\nEntities accessed: ${result.entitiesAccessed.join(', ')}`;
		}

		return formatted;
	}

	/**
	 * Extract entity IDs from tool results
	 */
	extractEntitiesFromResult(result: any): string[] {
		const entities = new Set<string>();

		// Recursively find all ID fields
		const findIds = (obj: any, depth = 0): void => {
			if (depth > 10 || !obj) return; // Prevent infinite recursion

			if (Array.isArray(obj)) {
				obj.forEach((item) => findIds(item, depth + 1));
			} else if (typeof obj === 'object') {
				// Check for ID fields
				if ('id' in obj && typeof obj.id === 'string') {
					entities.add(obj.id);
				}

				// Check for specific ID patterns
				const idKeys = Object.keys(obj).filter(
					(key) => key.endsWith('_id') || key.endsWith('Id')
				);

				for (const key of idKeys) {
					if (typeof obj[key] === 'string') {
						entities.add(obj[key]);
					}
				}

				// Check for special _entities_accessed field
				if ('_entities_accessed' in obj && Array.isArray(obj._entities_accessed)) {
					obj._entities_accessed.forEach((id: any) => {
						if (typeof id === 'string') {
							entities.add(id);
						}
					});
				}

				// Recurse into nested objects
				for (const value of Object.values(obj)) {
					if (value && typeof value === 'object') {
						findIds(value, depth + 1);
					}
				}
			}
		};

		findIds(result);
		return Array.from(entities);
	}

	/**
	 * Execute with timeout
	 */
	private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
		return Promise.race([
			fn(),
			new Promise<T>((_, reject) =>
				setTimeout(
					() => reject(new Error(`Tool execution timeout after ${timeout}ms`)),
					timeout
				)
			)
		]);
	}

	/**
	 * Clean internal properties from result
	 */
	private cleanResult(result: any): any {
		if (!result || typeof result !== 'object') {
			return result;
		}

		// Remove internal properties
		const cleaned = { ...result };
		delete cleaned._entities_accessed;
		delete cleaned._metadata;
		delete cleaned._internal;

		return cleaned;
	}

	/**
	 * Execute tool with retry logic
	 */
	async executeWithRetry(
		toolCall: ChatToolCall,
		context: ServiceContext,
		availableTools: ChatToolDefinition[],
		options: ToolExecutionOptions = {}
	): Promise<ToolExecutionResult> {
		const retryCount = options.retryCount ?? ToolExecutionService.DEFAULT_RETRY_COUNT;
		const retryDelay = options.retryDelay ?? ToolExecutionService.DEFAULT_RETRY_DELAY;

		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= retryCount; attempt++) {
			try {
				const result = await this.executeTool(toolCall, context, availableTools, options);

				// If successful or validation error, return immediately
				if (result.success || result.error?.includes('Missing required')) {
					return result;
				}

				// Store error for potential retry
				lastError = new Error(result.error || 'Unknown error');

				// Wait before retry
				if (attempt < retryCount) {
					await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
				}
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				// Wait before retry
				if (attempt < retryCount) {
					await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
				}
			}
		}

		// All retries failed
		return {
			success: false,
			error: `Failed after ${retryCount + 1} attempts: ${lastError?.message || 'Unknown error'}`,
			toolName: toolCall.name,
			toolCallId: toolCall.id
		};
	}

	/**
	 * Batch execute tools with concurrency control
	 */
	async batchExecuteTools(
		toolCalls: ChatToolCall[],
		context: ServiceContext,
		availableTools: ChatToolDefinition[],
		maxConcurrency = 3,
		options: ToolExecutionOptions = {}
	): Promise<ToolExecutionResult[]> {
		const results: ToolExecutionResult[] = [];
		const executing = new Set<Promise<ToolExecutionResult>>();

		for (const toolCall of toolCalls) {
			// Wait if we're at max concurrency
			if (executing.size >= maxConcurrency) {
				await Promise.race(executing);
			}

			// Start execution
			const promise = this.executeTool(toolCall, context, availableTools, options).then(
				(result) => {
					executing.delete(promise);
					results.push(result);
					return result;
				}
			);

			executing.add(promise);
		}

		// Wait for remaining executions
		await Promise.all(executing);

		// Return results in original order
		return toolCalls.map((call) => results.find((r) => r.toolCallId === call.id)!);
	}

	/**
	 * Normalize tool call arguments to an object
	 */
	private normalizeArguments(args: ChatToolCall['arguments']): Record<string, any> {
		if (!args) {
			return {};
		}

		if (typeof args === 'string') {
			try {
				return JSON.parse(args);
			} catch (error) {
				throw new ToolExecutionError(
					`Invalid JSON for tool arguments: ${
						error instanceof Error ? error.message : 'unknown error'
					}`,
					'unknown',
					{ args }
				);
			}
		}

		return args;
	}
}
