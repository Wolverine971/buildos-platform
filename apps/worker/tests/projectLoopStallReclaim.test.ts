// apps/worker/tests/projectLoopStallReclaim.test.ts
import { describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const mocks = vi.hoisted(() => ({
	tables: {} as Record<string, Array<Record<string, any>>>,
	syncInboxItemForProjectReview: vi.fn(async () => null)
}));

// Minimal in-memory PostgREST fake: enough of select/update/filters for the
// reclaim pass, applied against mocks.tables.
function fakeFrom(table: string) {
	const filters: Array<(row: Row) => boolean> = [];
	let patch: Row | null = null;
	let orderColumn: string | null = null;
	let limitCount: number | null = null;
	const execute = () => {
		let rows = (mocks.tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
		if (orderColumn) {
			const column = orderColumn;
			rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])));
		}
		if (limitCount !== null) rows = rows.slice(0, limitCount);
		if (patch) for (const row of rows) Object.assign(row, patch);
		return rows.map((row) => ({ ...row }));
	};
	const builder: any = {
		select: () => builder,
		update: (value: Row) => {
			patch = value;
			return builder;
		},
		eq: (column: string, value: unknown) => {
			filters.push((row) => row[column] === value);
			return builder;
		},
		in: (column: string, values: unknown[]) => {
			filters.push((row) => values.includes(row[column]));
			return builder;
		},
		lt: (column: string, value: string) => {
			filters.push((row) => row[column] != null && row[column] < value);
			return builder;
		},
		gt: (column: string, value: string) => {
			filters.push((row) => row[column] != null && row[column] > value);
			return builder;
		},
		order: (column: string) => {
			orderColumn = column;
			return builder;
		},
		limit: (count: number) => {
			limitCount = count;
			return builder;
		},
		maybeSingle: async () => ({ data: execute()[0] ?? null, error: null }),
		then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
			Promise.resolve({ data: execute(), error: null }).then(resolve, reject)
	};
	return builder;
}

vi.mock('../src/lib/supabase', () => ({
	supabase: { from: (table: string) => fakeFrom(table) }
}));

vi.mock('@buildos/shared-agent-ops/inbox-index', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	syncInboxItemForProjectReview: mocks.syncInboxItemForProjectReview
}));

import {
	PROJECT_LOOPS_ENABLED,
	PROJECT_LOOP_JSON_PROVIDER_ORDER,
	resolveProjectLoopJsonProviderOrder
} from '../src/config/projectLoops';
import {
	getProjectLoopEndOfDayWindow,
	projectLoopDedupKey,
	reclaimStalledProjectLoopRuns,
	selectEndOfDayProjectLoopCandidates
} from '../src/workers/project-loop/enqueue';

describe('PROJECT_LOOPS_ENABLED', () => {
	it('is always on and does not depend on deployment env configuration', () => {
		expect(PROJECT_LOOPS_ENABLED).toBe(true);
	});

	it('uses the verified fast provider order by default and supports an env kill switch', () => {
		expect(resolveProjectLoopJsonProviderOrder(undefined)).toEqual([
			...PROJECT_LOOP_JSON_PROVIDER_ORDER
		]);
		expect(resolveProjectLoopJsonProviderOrder(' Novita, parasail,novita ')).toEqual([
			'novita',
			'parasail'
		]);
		expect(resolveProjectLoopJsonProviderOrder('off')).toEqual([]);
		expect(resolveProjectLoopJsonProviderOrder('default')).toEqual([]);
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

describe('reclaimStalledProjectLoopRuns', () => {
	const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

	it('keeps a v2 decision brief open while its project-wide candidates are still pending', async () => {
		mocks.tables = {
			project_loop_runs: [
				{
					id: 'run-brief-open',
					status: 'waiting_review',
					finished_at: '2026-09-01T00:00:00.000Z',
					brief: {
						version: 2,
						attention_level: 'decision',
						candidate_ids: ['sugg-from-older-run']
					}
				},
				{
					id: 'run-brief-decided',
					status: 'waiting_review',
					finished_at: '2026-09-01T00:00:00.000Z',
					brief: {
						version: 2,
						attention_level: 'urgent',
						candidate_ids: ['sugg-decided']
					}
				},
				{ id: 'run-legacy', status: 'waiting_review', finished_at: null, brief: null }
			],
			project_suggestions: [
				{ id: 'sugg-from-older-run', run_id: 'run-older', status: 'pending' },
				{ id: 'sugg-decided', run_id: 'run-older', status: 'approved' }
			],
			project_audits: []
		};

		const result = await reclaimStalledProjectLoopRuns();

		const runs = new Map(mocks.tables.project_loop_runs.map((run) => [run.id, run]));
		expect(runs.get('run-brief-open')?.status).toBe('waiting_review');
		expect(runs.get('run-brief-decided')?.status).toBe('completed');
		expect(runs.get('run-brief-decided')?.finished_at).not.toBe('2026-09-01T00:00:00.000Z');
		expect(runs.get('run-legacy')?.status).toBe('completed');
		expect(result.finalizedReview).toBe(2);
		expect(mocks.syncInboxItemForProjectReview).toHaveBeenCalledTimes(2);
		expect(mocks.syncInboxItemForProjectReview).toHaveBeenCalledWith(
			expect.objectContaining({ runId: 'run-brief-decided' })
		);
		expect(mocks.syncInboxItemForProjectReview).not.toHaveBeenCalledWith(
			expect.objectContaining({ runId: 'run-brief-open' })
		);
	});

	it('fails orphaned project audits so they stop blocking future audits', async () => {
		mocks.tables = {
			project_loop_runs: [
				{ id: 'run-stuck', status: 'running', started_at: minutesAgo(120) },
				{ id: 'run-live', status: 'running', started_at: minutesAgo(10) }
			],
			project_suggestions: [],
			project_audits: [
				{
					id: 'audit-linked',
					status: 'running',
					loop_run_id: 'run-stuck',
					started_at: minutesAgo(120),
					created_at: minutesAgo(125)
				},
				{
					id: 'audit-queued-orphan',
					status: 'queued',
					loop_run_id: null,
					started_at: null,
					created_at: minutesAgo(7 * 60)
				},
				{
					id: 'audit-running-orphan',
					status: 'running',
					loop_run_id: 'run-already-failed',
					started_at: minutesAgo(90),
					created_at: minutesAgo(95)
				},
				{
					id: 'audit-live',
					status: 'running',
					loop_run_id: 'run-live',
					started_at: minutesAgo(10),
					created_at: minutesAgo(12)
				},
				{
					id: 'audit-recently-queued',
					status: 'queued',
					loop_run_id: null,
					started_at: null,
					created_at: minutesAgo(30)
				}
			]
		};

		const result = await reclaimStalledProjectLoopRuns();

		const audits = new Map(mocks.tables.project_audits.map((audit) => [audit.id, audit]));
		expect(audits.get('audit-linked')?.status).toBe('failed');
		expect(audits.get('audit-queued-orphan')?.status).toBe('failed');
		expect(audits.get('audit-running-orphan')?.status).toBe('failed');
		expect(audits.get('audit-live')?.status).toBe('running');
		expect(audits.get('audit-recently-queued')?.status).toBe('queued');
		expect(result.failedRunning).toBe(1);
		expect(result.failedAudits).toBe(3);
	});
});
