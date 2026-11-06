// packages/shared-agent-ops/src/calendar/calendar-change-ingest.ts
//
// Tasker 154: project calendars sync both ways.
//
// The Google Calendar webhook hands us the events that changed on one watched calendar. When
// that calendar is a project calendar, this module applies the changes to BuildOS without
// asking, because they are low-risk and the user made them on purpose:
//
//   * an event BuildOS put on the calendar was moved, renamed, re-located, or deleted
//     -> the BuildOS event follows (and the task it schedules, via syncTaskFromEvent)
//   * someone added an event straight to the project calendar
//     -> it becomes an event in that project
//
// Every applied change is written to calendar_ingest_changes with its before/after values.
// The AI Inbox lists them under "Done for you"; Undo puts the old values back on both sides.
//
// Personal calendars are out of scope here: an event there has no project, and guessing one
// is not a low-risk change.

import type { calendar_v3 } from 'googleapis';
import type { Json } from '@buildos/shared-types';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { civilDateBoundaryInstant, isValidIanaTimezone } from '../dates/civil-date';
import type { OntoEventRow } from './onto-event-read.service';
import { googleAllDayDates, type OntoEventSyncService } from './onto-event-sync.service';

export type CalendarIngestOrigin = 'live' | 'sweep' | 'backfill';
export type CalendarIngestKind = 'updated' | 'cancelled' | 'added';
export type CalendarIngestField = 'title' | 'time' | 'location';

export type CalendarIngestEventWriter = Pick<
	OntoEventSyncService,
	'createEvent' | 'updateEvent' | 'deleteEvent'
>;

export const CALENDAR_INGEST_TABLE = 'calendar_ingest_changes';
/** How long an applied change stays in "Done for you" with its Undo. */
export const CALENDAR_INGEST_VISIBLE_DAYS = 7;

/** The event fields this module reads and writes; what before/after hold. */
export interface CalendarEventSnapshot {
	title: string;
	start_at: string;
	end_at: string | null;
	all_day: boolean;
	timezone: string | null;
	location: string | null;
	task_start_at?: string | null;
	task_due_at?: string | null;
}

export interface CalendarIngestParams {
	/** Service-role client: the webhook has no user session. */
	supabase: TypedSupabaseClient;
	writer: CalendarIngestEventWriter;
	userId: string;
	providerCalendarId: string;
	calendarSourceId: string | null;
	events: readonly calendar_v3.Schema$Event[];
	origin: CalendarIngestOrigin;
	/**
	 * True when `events` is a full listing (a resync after an expired sync token) instead of
	 * a delta. Edits to BuildOS events still apply; nothing is imported, because a full
	 * listing would import the calendar's whole history.
	 */
	fullListing?: boolean;
	userTimezone?: string | null;
	now?: () => Date;
	resolveActorId: (userId: string) => Promise<string>;
}

export interface CalendarIngestResult {
	applied: number;
	skipped: number;
	failed: number;
	/** The calendar is not a project calendar for this user; nothing was looked at. */
	notProjectCalendar: boolean;
}

type ProjectCalendarRow = {
	id: string;
	project_id: string;
	calendar_id: string;
	calendar_source_id: string | null;
};

type MappedEvent = {
	externalEventId: string;
	projectCalendarId: string;
	event: OntoEventRow;
};

