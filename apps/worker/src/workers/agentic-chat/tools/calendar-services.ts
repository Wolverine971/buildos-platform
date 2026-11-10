import { createCalendarAgentAuthPort } from '@buildos/shared-agent-ops/google/google-agent-ports';
// apps/worker/src/workers/agentic-chat/tools/calendar-services.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { OAuth2Client } from 'google-auth-library';
import { type calendar_v3, google } from 'googleapis';
import {
	GoogleCalendarProjectResourceService,
	GoogleCalendarReadService,
	GoogleCalendarSourceService,
	GoogleCalendarTargetService,
	GoogleCalendarWriteService
} from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';

type CalendarApi = Pick<
	calendar_v3.Calendar,
	'events' | 'freebusy' | 'calendars' | 'calendarList' | 'acl'
>;

export type WorkerGoogleCalendarServicesOptions = {
	env?: Record<string, string | undefined>;
	now?: () => Date;
	clock?: () => number;
	agentAuth?: ReturnType<typeof createCalendarAgentAuthPort>;
	createCalendarApi?: (auth: unknown) => CalendarApi;
};

/**
 * Worker composition for the same source-aware provider services used by web.
 * Construct per execution, not in a global cache. Callers must take userId from
 * the trusted claim and authorize ontology/project targets before passing them
 * to these provider services; a service-role client does not provide that gate.
 *
 * Agent calls use only separately consented agent grants, even when the source
 * was originally connected using the shared-login or dedicated human client.
 */
export function createWorkerGoogleCalendarServices(
	admin: TypedSupabaseClient,
	options: WorkerGoogleCalendarServicesOptions = {}
) {
	const env = options.env ?? process.env;
	const credentials =
		options.agentAuth ?? createCalendarAgentAuthPort(admin, (name) => env[name]);
	const sources = new GoogleCalendarSourceService(admin);
	const targets = new GoogleCalendarTargetService(admin, { connectionService: sources });
	const createCalendarApi =
		options.createCalendarApi ??
		((auth: unknown) => google.calendar({ version: 'v3', auth: auth as OAuth2Client }));
	const providerOptions = {
		connectionService: credentials,
		targetService: targets,
		createCalendarApi,
		now: options.now
	};
	return {
		credentials,
		sources,
		targets,
		read: new GoogleCalendarReadService(admin, { ...providerOptions, clock: options.clock }),
		write: new GoogleCalendarWriteService(admin, providerOptions),
		projectResources: new GoogleCalendarProjectResourceService(admin, {
			...providerOptions,
			connectionService: {
				getAuthenticatedClient: (userId, connectionId) =>
					credentials.getAuthenticatedClient(userId, connectionId),
				registerCreatedSource: async (params) => {
					const source = await sources.registerCreatedSourceRow(params);
					return { id: source.id, summary: source.summary, colorId: source.color_id };
				}
			}
		})
	};
}
