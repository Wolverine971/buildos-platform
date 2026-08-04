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
import { extractAffectedEntitiesFromToolExecution } from '../tools/core/affected-entities';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { dev } from '$app/environment';
import { createLogger } from '$lib/utils/logger';
import { sanitizeLogData } from '$lib/utils/logging-helpers';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	decodeToolArguments,
	resolveToolCall,
	type ArgumentDecodeDiagnostic
} from './tool-execution/call-decoder';
import {
	resolveProjectIdFromContext,
	runArgumentPipeline
} from './tool-execution/argument-pipeline';
import {
	applyDecodedToolAdapter,
	hasDocumentPayload
} from './tool-execution/tool-argument-adapters';
import type { ToolArguments } from './tool-execution/argument-values';
import {
	getToolDefinition as resolveToolDefinition,
	getValidationToolDefinitions,
	validateToolArguments,
	type ToolValidation
} from './tool-execution/schema-validator';
import { executeGatewayTool, isGatewayToolName } from './tool-execution/gateway-executor';
import {
	contextWithAbortSignal,
	resolveToolTimeoutMs,
	runToolExecutionLane,
	waitForRetryDelay
} from './tool-execution/execution-runner';
import {
	extractOntologyScopeEvidence,
	type ProjectScopedOntologyKind
} from './tool-execution/ontology-scope-evidence';
import {
	guardEntityIdsMatchContextScope,
	guardProjectIdMatchesContextScope,
	normalizeProjectScopedEntityKind
} from './tool-execution/scope-guards';
import { SameTurnDocumentRegistry } from './tool-execution/same-turn-document-registry';
import {
	runPostAuthorizationPreflight,
	stripServerOwnedWorkspaceProps
} from './tool-execution/tool-policies';

const logger = createLogger('ToolExecutionService');

function logArgumentDecodeDiagnostics(
	toolName: string | undefined,
	diagnostics: ArgumentDecodeDiagnostic[]
): void {
	for (const diagnostic of diagnostics) {
		if (diagnostic.type === 'string_argument_fallback') {
			logger.warn('Tool arguments fallback applied', {
				toolName: toolName ?? 'unknown',
				reason: diagnostic.reason,
				rawLength: diagnostic.value.length,
				rawPreview: diagnostic.value.slice(0, 160)
			});
			continue;
		}
		if (!dev) continue;
		if (diagnostic.type === 'parse_depth_exceeded') {
			logger.debug('Tool arguments exceeded parse depth; using empty object', { toolName });
		} else if (diagnostic.type === 'control_characters_sanitized') {
			logger.debug('Tool arguments reparsed after sanitizing control characters', {
				toolName
			});
		} else if (diagnostic.type === 'nested_json_reparsed') {
			logger.debug('Tool arguments were nested JSON string; reparsed', { toolName });
		} else {
			logger.debug('Tool arguments parsed to string; using empty object', {
				toolName,
				rawPreview: diagnostic.rawPreview
			});
		}
	}
}

type ProjectScopedEntityKind = ProjectScopedOntologyKind;

function isToolCancellationResult(result: ToolExecutionResult): boolean {
	if (result.errorType === 'cancelled') return true;
	const message = typeof result.error === 'string' ? result.error.trim().toLowerCase() : '';
	return message === 'operation cancelled' || message === 'operation canceled';
}

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

export type { ToolValidation } from './tool-execution/schema-validator';

export interface ToolExecutionTelemetry {
	toolName: string;
	durationMs: number;
	virtual: boolean;
}

