// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-validation.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';
import { ONTOLOGY_WRITE_TOOLS } from '$lib/services/agentic-chat/tools/core/definitions/ontology-write';
import { validateToolCalls } from './tool-validation';

const documentId = '3e9432fb-90e1-4404-a480-c73186b1337d';

function createToolCall(name: string, args: Record<string, unknown>): ChatToolCall {
	return {
		id: `${name}:test`,
		type: 'function',
		function: {
			name,
			arguments: JSON.stringify(args)
		}
	};
}

const updateDocumentTool: ChatToolDefinition = {
	type: 'function',
	function: {
		name: 'update_onto_document',
		description: 'Update document',
		parameters: {
			type: 'object',
			properties: {
				document_id: { type: 'string' },
				content: { type: 'string' },
				update_strategy: { type: 'string' },
				merge_instructions: { type: 'string' },
				props: { type: 'object' }
			},
			required: ['document_id']
		}
	}
};

describe('tool validation', () => {
	it('rejects document append calls that provide merge instructions but no content', () => {
		const issues = validateToolCalls(
			[
				createToolCall('update_onto_document', {
					document_id: documentId,
					update_strategy: 'append',
					merge_instructions: 'Append under Progress Updates.',
					props: {}
				})
			],
			[updateDocumentTool]
		);

		expect(issues).toHaveLength(1);
		expect(issues[0]?.errors).toContain(
			'update_onto_document append requires non-empty content.'
		);
		expect(issues[0]?.errors).toContain(
			'No update fields provided for onto.document.update. Include at least one field to change.'
		);
	});

	it('allows document append calls with non-empty content', () => {
		const issues = validateToolCalls(
			[
				createToolCall('update_onto_document', {
					document_id: documentId,
					update_strategy: 'append',
					content: '## Progress Updates\n\n- Chapter 2 complete.',
					merge_instructions: 'Append under Progress Updates.'
				})
			],
			[updateDocumentTool]
		);

		expect(issues).toEqual([]);
	});

	it('applies create-project array defaults before required-parameter validation', () => {
		const createProjectTool = ONTOLOGY_WRITE_TOOLS.find(
			(tool) => tool.function.name === 'create_onto_project'
		);
		expect(createProjectTool).toBeDefined();

		const issues = validateToolCalls(
			[
				createToolCall('create_onto_project', {
					project: {
						name: 'Property Interests in Procedure: Due Process Research',
						type_key: 'project.academic.legal'
					},
					relationships: []
				})
			],
			[createProjectTool as ChatToolDefinition]
		);

		expect(issues).toEqual([]);
	});

	it('rejects internal tool markup in durable write text', () => {
		const issues = validateToolCalls(
			[
				createToolCall('update_onto_document', {
					document_id: documentId,
					content: '## Progress\n\n</parameter><parameter name="update_strategy">replace'
				})
			],
			[updateDocumentTool]
		);

		expect(issues).toHaveLength(1);
		expect(issues[0]?.errors).toContain(
			'args.content contains internal tool-call markup (parameter_tag). Remove the tool syntax and pass only user-visible content.'
		);
	});
});

describe('task scheduling field validation (2026-07-31 reschedule incident)', () => {
	const taskId = '0b19a1af-6d5b-4b58-9f6a-1de1a58f2f7a';
	const updateTaskTool: ChatToolDefinition = {
		type: 'function',
		function: {
			name: 'update_onto_task',
			description: 'Update task',
			parameters: {
				type: 'object',
				properties: {
					task_id: { type: 'string' },
					title: { type: 'string' },
					type_key: { type: 'string' },
					state_key: { type: 'string' },
					due_at: { type: 'string' },
					start_at: { type: 'string' }
				},
				required: ['task_id']
			}
		}
	};

	it('rejects the observed no-op echo call when a scheduling field is required', () => {
		const issues = validateToolCalls(
			[
				createToolCall('update_onto_task', {
					task_id: taskId,
					title: 'Send the launch announcement to the beta list',
					type_key: 'task.default'
				})
			],
			[updateTaskTool],
			{ taskScheduleFieldRequired: true }
		);

		expect(issues).toHaveLength(1);
		const message = issues[0]?.errors.join(' ');
		expect(message).toMatch(/due_at/);
		expect(message).toContain(taskId);
	});

	it('accepts the call once due_at is present', () => {
		const issues = validateToolCalls(
			[
				createToolCall('update_onto_task', {
					task_id: taskId,
					due_at: '2026-08-07T15:00:00Z'
				})
			],
			[updateTaskTool],
			{ taskScheduleFieldRequired: true }
		);

		expect(issues).toEqual([]);
	});

	it('accepts start_at as the scheduling field', () => {
		const issues = validateToolCalls(
			[
				createToolCall('update_onto_task', {
					task_id: taskId,
					start_at: '2026-08-07T09:00:00Z'
				})
			],
			[updateTaskTool],
			{ taskScheduleFieldRequired: true }
		);

		expect(issues).toEqual([]);
	});

	it('does not flag task updates when the turn is not a scheduling request', () => {
		const issues = validateToolCalls(
			[
				createToolCall('update_onto_task', {
					task_id: taskId,
					title: 'Renamed task'
				})
			],
			[updateTaskTool]
		);

		expect(issues).toEqual([]);
	});

	it('never flags non-task tools', () => {
		const issues = validateToolCalls(
			[
				createToolCall('update_onto_document', {
					document_id: documentId,
					content: 'New content'
				})
			],
			[updateDocumentTool],
			{ taskScheduleFieldRequired: true }
		);

		expect(issues).toEqual([]);
	});
});
