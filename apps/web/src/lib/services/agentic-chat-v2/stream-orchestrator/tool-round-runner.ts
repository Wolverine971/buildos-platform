// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-round-runner.ts
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import { getToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-registry';
import type { FastChatHistoryMessage } from '../types';
import type { TurnSupervisorObservation } from '../turn-supervisor';
import { summarizeToolResult } from '../turn-supervisor/digest';
import { extractGatewayMaterializedToolNames } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { buildToolPayloadForModel } from './tool-payload-compaction';
import { parseToolArguments } from './tool-arguments';
import type { FastToolExecution } from './shared';
import {
	didGatewayExecSucceed,
	extractGatewayExecResultData,
	isDuplicateWriteSkippedExecution
} from './tool-classification';
import {
	buildWrongEntityKindRepairResult,
	rememberKnownEntitiesFromToolResult,
	type KnownEntity
} from './entity-kind-repair';
import { validateToolCalls, type ToolValidationIssue } from './tool-validation';

export type ToolCallExecutionPair = {
	original: ChatToolCall;
	executable: ChatToolCall;
};

export type PreparedToolRound = {
	toolCallsToExecute: ToolCallExecutionPair[];
	handledToolCallDelta: number;
	modelPayloadChars: number;
	toolMessages: FastChatHistoryMessage[];
};

export async function prepareToolRound(params: {
	pendingToolCalls: ChatToolCall[];
	executableToolCalls: ChatToolCall[];
	validationIssues: ToolValidationIssue[];
	blockedRetryCallIdsInRound: Set<string>;
	toolExecutions: FastToolExecution[];
	roundExecutions: FastToolExecution[];
	observeSupervisor: (observation: TurnSupervisorObservation) => Promise<void>;
	onToolResult?: (execution: FastToolExecution) => Promise<void> | void;
}): Promise<PreparedToolRound> {
	const validationIssueByToolCallId = new Map(
		params.validationIssues.map((issue) => [issue.toolCall.id, issue])
	);
	const toolMessages: FastChatHistoryMessage[] = [];
	const toolCallsToExecute: ToolCallExecutionPair[] = [];
	let handledToolCallDelta = 0;
	let modelPayloadChars = 0;

	for (let index = 0; index < params.pendingToolCalls.length; index += 1) {
		const toolCall = params.pendingToolCalls[index];
		if (!toolCall) {
			continue;
		}

		if (params.blockedRetryCallIdsInRound.has(toolCall.id)) {
			const errorMessage =
				'Supervisor blocked this exact write retry because the same tool arguments already failed earlier in the turn. Use corrected arguments, the correct tool for the entity kind, or ask one concise clarifying question.';
			const result: ChatToolResult = {
				tool_call_id: toolCall.id,
				result: null,
				success: false,
				error: errorMessage
			};
			await recordTerminalPreparationResult({
				toolCall,
				result,
				toolExecutions: params.toolExecutions,
				roundExecutions: params.roundExecutions,
				observeSupervisor: params.observeSupervisor,
				onToolResult: params.onToolResult
			});
			const blockedPayload = JSON.stringify({
				error: errorMessage,
				supervisor_recovery: {
					blocked_exact_retry: true
				}
			});
			handledToolCallDelta += 1;
			modelPayloadChars += blockedPayload.length;
			toolMessages.push({
				role: 'tool',
				content: blockedPayload,
				tool_call_id: toolCall.id
			});
			continue;
		}

		const validationIssue = validationIssueByToolCallId.get(toolCall.id);
		const errorMessage = validationIssue
			? `Tool validation failed: ${validationIssue.errors.join(' ')}`
			: null;
		if (errorMessage) {
			const result: ChatToolResult = {
				tool_call_id: toolCall.id,
				result: null,
				success: false,
				error: errorMessage
			};
			await recordTerminalPreparationResult({
				toolCall,
				result,
				toolExecutions: params.toolExecutions,
				roundExecutions: params.roundExecutions,
				observeSupervisor: params.observeSupervisor,
				onToolResult: params.onToolResult
			});

			const validationPayload: Record<string, unknown> = {
				error: errorMessage
			};
			if (validationIssue?.op) {
				validationPayload.op = validationIssue.op;
				validationPayload.help_path = validationIssue.op;
			}
			if (validationIssue?.errors?.length) {
				validationPayload.details = { field_errors: validationIssue.errors };
			}
			const validationToolContent = JSON.stringify(validationPayload);
			handledToolCallDelta += 1;
			modelPayloadChars += validationToolContent.length;
			toolMessages.push({
				role: 'tool',
				content: validationToolContent,
				tool_call_id: toolCall.id
			});
			continue;
		}

		const executable = params.executableToolCalls[index] ?? toolCall;
		toolCallsToExecute.push({ original: toolCall, executable });
	}

	return {
		toolCallsToExecute,
		handledToolCallDelta,
		modelPayloadChars,
		toolMessages
	};
}

async function recordTerminalPreparationResult(params: {
	toolCall: ChatToolCall;
	result: ChatToolResult;
	toolExecutions: FastToolExecution[];
	roundExecutions: FastToolExecution[];
	observeSupervisor: (observation: TurnSupervisorObservation) => Promise<void>;
	onToolResult?: (execution: FastToolExecution) => Promise<void> | void;
}): Promise<void> {
	const execution: FastToolExecution = { toolCall: params.toolCall, result: params.result };
	params.toolExecutions.push(execution);
	params.roundExecutions.push(execution);
	await params.observeSupervisor({
		type: 'tool_result_received',
		toolName: params.toolCall.function.name,
		toolCallId: params.toolCall.id,
		success: false,
		error: params.result.error ?? null,
		resultSummary: summarizeToolResult(params.result)
	});
	if (params.onToolResult) {
		try {
			await params.onToolResult(execution);
		} catch {
			// UI/logging callbacks must not crash tool orchestration.
		}
	}
}

export type RecordedToolExecutionForRound = {
	handledToolCallDelta: number;
	modelPayloadChars: number;
	toolMessage: FastChatHistoryMessage;
};

export async function recordToolExecutionForRound(params: {
	originalToolCall: ChatToolCall;
	execution: FastToolExecution;
	toolExecutions: FastToolExecution[];
	roundExecutions: FastToolExecution[];
	gatewayModeActive: boolean;
	knownEntitiesById: Map<string, KnownEntity>;
	rememberSuccessfulWriteForDedup: (execution: FastToolExecution) => void;
	materializeDirectTools: (toolNames: string[], reason: string) => string[];
	observeSupervisor: (observation: TurnSupervisorObservation) => Promise<void>;
	onToolResult?: (execution: FastToolExecution) => Promise<void> | void;
}): Promise<RecordedToolExecutionForRound> {
	const { originalToolCall, execution } = params;
	const { result, toolCall: executionToolCall } = execution;

	params.toolExecutions.push(execution);
	params.roundExecutions.push(execution);
	params.rememberSuccessfulWriteForDedup(execution);

	const skippedDuplicateWrite = isDuplicateWriteSkippedExecution(execution);
	await params.observeSupervisor({
		type: 'tool_result_received',
		toolName: executionToolCall.function.name,
		toolCallId: originalToolCall.id,
		success: didGatewayExecSucceed(execution),
		skipped: skippedDuplicateWrite,
		error: result.error ?? null,
		resultSummary: summarizeToolResult(result)
	});

	if (params.gatewayModeActive && result.success) {
		params.materializeDirectTools(
			extractGatewayMaterializedToolNames(result.result),
			'Discovery loaded additional tools.'
		);
	}
	if (result.success) {
		rememberKnownEntitiesFromToolResult({
			knownEntitiesById: params.knownEntitiesById,
			toolName: executionToolCall.function.name,
			payload: result.result
		});
	}
	if (params.onToolResult) {
		try {
			await params.onToolResult(execution);
		} catch {
			// UI/logging callbacks must not crash tool orchestration.
		}
	}

	const toolPayload = buildToolPayloadForModel(executionToolCall, result, parseToolArguments);
	const content = JSON.stringify(toolPayload);
	return {
		handledToolCallDelta: 1,
		modelPayloadChars: content.length,
		toolMessage: {
			role: 'tool',
			content,
			tool_call_id: originalToolCall.id
		}
	};
}

export type ToolExecutionDispatchResult = {
	execution: FastToolExecution;
	executedToolCallDelta: number;
};

export async function executeToolCallPair(params: {
	originalToolCall: ChatToolCall;
	toolCall: ChatToolCall;
	getTools: () => ChatToolDefinition[];
	getAllowedToolNames: () => Set<string>;
	allowedToolNamesAtRoundStart: Set<string>;
	gatewayModeActive: boolean;
	validationProjectId: string | null;
	knownEntitiesById: Map<string, KnownEntity>;
	toolExecutor?: (
		toolCall: ChatToolCall,
		availableTools?: ChatToolDefinition[]
	) => Promise<ChatToolResult>;
	materializeDirectTools: (toolNames: string[], reason: string) => string[];
	findDuplicateSuccessfulWrite: (toolCall: ChatToolCall) => FastToolExecution | undefined;
	startToolExecutionHeartbeat: (details: { toolName: string; toolCallId: string }) => () => void;
}): Promise<ToolExecutionDispatchResult> {
	const { originalToolCall, toolCall } = params;
	let result: ChatToolResult;
	let executionToolCall = originalToolCall;
	let executedToolCallDelta = 0;
	const entityKindRepairResult = buildWrongEntityKindRepairResult({
		toolCall: originalToolCall,
		knownEntitiesById: params.knownEntitiesById
	});

	if (entityKindRepairResult) {
		result = entityKindRepairResult;
	} else if (!params.getAllowedToolNames().has(toolCall.function.name)) {
		const dispatch = await dispatchUnavailableToolCall({
			...params,
			originalToolCall,
			toolCall
		});
		result = dispatch.result;
		executionToolCall = dispatch.executionToolCall;
		executedToolCallDelta += dispatch.executedToolCallDelta;
	} else {
		const dispatch = await dispatchAvailableToolCall({
			...params,
			originalToolCall,
			toolCall
		});
		result = dispatch.result;
		executedToolCallDelta += dispatch.executedToolCallDelta;
	}

	return {
		execution: { toolCall: executionToolCall, result },
		executedToolCallDelta
	};
}

type DispatchToolCallParams = Parameters<typeof executeToolCallPair>[0];

type DispatchToolCallResult = {
	result: ChatToolResult;
	executionToolCall: ChatToolCall;
	executedToolCallDelta: number;
};

async function dispatchUnavailableToolCall(
	params: DispatchToolCallParams
): Promise<DispatchToolCallResult> {
	const { originalToolCall, toolCall } = params;
	const requestedName = toolCall.function.name;
	let addedToolNames = params.gatewayModeActive
		? params.materializeDirectTools(
				[requestedName],
				`The tool "${requestedName}" was not preloaded.`
			)
		: [];
	let resolvedOpToolName: string | null = null;
	if (params.gatewayModeActive && addedToolNames.length === 0) {
		const opToolName = getToolRegistry().ops[normalizeGatewayOpName(requestedName)]?.tool_name;
		if (opToolName && opToolName !== requestedName) {
			addedToolNames = params.materializeDirectTools(
				[opToolName],
				`"${requestedName}" is an op reference, not a callable tool.`
			);
			if (addedToolNames.length > 0) {
				resolvedOpToolName = opToolName;
			}
		}
	}

	const materializedExecutableToolName =
		addedToolNames.length === 1 ? (addedToolNames[0] ?? null) : null;
	const executableName = resolvedOpToolName ?? materializedExecutableToolName ?? requestedName;
	const canAutoExecute =
		addedToolNames.length > 0 &&
		params.getAllowedToolNames().has(executableName) &&
		Boolean(params.toolExecutor);
	if (!canAutoExecute) {
		return {
			executionToolCall: originalToolCall,
			executedToolCallDelta: 0,
			result: {
				tool_call_id: originalToolCall.id,
				result: null,
				success: false,
				error:
					addedToolNames.length > 0
						? `Tool "${requestedName}" is now loaded for this turn. Retry with the direct tool and exact arguments.`
						: 'Tool not available in this context'
			}
		};
	}

	const directToolCall: ChatToolCall =
		executableName !== toolCall.function.name
			? {
					...toolCall,
					function: { ...toolCall.function, name: executableName }
				}
			: toolCall;
	const result = await validateOrExecuteDirectToolCall({
		...params,
		originalToolCall,
		executionToolCall: directToolCall
	});
	return {
		...result,
		executionToolCall: directToolCall
	};
}

async function dispatchAvailableToolCall(
	params: DispatchToolCallParams
): Promise<Omit<DispatchToolCallResult, 'executionToolCall'>> {
	const { originalToolCall, toolCall } = params;
	const lateValidationIssues = params.allowedToolNamesAtRoundStart.has(toolCall.function.name)
		? []
		: validateToolCalls([toolCall], params.getTools(), {
				projectId: params.validationProjectId
			});
	if (lateValidationIssues.length > 0) {
		return {
			executedToolCallDelta: 0,
			result: {
				tool_call_id: originalToolCall.id,
				result: null,
				success: false,
				error: `Tool validation failed: ${lateValidationIssues
					.flatMap((issue) => issue.errors)
					.join(' ')}`
			}
		};
	}
	return validateOrExecuteDirectToolCall({
		...params,
		originalToolCall,
		executionToolCall: toolCall,
		skipValidation: true
	});
}

async function validateOrExecuteDirectToolCall(params: {
	originalToolCall: ChatToolCall;
	executionToolCall: ChatToolCall;
	getTools: () => ChatToolDefinition[];
	validationProjectId: string | null;
	toolExecutor?: (
		toolCall: ChatToolCall,
		availableTools?: ChatToolDefinition[]
	) => Promise<ChatToolResult>;
	findDuplicateSuccessfulWrite: (toolCall: ChatToolCall) => FastToolExecution | undefined;
	startToolExecutionHeartbeat: (details: { toolName: string; toolCallId: string }) => () => void;
	skipValidation?: boolean;
}): Promise<Omit<DispatchToolCallResult, 'executionToolCall'>> {
	if (!params.skipValidation) {
		const validationIssues = validateToolCalls([params.executionToolCall], params.getTools(), {
			projectId: params.validationProjectId
		});
		if (validationIssues.length > 0) {
			return {
				executedToolCallDelta: 0,
				result: {
					tool_call_id: params.originalToolCall.id,
					result: null,
					success: false,
					error: `Tool validation failed: ${validationIssues
						.flatMap((issue) => issue.errors)
						.join(' ')}`
				}
			};
		}
	}

	const duplicateWrite = params.findDuplicateSuccessfulWrite(params.executionToolCall);
	if (duplicateWrite) {
		return {
			executedToolCallDelta: 0,
			result: buildDuplicateWriteSkippedResult({
				originalToolCall: params.originalToolCall,
				executableToolCall: params.executionToolCall,
				priorExecution: duplicateWrite
			})
		};
	}

	const clearToolStatusTimer = params.startToolExecutionHeartbeat({
		toolName: params.executionToolCall.function.name,
		toolCallId: params.originalToolCall.id
	});
	try {
		const result = await params.toolExecutor!(params.executionToolCall, params.getTools());
		return {
			executedToolCallDelta: 1,
			result:
				result.tool_call_id === params.originalToolCall.id
					? result
					: { ...result, tool_call_id: params.originalToolCall.id }
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Tool execution failed';
		return {
			executedToolCallDelta: 1,
			result: {
				tool_call_id: params.originalToolCall.id,
				result: null,
				success: false,
				error: message
			}
		};
	} finally {
		clearToolStatusTimer();
	}
}

function buildDuplicateWriteSkippedResult(params: {
	originalToolCall: ChatToolCall;
	executableToolCall: ChatToolCall;
	priorExecution: FastToolExecution;
}): ChatToolResult {
	const previousResultSummary = buildDuplicateWritePreviousResultSummary(params.priorExecution);
	return {
		tool_call_id: params.originalToolCall.id,
		success: true,
		result: {
			ok: true,
			status: 'duplicate_write_skipped',
			skipped_duplicate_write: true,
			message:
				'This exact write already succeeded earlier in the turn, so the duplicate tool call was not executed again.',
			tool_name: params.executableToolCall.function.name,
			previous_tool_call_id:
				params.priorExecution.result.tool_call_id ?? params.priorExecution.toolCall.id,
			previous_tool_name: params.priorExecution.toolCall.function.name,
			previous_result_summary: previousResultSummary
		}
	};
}

function buildDuplicateWritePreviousResultSummary(
	priorExecution: FastToolExecution
): Record<string, unknown> {
	const payload = priorExecution.result.result;
	const gatewayPayload = extractGatewayExecResultData(payload);
	const resultPayload = gatewayPayload?.result ?? payload;
	const summary: Record<string, unknown> = {
		tool_call_id: priorExecution.result.tool_call_id ?? priorExecution.toolCall.id,
		tool_name: priorExecution.toolCall.function.name,
		success: priorExecution.result.success === true
	};
	const status = readRecordString(resultPayload, 'status') ?? readRecordString(payload, 'status');
	if (status) {
		summary.status = status;
	}
	const message =
		readRecordString(resultPayload, 'message') ?? readRecordString(payload, 'message');
	if (message) {
		summary.message = truncateDuplicateSummaryText(message);
	}
	const entity =
		extractDuplicateWriteEntitySummary(resultPayload) ??
		extractDuplicateWriteEntitySummary(payload);
	if (entity) {
		summary.entity = entity;
	}
	return summary;
}

const DUPLICATE_WRITE_ENTITY_KEYS = [
	'project',
	'task',
	'document',
	'goal',
	'plan',
	'milestone',
	'risk',
	'entity'
];

function extractDuplicateWriteEntitySummary(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const directSummary = buildDuplicateWriteEntitySummary(record);
	if (directSummary) return directSummary;

	for (const key of DUPLICATE_WRITE_ENTITY_KEYS) {
		const nested = record[key];
		if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;
		const nestedSummary = buildDuplicateWriteEntitySummary(
			nested as Record<string, unknown>,
			key === 'entity' ? undefined : key
		);
		if (nestedSummary) return nestedSummary;
	}
	return null;
}

function buildDuplicateWriteEntitySummary(
	record: Record<string, unknown>,
	defaultKind?: string
): Record<string, unknown> | null {
	const id = readStringMeta(record.id);
	if (!id) return null;
	const summary: Record<string, unknown> = { id };
	const kind =
		readStringMeta(record.type) ??
		readStringMeta(record.entity_type) ??
		readStringMeta(record.kind);
	if (kind ?? defaultKind) {
		summary.type = kind ?? defaultKind;
	}
	const title = readStringMeta(record.title) ?? readStringMeta(record.name);
	if (title) {
		summary.title = title;
	}
	const stateKey = readStringMeta(record.state_key) ?? readStringMeta(record.status);
	if (stateKey) {
		summary.state_key = stateKey;
	}
	return summary;
}

function readRecordString(value: unknown, key: string): string | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	return readStringMeta((value as Record<string, unknown>)[key]);
}

function readStringMeta(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function truncateDuplicateSummaryText(value: string): string {
	return value.length > 240 ? `${value.slice(0, 237)}...` : value;
}
