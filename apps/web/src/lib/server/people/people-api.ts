// apps/web/src/lib/server/people/people-api.ts
//
// Shared pieces for the people-layer API routes: handle normalization (the same
// rule as public.people_layer_normalize_handle), turning the people RPCs' raised
// errors into plain responses, and resolving a findable handle to the account an
// owner is inviting. The invitee's email never leaves the server.

import { ApiResponse } from '$lib/utils/api-response';

/** Handle shape: same rule as users.username (3-24 chars, a-z 0-9, single hyphens). */
const HANDLE_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "@Sam " → "sam"; null when it can't be a handle. Mirrors people_layer_normalize_handle. */
export function normalizeHandle(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const handle = raw.trim().replace(/^@+/, '').toLowerCase();
	if (handle.length < 3 || handle.length > 24) return null;
	return HANDLE_SHAPE.test(handle) ? handle : null;
}

export type RpcError = { code?: string | null; message?: string | null } | null | undefined;

/**
 * The people RPCs raise plain sentences with a SQLSTATE: 22023 for a bad choice,
 * 42501 for "not yours to do", P0002 for "no such row". Those messages were
 * written for people, so they pass through; anything else is a generic failure.
 */
export function peopleRpcErrorResponse(error: RpcError, fallback: string): Response {
	const message = error?.message?.trim();
	switch (error?.code) {
		case '22023':
			return ApiResponse.badRequest(message || fallback);
		case '42501':
			return ApiResponse.forbidden(message || 'You can’t do that');
		case 'P0002':
			return ApiResponse.error(message || 'Not found', 404, 'NOT_FOUND');
		// The request changed after the page loaded (an upgrade grew). Reload, look again.
		case 'PT409':
			return ApiResponse.error(
				message || 'This changed. Reload and try again.',
				409,
				'CHANGED'
			);
		default:
			return ApiResponse.databaseError(error ?? { message: fallback });
	}
}

/** RPCs that return jsonb come back as an object; anything else reads as empty. */
export function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export type HandleInvitee = {
	userId: string;
	username: string;
	email: string;
	name: string | null;
};

/**
 * The account behind a findable handle, or null. "No such handle" and "not
 * findable" come back the same. Uses the admin client because the owner can't
 * read other users' rows; only the server sees the email it returns.
 */
export async function resolveHandleInvitee(
	admin: any,
	handle: string
): Promise<HandleInvitee | null> {
	const { data, error } = await admin
		.from('users')
		.select('id, username, email, name, discoverability, deletion_status, access_restricted')
		// The handle shape excludes % and _, so ilike is a case-insensitive equality here.
		.ilike('username', handle)
		.eq('discoverability', 'handle')
		.is('deletion_status', null)
		.limit(1)
		.maybeSingle();

	if (error) throw error;
	if (!data || data.access_restricted === true) return null;
	if (typeof data.email !== 'string' || !data.email.trim()) return null;
	if (typeof data.username !== 'string' || data.username.toLowerCase() !== handle) return null;

	return {
		userId: String(data.id),
		username: data.username,
		email: data.email.trim().toLowerCase(),
		name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null
	};
}

type InviteRowWithHandle = {
	invitee_email?: string | null;
	invitee_handle?: string | null;
	[key: string]: unknown;
};

/** Invites sent to a handle show the handle, never the email behind it. */
export function hideHandleInviteEmail<T extends InviteRowWithHandle>(row: T): T {
	return row.invitee_handle ? { ...row, invitee_email: null } : row;
}
