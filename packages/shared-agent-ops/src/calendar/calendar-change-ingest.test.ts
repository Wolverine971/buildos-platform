// packages/shared-agent-ops/src/calendar/calendar-change-ingest.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { calendar_v3 } from 'googleapis';
import {
	changeHeadline,
	diffEvent,
	ingestProjectCalendarChanges,
	plainDescription,
	undoCalendarIngestChange,
	type CalendarIngestEventWriter
} from './calendar-change-ingest';

// ---------------------------------------------------------------------------
// Minimal Supabase fake: each awaited query resolves through a per-table handler.
// ---------------------------------------------------------------------------

type Query = {
	table: string;
	op: 'select' | 'insert' | 'update';
	payload?: any;
	filters: Array<[string, string, unknown]>;
};
type Handler = (query: Query) => { data: any; error: any };

function fakeDb(handlers: Record<string, Handler>) {
	const log: Query[] = [];
	const from = (table: string) => {
		const query: Query = { table, op: 'select', filters: [] };
		const run = () => {
			log.push(query);
			const handler = handlers[table];
			return handler ? handler(query) : { data: null, error: null };
		};
		const builder: any = {
			select: () => builder,
			insert: (payload: any) => ((query.op = 'insert'), (query.payload = payload), builder),
			update: (payload: any) => ((query.op = 'update'), (query.payload = payload), builder),
			order: () => builder,
			limit: () => builder,
			maybeSingle: () => Promise.resolve(run()),
			single: () => Promise.resolve(run()),
			then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject)
		};
		for (const op of ['eq', 'in', 'is', 'neq', 'gte', 'lt', 'gt', 'not']) {
			builder[op] = (column: string, value: unknown) => {
				query.filters.push([op, column, value]);
				return builder;
			};
		}
		return builder;
	};
	return { db: { from } as any, log };
}

const USER = 'user-1';
const PROJECT = 'project-1';
const CAL = 'cal-abc@group.calendar.google.com';

function event(overrides: Partial<Record<string, any>> = {}) {
	return {
		id: 'evt-1',
		project_id: PROJECT,
		title: 'Client call',
		start_at: '2026-11-06T15:00:00.000Z',
		end_at: '2026-11-06T16:00:00.000Z',
		all_day: false,
		timezone: 'America/New_York',
		location: null,
		deleted_at: null,
		updated_at: '2026-11-05T10:00:00.000Z',
		owner_entity_type: 'project',
		owner_entity_id: PROJECT,
		props: {},
		...overrides
	};
}

function google(overrides: Partial<calendar_v3.Schema$Event> = {}): calendar_v3.Schema$Event {
	return {
		id: 'g-1',
		status: 'confirmed',
		summary: 'Client call',
		updated: '2026-11-05T12:00:00.000Z',
		start: { dateTime: '2026-11-06T15:00:00Z' },
		end: { dateTime: '2026-11-06T16:00:00Z' },
		...overrides
	};
}

function writer(): CalendarIngestEventWriter & {
	updateEvent: ReturnType<typeof vi.fn>;
	deleteEvent: ReturnType<typeof vi.fn>;
	createEvent: ReturnType<typeof vi.fn>;
} {
	return {
		updateEvent: vi.fn(async (_user: string, req: any) =>
			event({
				start_at: req.startAt ?? event().start_at,
				end_at: req.endAt ?? event().end_at,
				title: req.title ?? event().title,
				updated_at: '2026-11-05T12:00:01.000Z'
			})
		),
		deleteEvent: vi.fn(async () =>
			event({
				deleted_at: '2026-11-05T12:00:01.000Z',
				updated_at: '2026-11-05T12:00:01.000Z'
			})
		),
		createEvent: vi.fn(async (_user: string, req: any) => ({
			event: event({
				id: 'evt-new',
				title: req.title,
				start_at: req.startAt,
				end_at: req.endAt,
				updated_at: '2026-11-05T12:00:01.000Z'
			})
		}))
	} as any;
}

