// packages/shared-agent-ops/src/calendar/agent-run-calendar-port.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	LegacyCalendarReadError,
	createAgentRunCalendarPort,
	createLegacyGoogleCalendarClient,
	createLegacyGoogleCalendarReader
} from './agent-run-calendar-port';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

type OntoQueryCapture = { gte?: string; lte?: string; limit?: number };

function ontoEvent(index: number): Record<string, unknown> {
	return {
		id: `33333333-3333-4333-8333-33333333333${index}`,
		title: `Event ${index}`,
		description: null,
		location: null,
		start_at: `2026-09-23T1${index}:00:00.000Z`,
		end_at: `2026-09-23T1${index}:30:00.000Z`,
		owner_entity_type: 'project',
		owner_entity_id: PROJECT_ID,
		props: {},
		sync_status: null,
		sync_error: null,
		onto_event_sync: []
	};
}

/** Project-scoped list with no project calendar mapping: ontology events only, no Google call. */
function fakeAdmin(ontoRows: Array<Record<string, unknown>>, capture: OntoQueryCapture) {
	const from = vi.fn((table: string) => {
		const builder: any = {
			select: () => builder,
			eq: () => builder,
			is: () => builder,
			order: () => builder,
			gte: (_column: string, value: string) => {
				capture.gte = value;
				return builder;
			},
			lte: (_column: string, value: string) => {
				capture.lte = value;
				return builder;
			},
			limit: (value: number) => {
				capture.limit = value;
				return builder;
			},
			maybeSingle: async () =>
				table === 'users'
					? { data: { timezone: 'America/New_York' }, error: null }
					: { data: null, error: null },
			then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
				Promise.resolve(
					table === 'onto_events'
						? { data: ontoRows.slice(0, capture.limit ?? ontoRows.length), error: null }
						: { data: [], error: null }
				).then(resolve, reject)
		};
		return builder;
	});
	const rpc = vi.fn(async () => ({ data: 'actor-1', error: null }));
	return { from, rpc };
}

describe('AgentRunCalendarPort.listCalendarEvents', () => {
	it('accepts a same-day bare-date range as that whole civil day', async () => {
		const capture: OntoQueryCapture = {};
		const port = createAgentRunCalendarPort({
			admin: fakeAdmin([ontoEvent(1)], capture),
			userId: USER_ID
		}) as any;

		const result = await port.listCalendarEvents({
			project_id: PROJECT_ID,
			calendar_scope: 'project',
			time_min: '2026-09-23',
			time_max: '2026-09-23'
		});

		expect(capture.gte).toBe('2026-09-23T04:00:00.000Z');
		expect(capture.lte).toBe('2026-09-24T03:59:59.000Z');
		expect(result.queried_range).toMatchObject({
			time_min: '2026-09-23T04:00:00.000Z',
			time_max: '2026-09-24T03:59:59.000Z',
			timezone: 'America/New_York'
		});
	});

	it('reports has_more when a source returned exactly the fetch limit', async () => {
		const capture: OntoQueryCapture = {};
		const port = createAgentRunCalendarPort({
			admin: fakeAdmin([ontoEvent(1), ontoEvent(2), ontoEvent(3)], capture),
			userId: USER_ID
		}) as any;

		const result = await port.listCalendarEvents({
			project_id: PROJECT_ID,
			calendar_scope: 'project',
			time_min: '2026-09-23T00:00:00Z',
			time_max: '2026-09-24T00:00:00Z',
			limit: 2
		});

		expect(capture.limit).toBe(2);
		expect(result.events).toHaveLength(2);
		expect(result.pagination).toMatchObject({ has_more: true, next_offset: 2 });
	});

	it('reports no more rows when the source returned fewer than the fetch limit', async () => {
		const capture: OntoQueryCapture = {};
		const port = createAgentRunCalendarPort({
			admin: fakeAdmin([ontoEvent(1)], capture),
			userId: USER_ID
		}) as any;

		const result = await port.listCalendarEvents({
			project_id: PROJECT_ID,
			calendar_scope: 'project',
			time_min: '2026-09-23T00:00:00Z',
			time_max: '2026-09-24T00:00:00Z',
			limit: 2
		});

		expect(result.pagination).toMatchObject({ has_more: false, next_offset: null });
	});
});

