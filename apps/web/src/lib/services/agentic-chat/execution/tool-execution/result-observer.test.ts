// apps/web/src/lib/services/agentic-chat/execution/tool-execution/result-observer.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ServiceContext, ToolExecutionResult } from '../../shared/types';
import { createToolResultFinalizer } from './result-observer';

const context: ServiceContext = {
	sessionId: 'session_1',
	userId: 'user_1',
	contextType: 'project',
	entityId: 'project_1',
	conversationHistory: []
};

describe('tool result observer', () => {
	it('returns the original result and emits telemetry exactly once', () => {
		const telemetryHook = vi.fn();
		const finalize = createToolResultFinalizer({
			toolName: 'list_onto_tasks',
			virtual: false,
			context,
			telemetryHook
		});
		const result: ToolExecutionResult = {
			success: true,
			data: { tasks: [] },
			toolName: 'list_onto_tasks',
			toolCallId: 'call_1'
		};

		expect(finalize(result)).toBe(result);
		expect(telemetryHook).toHaveBeenCalledTimes(1);
		expect(telemetryHook).toHaveBeenCalledWith(result, {
			toolName: 'list_onto_tasks',
			durationMs: expect.any(Number),
			virtual: false
		});
	});

	it('swallows synchronous and asynchronous telemetry failures', async () => {
		const result: ToolExecutionResult = {
			success: true,
			toolName: 'list_onto_tasks',
			toolCallId: 'call_telemetry'
		};
		const synchronous = createToolResultFinalizer({
			toolName: result.toolName,
			virtual: false,
			context,
			telemetryHook: () => {
				throw new Error('sync telemetry failure');
			}
		});
		const asynchronousHook = vi.fn().mockRejectedValue(new Error('async telemetry failure'));
		const asynchronous = createToolResultFinalizer({
			toolName: result.toolName,
			virtual: false,
			context,
			telemetryHook: asynchronousHook
		});

		expect(synchronous(result)).toBe(result);
		expect(asynchronous(result)).toBe(result);
		await vi.waitFor(() => expect(asynchronousHook).toHaveBeenCalledTimes(1));
	});

	it('sends one sanitized non-cancellation failure to error logging', () => {
		const logError = vi.fn().mockResolvedValue(null);
		const finalize = createToolResultFinalizer({
			toolName: 'create_onto_task',
			virtual: false,
			context,
			errorLogger: { logError }
		});
		const result: ToolExecutionResult = {
			success: false,
			error: 'Database failed',
			errorType: 'execution_error',
			toolName: 'create_onto_task',
			toolCallId: 'call_error'
		};

		expect(
			finalize(result, {
				timeoutMs: 12_000,
				args: {
					title: 'Launch plan',
					content: 'private task details',
					api_key: 'sk-proj-12345678901234567890',
					owner: 'person@example.com'
				}
			})
		).toBe(result);
		expect(logError).toHaveBeenCalledTimes(1);
		expect(logError).toHaveBeenCalledWith(
			'Database failed',
			expect.objectContaining({
				userId: 'user_1',
				projectId: 'project_1',
				operationType: 'tool_execution',
				operationPayload: {
					title: 'Launch plan',
					content: '[redacted]',
					api_key: '[redacted]',
					owner: '[redacted-email]'
				},
				metadata: expect.objectContaining({
					toolName: 'create_onto_task',
					toolCallId: 'call_error',
					sessionId: 'session_1',
					errorType: 'execution_error',
					virtual: false,
					timeoutMs: 12_000,
					durationMs: expect.any(Number),
					args: {
						title: 'Launch plan',
						content: '[redacted]',
						api_key: '[redacted]',
						owner: '[redacted-email]'
					},
					argsSummary: {
						argCount: 4,
						argKeys: ['title', 'content', 'api_key', 'owner']
					}
				})
			})
		);
	});

	it.each([
		{ errorType: 'cancelled' as const, error: 'anything' },
		{ error: ' Operation cancelled ' },
		{ error: 'Operation canceled' }
	])('never error-logs cancellation result %#', (failure) => {
		const telemetryHook = vi.fn();
		const logError = vi.fn().mockResolvedValue(null);
		const finalize = createToolResultFinalizer({
			toolName: 'list_onto_tasks',
			virtual: false,
			context,
			telemetryHook,
			errorLogger: { logError }
		});

		finalize({
			success: false,
			...failure,
			toolName: 'list_onto_tasks',
			toolCallId: 'call_cancelled'
		});
		expect(telemetryHook).toHaveBeenCalledTimes(1);
		expect(logError).not.toHaveBeenCalled();
	});

	it('records bounded project-creation argument shape without values', () => {
		const logError = vi.fn().mockResolvedValue(null);
		const finalize = createToolResultFinalizer({
			toolName: 'create_onto_project',
			virtual: false,
			context,
			errorLogger: { logError }
		});
		const args = Object.fromEntries(
			Array.from({ length: 14 }, (_, index) => [`field_${index}`, index])
		);
		Object.assign(args, { project: {}, entities: [], relationships: [], clarifications: [] });

		finalize(
			{
				success: false,
				error: 'Invalid project',
				toolName: 'create_onto_project',
				toolCallId: 'call_project'
			},
			{ args }
		);

		const logContext = logError.mock.calls[0]?.[1];
		expect(logContext?.metadata?.argsSummary).toEqual({
			argCount: 18,
			argKeys: Array.from({ length: 12 }, (_, index) => `field_${index}`),
			argKeysTruncated: 6,
			hasProject: true,
			hasEntities: true,
			hasRelationships: true,
			hasClarifications: true
		});
	});
});
