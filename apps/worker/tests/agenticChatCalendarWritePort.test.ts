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
		const createEvent = vi.fn(async (_userId: string, _payload: Record<string, unknown>) => ({
			event: { id: EVENT_ID }
		}));
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
		const [, payload] = createEvent.mock.calls[0];
		expect(createEvent.mock.calls[0]![0]).toBe(USER_ID);
		expect(payload.owner).toEqual({ type: 'actor', id: ACTOR_ID });
		expect(payload.startAt).toBe('2026-09-10T15:00:00.000Z');
		expect(payload.calendarScope).toBe('user');
		expect(payload).not.toHaveProperty('attendees');
		expect(payload).not.toHaveProperty('reminders');
	});

	it('authorizes project membership before touching onto_events', async () => {
		const createEvent = vi.fn(async (_userId: string, _payload: Record<string, unknown>) => ({
			event: { id: EVENT_ID }
		}));
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
		const updateEvent = vi.fn(
			async (_userId: string, _payload: Record<string, unknown>) => ({})
		);
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
		const updateEvent = vi.fn(async (_userId: string, _payload: Record<string, unknown>) => ({
			id: EVENT_ID
		}));
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
		const [, payload] = updateEvent.mock.calls[0];
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
		const createEvent = vi.fn(async (_userId: string, _payload: Record<string, unknown>) => ({
			event: { id: EVENT_ID }
		}));
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

describe('legacy single-grant users', () => {
	/** Source-aware services for a user with no active write target. */
	function servicesWithoutTarget(hasActiveTarget: () => Promise<boolean> = async () => false) {
		return () =>
			({
				write: {
					createStandaloneEvent: vi.fn(async () => {
						throw new Error('source-aware writer must not run for a legacy user');
					}),
					updateEvent: vi.fn(),
					deleteEvent: vi.fn()
				},
				targets: { hasActiveTarget: vi.fn(hasActiveTarget) },
				projectResources: {},
				credentials: {},
				sources: {},
				read: {}
			}) as never;
	}
	function legacyClient(overrides: Record<string, unknown> = {}) {
		return {
			createStandaloneEvent: vi.fn(async () => ({ eventId: 'g-1' })),
			updateCalendarEvent: vi.fn(async () => ({ success: true, event_id: 'g-1' })),
			deleteCalendarEvent: vi.fn(async () => ({ success: true, event_id: 'g-1' })),
			listUserCalendars: vi.fn(),
			createProjectCalendar: vi.fn(),
			deleteProjectCalendar: vi.fn(),
			updateCalendarProperties: vi.fn(),
			...overrides
		};
	}
	const grantError = (code: string) =>
		Object.assign(new Error(`Legacy Google Calendar read unavailable: ${code}`), {
			name: 'LegacyCalendarReadError',
			code
		});

	it('routes the ontology write through the singleton grant when no source exists', async () => {
		const legacy = legacyClient();
		let wiring: { sourceAware: boolean; legacyCalendar: unknown } | null = null;
		const createEvent = vi.fn(async () => {
			await (wiring!.legacyCalendar as ReturnType<typeof legacyClient>).createStandaloneEvent(
				USER_ID,
				{}
			);
			return { event: { id: EVENT_ID } };
		});
		const port = createWorkerAgenticChatCalendarWritePort({
			client: fakeClient({
				users: [{ data: { timezone: 'UTC' }, error: null }],
				onto_events: [syncedEventRow()]
			}),
			options: {
				services: servicesWithoutTarget(),
				serviceOptions: { env: {} },
				legacyCalendar: () => legacy as never,
				createAccess: () => fakeAccess(),
				createEventSync: (input) => {
					wiring = input;
					return { createEvent } as never;
				}
			}
		});

		await expect(port.execute(request())).resolves.toMatchObject({
			ok: true,
			synced: true,
			google_event_id: 'google-abc'
		});
		expect(wiring!.sourceAware).toBe(false);
		expect(legacy.createStandaloneEvent).toHaveBeenCalledOnce();
	});

	it('keeps allowlisted, source-selecting, and connected users on the source-aware route', async () => {
		const route = async (
			options: Record<string, unknown>,
			args: Record<string, unknown> = {}
		) => {
			let sourceAware: boolean | null = null;
			const port = createWorkerAgenticChatCalendarWritePort({
				client: fakeClient({
					users: [{ data: { timezone: 'UTC' }, error: null }],
					onto_events: [syncedEventRow()]
				}),
				options: {
					legacyCalendar: () => legacyClient() as never,
					createAccess: () => fakeAccess(),
					createEventSync: (input) => {
						sourceAware = input.sourceAware;
						return { createEvent: async () => ({ event: { id: EVENT_ID } }) } as never;
					},
					...options
				}
			});
			await port.execute(
				request({
					arguments: { title: 'Dentist', start_at: '2026-09-10T15:00:00Z', ...args }
				})
			);
			return sourceAware;
		};
		const allowlist = {
			PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED: 'true',
			PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS: USER_ID
		};
		expect(
			await route({ services: servicesWithoutTarget(), serviceOptions: { env: allowlist } })
		).toBe(true);
		expect(
			await route(
				{ services: servicesWithoutTarget(), serviceOptions: { env: {} } },
				{ calendar_source_id: PROJECT_ID }
			)
		).toBe(true);
		expect(await route({ services: fakeServices(), serviceOptions: { env: {} } })).toBe(true);
		// A target probe that fails still leaves the singleton grant its chance.
		expect(
			await route({
				services: servicesWithoutTarget(async () => {
					throw new Error('connections table unavailable');
				}),
				serviceOptions: { env: {} }
			})
		).toBe(false);
	});

	it('reports a revoked singleton grant as reconnect_required while the row survives', async () => {
		const legacy = legacyClient({
			createStandaloneEvent: vi.fn(async () => {
				throw grantError('reconnect_required');
			})
		});
		const port = createWorkerAgenticChatCalendarWritePort({
			client: fakeClient({
				users: [{ data: { timezone: 'UTC' }, error: null }],
				onto_events: [
					syncedEventRow({ props: {}, external_link: null, sync_status: 'error' })
				]
			}),
			options: {
				services: servicesWithoutTarget(),
				serviceOptions: { env: {} },
				legacyCalendar: () => legacy as never,
				createAccess: () => fakeAccess(),
				createEventSync: ({ legacyCalendar }) =>
					({
						createEvent: async () => {
							// OntoEventSyncService records the failure and keeps the row.
							await (legacyCalendar as ReturnType<typeof legacyClient>)
								.createStandaloneEvent(USER_ID, {})
								.catch(() => undefined);
							return { event: { id: EVENT_ID } };
						}
					}) as never
			}
		});

		await expect(port.execute(request())).resolves.toMatchObject({
			ok: false,
			error_code: 'reconnect_required',
			event_id: EVENT_ID,
			synced: false
		});
	});

	it('updates a Google-only event on the calendar the web executor would pick', async () => {
		const legacy = legacyClient();
		const port = createWorkerAgenticChatCalendarWritePort({
			client: fakeClient({
				users: [{ data: { timezone: 'UTC' }, error: null }],
				project_calendars: [{ data: { calendar_id: 'proj-cal@group' }, error: null }]
			}),
			options: {
				services: servicesWithoutTarget(),
				serviceOptions: { env: {} },
				legacyCalendar: () => legacy as never,
				createAccess: () => fakeAccess()
			}
		});

		await expect(
			port.execute(
				request({
					toolName: 'update_calendar_event',
					projectId: PROJECT_ID,
					arguments: {
						event_id: 'g-1',
						calendar_scope: 'project',
						project_id: PROJECT_ID,
						title: 'Renamed'
					}
				})
			)
		).resolves.toMatchObject({
			ok: true,
			google_event_id: 'g-1',
			calendar_id: 'proj-cal@group',
			synced: true
		});
		expect(legacy.updateCalendarEvent).toHaveBeenCalledWith(
			USER_ID,
			expect.objectContaining({
				event_id: 'g-1',
				calendar_id: 'proj-cal@group',
				summary: 'Renamed'
			})
		);
	});

	it('reports a Google-only delete with no grant as not_connected, never deleted', async () => {
		const port = createWorkerAgenticChatCalendarWritePort({
			client: fakeClient({}),
			options: {
				services: servicesWithoutTarget(),
				serviceOptions: { env: {} },
				legacyCalendar: () =>
					legacyClient({
						deleteCalendarEvent: vi.fn(async () => {
							throw grantError('not_connected');
						})
					}) as never,
				createAccess: () => fakeAccess()
			}
		});

		await expect(
			port.execute(
				request({ toolName: 'delete_calendar_event', arguments: { event_id: 'g-1' } })
			)
		).resolves.toEqual({ ok: false, error_code: 'not_connected', synced: false });
	});

	it('creates a project calendar through the singleton grant and reports a missing grant as data', async () => {
		const createProjectCalendar = vi.fn(async () => {
			throw grantError('not_connected');
		});
		const port = createWorkerAgenticChatCalendarWritePort({
			client: fakeClient({
				project_calendars: [{ data: null, error: null }],
				onto_projects: [
					{ data: { id: PROJECT_ID, name: 'Launch', description: null, props: {} } }
				],
				users: [{ data: { timezone: 'UTC' }, error: null }]
			}),
			options: {
				services: servicesWithoutTarget(),
				serviceOptions: { env: {} },
				legacyCalendar: () => legacyClient({ createProjectCalendar }) as never,
				createAccess: () => fakeAccess()
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
		).resolves.toMatchObject({
			ok: false,
			error_code: 'not_connected',
			project_id: PROJECT_ID,
			calendar_id: null
		});
		expect(createProjectCalendar).toHaveBeenCalledWith(
			USER_ID,
			expect.objectContaining({ name: 'Launch calendar', timeZone: 'UTC' })
		);
	});
});

describe('calendar write failure classification', () => {
	it('maps the singleton-grant reason codes into the write vocabulary', () => {
		const grant = (code: string) =>
			Object.assign(new Error(code), { name: 'LegacyCalendarReadError', code });
		expect(calendarWriteFailureCode(grant('not_connected'))).toBe('not_connected');
		expect(calendarWriteFailureCode(grant('reconnect_required'))).toBe('reconnect_required');
		expect(calendarWriteFailureCode(grant('credentials_unreadable'))).toBe(
			'credentials_unreadable'
		);
		expect(calendarWriteFailureCode(grant('credentials_not_configured'))).toBe(
			'not_configured'
		);
		expect(calendarWriteFailureCode(grant('something_else'))).toBeNull();
	});
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
