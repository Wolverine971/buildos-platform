// apps/web/src/lib/utils/overdue-task-batches.test.ts
import { describe, expect, it } from 'vitest';

import type { OverdueTask } from '$lib/types/overdue-triage';
import { buildOverdueProjectBatches, sortBatchTasks } from './overdue-task-batches';

function createTask(overrides: Partial<OverdueTask>): OverdueTask {
	return {
		id: 'task-default',
		project_id: 'project-a',
		project_name: 'Project A',
		project_state_key: 'active',
		project_updated_at: '2026-03-26T12:00:00.000Z',
		title: 'Task',
		description: null,
		state_key: 'todo',
		due_at: '2026-03-20T12:00:00.000Z',
		priority: null,
		updated_at: '2026-03-26T12:00:00.000Z',
		is_assigned_to_me: false,
		project_is_shared: false,
		project_is_collaborative: false,
		assignees: [],
		lane: 'other',
		...overrides
	};
}

describe('sortBatchTasks', () => {
	it('prioritizes assigned tasks before other overdue tasks within a project', () => {
		const sorted = sortBatchTasks([
			createTask({
				id: 'later-assigned',
				is_assigned_to_me: true,
				due_at: '2026-03-22T12:00:00.000Z'
			}),
			createTask({
				id: 'earlier-unassigned',
				is_assigned_to_me: false,
				due_at: '2026-03-19T12:00:00.000Z'
			})
		]);

		expect(sorted.map((task) => task.id)).toEqual(['later-assigned', 'earlier-unassigned']);
	});
});

describe('buildOverdueProjectBatches', () => {
	it('groups tasks by project and sorts collaborative assigned batches first', () => {
		const batches = buildOverdueProjectBatches([
			createTask({
				id: 'other-task',
				project_id: 'project-b',
				project_name: 'Project B',
				due_at: '2026-03-18T12:00:00.000Z'
			}),
			createTask({
				id: 'assigned-collab-task',
				project_id: 'project-a',
				project_name: 'Project A',
				project_is_shared: true,
				project_is_collaborative: true,
				is_assigned_to_me: true,
				lane: 'assigned_collab',
				due_at: '2026-03-20T12:00:00.000Z'
			})
		]);

		expect(batches.map((batch) => batch.project_id)).toEqual(['project-a', 'project-b']);
		expect(batches[0]?.assigned_to_me_count).toBe(1);
		expect(batches[0]?.lane).toBe('assigned_collab');
	});
});
