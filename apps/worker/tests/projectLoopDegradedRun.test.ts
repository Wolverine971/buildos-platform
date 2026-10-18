// apps/worker/tests/projectLoopDegradedRun.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMRequestTimeoutError } from '@buildos/smart-llm';
import { PermanentQueueError } from '../src/lib/queueErrors';

const mocks = vi.hoisted(() => {
	type QueryRecord = {
		table: string;
		operation: 'select' | 'update' | 'insert' | null;
		selection?: string;
		payload?: unknown;
		filters: Array<{ method: string; args: unknown[] }>;
	};

	const state = {
		queries: [] as QueryRecord[],
		updates: [] as QueryRecord[],
		inserts: [] as QueryRecord[],
		run: {} as Record<string, any>
	};

	const claimedRun = {
		id: 'run-1',
		project_id: 'project-1',
		user_id: 'user-1',
		chat_session_id: 'chat-1',
		trigger_reason: 'scheduled',
		status: 'running'
	};

	function resultFor(query: QueryRecord): { data: unknown; error: null } {
		if (query.table === 'project_loop_runs' && query.operation === 'update') {
			const matches = query.filters.every(({ method, args: [column, value] }) => {
				if (method === 'eq') return state.run[String(column)] === value;
				if (method === 'lt') return state.run[String(column)] < String(value);
				return true;
			});
			if (!matches) return { data: null, error: null };
			Object.assign(state.run, query.payload);
			return { data: { ...state.run }, error: null };
		}
		if (query.table === 'onto_projects') {
			return {
				data: {
					id: 'project-1',
					name: 'Launch',
					description: 'Ship v1',
					doc_structure: [],
					deleted_at: null,
					archived_at: null
				},
				error: null
			};
		}
		if (query.table === 'project_suggestions' && query.operation === 'insert') {
			return { data: query.payload ?? [], error: null };
		}
		if (
			query.table === 'project_suggestions' &&
			query.operation === 'select' &&
			query.selection?.includes('created_at, updated_at')
		) {
			return {
				data: [
					{
						id: 'old-drift',
						kind: 'drift',
						operations: [],
						evidence_refs: [],
						title: 'Existing drift finding',
						created_at: '2026-08-18T00:00:00.000Z',
						updated_at: '2026-08-18T00:00:00.000Z'
					}
				],
				error: null
			};
		}
		return { data: [], error: null };
	}

	function createQuery(table: string) {
		const query: QueryRecord = { table, operation: null, filters: [] };
		state.queries.push(query);
		const builder: Record<string, any> = {};
		builder.select = vi.fn((selection?: string) => {
			if (!query.operation) query.operation = 'select';
			query.selection = selection;
			return builder;
		});
		builder.update = vi.fn((payload: unknown) => {
			query.operation = 'update';
			query.payload = payload;
			state.updates.push(query);
			return builder;
		});
		builder.insert = vi.fn((payload: unknown) => {
			query.operation = 'insert';
			query.payload = payload;
			state.inserts.push(query);
			return builder;
		});
		for (const method of ['eq', 'neq', 'in', 'gte', 'lte', 'lt', 'order', 'limit']) {
			builder[method] = vi.fn((...args: unknown[]) => {
				query.filters.push({ method, args });
				return builder;
			});
		}
		builder.maybeSingle = vi.fn(async () => resultFor(query));
		builder.single = vi.fn(async () => resultFor(query));
		builder.then = (
			resolve: (value: { data: unknown; error: null }) => unknown,
			reject: (reason: unknown) => unknown
		) => Promise.resolve(resultFor(query)).then(resolve, reject);
		return builder;
	}

	return {
		state,
		claimedRun,
		from: vi.fn((table: string) => createQuery(table)),
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
		loadUnchangedLensInputs: vi.fn(),
		generateDocOrganization: vi.fn(async (_params: any) => []),
		generateOutdatedDocs: vi.fn(async (_params: any) => []),
		generateDrift: vi.fn(),
		generateTaskConflicts: vi.fn(async (_params: any) => [
			{
				kind: 'task_conflict',
				risk_tier: 1,
				title: 'Review overlapping launch tasks',
				rationale: 'The tasks overlap.',
				evidence_refs: [],
				operations: [],
				reversible: true
			}
		]),
		generateProjectCleanupSynthesis: vi.fn(),
		emptySynthesis: () => ({
			synthesis: {
				bottom_line: null,
				recommendation: null,
				groups: [],
				open_count: 0,
				closed_this_pass: [],
				generated_at: '2026-09-29T00:00:00.000Z',
				source: 'llm'
			},
			verdicts: [],
			merges: [],
			sections: new Map(),
			summaries: new Map(),
			attentionLevel: 'none',
			stateSummary: null,
			nextBestAction: null
		}),
		rankTaskConflictPairs: vi.fn(),
		captureWorkerEvent: vi.fn(),
		logWorkerError: vi.fn(async () => undefined),
		syncInboxItemForProjectCleanup: vi.fn(async () => undefined)
	};
});

