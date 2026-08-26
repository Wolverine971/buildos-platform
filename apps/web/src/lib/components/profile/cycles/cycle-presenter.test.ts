// apps/web/src/lib/components/profile/cycles/cycle-presenter.test.ts
import type { CycleDefinition, CycleSchedule, CycleTrigger } from '@buildos/shared-types';
import { describe, expect, it } from 'vitest';
import {
	formatCycleSchedule,
	presentCycle,
	presentCycleCadence,
	presentCycleKind,
	presentCycleStatus
} from './cycle-presenter';

const scheduleTrigger = (schedule: CycleSchedule, state: 'active' | 'paused' = 'active') =>
	({
		id: 'trigger-1',
		cycle_id: 'cycle-1',
		type: 'schedule',
		schedule,
		state,
		version: 1,
		next_run_at: '2026-08-27T13:00:00.000Z',
		last_fired_at: null,
		created_at: '2026-08-26T12:00:00.000Z',
		updated_at: '2026-08-26T12:00:00.000Z',
		deleted_at: null
	}) satisfies CycleTrigger;

function cycle(overrides: Partial<CycleDefinition> = {}): CycleDefinition {
	return {
		id: 'cycle-1',
		user_id: 'user-1',
		label: 'Daily Brief',
		kind: 'daily_brief',
		state: 'active',
		target: { type: 'user', project_id: null },
		triggers: [
			scheduleTrigger({
				type: 'daily',
				time_of_day: '09:00',
				timezone: 'America/New_York'
			})
		],
		config: {},
		policy: { overlap: 'skip', misfire: 'run_once', max_attempts: 3 },
		attention_policy: 'always',
		version: 1,
		next_run_at: '2026-08-27T13:00:00.000Z',
		last_run_at: '2026-08-26T13:00:00.000Z',
		last_run_id: 'run-1',
		last_error: null,
		created_at: '2026-08-26T12:00:00.000Z',
		updated_at: '2026-08-26T12:00:00.000Z',
		deleted_at: null,
		...overrides
	} as CycleDefinition;
}

describe('Cycle presenter', () => {
	const scheduleCases: Array<{
		label: string;
		schedule: CycleSchedule;
		expected: string;
	}> = [
		{
			label: 'daily schedule',
			schedule: { type: 'daily', time_of_day: '09:00', timezone: 'America/New_York' },
			expected: 'Every day at 9:00 AM · America/New_York'
		},
		{
			label: 'weekly schedule with one weekday',
			schedule: {
				type: 'weekly',
				days_of_week: [1],
				time_of_day: '10:30',
				timezone: 'America/Chicago'
			},
			expected: 'Every Monday at 10:30 AM · America/Chicago'
		},
		{
			label: 'weekly schedule with multiple weekdays',
			schedule: {
				type: 'weekly',
				days_of_week: [1, 3, 5],
				time_of_day: '16:00',
				timezone: 'Europe/London'
			},
			expected: 'Every Monday, Wednesday, Friday at 4:00 PM · Europe/London'
		},
		{
			label: 'interval schedule',
			schedule: {
				type: 'interval',
				every_minutes: 120,
				anchor_at: '2026-08-26T12:00:00Z'
			},
			expected: 'Every 2 hours'
		}
	];

	it.each(scheduleCases)(
		'formats $label without locale-fragile defaults',
		({ schedule, expected }) => {
			expect(formatCycleSchedule(schedule, 'en-US')).toBe(expected);
		}
	);

	it('distinguishes no active schedule from a paused schedule', () => {
		expect(presentCycleCadence(cycle({ triggers: [] }), 'en-US')).toBe('No active schedule');
		expect(
			presentCycleCadence(
				cycle({
					triggers: [
						scheduleTrigger(
							{
								type: 'daily',
								time_of_day: '09:00',
								timezone: 'America/New_York'
							},
							'paused'
						)
					]
				}),
				'en-US'
			)
		).toContain('Schedule paused');
	});

	it.each([
		['preview', cycle(), 'Preview'],
		['authoritative active', cycle(), 'Active'],
		['authoritative paused', cycle({ state: 'paused' }), 'Paused'],
		['attention', cycle({ last_error: 'generate_daily_brief failed' }), 'Needs attention']
	])('presents %s truthfully', (name, definition, expected) => {
		const authority = name === 'preview' ? 'preview' : 'authoritative';
		expect(presentCycleStatus(definition, authority).label).toBe(expected);
	});

	it('never turns a preview row into an execution promise', () => {
		const presentation = presentCycle(cycle(), {
			authority: 'preview',
			now: new Date('2026-08-26T12:00:00.000Z'),
			locale: 'en-US',
			displayTimeZone: 'UTC'
		});
		expect(presentation.status.label).toBe('Preview');
		expect(presentation.nextRun).toBeNull();
		expect(presentation.lastRun).toContain('Aug 26, 2026');
	});

	it('shows next run only for authoritative active Cycles', () => {
		const active = presentCycle(cycle(), {
			authority: 'authoritative',
			locale: 'en-US',
			displayTimeZone: 'UTC'
		});
		const paused = presentCycle(cycle({ state: 'paused' }), {
			authority: 'authoritative',
			locale: 'en-US',
			displayTimeZone: 'UTC'
		});
		expect(active.nextRun).toContain('Aug 27, 2026');
		expect(paused.nextRun).toBeNull();
	});

	it('has user-facing names for known kinds and a defensive fallback', () => {
		expect(presentCycleKind('project_audit').label).toBe('Project Audit');
		expect(presentCycleKind('future_kind').label).toBe('Recurring work');
	});
});
