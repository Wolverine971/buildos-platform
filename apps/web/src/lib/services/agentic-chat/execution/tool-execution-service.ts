// apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts
/**
 * Tool Execution Service
 *
 * Handles the execution of tools within the agentic chat system.
 * This service manages tool validation, execution, and result formatting,
 * providing a clean abstraction over the actual tool implementations.
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md} - Refactoring specification
 * @see {@link ../../tools/core/tool-executor.ts} - Actual tool implementations
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
import type {
	ServiceContext,
	ToolExecutionResult,
	BaseService,
	ToolExecutorFunction,
	StreamEvent
} from '../shared/types';
import { normalizeToolError } from '../shared/error-utils';
import type { ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
	timeout?: number;
	retryCount?: number;
	retryDelay?: number;
	virtualHandlers?: Record<string, VirtualToolHandler>;
}

/**
 * Tool validation result
 */
export interface ToolValidation {
	isValid: boolean;
	errors: string[];
}

export interface ToolExecutionTelemetry {
	toolName: string;
	durationMs: number;
	virtual: boolean;
}

export type ToolExecutionTelemetryHook = (
	result: ToolExecutionResult,
	telemetry: ToolExecutionTelemetry
) => void | Promise<void>;

export type VirtualToolHandler = (params: {
	toolCall: ChatToolCall;
	toolName: string;
	args: Record<string, any>;
	context: ServiceContext;
	availableTools: ChatToolDefinition[];
}) => Promise<ToolExecutionResult>;

/**
 * Service for executing tools
 */
export class ToolExecutionService implements BaseService {
	private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
	private static readonly DEFAULT_RETRY_COUNT = 0;
	private static readonly DEFAULT_RETRY_DELAY = 1000;
	private static readonly MAX_FORMATTED_LENGTH = 4000;

	constructor(
		private toolExecutor: ToolExecutorFunction,
		private telemetryHook?: ToolExecutionTelemetryHook
	) {}

	async initialize(): Promise<void> {}

	async cleanup(): Promise<void> {}

