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
	operation?: string;
	ltFilters: Array<{ column: string; value: string }>;
};

const mocks = vi.hoisted(() => {
	const state = {
		auditClaimResult: { data: null, error: null } as QueryResult,
		runClaimResult: { data: null, error: null } as QueryResult,
		queries: [] as QueryRecord[],
		abortOnReady: null as AbortController | null,
		failReadyRunCompletion: false
	};

	const rows: Record<string, Record<string, any>> = {};
	const getJSONResponse = vi.fn();
	const supabaseFrom = vi.fn((table: string) => {
		const record: QueryRecord = {
			table,
			payload: {},
			filters: [],
			inFilters: [],
			ltFilters: []
		};
		state.queries.push(record);
		const result = (): QueryResult => {
			const row = rows[table];
			if (row) {
				const matches =
					record.filters.every(({ column, value }) => row[column] === value) &&
					record.inFilters.every(({ column, values }) => values.includes(row[column])) &&
					record.ltFilters.every(({ column, value }) => row[column] < value);
				if (!matches)
					return {
						data: record.operation === 'update' || record.select === 'id' ? null : [],
						error: null
					};
				if (
					record.operation === 'update' &&
					table === 'project_loop_runs' &&
					record.payload.status === 'completed' &&
					state.failReadyRunCompletion
				)
					return { data: null, error: { message: 'database unavailable' } };
				if (record.operation === 'update') {
					Object.assign(row, record.payload);
					if (table === 'project_audits' && record.payload.status === 'ready')
						state.abortOnReady?.abort(new Error('Deploy after audit persisted'));
				}
				return { data: { ...row }, error: null };
			}
			if (record.operation === 'update' && record.payload.status === 'running') {
				return table === 'project_audits' ? state.auditClaimResult : state.runClaimResult;
			}
			if (table === 'onto_projects')
				return {
					data: { id: 'project-1', name: 'Launch', doc_structure: [] },
					error: null
				};
			return {
				data: record.operation === 'update' || record.select === 'id' ? null : [],
				error: null
			};
		};
		const query: any = {};
		query.update = vi.fn((payload) => {
			record.operation = 'update';
			record.payload = payload;
			return query;
		});
		query.select = vi.fn((selection) => {
			record.select = selection;
			return query;
		});
		query.eq = vi.fn((column, value) => {
			record.filters.push({ column, value });
			return query;
		});
		query.in = vi.fn((column, values) => {
			record.inFilters.push({ column, values });
			return query;
		});
		query.lt = vi.fn((column, value) => {
			record.ltFilters.push({ column, value });
			return query;
		});
		for (const method of ['gte', 'order', 'limit', 'neq', 'not', 'is'])
			query[method] = vi.fn(() => query);
		query.maybeSingle = vi.fn(async () => {
			const value = result();
			return Array.isArray(value.data) ? { ...value, data: null } : value;
		});
		query.then = (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject);
		return query;
	});

	return {
		state,
		rows,
		getJSONResponse,
		syncInboxItemForProjectAudit: vi.fn(async () => undefined),
		rpc: vi.fn(async (name: string) => {
			if (name !== 'load_project_graph_context') return { data: null, error: null };
			return {
				data: {
					project: {
						id: 'project-1',
						name: 'Launch',
						description: 'Ship v1',
						type_key: 'project',
						state_key: 'active',
						facet_context: null,
						facet_scale: null,
						facet_stage: null,
						start_at: null,
						end_at: null,
						next_step_short: null,
						next_step_long: null,
						created_at: '2026-08-22T00:00:00.000Z',
						updated_at: '2026-08-22T00:00:00.000Z'
					},
					documents: [],
					goals: [
						{
							id: 'goal-1',
							name: 'Launch',
							goal: null,
							description: 'Ship v1',
							state_key: 'active',
							type_key: null,
							target_date: null,
							completed_at: null,
							created_at: '2026-08-22T00:00:00.000Z',
							updated_at: '2026-08-22T00:00:00.000Z'
						}
					],
					tasks: [
						{
							id: 'task-1',
							title: 'Publish launch',
							description: null,
							state_key: 'todo',
							type_key: 'task',
							priority: null,
							start_at: null,
							due_at: null,
							completed_at: null,
							created_at: '2026-08-22T00:00:00.000Z',
							updated_at: '2026-08-22T00:00:00.000Z'
						},
						{
							id: 'task-2',
							title: 'Prepare launch announcement',
							description: null,
							state_key: 'todo',
							type_key: 'task',
							priority: null,
							start_at: null,
							due_at: null,
							completed_at: null,
							created_at: '2026-08-22T00:00:00.000Z',
							updated_at: '2026-08-22T00:00:00.000Z'
						}
					],
					plans: [],
					milestones: [],
					risks: [],
					requirements: [],
					signals: [],
					insights: [],
					edges: []
				},
				error: null
			};
		}),
		supabaseFrom,
		captureWorkerEvent: vi.fn(),
		logWorkerError: vi.fn(),
		processProjectAuditTriggerEvaluationJob: vi.fn()
	};
});

