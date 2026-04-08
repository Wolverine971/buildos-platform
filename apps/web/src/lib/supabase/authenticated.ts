// apps/web/src/lib/supabase/authenticated.ts
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { Database } from '@buildos/shared-types';
import { createClient } from '@buildos/supabase-client';

export function createAuthenticatedSupabaseClient(accessToken: string) {
	if (!accessToken) {
		throw new Error('Missing access token for authenticated Supabase client');
	}

	return createClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false
		},
		accessToken: async () => accessToken
	});
}
