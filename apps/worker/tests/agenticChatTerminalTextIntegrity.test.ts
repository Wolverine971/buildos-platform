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

	it('preserves a semantic clarification terminal', () => {
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

	it('discloses partial contract fulfilment by title and marks the turn mutation_unfulfilled', () => {
		const emittedText = 'Moved Draft outline and Interview notes into Backlog.';
		const result = enforceAgenticChatTerminalTextIntegrityV1({
			assistantText: emittedText,
			finishedReason: 'stop',
			contextType: 'project',
			toolExecutions: [
				declaredMoveContract(SIX_TASK_IDS),
				taskListing(SIX_TASK_IDS),
				movedTask(SIX_TASK_IDS[0]!, 'Draft outline'),
				movedTask(SIX_TASK_IDS[1]!, 'Interview notes')
			]
		});

		expect(result.finishedReason).toBe('mutation_unfulfilled');
		expect(result.assistantText.startsWith(`${emittedText}\n\n`)).toBe(true);
		expect(result.correctionDelta).toContain('Done: 2 of 6 moves.');
		expect(result.correctionDelta).toContain('Not yet moved: Task C, Task D, Task E, Task F.');
		expect(result.assistantText).toBe(`${emittedText}${result.correctionDelta}`);
		// The disclosure line is honest prose; the guard must not paper over it.
		expect(result.finalizationGuard).toBeNull();
	});

	it('leaves a fully fulfilled contract answer untouched', () => {
		const targets = SIX_TASK_IDS.slice(0, 2);
		const result = enforceAgenticChatTerminalTextIntegrityV1({
			assistantText: 'Moved both tasks into Backlog.',
			finishedReason: 'stop',
			contextType: 'project',
			toolExecutions: [
				declaredMoveContract(targets),
				taskListing(targets),
				movedTask(targets[0]!, 'Task A'),
				movedTask(targets[1]!, 'Task B')
			]
		});

		expect(result).toMatchObject({
			assistantText: 'Moved both tasks into Backlog.',
			finishedReason: 'stop',
			correctionDelta: null,
			finalizationGuard: null
		});
	});

	it('does not duplicate a partial disclosure the model already wrote', () => {
		const emittedText =
			'Moved Draft outline and Interview notes into Backlog. The other 4 tasks are not yet moved.';
		const result = enforceAgenticChatTerminalTextIntegrityV1({
			assistantText: emittedText,
			finishedReason: 'stop',
			contextType: 'project',
			toolExecutions: [
				declaredMoveContract(SIX_TASK_IDS),
				taskListing(SIX_TASK_IDS),
				movedTask(SIX_TASK_IDS[0]!, 'Draft outline'),
				movedTask(SIX_TASK_IDS[1]!, 'Interview notes')
			]
		});

		expect(result).toMatchObject({
			assistantText: emittedText,
			finishedReason: 'mutation_unfulfilled',
			correctionDelta: null
		});
	});
});

const SIX_TASK_IDS = [
	'aa000000-0000-4000-8000-000000000001',
	'aa000000-0000-4000-8000-000000000002',
	'aa000000-0000-4000-8000-000000000003',
	'aa000000-0000-4000-8000-000000000004',
	'aa000000-0000-4000-8000-000000000005',
	'aa000000-0000-4000-8000-000000000006'
];
const TASK_TITLES = ['Task A', 'Task B', 'Task C', 'Task D', 'Task E', 'Task F'];

function declaredMoveContract(targetIds: string[]): FastToolExecution {
	return toolExecution(
		'declare_turn_contract',
		true,
		{ status: 'declared' },
		{
			outcomes: [
				{
					action: 'move',
					entity_kind: 'task',
					target_ids: targetIds,
					minimum_successful_effects: targetIds.length
				}
			]
		}
	);
}

function taskListing(targetIds: string[]): FastToolExecution {
	return toolExecution('search_project', true, {
		results: targetIds.map((id, index) => ({
			id,
			type: 'task',
			title: TASK_TITLES[index],
			state_key: 'todo'
		}))
	});
}

function movedTask(taskId: string, title: string): FastToolExecution {
	return toolExecution(
		'move_onto_task',
		true,
		{ status: 'moved', task: { id: taskId, title } },
		{ task_id: taskId, destination_project_id: 'bb000000-0000-4000-8000-000000000001' }
	);
}

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
