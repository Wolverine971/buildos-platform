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
