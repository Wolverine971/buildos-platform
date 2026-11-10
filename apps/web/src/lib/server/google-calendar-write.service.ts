// apps/web/src/lib/server/google-calendar-write.service.ts
import { createWebCalendarAgentAuthPort } from './google-agent-oauth';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import {
	GoogleCalendarWriteService as SharedGoogleCalendarWriteService,
	type GoogleCalendarWriteServiceOptions
} from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';
import { GoogleCalendarConnectionService } from './google-calendar-connection.service';
export {
	GoogleCalendarWriteError,
	type GoogleCalendarCreateSelector,
	type GoogleCalendarMutationSelector,
	type GoogleCalendarWriteResult,
	type GoogleCalendarTaskTracking
} from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';

// Preserve web defaults while the worker supplies its own OAuth configuration.
export class GoogleCalendarWriteService extends SharedGoogleCalendarWriteService {
	constructor(
		admin: TypedSupabaseClient,
		options: Partial<GoogleCalendarWriteServiceOptions> & { agentAccess?: boolean } = {}
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