vi.mock('../src/config/projectLoops', () => ({
	PROJECT_LOOPS_ENABLED: true,
	PROJECT_LOOP_JSON_PROVIDER_ORDER_RESOLVED: []
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: mocks.supabaseFrom,
		rpc: mocks.rpc
	}
}));

vi.mock('../src/lib/posthog', () => ({
	captureWorkerEvent: mocks.captureWorkerEvent
}));

vi.mock('../src/lib/errorLogger', () => ({
	logWorkerError: mocks.logWorkerError
}));

vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		getJSONResponse = mocks.getJSONResponse;
	}
}));

vi.mock('@buildos/shared-agent-ops/inbox-index', async (importOriginal) => ({
	...(await importOriginal<typeof import('@buildos/shared-agent-ops/inbox-index')>()),
	syncInboxItemForProjectAudit: mocks.syncInboxItemForProjectAudit
}));

vi.mock('../src/workers/project-loop/auditEnqueue', () => ({
	processProjectAuditTriggerEvaluationJob: mocks.processProjectAuditTriggerEvaluationJob,
	queueProjectAuditFromWorker: vi.fn()
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
		correlationId: null,
		signal: new AbortController().signal,
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
		mocks.state.abortOnReady = null;
		mocks.state.failReadyRunCompletion = false;
		mocks.syncInboxItemForProjectAudit.mockReset().mockResolvedValue(undefined);
		for (const key of Object.keys(mocks.rows)) delete mocks.rows[key];
		mocks.getJSONResponse.mockReset().mockResolvedValue({});
		mocks.state.auditClaimResult = { data: null, error: null };
		mocks.state.runClaimResult = { data: null, error: null };
	});

	function seedRows(
		status = 'queued',
		queueJobId = 'queue-job-1',
		startedAt = '2020-01-01T00:00:00.000Z'
	) {
		mocks.rows.project_audits = {
			id: 'audit-1',
			loop_run_id: 'run-1',
			status,
			started_at: startedAt
		};
		mocks.rows.project_loop_runs = {
			id: 'run-1',
			project_id: 'project-1',
			user_id: 'user-1',
			status,
			started_at: startedAt,
			queue_job_id: queueJobId
		};
	}

	it.each(['rejects', 'resolves'])(
		'requeues both rows when synthesis %s after abort',
		async (mode) => {
			seedRows();
			const controller = new AbortController();
			const cancellation = new Error('Deploy interrupted synthesis');
			mocks.getJSONResponse.mockImplementationOnce(async () => {
				controller.abort(cancellation);
				if (mode === 'rejects') throw cancellation;
				return {};
			});
			await expect(
				processProjectLoopJob({ ...createCompleteAuditJob(), signal: controller.signal })
			).rejects.toBe(cancellation);
			expect(mocks.getJSONResponse).toHaveBeenCalledWith(
				expect.objectContaining({ signal: controller.signal })
			);
			for (const table of ['project_audits', 'project_loop_runs']) {
				expect(mocks.rows[table]).toMatchObject({ status: 'queued', started_at: null });
				expect(findUpdate(table, 'queued')?.filters).toContainEqual({
					column: 'started_at',
					value: expect.any(String)
				});
			}
			expect(findUpdate('project_audits', 'ready')).toBeUndefined();
		}
	);

	it('resumes stale running audit and run claims from the same queue row', async () => {
		seedRows('running');
		const controller = new AbortController();
		mocks.getJSONResponse.mockImplementationOnce(async () => {
			controller.abort(new Error('Reached synthesis on retry'));
			throw controller.signal.reason;
		});
		await expect(
			processProjectLoopJob({ ...createCompleteAuditJob(), signal: controller.signal })
		).rejects.toThrow('Reached synthesis on retry');
		expect(mocks.getJSONResponse).toHaveBeenCalledOnce();
	});

	it.each(['fresh', 'other_queue'])('does not take over a %s audit', async (kind) => {
		seedRows(
			'running',
			kind === 'other_queue' ? 'queue-2' : 'queue-job-1',
			kind === 'fresh' ? new Date().toISOString() : '2020-01-01T00:00:00.000Z'
		);
		await expect(processProjectLoopJob(createCompleteAuditJob())).resolves.toMatchObject({
			skipped: true
		});
		expect(mocks.getJSONResponse).not.toHaveBeenCalled();
		expect(mocks.rows.project_audits.status).toBe('running');
		expect(mocks.rows.project_loop_runs.status).toBe('running');
	});

	it('does not fail the queued run while another invocation holds the audit claim', async () => {
		seedRows();
		mocks.rows.project_audits.status = 'running';
		mocks.rows.project_audits.started_at = new Date().toISOString();
		await expect(processProjectLoopJob(createCompleteAuditJob())).resolves.toMatchObject({
			skipped: true
		});
		expect(mocks.rows.project_loop_runs.status).toBe('queued');
	});

	it('finishes the paired run on retry when abort followed a durable ready audit', async () => {
		seedRows();
		const controller = new AbortController();
		mocks.state.abortOnReady = controller;
		await expect(
			processProjectLoopJob({ ...createCompleteAuditJob(), signal: controller.signal })
		).rejects.toThrow('Deploy after audit persisted');
		expect(mocks.rows.project_audits.status).toBe('ready');
		await processProjectLoopJob(createCompleteAuditJob());
		expect(mocks.rows.project_loop_runs.status).toBe('completed');
		expect(mocks.getJSONResponse).toHaveBeenCalledOnce();
	});

	it('does not take a stale audit away from a freshly renewed paired run', async () => {
		seedRows('running');
		mocks.rows.project_loop_runs.started_at = new Date().toISOString();
		await expect(processProjectLoopJob(createCompleteAuditJob())).resolves.toMatchObject({
			skipped: true
		});
		expect(mocks.rows.project_loop_runs.status).toBe('running');
		expect(mocks.rows.project_audits.started_at).toBe('2020-01-01T00:00:00.000Z');
	});

	it('preserves a ready audit when the completion write needs a retry', async () => {
		seedRows('running');
		mocks.rows.project_audits.status = 'ready';
		mocks.state.failReadyRunCompletion = true;
		await expect(processProjectLoopJob(createCompleteAuditJob())).rejects.toThrow(
			'database unavailable'
		);
		expect(mocks.rows.project_audits.status).toBe('ready');
		expect(mocks.rows.project_loop_runs.status).toBe('running');
	});

	it('keeps the recovered audit complete if inbox sync fails', async () => {
		seedRows('running');
		mocks.rows.project_audits.status = 'ready';
		mocks.syncInboxItemForProjectAudit.mockRejectedValueOnce(new Error('Inbox unavailable'));
		await expect(processProjectLoopJob(createCompleteAuditJob())).resolves.toMatchObject({
			success: true
		});
		expect(mocks.rows.project_audits.status).toBe('ready');
		expect(mocks.rows.project_loop_runs.status).toBe('completed');
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
		expect(findUpdate('project_loop_runs', 'failed')).toBeUndefined();
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
