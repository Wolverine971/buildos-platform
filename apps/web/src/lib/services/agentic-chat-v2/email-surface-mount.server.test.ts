// apps/web/src/lib/services/agentic-chat-v2/email-surface-mount.server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGatewaySurfaceForProfile } from '@buildos/agentic-chat-runtime/catalog';
import {
	EMAIL_CONNECTION_MEMO_TTL_MS,
	applyEmailSurfaceMount,
	hasActiveEmailConnection,
	resetEmailConnectionMemo
} from './email-surface-mount.server';

const USER_ID = 'e1000000-0000-4000-8000-000000000001';

function supabaseReturning(result: { data?: unknown; error?: unknown }) {
	const calls: Array<[string, unknown]> = [];
	const builder: Record<string, unknown> = {
		select: () => builder,
		eq: (column: string, value: unknown) => {
			calls.push([column, value]);
			return builder;
		},
		is: (column: string, value: unknown) => {
			calls.push([column, value]);
			return builder;
		},
		limit: async () => result
	};
	return {
		client: { from: vi.fn(() => builder) },
		calls,
		from: builder
	};
}

beforeEach(() => {
	resetEmailConnectionMemo();
	vi.restoreAllMocks();
});

describe('hasActiveEmailConnection', () => {
	it('accepts only an undeleted, active, read-enabled Gmail row', async () => {
		const supabase = supabaseReturning({ data: [{ id: 'connection-1' }], error: null });

		await expect(
			hasActiveEmailConnection({ supabase: supabase.client as never, userId: USER_ID, nowMs: 0 })
		).resolves.toBe(true);
		expect(supabase.calls).toEqual([
			['user_id', USER_ID],
			['provider', 'google_gmail'],
			['status', 'active'],
			['read_enabled', true],
			['deleted_at', null]
		]);
	});

	it('is false with no rows', async () => {
		const supabase = supabaseReturning({ data: [], error: null });
		await expect(
			hasActiveEmailConnection({ supabase: supabase.client as never, userId: USER_ID, nowMs: 0 })
		).resolves.toBe(false);
	});

	// Fail closed: an unmounted Gmail group is a normal turn, a mounted but
	// unusable one is a trap on a surface the worker cannot change mid-turn.
	it('is false when the lookup fails', async () => {
		const supabase = supabaseReturning({ data: null, error: { message: 'boom' } });
		await expect(
			hasActiveEmailConnection({ supabase: supabase.client as never, userId: USER_ID, nowMs: 0 })
		).resolves.toBe(false);
	});

	it('memoizes per user for a bounded window', async () => {
		const supabase = supabaseReturning({ data: [{ id: 'connection-1' }], error: null });

		await hasActiveEmailConnection({ supabase: supabase.client as never, userId: USER_ID, nowMs: 0 });
		await hasActiveEmailConnection({
			supabase: supabase.client as never,
			userId: USER_ID,
			nowMs: EMAIL_CONNECTION_MEMO_TTL_MS - 1
		});
		expect(supabase.client.from).toHaveBeenCalledTimes(1);

		await hasActiveEmailConnection({
			supabase: supabase.client as never,
			userId: USER_ID,
			nowMs: EMAIL_CONNECTION_MEMO_TTL_MS + 1
		});
		expect(supabase.client.from).toHaveBeenCalledTimes(2);
	});
});

describe('applyEmailSurfaceMount', () => {
	it('appends the whole group once, and nothing without a connection', () => {
		const base = getGatewaySurfaceForProfile('global');
		const names = (tools: typeof base) => tools.map((tool) => tool.function.name);

		expect(applyEmailSurfaceMount(base, false)).toBe(base);
		const mounted = applyEmailSurfaceMount(base, true);
		expect(names(mounted).slice(names(base).length)).toEqual([
			'get_external_account_status',
			'list_email_accounts',
			'search_email_messages',
			'get_email_message',
			'request_email_account_connection'
		]);
		expect(names(applyEmailSurfaceMount(mounted, true))).toEqual(names(mounted));
	});
});
