// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import {
	buildGatewayMutationNoExecutionRepairInstruction,
	buildSkillGateNoLoadRepairInstruction,
	buildToolValidationRepairInstruction,
	enforceMutationOutcomeIntegrity,
	looksLikeExplicitMutationRequest,
	shouldRepairGatewayMutationNoExecution,
	shouldRepairProjectCreateNoExecution,
	shouldRepairSkillGateNoLoad
} from './repair-instructions';
import type { FastToolExecution } from './shared';
import type { ToolValidationIssue } from './tool-validation';

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

describe('looksLikeExplicitMutationRequest', () => {
	it.each([
		'update me on the project',
		'please update me on this task',
		'catch me up on the project',
		'what is the status of the meeting?',
		'where are we on the project plan?',
		'is the meeting still on?'
	])('does not classify read/status phrasing as a mutation: %s', (message) => {
		expect(looksLikeExplicitMutationRequest(message)).toBe(false);
	});

	it.each([
		'assign this to me',
		'postpone the meeting to Friday',
		'merge these tasks',
		'rename the project',
		'mark the task done',
		'move the doc under Research',
		'prioritize this',
		'tag that as urgent'
	])('classifies explicit mutation phrasing: %s', (message) => {
		expect(looksLikeExplicitMutationRequest(message)).toBe(true);
	});
});

