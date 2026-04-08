// apps/web/src/lib/utils/auth-profile.ts
import type { User, UserIdentity } from '@supabase/supabase-js';

const NEW_AUTH_USER_WINDOW_MS = 5_000;

function parseTimestamp(value: string | null | undefined): number | null {
	if (!value) {
		return null;
	}

	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

function timestampsWithinWindow(
	first: string | null | undefined,
	second: string | null | undefined,
	windowMs = NEW_AUTH_USER_WINDOW_MS
): boolean {
	const firstMs = parseTimestamp(first);
	const secondMs = parseTimestamp(second);
	if (firstMs == null || secondMs == null) {
		return false;
	}

	return Math.abs(firstMs - secondMs) <= windowMs;
}

function getPrimaryIdentity(user: Pick<User, 'app_metadata' | 'identities'>): UserIdentity | null {
	const provider =
		typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider : null;

	if (provider) {
		const matchingIdentity = user.identities?.find(
			(identity) => identity.provider === provider
		);
		if (matchingIdentity) {
			return matchingIdentity;
		}
	}

	return user.identities?.[0] ?? null;
}

export function getAuthUserCreatedAt(user: Pick<User, 'created_at'>): string {
	return typeof user.created_at === 'string' && user.created_at.length > 0
		? user.created_at
		: new Date().toISOString();
}

export function inferAuthUserJustCreated(
	user: Pick<User, 'app_metadata' | 'created_at' | 'identities' | 'last_sign_in_at'>
): boolean {
	if (timestampsWithinWindow(user.created_at, user.last_sign_in_at)) {
		return true;
	}

	const identity = getPrimaryIdentity(user);
	if (identity && timestampsWithinWindow(identity.created_at, identity.last_sign_in_at)) {
		return true;
	}

	return false;
}
