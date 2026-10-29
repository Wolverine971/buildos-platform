// apps/mobile/src/lib/env.ts
import { readMobileConfig } from '@/lib/config';

// Explicit references let Expo inline exactly these three public values at build time.
export const config = readMobileConfig({
	supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
	supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
	apiBaseUrl: process.env.EXPO_PUBLIC_API_URL
});
