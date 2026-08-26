// apps/web/src/lib/services/agentic-chat/legacy-execution/tool-execution/execution-orchestration.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall } from '@buildos/shared-types';
import {
	runToolCallsSequentially,
	runToolCallsWithConcurrency,
	runToolCallWithRetry
} from './execution-runner';

const call = (id: string): ChatToolCall => ({
	id,
	name: `tool_${id}`,
	arguments: {}
});

const success = (toolCall: ChatToolCall) => ({
	success: true,
	data: { id: toolCall.id },
	toolName: toolCall.name ?? 'unknown',
	toolCallId: toolCall.id
});

describe('tool execution outer orchestration', () => {
	it('runs sequential calls in order', async () => {
		const order: string[] = [];
		const executeTool = vi.fn(async (toolCall: ChatToolCall) => {
			order.push(toolCall.id);
			return success(toolCall);
		});

		const results = await runToolCallsSequentially({
			toolCalls: [call('1'), call('2'), call('3')],
			executeTool
		});

		expect(order).toEqual(['1', '2', '3']);
		expect(results.map((result) => result.toolCallId)).toEqual(['1', '2', '3']);
	});

	it('returns one cancellation and starts no work when sequential execution is pre-aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		const executeTool = vi.fn();

		await expect(
			runToolCallsSequentially({
				toolCalls: [call('1'), call('2')],
				executeTool,
				abortSignal: controller.signal
			})
		).resolves.toEqual([
			{
				success: false,
				error: 'Operation cancelled',
				errorType: 'cancelled',
				toolName: 'tool_1',
				toolCallId: '1'
			}
		]);
		expect(executeTool).not.toHaveBeenCalled();
	});

	it('retries explicit failures and returns the successful attempt', async () => {
		const executeTool = vi
			.fn()
			.mockResolvedValueOnce({
				success: false,
				error: 'temporary failure',
				toolName: 'tool_1',
				toolCallId: '1'
			})
			.mockResolvedValueOnce(success(call('1')));

		await expect(
			runToolCallWithRetry({
				toolCall: call('1'),
				executeTool,
				retryCount: 2,
				retryDelay: 0
			})
		).resolves.toMatchObject({ success: true, toolCallId: '1' });
		expect(executeTool).toHaveBeenCalledTimes(2);
	});

	it.each([
		{ error: 'Missing required parameter: title' },
		{ error: 'Operation cancelled' },
		{ error: 'anything', errorType: 'cancelled' as const }
	])('does not retry terminal result %#', async (terminal) => {
		const executeTool = vi.fn().mockResolvedValue({
			success: false,
			...terminal,
			toolName: 'tool_1',
			toolCallId: '1'
		});

		await runToolCallWithRetry({
			toolCall: call('1'),
			executeTool,
			retryCount: 2,
			retryDelay: 0
		});
		expect(executeTool).toHaveBeenCalledTimes(1);
	});

	it('returns the legacy exhausted-retry envelope', async () => {
		const executeTool = vi.fn().mockRejectedValue(new Error('still broken'));

		await expect(
			runToolCallWithRetry({
				toolCall: call('1'),
				executeTool,
				retryCount: 1,
				retryDelay: 0
			})
		).resolves.toEqual({
			success: false,
			error: 'Failed after 2 attempts: still broken',
			toolName: 'tool_1',
			toolCallId: '1'
		});
		expect(executeTool).toHaveBeenCalledTimes(2);
	});

	it('bounds concurrency and restores input result order', async () => {
		let active = 0;
		let maxActive = 0;
		const executeTool = vi.fn(async (toolCall: ChatToolCall) => {
			active += 1;
			maxActive = Math.max(maxActive, active);
			await new Promise((resolve) => setTimeout(resolve, toolCall.id === '1' ? 15 : 1));
			active -= 1;
			return success(toolCall);
		});

		const results = await runToolCallsWithConcurrency({
			toolCalls: [call('1'), call('2'), call('3')],
			executeTool,
			maxConcurrency: 2
		});

		expect(maxActive).toBe(2);
		expect(results.map((result) => result.toolCallId)).toEqual(['1', '2', '3']);
	});

	it('preserves the defensive missing-result envelope', async () => {
		await expect(
			runToolCallsWithConcurrency({
				toolCalls: [call('1')],
				executeTool: async () => ({
					success: true,
					toolName: 'different_tool',
					toolCallId: 'different_id'
				}),
				maxConcurrency: 1
			})
		).resolves.toEqual([
			{
				success: false,
				error: 'No result found for tool call 1',
				toolName: 'unknown',
				toolCallId: '1'
			}
		]);
	});
});
