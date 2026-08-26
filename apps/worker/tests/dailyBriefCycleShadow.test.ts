// apps/worker/tests/dailyBriefCycleShadow.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	getDailyBriefCycleShadowHealthSnapshot,
	runDailyBriefCycleShadow,
	type DailyBriefCycleShadowStore,
	type DailyBriefShadowCycle
} from '../src/workers/cycle/dailyBriefCycleShadow';
import type { LegacyBriefPreference } from '../src/workers/cycle/dailyBriefCycleBackfill';

const NOW = new Date('2026-08-25T12:00:00.000Z');

function preference(id: string, userId: string): LegacyBriefPreference {
	return {
		id,
		user_id: userId,
		created_at: '2026-08-01T00:00:00.000Z',
		updated_at: '2026-08-01T00:00:00.000Z',
		frequency: 'daily',
		day_of_week: null,
		time_of_day: '09:00:00',
		is_active: true
	};
}

function cycle(id: string, userId: string, timeOfDay = '09:00:00'): DailyBriefShadowCycle {
	return {
		id,
		user_id: userId,
		state: 'paused',
		cycle_triggers: [
			{
				id: `${id}-trigger`,
				state: 'active',
				trigger_type: 'schedule',
				spec: {
					type: 'schedule',
					schedule: {
						type: 'daily',
						time_of_day: timeOfDay,
						timezone: 'America/New_York'
					}
				}
			}
		]
	};
}

describe('Daily Brief Cycle shadow comparison', () => {
	it('reports matches, projection drift, and missing Cycles without mutation', async () => {
		const matchingPreference = preference(
			'11111111-1111-4111-8111-111111111111',
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
		);
		const mismatchedPreference = preference(
			'22222222-2222-4222-8222-222222222222',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
		);
		const missingPreference = preference(
			'33333333-3333-4333-8333-333333333333',
			'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
		);
		const store: DailyBriefCycleShadowStore = {
			listActivePreferences: vi
				.fn()
				.mockResolvedValueOnce([
					matchingPreference,
					mismatchedPreference,
					missingPreference
				])
				.mockResolvedValueOnce([]),
			loadUsers: vi.fn().mockResolvedValue([
				{ id: matchingPreference.user_id, timezone: 'America/New_York' },
				{ id: mismatchedPreference.user_id, timezone: 'America/New_York' },
				{ id: missingPreference.user_id, timezone: 'America/New_York' }
			]),
			loadCycles: vi
				.fn()
				.mockResolvedValue([
					cycle('44444444-4444-4444-8444-444444444444', matchingPreference.user_id),
					cycle(
						'55555555-5555-4555-8555-555555555555',
						mismatchedPreference.user_id,
						'10:00:00'
					)
				])
		};

		const summary = await runDailyBriefCycleShadow({
			store,
			now: NOW,
			calculateLegacyNextRunAt: () => new Date('2026-08-25T13:00:00.000Z')
		});

		expect(summary).toMatchObject({
			scanned: 3,
			comparable: 2,
			matched: 1,
			mismatched: 1,
			missingCycle: 1,
			invalid: 0,
			matchRatePct: 50
		});
		expect(summary.examples.map((example) => example.reason)).toEqual([
			'projection_mismatch',
			'missing_cycle'
		]);
		expect(getDailyBriefCycleShadowHealthSnapshot(true)).toMatchObject({
			state: 'degraded',
			healthy: false,
			lastError: 'shadow_projection_drift_detected'
		});
		expect(store.loadUsers).toHaveBeenCalledTimes(1);
		expect(store.loadCycles).toHaveBeenCalledTimes(1);
	});

	it('bounds work with cursor pagination', async () => {
		const first = preference(
			'11111111-1111-4111-8111-111111111111',
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
		);
		const store: DailyBriefCycleShadowStore = {
			listActivePreferences: vi.fn().mockResolvedValueOnce([first]),
			loadUsers: vi
				.fn()
				.mockResolvedValue([{ id: first.user_id, timezone: 'America/New_York' }]),
			loadCycles: vi
				.fn()
				.mockResolvedValue([cycle('44444444-4444-4444-8444-444444444444', first.user_id)])
		};

		const summary = await runDailyBriefCycleShadow({
			store,
			now: NOW,
			maxRecords: 1,
			calculateLegacyNextRunAt: () => new Date('2026-08-25T13:00:00.000Z')
		});

		expect(summary.scanned).toBe(1);
		expect(getDailyBriefCycleShadowHealthSnapshot(true)).toMatchObject({
			state: 'healthy',
			healthy: true,
			lastError: null
		});
		expect(store.listActivePreferences).toHaveBeenCalledTimes(1);
	});
});
