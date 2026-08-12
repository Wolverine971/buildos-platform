// packages/shared-types/src/google-calendar.types.ts
export type GoogleCalendarAccessRole =
	| 'freeBusyReader'
	| 'reader'
	| 'writerWithoutPrivateAccess'
	| 'writer'
	| 'owner';

/**
 * Source-qualified provider target shared by web and worker runtimes.
 * Provider calendar IDs are never sufficient identity without the connection and source IDs.
 */
export type GoogleCalendarTarget = {
	userId: string;
	connectionId: string;
	calendarSourceId: string;
	providerCalendarId: string;
	accessRole: GoogleCalendarAccessRole;
};

export type GoogleCalendarSourceEventIdentity = {
	calendarSourceId: string;
	providerEventId: string;
};
