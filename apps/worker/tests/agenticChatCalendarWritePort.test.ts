// apps/worker/tests/agenticChatCalendarWritePort.test.ts
//
// The worker half of the four reviewed calendar writes. The table row wiring is
// covered in agenticChatTableMutationAdapter.test.ts; this suite proves the
// behavior the row delegates: explicit authorization under a service-role
// client, direct Google writes with no queue hop, and the structured
// reconnect/not-configured envelopes that replace a thrown provider error.
import { GoogleCalendarConnectionError } from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';
import { AgenticChatToolAccessDeniedError } from '@buildos/agentic-chat-runtime/tools';
import { describe, expect, it, vi } from 'vitest';
import { createWorkerGoogleCalendarServices } from '../src/workers/agentic-chat/tools/calendar-services';
import {
	calendarWriteFailureCode,
	createWorkerAgenticChatCalendarWritePort,
	normalizeCalendarDateTime
} from '../src/workers/agentic-chat/tools/calendar-write-port';

const USER_ID = '55555555-5555-4555-8555-555555555555';
const SESSION_ID = '66666666-6666-4666-8666-666666666666';
const ACTOR_ID = '77777777-7777-4777-8777-777777777777';
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';

type TableResponse = { data?: unknown; error?: unknown };

/**
 * Minimal PostgREST double: one queue of responses per table, consumed in call
 * order, with the last entry repeating. Inserts are recorded, never filtered.
 */
function fakeClient(
	responses: Record<string, TableResponse[]>,
	inserts: Array<{ table: string; row: unknown }> = []
) {
	const queues = new Map(Object.entries(responses).map(([table, list]) => [table, [...list]]));
	const next = (table: string): TableResponse => {
		const queue = queues.get(table);
		if (!queue || queue.length === 0) return { data: null, error: null };
		return queue.length === 1 ? queue[0]! : queue.shift()!;
	};
	return {
		from(table: string) {
			const chain: Record<string, unknown> = {};
			const passthrough = () => chain;
			chain.select = passthrough;
			chain.eq = passthrough;
			chain.is = passthrough;
			chain.order = passthrough;
			chain.maybeSingle = async () => next(table);
			chain.single = async () => next(table);
			chain.insert = async (row: unknown) => {
				inserts.push({ table, row });
				return { error: null };
			};
			return chain;
		}
	} as never;
}

function fakeAccess(overrides: Partial<{ assertProjectAccess: () => Promise<void> }> = {}) {
	return {
		getActorId: vi.fn(async () => ACTOR_ID),
		assertProjectAccess: vi.fn(overrides.assertProjectAccess ?? (async () => {})),
		assertEntityAccess: vi.fn(async () => {}),
		resolveProjectSummaries: vi.fn(async () => [])
	} as never;
}

function fakeServices(write: Record<string, unknown> = {}) {
	return () =>
		({
			write: {
				createStandaloneEvent: vi.fn(async () => ({})),
				updateEvent: vi.fn(async () => ({})),
				deleteEvent: vi.fn(async () => ({})),
				...write
			},
			targets: { hasActiveTarget: vi.fn(async () => true) },
			projectResources: {},
			credentials: {},
			sources: {},
			read: {}
		}) as never;
}

function syncedEventRow(overrides: Record<string, unknown> = {}) {
	return {
		data: {
			id: EVENT_ID,
			external_link: 'https://calendar.google.com/event?eid=abc',
			props: {
				external_event_id: 'google-abc',
				external_calendar_id: 'primary'
			},
			sync_status: 'synced',
			sync_error: null,
			...overrides
		},
		error: null
	};
}

function request(overrides: Record<string, unknown> = {}) {
	return {
		toolName: 'create_calendar_event',
		userId: USER_ID,
		sessionId: SESSION_ID,
		projectId: null,
		arguments: { title: 'Dentist', start_at: '2026-09-10T15:00:00Z' },
		...overrides
	} as never;
}

