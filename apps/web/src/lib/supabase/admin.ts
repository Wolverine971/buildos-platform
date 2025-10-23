// apps/web/src/lib/supabase/admin.ts
import { createCustomClient } from '@buildos/supabase-client';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { PRIVATE_SUPABASE_SERVICE_KEY } from '$env/static/private';

/**
 * Create an admin Supabase client for server-side operations
 *
 * ⚠️ SECURITY WARNING: This client bypasses Row Level Security (RLS) and should ONLY
 * be used in secure server-side contexts where the operation is trusted and controlled.
 *
 * **Use this for:**
 * - Webhook handlers (Stripe, Twilio webhooks, etc.)
 * - Cron jobs and scheduled tasks
 * - Admin-only operations that need system-wide access
 * - Background jobs that process data on behalf of users
 *
 * **NEVER use this for:**
 * - User-facing API endpoints that receive user input
 * - Client-side code
 * - Any context where user input could influence the query
 * - Operations that should respect per-user RLS policies
 *
 * **Always validate and sanitize inputs** before using this client, even though it
 * bypasses RLS. Defense in depth is crucial.
 *
 * @returns TypedSupabaseClient with service role key (bypasses RLS)
 *
 * @example
 * ```typescript
 * // ✅ Good: Stripe webhook handler with verified signature
 * export const POST: RequestHandler = async ({ request }) => {
 *   const event = StripeService.verifyWebhookSignature(...); // Verified!
 *   const supabase = createAdminSupabaseClient();
 *   await supabase.from('subscriptions').update({ status: 'active' });
 * };
 *
 * // ❌ Bad: User input could control the query
 * export const POST: RequestHandler = async ({ request }) => {
 *   const { userId } = await request.json(); // Unverified user input!
 *   const supabase = createAdminSupabaseClient();
 *   await supabase.from('users').update({ role: 'admin' }); // SECURITY RISK!
 * };
 * ```
 *
 * This uses the PRIVATE_SUPABASE_SERVICE_KEY environment variable internally.
 */
export function createAdminSupabaseClient() {
	// In SvelteKit, we need to import environment variables from $env modules
	// and pass them explicitly to the client constructor
	if (!PUBLIC_SUPABASE_URL || !PRIVATE_SUPABASE_SERVICE_KEY) {
		throw new Error('Missing Supabase environment variables');
	}

	return createCustomClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY);
}