type ChangeInsert = {
	user_id: string;
	project_id: string | null;
	onto_event_id: string | null;
	task_id: string | null;
	calendar_source_id: string | null;
	provider_calendar_id: string;
	external_event_id: string;
	change_kind: CalendarIngestKind;
	fields: CalendarIngestField[];
	origin: CalendarIngestOrigin;
	title: string;
	before: Json;
	after: Json;
	applied_event_updated_at: string | null;
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

export function eventTitle(event: Pick<calendar_v3.Schema$Event, 'summary'>): string {
	const title = (event.summary ?? '').trim();
	return title.length > 0 ? title : '(No title)';
}

/** Google event -> the BuildOS event fields. Null when it has no usable start. */
export function googleEventFields(
	event: calendar_v3.Schema$Event,
	timezone: string | null
): Omit<CalendarEventSnapshot, 'task_start_at' | 'task_due_at'> | null {
	const title = eventTitle(event);
	const location = (event.location ?? '').trim() || null;
	if (event.start?.date) {
		const tz = timezone ?? null;
		const startAt = civilDateBoundaryInstant(event.start.date, 'start', tz);
		const endAt = event.end?.date
			? civilDateBoundaryInstant(event.end.date, 'start', tz)
			: null;
		return { title, start_at: startAt, end_at: endAt, all_day: true, timezone: tz, location };
	}
	const start = event.start?.dateTime ? Date.parse(event.start.dateTime) : NaN;
	if (!Number.isFinite(start)) return null;
	const end = event.end?.dateTime ? Date.parse(event.end.dateTime) : NaN;
	return {
		title,
		start_at: new Date(start).toISOString(),
		end_at: Number.isFinite(end) ? new Date(end).toISOString() : null,
		all_day: false,
		timezone: event.start?.timeZone ?? timezone ?? null,
		location
	};
}

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return !a && !b;
	const left = Date.parse(a);
	const right = Date.parse(b);
	return Number.isFinite(left) && Number.isFinite(right) ? left === right : a === b;
}

/** Which fields of a BuildOS event differ from its Google copy. */
export function diffEvent(
	existing: Pick<
		OntoEventRow,
		'title' | 'start_at' | 'end_at' | 'all_day' | 'timezone' | 'location'
	>,
	google: calendar_v3.Schema$Event
): CalendarIngestField[] {
	const fields: CalendarIngestField[] = [];
	if ((existing.title ?? '').trim() !== eventTitle(google)) fields.push('title');
	if ((existing.location ?? '').trim() !== (google.location ?? '').trim())
		fields.push('location');

	const googleAllDay = Boolean(google.start?.date);
	if (googleAllDay !== Boolean(existing.all_day)) {
		fields.push('time');
	} else if (googleAllDay) {
		const dates = googleAllDayDates(existing);
		if (
			!dates ||
			dates.start !== google.start?.date ||
			(google.end?.date ? dates.end !== google.end.date : false)
		) {
			fields.push('time');
		}
	} else {
		const googleEnd = google.end?.dateTime ?? google.start?.dateTime ?? null;
		if (
			!sameInstant(existing.start_at, google.start?.dateTime) ||
			!sameInstant(existing.end_at ?? existing.start_at, googleEnd)
		) {
			fields.push('time');
		}
	}
	return fields;
}

export function formatWhen(
	snapshot: Pick<CalendarEventSnapshot, 'start_at' | 'all_day' | 'timezone'>,
	fallbackTimezone: string | null
): string {
	const zone = [snapshot.timezone, fallbackTimezone].find((tz) => isValidIanaTimezone(tz));
	const date = new Date(snapshot.start_at);
	if (Number.isNaN(date.getTime())) return 'a new time';
	const options: Intl.DateTimeFormatOptions = snapshot.all_day
		? { weekday: 'short', month: 'short', day: 'numeric', timeZone: zone ?? 'UTC' }
		: {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
				timeZone: zone ?? 'UTC'
			};
	return new Intl.DateTimeFormat('en-US', options).format(date);
}

/** The one line "Done for you" shows for a change. */
export function changeHeadline(params: {
	kind: CalendarIngestKind;
	fields?: readonly CalendarIngestField[];
	before?: Pick<CalendarEventSnapshot, 'title'> | null;
	after: Pick<CalendarEventSnapshot, 'title' | 'start_at' | 'all_day' | 'timezone'>;
	timezone: string | null;
}): string {
	const when = formatWhen(params.after, params.timezone);
	const name = `“${params.after.title}”`;
	if (params.kind === 'added') return `Added ${name} on ${when}`;
	if (params.kind === 'cancelled') return `Removed ${name} (deleted in Google Calendar)`;

	const fields = params.fields ?? [];
	const renamed = fields.includes('title') && params.before?.title;
	const moved = fields.includes('time');
	if (renamed && moved) {
		return `Renamed “${params.before!.title}” to ${name} and moved it to ${when}`;
	}
	if (renamed) return `Renamed “${params.before!.title}” to ${name}`;
	if (moved) return `Moved ${name} to ${when}`;
	return `Updated where ${name} happens`;
}