describe('worker calendar write port', () => {
	it('creates a user-scope event and reports what actually reached Google', async () => {
		const createEvent = vi.fn(async () => ({ event: { id: EVENT_ID } }));
		const port = createWorkerAgenticChatCalendarWritePort({
			client: fakeClient({
				users: [{ data: { timezone: 'America/New_York' }, error: null }],
				onto_events: [syncedEventRow()]
			}),
			options: {
				services: fakeServices(),
				createAccess: () => fakeAccess(),
				createEventSync: () => ({ createEvent }) as never
			}
		});

		await expect(port.execute(request())).resolves.toEqual({
			ok: true,
			event_id: EVENT_ID,
			google_event_id: 'google-abc',
			html_link: 'https://calendar.google.com/event?eid=abc',
			calendar_id: 'primary',
			scope: 'user',
			synced: true
		});
		const [, payload] = createEvent.mock.calls[0] as [string, Record<string, unknown>];
		expect(createEvent.mock.calls[0]![0]).toBe(USER_ID);
		expect(payload.owner).toEqual({ type: 'actor', id: ACTOR_ID });
		expect(payload.startAt).toBe('2026-09-10T15:00:00.000Z');
		expect(payload.calendarScope).toBe('user');
		expect(payload).not.toHaveProperty('attendees');
		expect(payload).not.toHaveProperty('reminders');
	});

	it('authorizes project membership before touching onto_events', async () => {
		const createEvent = vi.fn(async () => ({ event: { id: EVENT_ID } }));
		const access = fakeAccess({
			assertProjectAccess: async () => {
				throw new AgenticChatToolAccessDeniedError();
			}
		});
		const port = createWorkerAgenticChatCalendarWritePort({
			client: fakeClient({ users: [{ data: { timezone: 'UTC' }, error: null }] }),
			options: {
				services: fakeServices(),
				createAccess: () => access,
				createEventSync: () => ({ createEvent }) as never
			}
		});

		await expect(
			port.execute(
				request({
					projectId: PROJECT_ID,
					arguments: {
						title: 'Kickoff',
						start_at: '2026-09-10T15:00:00Z',
						project_id: PROJECT_ID
					}
				})
			)
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'create_calendar_event_access_denied'
		});
		expect(
			(access as unknown as { assertProjectAccess: ReturnType<typeof vi.fn> })
				.assertProjectAccess
		).toHaveBeenCalledWith(PROJECT_ID, 'write');
		expect(createEvent).not.toHaveBeenCalled();
	});

	it('turns a dead Google grant into reconnect_required while the row survives', async () => {
		// The shared sync service swallows provider failures and records them on
		// the row; the writer proxy is how the tool still learns the grant died.
		const createEvent = vi.fn(async (_userId: string, _payload: unknown) => {
			try {
				await writerSpy.createStandaloneEvent({});
			} catch {
				// exactly what OntoEventSyncService does: mark and carry on
			}
			return { event: { id: EVENT_ID } };
		});
		let writerSpy: { createStandaloneEvent: (input: unknown) => Promise<unknown> };

		const port = createWorkerAgenticChatCalendarWritePort({
			client: fakeClient({
				users: [{ data: { timezone: 'UTC' }, error: null }],
				onto_events: [
					syncedEventRow({
						props: {},
						external_link: null,
						sync_status: 'error',
						sync_error: 'This Google Calendar account must be reconnected'
					})
				]
			}),
			options: {
				services: fakeServices({
					createStandaloneEvent: vi.fn(async () => {
						throw new GoogleCalendarConnectionError(
							'reconnect_required',
							'This Google Calendar account must be reconnected'
						);
					})
				}),
				createAccess: () => fakeAccess(),
				createEventSync: ({ calendarWriter }) => {
					writerSpy = calendarWriter as never;
					return { createEvent } as never;
				}
			}
		});

		await expect(port.execute(request())).resolves.toEqual({
			ok: false,
			error_code: 'reconnect_required',
			event_id: EVENT_ID,
			google_event_id: null,
			html_link: null,
			calendar_id: null,
			scope: 'user',
			synced: false,
			sync_error: 'This Google Calendar account must be reconnected'
		});
	});

	it('reports a worker with no Calendar OAuth env as not_configured', async () => {
		const port = createWorkerAgenticChatCalendarWritePort({
			client: fakeClient({
				project_calendars: [{ data: null, error: null }],
				onto_projects: [{ data: { id: PROJECT_ID, props: {} }, error: null }]
			}),
			options: {
				services: fakeServices(),
				createAccess: () => fakeAccess(),
				createProjectCalendarService: () =>
					({
						createProjectCalendarRecord: vi.fn(async () => {
							throw new GoogleCalendarConnectionError(
								'not_configured',
								'OAuth credentials are unavailable for Calendar client kind google_calendar'
							);
						}),
						getProjectCalendarSyncMode: vi.fn(async () => 'actor_projection')
					}) as never
			}
		});

		await expect(
			port.execute(
				request({
					toolName: 'set_project_calendar',
					projectId: PROJECT_ID,
					arguments: { project_id: PROJECT_ID, name: 'Launch calendar' }
				})
			)
		).resolves.toEqual({
			ok: false,
			error_code: 'not_configured',
			synced: false,
			project_id: PROJECT_ID,
			calendar_id: null,
			sync_mode: 'actor_projection'
		});
	});

	it('never constructs Google credentials at port or service construction time', () => {
		expect(() =>
			createWorkerAgenticChatCalendarWritePort({ client: fakeClient({}) })
		).not.toThrow();
		// The credential service resolves env lazily, so a Railway deploy without
		// the Calendar OAuth variables still boots.
		expect(() => createWorkerGoogleCalendarServices({} as never, { env: {} })).not.toThrow();
	});

	it('refuses a user-scope event the turn actor does not own', async () => {
		const updateEvent = vi.fn(async () => ({}));
		const port = createWorkerAgenticChatCalendarWritePort({
			client: fakeClient({
				onto_events: [
					{
						data: {
							id: EVENT_ID,
							project_id: null,
							owner_entity_type: 'actor',
							owner_entity_id: 'someone-else',
							created_by: 'someone-else',
							timezone: 'UTC',
							start_at: '2026-09-10T15:00:00Z'
						},
						error: null
					}
				]
			}),
			options: {
				services: fakeServices(),
				createAccess: () => fakeAccess(),
				createEventSync: () => ({ updateEvent }) as never
			}
		});

		await expect(
			port.execute(
				request({
					toolName: 'update_calendar_event',
					arguments: { onto_event_id: EVENT_ID, title: 'Renamed' }
				})
			)
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'update_calendar_event_access_denied'
		});
		expect(updateEvent).not.toHaveBeenCalled();
	});

	it('gates a project event update on project membership and reports the sync outcome', async () => {
		const updateEvent = vi.fn(async () => ({ id: EVENT_ID }));
		const access = fakeAccess();
		const port = createWorkerAgenticChatCalendarWritePort({
			client: fakeClient({
				onto_events: [
					{
						data: {
							id: EVENT_ID,
							project_id: PROJECT_ID,
							owner_entity_type: 'project',
							owner_entity_id: PROJECT_ID,
							created_by: ACTOR_ID,
							timezone: 'America/New_York',
							start_at: '2026-09-10T15:00:00Z'
						},
						error: null
					},
					syncedEventRow()
				]
			}),
			options: {
				services: fakeServices(),
				createAccess: () => access,
				createEventSync: () => ({ updateEvent }) as never
			}
		});

		await expect(
			port.execute(
				request({
					toolName: 'update_calendar_event',
					projectId: PROJECT_ID,
					arguments: { onto_event_id: EVENT_ID, title: 'Renamed', end_at: null }
				})
			)
		).resolves.toMatchObject({ ok: true, event_id: EVENT_ID, scope: 'project', synced: true });
		expect(
			(access as unknown as { assertProjectAccess: ReturnType<typeof vi.fn> })
				.assertProjectAccess
		).toHaveBeenCalledWith(PROJECT_ID, 'write');
		const [, payload] = updateEvent.mock.calls[0] as [string, Record<string, unknown>];
		expect(payload).toMatchObject({ eventId: EVENT_ID, title: 'Renamed', endAt: null });
	});

	it('soft-deletes an ontology event and marks the receipt deleted', async () => {
		const deleteEvent = vi.fn(async () => ({ id: EVENT_ID }));
		const port = createWorkerAgenticChatCalendarWritePort({
			client: fakeClient({
				onto_events: [
					{
						data: {
							id: EVENT_ID,
							project_id: null,
							owner_entity_type: 'actor',
							owner_entity_id: ACTOR_ID,
							created_by: ACTOR_ID,
							timezone: 'UTC',
							start_at: '2026-09-10T15:00:00Z'
						},
						error: null
					},
					syncedEventRow({ sync_status: 'cancelled' })
				]
			}),
			options: {
				services: fakeServices(),
				createAccess: () => fakeAccess(),
				createEventSync: () => ({ deleteEvent }) as never
			}
		});

		await expect(
			port.execute(
				request({
					toolName: 'delete_calendar_event',
					arguments: { onto_event_id: EVENT_ID }
				})
			)
		).resolves.toMatchObject({
			ok: true,
			event_id: EVENT_ID,
			scope: 'user',
			synced: true,
			deleted: true
		});
	});

	it('links a task event and surfaces a failed link instead of dropping it', async () => {
		const inserts: Array<{ table: string; row: unknown }> = [];
		const createEvent = vi.fn(async () => ({ event: { id: EVENT_ID } }));
		const port = createWorkerAgenticChatCalendarWritePort({
			client: fakeClient(
				{
					users: [{ data: { timezone: 'UTC' }, error: null }],
					onto_tasks: [
						{
							data: { id: TASK_ID, title: 'Draft the brief', project_id: PROJECT_ID },
							error: null
						}
					],
					onto_edges: [{ data: null, error: null }],
					onto_events: [syncedEventRow()]
				},
				inserts
			),
			options: {
				services: fakeServices(),
				createAccess: () => fakeAccess(),
				createEventSync: () => ({ createEvent }) as never
			}
		});

		await expect(
			port.execute(
				request({
					projectId: PROJECT_ID,
					arguments: {
						title: 'Focus block',
						start_at: '2026-09-10T15:00:00Z',
						task_id: TASK_ID
					}
				})
			)
		).resolves.toMatchObject({ ok: true, scope: 'project', task_link_created: true });
		expect(inserts).toEqual([
			{
				table: 'onto_edges',
				row: {
					project_id: PROJECT_ID,
					src_id: TASK_ID,
					src_kind: 'task',
					dst_id: EVENT_ID,
					dst_kind: 'event',
					rel: 'has_event'
				}
			}
		]);
	});

	it('refuses an end before its start', async () => {
		const port = createWorkerAgenticChatCalendarWritePort({
			client: fakeClient({ users: [{ data: { timezone: 'UTC' }, error: null }] }),
			options: {
				services: fakeServices(),
				createAccess: () => fakeAccess(),
				createEventSync: () => ({ createEvent: vi.fn() }) as never
			}
		});

		await expect(
			port.execute(
				request({
					arguments: {
						title: 'Dentist',
						start_at: '2026-09-10T15:00:00Z',
						end_at: '2026-09-10T14:00:00Z'
					}
				})
			)
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'create_calendar_event_invalid_arguments'
		});
	});
});

