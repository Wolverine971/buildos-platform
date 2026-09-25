// apps/worker/tests/projectLoopEnqueueGate.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	from: vi.fn(),
	rpc: vi.fn()
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: { from: mocks.from, rpc: mocks.rpc }
}));

vi.mock('../src/config/projectLoops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

import {
	enqueueEndOfDayProjectLoops,
	enqueueProjectLoop
} from '../src/workers/project-loop/enqueue';

function queryResult(result: { data: unknown; error: unknown }) {
	const builder: any = {
		select: vi.fn(() => builder),
		insert: vi.fn(() => builder),
		update: vi.fn(() => builder),
		delete: vi.fn(() => builder),
		eq: vi.fn(() => builder),
		in: vi.fn(() => builder),
		not: vi.fn(() => builder),
		gt: vi.fn(() => builder),
		order: vi.fn(() => builder),
		limit: vi.fn(() => builder),
		maybeSingle: vi.fn(async () => result),
		single: vi.fn(async () => result),
		then: vi.fn((resolve: (value: typeof result) => unknown) =>
			Promise.resolve(resolve(result))
		)
	};
	return builder;
}

describe('project loop unresolved-brief trigger gate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('skips an automatic review when the unresolved manager brief has no newer evidence', async () => {
		let projectRunQuery = 0;
		mocks.from.mockImplementation((table: string) => {
			if (table === 'project_loop_runs') {
				projectRunQuery += 1;
				if (projectRunQuery === 1) return queryResult({ data: null, error: null });
				return queryResult({
					data: {
						id: 'run-1',
						status: 'waiting_review',
						created_at: '2026-08-14T12:00:00.000Z',
						finished_at: '2026-08-14T12:01:00.000Z',
						brief: { version: 2, attention_level: 'decision' }
					},
					error: null
				});
			}
			if (table === 'project_review_signals') {
				return queryResult({ data: [], error: null });
			}
			throw new Error(`Unexpected table after trigger gate: ${table}`);
		});

		const result = await enqueueProjectLoop({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'end_of_day'
		});

		expect(result).toEqual({ queued: false, reason: 'unresolved_brief_unchanged' });
		expect(mocks.from).not.toHaveBeenCalledWith('chat_sessions');
	});
});

