// packages/agentic-chat-runtime/src/loop/repair-instructions.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import {
	buildGatewayRequiredFieldRepairInstruction,
	buildProjectCreateNoExecutionRepairInstruction,
	buildToolValidationRepairInstruction,
	classifyReceiptGroundedAssistantDisposition,
	enforceMutationOutcomeIntegrity,
	formatUnfulfilledMutationOutcomeDisclosure,
	looksLikeUnfulfilledMutationDisclosure,
	type UnfulfilledMutationOutcomeDisclosureV1
} from './repair-instructions';
import type { FastToolExecution } from './shared';
import { provideAgenticChatLoopToolCatalog } from './tool-catalog';

provideAgenticChatLoopToolCatalog(() => ({
	ops: {},
	byToolName: {
		move_onto_task: { op: 'onto.task.move', tool_name: 'move_onto_task', kind: 'write' }
	}
}));

function writeExecution(name: string, success: boolean, result: unknown): FastToolExecution {
	const toolCall: ChatToolCall = {
		id: `${name}:${Math.random().toString(36).slice(2)}`,
		type: 'function',
		function: { name, arguments: JSON.stringify({ task_id: 'task_1' }) }
	};
	const toolResult: ChatToolResult = { tool_call_id: toolCall.id, success, result };
	return { toolCall, result: toolResult };
}

const PARTIAL_MOVE_OUTCOME: UnfulfilledMutationOutcomeDisclosureV1 = {
	action: 'move',
	entityKind: 'task',
	declaredTargetCount: 6,
	completedTargetCount: 2,
	requiredEffects: 6,
	missingTargets: [
		{ id: 'task_3', title: 'Task C' },
		{ id: 'task_4', title: 'Task D' },
		{ id: 'task_5', title: null },
		{ id: 'task_6', title: 'Task F' }
	]
};

describe('unfulfilled mutation outcome disclosure', () => {
	it('formats the partial count and names the unfinished targets by title or id', () => {
		expect(formatUnfulfilledMutationOutcomeDisclosure([PARTIAL_MOVE_OUTCOME])).toBe(
			'Done: 2 of 6 moves. Not yet moved: Task C, Task D, task_5, Task F.'
		);
		expect(
			formatUnfulfilledMutationOutcomeDisclosure([
				{
					action: 'create',
					entityKind: 'document',
					description: 'Create the handoff document',
					declaredTargetCount: 0,
					completedTargetCount: 0,
					requiredEffects: 1,
					missingTargets: []
				}
			])
		).toBe('Done: 0 of 1 creation. Not yet created: Create the handoff document.');
	});

	it('caps a long missing-target list', () => {
		const missingTargets = Array.from({ length: 14 }, (_, index) => ({
			id: `task_${index}`,
			title: `Task ${index}`
		}));
		const text = formatUnfulfilledMutationOutcomeDisclosure([
			{ ...PARTIAL_MOVE_OUTCOME, declaredTargetCount: 16, missingTargets }
		]);
		expect(text).toContain('Task 9, and 4 more.');
		expect(text).not.toContain('Task 10');
	});

	it('appends the disclosure after a successful write when the prose hides the remainder', () => {
		const text = enforceMutationOutcomeIntegrity('Moved Task A and Task B into Backlog.', {
			contextType: 'project',
			toolExecutions: [
				writeExecution('move_onto_task', true, { status: 'moved', task: { id: 'task_1' } })
			],
			explicitMutationRequested: true,
			unfulfilledOutcomes: [PARTIAL_MOVE_OUTCOME]
		});
		expect(text).toBe(
			'Moved Task A and Task B into Backlog.\n\nDone: 2 of 6 moves. Not yet moved: Task C, Task D, task_5, Task F.'
		);
	});

	it('does not append when the model already disclosed the remainder or nothing was written', () => {
		const disclosed = 'Moved Task A and Task B. The other four are not yet moved.';
		expect(
			enforceMutationOutcomeIntegrity(disclosed, {
				contextType: 'project',
				toolExecutions: [
					writeExecution('move_onto_task', true, {
						status: 'moved',
						task: { id: 'task_1' }
					})
				],
				explicitMutationRequested: true,
				unfulfilledOutcomes: [PARTIAL_MOVE_OUTCOME]
			})
		).toBe(disclosed);
		expect(
			enforceMutationOutcomeIntegrity('I could not find those tasks.', {
				contextType: 'project',
				toolExecutions: [],
				explicitMutationRequested: true,
				unfulfilledOutcomes: [PARTIAL_MOVE_OUTCOME]
			})
		).toBe('I could not find those tasks.');
	});

	it('recognises honest partial-progress prose', () => {
		for (const text of [
			'Done: 2 of 6 moves.',
			'The rest are still pending.',
			'I only moved two of them.',
			'I ran out of steps before the last four.',
			'I have not yet moved the remaining tasks.'
		]) {
			expect(looksLikeUnfulfilledMutationDisclosure(text)).toBe(true);
		}
		expect(looksLikeUnfulfilledMutationDisclosure('Moved all six tasks into Backlog.')).toBe(
			false
		);
	});
});

