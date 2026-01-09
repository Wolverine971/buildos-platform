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
	StreamEvent,
	ToolExecutorResponse
} from '../shared/types';
import { normalizeToolError } from '../shared/error-utils';
import type { ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';
import { TOOL_METADATA } from '../tools/core/definitions';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { dev } from '$app/environment';
import { createLogger } from '$lib/utils/logger';
import { sanitizeLogData } from '$lib/utils/logging-helpers';

const logger = createLogger('ToolExecutionService');

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
	timeout?: number;
	retryCount?: number;
	retryDelay?: number;
	virtualHandlers?: Record<string, VirtualToolHandler>;
	abortSignal?: AbortSignal;
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
		private telemetryHook?: ToolExecutionTelemetryHook,
		private errorLogger?: ErrorLoggerService
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
		let parsedArgs: Record<string, any> | undefined;

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
						logger.warn('Telemetry hook failed', {
							toolName,
							error: error instanceof Error ? error.message : String(error)
						});
					});
				} catch (error) {
					logger.warn('Telemetry hook failed', {
						toolName,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
			if (!result.success) {
				this.logToolError(result, context, toolName, virtualHandler, parsedArgs);
			}
			return result;
		};

		if (dev) {
			logger.debug('Executing tool', {
				toolName,
				callId: toolCall.id,
				hasArgs: rawArguments !== undefined && rawArguments !== null
			});
		}

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
			parsedArgs = args;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return finalizeResult({
				success: false,
				error: message,
				toolName,
				toolCallId: toolCall.id
			});
		}

		if (options.abortSignal?.aborted) {
			return finalizeResult({
				success: false,
				error: 'Operation cancelled',
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
				logger.error('[ToolExecutionService] Virtual tool execution failed', {
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
			// Detect if this is a "tool not loaded" error for telemetry/fallback handling
			const isToolNotLoaded = validation.errors.some((err) =>
				err.startsWith('Unknown tool:')
			);
			return finalizeResult({
				success: false,
				error: validation.errors.join('; '),
				errorType: isToolNotLoaded ? 'tool_not_loaded' : 'validation_error',
				toolName,
				toolCallId: toolCall.id
			});
		}

		let abortListener: (() => void) | undefined;

		try {
			// Execute with timeout if specified or configured per tool
			const timeout = this.resolveTimeoutMs(toolName, options.timeout);
			const execPromise = this.executeWithTimeout(
				() => this.toolExecutor(toolName, args, context),
				timeout
			);

			let execution: Awaited<ReturnType<typeof this.executeWithTimeout>>;
			if (options.abortSignal) {
				execution = await Promise.race([
					execPromise,
					new Promise<never>((_, reject) => {
						const onAbort = () =>
							reject(new DOMException('Tool execution aborted', 'AbortError'));
						options.abortSignal?.addEventListener('abort', onAbort);
						abortListener = () =>
							options.abortSignal?.removeEventListener('abort', onAbort);
						if (options.abortSignal?.aborted) {
							onAbort();
						}
					})
				]);
			} else {
				execution = await execPromise;
			}

			const streamEvents = execution?.streamEvents;
			const result = execution?.data;
			const executionMetadata = execution?.metadata;
			const tokensUsed = this.extractTokensUsed(execution, executionMetadata);

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
					: undefined,
				tokensUsed,
				metadata: executionMetadata
			});
		} catch (error) {
			if (abortListener) {
				abortListener();
			}
			if (error instanceof DOMException && error.name === 'AbortError') {
				return finalizeResult({
					success: false,
					error: 'Operation cancelled',
					toolName,
					toolCallId: toolCall.id
				});
			}
			logger.error('[ToolExecutionService] Tool execution failed', {
				toolName,
				error: error instanceof Error ? error.message : error
			});

			const normalizedError = this.normalizeExecutionError(error, toolName, args);

			// Detect timeout errors
			const isTimeout =
				normalizedError.includes('timed out') ||
				(error instanceof Error && error.message.includes('timeout'));

			return finalizeResult({
				success: false,
				error: normalizedError,
				errorType: isTimeout ? 'timeout' : 'execution_error',
				toolName,
				toolCallId: toolCall.id
			});
		} finally {
			if (abortListener) {
				abortListener();
			}
		}
	}

	private logToolError(
		result: ToolExecutionResult,
		context: ServiceContext,
		toolName: string,
		virtualHandler?: VirtualToolHandler,
		args?: Record<string, any>
	): void {
		if (!this.errorLogger) {
			return;
		}
		const sanitizedArgs = args ? sanitizeLogData(args) : undefined;
		void this.errorLogger.logError(result.error ?? 'Tool execution failed', {
			userId: context.userId,
			projectId: context.contextScope?.projectId ?? context.entityId,
			operationType: 'tool_execution',
			metadata: {
				toolName,
				toolCallId: result.toolCallId,
				sessionId: context.sessionId,
				contextType: context.contextType,
				entityId: context.entityId,
				args: sanitizedArgs,
				errorType: result.errorType,
				virtual: Boolean(virtualHandler)
			}
		});
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
		if (dev) {
			logger.debug('Executing multiple tools', {
				count: toolCalls.length,
				tools: toolCalls.map((call) => this.resolveToolCall(call).name || 'unknown')
			});
		}

		const results: ToolExecutionResult[] = [];

		for (const toolCall of toolCalls) {
			if (options.abortSignal?.aborted) {
				results.push({
					success: false,
					error: 'Operation cancelled',
					toolName: this.resolveToolCall(toolCall).name ?? 'unknown',
					toolCallId: toolCall.id
				});
				break;
			}
			const result = await this.executeTool(toolCall, context, availableTools, options);
			results.push(result);
			if (options.abortSignal?.aborted) {
				break;
			}
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

	private resolveTimeoutMs(toolName: string, override?: number): number {
		if (typeof override === 'number' && Number.isFinite(override)) {
			return override;
		}
		const metadataTimeout = TOOL_METADATA[toolName]?.timeoutMs;
		if (typeof metadataTimeout === 'number' && Number.isFinite(metadataTimeout)) {
			return metadataTimeout;
		}
		return ToolExecutionService.DEFAULT_TIMEOUT;
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

	private extractTokensUsed(
		execution?: ToolExecutorResponse,
		metadata?: Record<string, any>
	): number | undefined {
		const candidates: Array<number | undefined> = [
			metadata?.tokensUsed,
			metadata?.tokens_used,
			metadata?.usage?.total_tokens,
			metadata?.usage?.totalTokens,
			(execution as any)?.tokensUsed,
			(execution as any)?.tokens_used,
			(execution as any)?.usage?.total_tokens,
			(execution as any)?.usage?.totalTokens,
			(execution as any)?.data?.usage?.total_tokens,
			(execution as any)?.data?.usage?.totalTokens
		];

		for (const value of candidates) {
			if (typeof value === 'number' && Number.isFinite(value)) {
				return value;
			}
		}

		return undefined;
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
				logger.error('[ToolExecutionService] Missing result for tool call', {
					toolCallId: call.id
				});
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
