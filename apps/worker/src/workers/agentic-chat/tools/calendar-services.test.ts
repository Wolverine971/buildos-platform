// apps/worker/src/workers/agentic-chat/tools/calendar-services.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	GOOGLE_CALENDAR_SCOPE,
	GoogleCalendarTargetError,
	GoogleCalendarWriteError
} from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';
import { encryptGoogleCalendarToken } from '@buildos/shared-agent-ops/calendar/google-calendar-token-crypto';
import { createWorkerGoogleCalendarServices } from './calendar-services';

const now = new Date('2026-09-03T19:00:00.000Z');
const key = 'worker-calendar-fixture-key-material-at-least-32-bytes';
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

// A filtering fake, not canned query responses: omitting a user/source predicate
// really does expose the other account's rows and fails the isolation assertions.
function database(tables: Record<string, Row[]>) {
	const writes: Array<{ table: string; values: Row; matchedIds: unknown[] }> = [];
	const failedUpserts = new Set<string>();
	const failedRpcs = new Set<string>();
	const from = vi.fn((table: string) => {
		const filters: Filter[] = [];
		const ordering: string[] = [];
		let action: 'read' | 'update' | 'upsert' = 'read';
		let values: Row = {};
		const run = (single = false) => {
			let rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
			for (const column of [...ordering].reverse()) {
				rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])));
			}
			if (action === 'upsert') {
				if (failedUpserts.has(table))
					return { data: null, error: { message: 'fixture persistence failure' } };
				const row = { id: `saved-${table}`, ...values };
				(tables[table] ??= []).push(row);
				rows = [row];
			}
			if (action !== 'read') {
				writes.push({ table, values, matchedIds: rows.map((row) => row.id) });
				if (action === 'update') rows.forEach((row) => Object.assign(row, values));
			}
			return { data: single ? (rows[0] ?? null) : rows, error: null };
		};
		const chain = {
			select: (_columns?: string) => chain,
			eq: (column: string, value: unknown) => {
				filters.push((row) => row[column] === value);
				return chain;
			},
			is: (column: string, value: unknown) => {
				filters.push((row) => row[column] === value);
				return chain;
			},
			in: (column: string, values: unknown[]) => {
				filters.push((row) => values.includes(row[column]));
				return chain;
			},
			order: (column: string) => {
				ordering.push(column);
				return chain;
			},
			update: (data: Row) => {
				action = 'update';
				values = data;
				return chain;
			},
			upsert: (data: Row) => {
				action = 'upsert';
				values = data;
				return chain;
			},
			insert: (data: Row) => {
				action = 'upsert';
				values = data;
				return chain;
			},
			maybeSingle: () => Promise.resolve(run(true)),
			single: () => Promise.resolve(run(true)),
			then: (
				resolve: (value: ReturnType<typeof run>) => unknown,
				reject: (reason: unknown) => unknown
			) => Promise.resolve(run()).then(resolve, reject)
		};
		return chain;
	});
	const rpc = vi.fn((name: string, params: Row) => {
		if (failedRpcs.has(name))
			return Promise.resolve({ data: null, error: { message: 'fixture RPC failure' } });
		if (name === 'upsert_google_calendar_source') {
			return Promise.resolve({
				data: [
					{ id: 'new-source', summary: params.p_summary, color_id: params.p_color_id }
				],
				error: null
			});
		}
		return Promise.resolve({ data: null, error: null });
	});
	return { admin: { from, rpc }, tables, writes, failedUpserts, failedRpcs };
}

