// apps/web/src/lib/server/consolidation/consolidation.start.test.ts
// Starting runs (tasker 122): explicit scopes, check mode, and the one open
// full run per project, against an in-memory table that enforces the
// migration's unique open-run index (full runs only).
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/smart-llm-service', () => ({ SmartLLMService: class {} }));
vi.mock('$lib/server/queue-job-id', () => ({ addQueueJobWithPublicId: vi.fn() }));
vi.mock('$lib/server/organize/organize-service', () => ({
	previewOrApplyOrganize: vi.fn(),
	undoOrganize: vi.fn(),
	OrganizeError: class extends Error {}
}));

import { addQueueJobWithPublicId } from '$lib/server/queue-job-id';
import { ConsolidationError, startConsolidationRun } from './consolidation.service';

type Row = Record<string, any>;
const OPEN = ['surveying', 'waiting', 'review', 'applying'];
let runs: Row[];
let children: Row[];
let writable: Record<string, boolean>;

const USER = 'user-1';
const WAYNE = 'aaaaaaaa-0000-4000-8000-000000000001';
const CADRE = 'aaaaaaaa-0000-4000-8000-000000000002';
const STUDIO = 'aaaaaaaa-0000-4000-8000-000000000003';
const P = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;

function table(rows: () => Row[], onInsert?: (row: Row) => { code: string } | null) {
	const filters: Array<(row: Row) => boolean> = [];
	let insert: Row | null = null;
	const run = () => rows().filter((row) => filters.every((test) => test(row)));
	const builder: any = {
		select: () => builder,
		order: () => builder,
		limit: () => builder,
		eq: (column: string, value: unknown) => (
			filters.push((row) => row[column] === value),
			builder
		),
		in: (column: string, values: unknown[]) => (
			filters.push((row) => values.includes(row[column])),
			builder
		),
		is: (column: string, value: unknown) => (
			filters.push((row) => (row[column] ?? null) === value),
			builder
		),
		gte: (column: string, value: string) => (
			filters.push((row) => String(row[column]) >= value),
			builder
		),
		insert: (row: Row) => ((insert = row), builder),
		update: () => builder,
		maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
		single: async () => {
			if (!insert) return { data: run()[0] ?? null, error: null };
			const row = {
				id: `run-${runs.length + 1}`,
				mode: 'full',
				status: 'surveying',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				...insert
			};
			const error = onInsert?.(row) ?? null;
			if (error) return { data: null, error };
			rows().push(row);
			return { data: row, error: null };
		},
		then: (resolve: (value: unknown) => void) =>
			Promise.resolve({ data: run(), error: null }).then(resolve)
	};
	return builder;
}

/** The migration's unique index: one open full run per root; check runs never count. */
function uniqueOpenFull(row: Row) {
	const clash = runs.some(
		(other) =>
			other.root_project_id === row.root_project_id &&
			other.mode === 'full' &&
			row.mode === 'full' &&
			OPEN.includes(other.status) &&
			OPEN.includes(row.status)
	);
	return clash ? { code: '23505' } : null;
}

const admin = {
	from: (name: string) => {
		if (name !== 'consolidation_runs') throw new Error(`unexpected table ${name}`);
		return table(() => runs, uniqueOpenFull);
	}
} as never;

const session = {
	from: (name: string) => {
		if (name !== 'onto_projects') throw new Error(`unexpected table ${name}`);
		return table(() => children);
	},
	rpc: vi.fn(async (name: string, args: Row) => {
		if (name !== 'current_actor_has_project_member_access')
			throw new Error(`unexpected rpc ${name}`);
		return { data: writable[args.p_project_id] === true, error: null };
	})
} as never;

function existing(row: Row) {
	runs.push({
		user_id: USER,
		project_ids: [row.root_project_id],
		request: null,
		progress: {},
		plan: null,
		receipt: null,
		cost_usd: 0,
		error: null,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		finished_at: null,
		...row
	});
}

beforeEach(() => {
	runs = [];
	children = [];
	writable = { [WAYNE]: true, [CADRE]: true, [STUDIO]: true };
	vi.mocked(addQueueJobWithPublicId).mockReset();
});

