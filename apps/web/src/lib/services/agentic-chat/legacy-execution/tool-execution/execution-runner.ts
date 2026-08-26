// apps/web/src/lib/services/agentic-chat/legacy-execution/tool-execution/execution-runner.ts
import { dev } from '$app/environment';
import { createLogger } from '$lib/utils/logger';
import type { ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';
import { TOOL_METADATA } from '@buildos/agentic-chat-runtime/catalog';
import type {
	ServiceContext,
	ToolExecutionResult,
	ToolExecutorFunction,
	ToolExecutorResponse
} from '../../shared/types';
import type { ToolArguments } from './argument-values';
import { resolveToolCall } from './call-decoder';
import { executeGatewayTool, isGatewayToolName } from './gateway-executor';
import {
	adaptCoreToolExecutionResult,
	isToolCancellationResult,
	normalizeToolExecutionError
} from './result-adapter';
import { validateToolArguments } from './schema-validator';
import { applyDecodedToolAdapter } from './tool-argument-adapters';

const logger = createLogger('ToolExecutionService');

export type ExecutionLane = 'core' | 'gateway' | 'virtual';
export type TimeoutClassification = 'runner_only' | 'message_compatible';

interface LaneExecutionBase {
	lane: ExecutionLane;
	durationMs: number;
	timeoutMs: number;
}

export type LaneExecutionResult<T> =
	| (LaneExecutionBase & { ok: true; value: T })
	| (LaneExecutionBase & {
			ok: false;
			result: ToolExecutionResult;
			error: unknown;
	  });

export class ToolExecutionTimeoutError extends Error {
	constructor(readonly timeoutMs: number) {
		super(`Tool execution timeout after ${timeoutMs}ms`);
		this.name = 'ToolExecutionTimeoutError';
	}
}

export async function runToolExecutionLane<T>({
	lane,
	toolName,
	toolCallId,
	timeoutMs,
	abortSignal,
	run,
	normalizeError,
	timeoutClassification = 'message_compatible'
}: {
	lane: ExecutionLane;
	toolName: string;
	toolCallId: string;
	timeoutMs: number;
	abortSignal?: AbortSignal;
	run: (abortSignal?: AbortSignal) => Promise<T>;
	normalizeError: (error: unknown) => string;
	timeoutClassification?: TimeoutClassification;
}): Promise<LaneExecutionResult<T>> {
	const startedAt = now();
	try {
		const value = await runWithAbortableTimeout({
			timeoutMs,
			abortSignal,
			run
		});
		return { ok: true, value, lane, durationMs: now() - startedAt, timeoutMs };
	} catch (error) {
		const durationMs = now() - startedAt;
		if (isAbortError(error)) {
			return {
				ok: false,
				lane,
				durationMs,
				timeoutMs,
				error,
				result: {
					success: false,
					error: 'Operation cancelled',
					errorType: 'cancelled',
					toolName,
					toolCallId
				}
			};
		}

		const normalizedError = normalizeError(error);
		const isTimeout =
			error instanceof ToolExecutionTimeoutError ||
			(timeoutClassification === 'message_compatible' &&
				(normalizedError.includes('timed out') ||
					(error instanceof Error && error.message.includes('timeout'))));
		return {
			ok: false,
			lane,
			durationMs,
			timeoutMs,
			error,
			result: {
				success: false,
				error: normalizedError,
				errorType: isTimeout ? 'timeout' : 'execution_error',
				toolName,
				toolCallId
			}
		};
	}
}

export interface ToolDispatchResult {
	lane: ExecutionLane;
	result: ToolExecutionResult;
	timeoutMs?: number;
	cleanedCoreData?: unknown;
}

export async function dispatchToolExecution({
	toolCall,
	toolName,
	args,
	context,
	availableTools,
	validationTools,
	virtualHandler,
	toolExecutor,
	timeoutOverride,
	abortSignal,
	executeGateway = executeGatewayTool
}: {
	toolCall: ChatToolCall;
	toolName: string;
	args: ToolArguments;
	context: ServiceContext;
	availableTools: ChatToolDefinition[];
	validationTools: ChatToolDefinition[] | undefined;
	virtualHandler?: (params: {
		toolCall: ChatToolCall;
		toolName: string;
		args: ToolArguments;
		context: ServiceContext;
		availableTools: ChatToolDefinition[];
	}) => Promise<ToolExecutionResult>;
	toolExecutor: ToolExecutorFunction;
	timeoutOverride?: number;
	abortSignal?: AbortSignal;
	executeGateway?: typeof executeGatewayTool;
}): Promise<ToolDispatchResult> {
	if (isGatewayToolName(toolName)) {
		const invalid = validationFailure(toolName, args, validationTools, toolCall.id);
		if (invalid) return { lane: 'gateway', result: invalid };

		const timeoutMs = resolveToolTimeoutMs(toolName, timeoutOverride);
		const execution = await runToolExecutionLane({
			lane: 'gateway',
			toolName,
			toolCallId: toolCall.id,
			timeoutMs,
			abortSignal,
			run: () => executeGateway(toolName, args),
			normalizeError: (error) => normalizeToolExecutionError(error, toolName)
		});
		return {
			lane: 'gateway',
			timeoutMs,
			result: execution.ok
				? { ...execution.value, toolName, toolCallId: toolCall.id }
				: execution.result
		};
	}

	if (virtualHandler) {
		const timeoutMs = resolveToolTimeoutMs(toolName, timeoutOverride);
		const execution = await runToolExecutionLane<ToolExecutionResult>({
			lane: 'virtual',
			toolName,
			toolCallId: toolCall.id,
			timeoutMs,
			abortSignal,
			timeoutClassification: 'runner_only',
			run: (downstreamAbortSignal) =>
				virtualHandler({
					toolCall,
					toolName,
					args,
					context: contextWithAbortSignal(context, downstreamAbortSignal),
					availableTools
				}),
			normalizeError: (error) => (error instanceof Error ? error.message : String(error))
		});
		if (!execution.ok) {
			logger.error('[ToolExecutionService] Virtual tool execution failed', {
				toolName,
				error: execution.error
			});
		}
		return {
			lane: 'virtual',
			timeoutMs,
			result: execution.ok
				? { ...execution.value, toolName, toolCallId: toolCall.id }
				: execution.result
		};
	}

	const invalid = validationFailure(toolName, args, validationTools, toolCall.id);
	if (invalid) return { lane: 'core', result: invalid };

	const timeoutMs = resolveToolTimeoutMs(toolName, timeoutOverride);
	const execution = await runToolExecutionLane<ToolExecutorResponse>({
		lane: 'core',
		toolName,
		toolCallId: toolCall.id,
		timeoutMs,
		abortSignal,
		run: (downstreamAbortSignal) =>
			toolExecutor(toolName, args, contextWithAbortSignal(context, downstreamAbortSignal)),
		normalizeError: (error) => normalizeToolExecutionError(error, toolName)
	});
	if (!execution.ok) {
		if (execution.result.errorType !== 'cancelled') {
			logger.error('[ToolExecutionService] Tool execution failed', {
				toolName,
				error: execution.error instanceof Error ? execution.error.message : execution.error
			});
		}
		return { lane: 'core', timeoutMs, result: execution.result };
	}

	const adapted = adaptCoreToolExecutionResult(execution.value, {
		toolName,
		toolCallId: toolCall.id
	});
	return {
		lane: 'core',
		timeoutMs,
		result: adapted.result,
		cleanedCoreData: adapted.cleanedData
	};
}

function validationFailure(
	toolName: string,
	args: ToolArguments,
	availableTools: ChatToolDefinition[] | undefined,
	toolCallId: string
): ToolExecutionResult | undefined {
	const validation = validateToolArguments(
		toolName,
		applyDecodedToolAdapter(toolName, args),
		availableTools
	);
	if (validation.isValid) return undefined;
	return {
		success: false,
		error: validation.errors.join('; '),
		errorType: validation.errors.some((error) => error.startsWith('Unknown tool:'))
			? 'tool_not_loaded'
			: 'validation_error',
		toolName,
		toolCallId
	};
}

export function contextWithAbortSignal(
	context: ServiceContext,
	abortSignal: AbortSignal | undefined
): ServiceContext {
	return abortSignal ? { ...context, abortSignal } : context;
}

export function resolveToolTimeoutMs(toolName: string, override?: number): number {
	if (typeof override === 'number' && Number.isFinite(override)) return override;
	const metadataTimeout = TOOL_METADATA[toolName]?.timeoutMs;
	return typeof metadataTimeout === 'number' && Number.isFinite(metadataTimeout)
		? metadataTimeout
		: 30_000;
}

export async function waitForRetryDelay(ms: number, abortSignal?: AbortSignal): Promise<void> {
	if (!Number.isFinite(ms) || ms <= 0) return;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const delay = new Promise<void>((resolve) => {
		timeoutId = setTimeout(resolve, ms);
	});
	try {
		if (abortSignal) {
			await raceWithAbort(delay, abortSignal);
		} else {
			await delay;
		}
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
	}
}

type ExecuteToolAttempt = (toolCall: ChatToolCall) => Promise<ToolExecutionResult>;

export async function runToolCallsSequentially({
	toolCalls,
	executeTool,
	abortSignal
}: {
	toolCalls: ChatToolCall[];
	executeTool: ExecuteToolAttempt;
	abortSignal?: AbortSignal;
}): Promise<ToolExecutionResult[]> {
	if (dev) {
		logger.debug('Executing multiple tools', {
			count: toolCalls.length,
			tools: toolCalls.map((call) => resolveToolCall(call).name || 'unknown')
		});
	}

	const results: ToolExecutionResult[] = [];
	for (const toolCall of toolCalls) {
		if (abortSignal?.aborted) {
			results.push(createSequentialCancelledResult(toolCall));
			break;
		}
		results.push(await executeTool(toolCall));
		if (abortSignal?.aborted) break;
	}
	return results;
}

export async function runToolCallWithRetry({
	toolCall,
	executeTool,
	retryCount = 0,
	retryDelay = 1_000,
	abortSignal
}: {
	toolCall: ChatToolCall;
	executeTool: ExecuteToolAttempt;
	retryCount?: number;
	retryDelay?: number;
	abortSignal?: AbortSignal;
}): Promise<ToolExecutionResult> {
	const { name: toolName } = resolveToolCall(toolCall);
	const cancelledResult = (): ToolExecutionResult => ({
		success: false,
		error: 'Operation cancelled',
		errorType: 'cancelled',
		toolName: toolName || 'unknown',
		toolCallId: toolCall.id
	});
	const waitBeforeNextAttempt = async (attempt: number): Promise<ToolExecutionResult | null> => {
		if (attempt >= retryCount) return null;
		try {
			await waitForRetryDelay(retryDelay * (attempt + 1), abortSignal);
			return null;
		} catch (error) {
			if (isAbortError(error)) return cancelledResult();
			throw error;
		}
	};

	let lastError: Error | undefined;
	for (let attempt = 0; attempt <= retryCount; attempt++) {
		if (abortSignal?.aborted) return cancelledResult();
		try {
			const result = await executeTool(toolCall);
			const errorString =
				typeof result.error === 'string' ? result.error : String(result.error);
			if (
				result.success ||
				isToolCancellationResult(result) ||
				errorString.includes('Missing required')
			) {
				return result;
			}

			lastError = new Error(errorString || 'Unknown error');
			const cancelled = await waitBeforeNextAttempt(attempt);
			if (cancelled) return cancelled;
		} catch (error) {
			if (isAbortError(error)) return cancelledResult();
			lastError = error instanceof Error ? error : new Error(String(error));
			const cancelled = await waitBeforeNextAttempt(attempt);
			if (cancelled) return cancelled;
		}
	}

	return {
		success: false,
		error: `Failed after ${retryCount + 1} attempts: ${lastError?.message || 'Unknown error'}`,
		toolName: toolName || 'unknown',
		toolCallId: toolCall.id
	};
}

export async function runToolCallsWithConcurrency({
	toolCalls,
	executeTool,
	maxConcurrency
}: {
	toolCalls: ChatToolCall[];
	executeTool: ExecuteToolAttempt;
	maxConcurrency: number;
}): Promise<ToolExecutionResult[]> {
	const resultsMap = new Map<string, ToolExecutionResult>();
	const executing = new Set<Promise<ToolExecutionResult>>();

	for (const toolCall of toolCalls) {
		if (executing.size >= maxConcurrency) await Promise.race(executing);

		const promise = executeTool(toolCall).then((result) => {
			executing.delete(promise);
			resultsMap.set(result.toolCallId, result);
			return result;
		});
		executing.add(promise);
	}

	await Promise.all(executing);
	return toolCalls.map((call) => {
		const result = resultsMap.get(call.id);
		if (result) return result;

		logger.error('[ToolExecutionService] Missing result for tool call', {
			toolCallId: call.id
		});
		return {
			success: false,
			error: `No result found for tool call ${call.id}`,
			toolName: call.function?.name || 'unknown',
			toolCallId: call.id
		};
	});
}

function createSequentialCancelledResult(toolCall: ChatToolCall): ToolExecutionResult {
	const { name } = resolveToolCall(toolCall);
	return {
		success: false,
		error: 'Operation cancelled',
		errorType: 'cancelled',
		toolName: name ?? 'unknown',
		toolCallId: toolCall.id
	};
}

async function runWithAbortableTimeout<T>({
	timeoutMs,
	abortSignal,
	run
}: {
	timeoutMs: number;
	abortSignal?: AbortSignal;
	run: (abortSignal?: AbortSignal) => Promise<T>;
}): Promise<T> {
	const hasTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
	if (!hasTimeout && !abortSignal) return run(undefined);
	if (abortSignal?.aborted) throw new DOMException('Tool execution aborted', 'AbortError');

	const controller = new AbortController();
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let removeAbortListener: (() => void) | undefined;
	let timedOut = false;
	const workPromise = Promise.resolve().then(() => run(controller.signal));
	const cancellationPromise = new Promise<never>((_, reject) => {
		if (hasTimeout) {
			timeoutId = setTimeout(() => {
				timedOut = true;
				const error = new ToolExecutionTimeoutError(timeoutMs);
				if (!controller.signal.aborted) controller.abort(error);
				reject(error);
			}, timeoutMs);
		}

		if (abortSignal) {
			const onAbort = () => {
				if (!controller.signal.aborted) controller.abort(abortSignal.reason);
				reject(new DOMException('Tool execution aborted', 'AbortError'));
			};
			abortSignal.addEventListener('abort', onAbort, { once: true });
			removeAbortListener = () => abortSignal.removeEventListener('abort', onAbort);
		}
	});

	try {
		return await Promise.race([workPromise, cancellationPromise]);
	} catch (error) {
		if (timedOut && isAbortError(error)) throw new ToolExecutionTimeoutError(timeoutMs);
		throw error;
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
		removeAbortListener?.();
		if (controller.signal.aborted) void workPromise.catch(() => undefined);
	}
}

async function raceWithAbort<T>(promise: Promise<T>, abortSignal: AbortSignal): Promise<T> {
	if (abortSignal.aborted) {
		void promise.catch(() => undefined);
		throw new DOMException('Tool execution aborted', 'AbortError');
	}

	let abortListener: (() => void) | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				const onAbort = () =>
					reject(new DOMException('Tool execution aborted', 'AbortError'));
				abortSignal.addEventListener('abort', onAbort, { once: true });
				abortListener = () => abortSignal.removeEventListener('abort', onAbort);
			})
		]);
	} finally {
		abortListener?.();
	}
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}

function now(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
