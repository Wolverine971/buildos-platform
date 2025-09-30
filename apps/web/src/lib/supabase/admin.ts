// apps/web/src/lib/supabase/admin.ts
import { createServiceClient } from '@buildos/supabase-client';

/**
 * Create an admin Supabase client for server-side operations
 * This bypasses Row Level Security and should only be used in secure server contexts
 *
 * Note: This uses the service role key from environment variables
 */
export function createAdminSupabaseClient() {
	return createServiceClient();
}
