// apps/web/src/lib/server/project-loop-burst.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	queueProjectLoop: vi.fn(),
	queueProjectAudit: vi.fn(),
	addQueueJobWithPublicId: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('$lib/server/project-loops.service', () => ({
	queueProjectLoop: mocks.queueProjectLoop
}));

vi.mock('$lib/server/project-audit-trigger.service', () => ({
	queueProjectAudit: mocks.queueProjectAudit
}));

vi.mock('$lib/server/queue-job-id', () => ({
	addQueueJobWithPublicId: mocks.addQueueJobWithPublicId
}));

vi.mock('$lib/config/project-loops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

import {
	queueProjectLoopBurst,
	queueProjectLoopReviewSignal,
	readProjectLoopReviewContext,
	shouldDebounceProjectLoopBurstForTaskUpdate,
	shouldSkipProjectLoopBurst,
	shouldSuppressProjectLoopBurstForTaskUpdate,
	scoreProjectLoopRecentActivity,
	type ProjectLoopRecentActivityRow
} from './project-loop-burst.service';

function createActivitySupabaseMock(params?: {
	rows?: ProjectLoopRecentActivityRow[];
	error?: { message: string } | null;
}) {
	const query = {
		select: vi.fn(),
		eq: vi.fn(),
		gte: vi.fn(),
		order: vi.fn(),
		limit: vi.fn()
	};

	query.select.mockReturnValue(query);
	query.eq.mockReturnValue(query);
	query.gte.mockReturnValue(query);
	query.order.mockReturnValue(query);
	query.limit.mockResolvedValue({
		data: params?.rows ?? [],
		error: params?.error ?? null
	});

	const supabase = {
		from: vi.fn(() => query)
	};

	return { supabase, query };
}

type SupabaseOperation = {
	table: string;
	action: 'select' | 'insert' | 'update' | null;
	payload: unknown;
	filters: Array<{ column: string; value: unknown }>;
};

type SignalRow = Record<string, unknown>;

function createReviewSignalSupabaseMock(params?: {
	signals?: SignalRow[];
	queueJobs?: SignalRow[];
	existingError?: { message: string } | null;
	recordError?: { message: string } | null;
}) {
	const operations: SupabaseOperation[] = [];
	const signals = params?.signals ?? [];
	const queueJobs = params?.queueJobs ?? [];

	function matchesFilters(row: SignalRow, filters: SupabaseOperation['filters']) {
		return filters.every((filter) => row[filter.column] === filter.value);
	}

	class QueryBuilderMock {
		private action: SupabaseOperation['action'] = null;
		private payload: unknown = null;
		private filters: SupabaseOperation['filters'] = [];

		constructor(private readonly table: string) {}

		select() {
			if (!this.action) this.action = 'select';
			return this;
		}

		insert(payload: unknown) {
			this.action = 'insert';
			this.payload = payload;
			return this;
		}

		update(payload: unknown) {
			this.action = 'update';
			this.payload = payload;
			return this;
		}

		eq(column: string, value: unknown) {
			this.filters.push({ column, value });
			return this;
		}

		order() {
			return this;
		}

		limit() {
			return this;
		}

		private recordOperation() {
			operations.push({
				table: this.table,
				action: this.action,
				payload: this.payload,
				filters: [...this.filters]
			});
		}

		private resolve() {
			this.recordOperation();

			if (this.table === 'project_review_signals' && this.action === 'select') {
				if (params?.existingError) {
					return Promise.resolve({ data: null, error: params.existingError });
				}
				return Promise.resolve({
					data: signals.find((signal) => matchesFilters(signal, this.filters)) ?? null,
					error: null
				});
			}

			if (this.table === 'project_review_signals' && this.action === 'insert') {
				if (params?.recordError) {
					return Promise.resolve({ data: null, error: params.recordError });
				}
				const row = {
					id: `signal-${signals.length + 1}`,
					...(this.payload as SignalRow)
				};
				signals.push(row);
				return Promise.resolve({ data: row, error: null });
			}

			if (this.table === 'project_review_signals' && this.action === 'update') {
				if (params?.recordError) {
					return Promise.resolve({ data: null, error: params.recordError });
				}
				const rows = signals.filter((signal) => matchesFilters(signal, this.filters));
				for (const row of rows) {
					Object.assign(row, this.payload as SignalRow);
				}
				return Promise.resolve({ data: rows[0] ?? null, error: null });
			}

			if (this.table === 'queue_jobs' && this.action === 'update') {
				const rows = queueJobs.filter((job) => matchesFilters(job, this.filters));
				for (const row of rows) {
					Object.assign(row, this.payload as SignalRow);
				}
				return Promise.resolve({ data: rows, error: null });
			}

			return Promise.resolve({ data: null, error: null });
		}

		single() {
			return this.resolve();
		}

		maybeSingle() {
			return this.resolve();
		}

		then<TResult1 = any, TResult2 = never>(
			onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return this.resolve().then(onfulfilled, onrejected);
		}
	}

	const supabase = {
		from: vi.fn((table: string) => new QueryBuilderMock(table))
	};

	return { supabase, operations, signals, queueJobs };
}

function findOperation(
	operations: SupabaseOperation[],
	table: string,
	action: SupabaseOperation['action']
): SupabaseOperation | undefined {
	return operations.find((operation) => operation.table === table && operation.action === action);
}

describe('project loop burst scoring', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.queueProjectLoop.mockResolvedValue({
			queued: true,
			runId: 'loop-run-1',
			jobId: 'queue-job-1'
		});
		mocks.queueProjectAudit.mockResolvedValue({
			queued: false,
			decision: 'skipped_no_activity',
			reason: 'Recent project activity is below complete-audit burst threshold.',
			evaluationId: 'audit-eval-1'
		});
		mocks.addQueueJobWithPublicId.mockResolvedValue({
			queueRecordId: 'queue-record-1',
			queueJobId: 'queue-public-1'
		});
	});

	it('skips a single low-signal task update', async () => {
		const { supabase } = createActivitySupabaseMock();
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);

		const result = await queueProjectLoopBurst({
			projectId: 'project-1',
			userId: 'user-1',
			source: 'task_update'
		});

		expect(result).toMatchObject({
			queued: false,
			reason: 'below_threshold',
			sourceScore: 1,
			recentScore: 0,
			totalScore: 1
		});
		expect(mocks.queueProjectLoop).not.toHaveBeenCalled();
		expect(mocks.queueProjectAudit).not.toHaveBeenCalled();
	});

	it('queues a structural document tree move without recent activity', async () => {
		const { supabase } = createActivitySupabaseMock();
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);

		const result = await queueProjectLoopBurst({
			projectId: 'project-1',
			userId: 'user-1',
			source: 'doc_tree_move'
		});

		expect(result).toMatchObject({
			queued: true,
			reason: 'queued',
			sourceScore: 4,
			totalScore: 4,
			runId: 'loop-run-1',
			jobId: 'queue-job-1',
			audit: {
				evaluated: true,
				queued: false,
				decision: 'skipped_no_activity',
				evaluationId: 'audit-eval-1'
			}
		});
		expect(mocks.queueProjectLoop).toHaveBeenCalledWith({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'burst'
		});
		expect(mocks.queueProjectAudit).toHaveBeenCalledWith({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'burst'
		});
	});

	it('queues when recent activity and the current mutation cross the burst threshold', async () => {
		const { supabase, query } = createActivitySupabaseMock({
			rows: [
				{
					entity_type: 'document',
					entity_id: 'doc-1',
					action: 'created',
					created_at: new Date().toISOString()
				}
			]
		});
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);

		const result = await queueProjectLoopBurst({
			projectId: 'project-1',
			userId: 'user-1',
			source: 'document_create',
			entityType: 'document',
			entityId: 'doc-2',
			action: 'created'
		});

		expect(result).toMatchObject({
			queued: true,
			sourceScore: 2,
			recentScore: 2,
			totalScore: 4,
			audit: {
				evaluated: true,
				queued: false,
				decision: 'skipped_no_activity'
			}
		});
		expect(supabase.from).toHaveBeenCalledWith('onto_project_logs');
		expect(query.select).toHaveBeenCalledWith(
			'entity_type, entity_id, action, change_source, created_at'
		);
		expect(query.eq).toHaveBeenCalledWith('project_id', 'project-1');
		expect(query.gte.mock.calls[0]?.[0]).toBe('created_at');
		expect(Date.parse(query.gte.mock.calls[0]?.[1])).not.toBeNaN();
		expect(query.limit).toHaveBeenCalledWith(50);
	});

	it('does not double-count the current mutation when its activity log is already visible', async () => {
		const { supabase } = createActivitySupabaseMock({
			rows: [
				{
					entity_type: 'document',
					entity_id: 'doc-1',
					action: 'created',
					created_at: new Date().toISOString()
				}
			]
		});
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);

		const result = await queueProjectLoopBurst({
			projectId: 'project-1',
			userId: 'user-1',
			source: 'document_create',
			entityType: 'document',
			entityId: 'doc-1',
			action: 'created'
		});

		expect(result).toMatchObject({
			queued: false,
			reason: 'below_threshold',
			sourceScore: 2,
			recentScore: 0,
			totalScore: 2
		});
		expect(mocks.queueProjectLoop).not.toHaveBeenCalled();
		expect(mocks.queueProjectAudit).not.toHaveBeenCalled();
	});

	it('counts repeated updates to the same recent entity only once', () => {
		const score = scoreProjectLoopRecentActivity([
			{ entity_type: 'document', entity_id: 'doc-1', action: 'updated' },
			{ entity_type: 'document', entity_id: 'doc-1', action: 'updated' },
			{ entity_type: 'document', entity_id: 'doc-1', action: 'updated' },
			{ entity_type: 'task', entity_id: 'task-1', action: 'updated' }
		]);

		expect(score).toBe(2);
	});

	it('does not queue a minor mutation when recent activity lookup fails', async () => {
		const { supabase } = createActivitySupabaseMock({
			error: { message: 'temporary database error' }
		});
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);

		const result = await queueProjectLoopBurst({
			projectId: 'project-1',
			userId: 'user-1',
			source: 'document_update'
		});

		expect(result).toMatchObject({
			queued: false,
			reason: 'below_threshold',
			totalScore: 1
		});
		expect(mocks.queueProjectLoop).not.toHaveBeenCalled();
		expect(mocks.queueProjectAudit).not.toHaveBeenCalled();
	});

	it('does not fail the light loop burst when complete audit evaluation fails', async () => {
		const { supabase } = createActivitySupabaseMock();
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);
		mocks.queueProjectAudit.mockRejectedValue(new Error('audit evaluator unavailable'));

		const result = await queueProjectLoopBurst({
			projectId: 'project-1',
			userId: 'user-1',
			source: 'doc_tree_move'
		});

		expect(result).toMatchObject({
			queued: true,
			reason: 'queued',
			audit: {
				evaluated: false,
				queued: false,
				reason: 'audit evaluator unavailable'
			}
		});
	});
});

