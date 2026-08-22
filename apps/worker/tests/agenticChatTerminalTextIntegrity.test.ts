// apps/worker/tests/agenticChatTerminalTextIntegrity.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import {
	provideAgenticChatLoopToolCatalog,
	type FastToolExecution
} from '@buildos/agentic-chat-runtime/loop';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { enforceAgenticChatTerminalTextIntegrityV1 } from '../src/workers/agentic-chat/terminalTextIntegrity';

beforeAll(() => {
	provideAgenticChatLoopToolCatalog(() => ({
		ops: {},
		byToolName: {
			search_project: {
				op: 'search_project',
				tool_name: 'search_project',
				kind: 'read'
			},
			update_onto_task: {
				op: 'onto.task.update',
				tool_name: 'update_onto_task',
				kind: 'write'
			}
		}
	}));
});

describe('enforceAgenticChatTerminalTextIntegrityV1', () => {
	it('corrects a mutation success claim when a declared contract has no write evidence', () => {
		const emittedText = 'Done — I marked the task complete.';
		const contract = toolExecution(
			'declare_turn_contract',
			true,
			{ status: 'declared' },
			{
				outcomes: [
					{
						action: 'complete',
						entity_kind: 'task',
						target_ids: ['task_1'],
						minimum_successful_effects: 1
					}
				]
			}
		);
		const result = enforceAgenticChatTerminalTextIntegrityV1({
			assistantText: emittedText,
			finishedReason: 'stop',
			contextType: 'project',
			toolExecutions: [contract]
		});

		expect(result.assistantText).toContain('no write call ran');
		expect(result.assistantText).toContain('Nothing changed');
		expect(result.correctionDelta).toContain('no write call ran');
		expect(result.assistantText).toBe(`${emittedText}${result.correctionDelta}`);
		expect(result.assistantText.startsWith(emittedText)).toBe(true);
		expect(result.finalizationGuard).toBeNull();
	});

	it('synthesizes durable read evidence when the provider ends on an empty candidate', () => {
		const execution = toolExecution('search_project', true, {
			results: [{ id: 'task_1', type: 'task', title: 'Ship launch plan', state_key: 'todo' }]
		});
		const result = enforceAgenticChatTerminalTextIntegrityV1({
			assistantText: '',
			finishedReason: 'stop',
			contextType: 'project',
			toolExecutions: [execution]
		});

		expect(result.assistantText).toContain('task "Ship launch plan" (todo)');
		expect(result.correctionDelta).toBe(result.assistantText);
		expect(result.finalizationGuard?.reason).toBe('empty_after_reads');
	});

	it('leaves an evidenced successful mutation answer unchanged', () => {
		const execution = toolExecution('update_onto_task', true, {
			op: 'onto.task.update',
			ok: true
		});
		const result = enforceAgenticChatTerminalTextIntegrityV1({
			assistantText: 'Marked the task complete.',
			finishedReason: 'stop',
			contextType: 'project',
			toolExecutions: [execution]
		});

		expect(result).toMatchObject({
			assistantText: 'Marked the task complete.',
			finishedReason: 'stop',
			correctionDelta: null,
			finalizationGuard: null
		});
	});

	it('never rewrites a supervisor clarification terminal', () => {
		const result = enforceAgenticChatTerminalTextIntegrityV1({
			assistantText: 'Which task should I update?',
			finishedReason: 'supervisor_question',
			contextType: 'project',
			toolExecutions: []
		});

		expect(result).toEqual({
			assistantText: 'Which task should I update?',
			finishedReason: 'supervisor_question',
			correctionDelta: null,
			finalizationGuard: null
		});
	});

	it('preserves a semantic clarification terminal without a supervisor finish reason', () => {
		const execution = toolExecution('request_turn_clarification', true, {
			status: 'clarification_required',
			question: 'Which matching task should I update?',
			requires_user_action: true
		});
		const result = enforceAgenticChatTerminalTextIntegrityV1({
			assistantText: 'Which matching task should I update?',
			finishedReason: 'stop',
			contextType: 'project',
			toolExecutions: [execution]
		});

		expect(result).toEqual({
			assistantText: 'Which matching task should I update?',
			finishedReason: 'stop',
			correctionDelta: null,
			finalizationGuard: null
		});
	});
});

function toolExecution(
	name: string,
	success: boolean,
	result: unknown,
	args: Record<string, unknown> = {}
): FastToolExecution {
	const toolCall: ChatToolCall = {
		id: `${name}:1`,
		type: 'function',
		function: { name, arguments: JSON.stringify(args) }
	};
	const toolResult: ChatToolResult = {
		tool_call_id: toolCall.id,
		success,
		result
	};
	return { toolCall, result: toolResult };
}
