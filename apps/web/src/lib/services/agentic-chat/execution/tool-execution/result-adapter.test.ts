// apps/web/src/lib/services/agentic-chat/execution/tool-execution/result-adapter.test.ts
import { describe, expect, it } from 'vitest';
import type { ToolExecutorResponse } from '../../shared/types';
import {
	adaptCoreToolExecutionResult,
	cleanToolResultData,
	extractToolExecutionTokens,
	extractToolResultEntityIds,
	formatToolExecutionResult,
	normalizeToolExecutionError
} from './result-adapter';

describe('tool execution result adapter', () => {
	it('cleans only top-level internal fields without mutating executor data', () => {
		const data = {
			id: 'task_1',
			title: 'Ship it',
			_entities_accessed: ['task_1'],
			_metadata: { internal: true },
			_internal: true,
			_stream_events: [{ type: 'text' }],
			nested: { _internal: 'preserved' }
		};

		expect(cleanToolResultData(data)).toEqual({
			id: 'task_1',
			title: 'Ship it',
			nested: { _internal: 'preserved' }
		});
		expect(data._internal).toBe(true);
	});

	it('extracts nested and explicit entity IDs once in discovery order', () => {
		expect(
			extractToolResultEntityIds({
				project: {
					id: 'project_1',
					owner_id: 'user_1',
					task: { id: 'task_1', relatedId: 'project_1' }
				},
				_entities_accessed: ['task_1', 'goal_1', 'goal_1']
			})
		).toEqual(['task_1', 'goal_1', 'project_1', 'user_1']);
	});

	it.each([
		['metadata tokensUsed', { data: {}, metadata: { tokensUsed: 1 } }, 1],
		['metadata tokens_used', { data: {}, metadata: { tokens_used: 2 } }, 2],
		['metadata usage total_tokens', { data: {}, metadata: { usage: { total_tokens: 3 } } }, 3],
		['metadata usage totalTokens', { data: {}, metadata: { usage: { totalTokens: 4 } } }, 4],
		['root tokensUsed', { data: {}, tokensUsed: 5 }, 5],
		['root tokens_used', { data: {}, tokens_used: 6 }, 6],
		['root tokens_consumed', { data: {}, tokens_consumed: 7 }, 7],
		['root usage total_tokens', { data: {}, usage: { total_tokens: 8 } }, 8],
		['root usage totalTokens', { data: {}, usage: { totalTokens: 9 } }, 9],
		['data usage total_tokens', { data: { usage: { total_tokens: 10 } } }, 10],
		['data usage totalTokens', { data: { usage: { totalTokens: 11 } } }, 11]
	])('normalizes %s', (_label, execution, expected) => {
		expect(extractToolExecutionTokens(execution as ToolExecutorResponse)).toBe(expected);
	});

	it('uses the first finite token field in legacy precedence order', () => {
		const execution = {
			data: { usage: { total_tokens: 99 } },
			metadata: { tokensUsed: Number.NaN, tokens_used: 12 },
			tokens_consumed: 30
		} as ToolExecutorResponse;

		expect(extractToolExecutionTokens(execution)).toBe(12);
	});

	it('adapts core data while preserving stream events and metadata references', () => {
		const streamEvents = [{ type: 'text' as const, content: 'done' }];
		const metadata = { provider: 'test', tokensUsed: 17 };
		const adapted = adaptCoreToolExecutionResult(
			{
				data: { id: 'task_1', _internal: true },
				streamEvents,
				metadata
			},
			{ toolName: 'create_onto_task', toolCallId: 'call_1' }
		);

		expect(adapted.cleanedData).toEqual({ id: 'task_1' });
		expect(adapted.result).toEqual({
			success: true,
			data: { id: 'task_1' },
			toolName: 'create_onto_task',
			toolCallId: 'call_1',
			entitiesAccessed: ['task_1'],
			streamEvents,
			tokensUsed: 17,
			metadata
		});
		expect(adapted.result.streamEvents).toBe(streamEvents);
		expect(adapted.result.metadata).toBe(metadata);
	});

	it('preserves explicit undefined optionals in the core success envelope', () => {
		expect(
			adaptCoreToolExecutionResult(
				{ data: undefined },
				{
					toolName: 'list_onto_tasks',
					toolCallId: 'call_empty'
				}
			).result
		).toEqual({
			success: true,
			data: undefined,
			toolName: 'list_onto_tasks',
			toolCallId: 'call_empty',
			entitiesAccessed: undefined,
			streamEvents: undefined,
			tokensUsed: undefined,
			metadata: undefined
		});
	});

	it('formats errors, entities, and the exact oversized-result truncation boundary', () => {
		expect(
			formatToolExecutionResult({
				success: false,
				error: 'no access',
				toolName: 'load_secret',
				toolCallId: 'call_error'
			})
		).toBe('Error executing load_secret: no access');

		const formatted = formatToolExecutionResult(
			{
				success: true,
				data: { text: 'x'.repeat(100) },
				toolName: 'write_report',
				toolCallId: 'call_large',
				entitiesAccessed: ['document_1']
			},
			40
		);
		expect(formatted).toBe(
			`Tool: write_report\nResult (truncated):\n${JSON.stringify({ text: 'x'.repeat(100) }, null, 2).substring(0, 40)}\n...\nEntities accessed: document_1`
		);
	});

	it('normalizes execution errors with the legacy tool prefix and status hints', () => {
		expect(normalizeToolExecutionError(new Error('request failed with 404'), 'load_task')).toBe(
			"Tool 'load_task' failed: request failed with 404 (resource not found)"
		);
	});
});