describe('legacy Google Calendar reader', () => {
	/** `user_calendar_tokens` returns `row`; every other table is empty. */
	function tokenAdmin(row: Record<string, unknown> | null, error: unknown = null) {
		return {
			from: vi.fn(() => {
				const builder: any = {
					select: () => builder,
					eq: () => builder,
					maybeSingle: async () => ({ data: row, error })
				};
				return builder;
			})
		};
	}
	const credentials = { clientId: 'client-id', clientSecret: 'client-secret' };
	const read = (admin: unknown, creds = credentials) =>
		createLegacyGoogleCalendarReader({ admin, userId: USER_ID, credentials: creds })
			.listEvents({ calendarId: 'primary' })
			.catch((error: unknown) => error);

	it('retains the page token as truncation even when Google returns a short page', async () => {
		const list = vi
			.fn()
			.mockResolvedValue({ data: { items: [{ id: 'g-1' }], nextPageToken: 'more' } });
		const prototype = Object.getPrototypeOf(
			createAgentRunCalendarPort({ admin: {}, userId: USER_ID, credentials })
		);
		const authorize = vi
			.spyOn(prototype, 'authorizeLegacyRead')
			.mockResolvedValue({ events: { list } });
		try {
			const result = await read({});
			expect(list).toHaveBeenCalledOnce();
			expect(result).toMatchObject({ events: [{ id: 'g-1' }], truncated: true });
		} finally {
			authorize.mockRestore();
		}
	});

	it('reports not_connected when the user has no singleton grant', async () => {
		const error = await read(tokenAdmin(null));
		expect(error).toBeInstanceOf(LegacyCalendarReadError);
		expect((error as LegacyCalendarReadError).code).toBe('not_connected');
	});

	it('reports not_connected for a grant row that holds no tokens', async () => {
		const error = await read(tokenAdmin({ access_token: null, refresh_token: null }));
		expect((error as LegacyCalendarReadError).code).toBe('not_connected');
	});

	it('reports credentials_unreadable when a stored token cannot be decrypted', async () => {
		const error = await read(
			tokenAdmin({
				access_token: 'enc:v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
				refresh_token: 'r'
			})
		);
		expect((error as LegacyCalendarReadError).code).toBe('credentials_unreadable');
	});

	it('reports credentials_not_configured before touching the grant', async () => {
		const admin = tokenAdmin({ access_token: 'a', refresh_token: 'r' });
		const previous = {
			id: process.env.PRIVATE_GOOGLE_CLIENT_ID,
			legacyId: process.env.GOOGLE_CLIENT_ID
		};
		delete process.env.PRIVATE_GOOGLE_CLIENT_ID;
		delete process.env.GOOGLE_CLIENT_ID;
		try {
			const error = await read(admin, { clientId: '', clientSecret: '' });
			expect((error as LegacyCalendarReadError).code).toBe('credentials_not_configured');
			expect(admin.from).not.toHaveBeenCalled();
		} finally {
			if (previous.id !== undefined) process.env.PRIVATE_GOOGLE_CLIENT_ID = previous.id;
			if (previous.legacyId !== undefined) process.env.GOOGLE_CLIENT_ID = previous.legacyId;
		}
	});
});

