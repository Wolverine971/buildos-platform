// apps/web/src/lib/services/agentic-chat-v2/access-checks.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	checkDailyBriefAccess,
	checkProjectAccess,
	checkProjectAccessFallback
} from './access-checks';

type RpcResult = { data: unknown; error: unknown };

/**
 * Minimal supabase double: `rpc(name, args)` resolves from a per-name queue,
 * and `.from().select().eq().eq().maybeSingle()` resolves a configured result.
 */
function createSupabase(opts: {
	rpc?: Record<string, RpcResult | (() => RpcResult)>;
	brief?: RpcResult;
} = {}) {
	const rpc = vi.fn(async (name: string) => {
		const entry = opts.rpc?.[name];
		if (typeof entry === 'function') return entry();
		return entry ?? { data: null, error: null };
	});

	const maybeSingle = vi.fn(async () => opts.brief ?? { data: null, error: null });
	const builder: any = {
		select: vi.fn(() => builder),
		eq: vi.fn(() => builder),
		maybeSingle
	};
	const from = vi.fn(() => builder);

	return { rpc, from, maybeSingle };
}

function createErrorLogger() {
	return { logError: vi.fn() } as any;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('checkProjectAccessFallback', () => {
	it('always denies (fail-closed) and logs to the errorLogger', async () => {
		const errorLogger = createErrorLogger();
		const result = await checkProjectAccessFallback({} as any, 'p1', errorLogger, {
			userId: 'u1'
		});
		expect(result).toEqual({ allowed: false, reason: 'rpc_unavailable_fail_closed' });
		expect(errorLogger.logError).toHaveBeenCalledTimes(1);
	});

	it('does not require an errorLogger', async () => {
		const result = await checkProjectAccessFallback({} as any, 'p1');
		expect(result.allowed).toBe(false);
	});
});

describe('checkProjectAccess', () => {
	it('allows when the access RPC returns true', async () => {
		const supabase = createSupabase({
			rpc: {
				ensure_actor_for_user: { data: 'actor-1', error: null },
				current_actor_has_project_member_access: { data: true, error: null }
			}
		});
		const result = await checkProjectAccess(supabase as any, 'p1', undefined, { userId: 'u1' });
		expect(result).toEqual({ allowed: true, reason: 'ok' });
	});

	it('denies when the access RPC returns false', async () => {
		const supabase = createSupabase({
			rpc: {
				ensure_actor_for_user: { data: 'actor-1', error: null },
				current_actor_has_project_member_access: { data: false, error: null }
			}
		});
		const result = await checkProjectAccess(supabase as any, 'p1', undefined, { userId: 'u1' });
		expect(result).toEqual({ allowed: false, reason: 'denied' });
	});

	it('returns actor_resolution_failed when ensure_actor_for_user fails', async () => {
		const supabase = createSupabase({
			rpc: { ensure_actor_for_user: { data: null, error: { message: 'nope' } } }
		});
		const result = await checkProjectAccess(supabase as any, 'p1', undefined, { userId: 'u1' });
		expect(result).toEqual({ allowed: false, reason: 'actor_resolution_failed' });
	});

	it('fails closed via fallback when the access RPC errors', async () => {
		const errorLogger = createErrorLogger();
		const supabase = createSupabase({
			rpc: {
				ensure_actor_for_user: { data: 'actor-1', error: null },
				current_actor_has_project_member_access: { data: null, error: { message: 'rpc down' } }
			}
		});
		const result = await checkProjectAccess(supabase as any, 'p1', errorLogger, { userId: 'u1' });
		expect(result).toEqual({ allowed: false, reason: 'rpc_unavailable_fail_closed' });
		// logged once for the rpc error + once inside the fallback
		expect(errorLogger.logError).toHaveBeenCalledTimes(2);
	});

	it('fails closed via fallback when the rpc call throws', async () => {
		const supabase = {
			rpc: vi.fn(async (name: string) => {
				if (name === 'ensure_actor_for_user') return { data: 'actor-1', error: null };
				throw new Error('boom');
			})
		};
		const result = await checkProjectAccess(supabase as any, 'p1', undefined, { userId: 'u1' });
		expect(result).toEqual({ allowed: false, reason: 'rpc_unavailable_fail_closed' });
	});

	it('skips actor resolution when no userId is provided', async () => {
		const supabase = createSupabase({
			rpc: { current_actor_has_project_member_access: { data: true, error: null } }
		});
		const result = await checkProjectAccess(supabase as any, 'p1');
		expect(result.allowed).toBe(true);
		expect(supabase.rpc).not.toHaveBeenCalledWith('ensure_actor_for_user', expect.anything());
	});
});

describe('checkDailyBriefAccess', () => {
	it('allows when a brief row is found for the user', async () => {
		const supabase = createSupabase({ brief: { data: { id: 'b1' }, error: null } });
		const result = await checkDailyBriefAccess(supabase as any, 'b1', 'u1');
		expect(result).toEqual({ allowed: true, reason: 'ok' });
	});

	it('denies (not_found) when no row matches', async () => {
		const supabase = createSupabase({ brief: { data: null, error: null } });
		const result = await checkDailyBriefAccess(supabase as any, 'b1', 'u1');
		expect(result).toEqual({ allowed: false, reason: 'not_found' });
	});

	it('returns query_failed and logs when the query errors', async () => {
		const errorLogger = createErrorLogger();
		const supabase = createSupabase({ brief: { data: null, error: { message: 'db error' } } });
		const result = await checkDailyBriefAccess(supabase as any, 'b1', 'u1', errorLogger);
		expect(result).toEqual({ allowed: false, reason: 'query_failed' });
		expect(errorLogger.logError).toHaveBeenCalledTimes(1);
	});

	it('returns exception when the query throws', async () => {
		const supabase = {
			from: vi.fn(() => {
				throw new Error('boom');
			})
		};
		const result = await checkDailyBriefAccess(supabase as any, 'b1', 'u1');
		expect(result).toEqual({ allowed: false, reason: 'exception' });
	});
});
