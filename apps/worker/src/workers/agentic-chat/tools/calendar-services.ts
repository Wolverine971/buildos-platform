// apps/worker/src/workers/agentic-chat/tools/calendar-services.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { OAuth2Client } from 'google-auth-library';
import { type calendar_v3, google } from 'googleapis';
import {
	type CalendarCredentialOAuthClient,
	GoogleCalendarConnectionError,
	GoogleCalendarCredentialService,
	GoogleCalendarProjectResourceService,
	GoogleCalendarReadService,
	GoogleCalendarSourceService,
	GoogleCalendarTargetService,
	GoogleCalendarWriteService
} from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';
import type { GoogleCalendarOauthClientKind } from '@buildos/shared-agent-ops/calendar/google-calendar-token-crypto';

type CalendarApi = Pick<
	calendar_v3.Calendar,
	'events' | 'freebusy' | 'calendars' | 'calendarList' | 'acl'
>;
type OAuthCredentials = { clientId: string; clientSecret: string };

export type WorkerGoogleCalendarServicesOptions = {
	env?: Record<string, string | undefined>;
	now?: () => Date;
	clock?: () => number;
	createOAuthClient?: (
		kind: GoogleCalendarOauthClientKind,
		credentials: OAuthCredentials
	) => CalendarCredentialOAuthClient;
	createCalendarApi?: (auth: unknown) => CalendarApi;
};

/**
 * Worker composition for the same source-aware provider services used by web.
 * Construct per execution, not in a global cache. Callers must take userId from
 * the trusted claim and authorize ontology/project targets before passing them
 * to these provider services; a service-role client does not provide that gate.
 *
 * This does not enable tools or change admission. The old singleton-token port
 * must still refuse source-aware users until the seven tool adapters are ready.
 */
export function createWorkerGoogleCalendarServices(
	admin: TypedSupabaseClient,
	options: WorkerGoogleCalendarServicesOptions = {}
) {
	const env = options.env ?? process.env;
	const getOAuthClientCredentials = (kind: GoogleCalendarOauthClientKind): OAuthCredentials => {
		// A connection retains the OAuth client that minted its grant. Never fall
		// back from dedicated Calendar credentials to the shared-login client.
		const prefix = kind === 'google_calendar' ? 'PRIVATE_GOOGLE_CALENDAR' : 'PRIVATE_GOOGLE';
		const clientId = env[`${prefix}_CLIENT_ID`]?.trim();
		const clientSecret = env[`${prefix}_CLIENT_SECRET`]?.trim();
		if (!clientId || !clientSecret) {
			throw new GoogleCalendarConnectionError(
				'not_configured',
				`OAuth credentials are unavailable for Calendar client kind ${kind}`
			);
		}
		return { clientId, clientSecret };
	};
	const credentials = new GoogleCalendarCredentialService(admin, {
		getOAuthClientCredentials,
		createOAuthClient: (kind) => {
			const config = getOAuthClientCredentials(kind);
			return options.createOAuthClient
				? options.createOAuthClient(kind, config)
				: new OAuth2Client(config.clientId, config.clientSecret);
		},
		resolveTokenKey: (version) => env[`PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V${version}`],
		now: options.now
	});
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