describe('legacy Google Calendar client (writes)', () => {
	/** A Calendar API double: each method is a spy the test can override. */
	function fakeCalendar(overrides: Record<string, Record<string, unknown>> = {}) {
		const api = {
			events: {
				insert: vi.fn(async () => ({ data: { id: 'g-1', htmlLink: 'https://cal/g-1' } })),
				get: vi.fn(async () => ({
					data: { id: 'g-1', summary: 'Old', start: { dateTime: 'x' } }
				})),
				update: vi.fn(async () => ({ data: { id: 'g-1', htmlLink: 'https://cal/g-1' } })),
				delete: vi.fn(async () => ({})),
				...overrides.events
			},
			calendars: {
				insert: vi.fn(async () => ({ data: { id: 'proj-cal@group' } })),
				patch: vi.fn(async () => ({})),
				delete: vi.fn(async () => ({})),
				...overrides.calendars
			},
			calendarList: {
				list: vi.fn(async () => ({
					data: { items: [{ id: 'primary@x', summary: 'Me', accessRole: 'owner' }] }
				})),
				patch: vi.fn(async () => ({})),
				...overrides.calendarList
			}
		};
		return api;
	}
	const client = (api: ReturnType<typeof fakeCalendar>) =>
		createLegacyGoogleCalendarClient(
			{ admin: {}, userId: USER_ID },
			{ calendar: async () => api as never }
		);

	it('creates on primary with the wall-clock time and zone the web client sends', async () => {
		const api = fakeCalendar();
		await expect(
			client(api).createStandaloneEvent(USER_ID, {
				summary: 'Dentist',
				start: new Date('2026-09-10T15:00:00Z'),
				end: new Date('2026-09-10T16:00:00Z'),
				timeZone: 'America/New_York'
			})
		).resolves.toEqual({ eventId: 'g-1', eventLink: 'https://cal/g-1' });
		expect(api.events.insert).toHaveBeenCalledWith({
			calendarId: 'primary',
			requestBody: {
				summary: 'Dentist',
				description: undefined,
				start: { dateTime: '2026-09-10T11:00:00', timeZone: 'America/New_York' },
				end: { dateTime: '2026-09-10T12:00:00', timeZone: 'America/New_York' },
				colorId: undefined
			}
		});
	});

	it('updates by merging onto the stored Google event', async () => {
		const api = fakeCalendar();
		await client(api).updateCalendarEvent(USER_ID, {
			event_id: 'g-1',
			calendar_id: 'proj-cal@group',
			summary: 'New'
		});
		expect(api.events.update).toHaveBeenCalledWith({
			calendarId: 'proj-cal@group',
			eventId: 'g-1',
			requestBody: { id: 'g-1', summary: 'New', start: { dateTime: 'x' } }
		});
	});

	it('treats an event Google already removed as deleted', async () => {
		const api = fakeCalendar({
			events: { delete: vi.fn(async () => Promise.reject({ code: 410 })) }
		});
		await expect(
			client(api).deleteCalendarEvent(USER_ID, { event_id: 'g-1' })
		).resolves.toMatchObject({ success: true, already_missing: true });
	});

	it('maps a revoked grant to reconnect_required on writes and project calendars', async () => {
		const revoked = vi.fn(async () =>
			Promise.reject({ response: { status: 401, data: { error: 'invalid_grant' } } })
		);
		const api = fakeCalendar({ events: { insert: revoked }, calendars: { insert: revoked } });
		const created = await client(api)
			.createStandaloneEvent(USER_ID, {
				summary: 'x',
				start: new Date('2026-09-10T15:00:00Z'),
				end: new Date('2026-09-10T16:00:00Z')
			})
			.catch((error: unknown) => error);
		expect((created as LegacyCalendarReadError).code).toBe('reconnect_required');
		const project = await client(api)
			.createProjectCalendar(USER_ID, { name: 'Launch' })
			.catch((error: unknown) => error);
		expect((project as LegacyCalendarReadError).code).toBe('reconnect_required');
	});

	it('reports other project-calendar failures as data, like the web client', async () => {
		const api = fakeCalendar({
			calendars: { patch: vi.fn(async () => Promise.reject(new Error('quota'))) }
		});
		await expect(
			client(api).updateCalendarProperties(USER_ID, 'proj-cal@group', { summary: 'x' })
		).resolves.toEqual({ success: false, error: 'quota' });
		await expect(
			client(fakeCalendar()).createProjectCalendar(USER_ID, { name: 'Launch', colorId: '7' })
		).resolves.toEqual({ success: true, calendarId: 'proj-cal@group' });
	});

	it('refuses a user other than the one it is bound to', async () => {
		const api = fakeCalendar();
		await expect(
			client(api).deleteCalendarEvent('someone-else', { event_id: 'g-1' })
		).rejects.toThrow('outside its binding');
		expect(api.events.delete).not.toHaveBeenCalled();
	});

	it('reports not_connected without a grant, before any write', async () => {
		const admin = {
			from: vi.fn(() => {
				const builder: any = {
					select: () => builder,
					eq: () => builder,
					maybeSingle: async () => ({ data: null, error: null })
				};
				return builder;
			})
		};
		const error = await createLegacyGoogleCalendarClient({
			admin,
			userId: USER_ID,
			credentials: { clientId: 'id', clientSecret: 'secret' }
		})
			.createProjectCalendar(USER_ID, { name: 'Launch' })
			.catch((caught: unknown) => caught);
		expect((error as LegacyCalendarReadError).code).toBe('not_connected');
	});
});

