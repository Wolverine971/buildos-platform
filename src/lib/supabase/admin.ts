// src/lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js';
import { PRIVATE_SUPABASE_SERVICE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { Database } from '$lib/database.types';

/**
 * Create an admin Supabase client for server-side operations
 * This bypasses Row Level Security and should only be used in secure server contexts
 */
export function createAdminSupabaseClient() {
	if (!PRIVATE_SUPABASE_SERVICE_KEY) {
		throw new Error('PRIVATE_SUPABASE_SERVICE_KEY is not set');
	}

	return createClient<Database>(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}