vi.mock('../src/config/projectLoops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: mocks.from,
		rpc: mocks.rpc
	}
}));

vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: vi.fn()
}));

vi.mock('../src/workers/project-loop/taskPairs', () => ({
	rankTaskConflictPairs: mocks.rankTaskConflictPairs
}));

vi.mock('../src/lib/posthog', () => ({
	captureWorkerEvent: mocks.captureWorkerEvent
}));

vi.mock('../src/lib/errorLogger', () => ({
	logWorkerError: mocks.logWorkerError
}));

vi.mock('../src/workers/project-loop/lensInputs', () => ({
	loadUnchangedLensInputs: mocks.loadUnchangedLensInputs
}));

vi.mock('../src/workers/project-loop/generators', () => ({
	generateDocOrganization: mocks.generateDocOrganization,
	generateOutdatedDocs: mocks.generateOutdatedDocs,
	generateDrift: mocks.generateDrift,
	generateTaskConflicts: mocks.generateTaskConflicts,
	generateProjectCleanupSynthesis: mocks.generateProjectCleanupSynthesis,
	withoutRadarOwnedFindings: (kept: unknown[]) => ({ kept, dropped: 0 }),
	suggestionSuppressionKey: vi.fn((suggestion: { kind?: string; title?: string | null }) =>
		suggestion.kind && suggestion.title ? `${suggestion.kind}:${suggestion.title}` : null
	)
}));

vi.mock('@buildos/shared-agent-ops', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@buildos/shared-agent-ops')>();
	return {
		...actual,
		buildProjectLoopParentMap: vi.fn(() => new Map()),
		summarizeProjectLoopDocTree: vi.fn(() => '(empty)'),
		projectLoopDocumentRecencyMs: vi.fn(() => 0),
		loadProjectLoopSuggestionEntityStates: vi.fn(async () => []),
		extractProjectLoopSuggestionEntities: vi.fn(() => ({ taskIds: [], docIds: [] })),
		buildScopedSuggestionFingerprint: vi.fn(() => null)
	};
});

vi.mock('@buildos/shared-agent-ops/inbox-index', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@buildos/shared-agent-ops/inbox-index')>();
	return {
		...actual,
		syncInboxItemForProjectCleanup: mocks.syncInboxItemForProjectCleanup,
		syncInboxItemForProjectSuggestion: vi.fn(async () => undefined)
	};
});

vi.mock('../src/workers/project-loop/auditEnqueue', () => ({
	processProjectAuditTriggerEvaluationJob: vi.fn(),
	queueProjectAuditFromWorker: vi.fn()
}));

vi.mock('../src/workers/project-loop/enqueue', () => ({
	enqueueProjectLoop: vi.fn()
}));

import { processProjectLoopJob } from '../src/workers/project-loop/projectLoopWorker';

function createJob(controller = new AbortController()) {
	return {
		id: 'queue-1',
		data: {
			runId: 'run-1',
			projectId: 'project-1',
			mode: 'light'
		},
		signal: controller.signal,
		log: vi.fn(async () => undefined),
		updateProgress: vi.fn(async () => undefined)
	} as any;
}