describe('queueProjectLoopReviewSignal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.addQueueJobWithPublicId.mockResolvedValue({
			queueRecordId: 'queue-record-1',
			queueJobId: 'queue-public-1'
		});
	});

	it('records a pending signal and schedules one debounced wakeup', async () => {
		const { supabase, operations, signals, queueJobs } = createReviewSignalSupabaseMock({
			queueJobs: [{ id: 'queue-record-1', status: 'pending' }]
		});
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);

		const result = await queueProjectLoopReviewSignal({
			projectId: 'project-1',
			userId: 'user-1',
			source: 'task_update',
			entityType: 'task',
			entityId: 'task-1',
			action: 'updated',
			reviewContext: {
				operationId: 'operation-1',
				origin: 'overdue_triage',
				operationKind: 'bulk_backlog',
				reviewPolicy: 'debounced',
				entityCount: 8
			},
			now: new Date('2026-07-07T12:00:00.000Z')
		});

		expect(result).toEqual({
			queued: true,
			reason: 'queued',
			signalId: 'signal-1',
			queueJobId: 'queue-public-1',
			dueAt: '2026-07-07T12:01:00.000Z'
		});
		expect(signals).toHaveLength(1);
		expect(signals[0]).toMatchObject({
			id: 'signal-1',
			project_id: 'project-1',
			user_id: 'user-1',
			status: 'pending',
			review_policy: 'debounced',
			origin: 'overdue_triage',
			operation_kind: 'bulk_backlog',
			source: 'task_update',
			entity_type: 'task',
			entity_ids: ['task-1'],
			operation_ids: ['operation-1'],
			entity_count: 8,
			signal_count: 1,
			activity_score: 1,
			due_at: '2026-07-07T12:01:00.000Z',
			last_seen_at: '2026-07-07T12:00:00.000Z',
			queue_job_id: 'queue-public-1'
		});
		expect(signals[0].metadata).toMatchObject({
			sources: ['task_update'],
			actions: ['updated'],
			entityTypes: ['task'],
			operations: [
				{
					operationId: 'operation-1',
					origin: 'overdue_triage',
					operationKind: 'bulk_backlog',
					entityCount: 8
				}
			],
			lastSignal: {
				source: 'task_update',
				action: 'updated',
				entityType: 'task',
				entityId: 'task-1',
				operationId: 'operation-1',
				origin: 'overdue_triage',
				operationKind: 'bulk_backlog',
				entityCount: 8
			}
		});
		expect(mocks.addQueueJobWithPublicId).toHaveBeenCalledWith(
			supabase,
			expect.objectContaining({
				p_user_id: 'user-1',
				p_job_type: 'buildos_project_loop',
				p_priority: 8,
				p_scheduled_for: '2026-07-07T12:01:00.000Z',
				p_dedup_key: 'project-review-signal:project-1',
				p_metadata: {
					mode: 'debounced_review_signal',
					signalId: 'signal-1',
					projectId: 'project-1',
					userId: 'user-1',
					triggerReason: 'burst'
				}
			})
		);
		expect(findOperation(operations, 'queue_jobs', 'update')?.payload).toMatchObject({
			scheduled_for: '2026-07-07T12:01:00.000Z'
		});
		expect(queueJobs[0]).toMatchObject({
			id: 'queue-record-1',
			status: 'pending',
			scheduled_for: '2026-07-07T12:01:00.000Z',
			metadata: {
				mode: 'debounced_review_signal',
				signalId: 'signal-1',
				projectId: 'project-1',
				userId: 'user-1',
				triggerReason: 'burst'
			}
		});
	});

	it('coalesces repeated signals into the existing pending wakeup', async () => {
		const existingSignal = {
			id: 'signal-existing',
			project_id: 'project-1',
			user_id: 'user-1',
			status: 'pending',
			review_policy: 'debounced',
			origin: 'overdue_triage',
			operation_kind: 'bulk_backlog',
			source: 'task_update',
			entity_type: 'task',
			entity_ids: ['task-1'],
			operation_ids: ['operation-1'],
			entity_count: 4,
			signal_count: 2,
			activity_score: 2,
			metadata: {
				sources: ['task_update'],
				actions: ['updated'],
				entityTypes: ['task'],
				operations: [
					{
						operationId: 'operation-1',
						origin: 'overdue_triage',
						operationKind: 'bulk_backlog',
						entityCount: 4
					}
				]
			}
		};
		const { supabase, operations, signals } = createReviewSignalSupabaseMock({
			signals: [existingSignal],
			queueJobs: [{ id: 'queue-record-1', status: 'pending' }]
		});
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);

		const result = await queueProjectLoopReviewSignal({
			projectId: 'project-1',
			userId: 'user-1',
			source: 'task_update',
			entityType: 'task',
			entityId: 'task-2',
			action: 'updated',
			reviewContext: {
				operationId: 'operation-2',
				origin: 'overdue_triage',
				operationKind: 'bulk_backlog',
				reviewPolicy: 'debounced',
				entityCount: 7
			},
			now: new Date('2026-07-07T12:05:00.000Z')
		});

		expect(result).toMatchObject({
			queued: true,
			signalId: 'signal-existing',
			queueJobId: 'queue-public-1',
			dueAt: '2026-07-07T12:06:00.000Z'
		});
		expect(findOperation(operations, 'project_review_signals', 'insert')).toBeUndefined();
		const signalUpdate = operations.find(
			(operation) =>
				operation.table === 'project_review_signals' &&
				operation.action === 'update' &&
				(operation.payload as SignalRow).signal_count === 3
		);
		expect(signalUpdate?.filters).toEqual([
			{ column: 'id', value: 'signal-existing' },
			{ column: 'status', value: 'pending' }
		]);
		expect(signals[0]).toMatchObject({
			entity_ids: ['task-1', 'task-2'],
			operation_ids: ['operation-1', 'operation-2'],
			entity_count: 7,
			signal_count: 3,
			activity_score: 2,
			due_at: '2026-07-07T12:06:00.000Z',
			last_seen_at: '2026-07-07T12:05:00.000Z',
			queue_job_id: 'queue-public-1'
		});
		expect(signals[0].metadata).toMatchObject({
			sources: ['task_update'],
			actions: ['updated'],
			entityTypes: ['task'],
			operations: [
				{
					operationId: 'operation-1',
					origin: 'overdue_triage',
					operationKind: 'bulk_backlog',
					entityCount: 4
				},
				{
					operationId: 'operation-2',
					origin: 'overdue_triage',
					operationKind: 'bulk_backlog',
					entityCount: 7
				}
			],
			lastSignal: {
				entityId: 'task-2',
				operationId: 'operation-2',
				entityCount: 7
			}
		});
		expect(mocks.addQueueJobWithPublicId).toHaveBeenCalledTimes(1);
		expect(mocks.addQueueJobWithPublicId).toHaveBeenCalledWith(
			supabase,
			expect.objectContaining({
				p_dedup_key: 'project-review-signal:project-1',
				p_scheduled_for: '2026-07-07T12:06:00.000Z'
			})
		);
	});

	it('marks the signal failed when the queue wakeup cannot be scheduled', async () => {
		const { supabase, signals } = createReviewSignalSupabaseMock();
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);
		mocks.addQueueJobWithPublicId.mockRejectedValue(new Error('queue unavailable'));

		const result = await queueProjectLoopReviewSignal({
			projectId: 'project-1',
			userId: 'user-1',
			source: 'task_update',
			entityType: 'task',
			entityId: 'task-1',
			action: 'updated',
			reviewContext: {
				operationId: 'operation-1',
				origin: 'overdue_triage',
				operationKind: 'bulk_backlog',
				reviewPolicy: 'debounced',
				entityCount: 1
			},
			now: new Date('2026-07-07T12:00:00.000Z')
		});

		expect(result).toEqual({
			queued: false,
			reason: 'queue_failed',
			signalId: 'signal-1',
			dueAt: '2026-07-07T12:01:00.000Z'
		});
		expect(signals[0]).toMatchObject({
			id: 'signal-1',
			status: 'failed',
			error_message: 'queue unavailable'
		});
		expect(typeof signals[0].finished_at).toBe('string');
	});
});

