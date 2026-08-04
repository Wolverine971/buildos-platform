import { TOOL_METADATA } from '../../tools/core/definitions';
import type { ServiceContext, ToolExecutionResult } from '../../shared/types';

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
