// apps/worker/tests/agentOperativeScheduler.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const schedulerMocks = vi.hoisted(() => ({
	queueAdd: vi.fn(),
	supabaseFrom: vi.fn()
}));

vi.mock('../src/lib/queue', () => ({
	queue: {
		add: schedulerMocks.queueAdd
	}
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: schedulerMocks.supabaseFrom
	}
}));

import { checkAndScheduleAgentOperatives } from '../src/scheduler/agentOperatives';

type QueryResult = {
	data?: unknown;
	error?: { message: string } | null;
	count?: number | null;
};

type QueryBuilder = PromiseLike<QueryResult> & {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	eq: ReturnType<typeof vi.fn>;
	is: ReturnType<typeof vi.fn>;
	in: ReturnType<typeof vi.fn>;
	or: ReturnType<typeof vi.fn>;
	not: ReturnType<typeof vi.fn>;
	lte: ReturnType<typeof vi.fn>;
	order: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	single: ReturnType<typeof vi.fn>;
	maybeSingle: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
	vi.clearAllMocks();
	schedulerMocks.queueAdd.mockResolvedValue({ queue_job_id: 'queue-job-1' });
});

describe('Saved Operative scheduler', () => {
	it('does nothing when the due scan is empty', async () => {
		schedulerMocks.supabaseFrom.mockReturnValueOnce(query({ data: [], error: null }));

		await checkAndScheduleAgentOperatives(new Date('2026-08-26T10:00:00.000Z'));

		expect(schedulerMocks.supabaseFrom).toHaveBeenCalledOnce();
		expect(schedulerMocks.supabaseFrom).toHaveBeenCalledWith('agent_operatives');
		expect(schedulerMocks.queueAdd).not.toHaveBeenCalled();
	});

	it('claims a due schedule before creating and queueing its Agent Run', async () => {
		const operative = scheduledOperative();
		const dueScan = query({ data: [operative], error: null });
		const lockClaim = query({ data: operative, error: null });
		const activeRunCheck = query({ count: 0, error: null });
		const runInsert = query({
			data: { id: '22222222-2222-4222-8222-222222222222' },
			error: null
		});
		const scheduleUpdate = query({ data: null, error: null });
		schedulerMocks.supabaseFrom
			.mockReturnValueOnce(dueScan)
			.mockReturnValueOnce(lockClaim)
			.mockReturnValueOnce(activeRunCheck)
			.mockReturnValueOnce(runInsert)
			.mockReturnValueOnce(scheduleUpdate);

		await checkAndScheduleAgentOperatives(new Date('2026-08-26T10:00:00.000Z'));

		expect(lockClaim.update).toHaveBeenCalledWith({
			schedule_locked_at: '2026-08-26T10:00:00.000Z',
			schedule_error: null
		});
		expect(lockClaim.is).toHaveBeenCalledWith('schedule_locked_at', null);
		expect(runInsert.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				operative_id: operative.id,
				user_id: operative.user_id,
				trigger: 'scheduled',
				status: 'queued'
			})
		);
		expect(schedulerMocks.queueAdd).toHaveBeenCalledWith(
			'agent_run',
			operative.user_id,
			expect.objectContaining({
				run_id: '22222222-2222-4222-8222-222222222222',
				trigger: 'scheduled'
			}),
			expect.objectContaining({
				priority: 8,
				dedupKey: `agent-operative:${operative.id}:${operative.next_run_at}`
			})
		);
		expect(scheduleUpdate.update).toHaveBeenCalledWith(
			expect.objectContaining({
				last_run_id: '22222222-2222-4222-8222-222222222222',
				last_run_at: operative.next_run_at,
				schedule_locked_at: null,
				schedule_error: null
			})
		);
	});

	it('does not create a run when another scheduler replica wins the lock', async () => {
		const dueScan = query({ data: [scheduledOperative()], error: null });
		const lostLock = query({ data: null, error: null });
		schedulerMocks.supabaseFrom.mockReturnValueOnce(dueScan).mockReturnValueOnce(lostLock);

		await checkAndScheduleAgentOperatives(new Date('2026-08-26T10:00:00.000Z'));

		expect(schedulerMocks.supabaseFrom).toHaveBeenCalledTimes(2);
		expect(schedulerMocks.queueAdd).not.toHaveBeenCalled();
	});
});

function query(result: QueryResult): QueryBuilder {
	const builder = {} as QueryBuilder;
	for (const method of [
		'select',
		'insert',
		'update',
		'eq',
		'is',
		'in',
		'or',
		'not',
		'lte',
		'order',
		'limit'
	] as const) {
		builder[method] = vi.fn(() => builder);
	}
	builder.single = vi.fn(async () => result);
	builder.maybeSingle = vi.fn(async () => result);
	builder.then = (onFulfilled, onRejected) =>
		Promise.resolve(result).then(onFulfilled, onRejected);
	return builder;
}

function scheduledOperative() {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		user_id: '33333333-3333-4333-8333-333333333333',
		label: 'Daily project review',
		goal: 'Review project progress',
		instructions: null,
		expected_output: null,
		context_type: 'global',
		project_id: null,
		scope_mode: 'read_write',
		allowed_ops: null,
		review_required: true,
		budgets: {},
		schedule_enabled: true,
		schedule_frequency: 'daily',
		schedule_time_of_day: '09:00:00',
		schedule_day_of_week: null,
		schedule_timezone: 'UTC',
		next_run_at: '2026-08-26T10:00:00.000Z',
		last_run_at: null,
		last_run_id: null,
		schedule_locked_at: null,
		schedule_error: null,
		created_at: '2026-08-01T00:00:00.000Z',
		updated_at: '2026-08-01T00:00:00.000Z'
	};
}