function projectCalendarHandlers(extra: Record<string, Handler> = {}, mapped: any[] = []) {
	return {
		project_calendars: () => ({
			data: [{ id: 'pc-1', project_id: PROJECT, calendar_id: CAL, calendar_source_id: null }],
			error: null
		}),
		onto_event_sync: (q: Query) =>
			q.op === 'select' ? { data: mapped, error: null } : { data: null, error: null },
		onto_events: () => ({ data: [], error: null }),
		calendar_ingest_changes: () => ({ data: null, error: null }),
		...extra
	};
}

const base = {
	userId: USER,
	providerCalendarId: CAL,
	calendarSourceId: null,
	origin: 'live' as const,
	userTimezone: 'America/New_York',
	resolveActorId: async () => 'actor-1',
	now: () => new Date('2026-11-05T12:30:00Z')
};

describe('ingestProjectCalendarChanges', () => {
	it('does nothing on a calendar that is not a project calendar', async () => {
		const { db, log } = fakeDb({ project_calendars: () => ({ data: [], error: null }) });
		const w = writer();
		const result = await ingestProjectCalendarChanges({
			...base,
			supabase: db,
			writer: w,
			events: [google()]
		});
		expect(result.notProjectCalendar).toBe(true);
		expect(w.updateEvent).not.toHaveBeenCalled();
		expect(log.filter((q) => q.op !== 'select')).toEqual([]);
	});

	it('moves a BuildOS event that was moved in Google and records an undoable change', async () => {
		const { db, log } = fakeDb(
			projectCalendarHandlers({}, [
				{ external_event_id: 'g-1', project_calendar_id: 'pc-1', event: event() }
			])
		);
		const w = writer();
		const result = await ingestProjectCalendarChanges({
			...base,
			supabase: db,
			writer: w,
			events: [
				google({
					start: { dateTime: '2026-11-07T19:00:00Z' },
					end: { dateTime: '2026-11-07T20:00:00Z' }
				})
			]
		});
		expect(result.applied).toBe(1);
		expect(w.updateEvent).toHaveBeenCalledWith(
			USER,
			expect.objectContaining({
				eventId: 'evt-1',
				allDay: false,
				startAt: '2026-11-07T19:00:00.000Z',
				endAt: '2026-11-07T20:00:00.000Z',
				syncToCalendar: false
			})
		);
		const change = log.find((q) => q.table === 'calendar_ingest_changes' && q.op === 'insert');
		expect(change?.payload).toMatchObject({
			change_kind: 'updated',
			fields: ['time'],
			project_id: PROJECT,
			onto_event_id: 'evt-1',
			title: 'Moved “Client call” to Sat, Nov 7, 2:00 PM'
		});
		expect(change?.payload.before.start_at).toBe('2026-11-06T15:00:00.000Z');
	});

	it('ignores a Google copy older than the BuildOS row (an echo of our own push)', async () => {
		const { db } = fakeDb(
			projectCalendarHandlers({}, [
				{
					external_event_id: 'g-1',
					project_calendar_id: 'pc-1',
					event: event({ updated_at: '2026-11-05T13:00:00.000Z' })
				}
			])
		);
		const w = writer();
		const result = await ingestProjectCalendarChanges({
			...base,
			supabase: db,
			writer: w,
			events: [google({ summary: 'Old name' })]
		});
		expect(result.applied).toBe(0);
		expect(w.updateEvent).not.toHaveBeenCalled();
	});

	it('skips a newer Google copy whose fields already match', async () => {
		const { db } = fakeDb(
			projectCalendarHandlers({}, [
				{ external_event_id: 'g-1', project_calendar_id: 'pc-1', event: event() }
			])
		);
		const w = writer();
		const result = await ingestProjectCalendarChanges({
			...base,
			supabase: db,
			writer: w,
			events: [google()]
		});
		expect(result.applied).toBe(0);
		expect(w.updateEvent).not.toHaveBeenCalled();
	});

	it('removes the BuildOS event when it was deleted in Google', async () => {
		const { db, log } = fakeDb(
			projectCalendarHandlers({}, [
				{ external_event_id: 'g-1', project_calendar_id: 'pc-1', event: event() }
			])
		);
		const w = writer();
		await ingestProjectCalendarChanges({
			...base,
			supabase: db,
			writer: w,
			events: [google({ status: 'cancelled' })]
		});
		expect(w.deleteEvent).toHaveBeenCalledWith(
			USER,
			expect.objectContaining({ eventId: 'evt-1', syncToCalendar: false })
		);
		const change = log.find((q) => q.table === 'calendar_ingest_changes');
		expect(change?.payload).toMatchObject({
			change_kind: 'cancelled',
			title: 'Removed “Client call” (deleted in Google Calendar)'
		});
	});

	it('adds an event created straight on the project calendar, with its mapping', async () => {
		const { db, log } = fakeDb(projectCalendarHandlers());
		const w = writer();
		const result = await ingestProjectCalendarChanges({
			...base,
			supabase: db,
			writer: w,
			events: [
				google({
					id: 'g-new',
					summary: 'Site visit',
					description: '<p>Bring <b>plans</b></p>'
				})
			]
		});
		expect(result.applied).toBe(1);
		expect(w.createEvent).toHaveBeenCalledWith(
			USER,
			expect.objectContaining({
				projectId: PROJECT,
				owner: { type: 'project', id: PROJECT },
				title: 'Site visit',
				description: 'Bring plans',
				createdBy: 'actor-1',
				syncToCalendar: false
			})
		);
		const mapping = log.find((q) => q.table === 'onto_event_sync' && q.op === 'insert');
		expect(mapping?.payload).toMatchObject({
			event_id: 'evt-new',
			project_calendar_id: 'pc-1',
			external_event_id: 'g-new'
		});
		expect(log.find((q) => q.table === 'calendar_ingest_changes')?.payload.change_kind).toBe(
			'added'
		);
	});

	it('adopts an existing BuildOS event with the same title and start instead of duplicating', async () => {
		const { db, log } = fakeDb(
			projectCalendarHandlers({
				onto_events: () => ({
					data: [{ id: 'evt-twin', onto_event_sync: [] }],
					error: null
				})
			})
		);
		const w = writer();
		await ingestProjectCalendarChanges({
			...base,
			supabase: db,
			writer: w,
			events: [google({ id: 'g-new' })]
		});
		expect(w.createEvent).not.toHaveBeenCalled();
		const mapping = log.find((q) => q.table === 'onto_event_sync' && q.op === 'insert');
		expect(mapping?.payload).toMatchObject({
			event_id: 'evt-twin',
			external_event_id: 'g-new'
		});
	});

	it('never imports from a full listing or a recurring instance', async () => {
		const { db } = fakeDb(projectCalendarHandlers());
		const w = writer();
		await ingestProjectCalendarChanges({
			...base,
			supabase: db,
			writer: w,
			fullListing: true,
			events: [google({ id: 'g-new' })]
		});
		await ingestProjectCalendarChanges({
			...base,
			supabase: db,
			writer: w,
			events: [google({ id: 'g-inst', recurringEventId: 'g-series' })]
		});
		expect(w.createEvent).not.toHaveBeenCalled();
	});

	it('does not backfill events that already ended', async () => {
		const { db } = fakeDb(projectCalendarHandlers());
		const w = writer();
		await ingestProjectCalendarChanges({
			...base,
			origin: 'backfill',
			supabase: db,
			writer: w,
			events: [
				google({
					id: 'g-past',
					start: { dateTime: '2026-11-01T15:00:00Z' },
					end: { dateTime: '2026-11-01T16:00:00Z' }
				})
			]
		});
		expect(w.createEvent).not.toHaveBeenCalled();
	});
});

