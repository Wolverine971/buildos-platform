// apps/mobile/src/lib/api.ts
import { BuildOsApiError, createBuildOsClient } from '@buildos/api-client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { devServerHint } from '@/lib/config';
import { config } from '@/lib/env';
import { supabase } from '@/lib/supabase';

const serverHint = devServerHint(config.apiBaseUrl);

/**
 * What to say when a request never reached BuildOS. Pointed at a laptop dev server, that
 * almost always means the server isn't running, so say that instead of "No connection".
 */
export function unreachableMessage(offline: string): string {
	return serverHint ?? offline;
}

const appVersion = Constants.expoConfig?.version ?? '0.0.0';
const defaultHeaders = { 'X-BuildOS-Client': `${Platform.OS}/${appVersion}` };

async function currentSession() {
	const {
		data: { session }
	} = await supabase.auth.getSession();
	return session;
}

/**
 * One typed client for the BuildOS API. It reads the current access token from the device
 * session before every call, so a refreshed token is picked up automatically. Supabase owns
 * session invalidation: an API 401 can also mean the backend cannot accept mobile bearer
 * tokens yet. Keep the session and surface that request error instead of signing the user out.
 */
export const api = createBuildOsClient({
	baseUrl: config.apiBaseUrl,
	getAccessToken: async () => (await currentSession())?.access_token ?? null,
	defaultHeaders
});

/**
 * A client that only ever speaks for one account, for work that outlives a screen (the
 * capture queue). With no session, or a different person signed in, a call fails as signed
 * out before anything is sent: a capture can never land in someone else's Workspace, and an
 * upload never goes out without a token (the server would refuse it as cross-site, not 401).
 */
export function createUserApi(userId: string) {
	return createBuildOsClient({
		baseUrl: config.apiBaseUrl,
		getAccessToken: async () => {
			const session = await currentSession();
			if (!session?.access_token || session.user.id !== userId) {
				throw new BuildOsApiError({
					message: 'Signed out',
					status: 401,
					code: 'UNAUTHORIZED'
				});
			}
			return session.access_token;
		},
		defaultHeaders
	});
}
