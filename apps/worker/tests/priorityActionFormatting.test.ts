// apps/worker/tests/priorityActionFormatting.test.ts
import { describe, expect, it } from 'vitest';

import {
	buildProjectEntityHref,
	extractPriorityActions,
	formatPriorityActionMarkdown
} from '../src/workers/brief/priorityActionFormatting';
import type {
	GoalProgress,
	OntoTask,
	ProjectBriefData
} from '../src/workers/brief/ontologyBriefTypes';

function task(overrides: Partial<OntoTask> = {}): OntoTask {
	return {
		id: 'task-1',
		project_id: 'project-1',
		title: 'Approve launch plan',
		priority: 1,
		due_at: '2026-08-27T12:00:00.000Z',
		state_key: 'todo',
		...overrides
	} as OntoTask;
}

describe('priority action formatting', () => {
	it('links task and goal actions while keeping their display text plain', () => {
		const priorityTask = task();
		const goal = {
			goal: {
				id: 'goal-1',
				project_id: 'project-1',
				name: 'Acquire 25 activated trial users'
			},
			status: 'at_risk'
		} as GoalProgress;

		const actions = extractPriorityActions({
			overdueTasks: [priorityTask],
			todaysTasks: [priorityTask],
			projects: [{ unblockingTasks: [] } as Pick<ProjectBriefData, 'unblockingTasks'>],
			goals: [goal]
		});

		expect(actions).toEqual([
			{
				text: 'Approve launch plan',
				href: '/projects/project-1/tasks/task-1'
			},
			{
				text: 'Address goal: Acquire 25 activated trial users',
				href: '/projects/project-1?entity=goal&entity_id=goal-1'
			}
		]);
		expect(formatPriorityActionMarkdown(actions[0])).toBe(
			'[Approve launch plan](/projects/project-1/tasks/task-1)'
		);
	});

	it('builds the same entity deep-link contract consumed by the project workspace', () => {
		expect(buildProjectEntityHref('project/1', 'risk', 'risk 1')).toBe(
			'/projects/project%2F1?entity=risk&entity_id=risk+1'
		);
	});
});
