// apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatContextType, Json } from '@buildos/shared-types';
import {
	TurnObservabilityWriter,
	type TurnObservabilityTimingState
} from './turn-observability-writer';

type Row = Record<string, any>;

type SupabaseMockOptions = {
	initialRows?: Record<string, Row[]>;
	errors?: Record<string, unknown>;
};

function createSupabaseMock(options: SupabaseMockOptions = {}) {
	const rows: Record<string, Row[]> = Object.fromEntries(
		Object.entries(options.initialRows ?? {}).map(([table, tableRows]) => [
			table,
			tableRows.map((row) => ({ ...row }))
		])
	);
	const insertedRows: Record<string, Row[]> = {};
	const insertCalls: Record<string, Array<Row | Row[]>> = {};
	const updatedRows: Record<string, Row[]> = {};
	const errors = options.errors ?? {};

	const ensureRows = (table: string) => {
		rows[table] ??= [];
		insertedRows[table] ??= [];
		insertCalls[table] ??= [];
		updatedRows[table] ??= [];
		return rows[table];
	};

	class QueryBuilder {
		private filters: Array<(row: Row) => boolean> = [];
		private patch: Row | null = null;

		constructor(private readonly table: string) {
			ensureRows(table);
		}

		insert(value: Row | Row[]) {
			const error = errors[`${this.table}.insert`] ?? null;
			if (error) {
				return Promise.resolve({ data: null, error });
			}
			insertCalls[this.table].push(value);
			const values = Array.isArray(value) ? value : [value];
			for (const item of values) {
				const row = { ...item };
				ensureRows(this.table).push(row);
				insertedRows[this.table].push(row);
			}
			return Promise.resolve({ data: values, error: null });
		}

		update(patch: Row) {
			this.patch = patch;
			return this;
		}

		eq(column: string, value: unknown) {
			this.filters.push((row) => row[column] === value);
			return this;
		}

		then<TResult1 = { data: Row[]; error: unknown }, TResult2 = never>(
			onfulfilled?:
				| ((value: { data: Row[]; error: unknown }) => TResult1 | PromiseLike<TResult1>)
				| null,
			onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return this.execute().then(onfulfilled, onrejected);
		}

		private async execute() {
			const error = errors[`${this.table}.update`] ?? null;
			if (error) {
				return { data: [], error };
			}
			const matchingRows = ensureRows(this.table).filter((row) =>
				this.filters.every((filter) => filter(row))
			);
			if (this.patch) {
				for (const row of matchingRows) {
					Object.assign(row, this.patch);
					updatedRows[this.table].push({ ...row });
				}
			}
			return { data: matchingRows, error: null };
		}
	}

	return {
		insertedRows,
		insertCalls,
		updatedRows,
		from: vi.fn((table: string) => new QueryBuilder(table))
	};
}

function buildTimingState(overrides: Partial<TurnObservabilityTimingState> = {}) {
	return {
		sessionId: 'session-1',
		contextType: 'global' as ChatContextType,
		projectId: 'project-1',
		entityId: 'entity-1',
		sessionResolvedAtMs: 1_010,
		historyLoadStartedAtMs: 1_020,
		historyLoadedAtMs: 1_030,
		historyComposeStartedAtMs: 1_030,
		historyComposedAtMs: 1_040,
		toolSelectionMs: 8,
		contextBuildStartedAtMs: 1_050,
		contextReadyAtMs: 1_090,
		firstEventAtMs: 1_100,
		firstResponseAtMs: 1_120,
		assistantPersistStartedAtMs: 1_220,
		assistantPersistedAtMs: 1_260,
		finalizationStartedAtMs: 1_270,
		doneEmittedAtMs: 1_300,
		historyStrategy: 'tail',
		historyCompressed: false,
		rawHistoryCount: 3,
		historyForModelCount: 3,
		contextCacheSource: 'fresh_load',
		contextLoadSource: 'rpc_null_fallback',
		contextCacheAgeSeconds: null,
		bypassedContextCache: false,
		preparedPromptRequested: false,
		preparedPromptHit: false,
		preparedPromptMissReason: 'missing_key',
		preparedPromptId: null,
		preparedPromptAgeSeconds: null,
		preparedSurfaceProfile: 'global_default',
		...overrides
	} satisfies TurnObservabilityTimingState;
}

