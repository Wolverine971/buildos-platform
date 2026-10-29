// apps/mobile/src/lib/api.ts
import { createBuildOsClient } from '@buildos/api-client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { config } from '@/lib/env';
import { supabase } from '@/lib/supabase';

const appVersion = Constants.expoConfig?.version ?? '0.0.0';

/**
 * One typed client for the BuildOS API. It reads the current access token from the device
 * session before every call, so a refreshed token is picked up automatically. A 401 means the
 * session is gone (revoked or expired beyond refresh): sign out locally so the app returns to
 * the sign-in screen instead of looping.
 */
export const api = createBuildOsClient({
	baseUrl: config.apiBaseUrl,
	getAccessToken: async () => {
		const {
			data: { session }
		} = await supabase.auth.getSession();
		return session?.access_token ?? null;
	},
	defaultHeaders: {
		'X-BuildOS-Client': `${Platform.OS}/${appVersion}`
	},
	onUnauthorized: async () => {
		await supabase.auth.signOut({ scope: 'local' });
	}
});
