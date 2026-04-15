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
import type { ChatMessage, ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';
import { CHAT_TOOL_DEFINITIONS, TOOL_METADATA } from '../tools/core/definitions';
import { searchToolRegistry } from '../tools/registry/tool-search';
import { getToolSchema } from '../tools/registry/tool-schema';
import {
	normalizeProjectCreateArgs,
	validateProjectCreateArgs
} from '../tools/core/project-create-args';
import { loadSkill } from '../tools/skills/skill-load';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { dev } from '$app/environment';
import { createLogger } from '$lib/utils/logger';
import { sanitizeLogData } from '$lib/utils/logging-helpers';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	getDocumentUpdateContentCandidate,
	hasMeaningfulUpdateValue,
	isAppendOrMergeUpdateStrategy
} from '../shared/update-value-validation';

const logger = createLogger('ToolExecutionService');
const GATEWAY_TOOL_NAMES = new Set(['skill_load', 'tool_search', 'tool_schema']);

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
	private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
	private static readonly DEFAULT_RETRY_COUNT = 0;
	private static readonly DEFAULT_RETRY_DELAY = 1000;
	private static readonly MAX_FORMATTED_LENGTH = 4000;
	private static readonly UPDATE_TOOL_PREFIX = 'update_onto_';
	private static readonly UPDATE_TOOL_DISPLAY_KEYS: Record<string, string> = {
		project: 'project_name',
		task: 'task_title',
		goal: 'goal_name',
		plan: 'plan_name',
		document: 'document_title',
		milestone: 'milestone_title',
		risk: 'risk_title'
	};
	private static readonly UUID_VALIDATED_TOOL_NAMES = new Set([
		'list_task_documents',
		'create_task_document',
		'get_entity_relationships',
		'get_linked_entities',
		'link_onto_entities',
		'unlink_onto_edge',
		'get_document_tree',
		'get_document_path',
		'move_document_in_tree',
		'reorganize_onto_project_graph'
	]);
	private static readonly UUID_ARG_KEYS = new Set([
		'project_id',
		'task_id',
		'goal_id',
		'plan_id',
		'document_id',
		'milestone_id',
		'risk_id',
		'entity_id',
		'src_id',
		'dst_id',
		'edge_id',
		'parent_id',
		'parent_document_id',
		'new_parent_id',
		'supporting_milestone_id'
	]);
	private static readonly STRICT_UUID_ARG_KEYS = new Set([
		'task_id',
		'goal_id',
		'plan_id',
		'document_id',
		'milestone_id',
		'risk_id',
		'entity_id',
		'src_id',
		'dst_id',
		'edge_id',
		'parent_id',
		'parent_document_id',
		'new_parent_id',
		'supporting_milestone_id'
	]);

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
			if (!result.success) {
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

		if (GATEWAY_TOOL_NAMES.has(toolName)) {
			const gatewayResult = await this.executeGatewayTool(
				toolName,
				args,
				context,
				availableTools,
				options
			);
			return finalizeResult({
				...gatewayResult,
				toolName,
				toolCallId: toolCall.id
			});
		}

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
					// ok to proceed; normalizeArguments will parse or reparse
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
			if (!this.hasDocumentPayload(args)) {
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

		args = this.applySchemaDefaults(toolName, args, availableTools);
		args = this.applyContextDefaults(toolName, args, context, availableTools);
		args = this.applyArgumentAliases(toolName, args, availableTools);
		args = this.normalizeIdFields(args);
		if (toolName === 'create_onto_project') {
			args = normalizeProjectCreateArgs(args);
		}

		if (toolName === 'create_onto_document') {
			const description = typeof args.description === 'string' ? args.description.trim() : '';
			if (!description) {
				return finalizeResult({
					success: false,
					error: 'create_onto_document requires a non-empty description',
					errorType: 'validation_error',
					toolName,
					toolCallId: toolCall.id
				});
			}
			args.description = description;
		}

		if (toolName === 'create_task_document') {
			const hasDocumentId =
				typeof args.document_id === 'string' && args.document_id.trim().length > 0;
			if (!hasDocumentId) {
				const description =
					typeof args.description === 'string' ? args.description.trim() : '';
				if (!description) {
					return finalizeResult({
						success: false,
						error: 'create_task_document requires a non-empty description when creating a document',
						errorType: 'validation_error',
						toolName,
						toolCallId: toolCall.id
					});
				}
				args.description = description;
			}
		}

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
				hasNestedDocument:
					typeof (args as Record<string, any>).document === 'object' &&
					(args as Record<string, any>).document !== null
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
			resolvedTimeoutMs = timeout;
			const execPromise = this.executeWithTimeout<ToolExecutorResponse>(
				() => this.toolExecutor(toolName, args, context),
				timeout
			);

			let execution: ToolExecutorResponse;
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

	private async executeGatewayTool(
		toolName: string,
		args: Record<string, any>,
		context: ServiceContext,
		availableTools: ChatToolDefinition[],
		options: ToolExecutionOptions
	): Promise<ToolExecutionResult> {
		if (toolName === 'skill_load') {
			const skill =
				typeof args.skill === 'string'
					? args.skill
					: typeof args.id === 'string'
						? args.id
						: typeof args.path === 'string'
							? args.path
							: '';
			const result = loadSkill(skill, {
				format: args.format === 'full' ? 'full' : 'short',
				include_examples: args.include_examples !== false
			});
			return { success: true, data: result, toolName, toolCallId: 'gateway' };
		}

		if (toolName === 'tool_search') {
			const result = searchToolRegistry({
				query: typeof args.query === 'string' ? args.query : undefined,
				capability: typeof args.capability === 'string' ? args.capability : undefined,
				group:
					args.group === 'onto' || args.group === 'util' || args.group === 'cal'
						? args.group
						: undefined,
				kind: args.kind === 'read' || args.kind === 'write' ? args.kind : undefined,
				entity: typeof args.entity === 'string' ? args.entity : undefined,
				limit: typeof args.limit === 'number' ? args.limit : undefined
			});
			return { success: true, data: result, toolName, toolCallId: 'gateway' };
		}

		if (toolName === 'tool_schema') {
			const op =
				typeof args.op === 'string'
					? args.op
					: typeof args.path === 'string'
						? args.path
						: '';
			const result = getToolSchema(op, {
				include_examples: args.include_examples !== false,
				include_schema: args.include_schema !== false
			});
			return { success: true, data: result, toolName, toolCallId: 'gateway' };
		}

		return {
			success: false,
			error: `Unknown gateway tool: ${toolName}`,
			errorType: 'validation_error',
			toolName,
			toolCallId: 'gateway'
		};
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
			toolName = toolCallOrName.trim();
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
		const getActualType = (value: unknown): string => {
			if (value === null) return 'null';
			if (Array.isArray(value)) return 'array';
			return typeof value;
		};
		const collectTypes = (schema: Record<string, any> | undefined, types: Set<string>) => {
			if (!schema || typeof schema !== 'object') return;
			if (schema.nullable === true) {
				types.add('null');
			}
			if (Array.isArray(schema.type)) {
				schema.type.forEach((t: unknown) => {
					if (typeof t === 'string') {
						types.add(t);
					}
				});
			} else if (typeof schema.type === 'string') {
				types.add(schema.type);
			}
			const unions = []
				.concat(schema.anyOf ?? [])
				.concat(schema.oneOf ?? [])
				.concat(schema.allOf ?? []);
			for (const unionEntry of unions) {
				if (unionEntry && typeof unionEntry === 'object') {
					collectTypes(unionEntry as Record<string, any>, types);
				}
			}
		};
		const getAllowedTypes = (schema: Record<string, any> | undefined): Set<string> | null => {
			const types = new Set<string>();
			collectTypes(schema, types);
			return types.size > 0 ? types : null;
		};
		const allowsNull = (schema: Record<string, any> | undefined): boolean => {
			const types = getAllowedTypes(schema);
			return types ? types.has('null') : false;
		};

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
				const value = args[required];
				const paramDef = (paramSchema.properties ?? {})[required] as
					| Record<string, any>
					| undefined;
				if (!(required in args) || value === undefined) {
					errors.push(`Missing required parameter: ${required}`);
					continue;
				}
				if (value === null && !allowsNull(paramDef)) {
					errors.push(`Missing required parameter: ${required}`);
					continue;
				}
				if (typeof value === 'string' && value.trim().length === 0) {
					errors.push(`Missing required parameter: ${required}`);
					continue;
				}
			}

			const properties = paramSchema.properties ?? {};
			for (const [key, value] of Object.entries(args)) {
				const paramDef = properties[key];
				if (!paramDef || typeof paramDef !== 'object') continue;

				const allowedTypes = getAllowedTypes(paramDef);
				const actualType = getActualType(value);

				// Basic type checking with union support
				if (allowedTypes && !allowedTypes.has(actualType)) {
					const expectedList = Array.from(allowedTypes).join(' | ');
					errors.push(
						`Invalid type for parameter ${key}: expected ${expectedList}, got ${actualType}`
					);
				}

				if (typeof value === 'string' && typeof (paramDef as any).minLength === 'number') {
					if (value.length < (paramDef as any).minLength) {
						errors.push(
							`Invalid length for parameter ${key}: expected at least ${(paramDef as any).minLength} characters`
						);
					}
				}

				if (Array.isArray(value) && typeof (paramDef as any).minItems === 'number') {
					if (value.length < (paramDef as any).minItems) {
						errors.push(
							`Invalid length for parameter ${key}: expected at least ${(paramDef as any).minItems} items`
						);
					}
				}
			}

			this.validateUuidIdArgs(toolName, args, paramSchema, errors, allowsNull);
		}

		this.applyCustomValidation(toolName, args, errors);

		return {
			isValid: errors.length === 0,
			errors
		};
	}

	private applyCustomValidation(
		toolName: string,
		args: Record<string, any>,
		errors: string[]
	): void {
		if (toolName.startsWith(ToolExecutionService.UPDATE_TOOL_PREFIX)) {
			this.validateOntologyUpdateArgs(toolName, args, errors);
		}

		switch (toolName) {
			case 'list_calendar_events':
			case 'get_calendar_event_details':
			case 'create_calendar_event':
			case 'update_calendar_event':
			case 'delete_calendar_event':
			case 'get_project_calendar':
			case 'set_project_calendar':
				this.validateCalendarToolArgs(toolName, args, errors);
				break;
			case 'reorganize_onto_project_graph':
				this.validateReorganizeProjectGraphArgs(args, errors);
				break;
			case 'create_onto_project':
				for (const error of validateProjectCreateArgs(args)) {
					if (!errors.includes(error)) {
						errors.push(error);
					}
				}
				break;
			default:
				break;
		}
	}

	private validateOntologyUpdateArgs(
		toolName: string,
		args: Record<string, any>,
		errors: string[]
	): void {
		const entity = toolName.slice(ToolExecutionService.UPDATE_TOOL_PREFIX.length);
		if (!entity) return;

		const addErrorOnce = (message: string): void => {
			if (!errors.includes(message)) {
				errors.push(message);
			}
		};

		const idKey = `${entity}_id`;
		const rawId = args[idKey];
		const trimmedId = typeof rawId === 'string' ? rawId.trim() : rawId;
		if (!trimmedId || typeof trimmedId !== 'string') {
			addErrorOnce(`Missing required parameter: ${idKey}`);
		} else if (!isValidUUID(trimmedId)) {
			addErrorOnce(`Invalid ${idKey}: expected UUID`);
		}

		const displayKey = ToolExecutionService.UPDATE_TOOL_DISPLAY_KEYS[entity];
		const ignoredKeys = new Set<string>([idKey, 'update_strategy', 'merge_instructions']);
		if (displayKey) {
			ignoredKeys.add(displayKey);
		}

		const hasUpdateField = Object.entries(args).some(([key, value]) => {
			if (ignoredKeys.has(key)) return false;
			return hasMeaningfulUpdateValue(value);
		});

		if (!hasUpdateField) {
			addErrorOnce(
				`No update fields provided for ${toolName}. Include at least one field to change.`
			);
		}

		if (
			toolName === 'update_onto_document' &&
			isAppendOrMergeUpdateStrategy(args.update_strategy) &&
			!getDocumentUpdateContentCandidate(args)
		) {
			addErrorOnce(
				`update_onto_document ${args.update_strategy} requires non-empty content.`
			);
		}
	}

	private shouldValidateUuidArgs(toolName: string): boolean {
		if (!toolName) return false;
		return (
			toolName.includes('_onto_') ||
			ToolExecutionService.UUID_VALIDATED_TOOL_NAMES.has(toolName)
		);
	}

	private validateUuidIdArgs(
		toolName: string,
		args: Record<string, any>,
		paramSchema: Record<string, any> | undefined,
		errors: string[],
		allowsNull: (schema: Record<string, any> | undefined) => boolean
	): void {
		if (!this.shouldValidateUuidArgs(toolName)) return;

		const addErrorOnce = (message: string): void => {
			if (!errors.includes(message)) {
				errors.push(message);
			}
		};

		const properties =
			paramSchema && typeof paramSchema === 'object' ? (paramSchema.properties ?? {}) : {};

		for (const [key, value] of Object.entries(args)) {
			if (!ToolExecutionService.UUID_ARG_KEYS.has(key)) continue;
			const paramDef = properties[key] as Record<string, any> | undefined;
			if (value === undefined) continue;
			if (value === null) {
				if (!allowsNull(paramDef)) {
					addErrorOnce(`Invalid ${key}: expected UUID`);
				}
				continue;
			}
			if (typeof value !== 'string') continue;

			const trimmed = value.trim();
			if (!trimmed) continue;
			const looksTruncated = trimmed.includes('...') || /^[0-9a-f]{8}$/i.test(trimmed);
			const requiresStrictUuid = ToolExecutionService.STRICT_UUID_ARG_KEYS.has(key);
			if (looksTruncated || (requiresStrictUuid && !isValidUUID(trimmed))) {
				addErrorOnce(`Invalid ${key}: expected UUID`);
			}
		}
	}

	private validateCalendarToolArgs(
		toolName: string,
		args: Record<string, any>,
		errors: string[]
	): void {
		const addErrorOnce = (message: string): void => {
			if (!errors.includes(message)) {
				errors.push(message);
			}
		};

		const validateUuidIfPresent = (key: string): void => {
			const raw = args[key];
			if (typeof raw !== 'string') return;
			const trimmed = raw.trim();
			if (!trimmed) return;
			if (!isValidUUID(trimmed)) {
				addErrorOnce(`Invalid ${key}: expected UUID`);
			}
		};

		validateUuidIfPresent('project_id');
		validateUuidIfPresent('task_id');
		validateUuidIfPresent('onto_event_id');

		const calendarScope =
			typeof args.calendar_scope === 'string' ? args.calendar_scope.trim() : '';
		if (calendarScope === 'project') {
			const projectId =
				typeof args.project_id === 'string' ? args.project_id.trim() : undefined;
			if (!projectId) {
				addErrorOnce('Missing required parameter: project_id');
			}
		}

		if (toolName === 'get_project_calendar' || toolName === 'set_project_calendar') {
			const projectId =
				typeof args.project_id === 'string' ? args.project_id.trim() : undefined;
			if (!projectId) {
				addErrorOnce('Missing required parameter: project_id');
			}
		}

		if (toolName === 'update_calendar_event' || toolName === 'delete_calendar_event') {
			const hasOntoEventId =
				typeof args.onto_event_id === 'string' && args.onto_event_id.trim().length > 0;
			const hasGoogleEventId =
				typeof args.event_id === 'string' && args.event_id.trim().length > 0;
			if (!hasOntoEventId && !hasGoogleEventId) {
				addErrorOnce('Missing required parameter: onto_event_id or event_id');
			}
		}
	}

	private validateReorganizeProjectGraphArgs(args: Record<string, any>, errors: string[]): void {
		const projectId = typeof args.project_id === 'string' ? args.project_id.trim() : '';
		if (!projectId || !isValidUUID(projectId)) {
			errors.push('Invalid project_id: expected UUID');
		}

		const nodes = Array.isArray(args.nodes) ? args.nodes : [];
		let needsGraphLookupHint = false;
		const isDocumentKind = (value: string): boolean => {
			const normalized = value.trim().toLowerCase();
			return normalized === 'document' || normalized.startsWith('document.');
		};

		for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
			const node = nodes[nodeIndex];
			if (!node || typeof node !== 'object') {
				errors.push(`Invalid nodes[${nodeIndex}] entry`);
				continue;
			}

			const kind = typeof (node as any).kind === 'string' ? (node as any).kind.trim() : '';
			const id = typeof (node as any).id === 'string' ? (node as any).id.trim() : '';

			if (kind && isDocumentKind(kind)) {
				errors.push(
					`Document nodes are not allowed in reorganize_onto_project_graph (nodes[${nodeIndex}]). Documents are organized only via onto_projects.doc_structure.`
				);
			}

			if (!id) {
				errors.push(`Missing id for node at nodes[${nodeIndex}]`);
			} else if (!isValidUUID(id)) {
				needsGraphLookupHint = true;
				errors.push(`Invalid ${kind || 'node'} id at nodes[${nodeIndex}]: expected UUID`);
			}

			const connections = Array.isArray((node as any).connections)
				? (node as any).connections
				: [];

			for (let connIndex = 0; connIndex < connections.length; connIndex += 1) {
				const connection = connections[connIndex];
				if (!connection || typeof connection !== 'object') {
					errors.push(
						`Invalid connection at nodes[${nodeIndex}].connections[${connIndex}]`
					);
					continue;
				}

				const connKind =
					typeof (connection as any).kind === 'string'
						? (connection as any).kind.trim()
						: '';
				const connId =
					typeof (connection as any).id === 'string' ? (connection as any).id.trim() : '';

				if (connKind && isDocumentKind(connKind)) {
					errors.push(
						`Document connections are not allowed in reorganize_onto_project_graph (nodes[${nodeIndex}].connections[${connIndex}]). Documents are organized only via onto_projects.doc_structure.`
					);
				}

				if (!connKind || !connId) {
					errors.push(
						`Invalid connection at nodes[${nodeIndex}].connections[${connIndex}]: requires kind and id`
					);
					continue;
				}

				if (connKind === 'project') {
					if (!isValidUUID(connId)) {
						errors.push(
							`Invalid connection project id at nodes[${nodeIndex}].connections[${connIndex}]: expected UUID`
						);
					} else if (projectId && isValidUUID(projectId) && connId !== projectId) {
						errors.push(
							`Connection project id must match project_id at nodes[${nodeIndex}].connections[${connIndex}]`
						);
					}
				} else if (!isValidUUID(connId)) {
					needsGraphLookupHint = true;
					errors.push(
						`Invalid connection id for ${connKind} at nodes[${nodeIndex}].connections[${connIndex}]: expected UUID`
					);
				}
			}
		}

		if (needsGraphLookupHint) {
			errors.push(
				'Use get_onto_project_graph to fetch entity UUIDs before calling reorganize_onto_project_graph.'
			);
		}
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
			const trimmed = args.trim();
			if (!trimmed) {
				return {};
			}
			try {
				const parsed = JSON.parse(trimmed);
				return this.normalizeParsedArguments(parsed, toolName, trimmed);
			} catch (error) {
				const fallback = this.buildStringArgumentFallback(toolName, trimmed);
				if (fallback) {
					this.logStringArgumentFallback(toolName, 'non_json_string', trimmed);
					return fallback;
				}
				throw new ToolExecutionError(
					`Invalid JSON for tool arguments: ${error instanceof Error ? error.message : 'unknown error'}`,
					toolName ?? 'unknown',
					{ args }
				);
			}
		}

		if (typeof args === 'object') {
			return this.normalizeParsedArguments(args, toolName);
		}

		return {};
	}

	private hasDocumentPayload(args: Record<string, any>): boolean {
		if (!args || typeof args !== 'object') return false;
		const directKeys = [
			'title',
			'name',
			'document_title',
			'document_name',
			'content',
			'body_markdown',
			'text',
			'markdown',
			'body'
		];
		if (directKeys.some((key) => key in args)) return true;

		const nested =
			args.document && typeof args.document === 'object'
				? (args.document as Record<string, any>)
				: undefined;
		if (!nested) return false;

		return directKeys.some((key) => key in nested);
	}

	private normalizeParsedArguments(
		parsed: unknown,
		toolName?: string,
		rawString?: string,
		depth = 0
	): Record<string, any> {
		if (parsed === undefined || parsed === null) {
			return {};
		}

		if (depth > 3) {
			if (dev) {
				logger.debug('Tool arguments exceeded parse depth; using empty object', {
					toolName
				});
			}
			return {};
		}

		if (typeof parsed === 'string') {
			const inner = parsed.trim();
			if (inner && this.looksLikeJsonPayload(inner)) {
				const reparsed = this.tryParseJsonPayload(inner, toolName);
				if (reparsed !== null && reparsed !== undefined) {
					if (dev) {
						logger.debug('Tool arguments were nested JSON string; reparsed', {
							toolName
						});
					}
					return this.normalizeParsedArguments(reparsed, toolName, rawString, depth + 1);
				}
			}

			const fallback = this.buildStringArgumentFallback(toolName, inner);
			if (fallback) {
				this.logStringArgumentFallback(toolName, 'json_string', inner);
				return fallback;
			}

			if (dev) {
				logger.debug('Tool arguments parsed to string; using empty object', {
					toolName,
					rawPreview: rawString?.slice(0, 200)
				});
			}
			return {};
		}

		if (typeof parsed === 'object') {
			return parsed as Record<string, any>;
		}

		return {};
	}

	private looksLikeJsonPayload(value: string): boolean {
		const trimmed = value.trim();
		if (!trimmed) return false;
		if (trimmed.startsWith('{') || trimmed.startsWith('[')) return true;
		return trimmed.startsWith('"') && trimmed.endsWith('"');
	}

	private tryParseJsonPayload(value: string, toolName?: string): unknown | null {
		try {
			return JSON.parse(value);
		} catch {
			const sanitized = value
				.replace(/\r/g, '\\r')
				.replace(/\n/g, '\\n')
				.replace(/\t/g, '\\t');
			if (sanitized === value) {
				return null;
			}
			try {
				const reparsed = JSON.parse(sanitized);
				if (dev) {
					logger.debug('Tool arguments reparsed after sanitizing control characters', {
						toolName
					});
				}
				return reparsed;
			} catch {
				return null;
			}
		}
	}

	private buildStringArgumentFallback(
		toolName: string | undefined,
		value: string
	): Record<string, any> | null {
		const trimmed = value.trim();
		if (!trimmed) {
			return null;
		}

		switch (toolName) {
			case 'web_search':
				return { query: trimmed };
			case 'web_visit':
				return { url: trimmed };
			default:
				return null;
		}
	}

	private logStringArgumentFallback(
		toolName: string | undefined,
		reason: 'non_json_string' | 'json_string',
		value: string
	): void {
		logger.warn('Tool arguments fallback applied', {
			toolName: toolName ?? 'unknown',
			reason,
			rawLength: value.length,
			rawPreview: value.slice(0, 160)
		});
	}

	private resolveToolCall(toolCall: ChatToolCall): { name: string; rawArguments: unknown } {
		const rawName = toolCall.function?.name ?? (toolCall as any)?.name ?? '';
		const name = typeof rawName === 'string' ? rawName.trim() : '';
		const primaryArgs = toolCall.function?.arguments;
		const hasPrimaryArgs =
			primaryArgs !== undefined &&
			primaryArgs !== null &&
			!(typeof primaryArgs === 'string' && primaryArgs.trim().length === 0);
		const rawArguments = hasPrimaryArgs ? primaryArgs : (toolCall as any)?.arguments;
		return { name, rawArguments };
	}

	private normalizeIdFields(args: Record<string, any>): Record<string, any> {
		let mutated = false;
		const normalized: Record<string, any> = { ...args };
		for (const [key, value] of Object.entries(args)) {
			if (!key.endsWith('_id') || typeof value !== 'string') continue;
			const trimmed = value.trim();
			if (trimmed !== value) {
				normalized[key] = trimmed;
				mutated = true;
			}
			if (!trimmed) {
				delete normalized[key];
				mutated = true;
			}
		}
		return mutated ? normalized : args;
	}

	private normalizeExecutionError(
		error: unknown,
		toolName: string,
		_args: Record<string, any>
	): string {
		return normalizeToolError(error, toolName);
	}

	private applySchemaDefaults(
		toolName: string,
		args: Record<string, any>,
		availableTools: ChatToolDefinition[]
	): Record<string, any> {
		const toolDef = this.getToolDefinition(toolName, availableTools);
		const paramSchema = (toolDef as any)?.function?.parameters || (toolDef as any)?.parameters;
		if (!paramSchema || typeof paramSchema !== 'object') {
			return args;
		}

		const properties = paramSchema.properties ?? {};
		const resolved = { ...args };

		for (const [key, def] of Object.entries(properties)) {
			if (resolved[key] !== undefined && resolved[key] !== null) continue;
			if (!def || typeof def !== 'object' || !('default' in def)) continue;

			const defaultValue = (def as Record<string, any>).default;
			if (Array.isArray(defaultValue)) {
				resolved[key] = [...defaultValue];
			} else if (defaultValue && typeof defaultValue === 'object') {
				resolved[key] = { ...defaultValue };
			} else if (defaultValue !== undefined) {
				resolved[key] = defaultValue;
			}
		}

		return resolved;
	}

	private applyContextDefaults(
		toolName: string,
		args: Record<string, any>,
		context: ServiceContext,
		availableTools: ChatToolDefinition[]
	): Record<string, any> {
		const resolved = { ...args };

		if (this.toolSupportsProjectId(toolName, availableTools)) {
			if (typeof resolved.project_id === 'string') {
				const trimmed = resolved.project_id.trim();
				if (trimmed) {
					resolved.project_id = trimmed;
				} else {
					delete resolved.project_id;
				}
			} else if ('project_id' in resolved) {
				delete resolved.project_id;
			}

			const hasValidProjectId =
				typeof resolved.project_id === 'string' && isValidUUID(resolved.project_id);
			if (!hasValidProjectId) {
				const projectId = this.resolveProjectIdFromContext(context);
				if (projectId) {
					resolved.project_id = projectId;
				}
			}
		}

		if (toolName === 'get_document_tree') {
			if (resolved.include_documents === undefined) {
				resolved.include_documents = true;
			}
			if (resolved.include_documents === true && resolved.include_content === undefined) {
				resolved.include_content = false;
			}
		}

		if (toolName === 'create_onto_document') {
			const nestedDocument =
				resolved.document && typeof resolved.document === 'object'
					? (resolved.document as Record<string, any>)
					: undefined;

			const mergeIfMissing = (key: string) => {
				if (resolved[key] !== undefined || !nestedDocument) return;
				if (nestedDocument[key] !== undefined) {
					resolved[key] = nestedDocument[key];
				}
			};

			mergeIfMissing('title');
			mergeIfMissing('description');
			mergeIfMissing('type_key');
			mergeIfMissing('state_key');
			mergeIfMissing('content');
			mergeIfMissing('body_markdown');
			mergeIfMissing('props');
			mergeIfMissing('parent_id');
			mergeIfMissing('position');

			if (
				(resolved.parent_id === undefined || resolved.parent_id === null) &&
				typeof (resolved as Record<string, any>).parent_document_id === 'string'
			) {
				resolved.parent_id = (resolved as Record<string, any>).parent_document_id;
			}
			if (
				(resolved.parent_id === undefined || resolved.parent_id === null) &&
				typeof (resolved as Record<string, any>).parentDocumentId === 'string'
			) {
				resolved.parent_id = (resolved as Record<string, any>).parentDocumentId;
			}
			if (
				(resolved.parent_id === undefined || resolved.parent_id === null) &&
				typeof nestedDocument?.parent_document_id === 'string'
			) {
				resolved.parent_id = nestedDocument.parent_document_id;
			}
			if (
				(resolved.parent_id === undefined || resolved.parent_id === null) &&
				typeof nestedDocument?.parentDocumentId === 'string'
			) {
				resolved.parent_id = nestedDocument.parentDocumentId;
			}

			const contentCandidates: Array<string | undefined> = [
				typeof resolved.content === 'string' ? resolved.content : undefined,
				typeof resolved.body_markdown === 'string' ? resolved.body_markdown : undefined,
				typeof (resolved as Record<string, any>).body === 'string'
					? (resolved as Record<string, any>).body
					: undefined,
				typeof (resolved as Record<string, any>).text === 'string'
					? (resolved as Record<string, any>).text
					: undefined,
				typeof (resolved as Record<string, any>).markdown === 'string'
					? (resolved as Record<string, any>).markdown
					: undefined,
				typeof nestedDocument?.content === 'string' ? nestedDocument.content : undefined,
				typeof nestedDocument?.body_markdown === 'string'
					? nestedDocument.body_markdown
					: undefined,
				typeof nestedDocument?.body === 'string' ? nestedDocument.body : undefined,
				typeof nestedDocument?.text === 'string' ? nestedDocument.text : undefined,
				typeof nestedDocument?.markdown === 'string' ? nestedDocument.markdown : undefined
			];
			const resolvedContent = contentCandidates.find(
				(value) => typeof value === 'string' && value.trim().length > 0
			);
			if (
				(typeof resolved.content !== 'string' || resolved.content.trim().length === 0) &&
				resolvedContent
			) {
				resolved.content = resolvedContent;
			}

			const descriptionCandidates: Array<string | undefined> = [
				typeof resolved.description === 'string' ? resolved.description : undefined,
				typeof (resolved as Record<string, any>).summary === 'string'
					? (resolved as Record<string, any>).summary
					: undefined,
				typeof (resolved as Record<string, any>).doc_description === 'string'
					? (resolved as Record<string, any>).doc_description
					: undefined,
				typeof (resolved as Record<string, any>).document_description === 'string'
					? (resolved as Record<string, any>).document_description
					: undefined,
				typeof nestedDocument?.description === 'string'
					? nestedDocument.description
					: undefined,
				typeof nestedDocument?.summary === 'string' ? nestedDocument.summary : undefined,
				typeof nestedDocument?.doc_description === 'string'
					? nestedDocument.doc_description
					: undefined,
				typeof nestedDocument?.document_description === 'string'
					? nestedDocument.document_description
					: undefined
			];
			const resolvedDescription = descriptionCandidates.find(
				(value) => typeof value === 'string' && value.trim().length > 0
			);
			if (
				(typeof resolved.description !== 'string' ||
					resolved.description.trim().length === 0) &&
				resolvedDescription
			) {
				resolved.description = resolvedDescription;
			}

			const fallbackTitleCandidates = [
				resolved.title,
				(resolved as Record<string, unknown>).name,
				(resolved as Record<string, unknown>).document_title,
				(resolved as Record<string, unknown>).document_name,
				nestedDocument?.title,
				nestedDocument?.name,
				nestedDocument?.document_title,
				nestedDocument?.document_name
			].filter((value): value is string => typeof value === 'string');
			const fallbackTitle = fallbackTitleCandidates.find((value) => value.trim().length > 0);
			if (
				(typeof resolved.title !== 'string' || resolved.title.trim().length === 0) &&
				fallbackTitle
			) {
				resolved.title = fallbackTitle.trim();
			}

			const trimmedTypeKey =
				typeof resolved.type_key === 'string' ? resolved.type_key.trim() : '';
			if (!trimmedTypeKey) {
				resolved.type_key = 'document.default';
			} else if (trimmedTypeKey !== resolved.type_key) {
				resolved.type_key = trimmedTypeKey;
			}

			const trimmedTitle = typeof resolved.title === 'string' ? resolved.title.trim() : '';
			if (trimmedTitle) {
				resolved.title = trimmedTitle;
			} else {
				const inferred = this.inferDocumentTitle(context.conversationHistory);
				resolved.title =
					inferred && inferred.trim() ? inferred.trim() : 'Untitled Document';
			}

			const trimmedDescription =
				typeof resolved.description === 'string' ? resolved.description.trim() : '';
			if (trimmedDescription) {
				resolved.description = trimmedDescription;
			}
		}

		return resolved;
	}

	private applyArgumentAliases(
		toolName: string,
		args: Record<string, any>,
		availableTools: ChatToolDefinition[]
	): Record<string, any> {
		const toolDef = this.getToolDefinition(toolName, availableTools);
		const paramSchema = (toolDef as any)?.function?.parameters || (toolDef as any)?.parameters;
		if (!paramSchema || typeof paramSchema !== 'object') {
			return args;
		}

		const properties = paramSchema.properties ?? {};
		let resolved = { ...args };
		let mutated = false;
		const supportsSearch = properties.search && typeof properties.search === 'object';
		const supportsQuery = properties.query && typeof properties.query === 'object';
		const normalizedSearch = typeof resolved.search === 'string' ? resolved.search.trim() : '';
		const normalizedQuery = typeof resolved.query === 'string' ? resolved.query.trim() : '';

		if (supportsSearch && !normalizedSearch && normalizedQuery) {
			resolved.search = normalizedQuery;
			mutated = true;
		}

		if (supportsQuery && !normalizedQuery && normalizedSearch) {
			resolved.query = normalizedSearch;
			mutated = true;
		}

		const semanticAliasResult = this.applySemanticAliases(toolName, resolved);
		if (semanticAliasResult.mutated) {
			resolved = semanticAliasResult.args;
			mutated = true;
		}

		const idAliasResult = this.applyIdAliases(resolved, paramSchema);
		if (idAliasResult.mutated) {
			resolved = idAliasResult.args;
			mutated = true;
		}

		if (!mutated) {
			return args;
		}

		if (dev) {
			logger.debug('Applied argument aliases for tool', {
				toolName,
				addedSearch: supportsSearch && !normalizedSearch && normalizedQuery.length > 0,
				addedQuery: supportsQuery && !normalizedQuery && normalizedSearch.length > 0,
				addedSemanticAliases: semanticAliasResult.addedCount,
				addedIdAliases: idAliasResult.addedCount
			});
		}

		return resolved;
	}

	private applyIdAliases(
		args: Record<string, any>,
		paramSchema: Record<string, any>
	): { args: Record<string, any>; mutated: boolean; addedCount: number } {
		const properties =
			paramSchema?.properties && typeof paramSchema.properties === 'object'
				? (paramSchema.properties as Record<string, unknown>)
				: {};
		const required = Array.isArray(paramSchema?.required)
			? (paramSchema.required as string[])
			: [];
		const idKeys = Object.keys(properties).filter((key) => key.endsWith('_id'));
		if (idKeys.length === 0) {
			return { args, mutated: false, addedCount: 0 };
		}

		const resolved: Record<string, any> = { ...args };
		let mutated = false;
		let addedCount = 0;

		const requiredIdKeys = idKeys.filter((key) => required.includes(key));
		const missingRequiredIdKeys = requiredIdKeys.filter(
			(key) => !this.hasNonEmptyString(resolved[key])
		);
		const canUseGenericId =
			missingRequiredIdKeys.length === 1 &&
			missingRequiredIdKeys[0] !== 'project_id' &&
			this.hasNonEmptyString(resolved.id) &&
			idKeys.length <= 2; // tolerate project_id + one entity id.

		for (const idKey of idKeys) {
			if (this.hasNonEmptyString(resolved[idKey])) continue;
			const alias = this.findAliasValueForIdKey(idKey, resolved, canUseGenericId);
			if (!alias) continue;
			resolved[idKey] = alias;
			mutated = true;
			addedCount += 1;
		}

		return {
			args: mutated ? resolved : args,
			mutated,
			addedCount
		};
	}

	private applySemanticAliases(
		toolName: string,
		args: Record<string, any>
	): { args: Record<string, any>; mutated: boolean; addedCount: number } {
		const resolved: Record<string, any> = { ...args };
		let addedCount = 0;

		const mapAlias = (
			targetKey: string,
			aliasKeys: string[],
			options: { allowNonString?: boolean } = {}
		): void => {
			const existing = resolved[targetKey];
			if (options.allowNonString) {
				if (existing !== undefined && existing !== null) return;
			} else if (this.hasNonEmptyString(existing)) {
				return;
			}

			for (const aliasKey of aliasKeys) {
				const candidate = this.readAliasValue(resolved, aliasKey);
				if (options.allowNonString) {
					if (candidate !== undefined && candidate !== null) {
						resolved[targetKey] = candidate;
						addedCount += 1;
						return;
					}
					continue;
				}
				if (this.hasNonEmptyString(candidate)) {
					resolved[targetKey] = String(candidate).trim();
					addedCount += 1;
					return;
				}
			}
		};

		switch (toolName) {
			case 'create_onto_task':
				mapAlias('title', ['task_title', 'task_name', 'name', 'task.title', 'task.name']);
				mapAlias('description', [
					'task_description',
					'details',
					'summary',
					'task.description',
					'task.details'
				]);
				break;
			case 'create_onto_plan':
				mapAlias('name', ['title', 'plan_name', 'plan_title', 'plan.title', 'plan.name']);
				mapAlias('description', [
					'plan_description',
					'details',
					'summary',
					'plan.description'
				]);
				mapAlias('plan', [
					'plan_body',
					'plan_content',
					'plan_details',
					'body',
					'content',
					'plan.plan'
				]);
				break;
			case 'create_onto_goal':
				mapAlias('name', ['title', 'goal_name', 'goal_title', 'goal.title', 'goal.name']);
				mapAlias('description', [
					'goal_description',
					'details',
					'summary',
					'goal.description'
				]);
				break;
			case 'update_onto_task':
				mapAlias('title', ['task_title', 'task_name', 'name', 'task.title', 'task.name']);
				mapAlias('description', [
					'task_description',
					'details',
					'summary',
					'task.description',
					'task.details'
				]);
				break;
			case 'update_onto_plan':
				mapAlias('name', ['plan_name', 'plan_title', 'title', 'plan.title', 'plan.name']);
				mapAlias('description', [
					'plan_description',
					'details',
					'summary',
					'plan.description'
				]);
				mapAlias('plan', [
					'plan_body',
					'plan_content',
					'plan_details',
					'body',
					'content',
					'plan.plan'
				]);
				break;
			case 'update_onto_goal':
				mapAlias('name', ['goal_name', 'goal_title', 'title', 'goal.title', 'goal.name']);
				mapAlias('description', [
					'goal_description',
					'details',
					'summary',
					'content',
					'goal.description'
				]);
				break;
			case 'update_onto_document':
				mapAlias('title', [
					'document_title',
					'doc_title',
					'name',
					'document.title',
					'document.name'
				]);
				mapAlias('description', ['document_description', 'summary', 'details']);
				mapAlias('content', [
					'body_markdown',
					'markdown',
					'body',
					'text',
					'document.content'
				]);
				break;
			case 'link_onto_entities':
				mapAlias('src_kind', [
					'source_kind',
					'from_kind',
					'from.kind',
					'source.kind',
					'src.kind'
				]);
				mapAlias('src_id', ['source_id', 'from_id', 'from.id', 'source.id', 'src.id']);
				mapAlias('dst_kind', [
					'target_kind',
					'to_kind',
					'to.kind',
					'target.kind',
					'dst.kind'
				]);
				mapAlias('dst_id', ['target_id', 'to_id', 'to.id', 'target.id', 'dst.id']);
				mapAlias('rel', [
					'relationship',
					'relation',
					'relationship_type',
					'edge_type',
					'type'
				]);
				mapAlias('props', ['edge_props', 'metadata'], { allowNonString: true });
				break;
			case 'list_calendar_events':
				mapAlias('query', ['q']);
				break;
			case 'get_calendar_event_details':
			case 'update_calendar_event':
			case 'delete_calendar_event':
				mapAlias('event_id', [
					'external_event_id',
					'externalEventId',
					'event.id',
					'external_event.id'
				]);
				break;
			default:
				break;
		}

		return {
			args: addedCount > 0 ? resolved : args,
			mutated: addedCount > 0,
			addedCount
		};
	}

	private findAliasValueForIdKey(
		idKey: string,
		args: Record<string, any>,
		allowGenericId: boolean
	): string | null {
		const base = idKey.slice(0, -3);
		const aliases = this.buildIdAliasKeys(idKey, base, allowGenericId);
		for (const aliasKey of aliases) {
			const value = this.readAliasValue(args, aliasKey);
			if (this.hasNonEmptyString(value)) {
				return String(value).trim();
			}
		}

		const nestedEntity = args[base];
		if (nestedEntity && typeof nestedEntity === 'object' && !Array.isArray(nestedEntity)) {
			const nestedValue = this.readAliasValue(nestedEntity as Record<string, any>, 'id');
			if (this.hasNonEmptyString(nestedValue)) {
				return String(nestedValue).trim();
			}
		}

		return null;
	}

	private buildIdAliasKeys(idKey: string, base: string, allowGenericId: boolean): string[] {
		const baseCamel = base.replace(/_([a-z])/g, (_, chr: string) => chr.toUpperCase());
		const aliases = new Set<string>([
			idKey,
			`${base}_id`,
			`${base}Id`,
			`${baseCamel}Id`,
			`${baseCamel}_id`,
			`${base}.id`
		]);

		if (idKey === 'document_id') {
			aliases.add('doc_id');
			aliases.add('docId');
			aliases.add('documentId');
			aliases.add('document.id');
		}

		if (idKey === 'event_id') {
			aliases.add('external_event_id');
			aliases.add('externalEventId');
			aliases.add('external_event.id');
			aliases.add('external.id');
		}

		if (idKey === 'new_parent_id') {
			aliases.add('parent_id');
			aliases.add('parentId');
			aliases.add('parent_document_id');
			aliases.add('parentDocumentId');
			aliases.add('parent.id');
		}

		if (allowGenericId) {
			aliases.add('id');
		}

		return Array.from(aliases);
	}

	private readAliasValue(source: Record<string, any>, aliasKey: string): unknown {
		if (!aliasKey.includes('.')) {
			return source[aliasKey];
		}
		const parts = aliasKey.split('.');
		let cursor: unknown = source;
		for (const part of parts) {
			if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
				return undefined;
			}
			cursor = (cursor as Record<string, unknown>)[part];
		}
		return cursor;
	}

	private hasNonEmptyString(value: unknown): boolean {
		return typeof value === 'string' && value.trim().length > 0;
	}

	private toolSupportsProjectId(toolName: string, availableTools: ChatToolDefinition[]): boolean {
		const toolDef = this.getToolDefinition(toolName, availableTools);
		const paramSchema = (toolDef as any)?.function?.parameters || (toolDef as any)?.parameters;
		if (!paramSchema || typeof paramSchema !== 'object') {
			return false;
		}

		const required = Array.isArray(paramSchema.required) ? paramSchema.required : [];
		const properties = paramSchema.properties ?? {};
		return 'project_id' in properties || required.includes('project_id');
	}

	private resolveProjectIdFromContext(context: ServiceContext): string | undefined {
		const scoped = context.contextScope?.projectId;
		if (typeof scoped === 'string' && isValidUUID(scoped)) {
			return scoped;
		}

		if (context.contextType?.startsWith('project') && typeof context.entityId === 'string') {
			if (isValidUUID(context.entityId)) {
				return context.entityId;
			}
		}

		const focusProjectId = context.projectFocus?.projectId;
		if (typeof focusProjectId === 'string' && isValidUUID(focusProjectId)) {
			return focusProjectId;
		}

		return undefined;
	}

	private inferDocumentTitle(history: ChatMessage[]): string | undefined {
		if (!Array.isArray(history) || history.length === 0) return undefined;
		const lastUser = [...history].reverse().find((msg) => msg.role === 'user');
		if (!lastUser || typeof lastUser.content !== 'string') return undefined;

		const text = lastUser.content;
		const patterns = [
			/document\s+(?:named|called|titled)?\s*['"]([^'"]+)['"]/i,
			/['"]([^'"]+)['"]\s+document/i,
			/doc\s+(?:named|called|titled)?\s*['"]([^'"]+)['"]/i
		];

		for (const pattern of patterns) {
			const match = text.match(pattern);
			if (match?.[1]) {
				const title = match[1].trim();
				if (title) {
					return title.length > 160 ? `${title.slice(0, 157)}...` : title;
				}
			}
		}

		return undefined;
	}
}
