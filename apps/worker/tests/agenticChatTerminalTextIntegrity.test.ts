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
	it('corrects a mutation success claim when no write ran', () => {
		const emittedText = 'Done — I marked the task complete.';
		const result = enforceAgenticChatTerminalTextIntegrityV1({
			assistantText: emittedText,
			finishedReason: 'stop',
			contextType: 'project',
			userMessage: 'Mark the task complete.',
			toolExecutions: []
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
			userMessage: 'Find the launch plan task.',
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
			userMessage: 'Mark the task complete.',
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
			userMessage: 'Update it.',
			toolExecutions: []
		});

		expect(result).toEqual({
			assistantText: 'Which task should I update?',
			finishedReason: 'supervisor_question',
			correctionDelta: null,
			finalizationGuard: null
		});
	});
});

function toolExecution(name: string, success: boolean, result: unknown): FastToolExecution {
	const toolCall: ChatToolCall = {
		id: `${name}:1`,
		type: 'function',
		function: { name, arguments: '{}' }
	};
	const toolResult: ChatToolResult = {
		tool_call_id: toolCall.id,
		success,
		result
	};
	return { toolCall, result: toolResult };
}
