import { describe, expect, it } from 'vitest';
import { buildProjectGoalConnectionOverview } from './project-goal-connection-summary';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const GOAL_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_GOAL_ID = '33333333-3333-4333-8333-333333333333';

function task(id: string, state_key: 'todo' | 'in_progress' | 'blocked' | 'done', goalId?: string) {
	return {
		id,
		state_key,
		props: goalId ? { goal_id: goalId } : {},
		created_at: '2026-08-01T12:00:00.000Z',
		updated_at: '2026-08-02T12:00:00.000Z'
	};
}

function edge(src_kind: string, src_id: string, rel: string, dst_kind: string, dst_id: string) {
	return {
		src_kind,
		src_id,
		rel,
		dst_kind,
		dst_id,
		created_at: '2026-08-03T12:00:00.000Z'
	};
}

describe('buildProjectGoalConnectionOverview', () => {
	it('deduplicates explicit task connections and keeps unconnected tasks project-level', () => {
		const overview = buildProjectGoalConnectionOverview({
			projectId: PROJECT_ID,
			goals: [
				{ id: GOAL_ID, created_at: '2026-08-01T00:00:00.000Z', updated_at: null },
				{ id: OTHER_GOAL_ID, created_at: '2026-08-01T00:00:00.000Z', updated_at: null }
			],
			tasks: [
				task('task-1', 'todo', GOAL_ID),
				task('task-2', 'in_progress'),
				task('task-3', 'blocked')
			],
			plans: [],
			milestones: [],
			edges: [
				edge('goal', GOAL_ID, 'has_task', 'task', 'task-1'),
				edge('task', 'task-2', 'supports_goal', 'goal', GOAL_ID),
				edge('goal', GOAL_ID, 'mentions', 'task', 'task-3')
			]
		});

		expect(overview.tasks).toEqual({ total: 3, connected: 2, project_level: 1 });
		expect(overview.goals[0]?.tasks).toEqual({
			total: 2,
			todo: 1,
			in_progress: 1,
			blocked: 0,
			done: 0
		});
		expect(overview.goals[1]?.tasks.total).toBe(0);
	});

	it('accepts current and legacy plan/checkpoint relationships in either direction', () => {
		const overview = buildProjectGoalConnectionOverview({
			projectId: PROJECT_ID,
			goals: [
				{
					id: GOAL_ID,
					created_at: '2026-08-01T00:00:00.000Z',
					updated_at: '2026-08-02T00:00:00.000Z'
				}
			],
			tasks: [],
			plans: [
				{
					id: 'plan-1',
					state_key: 'active',
					props: {},
					created_at: '2026-08-01T00:00:00.000Z',
					updated_at: '2026-08-04T00:00:00.000Z'
				}
			],
			milestones: [
				{
					id: 'milestone-1',
					state_key: 'completed',
					due_at: '2026-08-05T00:00:00.000Z',
					props: {},
					created_at: '2026-08-01T00:00:00.000Z',
					updated_at: '2026-08-05T00:00:00.000Z'
				},
				{
					id: 'milestone-2',
					state_key: 'pending',
					due_at: '2026-08-09T00:00:00.000Z',
					props: {},
					created_at: '2026-08-01T00:00:00.000Z',
					updated_at: null
				}
			],
			edges: [
				edge('plan', 'plan-1', 'supports_goal', 'goal', GOAL_ID),
				edge('goal', GOAL_ID, 'has_milestone', 'milestone', 'milestone-1'),
				edge('milestone', 'milestone-2', 'has', 'goal', GOAL_ID)
			],
			now: new Date('2026-08-10T00:00:00.000Z')
		});

		const summary = overview.goals[0];
		expect(summary?.plans).toMatchObject({ total: 1, active: 1 });
		expect(summary?.milestones).toMatchObject({ total: 2, completed: 1, overdue: 1 });
		expect(summary?.tracking).toEqual({
			source: 'milestones',
			completed: 1,
			total: 2,
			percent: 50
		});
		expect(summary?.last_activity_at).toBe('2026-08-05T00:00:00.000Z');
	});

	it('returns tracking not set when a goal has no checkpoints', () => {
		const overview = buildProjectGoalConnectionOverview({
			projectId: PROJECT_ID,
			goals: [{ id: GOAL_ID, created_at: '2026-08-01T00:00:00.000Z', updated_at: null }],
			tasks: [],
			plans: [],
			milestones: [],
			edges: []
		});

		expect(overview.goals[0]?.tracking).toEqual({
			source: 'none',
			completed: 0,
			total: 0,
			percent: null
		});
		expect(overview.goals[0]?.last_activity_at).toBe('2026-08-01T00:00:00.000Z');
	});
});
