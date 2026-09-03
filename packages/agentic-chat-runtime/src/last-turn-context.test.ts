// packages/agentic-chat-runtime/src/last-turn-context.test.ts
import { describe, expect, it } from 'vitest';
import { buildLastTurnContext, buildLastTurnContextDraftV1 } from './last-turn-context';
import { CONTROL_TOOL_NAMES } from './loop/tool-classification';

describe('portable last-turn context builder', () => {
	it('builds the same continuity payload before the database supplies its timestamp', () => {
		const input = {
			assistantText: 'Updated the launch task.',
			userMessage: 'Please check the launch task.',
			contextType: 'global' as const,
			toolExecutions: [
				{
					toolCall: {
						id: 'provider-call-1',
						type: 'function' as const,
						function: { name: 'onto_task_read', arguments: '{}' }
					},
					result: {
						tool_call_id: 'provider-call-1',
						success: true,
						result: {
							task: {
								id: 'da000000-0000-4000-8000-000000000001',
								title: 'Launch task'
							}
						}
					}
				}
			]
		};
		const draft = buildLastTurnContextDraftV1(input);

		expect(draft).toMatchObject({
			summary: 'Updated the launch task.',
			context_type: 'global',
			data_accessed: ['onto_task_read'],
			entities: {
				tasks: [
					{
						id: 'da000000-0000-4000-8000-000000000001',
						name: 'Launch task'
					}
				]
			}
		});
		expect(draft).not.toHaveProperty('timestamp');
		expect(buildLastTurnContext({ ...input, timestamp: '2026-08-04T12:00:00.000Z' })).toEqual({
			...draft,
			timestamp: '2026-08-04T12:00:00.000Z'
		});
	});

	it('keeps harness control tools out of data_accessed (F-11)', () => {
		const call = (name: string, id: string) => ({
			toolCall: {
				id,
				type: 'function' as const,
				function: { name, arguments: '{}' }
			},
			result: { tool_call_id: id, success: true, result: { ok: true } }
		});
		const draft = buildLastTurnContextDraftV1({
			assistantText: 'Marked the launch task done.',
			userMessage: 'Mark the launch task done.',
			contextType: 'project',
			entityId: 'da000000-0000-4000-8000-0000000000aa',
			toolExecutions: [
				call('get_onto_task_details', 'c1'),
				call('declare_turn_contract', 'c2'),
				call('approve_turn_contract_review', 'c3'),
				call('update_onto_task', 'c4'),
				call('approve_mutation_batch_review', 'c5'),
				call('request_proposal_revision', 'c6'),
				call('declare_read_only_turn', 'c7'),
				call('request_turn_clarification', 'c8'),
				call('cancel_turn_contract', 'c9')
			]
		});
		expect(draft.data_accessed).toEqual(['get_onto_task_details', 'update_onto_task']);
	});

	it('hides exactly the control-tool set the loop classifier uses', () => {
		const draft = buildLastTurnContextDraftV1({
			assistantText: '',
			userMessage: '',
			contextType: 'global',
			toolExecutions: Array.from(CONTROL_TOOL_NAMES).map((name, index) => ({
				toolCall: {
					id: `ctl-${index}`,
					type: 'function' as const,
					function: { name, arguments: '{}' }
				},
				result: { tool_call_id: `ctl-${index}`, success: true, result: {} }
			}))
		});
		expect(draft.data_accessed).toEqual([]);
	});

	it('retains the legacy UUID version and variant filter', () => {
		const draft = buildLastTurnContextDraftV1({
			assistantText: '[[task:da000000-0000-0000-0000-000000000001|Not a standards UUID]]',
			userMessage: '',
			contextType: 'global',
			toolExecutions: []
		});
		expect(draft.entities).toEqual({});
	});
});
