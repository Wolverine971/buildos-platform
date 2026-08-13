// apps/web/src/lib/types/goal-tracking.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildGoalTrackingView,
	emptyGoalTrackingConfig,
	readGoalTrackingConfig,
	type GoalTrackingConfig
} from './goal-tracking';
import type { GoalConnectionSummary } from './goal-connection-summary';

function summary(overrides: Partial<GoalConnectionSummary> = {}): GoalConnectionSummary {
	return {
		goal_id: 'goal-1',
		created_at: '2026-08-01T00:00:00.000Z',
		updated_at: null,
		last_activity_at: '2026-08-01T00:00:00.000Z',
		tasks: {
			total: 4,
			todo: 1,
			in_progress: 1,
			blocked: 0,
			done: 2,
			items: []
		},
		plans: { total: 0, draft: 0, active: 0, completed: 0, items: [] },
		milestones: {
			total: 5,
			pending: 2,
			in_progress: 1,
			completed: 2,
			missed: 0,
			overdue: 0,
			next_due_at: null,
			items: []
		},
		tracking: { source: 'milestones', completed: 2, total: 5, percent: 40 },
		...overrides
	};
}

describe('goal tracking', () => {
	it('keeps progress unset until the user chooses a method', () => {
		expect(buildGoalTrackingView(emptyGoalTrackingConfig(), summary())).toMatchObject({
			method: 'none',
			percent: null,
			hasData: false
		});
	});

	it('calculates task and milestone completion only for the selected method', () => {
		expect(
			buildGoalTrackingView({ version: 1, method: 'tasks', updated_at: null }, summary())
		).toMatchObject({ percent: 50, detail: '2/4 done' });
		expect(
			buildGoalTrackingView({ version: 1, method: 'milestones', updated_at: null }, summary())
		).toMatchObject({ percent: 40, detail: '2/5 complete' });
	});

	it('keeps an explicitly selected source unscored when nothing is connected', () => {
		const emptySummary = summary({
			tasks: { total: 0, todo: 0, in_progress: 0, blocked: 0, done: 0, items: [] },
			milestones: {
				total: 0,
				pending: 0,
				in_progress: 0,
				completed: 0,
				missed: 0,
				overdue: 0,
				next_due_at: null,
				items: []
			}
		});

		expect(
			buildGoalTrackingView({ version: 1, method: 'tasks', updated_at: null }, emptySummary)
		).toMatchObject({ percent: null, hasData: false, detail: 'No tasks connected' });
		expect(
			buildGoalTrackingView(
				{ version: 1, method: 'milestones', updated_at: null },
				emptySummary
			)
		).toMatchObject({ percent: null, hasData: false, detail: 'No milestones connected' });
	});

	it('handles increasing and decreasing metric targets', () => {
		const increasing: GoalTrackingConfig = {
			version: 1,
			method: 'metric',
			updated_at: null,
			metric: { label: 'Families', start: 0, current: 30, target: 60, unit: null }
		};
		const decreasing: GoalTrackingConfig = {
			version: 1,
			method: 'metric',
			updated_at: null,
			metric: { label: 'Response time', start: 10, current: 6, target: 2, unit: 'days' }
		};

		expect(buildGoalTrackingView(increasing, summary()).percent).toBe(50);
		expect(buildGoalTrackingView(decreasing, summary()).percent).toBe(50);
	});

	it('normalizes persisted manual tracking data', () => {
		const config = readGoalTrackingConfig({
			goal_tracking: {
				method: 'manual',
				updated_at: '2026-08-12T12:00:00.000Z',
				manual: { percent: 140, note: '  Evidence reviewed  ' }
			}
		});

		expect(config.manual).toEqual({ percent: 100, note: 'Evidence reviewed' });
	});
});
