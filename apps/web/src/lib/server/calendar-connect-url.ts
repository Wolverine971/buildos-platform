// apps/web/src/lib/server/calendar-connect-url.ts
// One entry point for "connect Google Calendar". Users on the multi-account runtime (the
// allowlist, or everyone under the all-users switch) always start a grant on the dedicated
// Calendar OAuth client; only users still on the legacy runtime use the shared sign-in client.
import { env as privateEnv } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';
import { GoogleCalendarConnectionService } from './google-calendar-connection.service';
import { isMultiCalendarUserAllowed } from './google-calendar-feature';

type EnvLike = Record<string, string | undefined>;

export async function createCalendarConnectUrl(params: {
	supabase: SupabaseClient<Database>;
	userId: string;
	origin: string;
	redirectPath: string;
	env?: EnvLike;
	createConnectionService?: () => Pick<GoogleCalendarConnectionService, 'createAuthorizationUrl'>;
}): Promise<string> {
	const redirectUri = `${params.origin}/auth/google/calendar-callback`;

	if (isMultiCalendarUserAllowed(params.userId, params.env ?? privateEnv)) {
		const service =
			params.createConnectionService?.() ??
			new GoogleCalendarConnectionService(createAdminSupabaseClient());
		return service.createAuthorizationUrl({
			userId: params.userId,
			redirectUri,
			redirectPath: params.redirectPath,
			connectionId: null
		});
	}

	return new GoogleOAuthService(params.supabase).generateCalendarAuthUrl(
		redirectUri,
		params.userId,
		{ redirectPath: params.redirectPath }
	);
}
