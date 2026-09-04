import { beforeAll, describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';
import { REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION } from '../catalog/definitions/controls';
import { provideAgenticChatLoopToolCatalog } from './tool-catalog';
import { executeAgenticChatStandardControlToolV1 } from './turn-contract';
import { validateToolCalls } from './tool-validation';

beforeAll(() => {
	provideAgenticChatLoopToolCatalog(() => ({ ops: {}, byToolName: {} }));
});

describe('clarification semantic preflight', () => {
	const candidates = [
		{ id: 'alpha', label: 'Launch email', kind: 'task' },
		{ id: 'beta', label: 'Investor email', kind: 'task' }
	];

	it.each([
		['paraphrased candidates', 'Should I update the launch or investor one?', candidates],
		['missing candidate', 'Should I update Launch email?', candidates],
		['invalid candidate set', 'Which email should I update?', [{ label: '' }]]
	])(
		'returns repairable feedback for %s before control execution',
		(_name, question, choices) => {
			const args = { reason: 'Two tasks match the request.', question, candidates: choices };
			const call: ChatToolCall = {
				id: 'clarification-1',
				type: 'function',
				function: { name: 'request_turn_clarification', arguments: JSON.stringify(args) }
			};
			const execution = executeAgenticChatStandardControlToolV1({
				toolName: 'request_turn_clarification',
				arguments: args
			});
			if (execution.success) throw new Error('Fixture must fail execution validation');

			const issues = validateToolCalls([call], [REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION]);
			expect(issues).toEqual([
				expect.objectContaining({ toolCall: call, errors: [execution.error] })
			]);
		}
	);

	it('accepts a corrected question that names every candidate', () => {
		const args = {
			reason: 'Two tasks match the request.',
			question: 'Should I update Launch email or Investor email?',
			candidates
		};
		expect(
			validateToolCalls(
				[
					{
						id: 'clarification-repaired',
						type: 'function',
						function: {
							name: 'request_turn_clarification',
							arguments: JSON.stringify(args)
						}
					}
				],
				[REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION]
			)
		).toEqual([]);
	});
});

// A "reschedule" to the date a task already carries executes, succeeds, and
// changes nothing — the model then reports the move as done (2026-07-31
// reschedule incident, one step past the no-field echo).
describe('reschedule no-op preflight', () => {
	const taskId = '41000000-0000-4000-8000-000000000051';
	const updateTaskTool: ChatToolDefinition = {
		type: 'function',
		function: {
			name: 'update_onto_task',
			description: 'Update a task.',
			parameters: {
				type: 'object',
				properties: {
					task_id: { type: 'string' },
					title: { type: 'string' },
					state_key: { type: 'string' },
					due_at: { type: 'string' },
					start_at: { type: 'string' }
				},
				required: ['task_id']
			}
		}
	};
	const call = (args: Record<string, unknown>): ChatToolCall => ({
		id: 'update-1',
		type: 'function',
		function: { name: 'update_onto_task', arguments: JSON.stringify(args) }
	});
	const loaded = (schedule: { due_at?: string | null; start_at?: string | null }) => ({
		loadedTaskSchedules: new Map([[taskId, schedule]])
	});

	it('rejects a due_at that repeats the loaded value and names the field', () => {
		const issues = validateToolCalls(
			[call({ task_id: taskId, due_at: '2026-08-07T15:00:00Z' })],
			[updateTaskTool],
			loaded({ due_at: '2026-08-07T15:00:00Z' })
		);

		expect(issues).toHaveLength(1);
		const message = issues[0]!.errors.join(' ');
		expect(message).toContain('due_at is already 2026-08-07T15:00:00Z');
		expect(message).toContain(taskId);
	});

	it('rejects a same-instant restatement written in another offset', () => {
		const issues = validateToolCalls(
			[call({ task_id: taskId, due_at: '2026-08-07T11:00:00-04:00' })],
			[updateTaskTool],
			loaded({ due_at: '2026-08-07T15:00:00Z' })
		);

		expect(issues).toHaveLength(1);
		expect(issues[0]!.errors.join(' ')).toContain('would change nothing');
	});

	it('accepts a due_at that actually moves the task', () => {
		expect(
			validateToolCalls(
				[call({ task_id: taskId, due_at: '2026-08-08T15:00:00Z' })],
				[updateTaskTool],
				loaded({ due_at: '2026-08-07T15:00:00Z' })
			)
		).toEqual([]);
	});

	it('accepts an unchanged due_at carried alongside a real field change', () => {
		expect(
			validateToolCalls(
				[
					call({
						task_id: taskId,
						due_at: '2026-08-07T15:00:00Z',
						state_key: 'done'
					})
				],
				[updateTaskTool],
				loaded({ due_at: '2026-08-07T15:00:00Z' })
			)
		).toEqual([]);
	});

	it('still rejects the unchanged due_at when the turn is a scheduling request', () => {
		const issues = validateToolCalls(
			[call({ task_id: taskId, due_at: '2026-08-07T15:00:00Z', state_key: 'done' })],
			[updateTaskTool],
			{ ...loaded({ due_at: '2026-08-07T15:00:00Z' }), taskScheduleFieldRequired: true }
		);

		expect(issues).toHaveLength(1);
		expect(issues[0]!.errors.join(' ')).toContain('due_at is already');
	});

	it('rejects a call carrying no changed field at all', () => {
		const issues = validateToolCalls([call({ task_id: taskId })], [updateTaskTool], {});

		expect(issues).toHaveLength(1);
		expect(issues[0]!.errors.join(' ')).toContain('No update fields provided');
	});

	it('leaves a task whose schedule this turn never loaded alone', () => {
		expect(
			validateToolCalls(
				[call({ task_id: taskId, due_at: '2026-08-07T15:00:00Z' })],
				[updateTaskTool],
				{ loadedTaskSchedules: new Map() }
			)
		).toEqual([]);
	});

	it('does not flag a start_at when only due_at was loaded', () => {
		expect(
			validateToolCalls(
				[call({ task_id: taskId, start_at: '2026-08-07T09:00:00Z' })],
				[updateTaskTool],
				loaded({ due_at: '2026-08-07T15:00:00Z' })
			)
		).toEqual([]);
	});
});
