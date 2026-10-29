// apps/web/src/routes/api/push/devices/+server.ts
/**
 * Native push device registration (the iPhone/Android app).
 *
 * A device registers its Expo push token here after sign-in. The row lands in
 * `push_subscriptions` next to browser subscriptions (provider 'expo' instead of 'web_push'),
 * so `emit_notification_event` fans the daily brief and every other event out to the phone
 * with no new preferences, and the worker delivers through Expo.
 *
 * Requests arrive bearer-authenticated; the hook turns the token into `locals.supabase` and
 * `safeGetSession()` like any cookie session.
 */

import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { formatZodIssues } from '$lib/utils/request-validation';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { saveNotificationPreferences } from '$lib/server/notification-preferences';

/**
 * Structural check on a credential format: Expo push tokens look like
 * `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]` (older SDKs emitted `ExpoPushToken[...]`).
 * Mirrors the worker's check in expoPushAdapter.ts.
 */
const EXPO_PUSH_TOKEN_SHAPE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

const expoPushTokenSchema = z
	.string()
	.min(10)
	.max(200)
	.regex(EXPO_PUSH_TOKEN_SHAPE, 'Expected an Expo push token');

const registerDeviceSchema = z.object({
	token: expoPushTokenSchema,
	platform: z.enum(['ios', 'android']),
	device_name: z.string().trim().min(1).max(120).optional(),
	app_version: z.string().trim().min(1).max(40).optional()
});

const removeDeviceSchema = z.object({
	token: z.string().min(1).max(200)
});

const DEVICE_COLUMNS =
	'id, provider, platform, device_name, app_version, created_at, last_used_at, endpoint';

async function parseBody<TSchema extends z.ZodTypeAny>(
	request: Request,
	schema: TSchema
): Promise<{ ok: true; data: z.infer<TSchema> } | { ok: false; response: Response }> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return { ok: false, response: ApiResponse.badRequest('Invalid JSON body') };
	}

	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			response: ApiResponse.error(
				'Invalid device registration',
				HttpStatus.BAD_REQUEST,
				ErrorCode.INVALID_FIELD,
				{ issues: formatZodIssues(parsed.error) }
			)
		};
	}

	return { ok: true, data: parsed.data };
}

/** Last characters of a token so a settings screen can tell devices apart without the secret. */
function endpointHint(endpoint: string): string {
	return endpoint.replace(/\]$/, '').slice(-6);
}

/**
 * POST: register (or re-register) this install's Expo push token for the signed-in user.
 *
 * Body: `{ token, platform: 'ios' | 'android', device_name?, app_version? }`
 * Response 201: `{ subscription_id }`
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const parsed = await parseBody(request, registerDeviceSchema);
	if (!parsed.ok) return parsed.response;
	const { token, platform, device_name, app_version } = parsed.data;

	try {
		// Admin client on purpose: a push token is unique per app install, and the same phone
		// may previously have been signed in as another account, whose row RLS would hide from
		// this user. Presenting the token proves possession of the install, so the row is
		// reassigned to the verified `user.id` from safeGetSession(); every written value is
		// validated above or fixed here.
		const admin = createAdminSupabaseClient();
		const { data, error } = await admin
			.from('push_subscriptions')
			.upsert(
				{
					user_id: user.id,
					endpoint: token,
					provider: 'expo',
					platform,
					device_name: device_name ?? null,
					app_version: app_version ?? null,
					p256dh_key: null,
					auth_key: null,
					is_active: true,
					user_agent: request.headers.get('user-agent')?.slice(0, 512) ?? null,
					last_used_at: null
				},
				{ onConflict: 'endpoint' }
			)
			.select('id')
			.single();

		if (error) throw error;

		// Same rows a browser subscribe writes: push_enabled on the user's preferences and the
		// brief.completed / brief.failed subscriptions (existing opt-outs are preserved).
		await saveNotificationPreferences(supabase, user.id, { push_enabled: true });

		return ApiResponse.created({ subscription_id: data.id });
	} catch (error) {
		console.error('Error registering push device:', error);
		return ApiResponse.internalError(error, 'Failed to register device');
	}
};

/**
 * DELETE: stop sending to this install (sign-out, or the user turned push off on the phone).
 *
 * Body: `{ token }`
 * Response 200: `{ removed: boolean }`
 */
export const DELETE: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const parsed = await parseBody(request, removeDeviceSchema);
	if (!parsed.ok) return parsed.response;

	try {
		const { data, error } = await supabase
			.from('push_subscriptions')
			.update({ is_active: false })
			.eq('endpoint', parsed.data.token)
			.eq('user_id', user.id)
			.select('id');

		if (error) throw error;

		return ApiResponse.success({ removed: (data?.length ?? 0) > 0 });
	} catch (error) {
		console.error('Error removing push device:', error);
		return ApiResponse.internalError(error, 'Failed to remove device');
	}
};

/**
 * GET: the signed-in user's active push devices (phones and browsers) for a settings screen.
 * Tokens and keys never leave the server; `endpoint_hint` is enough to tell devices apart.
 *
 * Response 200: `{ devices: [{ id, provider, platform, device_name, app_version, created_at,
 * last_used_at, endpoint_hint }] }`
 */
export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const { data, error } = await supabase
			.from('push_subscriptions')
			.select(DEVICE_COLUMNS)
			.eq('user_id', user.id)
			.eq('is_active', true)
			.order('created_at', { ascending: false });

		if (error) throw error;

		const devices = (data ?? []).map(({ endpoint, ...row }) => ({
			...row,
			endpoint_hint: endpointHint(endpoint)
		}));

		return ApiResponse.success({ devices });
	} catch (error) {
		console.error('Error listing push devices:', error);
		return ApiResponse.internalError(error, 'Failed to list devices');
	}
};