describe('receipt-grounded assistant disposition', () => {
	it('classifies the exact unreceipted production completion claim', () => {
		expect(
			classifyReceiptGroundedAssistantDisposition(
				'Got it — marking the usage-based pricing migration done. And just to make sure I follow: when you say "the email one," are you referring to Fix the email verification bug or Send the launch email?'
			)
		).toBe('mutation_claim');
	});

	it('classifies an unresolved target question but leaves optional offers alone', () => {
		expect(
			classifyReceiptGroundedAssistantDisposition(
				'Which matching task should I mark complete?'
			)
		).toBe('clarification_question');
		expect(
			classifyReceiptGroundedAssistantDisposition(
				'Here is the current project status. Would you like me to summarize the risks too?'
			)
		).toBeNull();
	});

	it('does not mistake suggested wording for a completed mutation', () => {
		expect(
			classifyReceiptGroundedAssistantDisposition(
				'Perhaps suggest updating it or marking tasks done.'
			)
		).toBeNull();
	});
});

describe('tool validation repair instructions', () => {
	it('repairs web project relationships without switching execution workflows', () => {
		const instruction = buildToolValidationRepairInstruction(
			[
				{
					toolCall: {
						id: 'project-create-invalid',
						type: 'function',
						function: {
							name: 'create_onto_project',
							arguments: '{"relationships":[null]}'
						}
					},
					toolName: 'create_onto_project',
					op: 'onto.project.create',
					errors: ['Invalid relationships[0]: expected an object.']
				}
			],
			true
		);

		expect(instruction).toContain(
			'Each relationship must be an object with from and to objects'
		);
		expect(instruction).toContain('Keep any initial goals, tasks, plans, documents');
		expect(instruction).not.toContain('relationships must be an empty array');
		expect(instruction).not.toContain('create_onto_goal');
		expect(instruction).not.toContain('create_onto_task');
		expect(instruction).toContain('do not call tool_search, tool_schema');
		expect(instruction).not.toContain('Load exact-op help before retrying');
		expect(instruction).not.toContain('For first-time or uncertain writes');
	});

	it('retries web project creation using only the available one-call tool', () => {
		const instruction = buildProjectCreateNoExecutionRepairInstruction();

		expect(instruction).toContain('Build one complete create_onto_project call');
		expect(instruction).toContain('include them in entities in this same call');
		expect(instruction).not.toContain('declare_turn_contract');
		expect(instruction).not.toContain('create_onto_goal');
		expect(instruction).not.toContain('create_onto_task');
		expect(instruction).not.toMatch(/web-owned|reviewed flow|project shell|bounded surface/i);
	});

	it('repairs repeated web project fields without suggesting unavailable help tools', () => {
		const instruction = buildGatewayRequiredFieldRepairInstruction([
			{ op: 'onto.project.create', field: 'project.name', occurrences: 2 }
		]);

		expect(instruction).toContain('Correct and retry that tool directly');
		expect(instruction).toContain('same create_onto_project call');
		expect(instruction).not.toContain('tool_schema');
		expect(instruction).not.toContain('create_onto_goal');
		expect(instruction).not.toContain('create_onto_task');
	});
});