describe('Agent Run personal event sync', () => {
	const eventId = '33333333-3333-4333-8333-333333333331';
	function setup(syncRows: unknown[] = []) {
		let row: Record<string, any> = {
			...ontoEvent(1),
			id: eventId,
			project_id: null,
			timezone: 'UTC',
			props: {
				external_event_id: 'personal-google',
				external_calendar_id: 'personal@example.com'
			},
			onto_event_sync: syncRows
		};
		const port = createAgentRunCalendarPort({ admin: {}, userId: USER_ID }) as any;
		port.getOntologyEvent = vi.fn(async () => row);
		port.resolveInputTimezone = vi.fn(async () => 'UTC');
		port.patchEvent = vi.fn(async (_id, patch) => (row = { ...row, ...patch }));
		port.resolveGoogleCalendarIdForSyncRow = vi.fn(async () => 'project@example.com');
		port.upsertEventSync = vi.fn(async () => ({}));
		const api = {
			events: { patch: vi.fn(async () => ({ data: {} })), delete: vi.fn(async () => ({})) }
		};
		port.googleCalendar = vi.fn(async () => api);
		return { port, api };
	}
	it('updates the Google copy mapped only in props', async () => {
		const { port, api } = setup();
		await port.updateCalendarEvent({ onto_event_id: eventId, title: 'Renamed' });
		expect(api.events.patch).toHaveBeenCalledWith(
			expect.objectContaining({
				calendarId: 'personal@example.com',
				eventId: 'personal-google',
				requestBody: expect.objectContaining({ summary: 'Renamed' })
			})
		);
		expect(port.upsertEventSync).not.toHaveBeenCalled();
	});
	it('deletes the Google copy mapped only in props', async () => {
		const { port, api } = setup();
		await port.deleteCalendarEvent({ onto_event_id: eventId });
		expect(api.events.delete).toHaveBeenCalledWith({
			calendarId: 'personal@example.com',
			eventId: 'personal-google',
			sendUpdates: 'none'
		});
	});
	it.each([404, 410])(
		'finishes deleting a BuildOS row after Google returns %s',
		async (status) => {
			const { port, api } = setup([
				{
					user_id: USER_ID,
					external_event_id: 'project-google',
					project_calendar_id: 'mapping-1'
				}
			]);
			api.events.delete.mockRejectedValue({ response: { status } });
			await expect(
				port.deleteCalendarEvent({ onto_event_id: eventId })
			).resolves.toMatchObject({ event: { sync_status: 'deleted' } });
		}
	);
	it('uses a valid sync row once instead of also writing its props mapping', async () => {
		const { port, api } = setup([
			{
				user_id: USER_ID,
				external_event_id: 'project-google',
				project_calendar_id: 'mapping-1'
			}
		]);
		await port.updateCalendarEvent({ onto_event_id: eventId, title: 'Renamed' });
		expect(api.events.patch).toHaveBeenCalledTimes(1);
		expect(api.events.patch).toHaveBeenCalledWith(
			expect.objectContaining({
				calendarId: 'project@example.com',
				eventId: 'project-google'
			})
		);
	});
	it('falls back when an owned sync row has no usable calendar mapping', async () => {
		const { port, api } = setup([
			{ user_id: USER_ID, external_event_id: 'stale', project_calendar_id: 'missing' }
		]);
		port.resolveGoogleCalendarIdForSyncRow.mockResolvedValue(null);
		await port.updateCalendarEvent({ onto_event_id: eventId, title: 'Renamed' });
		expect(api.events.patch).toHaveBeenCalledWith(
			expect.objectContaining({ eventId: 'personal-google' })
		);
	});
	it('honors sync opt-out and propagates genuine Google delete failures', async () => {
		const { port, api } = setup();
		await port.updateCalendarEvent({
			onto_event_id: eventId,
			title: 'Local',
			sync_to_calendar: false
		});
		expect(api.events.patch).not.toHaveBeenCalled();
		api.events.delete.mockRejectedValue({ response: { status: 500 } });
		await expect(port.deleteCalendarEvent({ onto_event_id: eventId })).rejects.toMatchObject({
			response: { status: 500 }
		});
		expect(port.patchEvent).not.toHaveBeenCalledWith(
			eventId,
			expect.objectContaining({ deleted_at: expect.anything() })
		);
	});
});

