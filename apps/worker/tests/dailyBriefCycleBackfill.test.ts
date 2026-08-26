// apps/worker/tests/dailyBriefCycleBackfill.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	backfillDailyBriefCycles,
	buildDailyBriefCycleBackfillCandidate,
	type DailyBriefCycleBackfillStore,
	type LegacyBriefPreference
} from '../src/workers/cycle/dailyBriefCycleBackfill';

const NOW = new Date('2026-08-25T12:00:00.000Z');

function preference(overrides: Partial<LegacyBriefPreference> = {}): LegacyBriefPreference {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		user_id: '22222222-2222-4222-8222-222222222222',
		created_at: '2026-08-01T00:00:00.000Z',
		updated_at: '2026-08-01T00:00:00.000Z',
		frequency: 'daily',
		day_of_week: null,
		time_of_day: '09:00:00',
		is_active: true,
		...overrides
	};
}

describe('Daily Brief Cycle backfill', () => {
	it('maps daily and weekly legacy preferences to timezone-aware schedules', () => {
		const daily = buildDailyBriefCycleBackfillCandidate({
			preference: preference(),
			user: { id: '22222222-2222-4222-8222-222222222222', timezone: 'America/New_York' },
			now: NOW
		});
		const weekly = buildDailyBriefCycleBackfillCandidate({
			preference: preference({ frequency: 'weekly', day_of_week: 1 }),
			user: { id: '22222222-2222-4222-8222-222222222222', timezone: 'America/New_York' },
			now: NOW
		});

		expect(daily).toEqual({
			candidate: expect.objectContaining({
				schedule: {
					type: 'daily',
					time_of_day: '09:00:00',
					timezone: 'America/New_York'
				},
				nextRunAt: '2026-08-25T13:00:00.000Z'
			})
		});
		expect(weekly).toEqual({
			candidate: expect.objectContaining({
				schedule: expect.objectContaining({ type: 'weekly', days_of_week: [1] })
			})
		});
	});

	it('rejects unsupported legacy values instead of inventing intent', () => {
		expect(
			buildDailyBriefCycleBackfillCandidate({
				preference: preference({ frequency: 'custom' }),
				user: { id: '22222222-2222-4222-8222-222222222222', timezone: 'UTC' },
				now: NOW
			})
		).toEqual({ error: 'frequency_unsupported' });
		expect(
			buildDailyBriefCycleBackfillCandidate({
				preference: preference(),
				user: { id: '22222222-2222-4222-8222-222222222222', timezone: 'Mars/Olympus' },
				now: NOW
			})
		).toEqual({ error: 'timezone_invalid' });
	});

	it('uses cursor batches, batch-loads related rows, and stays idempotent', async () => {
		const first = preference();
		const existing = preference({
			id: '33333333-3333-4333-8333-333333333333',
			user_id: '44444444-4444-4444-8444-444444444444'
		});
		const store: DailyBriefCycleBackfillStore = {
			listPreferences: vi
				.fn()
				.mockResolvedValueOnce([first, existing])
				.mockResolvedValueOnce([]),
			loadUsers: vi.fn().mockResolvedValue([
				{ id: first.user_id, timezone: 'America/New_York' },
				{ id: existing.user_id, timezone: 'UTC' }
			]),
			loadExistingCycleUserIds: vi.fn().mockResolvedValue(new Set([existing.user_id])),
			createPausedCycle: vi.fn().mockResolvedValue('created')
		};

		const summary = await backfillDailyBriefCycles({
			store,
			now: NOW,
			dryRun: false,
			batchSize: 2
		});

		expect(summary).toMatchObject({
			scanned: 2,
			valid: 1,
			created: 1,
			alreadyExists: 1,
			failed: 0
		});
		expect(store.loadUsers).toHaveBeenCalledTimes(1);
		expect(store.loadExistingCycleUserIds).toHaveBeenCalledTimes(1);
		expect(store.createPausedCycle).toHaveBeenCalledWith(
			expect.objectContaining({ userId: first.user_id })
		);
		expect(store.listPreferences).toHaveBeenNthCalledWith(2, {
			afterPreferenceId: existing.id,
			limit: 2
		});
	});

	it('dry-runs without mutation and reports invalid rows', async () => {
		const valid = preference();
		const invalid = preference({
			id: '33333333-3333-4333-8333-333333333333',
			user_id: '44444444-4444-4444-8444-444444444444',
			frequency: 'custom'
		});
		const store: DailyBriefCycleBackfillStore = {
			listPreferences: vi
				.fn()
				.mockResolvedValueOnce([valid, invalid])
				.mockResolvedValueOnce([]),
			loadUsers: vi.fn().mockResolvedValue([
				{ id: valid.user_id, timezone: 'UTC' },
				{ id: invalid.user_id, timezone: 'UTC' }
			]),
			loadExistingCycleUserIds: vi.fn().mockResolvedValue(new Set()),
			createPausedCycle: vi.fn()
		};

		const summary = await backfillDailyBriefCycles({ store, now: NOW });

		expect(summary).toMatchObject({
			dryRun: true,
			wouldCreate: 1,
			skippedInvalid: 1,
			created: 0
		});
		expect(store.createPausedCycle).not.toHaveBeenCalled();
	});
});
