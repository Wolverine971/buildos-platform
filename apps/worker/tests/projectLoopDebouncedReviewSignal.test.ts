// apps/worker/tests/projectLoopDebouncedReviewSignal.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectLoopJobMetadata } from '@buildos/shared-types';
import type { ProcessingJob } from '../src/lib/supabaseQueue';

type QueryRecord = {
	table: string;
	action: 'select' | 'update';
	payload?: Record<string, unknown>;
	filters: Array<{ column: string; value: unknown }>;
	lteFilters: Array<{ column: string; value: unknown }>;
};

const mocks = vi.hoisted(() => {
	const state = {
		queries: [] as QueryRecord[],
		pendingSignal: {
			id: 'signal-1',
			project_id: 'project-1',
			user_id: 'user-1',
			status: 'pending',
			due_at: '2026-07-07T14:00:00.000Z'
		},
		claimedSignal: {
			id: 'signal-1',
			project_id: 'project-1',
			user_id: 'user-1',
			status: 'processing',
			due_at: '2026-07-07T14:00:00.000Z'
		}
	};

	const createQuery = (record: QueryRecord) => {
		const query = {
			select: vi.fn(() => query),
			eq: vi.fn((column: string, value: unknown) => {
				record.filters.push({ column, value });
				return query;
			}),
			lte: vi.fn((column: string, value: unknown) => {
				record.lteFilters.push({ column, value });
				return query;
			}),
			order: vi.fn(() => query),
			limit: vi.fn(() => query),
			maybeSingle: vi.fn(async () => {
				if (record.action === 'select') {
					return { data: state.pendingSignal, error: null };
				}
				if (record.payload?.status === 'processing') {
					return { data: state.claimedSignal, error: null };
				}
				return { data: null, error: null };
			}),
			then: (resolve: (value: { data: null; error: null }) => void) =>
				Promise.resolve(resolve({ data: null, error: null }))
		};
		return query;
	};

	const supabaseFrom = vi.fn((table: string) => ({
		select: vi.fn(() => {
			const record: QueryRecord = { table, action: 'select', filters: [], lteFilters: [] };
			state.queries.push(record);
			return createQuery(record);
		}),
		update: vi.fn((payload: Record<string, unknown>) => {
			const record: QueryRecord = {
				table,
				action: 'update',
				payload,
				filters: [],
				lteFilters: []
			};
			state.queries.push(record);
			return createQuery(record);
		})
	}));

	return {
		state,
		supabaseFrom,
		enqueueProjectLoop: vi.fn(),
		queueProjectAuditFromWorker: vi.fn(),
		processProjectAuditTriggerEvaluationJob: vi.fn(),
		captureWorkerEvent: vi.fn(),
		logWorkerError: vi.fn()
	};
});

vi.mock('../src/config/projectLoops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: mocks.supabaseFrom,
		rpc: vi.fn()
	}
}));

vi.mock('../src/lib/posthog', () => ({
	captureWorkerEvent: mocks.captureWorkerEvent
}));

vi.mock('../src/lib/errorLogger', () => ({
	logWorkerError: mocks.logWorkerError
}));

vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: vi.fn()
}));

vi.mock('../src/workers/project-loop/enqueue', () => ({
	enqueueProjectLoop: mocks.enqueueProjectLoop
}));

vi.mock('../src/workers/project-loop/auditEnqueue', () => ({
	processProjectAuditTriggerEvaluationJob: mocks.processProjectAuditTriggerEvaluationJob,
	queueProjectAuditFromWorker: mocks.queueProjectAuditFromWorker
}));

import { processProjectLoopJob } from '../src/workers/project-loop/projectLoopWorker';

function createDebouncedSignalJob(
	overrides: Partial<ProjectLoopJobMetadata> = {}
): ProcessingJob<ProjectLoopJobMetadata> {
	return {
		id: 'queue-job-1',
		processingToken: 'token-1',
		userId: 'user-1',
		attempts: 0,
		data: {
			mode: 'debounced_review_signal',
			signalId: 'signal-1',
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'burst',
			...overrides
		},
		updateProgress: vi.fn(async () => undefined),
		log: vi.fn(async () => undefined)
	};
}

describe('processProjectLoopJob debounced review signals', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.state.queries.length = 0;
		mocks.state.pendingSignal.due_at = '2026-07-07T14:00:00.000Z';
		mocks.state.claimedSignal.due_at = '2026-07-07T14:00:00.000Z';
		mocks.enqueueProjectLoop.mockResolvedValue({ queued: true, runId: 'run-1' });
		mocks.queueProjectAuditFromWorker.mockResolvedValue({
			queued: false,
			reason: 'cooldown_active'
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('claims a due signal and enqueues one burst review pass', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-07T14:01:00.000Z'));

		const result = await processProjectLoopJob(createDebouncedSignalJob());

		expect(result).toMatchObject({ success: true, runId: 'run-1', skipped: false });
		expect(mocks.enqueueProjectLoop).toHaveBeenCalledWith({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'burst'
		});
		expect(mocks.queueProjectAuditFromWorker).toHaveBeenCalledWith({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'burst'
		});

		const processingUpdate = mocks.state.queries.find(
			(query) => query.action === 'update' && query.payload?.status === 'processing'
		);
		expect(processingUpdate?.filters).toEqual([
			{ column: 'id', value: 'signal-1' },
			{ column: 'status', value: 'pending' }
		]);
		expect(processingUpdate?.lteFilters).toEqual([
			{ column: 'due_at', value: '2026-07-07T14:01:00.000Z' }
		]);

		const completedUpdate = mocks.state.queries.find(
			(query) => query.action === 'update' && query.payload?.status === 'completed'
		);
		expect(completedUpdate?.payload).toMatchObject({
			processed_loop_run_id: 'run-1',
			processed_audit_id: null
		});
	});
});
