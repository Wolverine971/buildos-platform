import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServiceContext } from '../../shared/types';
import {
	contextWithAbortSignal,
	resolveToolTimeoutMs,
	runToolExecutionLane,
	ToolExecutionTimeoutError,
	waitForRetryDelay
} from './execution-runner';

const normalizeError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

describe('tool execution runner', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns the lane value and execution metadata on success', async () => {
		const result = await runToolExecutionLane({
			lane: 'core',
			toolName: 'list_onto_tasks',
			toolCallId: 'call_success',
			timeoutMs: 0,
			run: async (abortSignal) => {
				expect(abortSignal).toBeUndefined();
				return { tasks: [] };
			},
			normalizeError
		});

		expect(result).toMatchObject({
			ok: true,
			lane: 'core',
			timeoutMs: 0,
			value: { tasks: [] }
		});
		expect(result.durationMs).toBeGreaterThanOrEqual(0);
	});

	it('aborts downstream work and returns the standard timeout envelope', async () => {
		vi.useFakeTimers();
		let downstreamSignal: AbortSignal | undefined;
		const execution = runToolExecutionLane({
			lane: 'virtual',
			toolName: 'virtual_search',
			toolCallId: 'call_timeout',
			timeoutMs: 25,
			run: (abortSignal) => {
				downstreamSignal = abortSignal;
				return new Promise<never>((_, reject) => {
					abortSignal?.addEventListener(
						'abort',
						() => reject(new DOMException('Virtual tool aborted', 'AbortError')),
						{ once: true }
					);
				});
			},
			normalizeError,
			timeoutClassification: 'runner_only'
		});

		await vi.advanceTimersByTimeAsync(25);
		const result = await execution;

		expect(downstreamSignal?.aborted).toBe(true);
		expect(result).toMatchObject({
			ok: false,
			lane: 'virtual',
			timeoutMs: 25,
			result: {
				success: false,
				error: 'Tool execution timeout after 25ms',
				errorType: 'timeout',
				toolName: 'virtual_search',
				toolCallId: 'call_timeout'
			}
		});
		if (!result.ok) expect(result.error).toBeInstanceOf(ToolExecutionTimeoutError);
	});

	it('keeps a late downstream rejection observed after returning a timeout', async () => {
		vi.useFakeTimers();
		let rejectWork: ((error: Error) => void) | undefined;
		const execution = runToolExecutionLane({
			lane: 'gateway',
			toolName: 'tool_search',
			toolCallId: 'call_late_rejection',
			timeoutMs: 10,
			run: () =>
				new Promise<never>((_, reject) => {
					rejectWork = reject;
				}),
			normalizeError
		});

		await vi.advanceTimersByTimeAsync(10);
		await expect(execution).resolves.toMatchObject({
			ok: false,
			result: { errorType: 'timeout' }
		});
		rejectWork?.(new Error('late gateway failure'));
		await Promise.resolve();
	});

	it('propagates caller cancellation and returns the standard cancelled envelope', async () => {
		const controller = new AbortController();
		let downstreamSignal: AbortSignal | undefined;
		const execution = runToolExecutionLane({
			lane: 'gateway',
			toolName: 'tool_search',
			toolCallId: 'call_cancelled',
			timeoutMs: 30_000,
			abortSignal: controller.signal,
			run: async (abortSignal) => {
				downstreamSignal = abortSignal;
				return new Promise<never>(() => undefined);
			},
			normalizeError
		});

		controller.abort('caller stopped');
		const result = await execution;

		expect(downstreamSignal?.aborted).toBe(true);
		expect(result).toMatchObject({
			ok: false,
			result: {
				success: false,
				error: 'Operation cancelled',
				errorType: 'cancelled',
				toolName: 'tool_search',
				toolCallId: 'call_cancelled'
			}
		});
	});

	it('does not start work when the caller signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		const run = vi.fn();

		const result = await runToolExecutionLane({
			lane: 'core',
			toolName: 'list_onto_tasks',
			toolCallId: 'call_preaborted',
			timeoutMs: 30_000,
			abortSignal: controller.signal,
			run,
			normalizeError
		});

		expect(run).not.toHaveBeenCalled();
		expect(result).toMatchObject({ ok: false, result: { errorType: 'cancelled' } });
	});

	it('preserves lane-specific classification of handler timeout messages', async () => {
		const execute = (timeoutClassification: 'message_compatible' | 'runner_only') =>
			runToolExecutionLane({
				lane: timeoutClassification === 'runner_only' ? 'virtual' : 'core',
				toolName: 'example_tool',
				toolCallId: `call_${timeoutClassification}`,
				timeoutMs: 0,
				timeoutClassification,
				run: async () => {
					throw new Error('dependency timeout');
				},
				normalizeError
			});

		const [compatible, runnerOnly] = await Promise.all([
			execute('message_compatible'),
			execute('runner_only')
		]);
		expect(compatible).toMatchObject({ ok: false, result: { errorType: 'timeout' } });
		expect(runnerOnly).toMatchObject({
			ok: false,
			result: { errorType: 'execution_error' }
		});
	});

	it('adds a downstream abort signal without mutating the service context', () => {
		const context: ServiceContext = {
			sessionId: 'session_1',
			userId: 'user_1',
			contextType: 'project',
			conversationHistory: []
		};
		const signal = new AbortController().signal;

		expect(contextWithAbortSignal(context, undefined)).toBe(context);
		const withSignal = contextWithAbortSignal(context, signal);
		expect(withSignal).not.toBe(context);
		expect(withSignal).toEqual({ ...context, abortSignal: signal });
		expect(context.abortSignal).toBeUndefined();
	});

	it('resolves timeout overrides, metadata, and the default in order', () => {
		expect(resolveToolTimeoutMs('search_all_projects', 123)).toBe(123);
		expect(resolveToolTimeoutMs('search_all_projects')).toBe(45_000);
		expect(resolveToolTimeoutMs('unknown_tool')).toBe(30_000);
	});

	it('makes retry delays immediately abortable', async () => {
		const controller = new AbortController();
		controller.abort();

		await expect(waitForRetryDelay(10_000, controller.signal)).rejects.toMatchObject({
			name: 'AbortError'
		});
		await expect(waitForRetryDelay(0)).resolves.toBeUndefined();
	});
});
