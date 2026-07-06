// apps/worker/tests/projectLoopWorkerCompleteAuditClaim.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = {
	data: unknown;
	error: { message: string } | null;
};

type QueryRecord = {
	table: string;
	payload: Record<string, unknown>;
	filters: Array<{ column: string; value: unknown }>;
	inFilters: Array<{ column: string; values: unknown[] }>;
	select?: string;
};

const mocks = vi.hoisted(() => {
	const state = {
		auditClaimResult: { data: null, error: null } as QueryResult,
		runClaimResult: { data: null, error: null } as QueryResult,
		queries: [] as QueryRecord[]
	};

	const supabaseFrom = vi.fn((table: string) => ({
		update: vi.fn((payload: Record<string, unknown>) => {
			const record: QueryRecord = {
				table,
				payload,
				filters: [],
				inFilters: []
			};
			state.queries.push(record);

			const query = {
				data: null,
				error: null,
				eq: vi.fn((column: string, value: unknown) => {
					record.filters.push({ column, value });
					return query;
				}),
				in: vi.fn((column: string, values: unknown[]) => {
					record.inFilters.push({ column, values });
					return query;
				}),
				select: vi.fn((select: string) => {
					record.select = select;
					return query;
				}),
				maybeSingle: vi.fn(async () => {
					if (table === 'project_audits' && payload.status === 'running') {
						return state.auditClaimResult;
					}
					if (table === 'project_loop_runs' && payload.status === 'running') {
						return state.runClaimResult;
					}
					return { data: null, error: null };
				})
			};

			return query;
		})
	}));

	return {
		state,
		supabaseFrom,
		captureWorkerEvent: vi.fn(),
		logWorkerError: vi.fn(),
		processProjectAuditTriggerEvaluationJob: vi.fn()
	};
});

vi.mock('../src/config/projectLoops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: mocks.supabaseFrom
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

vi.mock('../src/workers/project-loop/auditEnqueue', () => ({
	processProjectAuditTriggerEvaluationJob: mocks.processProjectAuditTriggerEvaluationJob
}));

import { processProjectLoopJob } from '../src/workers/project-loop/projectLoopWorker';
import type { ProcessingJob } from '../src/lib/supabaseQueue';
import type { ProjectLoopJobMetadata } from '@buildos/shared-types';

function createCompleteAuditJob(
	overrides: Partial<ProjectLoopJobMetadata> = {}
): ProcessingJob<ProjectLoopJobMetadata> {
	return {
		id: 'queue-job-1',
		processingToken: 'token-1',
		userId: 'user-1',
		attempts: 0,
		data: {
			mode: 'complete_audit',
			runId: 'run-1',
			auditId: 'audit-1',
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'manual',
			...overrides
		},
		updateProgress: vi.fn(async () => undefined),
		log: vi.fn(async () => undefined)
	};
}

function findUpdate(table: string, status: string): QueryRecord | undefined {
	return mocks.state.queries.find(
		(query) => query.table === table && query.payload.status === status
	);
}

describe('processProjectLoopJob complete audit claim lifecycle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.state.queries.length = 0;
		mocks.state.auditClaimResult = { data: null, error: null };
		mocks.state.runClaimResult = { data: null, error: null };
	});

	it('does not mark the run running when the audit cannot be claimed', async () => {
		const result = await processProjectLoopJob(createCompleteAuditJob());

		expect(result).toMatchObject({
			success: true,
			runId: 'run-1',
			auditId: 'audit-1',
			skipped: true
		});

		expect(findUpdate('project_audits', 'running')?.filters).toEqual([
			{ column: 'id', value: 'audit-1' },
			{ column: 'loop_run_id', value: 'run-1' },
			{ column: 'status', value: 'queued' }
		]);
		expect(findUpdate('project_loop_runs', 'running')).toBeUndefined();
		expect(findUpdate('project_loop_runs', 'failed')?.filters).toEqual([
			{ column: 'id', value: 'run-1' },
			{ column: 'status', value: 'queued' }
		]);
		expect(findUpdate('project_audits', 'failed')).toBeUndefined();
	});

	it('fails the claimed audit when the paired run is not queued', async () => {
		mocks.state.auditClaimResult = { data: { id: 'audit-1' }, error: null };
		mocks.state.runClaimResult = { data: null, error: null };

		const result = await processProjectLoopJob(createCompleteAuditJob());

		expect(result).toMatchObject({
			success: true,
			runId: 'run-1',
			auditId: 'audit-1',
			skipped: true
		});

		expect(findUpdate('project_audits', 'running')).toBeDefined();
		expect(findUpdate('project_loop_runs', 'running')).toBeDefined();
		expect(findUpdate('project_loop_runs', 'failed')?.inFilters).toEqual([
			{ column: 'status', values: ['queued', 'running'] }
		]);
		expect(findUpdate('project_audits', 'failed')?.inFilters).toEqual([
			{ column: 'status', values: ['running'] }
		]);
	});

	it('fails both rows when the audit claim query errors', async () => {
		mocks.state.auditClaimResult = {
			data: null,
			error: { message: 'database unavailable' }
		};

		await expect(processProjectLoopJob(createCompleteAuditJob())).rejects.toThrow(
			'Failed to claim project audit: database unavailable'
		);

		expect(findUpdate('project_loop_runs', 'running')).toBeUndefined();
		expect(findUpdate('project_loop_runs', 'failed')).toBeDefined();
		expect(findUpdate('project_audits', 'failed')).toBeDefined();
		expect(findUpdate('project_suggestions', 'superseded')?.filters).toEqual([
			{ column: 'run_id', value: 'run-1' },
			{ column: 'status', value: 'pending' }
		]);
	});
});
