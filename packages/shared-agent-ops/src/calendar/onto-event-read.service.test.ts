// packages/shared-agent-ops/src/calendar/onto-event-read.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { OntoEventReadService } from './onto-event-read.service';

function createQueryMock(result: { data?: unknown; error?: unknown } = {}) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		order: vi.fn(() => query),
		is: vi.fn(() => query),
		gte: vi.fn(() => query),
		lte: vi.fn(() => query),
		limit: vi.fn(() => query),
		maybeSingle: vi.fn(async () => ({
			data: result.data ?? null,
			error: result.error ?? null
		})),
		data: result.data ?? [],
		error: result.error ?? null
	};
	return { supabase: { from: vi.fn(() => query) } as any, query };
}

const SYNC_ROWS = [
	{ id: 'sync-a', user_id: 'user-1', external_event_id: 'g-a' },
	{ id: 'sync-b', user_id: 'user-2', external_event_id: 'g-b' }
];

describe('OntoEventReadService.listProjectEvents', () => {
	it('preserves ascending order by default', async () => {
		const { supabase, query } = createQueryMock();
		await new OntoEventReadService(supabase).listProjectEvents('project-1', {
			includeDeleted: false
		});

		expect(query.order).toHaveBeenCalledWith('start_at', { ascending: true });
		expect(query.is).toHaveBeenCalledWith('deleted_at', null);
	});

	it('supports a bounded newest-first event window', async () => {
		const { supabase, query } = createQueryMock();
		await new OntoEventReadService(supabase).listProjectEvents('project-1', {
			timeMin: '2026-06-01T00:00:00.000Z',
			timeMax: '2026-07-01T00:00:00.000Z',
			includeDeleted: false,
			limit: 26,
			orderDirection: 'descending'
		});

		expect(query.order).toHaveBeenCalledWith('start_at', { ascending: false });
		expect(query.gte).toHaveBeenCalledWith('start_at', '2026-06-01T00:00:00.000Z');
		expect(query.lte).toHaveBeenCalledWith('start_at', '2026-07-01T00:00:00.000Z');
		expect(query.limit).toHaveBeenCalledWith(26);
	});

	it('scopes sync rows to the requesting user and keeps every row when unscoped', async () => {
		const rows = [{ id: 'event-1', onto_event_sync: SYNC_ROWS }];

		const scoped = await new OntoEventReadService(
			createQueryMock({ data: rows }).supabase
		).listProjectEvents('project-1', {}, 'user-1');
		expect(scoped[0]!.onto_event_sync).toEqual([SYNC_ROWS[0]]);

		const unscoped = await new OntoEventReadService(
			createQueryMock({ data: rows }).supabase
		).listProjectEvents('project-1', {});
		expect(unscoped[0]!.onto_event_sync).toEqual(SYNC_ROWS);

		// A scoped read with no identity must return nothing, not every member's rows.
		const anonymous = await new OntoEventReadService(
			createQueryMock({ data: rows }).supabase
		).listProjectEvents('project-1', {}, null);
		expect(anonymous[0]!.onto_event_sync).toEqual([]);
	});

	it('throws the postgrest message on failure', async () => {
		const { supabase } = createQueryMock({ error: { message: 'boom' } });
		await expect(
			new OntoEventReadService(supabase).listProjectEvents('project-1', {})
		).rejects.toThrow('boom');
	});
});

describe('OntoEventReadService.getEvent', () => {
	it('returns null when the event does not exist', async () => {
		const { supabase } = createQueryMock({ data: null });
		await expect(new OntoEventReadService(supabase).getEvent('event-1')).resolves.toBeNull();
	});

	it('scopes sync rows to the requesting user', async () => {
		const { supabase } = createQueryMock({
			data: { id: 'event-1', onto_event_sync: SYNC_ROWS }
		});
		const event = await new OntoEventReadService(supabase).getEvent('event-1', 'user-2');
		expect(event?.onto_event_sync).toEqual([SYNC_ROWS[1]]);
	});

	it('throws the postgrest message on failure', async () => {
		const { supabase } = createQueryMock({ error: { message: 'nope' } });
		await expect(new OntoEventReadService(supabase).getEvent('event-1')).rejects.toThrow(
			'nope'
		);
	});
});
