// apps/web/src/lib/types/google-calendar-integration.ts
export type GoogleCalendarConnectionStatus = 'active' | 'reconnect_required' | 'disabled' | 'error';

export type { GoogleCalendarAccessRole } from '@buildos/shared-types';

import type { GoogleCalendarAccessRole } from '@buildos/shared-types';

export type GoogleCalendarSourceSummary = {
	id: string;
	providerCalendarId: string;
	summary: string;
	summaryOverride: string | null;
	timezone: string | null;
	colorId: string | null;
	backgroundColor: string | null;
	foregroundColor: string | null;
	accessRole: GoogleCalendarAccessRole;
	isPrimary: boolean;
	isHidden: boolean;
	isSelectedInGoogle: boolean;
	readEnabled: boolean;
	availabilityEnabled: boolean;
	analysisEnabled: boolean;
	syncEnabled: boolean;
	providerDeletedAt: string | null;
	lastSeenAt: string;
	isDefaultWriteSource: boolean;
};

export type GoogleCalendarConnectionSummary = {
	id: string;
	emailAddress: string;
	displayName: string | null;
	accountLabel: string;
	status: GoogleCalendarConnectionStatus;
	connectedAt: string;
	lastVerifiedAt: string | null;
	lastUsedAt: string | null;
	sources: GoogleCalendarSourceSummary[];
};

export type GoogleCalendarConnectionsPayload = {
	available: boolean;
	maxConnections: number;
	defaultWriteCalendarSourceId: string | null;
	connections: GoogleCalendarConnectionSummary[];
};

export type GoogleCalendarEventDateValue = {
	date?: string | null;
	dateTime?: string | null;
	timeZone?: string | null;
};

/**
 * Browser-safe subset of the aggregated Google event returned by the calendar API.
 * Keep this independent from `googleapis` so client bundles never pull in the server SDK.
 */
export type ConnectedGoogleCalendarEvent = {
	id?: string | null;
	status?: string | null;
	summary?: string | null;
	description?: string | null;
	location?: string | null;
	htmlLink?: string | null;
	created?: string | null;
	updated?: string | null;
	iCalUID?: string | null;
	start?: GoogleCalendarEventDateValue | null;
	end?: GoogleCalendarEventDateValue | null;
	organizer?: {
		displayName?: string | null;
		email?: string | null;
	} | null;
	calendarSourceId: string;
	contributingCalendarSourceIds: string[];
	connectionId: string;
	connectionLabel: string;
	calendarSummary: string;
	providerCalendarId: string;
	providerEventId: string;
};

export type ConnectedGoogleCalendarEventsPayload = {
	event_count: number;
	time_range: {
		start: string;
		end: string;
		timeZone?: string;
	};
	events: ConnectedGoogleCalendarEvent[];
	partial: boolean;
	warnings: Array<{
		code: 'CALENDAR_SOURCE_READ_FAILED' | 'CALENDAR_PARTIAL_RESULT';
		message: string;
		calendarSourceId: string;
		connectionId: string;
	}>;
	sourceStatuses: Array<{
		calendarSourceId: string;
		connectionId: string;
		providerCalendarId: string;
		status: 'success' | 'error' | 'timeout';
		itemCount: number;
	}>;
};