function fixture() {
	const env: Record<string, string | undefined> = {
		PRIVATE_GOOGLE_CALENDAR_CLIENT_ID: 'dedicated-client',
		PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET: 'dedicated-secret',
		PRIVATE_GOOGLE_CLIENT_ID: 'shared-client',
		PRIVATE_GOOGLE_CLIENT_SECRET: 'shared-secret',
		PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1: key
	};
	const accounts = [
		{ suffix: 'a', userId: 'user-1', kind: 'google_calendar' as const },
		{ suffix: 'b', userId: 'user-1', kind: 'google_shared_login' as const },
		{ suffix: 'foreign', userId: 'user-2', kind: 'google_calendar' as const }
	];
	const db = database({
		user_calendar_connections: accounts.map(({ suffix, userId }, index) => ({
			id: `connection-${suffix}`,
			user_id: userId,
			provider_account_id: `google-${suffix}`,
			provider: 'google_calendar',
			account_label: suffix,
			status: 'active',
			connected_at: `2026-08-${10 + index}T00:00:00Z`,
			deleted_at: null
		})),
		user_calendar_sources: accounts.map(({ suffix, userId }, index) => ({
			id: `source-${suffix}`,
			user_id: userId,
			connection_id: `connection-${suffix}`,
			provider_calendar_id: `calendar-${suffix}`,
			summary: suffix,
			access_role: 'owner',
			is_primary: true,
			read_enabled: true,
			availability_enabled: true,
			analysis_enabled: true,
			sync_enabled: true,
			provider_deleted_at: null,
			deleted_at: null,
			created_at: `2026-08-${10 + index}T00:00:00Z`
		})),
		calendar_connection_credentials: accounts.map(({ suffix, userId, kind }) => {
			const context = {
				userId,
				connectionId: `connection-${suffix}`,
				providerAccountId: `google-${suffix}`,
				oauthClientKind: kind
			};
			return {
				connection_id: context.connectionId,
				oauth_client_kind: kind,
				access_token_ciphertext: encryptGoogleCalendarToken(
					`access-${suffix}`,
					context,
					() => key
				),
				refresh_token_ciphertext: encryptGoogleCalendarToken(
					`refresh-${suffix}`,
					context,
					() => key
				),
				access_token_expires_at: '2026-09-03T20:00:00Z',
				refresh_token_expires_at: null,
				token_type: 'Bearer',
				granted_scopes: [GOOGLE_CALENDAR_SCOPE],
				revoked_at: null
			};
		}),
		user_calendar_preferences: [
			{ user_id: 'user-1', default_write_calendar_source_id: 'source-a' }
		],
		onto_event_sync: [],
		task_calendar_events: [],
		time_blocks: [],
		recurring_task_instances: []
	});
	const apis = Object.fromEntries(
		accounts.map(({ suffix }) => [
			suffix,
			{
				events: {
					list: vi.fn().mockResolvedValue({
						data: {
							items: [
								{
									id: `event-${suffix}`,
									summary: suffix,
									start: { dateTime: now.toISOString() }
								}
							]
						}
					}),
					get: vi.fn().mockResolvedValue({ data: { id: `event-${suffix}` } }),
					insert: vi.fn().mockResolvedValue({ data: { id: `created-${suffix}` } }),
					patch: vi.fn().mockResolvedValue({
						data: { id: `event-${suffix}`, summary: 'updated' }
					}),
					delete: vi.fn().mockResolvedValue({ data: {} })
				},
				freebusy: { query: vi.fn().mockResolvedValue({ data: { calendars: {} } }) },
				calendars: {
					insert: vi.fn().mockResolvedValue({
						data: { id: `new-calendar-${suffix}`, summary: 'Project' }
					}),
					patch: vi.fn().mockResolvedValue({ data: {} }),
					delete: vi.fn().mockResolvedValue({ data: {} })
				},
				calendarList: { patch: vi.fn().mockResolvedValue({ data: {} }) },
				acl: { insert: vi.fn().mockResolvedValue({ data: {} }) }
			}
		])
	);
	const createOAuthClient = vi.fn(() => ({
		credentials: {} as Row,
		setCredentials(values: Row) {
			this.credentials = values;
		},
		refreshAccessToken: vi.fn(),
		getTokenInfo: vi.fn()
	}));
	const createCalendarApi = vi.fn((auth: unknown) => {
		const token = String((auth as { credentials: Row }).credentials.access_token);
		return apis[token.replace('access-', '')]!;
	});
	const services = createWorkerGoogleCalendarServices(db.admin as never, {
		env,
		now: () => now,
		createOAuthClient: createOAuthClient as never,
		createCalendarApi: createCalendarApi as never
	});
	return { ...db, env, services, apis, createOAuthClient, createCalendarApi };
}