function snapshotOf(
	event: Pick<
		OntoEventRow,
		'title' | 'start_at' | 'end_at' | 'all_day' | 'timezone' | 'location'
	>,
	task?: { start_at: string | null; due_at: string | null } | null
): CalendarEventSnapshot {
	return {
		title: event.title,
		start_at: event.start_at,
		end_at: event.end_at,
		all_day: Boolean(event.all_day),
		timezone: event.timezone,
		location: event.location,
		...(task ? { task_start_at: task.start_at, task_due_at: task.due_at } : {})
	};
}

/**
 * Google descriptions may be HTML. BuildOS stores plain text, so tags are dropped and
 * line breaks kept. This is markup cleanup, not language classification.
 */
export function plainDescription(value: string | null | undefined): string | null {
	if (!value) return null;
	const text = value
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|li)>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return text.length > 0 ? text : null;
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

async function loadProjectCalendars(
	db: any,
	userId: string,
	providerCalendarId: string,
	calendarSourceId: string | null
): Promise<ProjectCalendarRow[]> {
	const { data, error } = await db
		.from('project_calendars')
		.select('id, project_id, calendar_id, calendar_source_id')
		.eq('user_id', userId)
		.eq('sync_enabled', true);
	if (error) throw new Error(`project calendar lookup failed: ${error.message}`);
	return ((data ?? []) as ProjectCalendarRow[]).filter(
		(row) =>
			row.calendar_id === providerCalendarId ||
			(calendarSourceId !== null && row.calendar_source_id === calendarSourceId)
	);
}

async function loadMappedEvents(
	db: any,
	projectCalendarIds: string[],
	externalEventIds: string[]
): Promise<Map<string, MappedEvent>> {
	const mapped = new Map<string, MappedEvent>();
	if (!externalEventIds.length) return mapped;
	const { data, error } = await db
		.from('onto_event_sync')
		.select('external_event_id, project_calendar_id, event:onto_events(*)')
		.in('project_calendar_id', projectCalendarIds)
		.eq('provider', 'google')
		.in('external_event_id', externalEventIds);
	if (error) throw new Error(`event mapping lookup failed: ${error.message}`);
	for (const row of (data ?? []) as Array<{
		external_event_id: string;
		project_calendar_id: string;
		event: OntoEventRow | null;
	}>) {
		if (!row.event) continue;
		mapped.set(row.external_event_id, {
			externalEventId: row.external_event_id,
			projectCalendarId: row.project_calendar_id,
			event: row.event
		});
	}
	return mapped;
}

async function readTaskDates(
	db: any,
	event: Pick<OntoEventRow, 'owner_entity_type' | 'owner_entity_id'>
): Promise<{ id: string; start_at: string | null; due_at: string | null } | null> {
	if (event.owner_entity_type !== 'task' || !event.owner_entity_id) return null;
	const { data } = await db
		.from('onto_tasks')
		.select('id, start_at, due_at')
		.eq('id', event.owner_entity_id)
		.maybeSingle();
	return (data as { id: string; start_at: string | null; due_at: string | null } | null) ?? null;
}

async function recordChange(db: any, row: ChangeInsert): Promise<void> {
	const { error } = await db.from(CALENDAR_INGEST_TABLE).insert(row);
	// The change itself already landed; a lost record only costs its Undo.
	if (error) console.warn('[CalendarIngest] Failed to record change:', error.message);
}

const ACTIVITY = { activityLog: { changeSource: 'api' as const } };

