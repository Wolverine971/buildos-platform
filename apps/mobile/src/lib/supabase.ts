// apps/mobile/src/lib/supabase.ts
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import type { Database } from '@buildos/shared-types';

import { createChunkedStorage } from '@/lib/chunked-storage';
import { config } from '@/lib/env';

/**
 * The phone's own Supabase session: same project, same accounts, same RLS as the web. The
 * session lives in the iOS keychain (chunked, see chunked-storage.ts); the device refreshes
 * it and sends the current access token to the BuildOS API as a bearer header (lib/api.ts).
 * Screens never query tables directly; everything goes through the API.
 */
const storage = createChunkedStorage({
	getItem: (key) => SecureStore.getItemAsync(key),
	setItem: (key, value) => SecureStore.setItemAsync(key, value),
	removeItem: (key) => SecureStore.deleteItemAsync(key)
});

export const supabase = createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
	auth: {
		storage,
		autoRefreshToken: true,
		persistSession: true,
		detectSessionInUrl: false
	}
});
