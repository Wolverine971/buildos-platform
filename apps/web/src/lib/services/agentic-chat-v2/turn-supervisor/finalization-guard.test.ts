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

	it('summarizes read evidence when reads succeeded but final text is empty', () => {
		const call = toolCall('search_project', { query: 'user guide suite' });
		const guard = applyFinalizationGuard({
			finalAssistantText: '',
			assistantText: '',
			toolExecutions: [
				{
					toolCall: call,
					result: toolResult(call, true, {
						results: [
							{
								id: '82dfb1b6-e39d-48cb-8c32-d13c3e620daa',
								type: 'task',
								title: 'Create User Guide Suite (ADHD/TPM/Writers/Devs)',
								state_key: 'todo'
							},
							{
								id: '75ccc94c-30ae-43b8-a05e-5d904899a9d7',
								type: 'task',
								title: 'Create detailed BuildOS guides for Tech Project Managers [MERGED]',
								state_key: 'done'
							}
						]
					})
				}
			]
		});

		expect(guard.applied).toBe(true);
		expect(guard.reason).toBe('empty_after_reads');
		expect(guard.text).toContain('I gathered context before the turn ended.');
		expect(guard.text).toContain(
			'task "Create User Guide Suite (ADHD/TPM/Writers/Devs)" (todo)'
		);
		expect(guard.text).toContain(
			'task "Create detailed BuildOS guides for Tech Project Managers [MERGED]" (done)'
		);
		expect(guard.text).not.toContain('I gathered the requested context');
	});

	it('summarizes workspace overview status when a workspace read-heavy turn has no final text', () => {
		const call = toolCall('get_workspace_overview', { project_limit: 20 });
		const guard = applyFinalizationGuard({
			finalAssistantText: '',
			assistantText: '',
			toolExecutions: [
				{
					toolCall: call,
					result: toolResult(call, true, {
						scope: 'workspace',
						projects_returned: 3,
						maybe_more: true,
						snapshot: {
							returned_projects: 3,
							total_accessible_projects: 36,
							project_limit: 20,
							has_more_projects: true,
							totals_scope: 'returned_projects'
						},
						projects: [
							{
								name: 'BuildOS CEO Training Sprint',
								counts: {
									overdue_tasks: 12,
									due_soon_tasks: 0,
									blocked_tasks: 0
								},
								recent_activity: [{ title: 'Created' }],
								next_step_short: 'Review the Calendar-Based Plan'
							},
							{
								name: 'BuildOS CEO Training Sprint',
								counts: {
									overdue_tasks: 5,
									due_soon_tasks: 0,
									blocked_tasks: 0
								},
								recent_activity: []
							},
							{
								name: '9takes',
								counts: {
									overdue_tasks: 11,
									due_soon_tasks: 4,
									blocked_tasks: 2
								},
								recent_activity: []
							}
						]
					})
				}
			]
		});

		expect(guard.applied).toBe(true);
		expect(guard.reason).toBe('empty_after_reads');
		expect(guard.text).toContain('showing 3 of 36 accessible projects');
		expect(guard.text).toContain('Snapshot totals cover only the returned projects');
		expect(guard.text).toContain('BuildOS CEO Training Sprint (2 copies) - 17 overdue');
		expect(guard.text).toContain('9takes - 11 overdue, 4 due soon, 2 blocked');
	});

	it('says the change was not made when a mutation was requested but never ran', () => {
		// Reproduces the "did you update it?" pattern: the turn spent its budget on
		// reads, never executed the requested write, and previously emitted the soothing
		// "I gathered context before the turn ended" summary that reads as a finished
		// answer. With mutationRequested set, the guard must say nothing was updated.
		const call = toolCall('search_project', { query: 'start here doc' });
		const guard = applyFinalizationGuard({
			finalAssistantText: '',
			assistantText: '',
			mutationRequested: true,
			toolExecutions: [
				{
					toolCall: call,
					result: toolResult(call, true, {
						results: [
							{
								id: 'doc_1',
								type: 'document',
								title: 'START HERE',
								state_key: 'active'
							}
						]
					})
				}
			]
		});

		expect(guard.applied).toBe(true);
		expect(guard.reason).toBe('incomplete_mutation_after_reads');
		expect(guard.text).toContain('not made the change yet');
		expect(guard.text).toContain('nothing was updated');
	});

	it('replaces a write lead-in with an honest incomplete notice when no write ran', () => {
		const call = toolCall('search_project', { query: 'start here doc' });
		const guard = applyFinalizationGuard({
			finalAssistantText: "I'll update that doc now.",
			assistantText: "I'll update that doc now.",
			mutationRequested: true,
			toolExecutions: [{ toolCall: call, result: toolResult(call, true, { results: [] }) }]
		});

		expect(guard.applied).toBe(true);
		expect(guard.reason).toBe('incomplete_mutation_after_reads');
		expect(guard.text).not.toContain("I'll update that doc");
		expect(guard.text).toContain('nothing was updated');
	});

	it('still credits a successful write even when mutationRequested is set', () => {
		const call = toolCall('update_onto_task', { task_id: 'task_1', state_key: 'done' });
		const guard = applyFinalizationGuard({
			finalAssistantText: '',
			assistantText: '',
			mutationRequested: true,
			toolExecutions: [{ toolCall: call, result: toolResult(call, true) }]
		});

		expect(guard.applied).toBe(true);
		expect(guard.reason).toBe('empty_after_successful_writes');
		expect(guard.text).toBe('I completed the requested change.');
	});

	it('replaces a read-only lead-in after successful reads with evidence', () => {
		const call = toolCall('search_project', { query: 'user guide suite' });
		const guard = applyFinalizationGuard({
			finalAssistantText: "I'll look that up now.",
			assistantText: "I'll look that up now.",
			toolExecutions: [
				{
					toolCall: call,
					result: toolResult(call, true, {
						results: [
							{
								id: '82dfb1b6-e39d-48cb-8c32-d13c3e620daa',
								type: 'task',
								title: 'Create User Guide Suite (ADHD/TPM/Writers/Devs)',
								state_key: 'todo'
							}
						]
					})
				}
			]
		});

		expect(guard.applied).toBe(true);
		expect(guard.reason).toBe('lead_in_after_reads');
		expect(guard.text).toContain('I gathered context before the turn ended.');
		expect(guard.text).toContain(
			'task "Create User Guide Suite (ADHD/TPM/Writers/Devs)" (todo)'
		);
		expect(guard.text).not.toContain("I'll look that up");
	});
});