export async function ingestProjectCalendarChanges(
	params: CalendarIngestParams
): Promise<CalendarIngestResult> {
	const db = params.supabase as any;
	const now = params.now ?? (() => new Date());
	const result: CalendarIngestResult = {
		applied: 0,
		skipped: 0,
		failed: 0,
		notProjectCalendar: false
	};

	const projectCalendars = await loadProjectCalendars(
		db,
		params.userId,
		params.providerCalendarId,
		params.calendarSourceId
	);
	if (!projectCalendars.length) {
		result.notProjectCalendar = true;
		return result;
	}

	// Recurring instances (exceptions to a series) are not modelled as separate events.
	const events = params.events.filter(
		(event): event is calendar_v3.Schema$Event & { id: string } =>
			Boolean(event?.id) && !event.recurringEventId
	);
	result.skipped += params.events.length - events.length;
	if (!events.length) return result;

	const mapped = await loadMappedEvents(
		db,
		projectCalendars.map((row) => row.id),
		events.map((event) => event.id)
	);
	// One calendar linked to two projects: edits still apply, but a new event's project is a guess.
	const importTarget = projectCalendars.length === 1 ? projectCalendars[0]! : null;
	const userTimezone = params.userTimezone ?? null;
	let actorId: string | null = null;

	for (const google of events) {
		try {
			const hit = mapped.get(google.id);
			const outcome = hit
				? await applyToMappedEvent(params, db, google, hit, userTimezone)
				: await importNewEvent(
						params,
						db,
						google,
						importTarget,
						userTimezone,
						now,
						async () => {
							actorId ??= await params.resolveActorId(params.userId);
							return actorId;
						}
					);
			if (outcome === 'applied') result.applied += 1;
			else result.skipped += 1;
		} catch (error) {
			result.failed += 1;
			console.error('[CalendarIngest] Failed to apply a calendar change:', {
				externalEventId: google.id,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	return result;
}

async function applyToMappedEvent(
	params: CalendarIngestParams,
	db: any,
	google: calendar_v3.Schema$Event & { id: string },
	hit: MappedEvent,
	userTimezone: string | null
): Promise<'applied' | 'skipped'> {
	const existing = hit.event;
	if (existing.deleted_at) return 'skipped';

	// Last writer wins. A Google copy older than the BuildOS row is BuildOS's own push echoing
	// back, or a stale read that would undo a newer BuildOS edit.
	const googleUpdated = google.updated ? Date.parse(google.updated) : NaN;
	const buildosUpdated = existing.updated_at ? Date.parse(existing.updated_at) : NaN;
	if (
		Number.isFinite(googleUpdated) &&
		Number.isFinite(buildosUpdated) &&
		googleUpdated <= buildosUpdated
	) {
		return 'skipped';
	}

	const task = await readTaskDates(db, existing);
	const before = snapshotOf(existing, task);
	const base = {
		user_id: params.userId,
		project_id: existing.project_id,
		onto_event_id: existing.id,
		task_id: task?.id ?? null,
		calendar_source_id: params.calendarSourceId,
		provider_calendar_id: params.providerCalendarId,
		external_event_id: google.id,
		origin: params.origin
	};

	if (google.status === 'cancelled') {
		const deleted = await params.writer.deleteEvent(params.userId, {
			eventId: existing.id,
			syncToCalendar: false,
			...ACTIVITY
		});
		await recordChange(db, {
			...base,
			change_kind: 'cancelled',
			fields: [],
			title: changeHeadline({ kind: 'cancelled', after: before, timezone: userTimezone }),
			before: before as unknown as Json,
			after: {},
			applied_event_updated_at: deleted.updated_at ?? null
		});
		return 'applied';
	}

	const fields = diffEvent(existing, google);
	if (!fields.length) return 'skipped';
	const next = googleEventFields(google, existing.timezone ?? userTimezone);
	if (!next) return 'skipped';

	const updated = await params.writer.updateEvent(params.userId, {
		eventId: existing.id,
		...(fields.includes('title') ? { title: next.title } : {}),
		...(fields.includes('location') ? { location: next.location } : {}),
		...(fields.includes('time')
			? next.all_day
				? {
						allDay: true,
						// Date-only values: the service anchors them in the event's timezone.
						startAt: google.start!.date!,
						endAt: google.end?.date ?? null
					}
				: { allDay: false, startAt: next.start_at, endAt: next.end_at }
			: {}),
		syncToCalendar: false,
		...ACTIVITY
	});
	const taskAfter = task ? await readTaskDates(db, existing) : null;
	const after = snapshotOf(updated, taskAfter);
	await recordChange(db, {
		...base,
		change_kind: 'updated',
		fields,
		title: changeHeadline({ kind: 'updated', fields, before, after, timezone: userTimezone }),
		before: before as unknown as Json,
		after: after as unknown as Json,
		applied_event_updated_at: updated.updated_at ?? null
	});
	return 'applied';
}

async function importNewEvent(
	params: CalendarIngestParams,
	db: any,
	google: calendar_v3.Schema$Event & { id: string },
	target: ProjectCalendarRow | null,
	userTimezone: string | null,
	now: () => Date,
	actorId: () => Promise<string>
): Promise<'applied' | 'skipped'> {
	if (!target || params.fullListing) return 'skipped';
	if (google.status === 'cancelled') return 'skipped';
	const fields = googleEventFields(google, userTimezone);
	if (!fields) return 'skipped';
	if (params.origin === 'backfill') {
		const end = Date.parse(fields.end_at ?? fields.start_at);
		if (Number.isFinite(end) && end < now().getTime()) return 'skipped';
	}

	const mapping = {
		user_id: params.userId,
		project_calendar_id: target.id,
		calendar_source_id: params.calendarSourceId,
		external_calendar_id: params.providerCalendarId,
		external_event_id: google.id,
		provider: 'google',
		sync_status: 'synced',
		last_synced_at: now().toISOString()
	};

	// BuildOS may have just pushed this event and not yet saved its mapping, or the user made
	// the same event in both places. Same title + start in the project: adopt it, add nothing.
	const { data: twins, error: twinError } = await db
		.from('onto_events')
		.select('id, onto_event_sync(id, user_id)')
		.eq('project_id', target.project_id)
		.eq('title', fields.title)
		.eq('start_at', fields.start_at)
		.is('deleted_at', null)
		.limit(1);
	if (twinError) throw new Error(`duplicate check failed: ${twinError.message}`);
	const twin = (twins ?? [])[0] as
		| { id: string; onto_event_sync?: Array<{ user_id: string | null }> }
		| undefined;
	if (twin) {
		const alreadyMapped = (twin.onto_event_sync ?? []).some(
			(row) => row.user_id === params.userId
		);
		if (!alreadyMapped) {
			await db.from('onto_event_sync').insert({ ...mapping, event_id: twin.id });
		}
		return 'skipped';
	}

	const recurrence = google.recurrence?.length
		? ({ provider_rules: google.recurrence } as Json)
		: undefined;
	const { event } = await params.writer.createEvent(params.userId, {
		projectId: target.project_id,
		owner: { type: 'project', id: target.project_id },
		title: fields.title,
		...(fields.all_day
			? { allDay: true, startAt: google.start!.date!, endAt: google.end?.date ?? null }
			: { allDay: false, startAt: fields.start_at, endAt: fields.end_at }),
		timezone: fields.timezone,
		location: fields.location,
		description: plainDescription(google.description),
		recurrence,
		externalLink: google.htmlLink ?? null,
		createdBy: await actorId(),
		syncToCalendar: false,
		...ACTIVITY
	});

	const { error: mapError } = await db
		.from('onto_event_sync')
		.insert({ ...mapping, event_id: event.id });
	if (mapError) {
		// A concurrent notification imported it first (unique mapping). Drop our copy.
		await db.from('onto_events').update({ deleted_at: now().toISOString() }).eq('id', event.id);
		return 'skipped';
	}

	const after = snapshotOf(event);
	await recordChange(db, {
		user_id: params.userId,
		project_id: target.project_id,
		onto_event_id: event.id,
		task_id: null,
		calendar_source_id: params.calendarSourceId,
		provider_calendar_id: params.providerCalendarId,
		external_event_id: google.id,
		change_kind: 'added',
		fields: [],
		origin: params.origin,
		title: changeHeadline({ kind: 'added', after, timezone: userTimezone }),
		before: {},
		after: after as unknown as Json,
		applied_event_updated_at: event.updated_at ?? null
	});
	return 'applied';
}

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

export type CalendarUndoOutcome =
	| { ok: true }
	| { ok: false; reason: 'not_found' | 'already_undone' | 'changed_since' | 'event_missing' };

export interface CalendarIngestChangeRow {
	id: string;
	user_id: string;
	project_id: string | null;
	onto_event_id: string | null;
	change_kind: CalendarIngestKind;
	status: 'applied' | 'undone';
	before: CalendarEventSnapshot | Record<string, never>;
	applied_event_updated_at: string | null;
}

/**
 * Undo one applied change. `db` reads and writes the change row (service role: users can only
 * read theirs). `userDb` and `writer` act as the user, so project access still applies, and
 * the writer pushes the old values back to Google.
 */
export async function undoCalendarIngestChange(params: {
	db: TypedSupabaseClient;
	userDb: TypedSupabaseClient;
	writer: CalendarIngestEventWriter;
	userId: string;
	changeId: string;
	now?: () => Date;
}): Promise<CalendarUndoOutcome> {
	const db = params.db as any;
	const now = params.now ?? (() => new Date());
	const { data, error } = await db
		.from(CALENDAR_INGEST_TABLE)
		.select(
			'id, user_id, project_id, onto_event_id, change_kind, status, before, applied_event_updated_at'
		)
		.eq('id', params.changeId)
		.eq('user_id', params.userId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	const change = data as CalendarIngestChangeRow | null;
	if (!change) return { ok: false, reason: 'not_found' };
	if (change.status === 'undone') return { ok: false, reason: 'already_undone' };
	if (!change.onto_event_id) return { ok: false, reason: 'event_missing' };

	const userDb = params.userDb as any;
	const { data: eventRow } = await userDb
		.from('onto_events')
		.select('id, updated_at, deleted_at')
		.eq('id', change.onto_event_id)
		.maybeSingle();
	const event = eventRow as {
		id: string;
		updated_at: string | null;
		deleted_at: string | null;
	} | null;
	if (!event) return { ok: false, reason: 'event_missing' };
	// Someone edited the event after this change landed; putting old values back would clobber it.
	if (
		change.applied_event_updated_at &&
		event.updated_at &&
		Date.parse(event.updated_at) > Date.parse(change.applied_event_updated_at) + 1000
	) {
		return { ok: false, reason: 'changed_since' };
	}

	const before = change.before as CalendarEventSnapshot;
	if (change.change_kind === 'added') {
		// Leave the Google event alone; its mapping stays so it is not imported again.
		if (!event.deleted_at) {
			await params.writer.deleteEvent(params.userId, {
				eventId: event.id,
				syncToCalendar: false,
				...ACTIVITY
			});
		}
	} else {
		if (change.change_kind === 'cancelled') {
			const { error: restoreError } = await userDb
				.from('onto_events')
				.update({ deleted_at: null })
				.eq('id', event.id);
			if (restoreError) throw new Error(restoreError.message);
		}
		// Old values back in BuildOS; the push restores Google too (status confirmed).
		await params.writer.updateEvent(params.userId, {
			eventId: event.id,
			title: before.title,
			location: before.location,
			allDay: before.all_day,
			startAt: before.start_at,
			endAt: before.end_at,
			syncToCalendar: true,
			...ACTIVITY
		});
	}

	const { error: markError } = await db
		.from(CALENDAR_INGEST_TABLE)
		.update({ status: 'undone', undone_at: now().toISOString() })
		.eq('id', change.id);
	if (markError) throw new Error(markError.message);
	return { ok: true };
}