describe('calendar write failure classification', () => {
	it('maps every dead-grant shape to reconnect_required and env gaps to not_configured', () => {
		expect(
			calendarWriteFailureCode(
				new GoogleCalendarConnectionError('reconnect_required', 'reconnect')
			)
		).toBe('reconnect_required');
		expect(
			calendarWriteFailureCode(
				new GoogleCalendarConnectionError('refresh_token_required', 'refresh')
			)
		).toBe('reconnect_required');
		expect(
			calendarWriteFailureCode(new GoogleCalendarConnectionError('not_configured', 'env'))
		).toBe('not_configured');
		// Raw provider rejections that never became a typed connection error.
		expect(calendarWriteFailureCode({ status: 401, message: 'Unauthorized' })).toBe(
			'reconnect_required'
		);
		expect(calendarWriteFailureCode(new Error('invalid_grant: token revoked'))).toBe(
			'reconnect_required'
		);
		// A transient provider error stays a real failure.
		expect(calendarWriteFailureCode(new Error('socket hang up'))).toBeNull();
		expect(
			calendarWriteFailureCode(new GoogleCalendarConnectionError('provider_error', 'busy'))
		).toBeNull();
	});
});

describe('calendar datetime normalization', () => {
	it('honors an explicit offset and reads a bare civil day in the resolved zone', () => {
		expect(normalizeCalendarDateTime('2026-03-04T18:00:00Z', 'America/New_York')).toEqual({
			iso: '2026-03-04T18:00:00.000Z',
			hadExplicitTimezone: true,
			assumedTimezone: null
		});
		expect(normalizeCalendarDateTime('2026-03-04T18:00:00', 'America/New_York').iso).toBe(
			'2026-03-04T23:00:00.000Z'
		);
		expect(normalizeCalendarDateTime('2026-03-04', 'America/New_York', 'start').iso).toBe(
			'2026-03-04T05:00:00.000Z'
		);
		expect(normalizeCalendarDateTime('2026-03-04', 'America/New_York', 'end').iso).toBe(
			'2026-03-05T04:59:59.000Z'
		);
	});
});