describe('Agent Run guest task calendar sync', () => {
	it.each(['read', 'insert'])(
		'does not queue an orphaned event when its task-edge %s fails',
		async (failure) => {
			const taskId = '44444444-4444-4444-8444-444444444444';
			const row = {
				...ontoEvent(1),
				project_id: PROJECT_ID,
				props: { guest_agent_calendar_user_id: 'guest-user' }
			};
			const admin = {
				rpc: vi.fn(async () => ({ error: null })),
				from: (table: string) => {
					const query: any = {
						insert: () => query,
						select: () => query,
						eq: () => query,
						neq: () => query,
						single: async () => ({ data: row, error: null }),
						maybeSingle: async () => ({
							data: null,
							error: failure === 'read' ? { message: 'edge read failed' } : null
						}),
						then: (resolve: any) =>
							resolve({
								data: [],
								error:
									table === 'onto_edges'
										? { message: 'edge insert failed' }
										: null
							})
					};
					return query;
				}
			};
			const port = createAgentRunCalendarPort({ admin, userId: USER_ID }) as any;
			port.getActorId = vi.fn(async () => 'actor');
			port.resolveInputTimezone = vi.fn(async () => 'UTC');
			port.resolveTaskMetadata = vi.fn(async () => ({
				taskId,
				projectId: PROJECT_ID,
				calendarSyncUserId: 'guest-user'
			}));
			await expect(
				port.createCalendarEvent({
					task_id: taskId,
					title: 'Work',
					start_at: '2026-10-25T12:00:00Z'
				})
			).rejects.toThrow(`edge ${failure} failed`);
			expect(admin.rpc).not.toHaveBeenCalled();
		}
	);

	it('links a new guest task event before queueing, without resolving the editing owner’s calendar', async () => {
		const taskId = '44444444-4444-4444-8444-444444444444';
		const event = {
			...ontoEvent(1),
			project_id: PROJECT_ID,
			props: { guest_agent_calendar_user_id: 'guest-user' }
		};
		const query: any = {
			insert: () => query,
			select: () => query,
			eq: () => query,
			neq: () => query,
			single: async () => ({ data: event, error: null }),
			then: (resolve: any) => resolve({ data: [], error: null })
		};
		const rpc = vi.fn(async () => ({ error: null }));
		const port = createAgentRunCalendarPort({
			admin: { from: () => query, rpc },
			userId: USER_ID
		}) as any;
		port.getActorId = vi.fn(async () => 'actor');
		port.resolveInputTimezone = vi.fn(async () => 'UTC');
		port.resolveTaskMetadata = vi.fn(async () => ({
			taskId,
			projectId: PROJECT_ID,
			taskTitle: 'Guest task',
			calendarSyncUserId: 'guest-user'
		}));
		port.ensureTaskEventEdge = vi.fn(async () => undefined);
		port.resolveCalendarSyncTarget = vi.fn();
		port.googleCalendar = vi.fn();
		const result = await port.createCalendarEvent({
			task_id: taskId,
			title: 'Work',
			start_at: '2026-10-23T12:00:00Z'
		});
		expect(port.ensureTaskEventEdge).toHaveBeenCalledWith({
			projectId: PROJECT_ID,
			taskId,
			eventId: event.id
		});
		expect(port.ensureTaskEventEdge.mock.invocationCallOrder[0]).toBeLessThan(
			rpc.mock.invocationCallOrder[0]
		);
		expect(rpc).toHaveBeenCalledWith(
			'add_queue_job',
			expect.objectContaining({ p_user_id: 'guest-user' })
		);
		expect(result.sync.status).toBe('pending');
		expect(port.resolveCalendarSyncTarget).not.toHaveBeenCalled();
		expect(port.googleCalendar).not.toHaveBeenCalled();
	});

	it.each(['update', 'delete'])(
		'queues %s to the guest instead of using the editing owner’s Google credentials',
		async (action) => {
			let row: any = {
				...ontoEvent(1),
				project_id: PROJECT_ID,
				props: { guest_agent_calendar_user_id: 'guest-user' }
			};
			const query: any = {
				select: () => query,
				eq: () => query,
				neq: () => query,
				then: (resolve: any) => resolve({ data: [], error: null })
			};
			const rpc = vi.fn(async () => ({ error: null }));
			const port = createAgentRunCalendarPort({
				admin: { from: () => query, rpc },
				userId: USER_ID
			}) as any;
			port.getOntologyEvent = vi.fn(async () => row);
			port.resolveInputTimezone = vi.fn(async () => 'UTC');
			port.patchEvent = vi.fn(async (_id, patch) => (row = { ...row, ...patch }));
			port.googleCalendar = vi.fn();
			if (action === 'update')
				await port.updateCalendarEvent({ onto_event_id: row.id, title: 'Changed' });
			else await port.deleteCalendarEvent({ onto_event_id: row.id });
			expect(rpc).toHaveBeenCalledWith(
				'add_queue_job',
				expect.objectContaining({
					p_user_id: 'guest-user',
					p_metadata: expect.objectContaining({
						action: action === 'update' ? 'upsert' : 'delete'
					})
				})
			);
			expect(port.googleCalendar).not.toHaveBeenCalled();
			expect(row.sync_status).toBe('pending');
		}
	);
});