describe('startConsolidationRun: check mode', () => {
	it('starts a check beside an open full run: checks never take the slot', async () => {
		existing({ id: 'open-full', root_project_id: WAYNE, mode: 'full', status: 'waiting' });
		const result = await startConsolidationRun({
			session,
			admin,
			userId: USER,
			projectId: WAYNE,
			projectIds: [WAYNE, CADRE],
			mode: 'check'
		});
		expect(result.existing).toBe(false);
		expect(runs.at(-1)).toMatchObject({
			id: result.run_id,
			mode: 'check',
			root_project_id: WAYNE,
			project_ids: [WAYNE, CADRE]
		});
		expect(vi.mocked(addQueueJobWithPublicId).mock.calls[0]![1]).toMatchObject({
			p_job_type: 'consolidation_run',
			p_priority: 4,
			p_metadata: { runId: result.run_id, userId: USER, action: 'survey' },
			p_dedup_key: `consolidation:${result.run_id}:survey`
		});
	});

	it('starts a full run while a check is still running on the same project', async () => {
		existing({ id: 'check-1', root_project_id: WAYNE, mode: 'check', status: 'surveying' });
		children = [{ id: STUDIO, parent_project_id: WAYNE, deleted_at: null }];
		const result = await startConsolidationRun({
			session,
			admin,
			userId: USER,
			projectId: WAYNE
		});
		expect(result.existing).toBe(false);
		expect(runs.at(-1)).toMatchObject({ mode: 'full', project_ids: [WAYNE, STUDIO] });
	});

	it('hands back a running or just-finished check of the same projects, in any order', async () => {
		const first = await startConsolidationRun({
			session,
			admin,
			userId: USER,
			projectId: WAYNE,
			projectIds: [WAYNE, CADRE],
			mode: 'check'
		});
		const again = await startConsolidationRun({
			session,
			admin,
			userId: USER,
			projectId: CADRE,
			projectIds: [CADRE, WAYNE],
			mode: 'check'
		});
		expect(again).toEqual({ run_id: first.run_id, existing: true });
		runs[0]!.status = 'checked';
		runs[0]!.finished_at = new Date(Date.now() - 5 * 60 * 1000).toISOString();
		await expect(
			startConsolidationRun({
				session,
				admin,
				userId: USER,
				projectId: WAYNE,
				projectIds: [WAYNE, CADRE],
				mode: 'check'
			})
		).resolves.toEqual({ run_id: first.run_id, existing: true });
		expect(runs).toHaveLength(1);
		expect(addQueueJobWithPublicId).toHaveBeenCalledTimes(1);
	});

	it('starts a fresh check when the last one is old, failed, or covered other projects', async () => {
		const old = new Date(Date.now() - 16 * 60 * 1000).toISOString();
		existing({
			id: 'old',
			root_project_id: WAYNE,
			project_ids: [WAYNE, CADRE],
			mode: 'check',
			status: 'checked',
			finished_at: old
		});
		existing({
			id: 'failed',
			root_project_id: WAYNE,
			project_ids: [WAYNE, CADRE],
			mode: 'check',
			status: 'failed'
		});
		existing({
			id: 'other',
			root_project_id: WAYNE,
			project_ids: [WAYNE, CADRE, STUDIO],
			mode: 'check',
			status: 'surveying'
		});
		existing({
			id: 'someone-else',
			user_id: 'user-2',
			root_project_id: WAYNE,
			project_ids: [WAYNE, CADRE],
			mode: 'check',
			status: 'surveying'
		});
		const result = await startConsolidationRun({
			session,
			admin,
			userId: USER,
			projectId: WAYNE,
			projectIds: [WAYNE, CADRE],
			mode: 'check'
		});
		expect(result.existing).toBe(false);
		expect(['old', 'failed', 'other', 'someone-else']).not.toContain(result.run_id);
	});

	it('re-checks access before handing back an earlier check', async () => {
		existing({
			id: 'mine',
			root_project_id: WAYNE,
			project_ids: [WAYNE, CADRE],
			mode: 'check',
			status: 'surveying'
		});
		writable[CADRE] = false;
		await expect(
			startConsolidationRun({
				session,
				admin,
				userId: USER,
				projectId: WAYNE,
				projectIds: [WAYNE, CADRE],
				mode: 'check'
			})
		).rejects.toMatchObject({ status: 403 });
	});
});

describe('startConsolidationRun: explicit scope', () => {
	it('drops repeats and keeps the root first', async () => {
		await startConsolidationRun({
			session,
			admin,
			userId: USER,
			projectId: WAYNE,
			projectIds: [WAYNE, CADRE, CADRE, WAYNE],
			mode: 'check'
		});
		expect(runs.at(-1)!.project_ids).toEqual([WAYNE, CADRE]);
	});

	it('refuses a project the user cannot edit, before writing anything', async () => {
		writable[CADRE] = false;
		const start = startConsolidationRun({
			session,
			admin,
			userId: USER,
			projectId: WAYNE,
			projectIds: [WAYNE, CADRE],
			mode: 'check'
		});
		await expect(start).rejects.toBeInstanceOf(ConsolidationError);
		await expect(start).rejects.toMatchObject({ status: 403 });
		expect(runs).toEqual([]);
	});

	it('refuses more than 20 projects, fewer than 2, and a root that is not first', async () => {
		const many = [WAYNE, ...Array.from({ length: 20 }, (_, i) => P(i))];
		for (const projectIds of [many, [WAYNE, WAYNE], [CADRE, WAYNE]])
			await expect(
				startConsolidationRun({
					session,
					admin,
					userId: USER,
					projectId: WAYNE,
					projectIds,
					mode: 'check'
				})
			).rejects.toMatchObject({ status: 400 });
		expect(runs).toEqual([]);
	});

	it('returns the open full run for the same projects, and names it for other projects', async () => {
		existing({
			id: 'open-full',
			root_project_id: WAYNE,
			project_ids: [WAYNE, CADRE],
			mode: 'full',
			status: 'review'
		});
		await expect(
			startConsolidationRun({
				session,
				admin,
				userId: USER,
				projectId: WAYNE,
				projectIds: [WAYNE, CADRE]
			})
		).resolves.toEqual({ run_id: 'open-full', existing: true });
		await expect(
			startConsolidationRun({
				session,
				admin,
				userId: USER,
				projectId: WAYNE,
				projectIds: [WAYNE, STUDIO]
			})
		).rejects.toMatchObject({ status: 409, details: { open_run_id: 'open-full' } });
	});
});
