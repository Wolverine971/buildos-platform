// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/read-memo.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import {
	REPEAT_READ_NOTICE,
	buildMemoServedResult,
	buildReadMemoKey,
	shouldMemoizeReadResult
} from './read-memo';

function toolCall(name: string, args: unknown, id = 'call-1'): ChatToolCall {
	return {
		id,
		type: 'function',
		function: {
			name,
			arguments: typeof args === 'string' ? args : JSON.stringify(args)
		}
	} as ChatToolCall;
}

describe('buildReadMemoKey', () => {
	it('produces the same key for identical calls regardless of argument key order', () => {
		const first = buildReadMemoKey(
			toolCall('get_document_outline', { document_id: 'doc-1', project_id: 'p-1' })
		);
		const second = buildReadMemoKey(
			toolCall('get_document_outline', { project_id: 'p-1', document_id: 'doc-1' }, 'call-2')
		);

		expect(first).not.toBeNull();
		expect(first).toBe(second);
	});

	it('produces distinct keys when arguments differ', () => {
		const first = buildReadMemoKey(toolCall('search_all_projects', { query: 'beta launch' }));
		const second = buildReadMemoKey(
			toolCall('search_all_projects', { query: 'beta launch 2' })
		);

		expect(first).not.toBe(second);
	});

	it('normalizes nested objects and arrays stably', () => {
		const first = buildReadMemoKey(
			toolCall('search_onto_tasks', { filters: { states: ['todo', 'done'], b: 1, a: 2 } })
		);
		const second = buildReadMemoKey(
			toolCall('search_onto_tasks', { filters: { a: 2, b: 1, states: ['todo', 'done'] } })
		);

		expect(first).toBe(second);
	});

	it('keeps array order significant', () => {
		const first = buildReadMemoKey(toolCall('list_things', { ids: ['a', 'b'] }));
		const second = buildReadMemoKey(toolCall('list_things', { ids: ['b', 'a'] }));

		expect(first).not.toBe(second);
	});

	it('returns null for unparseable arguments and missing tool names', () => {
		expect(buildReadMemoKey(toolCall('get_document_outline', '{not json'))).toBeNull();
		expect(buildReadMemoKey(toolCall('', { a: 1 }))).toBeNull();
	});
});

describe('shouldMemoizeReadResult', () => {
	it('accepts only successful results without pending user action', () => {
		expect(shouldMemoizeReadResult({ tool_call_id: 'x', result: {}, success: true })).toBe(
			true
		);
		expect(shouldMemoizeReadResult({ tool_call_id: 'x', result: {}, success: false })).toBe(
			false
		);
		expect(
			shouldMemoizeReadResult({
				tool_call_id: 'x',
				result: {},
				success: true,
				requires_user_action: true
			})
		).toBe(false);
		expect(shouldMemoizeReadResult(null)).toBe(false);
		expect(shouldMemoizeReadResult(undefined)).toBe(false);
	});
});

describe('buildMemoServedResult', () => {
	it('clones the cached result with the repeat notice and marker in the payload', () => {
		const cached: ChatToolResult = {
			tool_call_id: 'call-1',
			result: { outline: ['a', 'b'], document_id: 'doc-1' },
			success: true,
			duration_ms: 245,
			stream_events: [{ type: 'progress' }]
		};

		const served = buildMemoServedResult(cached, 'call-9');

		expect(served.tool_call_id).toBe('call-9');
		expect(served.success).toBe(true);
		expect(served.duration_ms).toBe(0);
		expect(served.stream_events).toBeUndefined();
		expect(served.result).toMatchObject({
			served_from_turn_memo: true,
			repeat_read_notice: REPEAT_READ_NOTICE,
			outline: ['a', 'b'],
			document_id: 'doc-1'
		});
		// The cached original must stay untouched for later repeats.
		expect(cached.result.served_from_turn_memo).toBeUndefined();
		expect(cached.tool_call_id).toBe('call-1');
		expect(cached.stream_events).toHaveLength(1);
	});

	it('leaves non-record payloads unchanged apart from the id swap', () => {
		const cached: ChatToolResult = {
			tool_call_id: 'call-1',
			result: ['item-1', 'item-2'],
			success: true
		};

		const served = buildMemoServedResult(cached, 'call-2');

		expect(served.tool_call_id).toBe('call-2');
		expect(served.result).toEqual(['item-1', 'item-2']);
	});
});
