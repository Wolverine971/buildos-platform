// apps/web/src/lib/services/agentic-chat-v2/turn-admission.test.ts
import { describe, expect, it, vi } from 'vitest';
import { admitFastChatTurn } from './turn-admission';

type Row = Record<string, unknown>;

function createSupabase(
	options: {
		activeTurn?: Row;
		activeTurnLookupError?: unknown;
		staleTurnCancelError?: unknown;
		insertError?: unknown;
	} = {}
) {
	const insertedRows: Row[] = [];
	const updateFilters: Array<[string, unknown]> = [];
	const updates: Row[] = [];

	class QueryBuilder {
		private mode: 'select' | 'update' | 'insert' = 'select';

		select() {
			return this;
		}

		update(patch: Row) {
			this.mode = 'update';
			updates.push(patch);
			return this;
		}

		insert(row: Row) {
			this.mode = 'insert';
			insertedRows.push(row);
			return this;
		}

		eq(column: string, value: unknown) {
			if (this.mode === 'update') updateFilters.push([column, value]);
			return this;
		}

		order() {
			return this;
		}

		limit() {
			return this;
		}

		then<TResult1 = unknown, TResult2 = never>(
			onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
		) {
			const result =
				this.mode === 'select'
					? {
							data: options.activeTurn ? [options.activeTurn] : [],
							error: options.activeTurnLookupError ?? null
						}
					: this.mode === 'update'
						? { data: [], error: options.staleTurnCancelError ?? null }
						: { data: [], error: options.insertError ?? null };
			return Promise.resolve(result).then(onfulfilled, onrejected);
		}
	}

	return {
		supabase: { from: vi.fn(() => new QueryBuilder()) },
		insertedRows,
		updateFilters,
		updates
	};
}

const baseParams = {
	sessionId: 'session-1',
	userId: 'user-1',
	streamRunId: 'stream-1',
	clientTurnId: 'client-1',
	contextType: 'project' as const,
	entityId: 'project-1',
	projectId: 'project-1',
	gatewayEnabled: true,
	requestMessage: 'Ship the release',
	requestStartedAtMs: Date.parse('2026-07-09T12:00:00.000Z'),
	detachedTurnMaxDurationMs: 285_000,
	createTurnRunId: () => 'turn-1'
};

describe('admitFastChatTurn', () => {
	it('inserts a running turn when no active turn exists', async () => {
		const fake = createSupabase();
		const result = await admitFastChatTurn({
			...baseParams,
			supabase: fake.supabase as any,
			now: () => Date.parse('2026-07-09T12:00:01.000Z')
		});

		expect(result).toEqual(
			expect.objectContaining({ status: 'admitted', turnRunId: 'turn-1' })
		);
		expect(fake.insertedRows).toEqual([
			expect.objectContaining({
				id: 'turn-1',
				session_id: 'session-1',
				status: 'running',
				request_message: 'Ship the release',
				started_at: '2026-07-09T12:00:00.000Z'
			})
		]);
	});

	it('blocks admission while a recent turn is running', async () => {
		const fake = createSupabase({
			activeTurn: {
				id: 'active-1',
				stream_run_id: 'active-stream',
				client_turn_id: null,
				started_at: '2026-07-09T11:59:30.000Z',
				request_message: 'Earlier request'
			}
		});

		const result = await admitFastChatTurn({
			...baseParams,
			supabase: fake.supabase as any,
			now: () => Date.parse('2026-07-09T12:00:00.000Z')
		});

		expect(result).toEqual(
			expect.objectContaining({
				status: 'active_turn_running',
				turnAdmissionMs: null
			})
		);
		expect(fake.insertedRows).toHaveLength(0);
		expect(fake.updates).toHaveLength(0);
	});

	it('retires an expired turn only if it is still running', async () => {
		const fake = createSupabase({
			activeTurn: {
				id: 'stale-1',
				stream_run_id: 'stale-stream',
				client_turn_id: null,
				started_at: '2026-07-09T11:50:00.000Z',
				request_message: 'Expired request'
			}
		});

		const result = await admitFastChatTurn({
			...baseParams,
			supabase: fake.supabase as any,
			now: () => Date.parse('2026-07-09T12:00:00.000Z')
		});

		expect(result.status).toBe('admitted');
		expect(fake.updateFilters).toEqual([
			['id', 'stale-1'],
			['user_id', 'user-1'],
			['status', 'running']
		]);
		expect(fake.updates[0]).toEqual(
			expect.objectContaining({ status: 'cancelled', finished_reason: 'stale_running_turn' })
		);
	});

	it('classifies a unique-lock race as an active-turn conflict', async () => {
		const insertError = {
			code: '23505',
			constraint: 'uq_chat_turn_runs_one_running_per_session'
		};
		const fake = createSupabase({ insertError });

		const result = await admitFastChatTurn({
			...baseParams,
			supabase: fake.supabase as any,
			now: () => Date.parse('2026-07-09T12:00:00.000Z')
		});

		expect(result).toEqual(
			expect.objectContaining({
				status: 'insert_failed',
				turnRunId: 'turn-1',
				insertError,
				activeTurnConflict: true
			})
		);
	});

	it('surfaces non-fatal lookup and stale-cancel errors as diagnostics', async () => {
		const activeTurnLookupError = { message: 'lookup failed' };
		const staleTurnCancelError = { message: 'cancel failed' };
		const fake = createSupabase({
			activeTurnLookupError,
			staleTurnCancelError,
			activeTurn: {
				id: 'stale-1',
				stream_run_id: 'stale-stream',
				client_turn_id: null,
				started_at: '2026-07-09T11:50:00.000Z',
				request_message: 'Expired request'
			}
		});

		const result = await admitFastChatTurn({
			...baseParams,
			supabase: fake.supabase as any,
			now: () => Date.parse('2026-07-09T12:00:00.000Z')
		});

		expect(result).toEqual(
			expect.objectContaining({
				status: 'admitted',
				activeTurnLookupError,
				staleTurnCancelError
			})
		);
	});
});
