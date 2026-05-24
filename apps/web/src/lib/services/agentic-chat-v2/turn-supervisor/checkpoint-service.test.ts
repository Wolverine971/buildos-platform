// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/checkpoint-service.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	buildCheckpointResumeSystemMessage,
	createTurnCheckpoint,
	loadLatestActiveCheckpoint,
	markCheckpointResumed,
	markCheckpointResuming,
	recoverStaleResumingCheckpoints,
	restoreCheckpointToActive,
	type ChatTurnCheckpoint
} from './checkpoint-service';
import type { TurnDigest, TurnSupervisorDecision } from './types';

type Row = Record<string, any>;

function createCheckpointSupabaseMock(initialRows: Row[] = [], initialTurnRows: Row[] = []) {
	const rows = initialRows.map((row) => ({ ...row }));
	const turnRows = initialTurnRows.map((row) => ({ ...row }));
	const tables: Record<string, Row[]> = {
		chat_turn_checkpoints: rows,
		chat_turn_runs: turnRows
	};
	let nextId = 1;

	class QueryBuilder {
		private filters: Array<(row: Row) => boolean> = [];
		private orderField: string | null = null;
		private orderAscending = true;
		private rowLimit: number | null = null;
		private patch: Row | null = null;
		private insertPayload: Row[] | null = null;
		private executed = false;

		constructor(private readonly tableRows: Row[]) {}

		insert(payload: Row | Row[]) {
			this.insertPayload = Array.isArray(payload) ? payload : [payload];
			return this;
		}

		update(patch: Row) {
			this.patch = patch;
			return this;
		}

		select() {
			return this;
		}

		eq(field: string, value: unknown) {
			this.filters.push((row) => row[field] === value);
			return this;
		}

		lt(field: string, value: string) {
			this.filters.push((row) => typeof row[field] === 'string' && row[field] < value);
			return this;
		}

		or(expression: string) {
			const expiresAtPrefix = 'expires_at.is.null,expires_at.gt.';
			if (expression.startsWith(expiresAtPrefix)) {
				const cutoff = expression.slice(expiresAtPrefix.length);
				this.filters.push((row) => row.expires_at === null || row.expires_at > cutoff);
				return this;
			}
			throw new Error(`Unsupported mock or expression: ${expression}`);
		}

		in(field: string, values: unknown[]) {
			const allowed = new Set(values);
			this.filters.push((row) => allowed.has(row[field]));
			return this;
		}

		order(field: string, options?: { ascending?: boolean }) {
			this.orderField = field;
			this.orderAscending = options?.ascending !== false;
			return this;
		}

		limit(count: number) {
			this.rowLimit = count;
			return this.executeMany();
		}

		maybeSingle() {
			return this.executeMany().then(({ data, error }) => ({
				data: data?.[0] ?? null,
				error
			}));
		}

		then<TResult1 = unknown, TResult2 = never>(
			onfulfilled?:
				| ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>)
				| null,
			onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return this.executeMany().then(onfulfilled, onrejected);
		}

		private async executeMany(): Promise<{ data: Row[]; error: null }> {
			if (this.insertPayload) {
				if (this.executed) return { data: [], error: null };
				this.executed = true;
				const inserted = this.insertPayload.map((row) => ({
					id: row.id ?? `checkpoint-${nextId++}`,
					resume_turn_run_id: null,
					status: 'active',
					question: null,
					resume_started_at: null,
					resumed_at: null,
					expires_at: null,
					created_at: row.created_at ?? new Date().toISOString(),
					updated_at: row.updated_at ?? new Date().toISOString(),
					...JSON.parse(JSON.stringify(row))
				}));
				this.tableRows.push(...inserted);
				return { data: inserted, error: null };
			}

			let matched = this.tableRows.filter((row) =>
				this.filters.every((filter) => filter(row))
			);
			if (this.patch) {
				for (const row of matched) {
					Object.assign(row, JSON.parse(JSON.stringify(this.patch)));
				}
			}
			if (this.orderField) {
				const field = this.orderField;
				const ascending = this.orderAscending;
				matched = [...matched].sort((left, right) => {
					if (left[field] === right[field]) return 0;
					return ascending
						? String(left[field] ?? '').localeCompare(String(right[field] ?? ''))
						: String(right[field] ?? '').localeCompare(String(left[field] ?? ''));
				});
			}
			if (this.rowLimit !== null) {
				matched = matched.slice(0, this.rowLimit);
			}
			return { data: matched.map((row) => ({ ...row })), error: null };
		}
	}

	return {
		from(table: string) {
			expect(['chat_turn_checkpoints', 'chat_turn_runs']).toContain(table);
			return new QueryBuilder(tables[table]);
		},
		rows,
		turnRows
	};
}

