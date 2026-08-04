import { describe, expect, it } from 'vitest';
import { buildLastTurnContext, buildLastTurnContextDraftV1 } from './last-turn-context';

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
