// apps/mobile/src/lib/secure-storage.ts
import * as SecureStore from 'expo-secure-store';

import { createChunkedStorage } from '@/lib/chunked-storage';

/**
 * Keychain-backed key/value storage for small private state that must survive a restart:
 * the offline capture queue today. The Supabase session has its own instance in supabase.ts;
 * keys never overlap. Keys may contain only letters, digits, `.`, `-` and `_`.
 */
export const secureStorage = createChunkedStorage({
	getItem: (key) => SecureStore.getItemAsync(key),
	setItem: (key, value) => SecureStore.setItemAsync(key, value),
	removeItem: (key) => SecureStore.deleteItemAsync(key)
});