const digest: TurnDigest = {
	turnRunId: 'turn-1',
	sessionId: 'session-1',
	userId: 'user-1',
	contextType: 'project',
	entityId: 'project-1',
	projectId: 'project-1',
	userMessage: 'Which task should I update?',
	elapsedMs: 12_000,
	msSinceVisibleText: null,
	assistantTextChars: 0,
	finalCandidateChars: 0,
	llmPassCount: 2,
	toolRoundCount: 1,
	toolCallCount: 2,
	validationFailureCount: 1,
	recentTools: [],
	progress: {
		successfulWrites: 0,
		failedWrites: 0,
		readRounds: 1,
		lowNoveltyReadRounds: 0,
		repeatedToolPatternCount: 0,
		repeatedFailureCount: 1,
		discoveredEntityCount: 0
	},
	risks: ['repeated_failures']
};

const decision: TurnSupervisorDecision = {
	action: 'ask_user',
	question: 'Which task should I update?',
	checkpoint: {
		digest,
		resumeContext: { known_ids: ['task-1', 'task-2'] }
	},
	reason: 'ambiguous_target'
};

describe('turn supervisor checkpoint service', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('creates an active checkpoint row', async () => {
		const supabase = createCheckpointSupabaseMock();

		const checkpoint = await createTurnCheckpoint({
			supabase,
			turnRunId: 'turn-1',
			sessionId: 'session-1',
			userId: 'user-1',
			checkpointType: 'supervisor_question',
			reason: 'ambiguous_target',
			digest,
			resumeContext: { known_ids: ['task-1', 'task-2'] },
			supervisorDecision: decision,
			question: 'Which task should I update?',
			expiresAt: '2026-05-24T00:00:00.000Z'
		});

		expect(checkpoint).toMatchObject({
			id: 'checkpoint-1',
			turn_run_id: 'turn-1',
			session_id: 'session-1',
			user_id: 'user-1',
			checkpoint_type: 'supervisor_question',
			status: 'active',
			reason: 'ambiguous_target',
			question: 'Which task should I update?'
		});
		expect(supabase.rows).toHaveLength(1);
	});

	it('defaults checkpoint expiry to 24 hours', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-23T12:00:00.000Z'));
		const supabase = createCheckpointSupabaseMock();

		const checkpoint = await createTurnCheckpoint({
			supabase,
			turnRunId: 'turn-1',
			sessionId: 'session-1',
			userId: 'user-1',
			checkpointType: 'supervisor_question',
			reason: 'ambiguous_target',
			digest,
			resumeContext: { known_ids: ['task-1', 'task-2'] },
			supervisorDecision: decision,
			question: 'Which task should I update?'
		});

		expect(checkpoint.expires_at).toBe('2026-05-24T12:00:00.000Z');
	});

	it('loads the newest non-expired active checkpoint', async () => {
		const supabase = createCheckpointSupabaseMock([
			checkpointRow({
				id: 'expired',
				created_at: '2026-05-23T10:00:00.000Z',
				expires_at: '2026-05-23T10:05:00.000Z'
			}),
			checkpointRow({
				id: 'older-active',
				created_at: '2026-05-23T09:00:00.000Z',
				expires_at: null
			}),
			checkpointRow({
				id: 'newest-active',
				created_at: '2026-05-23T11:00:00.000Z',
				expires_at: '2026-05-24T00:00:00.000Z'
			})
		]);

		const checkpoint = await loadLatestActiveCheckpoint({
			supabase,
			sessionId: 'session-1',
			userId: 'user-1',
			now: '2026-05-23T12:00:00.000Z'
		});

		expect(checkpoint?.id).toBe('newest-active');
	});

	it('does not miss an older valid checkpoint when newer rows are expired', async () => {
		const supabase = createCheckpointSupabaseMock([
			checkpointRow({
				id: 'newer-expired-1',
				created_at: '2026-05-23T11:00:00.000Z',
				expires_at: '2026-05-23T11:05:00.000Z'
			}),
			checkpointRow({
				id: 'newer-expired-2',
				created_at: '2026-05-23T10:00:00.000Z',
				expires_at: '2026-05-23T10:05:00.000Z'
			}),
			checkpointRow({
				id: 'older-active',
				created_at: '2026-05-23T09:00:00.000Z',
				expires_at: null
			})
		]);

		const checkpoint = await loadLatestActiveCheckpoint({
			supabase,
			sessionId: 'session-1',
			userId: 'user-1',
			now: '2026-05-23T12:00:00.000Z'
		});

		expect(checkpoint?.id).toBe('older-active');
	});

	it('soft consumes on resume start and hard consumes after successful completion', async () => {
		const supabase = createCheckpointSupabaseMock([checkpointRow({ id: 'checkpoint-1' })]);

		const resuming = await markCheckpointResuming({
			supabase,
			checkpointId: 'checkpoint-1',
			userId: 'user-1',
			resumeTurnRunId: 'turn-2',
			resumeStartedAt: '2026-05-23T12:00:00.000Z'
		});

		expect(resuming).toMatchObject({
			id: 'checkpoint-1',
			status: 'resuming',
			resume_turn_run_id: 'turn-2',
			resume_started_at: '2026-05-23T12:00:00.000Z'
		});
		await expect(
			loadLatestActiveCheckpoint({
				supabase,
				sessionId: 'session-1',
				userId: 'user-1',
				now: '2026-05-23T12:01:00.000Z'
			})
		).resolves.toBeNull();

		const resumed = await markCheckpointResumed({
			supabase,
			checkpointId: 'checkpoint-1',
			userId: 'user-1',
			resumedAt: '2026-05-23T12:02:00.000Z'
		});

		expect(resumed).toMatchObject({
			id: 'checkpoint-1',
			status: 'resumed',
			resumed_at: '2026-05-23T12:02:00.000Z'
		});
	});

	it('restores an in-progress resume when the resume turn does not finish', async () => {
		const supabase = createCheckpointSupabaseMock([
			checkpointRow({
				id: 'checkpoint-1',
				status: 'resuming',
				resume_turn_run_id: 'turn-2',
				resume_started_at: '2026-05-23T12:00:00.000Z'
			})
		]);

		const restored = await restoreCheckpointToActive({
			supabase,
			checkpointId: 'checkpoint-1',
			userId: 'user-1'
		});

		expect(restored).toMatchObject({
			id: 'checkpoint-1',
			status: 'active',
			resume_turn_run_id: null,
			resume_started_at: null
		});
	});

	it('recovers stale resumes based on the resume turn final status', async () => {
		const supabase = createCheckpointSupabaseMock(
			[
				checkpointRow({
					id: 'completed-resume',
					status: 'resuming',
					resume_turn_run_id: 'turn-completed',
					resume_started_at: '2026-05-23T10:00:00.000Z'
				}),
				checkpointRow({
					id: 'failed-resume',
					status: 'resuming',
					resume_turn_run_id: 'turn-failed',
					resume_started_at: '2026-05-23T10:00:00.000Z'
				}),
				checkpointRow({
					id: 'orphaned-resume',
					status: 'resuming',
					resume_turn_run_id: null,
					resume_started_at: '2026-05-23T10:00:00.000Z'
				})
			],
			[
				{ id: 'turn-completed', user_id: 'user-1', status: 'completed' },
				{ id: 'turn-failed', user_id: 'user-1', status: 'failed' }
			]
		);

		const recovered = await recoverStaleResumingCheckpoints({
			supabase,
			userId: 'user-1',
			staleBefore: '2026-05-23T11:00:00.000Z',
			recoveredAt: '2026-05-23T12:00:00.000Z'
		});

		expect(recovered.markedResumed.map((row) => row.id)).toEqual(['completed-resume']);
		expect(recovered.restoredActive.map((row) => row.id)).toEqual([
			'failed-resume',
			'orphaned-resume'
		]);
		expect(supabase.rows.find((row) => row.id === 'completed-resume')).toMatchObject({
			status: 'resumed',
			resume_turn_run_id: 'turn-completed',
			resumed_at: '2026-05-23T12:00:00.000Z'
		});
		expect(supabase.rows.find((row) => row.id === 'failed-resume')).toMatchObject({
			status: 'active',
			resume_turn_run_id: null,
			resume_started_at: null
		});
		expect(supabase.rows.find((row) => row.id === 'orphaned-resume')).toMatchObject({
			status: 'active',
			resume_turn_run_id: null,
			resume_started_at: null
		});
	});

	it('formats a compact resume system message', () => {
		const checkpoint = checkpointRow({
			question: 'Which task should I update?',
			resume_context: { known_ids: ['task-1'], completed_reads: ['search_project'] }
		}) as ChatTurnCheckpoint;

		const message = buildCheckpointResumeSystemMessage(checkpoint);

		expect(message).toContain('Continue from the previous supervisor checkpoint.');
		expect(message).toContain('Which task should I update?');
		expect(message).toContain('"known_ids":["task-1"]');
		expect(message).toContain('Do not re-run completed reads or writes');
	});
});

function checkpointRow(overrides: Partial<ChatTurnCheckpoint> = {}): ChatTurnCheckpoint {
	return {
		id: 'checkpoint-1',
		turn_run_id: 'turn-1',
		session_id: 'session-1',
		user_id: 'user-1',
		resume_turn_run_id: null,
		checkpoint_type: 'supervisor_question',
		status: 'active',
		reason: 'ambiguous_target',
		digest: digest as any,
		resume_context: { known_ids: ['task-1', 'task-2'] } as any,
		supervisor_decision: decision as any,
		question: 'Which task should I update?',
		resume_started_at: null,
		resumed_at: null,
		expires_at: null,
		created_at: '2026-05-23T10:00:00.000Z',
		updated_at: '2026-05-23T10:00:00.000Z',
		...overrides
	};
}