describe('undoCalendarIngestChange', () => {
	const change = {
		id: 'chg-1',
		user_id: USER,
		project_id: PROJECT,
		onto_event_id: 'evt-1',
		change_kind: 'updated',
		status: 'applied',
		before: {
			title: 'Client call',
			start_at: '2026-11-06T15:00:00.000Z',
			end_at: '2026-11-06T16:00:00.000Z',
			all_day: false,
			timezone: 'America/New_York',
			location: null
		},
		applied_event_updated_at: '2026-11-05T12:00:01.000Z'
	};

	it('puts the old values back and pushes them to Google', async () => {
		const admin = fakeDb({
			calendar_ingest_changes: (q) =>
				q.op === 'select' ? { data: change, error: null } : { data: null, error: null }
		});
		const user = fakeDb({
			onto_events: () => ({
				data: { id: 'evt-1', updated_at: '2026-11-05T12:00:01.000Z', deleted_at: null },
				error: null
			})
		});
		const w = writer();
		const outcome = await undoCalendarIngestChange({
			db: admin.db,
			userDb: user.db,
			writer: w,
			userId: USER,
			changeId: 'chg-1'
		});
		expect(outcome).toEqual({ ok: true });
		expect(w.updateEvent).toHaveBeenCalledWith(
			USER,
			expect.objectContaining({
				eventId: 'evt-1',
				startAt: '2026-11-06T15:00:00.000Z',
				endAt: '2026-11-06T16:00:00.000Z',
				syncToCalendar: true
			})
		);
		const mark = admin.log.find((q) => q.op === 'update');
		expect(mark?.payload.status).toBe('undone');
	});

	it('refuses when the event was edited after the change landed', async () => {
		const admin = fakeDb({
			calendar_ingest_changes: () => ({ data: change, error: null })
		});
		const user = fakeDb({
			onto_events: () => ({
				data: { id: 'evt-1', updated_at: '2026-11-05T14:00:00.000Z', deleted_at: null },
				error: null
			})
		});
		const w = writer();
		const outcome = await undoCalendarIngestChange({
			db: admin.db,
			userDb: user.db,
			writer: w,
			userId: USER,
			changeId: 'chg-1'
		});
		expect(outcome).toEqual({ ok: false, reason: 'changed_since' });
		expect(w.updateEvent).not.toHaveBeenCalled();
	});

	it('restores a deleted event before pushing it back', async () => {
		const admin = fakeDb({
			calendar_ingest_changes: (q) =>
				q.op === 'select'
					? { data: { ...change, change_kind: 'cancelled' }, error: null }
					: { data: null, error: null }
		});
		const user = fakeDb({
			onto_events: (q) =>
				q.op === 'select'
					? {
							data: {
								id: 'evt-1',
								updated_at: '2026-11-05T12:00:01.000Z',
								deleted_at: '2026-11-05T12:00:01.000Z'
							},
							error: null
						}
					: { data: null, error: null }
		});
		const w = writer();
		await undoCalendarIngestChange({
			db: admin.db,
			userDb: user.db,
			writer: w,
			userId: USER,
			changeId: 'chg-1'
		});
		expect(user.log.find((q) => q.op === 'update')?.payload).toEqual({ deleted_at: null });
		expect(w.updateEvent).toHaveBeenCalledWith(
			USER,
			expect.objectContaining({ syncToCalendar: true })
		);
	});
});

describe('helpers', () => {
	it('compares all-day events by calendar date', () => {
		const allDay = event({
			all_day: true,
			start_at: '2026-11-06T05:00:00.000Z',
			end_at: '2026-11-07T05:00:00.000Z',
			timezone: 'America/New_York'
		});
		expect(
			diffEvent(
				allDay,
				google({ start: { date: '2026-11-06' }, end: { date: '2026-11-07' } })
			)
		).toEqual([]);
		expect(
			diffEvent(
				allDay,
				google({ start: { date: '2026-11-09' }, end: { date: '2026-11-10' } })
			)
		).toEqual(['time']);
	});

	it('writes one plain headline per change', () => {
		expect(
			changeHeadline({
				kind: 'updated',
				fields: ['title'],
				before: { title: 'Call' },
				after: {
					title: 'Kickoff call',
					start_at: '2026-11-06T15:00:00.000Z',
					all_day: false,
					timezone: 'America/New_York'
				},
				timezone: null
			})
		).toBe('Renamed “Call” to “Kickoff call”');
		expect(plainDescription('a<br>b &amp; c')).toBe('a\nb & c');
	});
});
