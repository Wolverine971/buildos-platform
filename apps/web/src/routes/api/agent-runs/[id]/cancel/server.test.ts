// apps/web/src/routes/api/agent-runs/[id]/cancel/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'user-1';

type Row = Record<string, any>;

// One in-memory store shared by the user-scoped and admin clients.
const store = vi.hoisted(() => ({
	runs: [] as Row[],
	signals: [] as Row[],
	jobs: [] as Row[],
	failJob: false
}));

function table(name: string): Row[] {
	if (name === 'agent_runs') return store.runs;
	if (name === 'agent_run_signals') return store.signals;
	throw new Error(`unexpected table ${name}`);
}

function createClient() {
	return {
		from: (name: string) => {
			const filters: Array<(row: Row) => boolean> = [];
			let patch: Row | null = null;
			let insertRow: Row | null = null;
			let remove = false;
			const matched = () => table(name).filter((row) => filters.every((f) => f(row)));
			const execute = () => {
				if (insertRow) {
					const row = { id: `signal-${store.signals.length + 1}`, ...insertRow };
					table(name).push(row);
					return [row];
				}
				const rows = matched();
				if (remove) {
					for (const row of rows) table(name).splice(table(name).indexOf(row), 1);
				}
				if (patch) for (const row of rows) Object.assign(row, patch);
				return rows;
			};
			const builder: any = {
				select: () => builder,
				update: (value: Row) => ((patch = value), builder),
				insert: (value: Row) => ((insertRow = value), builder),
				delete: () => ((remove = true), builder),
				eq: (column: string, value: unknown) => (
					filters.push((row) => row[column] === value),
					builder
				),
				is: (column: string, value: unknown) => (
					filters.push((row) => (row[column] ?? null) === value),
					builder
				),
				maybeSingle: async () => ({ data: execute()[0] ?? null, error: null }),
				single: async () => ({ data: execute()[0], error: null }),
				then: (resolve: (value: unknown) => unknown) =>
					Promise.resolve({ data: execute(), error: null }).then(resolve)
			};
			return builder;
		},
		rpc: async (name: string, args: Row) => {
			if (store.failJob) return { data: null, error: { message: 'queue down' } };
			store.jobs.push({ name, ...args });
			return { data: 'job-1', error: null };
		}
	};
}

vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: () => createClient() }));

import { POST } from './+server';

function seedRun(status: string) {
	store.runs.push({
		id: RUN_ID,
		user_id: USER_ID,
		status,
		completed_at: '2026-09-20T12:00:00.000Z',
		trigger: 'manual',
		context_type: 'project',
		project_id: PROJECT_ID,
		scope_mode: 'read_write',
		allowed_ops: [],
		review_required: true,
		budgets: {}
	});
}

async function cancel() {
	return POST({
		params: { id: RUN_ID },
		locals: {
			supabase: createClient(),
			safeGetSession: async () => ({ user: { id: USER_ID } })
		}
	} as any);
}

describe('POST /api/agent-runs/[id]/cancel', () => {
	beforeEach(() => {
		store.runs.length = 0;
		store.signals.length = 0;
		store.jobs.length = 0;
		store.failJob = false;
	});

	it('signals a running run without re-queueing it', async () => {
		seedRun('running');
		const response = await cancel();

		expect(response.status).toBe(200);
		expect(store.signals).toEqual([expect.objectContaining({ kind: 'cancel' })]);
		expect(store.jobs).toHaveLength(0);
		expect(store.runs[0]!.status).toBe('running');
	});

	it.each(['paused', 'needs_input'])(
		're-queues a %s run so the worker drains the cancel signal',
		async (status) => {
			seedRun(status);
			const response = await cancel();

			expect(response.status).toBe(200);
			expect(store.runs[0]!.status).toBe('queued');
			expect(store.signals).toEqual([expect.objectContaining({ kind: 'cancel' })]);
			expect(store.jobs).toEqual([
				expect.objectContaining({
					p_job_type: 'agent_run',
					p_dedup_key: `agent-run-cancel:${RUN_ID}`,
					p_metadata: expect.objectContaining({
						run_id: RUN_ID,
						continuation_from: status
					})
				})
			]);
		}
	);

	it('restores the parked run when the job cannot be enqueued', async () => {
		seedRun('paused');
		store.failJob = true;
		const response = await cancel();

		expect(response.status).toBe(500);
		expect(store.runs[0]).toMatchObject({
			status: 'paused',
			completed_at: '2026-09-20T12:00:00.000Z'
		});
		expect(store.signals).toHaveLength(0);
	});

	it('rejects terminal runs', async () => {
		seedRun('completed');
		const response = await cancel();

		expect(response.status).toBe(400);
		expect(store.signals).toHaveLength(0);
	});
});
