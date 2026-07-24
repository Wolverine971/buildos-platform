import { describe, expect, it } from 'vitest';
import {
	buildTaskGoalLinks,
	interpretTaskGoalEdge,
	type TaskGoalEdge,
	type TaskGoalRelationship
} from './edge-direction';

describe('interpretTaskGoalEdge', () => {
	it.each<
		[TaskGoalRelationship, TaskGoalEdge['src_kind'], TaskGoalEdge['dst_kind'], string, string]
	>([
		['supports_goal', 'task', 'goal', 'task-1', 'goal-1'],
		['supports_goal', 'goal', 'task', 'goal-1', 'task-1'],
		['has_task', 'goal', 'task', 'goal-1', 'task-1'],
		['has_task', 'task', 'goal', 'task-1', 'goal-1'],
		['achieved_by', 'goal', 'task', 'goal-1', 'task-1'],
		['achieved_by', 'task', 'goal', 'task-1', 'goal-1']
	])('interprets %s stored as %s -> %s', (rel, src_kind, dst_kind, src_id, dst_id) => {
		expect(interpretTaskGoalEdge({ rel, src_kind, dst_kind, src_id, dst_id })).toEqual({
			taskId: src_kind === 'task' ? src_id : dst_id,
			goalId: src_kind === 'goal' ? src_id : dst_id,
			rel
		});
	});

	it('rejects unrelated relationships and endpoint kinds', () => {
		expect(
			interpretTaskGoalEdge({
				src_id: 'task-1',
				src_kind: 'task',
				dst_id: 'goal-1',
				dst_kind: 'goal',
				rel: 'depends_on'
			})
		).toBeNull();

		expect(
			interpretTaskGoalEdge({
				src_id: 'task-1',
				src_kind: 'task',
				dst_id: 'task-2',
				dst_kind: 'task',
				rel: 'has_task'
			})
		).toBeNull();
	});
});

describe('buildTaskGoalLinks', () => {
	it('ignores invalid edges and keeps the first relationship for each task/goal pair', () => {
		const edges: TaskGoalEdge[] = [
			{
				src_id: 'task-1',
				src_kind: 'task',
				dst_id: 'goal-1',
				dst_kind: 'goal',
				rel: 'supports_goal'
			},
			{
				src_id: 'goal-1',
				src_kind: 'goal',
				dst_id: 'task-1',
				dst_kind: 'task',
				rel: 'achieved_by'
			},
			{
				src_id: 'plan-1',
				src_kind: 'plan',
				dst_id: 'task-2',
				dst_kind: 'task',
				rel: 'has_task'
			},
			{
				src_id: 'task-2',
				src_kind: 'task',
				dst_id: 'goal-2',
				dst_kind: 'goal',
				rel: 'has_task'
			}
		];

		expect(buildTaskGoalLinks(edges)).toEqual([
			{ taskId: 'task-1', goalId: 'goal-1', rel: 'supports_goal' },
			{ taskId: 'task-2', goalId: 'goal-2', rel: 'has_task' }
		]);
	});
});