function createWriter(
	params: {
		supabase?: ReturnType<typeof createSupabaseMock>;
		timingState?: TurnObservabilityTimingState;
		logger?: { warn: ReturnType<typeof vi.fn> };
		logError?: ReturnType<typeof vi.fn>;
		createId?: () => string;
	} = {}
) {
	const supabase = params.supabase ?? createSupabaseMock();
	const logger = params.logger ?? { warn: vi.fn() };
	const logError = params.logError ?? vi.fn();
	const timingState = params.timingState ?? buildTimingState();
	const writer = new TurnObservabilityWriter({
		supabase: supabase as any,
		userId: 'user-1',
		streamRunId: 'stream-run-1',
		clientTurnId: 'client-turn-1',
		requestStartedAtMs: 1_000,
		messageLength: 42,
		requestPrewarmedContext: false,
		logger,
		logError,
		getTimingState: () => timingState,
		createId: params.createId ?? (() => 'metric-1'),
		nowMs: () => 1_400
	});
	writer.setTurnRunId('turn-1');
	return { writer, supabase, logger, logError };
}

describe('TurnObservabilityWriter', () => {
	it('increments event sequence indexes in insertion order', async () => {
		const { writer, supabase } = createWriter();

		writer.recordEvent('prompt', 'prompt_snapshot_created', { prompt_snapshot_id: 'snap-1' });
		writer.recordEvent('tool', 'tool_call_emitted', { tool_name: 'update_onto_task' });
		await writer.flush();

		expect(supabase.insertedRows.chat_turn_events).toMatchObject([
			{
				turn_run_id: 'turn-1',
				session_id: 'session-1',
				user_id: 'user-1',
				stream_run_id: 'stream-run-1',
				sequence_index: 1,
				phase: 'prompt',
				event_type: 'prompt_snapshot_created'
			},
			{
				sequence_index: 2,
				phase: 'tool',
				event_type: 'tool_call_emitted'
			}
		]);
		expect(supabase.insertCalls.chat_turn_events).toHaveLength(1);
		expect(supabase.insertCalls.chat_turn_events[0]).toHaveLength(2);
	});

	it('can flush only turn events without awaiting detached tasks', async () => {
		const { writer, supabase } = createWriter();
		let resolveDetached!: () => void;
		const detachedTask = new Promise<void>((resolve) => {
			resolveDetached = resolve;
		});

		writer.trackDetachedTask(detachedTask, 'slow_detached_write');
		writer.recordEvent('prompt', 'prompt_snapshot_created', { prompt_snapshot_id: 'snap-1' });
		await writer.flushTurnEvents();

		expect(supabase.insertedRows.chat_turn_events).toHaveLength(1);
		expect(supabase.insertedRows.chat_turn_events[0]).toMatchObject({
			sequence_index: 1,
			event_type: 'prompt_snapshot_created'
		});

		resolveDetached();
		await writer.flush();
	});

	it('flushWithBudget awaits detached tasks and reports completion', async () => {
		const { writer, supabase } = createWriter();
		let resolveDetached!: () => void;
		let detachedRan = false;
		const detachedTask = new Promise<void>((resolve) => {
			resolveDetached = () => {
				detachedRan = true;
				resolve();
			};
		});

		writer.trackDetachedTask(detachedTask, 'slow_detached_write');
		writer.recordEvent('prompt', 'prompt_snapshot_created', { prompt_snapshot_id: 'snap-1' });

		// Resolve the detached task on the next tick so flushWithBudget has to await it.
		setTimeout(() => resolveDetached(), 0);
		const result = await writer.flushWithBudget(1_000);

		expect(result.completed).toBe(true);
		expect(detachedRan).toBe(true);
		expect(supabase.insertedRows.chat_turn_events).toHaveLength(1);
	});

	it('flushWithBudget reports incompletion when a detached task hangs past the budget', async () => {
		const { writer, supabase } = createWriter();
		// A detached task that never resolves within the budget.
		writer.trackDetachedTask(new Promise<void>(() => {}), 'hung_detached_write');
		writer.recordEvent('prompt', 'prompt_snapshot_created', { prompt_snapshot_id: 'snap-1' });

		const result = await writer.flushWithBudget(10);

		expect(result.completed).toBe(false);
		// Turn events still flush (flush() flushes them before awaiting the detached set).
		expect(supabase.insertedRows.chat_turn_events).toHaveLength(1);
	});

	it('tracks first help, skill, and canonical op markers', async () => {
		const { writer } = createWriter();

		writer.recordEvent('tool', 'skill_requested', { path: 'calendar.skill' } as Json, {
			skillPath: 'calendar.skill'
		});
		writer.recordEvent(
			'tool',
			'tool_call_emitted',
			{ tool_name: 'update_onto_task' },
			{
				helpPath: 'onto.task.update',
				canonicalOp: 'onto.task.update'
			}
		);
		writer.recordEvent(
			'tool',
			'tool_result_received',
			{ tool_name: 'create_onto_task' },
			{
				helpPath: 'onto.task.create',
				canonicalOp: 'onto.task.create'
			}
		);
		await writer.flush();

		expect(writer.getFirstLanePatch()).toEqual({
			first_lane: 'skill_first',
			first_help_path: 'onto.task.update',
			first_skill_path: 'calendar.skill',
			first_canonical_op: 'onto.task.update'
		});
	});

	it('counts validation failures from turn events', async () => {
		const { writer } = createWriter();

		writer.recordEvent(
			'tool',
			'tool_call_validation_failed',
			{ error: 'missing task_id' },
			{
				validationFailed: true
			}
		);
		writer.recordEvent('tool', 'tool_result_received', { success: true });
		writer.recordEvent(
			'tool',
			'tool_call_validation_failed',
			{ error: 'missing title' },
			{
				validationFailed: true
			}
		);
		await writer.flush();

		expect(writer.getValidationFailureCount()).toBe(2);
	});

	it('persists final turn state through chat_turn_runs', async () => {
		const supabase = createSupabaseMock({
			initialRows: {
				chat_turn_runs: [{ id: 'turn-1', user_id: 'user-1', status: 'running' }]
			}
		});
		const { writer } = createWriter({ supabase });

		await writer.persistFinalState(
			{ status: 'completed', finished_reason: 'stop' },
			'completed'
		);

		expect(supabase.updatedRows.chat_turn_runs).toEqual([
			expect.objectContaining({
				id: 'turn-1',
				user_id: 'user-1',
				status: 'completed',
				finished_reason: 'stop'
			})
		]);
	});

	it('queues the timing metric insert once', async () => {
		const { writer, supabase } = createWriter();

		const firstSummary = writer.queueTimingMetric('stop');
		const secondSummary = writer.queueTimingMetric('error');
		await writer.flush();

		expect(firstSummary?.finished_reason).toBe('stop');
		expect(secondSummary?.finished_reason).toBe('error');
		expect(supabase.insertedRows.timing_metrics).toHaveLength(1);
		expect(supabase.insertedRows.timing_metrics[0]).toEqual(
			expect.objectContaining({
				id: 'metric-1',
				user_id: 'user-1',
				session_id: null,
				turn_run_id: 'turn-1',
				context_type: 'global',
				message_length: 42,
				time_to_first_event_ms: 100,
				time_to_first_response_ms: 120,
				context_build_ms: 40,
				tool_selection_ms: 8
			})
		);
		expect(supabase.insertedRows.timing_metrics[0].metadata).toEqual(
			expect.objectContaining({
				source_session_id: 'session-1',
				source_session_table: 'chat_sessions',
				stream_version: 'v2',
				client_turn_id: 'client-turn-1',
				stream_run_id: 'stream-run-1',
				context_load_source: 'rpc_null_fallback',
				timing_summary: expect.objectContaining({
					finished_reason: 'stop',
					context_load_source: 'rpc_null_fallback'
				})
			})
		);
		expect(writer.getTimingMetricId()).toBe('metric-1');
	});

	it('logs detached task failures through injected logger and reporter', async () => {
		const logger = { warn: vi.fn() };
		const logError = vi.fn();
		const { writer } = createWriter({ logger, logError });
		const error = new Error('detached write failed');

		writer.trackDetachedTask(Promise.reject(error), 'persist_tool_executions', {
			projectId: 'project-2',
			contextType: 'project',
			sessionId: 'session-2',
			entityId: 'entity-2'
		});
		await writer.flush();

		expect(logger.warn).toHaveBeenCalledWith(
			'Detached FastChat task failed: persist_tool_executions',
			{
				error,
				sessionId: 'session-2'
			}
		);
		expect(logError).toHaveBeenCalledWith({
			error,
			operationType: 'fastchat_detached_task',
			projectId: 'project-2',
			metadata: {
				task: 'persist_tool_executions',
				sessionId: 'session-2',
				contextType: 'project',
				entityId: 'entity-2'
			}
		});
	});
});
