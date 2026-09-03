// apps/web/src/lib/server/google-calendar-project-resource.service.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import {
	GoogleCalendarProjectResourceService as SharedGoogleCalendarProjectResourceService,
	type GoogleCalendarProjectResourceServiceOptions
} from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';
import { GoogleCalendarConnectionService } from './google-calendar-connection.service';
export { type GoogleCalendarProjectResource } from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';

// Preserve web defaults while the worker supplies its own OAuth configuration.
export class GoogleCalendarProjectResourceService extends SharedGoogleCalendarProjectResourceService {
	constructor(
		admin: TypedSupabaseClient,
		options: Partial<GoogleCalendarProjectResourceServiceOptions> = {}
	) {
		super(admin, {
			...options,
			connectionService:
				options.connectionService ?? new GoogleCalendarConnectionService(admin)
		});
	}
}
