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
		inserts: [] as QueryRecord[]
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
		if (
			query.table === 'project_loop_runs' &&
			query.operation === 'update' &&
			(query.payload as { status?: string } | undefined)?.status === 'running'
		) {
			return { data: claimedRun, error: null };
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
		for (const method of ['eq', 'neq', 'in', 'gte', 'lte', 'order', 'limit']) {
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
		generateDocOrganization: vi.fn(async () => []),
		generateOutdatedDocs: vi.fn(async () => []),
		generateDrift: vi.fn(),
		generateTaskConflicts: vi.fn(async () => [
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
		generateProjectManagerBrief: vi.fn(async () => ({
			version: 2,
			attention_level: 'none',
			decision_item_ids: [],
			safe_cleanup_item_ids: [],
			no_attention_reason: 'No action from completed checks.'
		})),
		buildHeuristicProjectManagerBrief: vi.fn(),
		captureWorkerEvent: vi.fn(),
		logWorkerError: vi.fn(async () => undefined),
		syncInboxItemForProjectReview: vi.fn(async () => undefined),
		expireProjectSuggestionInboxItemsForManagerBrief: vi.fn(async () => 0)
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

vi.mock('../src/lib/posthog', () => ({
	captureWorkerEvent: mocks.captureWorkerEvent
}));

vi.mock('../src/lib/errorLogger', () => ({
	logWorkerError: mocks.logWorkerError
}));

vi.mock('../src/workers/project-loop/generators', () => ({
	generateDocOrganization: mocks.generateDocOrganization,
	generateOutdatedDocs: mocks.generateOutdatedDocs,
	generateDrift: mocks.generateDrift,
	generateTaskConflicts: mocks.generateTaskConflicts,
	generateProjectManagerBrief: mocks.generateProjectManagerBrief,
	buildHeuristicProjectManagerBrief: mocks.buildHeuristicProjectManagerBrief,
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
		syncInboxItemForProjectReview: mocks.syncInboxItemForProjectReview,
		expireProjectSuggestionInboxItemsForManagerBrief:
			mocks.expireProjectSuggestionInboxItemsForManagerBrief,
		syncInboxItemForProjectSuggestion: vi.fn(async () => undefined),
		quarantineProjectSuggestionInboxItem: vi.fn(async () => undefined)
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
		mocks.generateDocOrganization.mockResolvedValue([]);
		mocks.generateOutdatedDocs.mockResolvedValue([]);
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
		mocks.generateProjectManagerBrief.mockResolvedValue({
			version: 2,
			attention_level: 'none',
			decision_item_ids: [],
			safe_cleanup_item_ids: [],
			no_attention_reason: 'No action from completed checks.'
		});
	});

	it('completes after a typed drift timeout without rotating old drift findings', async () => {
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
		expect(mocks.generateProjectManagerBrief).toHaveBeenCalledWith(
			expect.objectContaining({ uncheckedLenses: ['drift'], signal: job.signal })
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

	it('stops without terminal writes after caller ownership is lost', async () => {
		const controller = new AbortController();
		const cancellation = new Error('Worker timeout after 600000ms for buildos_project_loop');
		mocks.generateDrift.mockImplementation(async () => {
			controller.abort(cancellation);
			throw cancellation;
		});

		await expect(processProjectLoopJob(createJob(controller))).rejects.toBe(cancellation);
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

	it('does not finalize after ownership is lost as manager synthesis resolves', async () => {
		const controller = new AbortController();
		const cancellation = new Error('Queue ownership expired after manager response');
		mocks.generateDrift.mockResolvedValue([]);
		mocks.generateTaskConflicts.mockResolvedValue([]);
		mocks.generateProjectManagerBrief.mockImplementation(async () => {
			controller.abort(cancellation);
			return {
				version: 2,
				attention_level: 'none',
				decision_item_ids: [],
				safe_cleanup_item_ids: [],
				no_attention_reason: 'No action from completed checks.'
			};
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
		expect(mocks.syncInboxItemForProjectReview).not.toHaveBeenCalled();
		expect(mocks.captureWorkerEvent).not.toHaveBeenCalled();
		expect(mocks.logWorkerError).not.toHaveBeenCalled();
	});
});
