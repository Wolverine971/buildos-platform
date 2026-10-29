// apps/web/src/lib/server/auth-handoff.service.ts
import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

/**
 * Session handoff: native app → in-app browser.
 *
 * The iPhone app holds a bearer session. When it opens a web page (settings, billing,
 * integrations, account deletion) it asks for a one-time code, then opens
 * `/auth/handoff?code=…`. That route consumes the code and mints a cookie session for the same
 * user on the server, so the page is already signed in. The magic-link token used to mint the
 * cookie session never leaves the server; the only thing in a URL is a 60-second, single-use
 * code.
 *
 * Codes are 32 random bytes (base64url). Only their sha256 is stored, so a database read
 * cannot replay one.
 */

export const HANDOFF_CODE_TTL_SECONDS = 60;
export const HANDOFF_ROUTE = '/auth/handoff';

type AdminClient = SupabaseClient<Database>;
type UserClient = Pick<SupabaseClient<Database>, 'auth'>;

export function hashHandoffCode(code: string): string {
	return createHash('sha256').update(code).digest('hex');
}

export function isHandoffCodeShaped(code: string | null | undefined): code is string {
	// 32 bytes base64url = 43 characters; a structural check on a credential, not on prose.
	return typeof code === 'string' && /^[A-Za-z0-9_-]{43}$/.test(code);
}

export async function createHandoffCode(
	admin: AdminClient,
	input: {
		userId: string;
		nextPath: string | null;
		ip?: string | null;
		userAgent?: string | null;
		now?: Date;
	}
): Promise<{ code: string; expiresAt: string }> {
	const now = input.now ?? new Date();
	const code = randomBytes(32).toString('base64url');
	const expiresAt = new Date(now.getTime() + HANDOFF_CODE_TTL_SECONDS * 1000).toISOString();

	// One live code per user: a new request retires anything older, used or not. This also
	// bounds the table without a cleanup job.
	const { error: pruneError } = await admin
		.from('auth_handoff_codes')
		.delete()
		.eq('user_id', input.userId);
	if (pruneError) {
		throw new Error(`Failed to clear earlier handoff codes: ${pruneError.message}`);
	}

	const { error } = await admin.from('auth_handoff_codes').insert({
		user_id: input.userId,
		code_hash: hashHandoffCode(code),
		next_path: input.nextPath,
		expires_at: expiresAt,
		created_ip: input.ip?.slice(0, 64) ?? null,
		user_agent: input.userAgent?.slice(0, 400) ?? null
	});
	if (error) {
		throw new Error(`Failed to store handoff code: ${error.message}`);
	}

	return { code, expiresAt };
}

/**
 * Consume a code in one UPDATE: it must exist, be unused and unexpired. The row is marked used
 * in the same statement, so two browsers racing on the same URL cannot both win.
 */
export async function consumeHandoffCode(
	admin: AdminClient,
	code: string,
	now: Date = new Date()
): Promise<{ userId: string; nextPath: string | null } | null> {
	if (!isHandoffCodeShaped(code)) return null;

	const { data, error } = await admin
		.from('auth_handoff_codes')
		.update({ consumed_at: now.toISOString() })
		.eq('code_hash', hashHandoffCode(code))
		.is('consumed_at', null)
		.gt('expires_at', now.toISOString())
		.select('user_id, next_path')
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to consume handoff code: ${error.message}`);
	}
	if (!data) return null;
	return { userId: data.user_id, nextPath: data.next_path };
}

/**
 * Sign the browser in as `userId` without ever sending a credential to the client: the admin
 * API mints a magic-link token hash for the account and the cookie client verifies it here.
 * Returns false when the account cannot be signed in (deleted, banned, missing email).
 */
export async function mintCookieSessionForUser(
	admin: AdminClient,
	userClient: UserClient,
	userId: string
): Promise<boolean> {
	const {
		data: { user },
		error: userError
	} = await admin.auth.admin.getUserById(userId);
	if (userError || !user?.email) return false;

	const { data: link, error: linkError } = await admin.auth.admin.generateLink({
		type: 'magiclink',
		email: user.email
	});
	const tokenHash = link?.properties?.hashed_token;
	if (linkError || !tokenHash) return false;

	const { error: verifyError } = await userClient.auth.verifyOtp({
		token_hash: tokenHash,
		type: 'magiclink'
	});
	return !verifyError;
}

/** The URL the app opens. `next` is already a safe same-origin path; app mode is switched on. */
export function buildHandoffUrl(origin: string, code: string): string {
	return `${origin}${HANDOFF_ROUTE}?code=${encodeURIComponent(code)}`;
}

export function withAppMode(path: string): string {
	const [beforeHash, hash] = path.split('#', 2);
	const separator = beforeHash!.includes('?') ? '&' : '?';
	return `${beforeHash}${separator}app=1${hash ? `#${hash}` : ''}`;
}
