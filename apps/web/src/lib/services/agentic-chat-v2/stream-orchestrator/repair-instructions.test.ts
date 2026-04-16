// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import {
	buildGatewayMutationNoExecutionRepairInstruction,
	enforceMutationOutcomeIntegrity,
	shouldRepairGatewayMutationNoExecution,
	shouldRepairProjectCreateNoExecution
} from './repair-instructions';
import type { FastToolExecution } from './shared';

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

function createExecution(params: {
	name: string;
	args: Record<string, unknown>;
	result?: unknown;
	success?: boolean;
	error?: string;
}): FastToolExecution {
	const toolCall = createToolCall(params.name, params.args);
	const result: ChatToolResult = {
		tool_call_id: toolCall.id,
		result: params.result ?? null,
		success: params.success ?? true,
		error: params.error
	};
	return { toolCall, result };
}

describe('repair instruction policy', () => {
	it('repairs schema-only write success claims even when the final text includes a question', () => {
		const toolExecutions = [
			createExecution({
				name: 'tool_schema',
				args: { op: 'onto.project.create', include_schema: true },
				result: {
					type: 'tool_schema',
					op: 'onto.project.create',
					tool_name: 'create_onto_project'
				}
			})
		];

		expect(
			shouldRepairGatewayMutationNoExecution({
				gatewayModeActive: true,
				contextType: 'global',
				finalText: 'Great, I have created the project. Which task should we tackle first?',
				toolExecutions,
				repairAlreadyInjected: false
			})
		).toBe(true);
		expect(buildGatewayMutationNoExecutionRepairInstruction(toolExecutions)).toContain(
			'Write ops already identified: onto.project.create'
		);
		expect(buildGatewayMutationNoExecutionRepairInstruction(toolExecutions)).toContain(
			'I was unable to <requested action>'
		);
	});

	it('allows pure clarifying questions after schema-only write discovery', () => {
		const toolExecutions = [
			createExecution({
				name: 'tool_schema',
				args: { op: 'onto.project.create', include_schema: true },
				result: {
					type: 'tool_schema',
					op: 'onto.project.create',
					tool_name: 'create_onto_project'
				}
			})
		];

		expect(
			shouldRepairGatewayMutationNoExecution({
				gatewayModeActive: true,
				contextType: 'global',
				finalText: 'What should we call this project?',
				toolExecutions,
				repairAlreadyInjected: false
			})
		).toBe(false);
	});

	it('does not force project_create repair when the assistant asks a pure clarification', () => {
		expect(
			shouldRepairProjectCreateNoExecution({
				contextType: 'project_create',
				finalText: 'What should we call this project?',
				toolExecutions: [],
				repairAlreadyInjected: false
			})
		).toBe(false);
	});

	it('blocks fake create success after tool_search only identified a write op', () => {
		const toolExecutions = [
			createExecution({
				name: 'tool_search',
				args: { query: 'create milestone', entity: 'milestone' },
				result: {
					type: 'tool_search_results',
					matches: [
						{
							op: 'onto.milestone.create',
							tool_name: 'create_onto_milestone'
						}
					]
				}
			})
		];

		expect(
			enforceMutationOutcomeIntegrity('I created the milestone.', {
				contextType: 'global',
				toolExecutions
			})
		).toBe(
			'I was unable to create that because no write call succeeded. Nothing changed yet; I need to retry with a valid payload.'
		);
	});

	it('blocks fake merge success after only discovering update tools', () => {
		const toolExecutions = [
			createExecution({
				name: 'tool_search',
				args: { query: 'update project state to archive old duplicate', entity: 'project' },
				result: {
					type: 'tool_search_results',
					matches: [
						{
							op: 'onto.project.update',
							tool_name: 'update_onto_project'
						}
					]
				}
			})
		];

		expect(
			enforceMutationOutcomeIntegrity('I merged the Ember projects.', {
				contextType: 'global',
				toolExecutions
			})
		).toBe(
			'I was unable to complete that update because no write call succeeded. Nothing changed yet; I need to retry with the exact ID and valid arguments.'
		);
	});

	it('discloses unrepaired failed writes even when other writes succeeded', () => {
		const documentId = '3e9432fb-90e1-4404-a480-c73186b1337d';
		const toolExecutions = [
			createExecution({
				name: 'update_onto_task',
				args: { task_id: '1eb66f88-e68a-4176-a341-fbd2d3fb5f68', state_key: 'in_progress' }
			}),
			createExecution({
				name: 'create_onto_task',
				args: {
					project_id: '56bcc3cf-67ae-491f-ace9-6d1c7d4e9bfc',
					title: 'Revise Chapter 2'
				}
			}),
			createExecution({
				name: 'update_onto_document',
				args: {
					document_id: documentId,
					update_strategy: 'append',
					merge_instructions: 'Append under Progress Updates.',
					props: {}
				},
				success: false,
				error: 'update_onto_document append requires non-empty content.'
			})
		];

		const finalText = enforceMutationOutcomeIntegrity('I captured the task updates.', {
			contextType: 'project',
			toolExecutions
		});

		expect(finalText).toContain('I captured the task updates.');
		expect(finalText).toContain('One write did not complete: document update failed');
		expect(finalText).toContain('I did not persist that part.');
	});

	it('does not disclose a failed write when a later retry fixes the same target', () => {
		const documentId = '3e9432fb-90e1-4404-a480-c73186b1337d';
		const toolExecutions = [
			createExecution({
				name: 'update_onto_document',
				args: {
					document_id: documentId,
					update_strategy: 'append',
					merge_instructions: 'Append under Progress Updates.',
					props: {}
				},
				success: false,
				error: 'update_onto_document append requires non-empty content.'
			}),
			createExecution({
				name: 'update_onto_document',
				args: {
					document_id: documentId,
					update_strategy: 'append',
					content: '## Progress Updates\n\n- Chapter 2 complete.'
				}
			})
		];

		expect(
			enforceMutationOutcomeIntegrity('I updated the document.', {
				contextType: 'project',
				toolExecutions
			})
		).toBe('I updated the document.');
	});

	it('corrects document link claims when no link write succeeded', () => {
		const toolExecutions = [
			createExecution({
				name: 'create_onto_document',
				args: {
					project_id: '56bcc3cf-67ae-491f-ace9-6d1c7d4e9bfc',
					title: 'Chapter 2 Notes',
					description: 'Notes',
					content: 'Notes'
				}
			})
		];

		const finalText = enforceMutationOutcomeIntegrity(
			'I created and linked the document to the outline.',
			{
				contextType: 'project',
				toolExecutions
			}
		);

		expect(finalText).toContain('I created and linked the document to the outline.');
		expect(finalText).toContain('Correction: I did not create a document link.');
	});

	it('does not correct task-to-goal link claims when a document is mentioned in a separate clause', () => {
		// Regression: the prior whole-answer regex saw "linked" and "document" in
		// the same response and appended a spurious document-link correction even
		// though the claim was about tasks being linked to a goal.
		const toolExecutions = [
			createExecution({
				name: 'create_onto_project',
				args: {
					title: 'The Last Ember',
					entities: []
				},
				result: {
					project: { id: '7a04594e-8ebc-4a71-a188-816a696cd25c' }
				}
			})
		];

		const finalText = enforceMutationOutcomeIntegrity(
			'Created the project with 7 tasks linked to the main goal. I also added an auto-generated context document for the plot summary.',
			{
				contextType: 'project',
				toolExecutions
			}
		);

		expect(finalText).not.toContain('Correction: I did not create a document link.');
	});

	it('allows document placement claims when a tree move succeeded', () => {
		const toolExecutions = [
			createExecution({
				name: 'move_document_in_tree',
				args: {
					project_id: '56bcc3cf-67ae-491f-ace9-6d1c7d4e9bfc',
					document_id: '3e9432fb-90e1-4404-a480-c73186b1337d',
					new_parent_id: 'c9ff9921-7bcb-493f-a8b0-44ef8668f29c'
				}
			})
		];

		expect(
			enforceMutationOutcomeIntegrity('I moved the document into the research area.', {
				contextType: 'project',
				toolExecutions
			})
		).toBe('I moved the document into the research area.');
	});
});
