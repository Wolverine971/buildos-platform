// apps/web/src/lib/server/project-loop-burst.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	queueProjectLoop: vi.fn(),
	queueProjectAudit: vi.fn()
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

vi.mock('$lib/config/project-loops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

import {
	queueProjectLoopBurst,
	readProjectLoopReviewContext,
	shouldDebounceProjectLoopBurstForTaskUpdate,
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
});
