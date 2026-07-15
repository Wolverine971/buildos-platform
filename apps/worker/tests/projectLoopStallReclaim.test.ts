// apps/worker/tests/projectLoopStallReclaim.test.ts
import { describe, expect, it } from 'vitest';
import { PROJECT_LOOPS_ENABLED } from '../src/config/projectLoops';
import {
	getProjectLoopEndOfDayWindow,
	projectLoopDedupKey,
	selectEndOfDayProjectLoopCandidates
} from '../src/workers/project-loop/enqueue';

describe('PROJECT_LOOPS_ENABLED', () => {
	it('is always on and does not depend on deployment env configuration', () => {
		expect(PROJECT_LOOPS_ENABLED).toBe(true);
	});
});

describe('projectLoopDedupKey', () => {
	it('is stable per project across manual/cron triggers within the same UTC day', () => {
		const morning = new Date('2026-07-01T04:00:00.000Z');
		const later = new Date('2026-07-01T14:32:11.000Z');
		expect(projectLoopDedupKey('proj-1', morning)).toBe('project-loop:proj-1:2026-07-01');
		// A manual web trigger racing the 4am cron collapses onto the same key.
		expect(projectLoopDedupKey('proj-1', later)).toBe(projectLoopDedupKey('proj-1', morning));
	});

	it('rolls to a new key on the next UTC day so later runs are not blocked forever', () => {
		expect(projectLoopDedupKey('proj-1', new Date('2026-07-02T04:00:00.000Z'))).toBe(
			'project-loop:proj-1:2026-07-02'
		);
	});

	it('scopes the key per project', () => {
		const at = new Date('2026-07-01T04:00:00.000Z');
		expect(projectLoopDedupKey('proj-1', at)).not.toBe(projectLoopDedupKey('proj-2', at));
	});
});

describe('project loop end-of-day selection', () => {
	it("opens a user's project-loop window during the first local hour after midnight", () => {
		const now = new Date('2026-07-05T04:15:00.000Z');
		const window = getProjectLoopEndOfDayWindow(now, 'America/New_York');

		expect(window?.completedLocalDate).toBe('2026-07-04');
		expect(window?.start.toISOString()).toBe('2026-07-04T04:00:00.000Z');
		expect(window?.end.toISOString()).toBe('2026-07-05T04:00:00.000Z');
		expect(getProjectLoopEndOfDayWindow(now, 'America/Los_Angeles')).toBeNull();
	});

	it('filters by owner timezone, local-day bounds, and per-user fan-out cap', () => {
		const selection = selectEndOfDayProjectLoopCandidates({
			now: new Date('2026-07-05T04:15:00.000Z'),
			maxProjectsPerUser: 1,
			projects: [
				{
					id: 'recent-ny',
					created_by: 'actor-1',
					updated_at: '2026-07-05T03:30:00.000Z'
				},
				{
					id: 'older-ny',
					created_by: 'actor-1',
					updated_at: '2026-07-04T05:00:00.000Z'
				},
				{
					id: 'previous-local-day',
					created_by: 'actor-1',
					updated_at: '2026-07-04T03:59:00.000Z'
				},
				{
					id: 'la-not-midnight',
					created_by: 'actor-2',
					updated_at: '2026-07-05T03:30:00.000Z'
				},
				{
					id: 'missing-owner',
					created_by: 'actor-3',
					updated_at: '2026-07-05T03:30:00.000Z'
				}
			],
			ownerUserIdsByProjectId: new Map([
				['recent-ny', 'user-1'],
				['older-ny', 'user-1'],
				['previous-local-day', 'user-1'],
				['la-not-midnight', 'user-2']
			]),
			timezoneByUserId: new Map([
				['user-1', 'America/New_York'],
				['user-2', 'America/Los_Angeles']
			])
		});

		expect(selection.candidates).toEqual([
			{
				projectId: 'recent-ny',
				userId: 'user-1',
				timezone: 'America/New_York',
				completedLocalDate: '2026-07-04',
				updatedAt: '2026-07-05T03:30:00.000Z'
			}
		]);
		expect(selection.skippedFanoutCap).toBe(1);
		expect(selection.skippedInvalidOwner).toBe(1);
		expect(selection.skippedTimezoneWindow).toBe(1);
		expect(selection.skippedOutsideLocalDay).toBe(1);
	});
});
