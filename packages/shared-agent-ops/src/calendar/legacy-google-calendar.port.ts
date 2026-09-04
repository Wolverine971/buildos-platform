// packages/shared-agent-ops/src/calendar/legacy-google-calendar.port.ts
// Structural ports for the legacy singleton-OAuth Google Calendar client that
// still lives in apps/web (`$lib/services/calendar-service`). That client depends
// on SvelteKit `$env` and on `user_calendar_tokens`, so it cannot move; the
// shared write services accept it through these interfaces instead.
//
// The worker never supplies a legacy client: it always runs source-aware, which
// routes every mutation through GoogleCalendarWriteService / the project
// resource service instead.

export type LegacyCalendarSendUpdatesOption = 'all' | 'externalOnly' | 'none';

/** Subset of the legacy CalendarService used by the ontology event write path. */
export interface LegacyOntoEventCalendarClient {
	createStandaloneEvent(
		userId: string,
		params: {
			summary: string;
			description?: string;
			start: Date;
			end: Date;
			timeZone?: string;
			colorId?: string;
			calendar_id?: string;
		}
	): Promise<{ eventId: string; eventLink?: string }>;
	updateCalendarEvent(
		userId: string,
		params: {
			event_id: string;
			calendar_id?: string;
			start_time?: string;
			end_time?: string;
			summary?: string;
			description?: string;
			location?: string;
			timeZone?: string;
		}
	): Promise<unknown>;
	deleteCalendarEvent(
		userId: string,
		params: {
			event_id: string;
			calendar_id?: string;
			send_notifications?: boolean;
			sendUpdates?: LegacyCalendarSendUpdatesOption;
		}
	): Promise<unknown>;
}

/** Subset of the legacy CalendarService used by the project-calendar write path. */
export interface LegacyProjectCalendarClient {
	listUserCalendars(userId: string): Promise<{
		success: boolean;
		calendars?: Array<{
			id: string;
			summary: string;
			description?: string;
			colorId?: string;
			primary?: boolean;
			accessRole?: string;
		}>;
		error?: string;
	}>;
	createProjectCalendar(
		userId: string,
		options: {
			name: string;
			description?: string;
			colorId?: string;
			timeZone?: string;
		}
	): Promise<{ success: boolean; calendarId?: string; error?: string }>;
	deleteProjectCalendar(
		userId: string,
		calendarId: string
	): Promise<{ success: boolean; error?: string }>;
	updateCalendarProperties(
		userId: string,
		calendarId: string,
		updates: {
			summary?: string;
			description?: string;
			colorId?: string;
			timeZone?: string;
		}
	): Promise<{ success: boolean; error?: string }>;
}