describe('worker source-aware Calendar provider services', () => {
	it.each([
		['a', 'google_calendar', 'dedicated-client', 'dedicated-secret'],
		['b', 'google_shared_login', 'shared-client', 'shared-secret']
	])(
		'uses the stored OAuth client and exact provider calendar for source %s',
		async (suffix, kind, clientId, clientSecret) => {
			const f = fixture();
			const result = await f.services.write.getEvent({
				userId: 'user-1',
				providerEventId: 'requested-event',
				selector: { calendarSourceId: `source-${suffix}` }
			});
			expect(f.createOAuthClient).toHaveBeenCalledWith(kind, { clientId, clientSecret });
			expect(f.apis[suffix]!.events.get).toHaveBeenCalledWith({
				calendarId: `calendar-${suffix}`,
				eventId: 'requested-event'
			});
			expect(result.calendarSourceId).toBe(`source-${suffix}`);
			expect(f.apis.foreign!.events.get).not.toHaveBeenCalled();
		}
	);

	it('aggregates only enabled owned sources, retaining both source identities', async () => {
		const f = fixture();
		const result = await f.services.read.listEvents({ userId: 'user-1', background: true });
		expect(result.events.map((event) => event.calendarSourceId)).toEqual([
			'source-a',
			'source-b'
		]);
		expect(result.partial).toBe(false);
		expect(f.apis.foreign!.events.list).not.toHaveBeenCalled();
		f.tables.user_calendar_sources![1]!.read_enabled = false;
		const next = await f.services.read.listEvents({ userId: 'user-1' });
		expect(next.events.map((event) => event.calendarSourceId)).toEqual(['source-a']);
	});

	it('preserves partial results when one account cannot be read', async () => {
		const f = fixture();
		f.apis.b!.events.list.mockRejectedValueOnce(new Error('provider unavailable'));
		const result = await f.services.read.listEvents({ userId: 'user-1' });
		expect(result.events.map((event) => event.calendarSourceId)).toEqual(['source-a']);
		expect(result.partial).toBe(true);
		expect(result.warnings).toEqual([
			expect.objectContaining({
				calendarSourceId: 'source-b',
				code: 'CALENDAR_SOURCE_READ_FAILED'
			})
		]);
	});

	it('rejects another user’s source before loading credentials or calling Google', async () => {
		const f = fixture();
		await expect(
			f.services.write.getEvent({
				userId: 'user-1',
				providerEventId: 'event-foreign',
				selector: { calendarSourceId: 'source-foreign' }
			})
		).rejects.toMatchObject({ code: 'CALENDAR_SOURCE_NOT_FOUND' });
		expect(f.createOAuthClient).not.toHaveBeenCalled();
		expect(f.createCalendarApi).not.toHaveBeenCalled();
	});

	it('requires an unambiguous source when the same provider calendar is visible through two accounts', async () => {
		const f = fixture();
		f.tables.user_calendar_sources![1]!.provider_calendar_id = 'calendar-a';
		await expect(
			f.services.write.getEvent({
				userId: 'user-1',
				providerEventId: 'event-a',
				selector: { calendarId: 'calendar-a' }
			})
		).rejects.toBeInstanceOf(GoogleCalendarTargetError);
		expect(f.createCalendarApi).not.toHaveBeenCalled();
	});

	it('never uses the current default or another user’s mapping for an existing event', async () => {
		const f = fixture();
		f.tables.onto_event_sync!.push({
			user_id: 'user-2',
			provider: 'google',
			external_event_id: 'event-a',
			calendar_source_id: 'source-foreign'
		});
		await expect(
			f.services.write.updateEvent({
				userId: 'user-1',
				providerEventId: 'event-a',
				selector: { calendarId: 'primary' },
				requestBody: { summary: 'changed' }
			})
		).rejects.toMatchObject({ code: 'CALENDAR_EVENT_SOURCE_REQUIRED' });
		expect(f.createCalendarApi).not.toHaveBeenCalled();
	});

	it('uses a stored event source after the default changes and updates only matching tracking rows', async () => {
		const f = fixture();
		f.tables.onto_event_sync!.push(
			{
				id: 'own-sync',
				user_id: 'user-1',
				provider: 'google',
				external_event_id: 'event-b',
				calendar_source_id: 'source-b'
			},
			{
				id: 'foreign-sync',
				user_id: 'user-2',
				provider: 'google',
				external_event_id: 'event-b',
				calendar_source_id: 'source-b'
			}
		);
		await f.services.write.updateEvent({
			userId: 'user-1',
			providerEventId: 'event-b',
			requestBody: { summary: 'changed' }
		});
		expect(f.apis.b!.events.patch).toHaveBeenCalledWith(
			expect.objectContaining({ calendarId: 'calendar-b', eventId: 'event-b' })
		);
		expect(f.apis.a!.events.patch).not.toHaveBeenCalled();
		expect(f.writes.find((write) => write.table === 'onto_event_sync')?.matchedIds).toEqual([
			'own-sync'
		]);
	});

	it('preserves an eligible default and promotes only an owned healthy primary when it disappears', async () => {
		const f = fixture();
		expect(await f.services.sources.reconcileDefaultWriteSource('user-1')).toBe('source-a');
		expect(f.admin.rpc).not.toHaveBeenCalled();
		f.tables.user_calendar_connections![0]!.status = 'disabled';
		expect(await f.services.sources.reconcileDefaultWriteSource('user-1')).toBe('source-b');
		expect(f.admin.rpc).toHaveBeenCalledWith('set_default_calendar_source', {
			p_user_id: 'user-1',
			p_calendar_source_id: 'source-b'
		});
	});

	it('compensates a failed ontology mapping on the same source that created the provider event', async () => {
		const f = fixture();
		f.failedUpserts.add('onto_event_sync');
		await expect(
			f.services.write.createEvent({
				userId: 'user-1',
				selector: { calendarSourceId: 'source-b' },
				requestBody: { summary: 'new' },
				ontoEventId: 'onto-event'
			})
		).rejects.toBeInstanceOf(GoogleCalendarWriteError);
		expect(f.apis.b!.events.delete).toHaveBeenCalledWith({
			calendarId: 'calendar-b',
			eventId: 'created-b',
			sendUpdates: 'none'
		});
		expect(f.apis.a!.events.delete).not.toHaveBeenCalled();
	});

	it('records an orphan instead of reporting success when mapping and compensation both fail', async () => {
		const f = fixture();
		f.failedUpserts.add('onto_event_sync');
		f.apis.b!.events.delete.mockRejectedValueOnce(new Error('provider unavailable'));
		await expect(
			f.services.write.createEvent({
				userId: 'user-1',
				selector: { calendarSourceId: 'source-b' },
				requestBody: { summary: 'new' },
				ontoEventId: 'onto-event'
			})
		).rejects.toMatchObject({ code: 'CALENDAR_ORPHAN_RECORDED' });
		expect(f.tables.calendar_event_orphan_receipts).toEqual([
			expect.objectContaining({
				user_id: 'user-1',
				calendar_source_id: 'source-b',
				provider_event_id: 'created-b',
				status: 'pending'
			})
		]);
	});

	it('completes tracking cleanup after a provider event was already deleted', async () => {
		const f = fixture();
		f.apis.b!.events.delete.mockRejectedValueOnce({ code: 404 });
		f.tables.task_calendar_events!.push({
			id: 'tracking',
			user_id: 'user-1',
			calendar_source_id: 'source-b',
			calendar_event_id: 'event-b'
		});
		const result = await f.services.write.deleteEvent({
			userId: 'user-1',
			providerEventId: 'event-b',
			selector: { calendarSourceId: 'source-b' }
		});
		expect(result).toMatchObject({
			deleted: true,
			alreadyMissing: true,
			calendarSourceId: 'source-b'
		});
		expect(f.tables.task_calendar_events![0]!.sync_status).toBe('cancelled');
	});

	it('creates and registers a project calendar against the selected connection', async () => {
		const f = fixture();
		const result = await f.services.projectResources.createCalendar({
			userId: 'user-1',
			connectionId: 'connection-b',
			name: 'Project',
			timeZone: 'America/New_York',
			colorId: '4'
		});
		expect(result).toMatchObject({
			calendarSourceId: 'new-source',
			connectionId: 'connection-b',
			providerCalendarId: 'new-calendar-b',
			colorId: '4'
		});
		expect(f.admin.rpc).toHaveBeenCalledWith(
			'upsert_google_calendar_source',
			expect.objectContaining({
				p_user_id: 'user-1',
				p_connection_id: 'connection-b',
				p_provider_calendar_id: 'new-calendar-b',
				p_access_role: 'owner'
			})
		);
		expect(f.apis.a!.calendars.insert).not.toHaveBeenCalled();
	});

	it('removes a provider calendar if local source registration fails', async () => {
		const f = fixture();
		f.failedRpcs.add('upsert_google_calendar_source');
		await expect(
			f.services.projectResources.createCalendar({
				userId: 'user-1',
				connectionId: 'connection-b',
				name: 'Project',
				timeZone: 'UTC'
			})
		).rejects.toMatchObject({ code: 'database_error' });
		expect(f.apis.b!.calendars.delete).toHaveBeenCalledWith({ calendarId: 'new-calendar-b' });
	});

	it.each(['PRIVATE_GOOGLE_CALENDAR_CLIENT_ID', 'PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET'])(
		'does not substitute shared-login credentials when %s is missing',
		async (missingKey) => {
			const f = fixture();
			delete f.env[missingKey];
			await expect(
				f.services.write.getEvent({
					userId: 'user-1',
					providerEventId: 'event-a',
					selector: { calendarSourceId: 'source-a' }
				})
			).rejects.toMatchObject({ code: 'not_configured' });
			expect(f.createOAuthClient).not.toHaveBeenCalled();
			expect(f.createCalendarApi).not.toHaveBeenCalled();
		}
	);

	it('uses only the configured versioned token key and does not fall back to singleton encryption', async () => {
		const f = fixture();
		delete f.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1;
		f.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY = key;
		await expect(
			f.services.write.getEvent({
				userId: 'user-1',
				providerEventId: 'event-a',
				selector: { calendarSourceId: 'source-a' }
			})
		).rejects.toMatchObject({ code: 'database_error' });
		expect(f.createCalendarApi).not.toHaveBeenCalled();
	});
});