interface ToolErrorLogDetails {
	virtual: boolean;
	args?: Record<string, any>;
	durationMs?: number;
	timeoutMs?: number;
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
	// Ontology context is a turn-start snapshot. Keep successful creates and
	// trusted read evidence in request-local state so later writes in the same
	// turn can prove ownership. A null value is a tombstone for deleted entities
	// or conflicting evidence and intentionally blocks fallback to stale context.
	// The service is instantiated once per stream request, so this cannot leak
	// across turns or users.
	private readonly sameTurnEntityProjectIds = new Map<string, string | null>();
	// Document titles additionally support same-turn duplicate protection.
	private readonly sameTurnCreatedDocuments = new SameTurnDocumentRegistry();
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
		const { name, rawArguments } = resolveToolCall(toolCall);
		const toolName = name ?? 'unknown';
		const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
		const virtualHandler =
			name && options.virtualHandlers ? options.virtualHandlers[name] : undefined;
		let parsedArgs: Record<string, any> | undefined;
		let resolvedTimeoutMs: number | undefined;

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
			if (!result.success && !isToolCancellationResult(result)) {
				this.logToolError(result, context, toolName, {
					virtual: Boolean(virtualHandler),
					args: parsedArgs,
					durationMs,
					timeoutMs: resolvedTimeoutMs
				});
			}
			return result;
		};

		if (dev) {
			logger.debug('Executing tool', {
				toolName,
				callId: toolCall.id,
				hasArgs: rawArguments !== undefined && rawArguments !== null,
				rawArgsType: Array.isArray(rawArguments)
					? 'array'
					: rawArguments === null
						? 'null'
						: typeof rawArguments
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

		const decodedArguments = decodeToolArguments(rawArguments, toolName);
		logArgumentDecodeDiagnostics(toolName, decodedArguments.diagnostics);
		if (!decodedArguments.ok) {
			return finalizeResult({
				success: false,
				error: decodedArguments.error.message,
				toolName,
				toolCallId: toolCall.id
			});
		}
		let args: ToolArguments = applyDecodedToolAdapter(toolName, decodedArguments.args);
		parsedArgs = args;
		const validationTools = getValidationToolDefinitions(toolName, availableTools);

		if (toolName === 'create_onto_document') {
			if (typeof rawArguments === 'string') {
				const trimmed = rawArguments.trim();
				if (!trimmed) {
					return finalizeResult({
						success: false,
						error: 'Tool arguments were empty string',
						errorType: 'validation_error',
						toolName,
						toolCallId: toolCall.id
					});
				}
				if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
					// ok to proceed; the call decoder has already parsed or reparsed it
				} else {
					return finalizeResult({
						success: false,
						error: 'Tool arguments were an unexpected string format',
						errorType: 'validation_error',
						toolName,
						toolCallId: toolCall.id
					});
				}
			} else if (rawArguments !== undefined && rawArguments !== null) {
				if (typeof rawArguments !== 'object' || Array.isArray(rawArguments)) {
					return finalizeResult({
						success: false,
						error: 'Tool arguments must be an object or JSON string',
						errorType: 'validation_error',
						toolName,
						toolCallId: toolCall.id
					});
				}
			}
		}

		if (toolName === 'create_onto_document') {
			if (!hasDocumentPayload(args)) {
				return finalizeResult({
					success: false,
					error: 'create_onto_document requires at least a title or content payload (missing)',
					errorType: 'validation_error',
					toolName,
					toolCallId: toolCall.id
				});
			}
		}

		if (dev && toolName === 'create_onto_document') {
			logger.debug('create_onto_document raw arguments', {
				callId: toolCall.id,
				rawArguments
			});
		}

		const argumentPipeline = runArgumentPipeline({
			toolName,
			args,
			context,
			toolDefinition: resolveToolDefinition(toolName, validationTools)
		});
		args = argumentPipeline.args;
		if (dev && argumentPipeline.aliasDiagnostics) {
			logger.debug('Applied argument aliases for tool', {
				toolName,
				...argumentPipeline.aliasDiagnostics
			});
		}
		args = stripServerOwnedWorkspaceProps(toolName, args);
		const projectScopeGuard = guardProjectIdMatchesContextScope({
			toolName,
			args,
			context,
			availableTools: validationTools,
			toolCallId: toolCall.id
		});
		if (projectScopeGuard) {
			return finalizeResult(projectScopeGuard);
		}
		const entityScopeGuard = guardEntityIdsMatchContextScope({
			toolName,
			args,
			context,
			toolCallId: toolCall.id,
			sameTurnEntityProjectIds: this.sameTurnEntityProjectIds
		});
		if (entityScopeGuard) {
			return finalizeResult(entityScopeGuard);
		}
		const preflight = runPostAuthorizationPreflight({
			toolName,
			args,
			context,
			toolCallId: toolCall.id,
			sameTurnDocuments: this.sameTurnCreatedDocuments
		});
		if (!preflight.ok) {
			return finalizeResult(preflight.result);
		}
		args = preflight.args;

		if (dev && toolName === 'create_onto_document') {
			const normalizedContent =
				typeof args.content === 'string'
					? args.content
					: typeof args.body_markdown === 'string'
						? args.body_markdown
						: undefined;
			const contentLength =
				typeof normalizedContent === 'string' ? normalizedContent.length : 0;
			logger.debug('create_onto_document normalized args', {
				callId: toolCall.id,
				title: typeof args.title === 'string' ? args.title : undefined,
				type_key: typeof args.type_key === 'string' ? args.type_key : undefined,
				hasContent: typeof normalizedContent === 'string' && normalizedContent.length > 0,
				contentLength,
				hasNestedDocument: typeof args.document === 'object' && args.document !== null
			});
		}

		if (options.abortSignal?.aborted) {
			return finalizeResult({
				success: false,
				error: 'Operation cancelled',
				errorType: 'cancelled',
				toolName,
				toolCallId: toolCall.id
			});
		}

		if (isGatewayToolName(toolName)) {
			const validation = this.validateToolCall(toolName, args, validationTools);
			if (!validation.isValid) {
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

			const timeout = resolveToolTimeoutMs(toolName, options.timeout);
			resolvedTimeoutMs = timeout;
			const gatewayExecution = await runToolExecutionLane({
				lane: 'gateway',
				toolName,
				toolCallId: toolCall.id,
				timeoutMs: timeout,
				abortSignal: options.abortSignal,
				run: () => this.executeGatewayTool(toolName, args),
				normalizeError: (error) => this.normalizeExecutionError(error, toolName, args)
			});
			if (!gatewayExecution.ok) return finalizeResult(gatewayExecution.result);
			return finalizeResult({
				...gatewayExecution.value,
				toolName,
				toolCallId: toolCall.id
			});
		}

		if (virtualHandler) {
			const timeout = resolveToolTimeoutMs(toolName, options.timeout);
			resolvedTimeoutMs = timeout;
			const virtualExecution = await runToolExecutionLane<ToolExecutionResult>({
				lane: 'virtual',
				toolName,
				toolCallId: toolCall.id,
				timeoutMs: timeout,
				abortSignal: options.abortSignal,
				timeoutClassification: 'runner_only',
				run: (abortSignal) =>
					virtualHandler({
						toolCall,
						toolName,
						args,
						context: contextWithAbortSignal(context, abortSignal),
						availableTools
					}),
				normalizeError: (error) => (error instanceof Error ? error.message : String(error))
			});
			if (!virtualExecution.ok) {
				logger.error('[ToolExecutionService] Virtual tool execution failed', {
					toolName,
					error: virtualExecution.error
				});
				return finalizeResult(virtualExecution.result);
			}
			return finalizeResult({
				...virtualExecution.value,
				toolName,
				toolCallId: toolCall.id
			});
		}

		// Validate the tool call
		const validation = this.validateToolCall(toolName, args, validationTools);
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

		// Execute with timeout if specified or configured per tool
		const timeout = resolveToolTimeoutMs(toolName, options.timeout);
		resolvedTimeoutMs = timeout;
		const coreExecution = await runToolExecutionLane<ToolExecutorResponse>({
			lane: 'core',
			toolName,
			toolCallId: toolCall.id,
			timeoutMs: timeout,
			abortSignal: options.abortSignal,
			run: (abortSignal) =>
				this.toolExecutor(toolName, args, contextWithAbortSignal(context, abortSignal)),
			normalizeError: (error) => this.normalizeExecutionError(error, toolName, args)
		});
		if (!coreExecution.ok) {
			if (coreExecution.result.errorType !== 'cancelled') {
				logger.error('[ToolExecutionService] Tool execution failed', {
					toolName,
					error:
						coreExecution.error instanceof Error
							? coreExecution.error.message
							: coreExecution.error
				});
			}
			return finalizeResult(coreExecution.result);
		}

		const execution = coreExecution.value;
		const streamEvents = execution?.streamEvents;
		const result = execution?.data;
		const executionMetadata = execution?.metadata;
		const tokensUsed = this.extractTokensUsed(execution, executionMetadata);

		// Extract entities if present
		const entitiesAccessed = this.extractEntitiesFromResult(result);

		// Clean up internal properties
		const cleanedResult = this.cleanResult(result);
		this.registerSameTurnLoadedOntologyEntities(toolName, args, cleanedResult);
		this.registerSameTurnCreatedOntologyEntities(toolName, args, cleanedResult, context);
		this.applySameTurnOntologyOwnershipMutation(toolName, args, cleanedResult);

		if (toolName === 'create_onto_document') {
			this.sameTurnCreatedDocuments.rememberCreatedDocument(args, {
				data: cleanedResult
			});
		}

		return finalizeResult({
			success: true,
			data: cleanedResult,
			toolName,
			toolCallId: toolCall.id,
			entitiesAccessed: entitiesAccessed.length > 0 ? entitiesAccessed : undefined,
			streamEvents: Array.isArray(streamEvents) ? (streamEvents as StreamEvent[]) : undefined,
			tokensUsed,
			metadata: executionMetadata
		});
	}

	private logToolError(
		result: ToolExecutionResult,
		context: ServiceContext,
		toolName: string,
		details: ToolErrorLogDetails
	): void {
		if (!this.errorLogger) {
			return;
		}
		const sanitizedArgs = details.args ? sanitizeLogData(details.args) : undefined;
		const argsSummary = this.buildArgsSummary(details.args, toolName);
		const operationPayload =
			sanitizedArgs && typeof sanitizedArgs === 'object'
				? (sanitizedArgs as Record<string, any>)
				: undefined;
		const toolMetadata = TOOL_METADATA[toolName];
		void this.errorLogger.logError(result.error ?? 'Tool execution failed', {
			userId: context.userId,
			projectId: context.contextScope?.projectId ?? context.entityId,
			operationType: 'tool_execution',
			operationPayload,
			metadata: {
				toolName,
				toolCategory: toolMetadata?.category,
				toolCallId: result.toolCallId,
				sessionId: context.sessionId,
				contextType: context.contextType,
				entityId: context.entityId,
				args: sanitizedArgs,
				argsSummary,
				errorType: result.errorType,
				virtual: details.virtual,
				timeoutMs: details.timeoutMs,
				durationMs: details.durationMs
			}
		});
	}

	private buildArgsSummary(args: unknown, toolName: string): Record<string, unknown> | undefined {
		if (!args || typeof args !== 'object' || Array.isArray(args)) {
			return undefined;
		}

		const argKeys = Object.keys(args as Record<string, unknown>);
		const summary: Record<string, unknown> = {
			argCount: argKeys.length,
			argKeys: argKeys.slice(0, 12)
		};

		if (argKeys.length > 12) {
			summary.argKeysTruncated = argKeys.length - 12;
		}

		if (toolName === 'create_onto_project') {
			const payload = args as Record<string, unknown>;
			summary.hasProject = 'project' in payload;
			summary.hasEntities = Array.isArray(payload.entities);
			summary.hasRelationships = Array.isArray(payload.relationships);
			summary.hasClarifications = Array.isArray(payload.clarifications);
		}

		return summary;
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
				tools: toolCalls.map((call) => resolveToolCall(call).name || 'unknown')
			});
		}

		const results: ToolExecutionResult[] = [];

		for (const toolCall of toolCalls) {
			if (options.abortSignal?.aborted) {
				results.push({
					success: false,
					error: 'Operation cancelled',
					errorType: 'cancelled',
					toolName: resolveToolCall(toolCall).name ?? 'unknown',
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

	private executeGatewayTool(
		toolName: string,
		args: ToolArguments
	): Promise<ToolExecutionResult> {
		return executeGatewayTool(toolName, args);
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
		let toolName: string;
		let args: ToolArguments;
		let toolDefinitions: ChatToolDefinition[] | undefined;

		if (typeof toolCallOrName === 'string') {
			toolName = toolCallOrName.trim();
			args = (availableToolsOrArgs as ToolArguments) || {};
			toolDefinitions = availableTools;
		} else {
			const { name, rawArguments } = resolveToolCall(toolCallOrName);
			toolName = name;
			toolDefinitions = availableToolsOrArgs as ChatToolDefinition[] | undefined;
			const decodedArguments = decodeToolArguments(rawArguments, toolName);
			logArgumentDecodeDiagnostics(toolName, decodedArguments.diagnostics);
			args = decodedArguments.ok ? decodedArguments.args : {};
		}

		return validateToolArguments(
			toolName,
			applyDecodedToolAdapter(toolName, args),
			toolDefinitions
		);
	}

	getToolDefinition(
		toolName: string,
		availableTools: ChatToolDefinition[] | undefined
	): ChatToolDefinition | undefined {
		return resolveToolDefinition(toolName, availableTools);
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
			(execution as any)?.tokens_consumed,
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
		const { name: toolName } = resolveToolCall(toolCall);
		const cancelledResult = (): ToolExecutionResult => ({
			success: false,
			error: 'Operation cancelled',
			errorType: 'cancelled',
			toolName: toolName || 'unknown',
			toolCallId: toolCall.id
		});
		const isAbortError = (error: unknown): boolean =>
			error instanceof DOMException && error.name === 'AbortError';
		const waitBeforeNextAttempt = async (
			attempt: number
		): Promise<ToolExecutionResult | null> => {
			if (attempt >= retryCount) {
				return null;
			}
			try {
				await waitForRetryDelay(retryDelay * (attempt + 1), options.abortSignal);
				return null;
			} catch (error) {
				if (isAbortError(error)) {
					return cancelledResult();
				}
				throw error;
			}
		};

		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= retryCount; attempt++) {
			if (options.abortSignal?.aborted) {
				return cancelledResult();
			}
			try {
				const result = await this.executeTool(toolCall, context, availableTools, options);

				// If successful or validation error, return immediately
				const errorStr =
					typeof result.error === 'string' ? result.error : String(result.error);
				if (
					result.success ||
					isToolCancellationResult(result) ||
					errorStr?.includes('Missing required')
				) {
					return result;
				}

				// Store error for potential retry
				lastError = new Error(errorStr || 'Unknown error');

				// Wait before retry
				const cancelled = await waitBeforeNextAttempt(attempt);
				if (cancelled) {
					return cancelled;
				}
			} catch (error) {
				if (isAbortError(error)) {
					return cancelledResult();
				}
				lastError = error instanceof Error ? error : new Error(String(error));

				// Wait before retry
				const cancelled = await waitBeforeNextAttempt(attempt);
				if (cancelled) {
					return cancelled;
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

	private normalizeExecutionError(
		error: unknown,
		toolName: string,
		_args: Record<string, any>
	): string {
		return normalizeToolError(error, toolName);
	}

	private registerSameTurnCreatedOntologyEntities(
		toolName: string,
		args: Record<string, any>,
		result: unknown,
		context: ServiceContext
	): void {
		const createdEntities = extractAffectedEntitiesFromToolExecution({
			tool_name: toolName,
			arguments: args,
			result,
			success: true
		});

		const readUuid = (value: unknown): string | undefined => {
			if (typeof value !== 'string') return undefined;
			const trimmed = value.trim();
			return isValidUUID(trimmed) ? trimmed : undefined;
		};
		const argsProjectId = readUuid(args.project_id);
		const contextProjectId = readUuid(resolveProjectIdFromContext(context));

		for (const entity of createdEntities) {
			if (entity.operation !== 'created') continue;
			const kind = normalizeProjectScopedEntityKind(entity.kind);
			const entityId = readUuid(entity.id);
			if (!kind || !entityId) continue;

			let projectId: string | undefined;
			if (kind === 'project') {
				projectId = entityId;
			} else {
				const resultProjectId = readUuid(entity.projectId);
				const projectIds = new Set(
					[resultProjectId, argsProjectId, contextProjectId].filter(
						(value): value is string => Boolean(value)
					)
				);
				if (projectIds.size > 1) {
					logger.warn('Skipped inconsistent same-turn ontology entity registration', {
						toolName,
						kind,
						entityId,
						resultProjectId,
						argsProjectId,
						contextProjectId
					});
					continue;
				}
				projectId = projectIds.values().next().value;
			}

			if (!projectId) continue;
			this.rememberSameTurnEntityProjectId(kind, entityId, projectId, toolName);
		}

		if (
			toolName !== 'create_onto_project' ||
			!result ||
			typeof result !== 'object' ||
			Array.isArray(result)
		) {
			return;
		}

		const resultRecord = result as Record<string, unknown>;
		const projectId = readUuid(resultRecord.project_id);
		if (!projectId || !Array.isArray(resultRecord.created_entities)) return;

		for (const value of resultRecord.created_entities) {
			if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
			const entity = value as Record<string, unknown>;
			const kind = normalizeProjectScopedEntityKind(entity.kind);
			const entityId = readUuid(entity.id);
			if (!kind || !entityId) continue;

			const expectedProjectId = kind === 'project' ? entityId : projectId;
			const claimedProjectId = readUuid(entity.project_id);
			if (
				(kind === 'project' && entityId !== projectId) ||
				(claimedProjectId && claimedProjectId !== expectedProjectId)
			) {
				logger.warn('Skipped inconsistent project-instantiation entity registration', {
					toolName,
					kind,
					entityId,
					projectId,
					claimedProjectId
				});
				continue;
			}

			this.rememberSameTurnEntityProjectId(kind, entityId, expectedProjectId, toolName);
		}
	}

	private registerSameTurnLoadedOntologyEntities(
		toolName: string,
		args: Record<string, any>,
		result: unknown
	): void {
		const evidence = extractOntologyScopeEvidence({ toolName, args, result });
		for (const entity of evidence) {
			this.rememberSameTurnEntityProjectId(
				entity.kind,
				entity.entityId,
				entity.projectId,
				toolName
			);
		}
	}

	private applySameTurnOntologyOwnershipMutation(
		toolName: string,
		args: Record<string, any>,
		result: unknown
	): void {
		const readUuid = (value: unknown): string | undefined => {
			if (typeof value !== 'string') return undefined;
			const trimmed = value.trim();
			return isValidUUID(trimmed) ? trimmed : undefined;
		};

		if (toolName === 'move_onto_task') {
			const resultRecord =
				result && typeof result === 'object' && !Array.isArray(result)
					? (result as Record<string, unknown>)
					: null;
			const status = typeof resultRecord?.status === 'string' ? resultRecord.status : '';
			if (status !== 'moved' && status !== 'already_moved') return;
			const taskId = readUuid(args.task_id);
			const destinationProjectId = readUuid(args.destination_project_id);
			if (!taskId || !destinationProjectId) return;
			this.sameTurnEntityProjectIds.set(`task:${taskId}`, destinationProjectId);
			return;
		}

		if (!toolName.startsWith('delete_onto_')) return;
		const kind = normalizeProjectScopedEntityKind(toolName.slice('delete_onto_'.length));
		if (!kind) return;
		const entityId = readUuid(args[`${kind}_id`]);
		if (!entityId) return;
		this.sameTurnEntityProjectIds.set(`${kind}:${entityId}`, null);
	}

	private rememberSameTurnEntityProjectId(
		kind: ProjectScopedEntityKind,
		entityId: string,
		projectId: string,
		sourceTool: string
	): void {
		const key = `${kind}:${entityId}`;
		if (!this.sameTurnEntityProjectIds.has(key)) {
			this.sameTurnEntityProjectIds.set(key, projectId);
			return;
		}

		const existingProjectId = this.sameTurnEntityProjectIds.get(key);
		if (existingProjectId === null || existingProjectId === projectId) return;

		// Never let later, contradictory evidence silently replace ownership. A
		// tombstone makes the next mutation fail closed instead of falling back to
		// the turn-start snapshot, which may now be stale.
		this.sameTurnEntityProjectIds.set(key, null);
		logger.warn('Conflicting same-turn ontology entity ownership evidence', {
			sourceTool,
			kind,
			entityId,
			existingProjectId,
			projectId
		});
	}
}