describe('project loop activity gate (tasker 108)', () => {
	const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

	/**
	 * project_loop_runs reads in order: active run, unresolved brief, cooldown
	 * (last finished run), last review. `reviews` answers the last one.
	 */
	function mockRunReads(lastReviewFinishedAt: string | null) {
		let projectRunQuery = 0;
		mocks.from.mockImplementation((table: string) => {
			if (table === 'project_loop_runs') {
				projectRunQuery += 1;
				if (projectRunQuery === 3) {
					return queryResult({ data: { finished_at: hoursAgo(20) }, error: null });
				}
				if (projectRunQuery === 4) {
					return queryResult({
						data: lastReviewFinishedAt ? { finished_at: lastReviewFinishedAt } : null,
						error: null
					});
				}
				return queryResult({ data: null, error: null });
			}
			if (table === 'chat_sessions') throw new Error('reached chat session creation');
			throw new Error(`Unexpected table: ${table}`);
		});
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('skips an end-of-day loop when nothing changed since the last review', async () => {
		const lastReview = hoursAgo(20);
		mockRunReads(lastReview);
		mocks.rpc.mockResolvedValue({ data: [], error: null });

		const result = await enqueueProjectLoop({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'end_of_day'
		});

		expect(result).toEqual({ queued: false, reason: 'no_new_activity' });
		expect(mocks.rpc).toHaveBeenCalledWith('project_loop_activity', {
			p_since: lastReview,
			p_project_ids: ['project-1']
		});
		expect(mocks.from).not.toHaveBeenCalledWith('chat_sessions');
	});

	it('runs an end-of-day loop when the user changed something after the last review', async () => {
		mockRunReads(hoursAgo(20));
		mocks.rpc.mockResolvedValue({
			data: [
				{ project_id: 'project-1', created_by: 'actor-1', last_activity_at: hoursAgo(2) }
			],
			error: null
		});

		const result = await enqueueProjectLoop({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'end_of_day'
		});

		expect(result).toEqual({ queued: false, reason: 'reached chat session creation' });
	});

	it('runs a never-reviewed project and fails open on an activity read error', async () => {
		mockRunReads(null);
		const neverReviewed = await enqueueProjectLoop({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'end_of_day'
		});
		expect(neverReviewed.reason).toBe('reached chat session creation');
		expect(mocks.rpc).not.toHaveBeenCalled();

		mockRunReads(hoursAgo(20));
		mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
		const readError = await enqueueProjectLoop({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'end_of_day'
		});
		expect(readError.reason).toBe('reached chat session creation');
	});

	it('never gates an activity-driven burst run', async () => {
		let projectRunQuery = 0;
		mocks.from.mockImplementation((table: string) => {
			if (table === 'project_loop_runs') {
				projectRunQuery += 1;
				return queryResult({
					data: projectRunQuery === 3 ? { finished_at: hoursAgo(20) } : null,
					error: null
				});
			}
			if (table === 'chat_sessions') throw new Error('reached chat session creation');
			throw new Error(`Unexpected table: ${table}`);
		});

		const result = await enqueueProjectLoop({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'burst'
		});

		expect(result.reason).toBe('reached chat session creation');
		expect(mocks.rpc).not.toHaveBeenCalled();
		expect(projectRunQuery).toBe(3);
	});

	it('discards its own unqueued run when a concurrent enqueue won the queue dedup key', async () => {
		const runBuilders: any[] = [];
		mocks.from.mockImplementation((table: string) => {
			if (table === 'project_loop_runs') {
				const builder = queryResult({ data: { id: 'run-new' }, error: null });
				builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
				runBuilders.push(builder);
				return builder;
			}
			if (table === 'chat_sessions') {
				return queryResult({ data: { id: 'session-1' }, error: null });
			}
			if (table === 'chat_sessions_projects') return queryResult({ data: null, error: null });
			if (table === 'queue_jobs') {
				return queryResult({
					data: { queue_job_id: 'job-existing', metadata: { runId: 'run-existing' } },
					error: null
				});
			}
			throw new Error(`Unexpected table: ${table}`);
		});
		mocks.rpc.mockResolvedValue({ data: 'queue-record-1', error: null });

		const result = await enqueueProjectLoop({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'manual'
		});

		expect(result).toEqual({ queued: false, runId: 'run-existing', reason: 'already_running' });
		const deleted = runBuilders.filter((builder) => builder.delete.mock.calls.length > 0);
		expect(deleted).toHaveLength(1);
		expect(deleted[0].eq).toHaveBeenCalledWith('id', 'run-new');
		expect(runBuilders.some((builder) => builder.update.mock.calls.length > 0)).toBe(false);
	});
});

describe('end-of-day scan candidates (tasker 108)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('takes candidates from user activity, not the project row timestamp', async () => {
		const now = new Date('2026-07-05T04:15:00.000Z');
		mocks.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
			if (fn === 'project_loop_activity' && args.p_project_ids === null) {
				// A task edit yesterday evening (New York) on a project whose row
				// was last touched weeks ago.
				return {
					data: [
						{
							project_id: 'task-edited',
							created_by: 'actor-1',
							last_activity_at: '2026-07-05T01:00:00.000Z'
						}
					],
					error: null
				};
			}
			return { data: [], error: null };
		});
		const enqueuedProjectIds: string[] = [];
		mocks.from.mockImplementation((table: string) => {
			if (table === 'onto_actors') {
				return queryResult({ data: [{ id: 'actor-1', user_id: 'user-1' }], error: null });
			}
			if (table === 'users') {
				const builder = queryResult({
					data: [{ id: 'user-1', timezone: 'America/New_York' }],
					error: null
				});
				return builder;
			}
			if (table === 'project_loop_runs') {
				const builder = queryResult({ data: null, error: null });
				builder.eq = vi.fn((column: string, value: string) => {
					if (column === 'project_id' && !enqueuedProjectIds.includes(value)) {
						enqueuedProjectIds.push(value);
					}
					return builder;
				});
				return builder;
			}
			if (table === 'chat_sessions') throw new Error('stop after gate');
			throw new Error(`Unexpected table: ${table}`);
		});

		const result = await enqueueEndOfDayProjectLoops({ now });

		expect(mocks.rpc).toHaveBeenCalledWith('project_loop_activity', {
			p_since: new Date(now.getTime() - 36 * 3_600_000).toISOString(),
			p_project_ids: null
		});
		expect(result.scanned).toBe(1);
		expect(enqueuedProjectIds).toEqual(['task-edited']);
		expect(mocks.from).not.toHaveBeenCalledWith('onto_projects');
	});
});
