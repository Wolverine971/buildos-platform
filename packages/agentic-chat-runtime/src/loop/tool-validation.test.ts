// packages/agentic-chat-runtime/src/loop/tool-validation.test.ts
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

	// The question is no longer required to repeat every label verbatim: the
	// host renders the candidates beneath it, and the verbatim rule failed four
	// live clarifications in the 2026-09-04 retest (one fatally). What still
	// fails preflight is a candidate set that is not a choice.
	it.each([
		['invalid candidate set', 'Which email should I update?', [{ label: '' }]],
		['a single candidate', 'Which email should I update?', [candidates[0]]]
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

	it('accepts a question that paraphrases the candidates instead of naming them', () => {
		const args = {
			reason: 'Two tasks match the request.',
			question: 'Should I update the launch or investor one?',
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
		// The repair example must not contradict the schema's date rule: a
		// day-level date is YYYY-MM-DD in the user's timezone, not an ISO instant.
		expect(message).toContain(
			"YYYY-MM-DD for a day-level date in the user's timezone, or a full ISO datetime only when a clock time was given"
		);
		expect(message).not.toContain('ISO 8601 datetime, e.g.');
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

// A bare "Missing required parameter: anchor" gave the repair round nothing to
// act on: it named neither the tool nor what an anchor is, so the model resent
// the call with an invented anchor (2026-09-04).
describe('missing required parameter feedback', () => {
	const readSectionTool: ChatToolDefinition = {
		type: 'function',
		function: {
			name: 'read_document_section',
			description: 'Read one section of a document by heading anchor.',
			parameters: {
				type: 'object',
				properties: {
					document_id: { type: 'string', description: 'Document ID to read from' },
					anchor: {
						type: 'string',
						description:
							'Heading anchor (slug) of the section to read, e.g. "channels". Call get_document_outline to list anchors.'
					}
				},
				required: ['document_id', 'anchor']
			}
		}
	};
	const call = (args: Record<string, unknown>): ChatToolCall => ({
		id: 'read-section-1',
		type: 'function',
		function: { name: 'read_document_section', arguments: JSON.stringify(args) }
	});

	it("names the tool and carries the property's own schema description", () => {
		const issues = validateToolCalls([call({ document_id: 'doc-1' })], [readSectionTool]);

		expect(issues).toHaveLength(1);
		expect(issues[0]!.errors).toEqual([
			'read_document_section is missing required parameter "anchor": Heading anchor (slug) of the section to read, e.g. "channels". Call get_document_outline to list anchors.'
		]);
	});

	it('treats a blank string the same as an absent value', () => {
		const issues = validateToolCalls(
			[call({ document_id: 'doc-1', anchor: '   ' })],
			[readSectionTool]
		);

		expect(issues).toHaveLength(1);
		expect(issues[0]!.errors[0]).toContain(
			'read_document_section is missing required parameter "anchor"'
		);
	});

	it('falls back to the bare name when the property has no description', () => {
		const bareTool: ChatToolDefinition = {
			type: 'function',
			function: {
				name: 'get_onto_task_details',
				description: 'Read one task.',
				parameters: {
					type: 'object',
					properties: { task_id: { type: 'string' } },
					required: ['task_id']
				}
			}
		};

		const issues = validateToolCalls(
			[
				{
					id: 'task-details-1',
					type: 'function',
					function: { name: 'get_onto_task_details', arguments: '{}' }
				}
			],
			[bareTool]
		);

		expect(issues).toHaveLength(1);
		expect(issues[0]!.errors).toEqual([
			'get_onto_task_details is missing required parameter "task_id"'
		]);
	});
});
