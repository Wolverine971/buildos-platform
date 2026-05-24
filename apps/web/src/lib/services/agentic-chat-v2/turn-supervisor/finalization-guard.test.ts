// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/finalization-guard.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { applyFinalizationGuard } from './finalization-guard';

function toolCall(name: string, args: Record<string, unknown> = {}, id = name): ChatToolCall {
	return {
		id,
		type: 'function',
		function: {
			name,
			arguments: JSON.stringify(args)
		}
	};
}

function toolResult(
	toolCall: ChatToolCall,
	success: boolean,
	result: unknown = { ok: success },
	error?: string
): ChatToolResult {
	return {
		tool_call_id: toolCall.id,
		result,
		success,
		error
	};
}

describe('applyFinalizationGuard', () => {
	it('synthesizes a completion summary when write tools ran but final text is empty', () => {
		const call = toolCall('update_onto_task', { task_id: 'task_1', state_key: 'done' });
		const guard = applyFinalizationGuard({
			finalAssistantText: '',
			assistantText: '',
			toolExecutions: [{ toolCall: call, result: toolResult(call, true) }]
		});

		expect(guard).toMatchObject({
			applied: true,
			reason: 'empty_after_successful_writes',
			text: 'I completed the requested change.'
		});
	});

	it('replaces an intent lead-in after a successful write', () => {
		const call = toolCall('create_onto_milestone', { title: 'Launch' });
		const guard = applyFinalizationGuard({
			finalAssistantText: "I'll create that milestone now.",
			assistantText: "I'll create that milestone now.",
			toolExecutions: [{ toolCall: call, result: toolResult(call, true) }]
		});

		expect(guard.applied).toBe(true);
		expect(guard.reason).toBe('lead_in_after_successful_writes');
		expect(guard.text).toBe('I completed the requested change.');
	});

	it('does not rewrite a useful final answer', () => {
		const call = toolCall('update_onto_task', { task_id: 'task_1', state_key: 'done' });
		const guard = applyFinalizationGuard({
			finalAssistantText: 'Marked the task done.',
			assistantText: 'Marked the task done.',
			toolExecutions: [{ toolCall: call, result: toolResult(call, true) }]
		});

		expect(guard).toMatchObject({
			applied: false,
			text: 'Marked the task done.'
		});
	});

	it('does not claim failed writes succeeded', () => {
		const call = toolCall('update_onto_task', { task_id: 'task_1', state_key: 'done' });
		const guard = applyFinalizationGuard({
			finalAssistantText: '',
			assistantText: '',
			toolExecutions: [
				{
					toolCall: call,
					result: toolResult(call, false, null, 'Tool validation failed')
				}
			]
		});

		expect(guard.applied).toBe(true);
		expect(guard.reason).toBe('empty_after_failed_writes');
		expect(guard.text).toContain('nothing was changed');
	});
});