describe('processProjectLoopJob detector degradation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.state.queries.length = 0;
		mocks.state.updates.length = 0;
		mocks.state.inserts.length = 0;
		mocks.state.run = { ...mocks.claimedRun, status: 'queued', queue_job_id: 'queue-1' };
		mocks.generateDrift.mockResolvedValue([]);
		mocks.loadUnchangedLensInputs.mockResolvedValue({ documents: false, tasks: false });
		mocks.generateDocOrganization.mockResolvedValue([]);
		mocks.generateOutdatedDocs.mockResolvedValue([]);
		mocks.rankTaskConflictPairs.mockResolvedValue([
			{ taskAId: 'task-1', taskBId: 'task-2', score: 0.9, reasons: ['review relevance 0.90'] }
		]);
		mocks.generateTaskConflicts.mockResolvedValue([
			{
				kind: 'task_conflict',
				risk_tier: 1,
				title: 'Review overlapping launch tasks',
				rationale: 'The tasks overlap.',
				evidence_refs: [],
				operations: [],
				reversible: true
			}
		]);
		mocks.generateProjectCleanupSynthesis.mockResolvedValue(mocks.emptySynthesis());
	});

	it('requeues an interrupted run so the same queue job can retry', async () => {
		const controller = new AbortController();
		const cancellation = new Error('Worker timeout');
		mocks.generateDrift.mockImplementationOnce(async () => {
			controller.abort(cancellation);
			throw cancellation;
		});
		await expect(processProjectLoopJob(createJob(controller))).rejects.toBe(cancellation);
		expect(mocks.state.run).toMatchObject({ status: 'queued', started_at: null });
		const reset = mocks.state.updates.find((q) => (q.payload as any)?.status === 'queued');
		expect(reset?.filters).toEqual(
			expect.arrayContaining([
				{ method: 'eq', args: ['queue_job_id', 'queue-1'] },
				{ method: 'eq', args: ['started_at', expect.any(String)] }
			])
		);
		await expect(processProjectLoopJob(createJob())).resolves.toMatchObject({ success: true });
		expect(mocks.generateDrift).toHaveBeenCalledTimes(2);
	});

	it('reclaims an old running run only for the same queue job', async () => {
		Object.assign(mocks.state.run, {
			status: 'running',
			started_at: '2020-01-01T00:00:00.000Z'
		});
		await expect(processProjectLoopJob(createJob())).resolves.toMatchObject({ success: true });
		expect(mocks.generateDrift).toHaveBeenCalledOnce();
	});

	it.each(['fresh', 'different_queue', 'completed'])('does not reclaim %s runs', async (kind) => {
		Object.assign(mocks.state.run, {
			status: kind === 'completed' ? 'completed' : 'running',
			started_at: kind === 'fresh' ? new Date().toISOString() : '2020-01-01T00:00:00.000Z',
			queue_job_id: kind === 'different_queue' ? 'queue-2' : 'queue-1'
		});
		await expect(processProjectLoopJob(createJob())).resolves.toMatchObject({ skipped: true });
		expect(mocks.generateDrift).not.toHaveBeenCalled();
	});

	it('does not reset a newer claim after the old invocation aborts', async () => {
		const controller = new AbortController();
		mocks.generateDrift.mockImplementationOnce(async () => {
			mocks.state.run.started_at = '2099-01-01T00:00:00.000Z';
			controller.abort(new Error('Old invocation stopped'));
			throw controller.signal.reason;
		});
		await expect(processProjectLoopJob(createJob(controller))).rejects.toThrow(
			'Old invocation'
		);
		expect(mocks.state.run.status).toBe('running');
	});

	it('aborts all parallel detectors as reported usage crosses the cost cap', async () => {
		const signals: AbortSignal[] = [];
		let release!: () => void;
		const allStarted = new Promise<void>((resolve) => {
			release = resolve;
		});
		let releaseUsage!: () => void;
		const usageReported = new Promise<void>((resolve) => {
			releaseUsage = resolve;
		});
		const detector = (reportsCost: boolean) => async (params: any) => {
			signals.push(params.signal);
			if (signals.length === 4) release();
			await allStarted;
			if (reportsCost) {
				await params.onUsage({ totalCost: 0.36 });
				releaseUsage();
			}
			await usageReported;
			return [];
		};
		mocks.generateDocOrganization.mockImplementationOnce(detector(true));
		mocks.generateOutdatedDocs.mockImplementationOnce(detector(false));
		mocks.generateDrift.mockImplementationOnce(detector(false));
		mocks.generateTaskConflicts.mockImplementationOnce(detector(false));
		const job = createJob();
		await expect(processProjectLoopJob(job)).resolves.toMatchObject({ success: true });
		expect(signals).toHaveLength(4);
		expect(signals.every((signal) => signal.aborted)).toBe(true);
		expect(job.signal.aborted).toBe(false);
		expect(mocks.generateProjectCleanupSynthesis).not.toHaveBeenCalled();
		expect(mocks.state.run).toMatchObject({ status: 'completed', cost_usd: 0.36 });
		expect(mocks.captureWorkerEvent).toHaveBeenCalledWith(
			'user-1',
			'project_suggestion_generated',
			expect.objectContaining({
				skipped_lenses: expect.arrayContaining(
					['doc organization', 'outdated docs', 'drift', 'task conflicts'].map((label) =>
						expect.objectContaining({ label, reason: 'cost_cap' })
					)
				)
			})
		);
	});

	it('uses the heuristic roll-up if its own usage exhausts the remaining budget', async () => {
		mocks.generateProjectCleanupSynthesis.mockImplementationOnce(async (params: any) => {
			await params.onUsage({ totalCost: 0.35 });
			params.signal.throwIfAborted();
			return mocks.emptySynthesis();
		});
		await expect(processProjectLoopJob(createJob())).resolves.toMatchObject({ success: true });
		const signal = (mocks.generateProjectCleanupSynthesis.mock.calls[0]?.[0] as any).signal;
		expect(signal.aborted).toBe(true);
		expect(mocks.state.run).toMatchObject({ status: 'completed', cost_usd: 0.35 });
	});

	it('completes after a typed drift timeout and keeps the open drift finding', async () => {
		mocks.generateDrift.mockRejectedValue(
			new LLMRequestTimeoutError(120_000, 'deepseek/deepseek-v4-flash', {
				generationId: 'gen-drift-timeout'
			})
		);
		const job = createJob();

		const result = await processProjectLoopJob(job);

		expect(result).toMatchObject({ success: true, runId: 'run-1', suggestionCount: 1 });
		expect(mocks.generateTaskConflicts).toHaveBeenCalledOnce();
		expect(mocks.state.inserts).toHaveLength(1);
		expect(mocks.generateProjectCleanupSynthesis).toHaveBeenCalledWith(
			expect.objectContaining({ uncheckedLenses: ['drift'], signal: expect.any(AbortSignal) })
		);
		// The unchecked drift finding stays on the list, and the cleanup card is synced.
		const synthesisInput = mocks.generateProjectCleanupSynthesis.mock.calls[0]?.[0] as {
			items: Array<{ lineageId: string }>;
		};
		expect(synthesisInput.items.map((item) => item.lineageId)).toContain('old-drift');
		expect(mocks.syncInboxItemForProjectCleanup).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: 'project-1' })
		);
		expect(
			mocks.state.updates.some(
				(query) =>
					query.table === 'project_suggestions' &&
					(query.payload as { status?: string } | undefined)?.status === 'superseded'
			)
		).toBe(false);

		const terminalUpdate = mocks.state.updates.find(
			(query) =>
				query.table === 'project_loop_runs' &&
				(query.payload as { status?: string } | undefined)?.status === 'completed'
		);
		expect(terminalUpdate?.payload).toMatchObject({
			status: 'completed',
			suggestion_count: 1,
			summary: expect.stringContaining("drift check didn't finish this pass")
		});
		expect(mocks.captureWorkerEvent).toHaveBeenCalledWith(
			'user-1',
			'project_suggestion_generated',
			expect.objectContaining({
				skipped_generators: ['drift'],
				skipped_lenses: [
					expect.objectContaining({
						label: 'drift',
						kind: 'drift',
						reason: 'provider_timeout',
						providerRequestId: 'gen-drift-timeout'
					})
				]
			})
		);
		// The provider's error text stays in the job log, never in PostHog.
		const [, , properties] = mocks.captureWorkerEvent.mock.calls.find(
			([, event]: unknown[]) => event === 'project_suggestion_generated'
		) as [string, string, { skipped_lenses: Record<string, unknown>[] }];
		expect(Object.keys(properties.skipped_lenses[0] ?? {}).sort()).toEqual([
			'kind',
			'label',
			'providerRequestId',
			'reason'
		]);
	});

	it('skips lenses whose inputs are unchanged, without reporting them as unchecked', async () => {
		mocks.generateDrift.mockResolvedValue([]);
		mocks.loadUnchangedLensInputs.mockResolvedValue({ documents: true, tasks: true });
		const job = createJob();

		const result = await processProjectLoopJob(job);

		expect(result).toMatchObject({ success: true, runId: 'run-1' });
		expect(mocks.generateDocOrganization).not.toHaveBeenCalled();
		expect(mocks.rankTaskConflictPairs).not.toHaveBeenCalled();
		expect(mocks.generateTaskConflicts).not.toHaveBeenCalled();
		expect(mocks.generateOutdatedDocs).toHaveBeenCalledOnce();
		expect(mocks.generateDrift).toHaveBeenCalledOnce();
		expect(mocks.generateProjectCleanupSynthesis).toHaveBeenCalledWith(
			expect.objectContaining({ uncheckedLenses: [] })
		);
	});

	it('fails permanently for a non-provider detector error', async () => {
		mocks.generateDrift.mockRejectedValue(new Error('database connection failed'));

		await expect(processProjectLoopJob(createJob())).rejects.toBeInstanceOf(
			PermanentQueueError
		);
		expect(
			mocks.state.updates.some(
				(query) =>
					query.table === 'project_loop_runs' &&
					(query.payload as { status?: string } | undefined)?.status === 'failed'
			)
		).toBe(true);
		expect(mocks.logWorkerError).toHaveBeenCalledOnce();
	});

	it('reports task conflicts as not run when Jev cannot shortlist pairs', async () => {
		mocks.generateDrift.mockResolvedValue([]);
		mocks.rankTaskConflictPairs.mockResolvedValue(null);

		const result = await processProjectLoopJob(createJob());

		expect(result).toMatchObject({ success: true, runId: 'run-1', suggestionCount: 0 });
		expect(mocks.generateTaskConflicts).not.toHaveBeenCalled();
		expect(mocks.generateProjectCleanupSynthesis).toHaveBeenCalledWith(
			expect.objectContaining({ uncheckedLenses: ['task conflicts'] })
		);
		expect(mocks.captureWorkerEvent).toHaveBeenCalledWith(
			'user-1',
			'project_suggestion_generated',
			expect.objectContaining({
				skipped_lenses: [
					expect.objectContaining({
						label: 'task conflicts',
						reason: 'finder_unavailable'
					})
				]
			})
		);
	});

	it('stops without terminal writes after caller ownership is lost', async () => {
		const controller = new AbortController();
		const cancellation = new Error('Worker timeout after 600000ms for buildos_project_loop');
		mocks.generateDrift.mockImplementation(async () => {
			controller.abort(cancellation);
			throw cancellation;
		});

		await expect(processProjectLoopJob(createJob(controller))).rejects.toBe(cancellation);
		// Detectors run concurrently, so the others may already be in flight; what matters is
		// that nothing is written after ownership is lost.
		expect(mocks.state.inserts).toHaveLength(0);
		expect(
			mocks.state.updates.some(
				(query) =>
					query.table === 'project_loop_runs' &&
					['failed', 'completed', 'waiting_review'].includes(
						(query.payload as { status?: string } | undefined)?.status ?? ''
					)
			)
		).toBe(false);
		expect(mocks.logWorkerError).not.toHaveBeenCalled();
	});

	it('stops when ownership is lost as a detector resolves', async () => {
		const controller = new AbortController();
		const cancellation = new Error('Queue ownership expired after detector response');
		mocks.generateDocOrganization.mockImplementation(async () => {
			controller.abort(cancellation);
			return [];
		});

		await expect(processProjectLoopJob(createJob(controller))).rejects.toBe(cancellation);
		expect(mocks.generateOutdatedDocs).not.toHaveBeenCalled();
		expect(mocks.generateDrift).not.toHaveBeenCalled();
		expect(mocks.generateTaskConflicts).not.toHaveBeenCalled();
		expect(mocks.state.inserts).toHaveLength(0);
		expect(
			mocks.state.updates.some(
				(query) =>
					query.table === 'project_loop_runs' &&
					['failed', 'completed', 'waiting_review'].includes(
						(query.payload as { status?: string } | undefined)?.status ?? ''
					)
			)
		).toBe(false);
		expect(mocks.logWorkerError).not.toHaveBeenCalled();
	});

	it('does not finalize after ownership is lost as the roll-up call resolves', async () => {
		const controller = new AbortController();
		const cancellation = new Error('Queue ownership expired after manager response');
		mocks.generateDrift.mockResolvedValue([]);
		mocks.generateTaskConflicts.mockResolvedValue([]);
		mocks.generateProjectCleanupSynthesis.mockImplementation(async () => {
			controller.abort(cancellation);
			return mocks.emptySynthesis();
		});

		await expect(processProjectLoopJob(createJob(controller))).rejects.toBe(cancellation);
		expect(
			mocks.state.updates.some(
				(query) =>
					query.table === 'project_loop_runs' &&
					['failed', 'completed', 'waiting_review'].includes(
						(query.payload as { status?: string } | undefined)?.status ?? ''
					)
			)
		).toBe(false);
		expect(mocks.syncInboxItemForProjectCleanup).not.toHaveBeenCalled();
		expect(mocks.captureWorkerEvent).not.toHaveBeenCalled();
		expect(mocks.logWorkerError).not.toHaveBeenCalled();
	});
});
