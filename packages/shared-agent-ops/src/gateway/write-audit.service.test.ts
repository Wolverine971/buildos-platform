// packages/shared-agent-ops/src/gateway/write-audit.service.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	AgentCallWritePendingError,
	AgentCallWriteReplayError,
	reserveWriteExecution
} from './write-audit.service';

vi.mock('../ops/security-event-logger', () => ({ logSecurityEvent: vi.fn() }));
vi.mock('./agent-call-project-activity.service', () => ({
	maybeLogAgentCallProjectActivity: vi.fn()
}));

const NOW = '2026-10-18T12:00:00.000Z';
function fixture(
	options: {
		age?: number;
		status?: string;
		beforeCas?: (row: any) => void;
		casError?: boolean;
		retryConflict?: boolean;
	} = {}
) {
	vi.useFakeTimers();
	vi.setSystemTime(new Date(NOW));
	const started = new Date(Date.now() - (options.age ?? 360_000)).toISOString();
	const old: any = {
		id: 'old',
		status: options.status ?? 'pending',
		started_at: started,
		updated_at: started,
		created_at: started,
		response_payload: { ok: true }
	};
	const rows = [old];
	let inserts = 0;
	let updates = 0;
	const admin = {
		from: vi.fn(() => {
			let action = 'select';
			let payload: any;
			const filters: Array<[string, unknown]> = [];
			const run = () => {
				if (action === 'insert') {
					inserts++;
					if (rows.some((row) => row.status !== 'failed') || options.retryConflict)
						return { data: null, error: { code: '23505' } };
					const row = { ...payload, id: 'new' };
					rows.push(row);
					return { data: row, error: null };
				}
				if (action === 'update') {
					updates++;
					options.beforeCas?.(old);
					if (options.casError)
						return { data: null, error: { message: 'CAS unavailable' } };
					const row = rows.find((row) => filters.every(([key, val]) => row[key] === val));
					if (row) Object.assign(row, payload);
					return { data: row ?? null, error: null };
				}
				return { data: rows.at(-1), error: null };
			};
			const query: any = {
				insert: (value: any) => {
					action = 'insert';
					payload = value;
					return query;
				},
				update: (value: any) => {
					action = 'update';
					payload = value;
					return query;
				},
				select: () => query,
				eq: (key: string, value: unknown) => {
					filters.push([key, value]);
					return query;
				},
				order: () => query,
				limit: () => query,
				single: async () => run(),
				maybeSingle: async () => run()
			};
			return query;
		})
	};
	return {
		old,
		rows,
		counts: () => ({ inserts, updates }),
		reserve: () =>
			reserveWriteExecution({
				admin,
				callSessionId: 'session',
				callerId: 'caller',
				userId: 'user',
				op: 'onto.task.create',
				args: {},
				idempotencyKey: 'key'
			})
	};
}

afterEach(() => vi.useRealTimers());

describe('stale write reservations', () => {
	it('reclaims an expired pending reservation and reserves the same key once', async () => {
		const f = fixture();
		await expect(f.reserve()).resolves.toEqual({ executionId: 'new' });
		expect(f.old.status).toBe('failed');
		expect(f.counts()).toEqual({ inserts: 2, updates: 1 });
	});
	it('keeps a fresh reservation pending', async () => {
		const f = fixture({ age: 299_999 });
		await expect(f.reserve()).rejects.toBeInstanceOf(AgentCallWritePendingError);
		expect(f.counts()).toEqual({ inserts: 1, updates: 0 });
	});
	it('does not reclaim a successful write', async () => {
		const f = fixture({ status: 'succeeded' });
		await expect(f.reserve()).rejects.toBeInstanceOf(AgentCallWriteReplayError);
		expect(f.counts().updates).toBe(0);
	});
	it('does not overwrite success that races with stale reclamation', async () => {
		const f = fixture({
			beforeCas: (row) => {
				row.status = 'succeeded';
			}
		});
		await expect(f.reserve()).rejects.toBeInstanceOf(AgentCallWriteReplayError);
		expect(f.old.status).toBe('succeeded');
		expect(f.counts().inserts).toBe(2);
	});
	it('does not reclaim a reservation refreshed since it was read', async () => {
		const f = fixture({
			beforeCas: (row) => {
				row.updated_at = NOW;
			}
		});
		await expect(f.reserve()).rejects.toBeInstanceOf(AgentCallWritePendingError);
		expect(f.old.status).toBe('pending');
	});
	it('stops on a failed CAS instead of allowing a write', async () => {
		const f = fixture({ casError: true });
		await expect(f.reserve()).rejects.toThrow('CAS unavailable');
		expect(f.counts().inserts).toBe(1);
	});
	it('never loops when the retry also conflicts', async () => {
		const f = fixture({ retryConflict: true });
		await expect(f.reserve()).rejects.toBeInstanceOf(AgentCallWritePendingError);
		expect(f.counts()).toEqual({ inserts: 2, updates: 1 });
	});
});