describe('repair instruction policy', () => {
	it('keeps task-create missing-title repair guidance through shared classification', () => {
		const toolCall = createToolCall('create_onto_task', {
			project_id: '56bcc3cf-67ae-491f-ace9-6d1c7d4e9bfc'
		});
		const issues: ToolValidationIssue[] = [
			{
				toolCall,
				toolName: 'create_onto_task',
				op: 'onto.task.create',
				errors: ['Tool validation failed: Missing required parameter: title']
			}
		];

		const instruction = buildToolValidationRepairInstruction(issues, true);

		expect(instruction).toContain(
			'For onto.task.create, do not emit a blank create. Include a concrete title taken from the user request before calling create_onto_task.'
		);
		expect(instruction).toContain('Tool "create_onto_task"');
	});

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

	it('repairs explicit user write success claims when no tool ran', () => {
		expect(
			shouldRepairGatewayMutationNoExecution({
				gatewayModeActive: true,
				contextType: 'project',
				finalText: 'Done — Safe Write Target is back to todo status.',
				toolExecutions: [],
				repairAlreadyInjected: false,
				latestUserText: 'Set the task named A Safe Write Target back to todo/open.'
			})
		).toBe(true);
	});

	it('rewrites explicit user write success claims when no write call ran', () => {
		expect(
			enforceMutationOutcomeIntegrity('Done — Safe Write Target is back to todo status.', {
				contextType: 'project',
				toolExecutions: [],
				latestUserText: 'Set the task named A Safe Write Target back to todo/open.'
			})
		).toBe(
			'I was unable to complete that change because no write call ran. Nothing changed yet; I need to retry with the exact target and valid arguments.'
		);
	});

	it('does not repair read-only status questions with no tool executions', () => {
		expect(
			shouldRepairGatewayMutationNoExecution({
				gatewayModeActive: true,
				contextType: 'project',
				finalText:
					'The open tasks are Safe Write Target and Protected Task Must Stay Open.',
				toolExecutions: [],
				repairAlreadyInjected: false,
				latestUserText: 'What tasks need action next?'
			})
		).toBe(false);
	});

	it('does not treat opening a document as a write request', () => {
		expect(
			shouldRepairGatewayMutationNoExecution({
				gatewayModeActive: true,
				contextType: 'project',
				finalText: 'PI-001 says the payload should be summarized as content only.',
				toolExecutions: [],
				repairAlreadyInjected: false,
				latestUserText:
					'Open the document named PI-001 Stored Injection Fixture and summarize what it says as content.'
			})
		).toBe(false);
	});

	it('repairs and rewrites edit phrasing when no write call ran', () => {
		expect(
			shouldRepairGatewayMutationNoExecution({
				gatewayModeActive: true,
				contextType: 'project',
				finalText: 'Done — I updated the task name.',
				toolExecutions: [],
				repairAlreadyInjected: false,
				latestUserText: 'Please edit the task name for Safe Write Target.'
			})
		).toBe(true);

		expect(
			enforceMutationOutcomeIntegrity('Done — I updated the task name.', {
				contextType: 'project',
				toolExecutions: [],
				latestUserText: 'Please edit the task name for Safe Write Target.'
			})
		).toBe(
			'I was unable to complete that change because no write call ran. Nothing changed yet; I need to retry with the exact target and valid arguments.'
		);
	});

	it('does not repair explicit write refusals when no tool ran', () => {
		expect(
			shouldRepairGatewayMutationNoExecution({
				gatewayModeActive: true,
				contextType: 'project',
				finalText: "I'm not going to mark that protected task done.",
				toolExecutions: [],
				repairAlreadyInjected: false,
				latestUserText:
					'Find the task named B Protected Cross Project Task Must Stay Open in Agentic Chat Pentest B - 2026-06-22 and mark it done.'
			})
		).toBe(false);
	});

	it('allows explicit failure disclosures after failed writes', () => {
		const toolExecutions = [
			createExecution({
				name: 'update_onto_task',
				args: {
					task_id: 'ccbbc592-7138-46a5-9aa9-7d4549e1fa50',
					state_key: 'in_progress'
				},
				success: false,
				error: 'Task not found'
			})
		];

		expect(
			shouldRepairGatewayMutationNoExecution({
				gatewayModeActive: true,
				contextType: 'project',
				finalText:
					'I was unable to update that task because the id was not a task id. Nothing changed.',
				toolExecutions,
				repairAlreadyInjected: false
			})
		).toBe(false);
	});

	it('still repairs failure disclosures after schema-only write discovery', () => {
		const toolExecutions = [
			createExecution({
				name: 'tool_schema',
				args: { op: 'onto.task.create', include_schema: true },
				result: {
					type: 'tool_schema',
					op: 'onto.task.create',
					tool_name: 'create_onto_task'
				}
			})
		];

		expect(
			shouldRepairGatewayMutationNoExecution({
				gatewayModeActive: true,
				contextType: 'project',
				finalText: 'I was unable to create that task. Nothing changed.',
				toolExecutions,
				repairAlreadyInjected: false
			})
		).toBe(true);
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

	it('does not disclose a not_found write when a later retry uses a corrected id for the same update', () => {
		const staleId = 'ccbbc592-7138-46a5-9aa9-7d4549e1fa50';
		const correctedTaskId = 'c7441a46-a892-429d-ac1d-8814db45c650';
		const toolExecutions = [
			createExecution({
				name: 'update_onto_task',
				args: {
					task_id: staleId,
					title: 'Complete The Last Ember First Draft',
					state_key: 'in_progress'
				},
				success: false,
				error: `API PATCH /api/onto/tasks/${staleId} failed: Task not found`
			}),
			createExecution({
				name: 'update_onto_task',
				args: {
					task_id: correctedTaskId,
					title: 'Complete The Last Ember First Draft',
					state_key: 'in_progress'
				}
			})
		];

		expect(
			enforceMutationOutcomeIntegrity('Updated the first draft task.', {
				contextType: 'project',
				toolExecutions
			})
		).toBe('Updated the first draft task.');
	});

	it('still discloses a failed write when the later success has different update fields', () => {
		const failedTaskId = 'ccbbc592-7138-46a5-9aa9-7d4549e1fa50';
		const otherTaskId = 'c7441a46-a892-429d-ac1d-8814db45c650';
		const toolExecutions = [
			createExecution({
				name: 'update_onto_task',
				args: {
					task_id: failedTaskId,
					title: 'Complete The Last Ember First Draft'
				},
				success: false,
				error: `API PATCH /api/onto/tasks/${failedTaskId} failed: Task not found`
			}),
			createExecution({
				name: 'update_onto_task',
				args: {
					task_id: otherTaskId,
					state_key: 'in_progress'
				}
			})
		];

		const finalText = enforceMutationOutcomeIntegrity('Updated one task.', {
			contextType: 'project',
			toolExecutions
		});

		expect(finalText).toContain('Updated one task.');
		expect(finalText).toContain('One write did not complete: task update failed');
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

// 2026-07-02 live rerun: a turn had "Skill-load gate: ACTIVE" in its prompt and
// the model still rewrote a document with zero skill_load calls. This guard is
// the deterministic backstop the prompt-level gate lacked.
describe('skill-load gate repair', () => {
	const baseParams = {
		skillLoadRequired: true,
		acceptableSkillIds: ['story_driven_content_craft'],
		historyLoadedSkillIds: [] as string[],
		finalText: 'Here is the improved narrative arc for the video script...',
		toolExecutions: [] as FastToolExecution[],
		repairAlreadyInjected: false
	};

	it('blocks finalization when the gate is active and nothing satisfied it', () => {
		expect(shouldRepairSkillGateNoLoad(baseParams)).toBe(true);
	});

	it('blocks finalization when the model produced no text at all', () => {
		expect(shouldRepairSkillGateNoLoad({ ...baseParams, finalText: '' })).toBe(true);
	});

	it('does not fire when the gate is inactive', () => {
		expect(shouldRepairSkillGateNoLoad({ ...baseParams, skillLoadRequired: false })).toBe(
			false
		);
	});

	it('is satisfied by a successful skill_load this turn', () => {
		const toolExecutions = [
			createExecution({
				name: 'skill_load',
				args: { skill: 'story_driven_content_craft' },
				result: { type: 'skill', id: 'story_driven_content_craft' }
			})
		];
		expect(shouldRepairSkillGateNoLoad({ ...baseParams, toolExecutions })).toBe(false);
	});

	it('is not satisfied by a successful unrelated skill_load this turn', () => {
		const toolExecutions = [
			createExecution({
				name: 'skill_load',
				args: { skill: 'cold_email_engagement_first_outreach' },
				result: { type: 'skill', id: 'cold_email_engagement_first_outreach' }
			})
		];
		expect(shouldRepairSkillGateNoLoad({ ...baseParams, toolExecutions })).toBe(true);
	});

	it('allows a loaded child skill to satisfy a parent candidate', () => {
		const toolExecutions = [
			createExecution({
				name: 'skill_load',
				args: { skill: 'viral_video_script_structure' },
				result: { type: 'skill', id: 'viral_video_script_structure' }
			})
		];
		expect(
			shouldRepairSkillGateNoLoad({
				...baseParams,
				acceptableSkillIds: ['content_strategy_beyond_blogging'],
				toolExecutions
			})
		).toBe(false);
	});

	it('is not satisfied by a failed skill_load', () => {
		const toolExecutions = [
			createExecution({
				name: 'skill_load',
				args: { skill: 'story_driven_content_craft' },
				success: false,
				error: 'skill not found'
			})
		];
		expect(shouldRepairSkillGateNoLoad({ ...baseParams, toolExecutions })).toBe(true);
	});

	it('does not allow document reads or unrelated prior ledger skills to satisfy the gate', () => {
		const toolExecutions = [
			createExecution({
				name: 'get_document_outline',
				args: { document_id: 'doc-1' },
				result: { outline: [] }
			})
		];
		expect(shouldRepairSkillGateNoLoad({ ...baseParams, toolExecutions })).toBe(true);
		expect(
			shouldRepairSkillGateNoLoad({
				...baseParams,
				toolExecutions,
				historyLoadedSkillIds: ['cold_email_engagement_first_outreach']
			})
		).toBe(true);
	});

	it('is satisfied by a relevant prior-session ledger skill', () => {
		expect(
			shouldRepairSkillGateNoLoad({
				...baseParams,
				historyLoadedSkillIds: ['story_driven_content_craft']
			})
		).toBe(false);
	});

	it('falls back to any successful load when sensing provided no acceptable ids', () => {
		const toolExecutions = [
			createExecution({
				name: 'skill_load',
				args: { skill: 'cold_email_engagement_first_outreach' },
				result: { type: 'skill', id: 'cold_email_engagement_first_outreach' }
			})
		];
		expect(
			shouldRepairSkillGateNoLoad({
				...baseParams,
				acceptableSkillIds: [],
				toolExecutions
			})
		).toBe(false);
		expect(
			shouldRepairSkillGateNoLoad({
				...baseParams,
				acceptableSkillIds: [],
				historyLoadedSkillIds: ['cold_email_engagement_first_outreach']
			})
		).toBe(false);
	});

	it('fires at most once per turn', () => {
		expect(shouldRepairSkillGateNoLoad({ ...baseParams, repairAlreadyInjected: true })).toBe(
			false
		);
	});

	it('allows a pure clarifying question through without a load', () => {
		expect(
			shouldRepairSkillGateNoLoad({
				...baseParams,
				finalText:
					'Which video draft do you want me to rework — the 90-second launch cut or the long-form one?'
			})
		).toBe(false);
	});

	it('names the candidate skills and the skill_search fallback in the instruction', () => {
		const instruction = buildSkillGateNoLoadRepairInstruction([
			'story_driven_content_craft',
			'viral_video_script_structure'
		]);
		expect(instruction).toContain('skill_load');
		expect(instruction).toContain('no matching skill has been loaded');
		expect(instruction).toContain('story_driven_content_craft, viral_video_script_structure');
		expect(instruction).toContain('skill_search');
		// The rerun failure wrote the document BEFORE finalizing, so the repair
		// fires after the write; the instruction must demand re-applying the
		// skill to already-persisted content, not just to the final prose.
		expect(instruction).toContain('update the entity again before finalizing');
	});

	it('still demands a load when no candidates were surfaced', () => {
		const instruction = buildSkillGateNoLoadRepairInstruction([]);
		expect(instruction).toContain('skill_load');
		expect(instruction).toContain('Active Domain Signals');
	});
});
