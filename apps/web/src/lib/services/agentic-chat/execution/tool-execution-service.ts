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
	ToolExecutorFunction
} from '../shared/types';
import type { ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { dev } from '$app/environment';
import { createLogger } from '$lib/utils/logger';
import {
	decodeToolArguments,
	resolveToolCall,
	type ArgumentDecodeDiagnostic
} from './tool-execution/call-decoder';
import { runArgumentPipeline } from './tool-execution/argument-pipeline';
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
import {
	dispatchToolExecution,
	runToolCallsSequentially,
	runToolCallsWithConcurrency,
	runToolCallWithRetry
} from './tool-execution/execution-runner';
import {
	extractToolResultEntityIds,
	formatToolExecutionResult
} from './tool-execution/result-adapter';
import {
	createToolResultFinalizer,
	getToolExecutionTimeMs,
	type ToolExecutionTelemetryHook
} from './tool-execution/result-observer';
import {
	guardEntityIdsMatchContextScope,
	guardProjectIdMatchesContextScope
} from './tool-execution/scope-guards';
import { SameTurnDocumentRegistry } from './tool-execution/same-turn-document-registry';
import { SameTurnOntologyOwnershipRegistry } from './tool-execution/same-turn-ontology-ownership';
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
export type {
	ToolExecutionTelemetry,
	ToolExecutionTelemetryHook
} from './tool-execution/result-observer';

export type VirtualToolHandler = (params: {
	toolCall: ChatToolCall;
	toolName: string;
	args: ToolArguments;
	context: ServiceContext;
	availableTools: ChatToolDefinition[];
}) => Promise<ToolExecutionResult>;

/**
 * Service for executing tools
 *
 * Architecture boundary: keep only ordered stage orchestration, request-local
 * state ownership, and public compatibility delegates here. New per-tool
 * behavior belongs in a cohesive module under tool-execution/.
 */
export class ToolExecutionService implements BaseService {
	// Ontology context is a turn-start snapshot. Keep successful creates and
	// trusted read evidence in request-local state so later writes in the same
	// turn can prove ownership. A null value is a tombstone for deleted entities
	// or conflicting evidence and intentionally blocks fallback to stale context.
	// The service is instantiated once per stream request, so this cannot leak
	// across turns or users.
	private readonly sameTurnOntologyOwnership = new SameTurnOntologyOwnershipRegistry();
	// Document titles additionally support same-turn duplicate protection.
	private readonly sameTurnCreatedDocuments = new SameTurnDocumentRegistry();

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
		const observationStartedAt = getToolExecutionTimeMs();
		const virtualHandler =
			name && options.virtualHandlers ? options.virtualHandlers[name] : undefined;
		let parsedArgs: ToolArguments | undefined;
		let resolvedTimeoutMs: number | undefined;
		const finalizeResult = createToolResultFinalizer({
			toolName,
			virtual: Boolean(virtualHandler),
			context,
			telemetryHook: this.telemetryHook,
			errorLogger: this.errorLogger,
			startedAt: observationStartedAt,
			getDetails: () => ({ args: parsedArgs, timeoutMs: resolvedTimeoutMs })
		});

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
			sameTurnEntityProjectIds: this.sameTurnOntologyOwnership.asReadonlyMap()
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

		const dispatched = await dispatchToolExecution({
			toolCall,
			toolName,
			args,
			context,
			availableTools,
			validationTools,
			virtualHandler,
			toolExecutor: this.toolExecutor,
			timeoutOverride: options.timeout,
			abortSignal: options.abortSignal
		});
		resolvedTimeoutMs = dispatched.timeoutMs;

		if (dispatched.lane === 'core' && dispatched.result.success) {
			const cleanedResult = dispatched.cleanedCoreData;
			this.sameTurnOntologyOwnership.rememberLoaded(toolName, args, cleanedResult);
			this.sameTurnOntologyOwnership.rememberCreated(toolName, args, cleanedResult, context);
			this.sameTurnOntologyOwnership.applyMutation(toolName, args, cleanedResult);
			if (toolName === 'create_onto_document') {
				this.sameTurnCreatedDocuments.rememberCreatedDocument(args, {
					data: cleanedResult
				});
			}
		}

		return finalizeResult(dispatched.result);
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
		return runToolCallsSequentially({
			toolCalls,
			executeTool: (call) => this.executeTool(call, context, availableTools, options),
			abortSignal: options.abortSignal
		});
	}

	/**
	 * Validate a tool call
	 * Overloaded to accept either ChatToolCall or toolName + args
	 */
	validateToolCall(
		toolCallOrName: ChatToolCall | string,
		availableToolsOrArgs?: ChatToolDefinition[] | ToolArguments,
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
		return formatToolExecutionResult(result);
	}

	/**
	 * Extract entity IDs from tool results
	 */
	extractEntitiesFromResult(result: unknown): string[] {
		return extractToolResultEntityIds(result);
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
		return runToolCallWithRetry({
			toolCall,
			executeTool: (call) => this.executeTool(call, context, availableTools, options),
			retryCount: options.retryCount,
			retryDelay: options.retryDelay,
			abortSignal: options.abortSignal
		});
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
		return runToolCallsWithConcurrency({
			toolCalls,
			executeTool: (call) => this.executeTool(call, context, availableTools, options),
			maxConcurrency
		});
	}
}