describe('project loop review context', () => {
	it('reads snake-case review context from the request body', () => {
		expect(
			readProjectLoopReviewContext({
				project_review_context: {
					operation_id: 'operation-1',
					origin: 'overdue_triage',
					operation_kind: 'bulk_backlog',
					review_policy: 'suppress',
					entity_count: 6
				}
			})
		).toEqual({
			operationId: 'operation-1',
			origin: 'overdue_triage',
			operationKind: 'bulk_backlog',
			reviewPolicy: 'suppress',
			entityCount: 6
		});
	});

	it('suppresses overdue triage backlog cleanup bursts', () => {
		expect(
			shouldSuppressProjectLoopBurstForTaskUpdate({
				body: {
					state_key: 'todo',
					start_at: null,
					due_at: null,
					project_review_context: {
						origin: 'overdue_triage',
						operation_kind: 'bulk_backlog',
						review_policy: 'suppress'
					}
				}
			})
		).toBe(true);
	});

	it('debounces overdue triage backlog cleanup bursts when requested', () => {
		expect(
			shouldDebounceProjectLoopBurstForTaskUpdate({
				body: {
					state_key: 'todo',
					start_at: null,
					due_at: null,
					project_review_context: {
						origin: 'overdue_triage',
						operation_kind: 'bulk_backlog',
						review_policy: 'debounced'
					}
				}
			})
		).toBe(true);
	});

	it('does not suppress non-backlog task updates even with review context', () => {
		expect(
			shouldSuppressProjectLoopBurstForTaskUpdate({
				body: {
					state_key: 'in_progress',
					due_at: '2026-07-08T23:59:59.000Z',
					project_review_context: {
						origin: 'overdue_triage',
						operation_kind: 'bulk_backlog',
						review_policy: 'suppress'
					}
				}
			})
		).toBe(false);
	});

	it('suppresses burst queueing for project suggestion replay context', () => {
		expect(
			shouldSkipProjectLoopBurst(
				new Request('http://localhost/api/test', { method: 'POST' }),
				{
					origin: 'project_suggestion_replay',
					operationKind: 'suggestion_apply',
					reviewPolicy: 'suppress'
				}
			)
		).toBe(true);
	});

	it('does not treat suppress policy from unknown origins as a global skip', () => {
		expect(
			shouldSkipProjectLoopBurst(
				new Request('http://localhost/api/test', { method: 'POST' }),
				{
					origin: 'untrusted_client',
					operationKind: 'bulk_edit',
					reviewPolicy: 'suppress'
				}
			)
		).toBe(false);
	});

	it('keeps the legacy burst-skip header as a compatibility fallback', () => {
		expect(
			shouldSkipProjectLoopBurst(
				new Request('http://localhost/api/test', {
					method: 'POST',
					headers: { 'X-Skip-Project-Loop-Burst': 'true' }
				})
			)
		).toBe(true);
	});
});
