// apps/web/src/lib/services/agentic-chat-v2/tool-trace.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import {
	buildPersistedToolTrace,
	buildPersistedToolTraceSummary,
	classifyTraceEntry,
	previewToolArguments,
	summarizeTraceGroup,
	truncateToolTraceText,
	type PersistedToolTraceEntry
} from './tool-trace';

function toolCall(name: string, args: unknown, id = `call-${name}`): ChatToolCall {
	return {
		id,
		type: 'function',
		function: {
			name,
			arguments: typeof args === 'string' ? args : JSON.stringify(args)
		}
	} as ChatToolCall;
}

function result(overrides: Partial<ChatToolResult>): ChatToolResult {
	return { success: true, ...overrides } as ChatToolResult;
}

describe('previewToolArguments', () => {
	it('returns "null" for nullish input', () => {
		expect(previewToolArguments(undefined)).toBe('null');
		expect(previewToolArguments(null)).toBe('null');
	});

	it('stringifies objects and collapses whitespace', () => {
		expect(previewToolArguments({ a: 1 })).toBe('{"a":1}');
		expect(previewToolArguments('a   b\n c')).toBe('a b c');
	});

	it('truncates to maxChars with ellipsis', () => {
		expect(previewToolArguments('abcdefghij', 8)).toBe('abcde...');
	});
});

describe('truncateToolTraceText', () => {
	it('passes through short text', () => {
		expect(truncateToolTraceText('hi there', 50)).toBe('hi there');
	});

	it('collapses whitespace and truncates', () => {
		expect(truncateToolTraceText('one   two   three', 9)).toBe('one tw...');
	});
});

describe('buildPersistedToolTrace', () => {
	it('returns [] for empty/invalid input', () => {
		expect(buildPersistedToolTrace([])).toEqual([]);
		expect(buildPersistedToolTrace(undefined as any)).toEqual([]);
	});

	it('caps at 12 entries', () => {
		const executions = Array.from({ length: 15 }, (_, i) => ({
			toolCall: toolCall('update_onto_task', { i }, `call-${i}`),
			result: result({ success: true })
		}));
		expect(buildPersistedToolTrace(executions)).toHaveLength(12);
	});

	it('captures name, success, previews, duration, and truncated error', () => {
		const trace = buildPersistedToolTrace([
			{
				toolCall: toolCall('update_onto_task', { task_id: 'x' }, 'c1'),
				result: result({
					success: false,
					error: 'boom',
					result: { ok: false },
					duration_ms: 42
				})
			}
		]);
		expect(trace[0]).toMatchObject({
			tool_call_id: 'c1',
			tool_name: 'update_onto_task',
			success: false,
			error: 'boom',
			duration_ms: 42,
			arguments_preview: '{"task_id":"x"}',
			result_preview: '{"ok":false}'
		});
	});

	it('omits duration_ms when not finite', () => {
		const trace = buildPersistedToolTrace([
			{ toolCall: toolCall('read_x', {}, 'c2'), result: result({ duration_ms: NaN }) }
		]);
		expect(trace[0].duration_ms).toBeUndefined();
	});
});

describe('classifyTraceEntry', () => {
	const entry = (tool_name: string): PersistedToolTraceEntry => ({
		tool_call_id: 'c',
		tool_name,
		success: true
	});

	it('classifies discovery tools as read_discovery', () => {
		expect(classifyTraceEntry(entry('skill_load'))).toBe('read_discovery');
		expect(classifyTraceEntry(entry('tool_search'))).toBe('read_discovery');
	});

	it('classifies onto/calendar mutations and context change as write', () => {
		expect(classifyTraceEntry(entry('create_onto_task'))).toBe('write');
		expect(classifyTraceEntry(entry('delete_calendar_event'))).toBe('write');
		expect(classifyTraceEntry(entry('change_chat_context'))).toBe('write');
	});

	it('classifies everything else as other', () => {
		expect(classifyTraceEntry(entry('get_onto_project'))).toBe('other');
	});
});

describe('summarizeTraceGroup', () => {
	it('aggregates successes with counts and collects failures', () => {
		const entries: PersistedToolTraceEntry[] = [
			{ tool_call_id: '1', tool_name: 'create_onto_task', op: 'task.create', success: true },
			{ tool_call_id: '2', tool_name: 'create_onto_task', op: 'task.create', success: true },
			{
				tool_call_id: '3',
				tool_name: 'update_onto_task',
				op: 'task.update',
				success: false,
				error: 'missing id'
			}
		];
		const { label, failures } = summarizeTraceGroup(entries, 6);
		expect(label).toBe('task.create x2');
		expect(failures).toEqual(['task.update(missing id)']);
	});
});

describe('buildPersistedToolTraceSummary', () => {
	it('returns null for empty trace', () => {
		expect(buildPersistedToolTraceSummary([])).toBeNull();
	});

	it('summarizes counts and always lists failures in full', () => {
		const trace: PersistedToolTraceEntry[] = [
			{ tool_call_id: '1', tool_name: 'create_onto_task', op: 'task.create', success: true },
			{ tool_call_id: '2', tool_name: 'skill_load', success: true },
			{
				tool_call_id: '3',
				tool_name: 'update_onto_task',
				op: 'task.update',
				success: false,
				error: 'missing id'
			}
		];
		const summary = buildPersistedToolTraceSummary(trace);
		expect(summary).toContain('Tool trace: 3 calls, 2 writes, 1 failures.');
		expect(summary).toContain('Failures: task.update(missing id).');
	});
});
