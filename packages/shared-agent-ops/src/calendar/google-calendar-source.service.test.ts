// packages/shared-agent-ops/src/calendar/google-calendar-source.service.test.ts
//
// Every Google Calendar read reconciles the default write source. For a user
// with no writable calendar that used to rewrite `null` through
// `set_default_calendar_source` on every read. The reconcile now writes only
// when the default actually changes, and reads the stored choice alongside the
// eligibility reads instead of after them.
import { describe, expect, it, vi } from 'vitest';
import { GoogleCalendarConnectionError } from './google-calendar-credential.service';
import { GoogleCalendarSourceService } from './google-calendar-source.service';

type QueryResult = { data: unknown; error: unknown };
type Table = 'user_calendar_connections' | 'user_calendar_sources' | 'user_calendar_preferences';

const CONNECTION = { id: 'connection-1', connected_at: '2026-08-10T10:00:00.000Z' };

function source(overrides: Record<string, unknown> = {}) {
	return {
		id: 'source-a',
		user_id: 'user-1',
		connection_id: 'connection-1',
		access_role: 'owner',
		is_primary: true,
		created_at: '2026-08-10T10:01:00.000Z',
		...overrides
	};
}

function stored(sourceId: string | null): QueryResult {
	return { data: { default_write_calendar_source_id: sourceId }, error: null };
}

function createAdmin(
	results: Partial<Record<Table, QueryResult | Promise<QueryResult>>>,
	rpcResult: QueryResult = { data: null, error: null }
) {
	const reads: Table[] = [];
	const from = vi.fn((table: Table) => {
		reads.push(table);
		const result =
			results[table] ??
			({
				data: table === 'user_calendar_preferences' ? null : [],
				error: null
			} as QueryResult);
		const query: Record<string, any> = {};
		for (const method of ['select', 'eq', 'in', 'is', 'order']) {
			query[method] = vi.fn(() => query);
		}
		query.maybeSingle = vi.fn(() => Promise.resolve(result));
		query.then = (
			resolve: (value: QueryResult) => unknown,
			reject?: (error: unknown) => unknown
		) => Promise.resolve(result).then(resolve, reject);
		return query;
	});
	const rpc = vi.fn(async () => rpcResult);
	return { service: new GoogleCalendarSourceService({ from, rpc } as never), rpc, reads };
}

describe('GoogleCalendarSourceService.reconcileDefaultWriteSource', () => {
	it('does not rewrite a null default for a user with no writable calendar', async () => {
		const { service, rpc } = createAdmin({
			user_calendar_connections: { data: [CONNECTION], error: null },
			user_calendar_sources: { data: [], error: null },
			user_calendar_preferences: stored(null)
		});

		await expect(service.reconcileDefaultWriteSource('user-1')).resolves.toBeNull();
		expect(rpc).not.toHaveBeenCalled();
	});

	it('does not create a preferences row just to hold null', async () => {
		const { service, rpc } = createAdmin({
			user_calendar_connections: { data: [], error: null },
			user_calendar_preferences: { data: null, error: null }
		});

		await expect(service.reconcileDefaultWriteSource('user-1')).resolves.toBeNull();
		expect(rpc).not.toHaveBeenCalled();
	});

	it('keeps an eligible stored default without writing', async () => {
		const { service, rpc } = createAdmin({
			user_calendar_connections: { data: [CONNECTION], error: null },
			user_calendar_sources: {
				data: [source(), source({ id: 'source-b', is_primary: false })],
				error: null
			},
			user_calendar_preferences: stored('source-b')
		});

		await expect(service.reconcileDefaultWriteSource('user-1')).resolves.toBe('source-b');
		expect(rpc).not.toHaveBeenCalled();
	});

	it('clears a stored default that lost write access', async () => {
		const { service, rpc } = createAdmin({
			user_calendar_connections: { data: [CONNECTION], error: null },
			user_calendar_sources: { data: [], error: null },
			user_calendar_preferences: stored('source-gone')
		});

		await expect(service.reconcileDefaultWriteSource('user-1')).resolves.toBeNull();
		expect(rpc).toHaveBeenCalledTimes(1);
		expect(rpc).toHaveBeenCalledWith('set_default_calendar_source', {
			p_user_id: 'user-1',
			p_calendar_source_id: null
		});
	});

	it('promotes a writable primary when nothing is stored yet', async () => {
		const { service, rpc } = createAdmin({
			user_calendar_connections: { data: [CONNECTION], error: null },
			user_calendar_sources: { data: [source()], error: null },
			user_calendar_preferences: { data: null, error: null }
		});

		await expect(service.reconcileDefaultWriteSource('user-1')).resolves.toBe('source-a');
		expect(rpc).toHaveBeenCalledWith('set_default_calendar_source', {
			p_user_id: 'user-1',
			p_calendar_source_id: 'source-a'
		});
	});

	it('reads the stored default before the connection read returns', async () => {
		let resolveConnections!: (value: QueryResult) => void;
		const connections = new Promise<QueryResult>((resolve) => {
			resolveConnections = resolve;
		});
		const { service, rpc, reads } = createAdmin({
			user_calendar_connections: connections,
			user_calendar_sources: { data: [source()], error: null },
			user_calendar_preferences: stored('source-a')
		});

		const pending = service.reconcileDefaultWriteSource('user-1');
		await vi.waitFor(() => expect(reads).toContain('user_calendar_preferences'));
		expect(reads).not.toContain('user_calendar_sources');

		resolveConnections({ data: [CONNECTION], error: null });
		await expect(pending).resolves.toBe('source-a');
		expect(rpc).not.toHaveBeenCalled();
	});

	it.each<Table>([
		'user_calendar_connections',
		'user_calendar_sources',
		'user_calendar_preferences'
	])('raises the same database error when the %s read fails', async (table) => {
		const { service, rpc } = createAdmin({
			user_calendar_connections: { data: [CONNECTION], error: null },
			user_calendar_sources: { data: [source()], error: null },
			user_calendar_preferences: stored(null),
			[table]: { data: null, error: { message: 'db down' } }
		});

		const failure = service.reconcileDefaultWriteSource('user-1');
		await expect(failure).rejects.toBeInstanceOf(GoogleCalendarConnectionError);
		await expect(failure).rejects.toMatchObject({
			code: 'database_error',
			message: 'Unable to reconcile the default Google Calendar source'
		});
		expect(rpc).not.toHaveBeenCalled();
	});

	it('raises a database error when the default write itself fails', async () => {
		const { service } = createAdmin(
			{
				user_calendar_connections: { data: [CONNECTION], error: null },
				user_calendar_sources: { data: [source()], error: null },
				user_calendar_preferences: stored(null)
			},
			{ data: null, error: { message: 'trigger rejected' } }
		);

		await expect(service.reconcileDefaultWriteSource('user-1')).rejects.toMatchObject({
			code: 'database_error'
		});
	});
});
