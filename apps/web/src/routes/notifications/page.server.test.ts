// apps/web/src/routes/notifications/page.server.test.ts
import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireTestValue } from '$lib/test-helpers/require-test-value';
import type { PageServerLoad } from './$types';
import { load } from './+page.server';

vi.mock('$lib/server/activity-timeline.service', () => ({
	loadActivityTimeline: vi.fn().mockResolvedValue({ entries: [], hasMore: false })
}));

type Row = Record<string, string | null>;

function delivery(index: number, overrides: Row = {}): Row {
	return {
		id: String(index).padStart(6, '0'),
		recipient_user_id: 'user-1',
		channel: index % 2 ? 'in_app' : 'push',
		status: index % 2 ? 'sent' : 'delivered',
		opened_at: null,
		created_at: '2026-09-01T00:00:00.000Z',
		...overrides
	};
}

// Run the real client against local rows so pagination observes the shrinking
// unread set, just as it does when earlier batches have already been updated.
function createDatabase(deliveries: Row[], beforePatch?: () => void) {
	const notifications = deliveries.map((row) => ({
		id: requireTestValue(row.id),
		user_id: requireTestValue(row.recipient_user_id),
		delivery_id: requireTestValue(row.id),
		read_at: null
	}));
	const tables: Record<string, Row[]> = {
		notification_deliveries: deliveries,
		user_notifications: notifications
	};
	const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		const table = url.pathname.split('/').at(-1)!;
		if (init?.method === 'PATCH' && table === 'notification_deliveries') beforePatch?.();
		let rows = tables[table]!.filter((row) =>
			Array.from(url.searchParams).every(([field, filter]) => {
				if (['select', 'order', 'limit', 'offset'].includes(field)) return true;
				const value = row[field];
				if (filter.startsWith('eq.')) return value === filter.slice(3);
				if (filter === 'is.null') return value === null;
				if (filter.startsWith('in.('))
					return filter.slice(4, -1).split(',').includes(value!);
				if (filter.startsWith('gt.')) return value !== null && value! > filter.slice(3);
				if (filter.startsWith('lte.')) return value !== null && value! <= filter.slice(4);
				throw new Error(`Unsupported test filter: ${field}=${filter}`);
			})
		);
		if (url.searchParams.get('order') === 'id.asc') {
			rows.sort((left, right) => left.id!.localeCompare(right.id!));
		}
		const offset = Number(url.searchParams.get('offset') ?? 0);
		const limit = Number(url.searchParams.get('limit') ?? 1000);
		rows = rows.slice(offset, offset + limit);
		if (init?.method === 'PATCH') {
			for (const row of rows) Object.assign(row, JSON.parse(String(init.body)));
			if (!new Headers(init.headers).get('prefer')?.includes('return=representation')) {
				return new Response(null, { status: 204 });
			}
		}
		return Response.json(rows);
	});
	const supabase = createClient('https://supabase.test', 'test-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch }
	});
	const event = {
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
		}
	} as unknown as Parameters<PageServerLoad>[0];
	return { event, notifications, fetch };
}

describe('notifications page read state', () => {
	beforeEach(() => vi.clearAllMocks());

	it('clears more than one API page of deliveries and linked notifications in one visit', async () => {
		const deliveries = Array.from({ length: 1201 }, (_, index) => delivery(index));
		const { event, notifications } = createDatabase(deliveries);

		await load(event);

		expect(deliveries.filter((row) => row.opened_at === null)).toHaveLength(0);
		expect(notifications.filter((row) => row.read_at === null)).toHaveLength(0);
	});

	it('only opens this user’s delivered in-app/push notifications present at the visit', async () => {
		const deliveries = [
			delivery(1),
			delivery(2, { recipient_user_id: 'user-2' }),
			delivery(3, { channel: 'email' }),
			delivery(4, { status: 'pending' }),
			delivery(5, { status: 'failed' }),
			delivery(6, { created_at: '2099-01-01T00:00:00.000Z' })
		];
		const { event, notifications } = createDatabase(deliveries);

		await load(event);

		expect(deliveries[0]?.opened_at).toEqual(expect.any(String));
		expect(notifications[0]?.read_at).toEqual(expect.any(String));
		expect(deliveries.slice(1).every((row) => row.opened_at === null)).toBe(true);
		expect(notifications.slice(1).every((row) => row.read_at === null)).toBe(true);
	});

	it('preserves a delivery clicked between selecting and marking it opened', async () => {
		const row = delivery(1);
		const { event } = createDatabase([row], () => {
			row.status = 'clicked';
			row.opened_at = '2026-09-02T00:00:00.000Z';
		});

		await load(event);

		expect(row.status).toBe('clicked');
		expect(row.opened_at).toBe('2026-09-02T00:00:00.000Z');
	});

	it('redirects unauthenticated visitors before reading or updating notifications', async () => {
		const { event, fetch } = createDatabase([delivery(1)]);
		vi.mocked(event.locals.safeGetSession).mockResolvedValue({ session: null, user: null });

		await expect(load(event)).rejects.toMatchObject({ status: 303, location: '/auth/login' });
		expect(fetch).not.toHaveBeenCalled();
	});
});