	/**
	 * Execute a single tool
	 */
	async executeTool(
		toolCall: ChatToolCall,
		context: ServiceContext,
		availableTools: ChatToolDefinition[],
		options: ToolExecutionOptions = {}
	): Promise<ToolExecutionResult> {
		const { name, rawArguments } = this.resolveToolCall(toolCall);
		const toolName = name ?? 'unknown';
		const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
		const virtualHandler =
			name && options.virtualHandlers ? options.virtualHandlers[name] : undefined;

		const finalizeResult = (
			result: ToolExecutionResult,
			overrideTelemetry?: Partial<ToolExecutionTelemetry>
		): ToolExecutionResult => {
			const durationMs =
				(typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
			if (this.telemetryHook) {
				try {
					const maybePromise = this.telemetryHook(result, {
						toolName,
						durationMs,
						virtual: Boolean(virtualHandler),
						...overrideTelemetry
					});
					Promise.resolve(maybePromise).catch((error) => {
						console.warn('[ToolExecutionService] Telemetry hook failed', {
							toolName,
							error: error instanceof Error ? error.message : String(error)
						});
					});
				} catch (error) {
					console.warn('[ToolExecutionService] Telemetry hook failed', {
						toolName,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
			return result;
		};

		console.log('[ToolExecutionService] Executing tool', {
			toolName,
			callId: toolCall.id,
			hasArgs: rawArguments !== undefined && rawArguments !== null
		});

		if (!toolName) {
			return finalizeResult({
				success: false,
				error: 'Tool call did not include a function name',
				toolName: 'unknown',
				toolCallId: toolCall.id
			});
		}

		let args: Record<string, any>;
		try {
			args = this.normalizeArguments(rawArguments, toolName);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return finalizeResult({
				success: false,
				error: message,
				toolName,
				toolCallId: toolCall.id
			});
		}

		if (virtualHandler) {
			try {
				const result = await virtualHandler({
					toolCall,
					toolName,
					args,
					context,
					availableTools
				});

				return finalizeResult({
					...result,
					toolName,
					toolCallId: toolCall.id
				});
			} catch (error) {
				console.error('[ToolExecutionService] Virtual tool execution failed', {
					toolName,
					error
				});
				return finalizeResult({
					success: false,
					error: error instanceof Error ? error.message : String(error),
					toolName,
					toolCallId: toolCall.id
				});
			}
		}

		// Validate the tool call
		const validation = this.validateToolCall(toolName, args, availableTools);
		if (!validation.isValid) {
			return finalizeResult({
				success: false,
				error: validation.errors.join('; '),
				toolName,
				toolCallId: toolCall.id
			});
		}

		try {
			// Execute with timeout if specified
			const timeout = options.timeout ?? ToolExecutionService.DEFAULT_TIMEOUT;
			const execution = await this.executeWithTimeout(
				() => this.toolExecutor(toolName, args, context),
				timeout
			);

			const streamEvents = execution?.streamEvents;
			const result = execution?.data;

			// Extract entities if present
			const entitiesAccessed = this.extractEntitiesFromResult(result);

			// Clean up internal properties
			const cleanedResult = this.cleanResult(result);

			return finalizeResult({
				success: true,
				data: cleanedResult,
				toolName,
				toolCallId: toolCall.id,
				entitiesAccessed: entitiesAccessed.length > 0 ? entitiesAccessed : undefined,
				streamEvents: Array.isArray(streamEvents)
					? (streamEvents as StreamEvent[])
					: undefined
			});
		} catch (error) {
			console.error('[ToolExecutionService] Tool execution failed', {
				toolName,
				error: error instanceof Error ? error.message : error
			});

			const normalizedError = this.normalizeExecutionError(error, toolName, args);

			return finalizeResult({
				success: false,
				error: normalizedError,
				toolName,
				toolCallId: toolCall.id
			});
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
			tools: toolCalls.map((call) => this.resolveToolCall(call).name || 'unknown')
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
	 * Overloaded to accept either ChatToolCall or toolName + args
	 */
	validateToolCall(
		toolCallOrName: ChatToolCall | string,
		availableToolsOrArgs?: ChatToolDefinition[] | undefined | Record<string, any>,
		availableTools?: ChatToolDefinition[] | undefined
	): ToolValidation {
		// Handle overloaded signatures
		let toolName: string;
		let args: Record<string, any>;
		let toolDefs: ChatToolDefinition[] | undefined;

		if (typeof toolCallOrName === 'string') {
			// Called as validateToolCall(toolName, args, availableTools)
			toolName = toolCallOrName;
			args = (availableToolsOrArgs as Record<string, any>) || {};
			toolDefs = availableTools;
		} else {
			// Called as validateToolCall(toolCall, availableTools)
			const toolCall = toolCallOrName as ChatToolCall;
			const { name, rawArguments } = this.resolveToolCall(toolCall);
			toolName = name;
			toolDefs = availableToolsOrArgs as ChatToolDefinition[] | undefined;
			try {
				args = this.normalizeArguments(rawArguments, toolName);
			} catch {
				args = {};
			}
		}

		const errors: string[] = [];

		// Check if tool exists
		const toolDef = this.getToolDefinition(toolName, toolDefs);
		if (!toolDef) {
			errors.push(`Unknown tool: ${toolName}`);
			return { isValid: false, errors };
		}

		// Get parameter schema - handle both formats
		const paramSchema = (toolDef as any).function?.parameters || (toolDef as any).parameters;
		if (paramSchema && typeof paramSchema === 'object') {
			const requiredParams = Array.isArray(paramSchema.required) ? paramSchema.required : [];

			for (const required of requiredParams) {
				if (
					!(required in args) ||
					args[required] === undefined ||
					args[required] === null
				) {
					errors.push(`Missing required parameter: ${required}`);
				}
			}

			const properties = paramSchema.properties ?? {};
			for (const [key, value] of Object.entries(args)) {
				const paramDef = properties[key];
				if (!paramDef || typeof paramDef !== 'object') continue;

				const expectedType = (paramDef as any).type;
				const actualType = Array.isArray(value) ? 'array' : typeof value;

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
				} else if (expectedType === 'array' && actualType !== 'array') {
					errors.push(
						`Invalid type for parameter ${key}: expected array, got ${actualType}`
					);
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
	 * Handles both { name, parameters } and { function: { name, parameters } } formats
	 */
	getToolDefinition(
		toolName: string,
		availableTools: ChatToolDefinition[] | undefined
	): ChatToolDefinition | undefined {
		if (!Array.isArray(availableTools) || availableTools.length === 0) {
			return undefined;
		}

		const match = availableTools.find((tool) => {
			const toolAny = tool as any;
			// Check both formats: direct name and function.name
			const directName = toolAny?.name;
			const functionName = toolAny?.function?.name;
			return directName === toolName || functionName === toolName;
		});

		if (!match) {
			return undefined;
		}

		// Normalize the tool definition to ensure it has both direct properties and function properties
		const normalized = match as any;

		// Copy from function object to root level if needed
		if (!normalized.name && normalized.function?.name) {
			normalized.name = normalized.function.name;
		}

		if (!normalized.description && normalized.function?.description) {
			normalized.description = normalized.function.description;
		}

		if (!normalized.parameters && normalized.function?.parameters) {
			normalized.parameters = normalized.function.parameters;
		}

		return match;
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
		delete cleaned._stream_events;

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
		const { name: toolName } = this.resolveToolCall(toolCall);

		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= retryCount; attempt++) {
			try {
				const result = await this.executeTool(toolCall, context, availableTools, options);

				// If successful or validation error, return immediately
				const errorStr =
					typeof result.error === 'string' ? result.error : String(result.error);
				if (result.success || errorStr?.includes('Missing required')) {
					return result;
				}

				// Store error for potential retry
				lastError = new Error(errorStr || 'Unknown error');

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
			toolName: toolName || 'unknown',
			toolCallId: toolCall.id
		};
	}

	/**
	 * Batch execute tools with concurrency control
	 * Returns results in the same order as the input toolCalls
	 */
	async batchExecuteTools(
		toolCalls: ChatToolCall[],
		context: ServiceContext,
		availableTools: ChatToolDefinition[],
		maxConcurrency = 3,
		options: ToolExecutionOptions = {}
	): Promise<ToolExecutionResult[]> {
		// Use Map for O(1) lookup and guaranteed order preservation
		const resultsMap = new Map<string, ToolExecutionResult>();
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
					resultsMap.set(result.toolCallId, result);
					return result;
				}
			);

			executing.add(promise);
		}

		// Wait for remaining executions
		await Promise.all(executing);

		// Return results in original order with proper error handling
		return toolCalls.map((call) => {
			const result = resultsMap.get(call.id);
			if (!result) {
				// This should never happen, but handle gracefully
				console.error('[ToolExecutionService] Missing result for tool call:', call.id);
				return {
					success: false,
					error: `No result found for tool call ${call.id}`,
					toolName: call.function?.name || 'unknown',
					toolCallId: call.id
				};
			}
			return result;
		});
	}

	/**
	 * Normalize tool call arguments to an object
	 */
	private normalizeArguments(args: unknown, toolName?: string): Record<string, any> {
		if (args === undefined || args === null) {
			return {};
		}

		if (typeof args === 'string') {
			try {
				return JSON.parse(args);
			} catch (error) {
				throw new ToolExecutionError(
					`Invalid JSON for tool arguments: ${error instanceof Error ? error.message : 'unknown error'}`,
					toolName ?? 'unknown',
					{ args }
				);
			}
		}

		if (typeof args === 'object') {
			return args as Record<string, any>;
		}

		return {};
	}

	private resolveToolCall(toolCall: ChatToolCall): { name: string; rawArguments: unknown } {
		const name = toolCall.function?.name ?? (toolCall as any)?.name ?? '';
		const rawArguments = toolCall.function?.arguments ?? (toolCall as any)?.arguments;
		return { name, rawArguments };
	}

	private normalizeExecutionError(
		error: unknown,
		toolName: string,
		_args: Record<string, any>
	): string {
		return normalizeToolError(error, toolName);
	}
}
