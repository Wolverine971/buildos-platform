// apps/web/src/lib/server/google-calendar-read.service.ts
import { createWebCalendarAgentAuthPort } from './google-agent-oauth';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import {
	GoogleCalendarReadService as SharedGoogleCalendarReadService,
	type GoogleCalendarReadServiceOptions
} from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';
import { GoogleCalendarConnectionService } from './google-calendar-connection.service';
export {
	type GoogleCalendarReadWarning,
	type GoogleCalendarSourceReadStatus,
	type AggregatedGoogleCalendarEvent,
	type AggregatedGoogleCalendarEventsResponse,
	type GoogleCalendarBusyInterval,
	type AggregatedGoogleCalendarFreeBusyResponse
} from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';

// Preserve web defaults while the worker supplies its own OAuth configuration.
export class GoogleCalendarReadService extends SharedGoogleCalendarReadService {
	constructor(
		admin: TypedSupabaseClient,
		options: Partial<GoogleCalendarReadServiceOptions> & { agentAccess?: boolean } = {}
	) {
		super(admin, {
			...options,
			connectionService:
				options.connectionService ??
				(options.agentAccess
					? createWebCalendarAgentAuthPort()
					: new GoogleCalendarConnectionService(admin))
		});
	}
}
