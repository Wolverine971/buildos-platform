// apps/web/src/lib/components/ontology/insight-panels/panel-data-controller.test.ts
import { describe, expect, it } from 'vitest';
import { ASSIGNEE_FILTER_UNASSIGNED } from './insight-panel-config';
import { filterInsightEntity } from './panel-data-controller';

describe('filterInsightEntity', () => {
	it('excludes items when selected filter field value is null', () => {
		const matches = filterInsightEntity(
			{
				id: 'task-1',
				state_key: 'in_progress',
				type_key: null,
				deleted_at: null
			},
			{ type_key: ['work_item'] },
			{ showDeleted: true, showCompleted: true },
			'tasks',
			{ currentActorId: 'actor-me' }
		);

		expect(matches).toBe(false);
	});

	it('includes items when selected filter field value matches', () => {
		const matches = filterInsightEntity(
			{
				id: 'task-2',
				state_key: 'in_progress',
				type_key: 'work_item',
				deleted_at: null
			},
			{ type_key: ['work_item'] },
			{ showDeleted: true, showCompleted: true },
			'tasks',
			{ currentActorId: 'actor-me' }
		);

		expect(matches).toBe(true);
	});

	it('supports task assignee special filter semantics for unassigned tasks', () => {
		const matches = filterInsightEntity(
			{
				id: 'task-3',
				state_key: 'in_progress',
				assignees: [],
				deleted_at: null
			},
			{ assignee_actor_id: [ASSIGNEE_FILTER_UNASSIGNED] },
			{ showDeleted: true, showCompleted: true },
			'tasks',
			{ currentActorId: 'actor-me' }
		);

		expect(matches).toBe(true);
	});
});
