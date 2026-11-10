// apps/web/src/lib/server/google-calendar-project-resource.service.ts
import { createWebCalendarAgentAuthPort } from './google-agent-oauth';
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
		options: Partial<GoogleCalendarProjectResourceServiceOptions> & {
			agentAccess?: boolean;
		} = {}
	) {
		const humanConnection = new GoogleCalendarConnectionService(admin);
		super(admin, {
			...options,
			connectionService:
				options.connectionService ??
				(options.agentAccess
					? {
							getAuthenticatedClient:
								createWebCalendarAgentAuthPort().getAuthenticatedClient,
							registerCreatedSource:
								humanConnection.registerCreatedSource.bind(humanConnection)
						}
					: humanConnection)
		});
	}
}
